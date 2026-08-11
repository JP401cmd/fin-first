// lib/transactions/bulk-mutate.ts
//
// De ENIGE schrijfprimitive voor transactie-bulkbewerken (ADR 0104, besluit 5).
//
// ## Waarom `userId` een verplichte parameter is
//
// De RLS op `transactions` is asymmetrisch: SELECT is huishoud-verbreed
// (`ownership='shared' AND household_id = user_household_id()`), UPDATE en DELETE
// zijn strikt `auth.uid() = user_id`. Twee gevolgen die samen de vorm van dit
// bestand bepalen:
//
//  1. De leesronde die de kandidaten bepaalt mag NIET op RLS leunen — die is hier
//     bewust breder dan wat we mogen muteren. Zonder een expliciet
//     `.eq('user_id', …)` stromen partnerrijen binnen op een gedeelde rekening.
//  2. Een schrijfronde die door RLS nul rijen raakt geeft GÉÉN fout. Wie
//     kandidaten telt in plaats van geschreven rijen, meldt dus succes over een
//     mutatie die niet gebeurd is (R-NF4). Elk getal hier komt uit
//     `.select('id')` op de mutatie zelf.
//
// Door `userId` verplicht te maken kan een route een bulkmutatie niet FORMULEREN
// zonder de scoping. Dat is de structurele borging van AC11 — niet een
// discipline die per query onthouden moet worden. Routes bouwen zelf geen query.
//
// Nooit `getServiceClient()` (ADR 0006): dit pad draait op de sessie van de
// gebruiker, met RLS als tweede slot achter het expliciete filter.

import type { SupabaseClient } from '@supabase/supabase-js'
import { BULK_BATCH_SIZE, type BulkSkipped } from './bulk-contract'
import { transferMarkingFor } from './transfer-marking'

/** De kandidaat-vorm: precies genoeg om te kunnen skippen, markeren en koppelen. */
export interface BulkCandidateRow {
  id: string
  /** Nullable in het schema (default false) — zie de guard hieronder. */
  is_split: boolean | null
  transaction_type: string | null
  linked_transfer_id: string | null
}

const CANDIDATE_COLUMNS = 'id, is_split, transaction_type, linked_transfer_id'

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * De leesronde: welke van de aangeboden id's bestaan écht en zijn van DEZE
 * gebruiker?
 *
 * Batcht op `BULK_BATCH_SIZE`, wat hier meteen de `max_rows`-val afdekt: elke
 * batch levert hoogstens 200 rijen en kan dus niet stil op 1000 afkappen. (De
 * manifest-route heeft die luxe niet — die voert een criterium uit met een
 * onbegrensde uitkomst en pagineert daarom expliciet met een `.range()`-lus.)
 *
 * Een gefaalde batch levert géén rijen op; die id's vallen daarmee vanzelf in de
 * `not_found`-skips van de aanroeper. Dat is de eerlijke uitkomst: we weten niet
 * of ze bestaan, dus melden we ze als niet-geraakt in plaats van ze blind mee te
 * nemen in de schrijfronde.
 */
export async function readBulkCandidates(
  supabase: SupabaseClient,
  userId: string,
  ids: readonly string[],
): Promise<BulkCandidateRow[]> {
  const rows: BulkCandidateRow[] = []
  for (const batch of chunk(ids, BULK_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('transactions')
      .select(CANDIDATE_COLUMNS)
      .eq('user_id', userId)
      .in('id', batch)
    if (error) {
      console.error('[transactions:bulk-candidates] leesronde mislukt', error)
      continue
    }
    rows.push(...((data ?? []) as unknown as BulkCandidateRow[]))
  }
  return rows
}

/**
 * Eén schrijfgroep: dezelfde patch voor deze id's.
 *
 * Meerdere groepen bestaan omdat het canonieke trio verschillende rijen
 * verschillend behandelt — alleen de rijen die NÚ een verschuiving zijn krijgen
 * `transaction_type: null`, de rest houdt zijn importherkomst (AC8).
 */
export interface BulkUpdateGroup {
  ids: string[]
  patch: Record<string, unknown>
}

export interface BulkWriteResult {
  /** Herleid uit `.select('id')` op de mutatie — nooit uit het aantal kandidaten. */
  touched: number
  /** Id's uit een batch die als geheel faalde (R-NF5: de rest gaat door). */
  failedIds: string[]
}

/**
 * De schrijfronde voor een budget-/markeringswijziging.
 *
 * `excludeSplits` zet `.not('is_split', 'is', true)` op de UPDATE. Bewust NIET
 * `.eq('is_split', false)`: de kolom is nullable met default false, en `.eq`
 * dropt in PostgREST stil élke NULL-rij — dan zou een deel van de selectie
 * ongemerkt buiten de mutatie vallen en als "geraakt noch overgeslagen"
 * verdwijnen.
 */
export async function bulkUpdateTransactions(
  supabase: SupabaseClient,
  userId: string,
  groups: readonly BulkUpdateGroup[],
  options: { excludeSplits?: boolean } = {},
): Promise<BulkWriteResult> {
  let touched = 0
  const failedIds: string[] = []
  const now = new Date().toISOString()

  for (const group of groups) {
    if (group.ids.length === 0) continue
    for (const batch of chunk(group.ids, BULK_BATCH_SIZE)) {
      let query = supabase
        .from('transactions')
        .update({ ...group.patch, updated_at: now })
        .in('id', batch)
        .eq('user_id', userId)
      if (options.excludeSplits) query = query.not('is_split', 'is', true)

      const { data, error } = await query.select('id')
      if (error) {
        console.error('[transactions:bulk-update] batch mislukt', error)
        failedIds.push(...batch)
        continue
      }
      touched += (data ?? []).length
    }
  }

  return { touched, failedIds }
}

/**
 * De schrijfronde voor verwijderen. Hard delete, geen prullenbak (besluit B1).
 *
 * `transaction_splits.transaction_id` draagt `ON DELETE CASCADE`
 * (20260717120000:267-277), dus splits gaan vanzelf mee — geen applicatiewerk.
 * `transactions.linked_transfer_id` is self-referentieel met `ON DELETE SET
 * NULL`: daar ontstaat dus geen FK-wees maar een SEMANTISCHE wees, en die wordt
 * door de aanroeper afgehandeld (tegenboekingen als aparte ronde).
 */
export async function bulkDeleteTransactions(
  supabase: SupabaseClient,
  userId: string,
  ids: readonly string[],
): Promise<BulkWriteResult> {
  let touched = 0
  const failedIds: string[] = []

  for (const batch of chunk(ids, BULK_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('transactions')
      .delete()
      .in('id', batch)
      .eq('user_id', userId)
      .select('id')
    if (error) {
      console.error('[transactions:bulk-delete] batch mislukt', error)
      failedIds.push(...batch)
      continue
    }
    touched += (data ?? []).length
  }

  return { touched, failedIds }
}

export interface BudgetPlan {
  groups: BulkUpdateGroup[]
  skipped: BulkSkipped[]
}

/**
 * Puur: verdeel de aangeboden id's over skips en schrijfgroepen voor een
 * budgetwijziging.
 *
 * Drie uitkomsten per rij:
 *  - niet gevonden (bestaat niet, of is niet van deze gebruiker) → `not_found`;
 *  - split → `is_split` (de deelregels bepalen daar het budget; stil
 *    overschrijven laat `transaction_splits`-rijen achter die niet meer optellen
 *    tot de toewijzing — een tweede waarheid over dezelfde euro);
 *  - anders → een schrijfgroep, met de markering uit `transferMarkingFor`.
 *
 * De groepering ís het canonieke trio: naar Eigen rekening gaat alles in één
 * groep met `transaction_type='transfer'`; naar een gewoon budget splitst het in
 * "was een verschuiving" (markering wissen) en "was het niet" (markering niet
 * aanraken).
 */
export function planBulkBudgetUpdate(input: {
  requestedIds: readonly string[]
  candidates: readonly BulkCandidateRow[]
  budgetId: string | null
  targetsEigenRekening: boolean
}): BudgetPlan {
  const byId = new Map(input.candidates.map((row) => [row.id, row]))
  const skipped: BulkSkipped[] = []
  const groupsByKey = new Map<string, BulkUpdateGroup>()

  for (const id of input.requestedIds) {
    const row = byId.get(id)
    if (!row) {
      skipped.push({ id, reason: 'not_found' })
      continue
    }
    if (row.is_split === true) {
      skipped.push({ id, reason: 'is_split' })
      continue
    }

    const marking = transferMarkingFor({
      targetsEigenRekening: input.targetsEigenRekening,
      currentType: row.transaction_type,
    })
    const patch: Record<string, unknown> = { budget_id: input.budgetId, ...marking }

    // Sleutel op de patch-vorm zodat rijen met identieke behandeling in één
    // UPDATE-batch belanden. `undefined` bestaat niet in de patch (de helper
    // laat de sleutel wég i.p.v. hem op undefined te zetten), dus de sleutel is
    // stabiel.
    const key = JSON.stringify(patch)
    const existing = groupsByKey.get(key)
    if (existing) existing.ids.push(id)
    else groupsByKey.set(key, { ids: [id], patch })
  }

  return { groups: [...groupsByKey.values()], skipped }
}

/**
 * De tegenboekingen van handmatige overboekingen binnen de selectie die zelf
 * NIET geselecteerd zijn.
 *
 * Waarom dit meetelt bij verwijderen: één zijde weghalen laat een rij achter die
 * nog `transaction_type='transfer'` draagt en daardoor via `isRealAggRow` in
 * noch inkomsten noch uitgaven meetelt, terwijl zijn tegenhanger weg is. Geen
 * FK-wees (de FK is `ON DELETE SET NULL`) maar een semantische — en die is
 * onzichtbaar tot iemand zich afvraagt waarom de spaarquote niet klopt.
 */
export function collectLinkedCounterpartIds(
  candidates: readonly BulkCandidateRow[],
  selectedIds: readonly string[],
): string[] {
  const selected = new Set(selectedIds)
  const out = new Set<string>()
  for (const row of candidates) {
    const linked = row.linked_transfer_id
    if (linked && !selected.has(linked)) out.add(linked)
  }
  return [...out]
}

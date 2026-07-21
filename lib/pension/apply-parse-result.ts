/**
 * Zet een geparst pensioenoverzicht (UPO van mijnpensioenoverzicht.nl) om naar
 * persistente `life_events`-rijen.
 *
 * Gedeeld door de PDF- én JSON-upload in de pensioen-strategie-editor zodat upload
 * en handmatige invoer EXACT dezelfde life_events-conventie volgen als
 * `eventFromPot`/`potFromEvent` (components/future/strategie/pensioen-strategie-editor.tsx).
 *
 * - `applyPensionParseResult` doet ALLEEN de pensioenpotten (ouderdomspensioen).
 *   Alleen `type: 'ouderdomspensioen'`-regelingen worden omgezet naar potten
 *   (nabestaanden-/AO-pensioen vallen bewust buiten de FIRE-tijdas).
 *   Het canonieke pensioentype komt uit `normalizePensionType(regeling.type)`
 *   (een onbekende parse-string als 'ouderdomspensioen' → 'bedrijf' = werknemerspensioen).
 * - De AOW is BEWUST afgesplitst naar `applyAowFromParseResult`, zodat het
 *   overnemen van de AOW een EXPLICIETE gebruikerskeuze is in de editor en niet
 *   automatisch bij elke upload gebeurt.
 *
 * De Supabase-client wordt als argument doorgegeven (niet zelf geïmporteerd),
 * zodat de helpers testbaar en herbruikbaar blijven.
 *
 * ── Reconciliatie-bewuste versie ────────────────────────────────────────────
 * `applyPensionPots` werkt beslissingsgestuurd: de caller levert per pot een
 * `PensionPotApplyItem` met de gewenste `action` ('add'|'update'|'skip'). Dit
 * stelt de pensioen-strategie-editor in staat om na `reconcilePensionPots()` de
 * gebruiker een keuze voor te leggen vóór de daadwerkelijke write.
 *
 * `applyPensionParseResult` is een thin wrapper die alle potten als 'add' behandelt
 * (backward-compatible, voor de bestaande editor-flow en tests).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePensionType } from '@/lib/horizon-data'
import type { PensionParseResult } from '@/lib/pension/types'
import { normalizePensionFondsNaam } from '@/lib/pension/reconcile'
import type { PensionReconcileAction, Regeling } from '@/lib/pension/reconcile'

// ── Per-pot beslissingsitem (voor applyPensionPots) ──────────────────────────

export interface PensionPotApplyItem {
  regeling: Regeling
  action: PensionReconcileAction
  /**
   * Verplicht bij action === 'update': de `id` van het te updaten life_event.
   * Genegeerd bij 'add' en 'skip'.
   */
  matchEventId?: string | null
  /**
   * Verplicht bij action === 'update': de bestaande metadata van het event,
   * zodat merge-semantiek (behoud pensioenType/inlegBedrag/uitkeringsduur/
   * partnerUitkeringPct/source) gegarandeerd is.
   * Genegeerd bij 'add' en 'skip'.
   */
  existingMetadata?: Record<string, unknown>
}

// ── Resultaat-types ──────────────────────────────────────────────────────────

interface ApplyPensionPotsOutcome {
  updated: number
  inserted: number
  skipped: number
  error: string | null
}

interface ApplyPensionParseResultOutcome {
  insertedCount: number
  error: string | null
}

// ── applyPensionPots — beslissingsgestuurde schrijffunctie ───────────────────

/**
 * Voert een lijst van per-pot-beslissingen uit tegen de database.
 *
 * Beslissingslogica:
 *  - 'skip': niets doen.
 *  - 'add':  bouw de insert-payload (identiek aan de bestaande conventie) en
 *            voeg `metadata.mijnpensioenBron` toe voor toekomstige matching.
 *            Alle 'add'-items worden in één batch-insert verstuurd.
 *  - 'update': werk `monthly_income_change`, `target_age` en `is_indexed` bij
 *              en merge de metadata (behoud bestaande velden, werk brutoBedrag/
 *              ingangLeeftijd/isGeindexeerd/mijnpensioenBron bij).
 *              Updates verlopen sequentieel; bij de eerste DB-fout stopt de
 *              schrijflus en worden de counts-tot-dan-toe teruggegeven.
 *
 * Veiligheidsinvariant: alle writes zijn .eq('user_id', userId)-gescoped
 * (anon RLS + expliciete user_id in payload — geen service-role nodig).
 */
export async function applyPensionPots({
  supabase,
  userId,
  items,
  existingPensionCount,
}: {
  supabase: SupabaseClient
  userId: string
  items: PensionPotApplyItem[]
  existingPensionCount: number
}): Promise<ApplyPensionPotsOutcome> {
  let updated = 0
  let inserted = 0
  let skipped = 0
  let error: string | null = null

  // ── 1. Verwerk 'skip' ────────────────────────────────────────────────────
  for (const item of items) {
    if (item.action === 'skip') skipped++
  }

  // ── 2. Batch-insert alle 'add'-items ────────────────────────────────────
  const addItems = items.filter((item) => item.action === 'add')
  if (addItems.length > 0) {
    const inserts = addItems.map((item, addIndex) => {
      const regeling = item.regeling
      const canonicalType = normalizePensionType(regeling.type)
      const payload = {
        user_id: userId,
        name: regeling.fondsNaam || 'Aanvullend pensioen',
        event_type: 'pension',
        target_age: regeling.ingangLeeftijd,
        target_date: null,
        one_time_cost: 0,
        monthly_cost_change: 0,
        monthly_income_change: regeling.brutoBedrag,
        // Ouderdomspensioen = levenslang (consistent met de bedrijf-default in de editor).
        duration_months: 0,
        icon: canonicalType === 'bedrijf' ? 'Landmark' : 'PiggyBank',
        is_active: true,
        is_indexed: regeling.isGeindexeerd,
        sort_order: existingPensionCount + addIndex + 1,
        metadata: {
          pensioenType: canonicalType,
          ingangLeeftijd: regeling.ingangLeeftijd,
          brutoBedrag: regeling.brutoBedrag,
          inlegBedrag: 0,
          uitkeringsduur: 'levenslang',
          isGeindexeerd: regeling.isGeindexeerd,
          partnerUitkeringPct: 70,
          source: 'upo_upload',
          // Sla de genormaliseerde naam op voor toekomstige PRIMARY-matching.
          mijnpensioenBron: normalizePensionFondsNaam(regeling.fondsNaam ?? ''),
        },
      }
      return payload
    })

    const { error: insertError } = await supabase.from('life_events').insert(inserts)
    if (insertError) {
      return { updated, inserted, skipped, error: insertError.message }
    }
    inserted = inserts.length
  }

  // ── 3. Sequentiële 'update'-items ───────────────────────────────────────
  // Updates verlopen sequentieel: bij de eerste DB-fout stopt de lus en worden
  // de counts-tot-dan-toe teruggegeven samen met het foutbericht.
  const updateItems = items.filter((item) => item.action === 'update')
  for (const item of updateItems) {
    const { matchEventId, existingMetadata, regeling } = item
    if (!matchEventId) {
      // Defensief: geen matchEventId bij 'update' — behandel als skip.
      skipped++
      continue
    }

    const mergedMetadata: Record<string, unknown> = {
      ...(existingMetadata ?? {}),
      brutoBedrag: regeling.brutoBedrag,
      ingangLeeftijd: regeling.ingangLeeftijd,
      isGeindexeerd: regeling.isGeindexeerd,
      mijnpensioenBron: normalizePensionFondsNaam(regeling.fondsNaam ?? ''),
      // pensioenType, inlegBedrag, uitkeringsduur, partnerUitkeringPct, source
      // worden NIET overschreven — ze zitten in existingMetadata en de spread
      // hierboven behoudt ze. Alleen de vier velden hierboven worden geüpdated.
    }

    const { error: updateError } = await supabase
      .from('life_events')
      .update({
        monthly_income_change: regeling.brutoBedrag,
        target_age: regeling.ingangLeeftijd,
        is_indexed: regeling.isGeindexeerd,
        metadata: mergedMetadata,
      })
      .eq('user_id', userId)
      .eq('id', matchEventId)

    if (updateError) {
      error = updateError.message
      // Stop verdere writes; geef counts-tot-nu terug.
      return { updated, inserted, skipped, error }
    }
    updated++
  }

  return { updated, inserted, skipped, error }
}

// ── applyPensionParseResult — backward-compatible thin wrapper ───────────────

interface ApplyPensionParseResultArgs {
  supabase: SupabaseClient
  userId: string
  parseResult: PensionParseResult
  /** Aantal bestaande pensioenpotten — bepaalt de start van sort_order. */
  existingPensionCount: number
}

/**
 * Backward-compatibele wrapper die ALLE ouderdomspensioen-regelingen als 'add'
 * behandelt (geen dedup). Bestaand gedrag van vóór de reconciliatie-functie.
 *
 * Callers die dedup willen, gebruiken `reconcilePensionPots` + `applyPensionPots`.
 */
export async function applyPensionParseResult({
  supabase,
  userId,
  parseResult,
  existingPensionCount,
}: ApplyPensionParseResultArgs): Promise<ApplyPensionParseResultOutcome> {
  const ouderdomsregelingen = parseResult.regelingen.filter(
    (r) => r.type === 'ouderdomspensioen',
  )

  if (ouderdomsregelingen.length === 0) {
    return { insertedCount: 0, error: null }
  }

  // Bouw alle-'add' items — spiegelt het oorspronkelijke blind-bulk-insert gedrag.
  const items: PensionPotApplyItem[] = ouderdomsregelingen.map((regeling) => ({
    regeling,
    action: 'add' as const,
    matchEventId: null,
  }))

  const outcome = await applyPensionPots({ supabase, userId, items, existingPensionCount })

  return {
    insertedCount: outcome.inserted,
    error: outcome.error,
  }
}

// ── AOW — expliciete overname (gebruikerskeuze) ──────────────────────────────

interface ApplyAowFromParseResultArgs {
  supabase: SupabaseClient
  userId: string
  parseResult: PensionParseResult
}

interface ApplyAowFromParseResultOutcome {
  /** 'updated' = bestaand event bijgewerkt · 'created' = nieuw event · 'none' = niets gedaan. */
  aowApplied: 'created' | 'updated' | 'none'
  error: string | null
}

/**
 * Past de AOW uit een geparst overzicht toe — ALLEEN op expliciet verzoek van de
 * gebruiker (de editor roept dit aan na een bevestiging, niet automatisch).
 *
 * - Bestaat er al een `event_type:'aow'`-rij → werk `monthly_income_change` bij
 *   naar `aowBedrag` (+ `metadata.leefsituatie` als `aowLeefsituatie` meegegeven is;
 *   de bestaande `jarenBuitenNL` blijft behouden) → 'updated'.
 * - Geen AOW-rij én `aowLeeftijd` bekend → maak er één aan volgens de
 *   AOW-event-conventie (zie aow-strategie-editor.tsx) → 'created'.
 * - Anders (geen bedrag, of geen rij én geen leeftijd) → 'none'.
 */
export async function applyAowFromParseResult({
  supabase,
  userId,
  parseResult,
}: ApplyAowFromParseResultArgs): Promise<ApplyAowFromParseResultOutcome> {
  const { aowBedrag, aowLeeftijd, aowLeefsituatie } = parseResult
  if (!aowBedrag || aowBedrag <= 0) {
    return { aowApplied: 'none', error: null }
  }

  const { data: aowEvent, error: aowFetchError } = await supabase
    .from('life_events')
    .select('id, metadata')
    .eq('user_id', userId)
    .eq('event_type', 'aow')
    .maybeSingle()

  if (aowFetchError) {
    return { aowApplied: 'none', error: `AOW ophalen mislukt: ${aowFetchError.message}` }
  }

  if (aowEvent?.id) {
    // Bestaand event: alleen het maandbedrag (+ evt. leefsituatie) bijwerken,
    // de bestaande jarenBuitenNL behouden.
    const existingMeta = (aowEvent.metadata ?? {}) as Record<string, unknown>
    const metadata: Record<string, unknown> = { ...existingMeta }
    if (aowLeefsituatie !== undefined) metadata.leefsituatie = aowLeefsituatie

    const { error: aowUpdateError } = await supabase
      .from('life_events')
      .update({ monthly_income_change: aowBedrag, metadata })
      .eq('user_id', userId)
      .eq('id', aowEvent.id)

    if (aowUpdateError) {
      return { aowApplied: 'none', error: `AOW bijwerken mislukt: ${aowUpdateError.message}` }
    }
    return { aowApplied: 'updated', error: null }
  }

  // Geen bestaand event: alleen aanmaken als we een leeftijd hebben (PDF-pad heeft
  // die niet → dan bewust geen aanmaak, consistent met de scope-afspraak).
  if (aowLeeftijd === undefined) {
    return { aowApplied: 'none', error: null }
  }

  const { error: aowInsertError } = await supabase.from('life_events').insert({
    user_id: userId,
    name: 'AOW',
    event_type: 'aow',
    target_age: aowLeeftijd,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: aowBedrag,
    duration_months: 0,
    icon: 'Landmark',
    is_active: true,
    sort_order: 0,
    is_indexed: true,
    metadata: { leefsituatie: aowLeefsituatie ?? 'alleenstaand', jarenBuitenNL: 0 },
  })

  if (aowInsertError) {
    return { aowApplied: 'none', error: `AOW aanmaken mislukt: ${aowInsertError.message}` }
  }
  return { aowApplied: 'created', error: null }
}

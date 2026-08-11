import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { unauthorized, badRequest, serverError } from '@/lib/api/respond'
import { SelectionManifestRequestSchema } from '@/lib/transactions/bulk-schemas'
import {
  applyTransactionSearchCriteria,
  loadBankLinkedAccountIds,
  readManifestRowsByIds,
  MANIFEST_ROW_COLUMNS,
  type ManifestRow,
} from '@/lib/transactions/search-query'
import { readBulkCandidates } from '@/lib/transactions/bulk-mutate'
import {
  MANIFEST_PAGE_SIZE,
  SELECTION_MAX,
  type SelectionManifest,
} from '@/lib/transactions/bulk-contract'

/**
 * `POST /api/transactions/search/manifest` — "voer het criterium ÉÉN keer uit"
 * (ADR 0104, besluit 1).
 *
 * Dit is het hart van de functionaliteit. Het antwoord bevat de bevroren
 * id-lijst én alles wat de bevestiging moet kunnen stellen (aantal, sommen,
 * splits, tegenboekingen, bankgekoppelde rijen) — allemaal uit DEZELFDE
 * uitvoering. De mutatieroutes accepteren daarna uitsluitend id's en voeren
 * nooit meer een filter uit. Zonder dat zijn "wat de gebruiker bevestigde" en
 * "wat er geraakt is" twee losse uitvoeringen van hetzelfde filter, en is elk
 * verschil daartussen pas ná de mutatie zichtbaar — bij een hard delete zonder
 * prullenbak onherstelbaar.
 *
 * ## Twee ingangen, één antwoord
 *
 * De body draagt óf een criterium ("selecteer alle N") óf een expliciete
 * id-lijst (aangevinkte rijen). Beide leveren hetzelfde manifest. Een expliciete
 * selectie is voor de id's al bevroren, maar niet voor de AFGELEIDEN die de
 * bevestiging moet stellen — splits, bankgekoppelde rijen en vooral de
 * tegenboekingen die standaard meeverdwijnen. Alleen deze route lost die op.
 * Zou de overlay ze voor een expliciete selectie moeten raden, dan noemt de
 * knoptekst een ander getal dan wat er verdwijnt: bij een hard delete zonder
 * prullenbak precies het gat dat ADR 0104 dichttimmert.
 *
 * ## Twee dingen die hier niet fout mogen gaan
 *
 *  1. **Stille afkap.** PostgREST kapt elk antwoord af op `max_rows` (1000),
 *     óók bij een hogere `.limit()`. Een niet-gepagineerd "alles" is dus per
 *     definitie een halve waarheid. Vandaar de expliciete `.range()`-lus, naar
 *     het model van `lib/own-accounts-reclassify.ts:54-73` — en een expliciete
 *     vergelijking van het aantal verzamelde id's met de teller ná afloop, want
 *     een `max_rows` onder `MANIFEST_PAGE_SIZE` zou de lus laten breken zonder
 *     dat iemand het merkt (R-NF2: een afkap die tóch optreedt wordt gemeld).
 *  2. **Onbegrensde blast radius.** Boven `SELECTION_MAX` weigert deze route met
 *     een 400 (`selection_too_large`) in plaats van af te kappen (R-NF2). Die
 *     grens is de bodem onder de schade die één filterfout kan aanrichten.
 */

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)
    if (!claims?.sub) return unauthorized()
    const userId = claims.sub as string

    const parsed = await parseBody(SelectionManifestRequestSchema, request)
    if (!parsed.ok) return parsed.response
    const { ids: explicitIds, ...criteria } = parsed.data

    const startedAt = Date.now()
    const rows: ManifestRow[] = []
    /** Hoeveel treffers er zijn. Bij een expliciete selectie: wat de client aanbood. */
    let total: number | null = null

    if (explicitIds) {
      // Id-tak: geen filter, alleen own-row ophalen wát er is aangevinkt. Rijen
      // die intussen verdwenen zijn vallen hier weg — dat is de eerlijke uitkomst
      // en géén afkap: het manifest telt dan minder, en de bevestiging noemt dat
      // kleinere getal.
      rows.push(...(await readManifestRowsByIds(supabase, userId, explicitIds)))
      total = rows.length
    } else {
      for (let from = 0; ; from += MANIFEST_PAGE_SIZE) {
        const base = supabase
          .from('transactions')
          // De teller hoeft maar één keer; `count: 'exact'` op elke pagina is een
          // volledige scan per ronde en die betaal je nergens voor terug.
          .select(MANIFEST_ROW_COLUMNS, from === 0 ? { count: 'exact' } : undefined)
        const { data, count, error } = await applyTransactionSearchCriteria(base, criteria, userId)
          .order('date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + MANIFEST_PAGE_SIZE - 1)

        if (error) return serverError(error, 'transactions-manifest:POST')

        if (from === 0) {
          total = count ?? 0
          if (total > SELECTION_MAX) {
            // Weigeren, niet afkappen. Een stil afgekapte selectie ziet er voor de
            // gebruiker exact zo uit als een volledige.
            return badRequest(
              `Deze selectie bevat ${total} transacties; hoogstens ${SELECTION_MAX} tegelijk. Verfijn het filter.`,
              'selection_too_large',
            )
          }
        }

        const page = (data ?? []) as unknown as ManifestRow[]
        rows.push(...page)
        if (page.length < MANIFEST_PAGE_SIZE) break
        if (total !== null && rows.length >= total) break
      }
    }

    const ids = rows.map((r) => r.id)

    // De afkap-detectie (R-NF2). Kan alleen afgaan wanneer PostgREST's `max_rows`
    // onder `MANIFEST_PAGE_SIZE` ligt: de lus breekt dan op een "korte" pagina die
    // in werkelijkheid een afgekapte is. De richting is veilig — te weinig, nooit
    // te veel — maar de gebruiker vroeg om "alle N" en krijgt er minder, dus dat
    // wordt gemeld in plaats van verzwegen.
    const truncated = total !== null && ids.length < total
    if (truncated) {
      console.error(
        `[transactions:manifest] AFKAP — ${ids.length} van ${total} id's bevroren; PostgREST max_rows ligt vermoedelijk onder ${MANIFEST_PAGE_SIZE}`,
      )
    }
    const selected = new Set(ids)

    let sumPositief = 0
    let sumNegatief = 0
    const splitIds: string[] = []
    const counterpartCandidates = new Set<string>()

    const bankLinked = await loadBankLinkedAccountIds(supabase, userId)
    let bankLinkedCount = 0

    for (const row of rows) {
      const amount = Number(row.amount)
      if (Number.isFinite(amount)) {
        if (amount > 0) sumPositief += amount
        else sumNegatief += amount
      }
      if (row.is_split === true) splitIds.push(row.id)
      if (row.account_id && bankLinked.has(row.account_id)) bankLinkedCount += 1
      if (row.linked_transfer_id && !selected.has(row.linked_transfer_id)) {
        counterpartCandidates.add(row.linked_transfer_id)
      }
    }

    // De tegenboekingen worden nog één keer OWN-ROW geverifieerd: een
    // `linked_transfer_id` kan naar een rij wijzen die intussen weg is, en bij
    // een gezamenlijke overboeking naar een rij van de partner — die zou de
    // gebruiker in de bevestiging geteld zien terwijl de mutatie hem nooit raakt.
    const resolved = await readBulkCandidates(supabase, userId, [...counterpartCandidates])

    const manifest: SelectionManifest = {
      ids,
      count: ids.length,
      sumPositief: Math.round(sumPositief * 100) / 100,
      sumNegatief: Math.round(sumNegatief * 100) / 100,
      splitIds,
      linkedCounterpartIds: resolved.map((r) => r.id),
      bankLinkedCount,
      truncated,
    }

    console.log(
      `[transactions:manifest] ${Date.now() - startedAt}ms modus=${explicitIds ? 'ids' : 'criterium'} count=${manifest.count} splits=${splitIds.length} tegenboekingen=${manifest.linkedCounterpartIds.length}`,
    )

    return NextResponse.json(manifest)
  } catch (err) {
    return serverError(err, 'transactions-manifest:POST')
  }
}

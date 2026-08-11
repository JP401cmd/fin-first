// lib/budget-realized.ts
//
// GEREALISEERDE BEDRAGEN PER BUDGET (ADR 0103, correctie 11 aug 2026)
// ───────────────────────────────────────────────────────────────────────────
// De budgetgrondslag levert niet de GEPLANDE limiet maar het GEREALISEERDE
// bedrag per budget over de afgelopen 12 maanden. Deze module haalt die
// realisatie op; `computeBudgetBasis` (lib/budget-basis.ts) blijft puur en krijgt
// het resultaat als parameter.
//
// BRON: `public.tx_month_aggregate` — géén eigen tel-lus over transactierijen.
// CLAUDE.md is daar expliciet over: een maandaggregaat kan niet stil op
// `max_rows` afkappen, een rij-loop wel. De functie is SECURITY INVOKER, dus RLS
// bepaalt de scope: exact dezelfde rijen als de loaders zien.
//
// TWEE AANROEPPADEN, ÉÉN IMPLEMENTATIE (migratie 20260811180000, ADR 0103):
// `fetchRealizedBudgetAmounts` is de kern; `getRealizedBudgetAmounts` is die kern
// met `cache()` eromheen voor het sessie-pad. De snapshot-cron draait service-role
// (RLS vervalt) en geeft daarom een expliciete `scope` mee, die in SQL een puur
// restrictief AND-filter is dat de SELECT-policy naspeelt. Zo staan alle drie de
// schrijvers naar `net_worth_snapshots` op dezelfde grondslag — het gat dat de
// tijdreeks anders permanent twee grondslagen liet dragen.
//
// CHUNKING: de per-budget-uitsplitsing voegt een rij-DIMENSIE toe (maand ×
// budget × type in plaats van maand × type). Met enkele tientallen budgetten en
// een paar transactietypes loopt 12 maanden tegen de 1000-rijen-cap; drie
// chunks van vier maanden houden dat structureel op ruwweg een kwart daarvan.
// Meer calls, maar ze draaien parallel — en een stil te laag getal is duurder
// dan een extra RPC. Zelfde afweging en dezelfde constante als
// `AGGREGATE_CHUNK_MONTHS_WITH_BUDGET_SPLIT` in lib/spend-limits/loader.ts.
//
// PRESTATIE: `getRealizedBudgetAmounts` is `cache()`-gewrapt op de
// supabase-client. De budgetgrondslag wordt door DERTIEN oppervlakken via
// `loadBudgetBasis` aangeroepen; zonder die wrap zou dat 39 RPC-calls per render
// zijn. Met de wrap zijn het er drie, één keer per request — hetzelfde patroon en
// dezelfde reden als `getTxAgg12m`.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'
import {
  fetchTxMonthAggregate,
  isRealAggRow,
  type TxAggregateScope,
  type TxMonthAggregateRow,
} from '@/lib/server-data/tx-aggregates'
import { isUuid } from '@/lib/unlinked-cash'

/** Breedte van het meetvenster in maanden (rollend, incl. de huidige maand). */
export const REALIZED_WINDOW_MONTHS = 12

/**
 * Maanden per RPC-call. Zie de kop: de per-budget-dimensie maakt 12 maanden
 * cap-gevoelig. 4 × 3 chunks dekt het venster.
 */
export const REALIZED_CHUNK_MONTHS = 4

/**
 * De PostgREST `max_rows`-cap (supabase/config.toml). Komt een chunk met exact
 * dit aantal rijen terug, dan is afkapping niet uit te sluiten — een KANARIE,
 * geen bewijs. We geven 'm door als vlag; nooit als fout.
 */
export const POSTGREST_MAX_ROWS = 1000

/** De realisatie van één budget over het venster. */
export interface BudgetRealizedEntry {
  /** Σ positieve bedragen (transfer-gefilterd) — voedt een INKOMSTEN-budget. */
  incoming: number
  /** Σ |negatieve bedragen| (transfer-gefilterd) — voedt een UITGAVEN-budget. */
  outgoing: number
  /**
   * De spanwijdte van de BOEKINGEN binnen het venster: van de eerste maand mét
   * data tot het einde van het venster, geklemd op [1, windowMonths].
   *
   * LET OP — dit is NIET de deler. Die komt uit de leeftijd van het budget
   * (`created_at`); zie de motivering bij `resolveDenominatorMonths` in
   * lib/budget-basis.ts. Deze waarde dient daar alleen nog als ONDERGRENS voor
   * het geval er boekingen ouder zijn dan `created_at` (import, merge).
   *
   * Waarom dit veld niet als deler kan: een JAARpost die in de lopende maand
   * betaald is heeft spanwijdte 1, en dan zou (bedrag / 1) × 12 de jaarrekening
   * VERTWAALFVOUDIGEN. Precies de over-extrapolatie-fout-klasse die ADR 0050
   * voor het inkomen opruimde.
   */
  coveredMonths: number
}

export interface BudgetRealizedWindow {
  /** Breedte van het meetvenster (12), voor de UI-uitleg. */
  windowMonths: number
  /** Laatste maand van het venster als 'YYYY-MM' — anker voor de leeftijdsdeler. */
  windowEndMonth: string
  /** Kanarie: een chunk kwam op exact `POSTGREST_MAX_ROWS` rijen terug. */
  truncationSuspected: boolean
  /** budget_id → realisatie. Plain object (serialiseerbaar naar de client). */
  byBudgetId: Record<string, BudgetRealizedEntry>
}

export const EMPTY_REALIZED_WINDOW: BudgetRealizedWindow = {
  windowMonths: REALIZED_WINDOW_MONTHS,
  windowEndMonth: '',
  truncationSuspected: false,
  byBudgetId: {},
}

/** Maandsleutels 'YYYY-MM' van oud → nieuw, voor de spanwijdte-berekening. */
function windowMonthKeys(now: Date): string[] {
  const keys: string[] = []
  for (let i = REALIZED_WINDOW_MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - i, 1))
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

/**
 * Reduceer aggregaat-rijen tot realisatie per budget.
 *
 * TRANSFER-FILTER: `isRealAggRow` — dezelfde regel die de inkomsten-/uitgaven-
 * sommen van dashboard, horizon en core gebruiken (`realOnly: true`). Interne
 * overboekingen zijn geen inkomen en geen uitgave; ze zouden een gedeelde
 * spaarrekening als inkomstenbudget laten oplichten.
 *
 * Rijen zonder `budget_id` vallen weg: zonder budget is er geen post om ze aan
 * toe te rekenen.
 */
export function reduceRealizedByBudget(
  rows: readonly TxMonthAggregateRow[],
  monthKeys: readonly string[],
): Record<string, BudgetRealizedEntry> {
  const monthIndex = new Map(monthKeys.map((k, i) => [k, i]))
  const firstIdx = new Map<string, number>()
  const out: Record<string, BudgetRealizedEntry> = {}

  for (const row of rows) {
    if (!row.budget_id) continue
    if (!isRealAggRow(row)) continue
    const idx = monthIndex.get(row.month)
    if (idx === undefined) continue

    const pos = Number(row.sum_positief) || 0
    const neg = Math.abs(Number(row.sum_negatief) || 0)
    if (pos === 0 && neg === 0) continue

    const entry = (out[row.budget_id] ??= { incoming: 0, outgoing: 0, coveredMonths: 0 })
    entry.incoming += pos
    entry.outgoing += neg

    const prev = firstIdx.get(row.budget_id)
    if (prev === undefined || idx < prev) firstIdx.set(row.budget_id, idx)
  }

  for (const [budgetId, idx] of firstIdx) {
    // Spanwijdte vanaf de eerste maand mét data tot het einde van het venster.
    out[budgetId].coveredMonths = Math.max(1, Math.min(monthKeys.length, monthKeys.length - idx))
  }
  return out
}

/**
 * De chunk-grenzen van het rollende venster: drie blokken van vier maanden, oud
 * naar nieuw, met de bovengrens van het laatste blok op hetzelfde punt als
 * `getTxAgg12m`. Apart benoemd zodat het gescoopte en het RLS-pad aantoonbaar
 * dezelfde vensters bevragen.
 */
function realizedChunks(now: Date): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = []
  for (let offset = REALIZED_WINDOW_MONTHS; offset > 0; offset -= REALIZED_CHUNK_MONTHS) {
    const size = Math.min(REALIZED_CHUNK_MONTHS, offset)
    chunks.push({
      from: localMonthStartMonthsAgo(now, offset - 1),
      to:
        offset - size === 0
          ? localMonthBounds(now).end
          : localMonthStartMonthsAgo(now, offset - size - 1),
    })
  }
  return chunks
}

/**
 * De gerealiseerde bedragen per budget over het rollende 12-maands venster —
 * de ONGECACHETE kern.
 *
 * Twee aanroeppaden, één implementatie:
 *
 *   • ZONDER `scope` — de sessie: `supabase` is de authenticated/anon RLS-client
 *     en de RLS van `transactions` bepaalt de scope. Gebruik in dat geval
 *     {@link getRealizedBudgetAmounts}, die hier de `cache()` omheen legt.
 *   • MÉT `scope` — de snapshot-cron: `supabase` is de service-role-client, waar
 *     `auth.uid()` NULL is en de RLS-scope vervalt. De scope is daar de ENIGE
 *     afbakening en gaat als puur restrictief AND-filter naar de RPC (migratie
 *     20260811180000). Hij spiegelt de SELECT-policy, dus het resultaat is
 *     dezelfde verzameling die een sessie-client van die gebruiker zou zien —
 *     inclusief de gedeelde boekingen van de partner, want die tellen ook op het
 *     dashboard mee.
 *
 * DE SCOPE HOORT BEWUST NIET IN DE `cache()`-VARIANT. React `cache()` keyt hier
 * op de identiteit van de supabase-client, en de cron deelt ÉÉN service-client
 * over alle gebruikers. Een gescoopte aanroep via de cache zou de tweede
 * gebruiker de realisatie van de eerste geven — een cross-user-lek dat nergens
 * zichtbaar zou zijn. De splitsing maakt dat structureel onmogelijk in plaats van
 * afhankelijk van een waarschuwing in commentaar.
 *
 * FAIL-CLOSED: een `scope` met een niet-uuid-vormig user-id levert het LEGE
 * venster (alles terug op de geplande limiet). Liever geen realisatie dan een
 * aanroep waarvan de afbakening niet vaststaat.
 *
 * Faalt een chunk, dan valt de HELE ronde terug op het lege venster (zie
 * hieronder); de truncatie-kanarie blijft dan uit, want een leesfout is iets
 * anders dan een afkapping.
 */
export async function fetchRealizedBudgetAmounts(
  supabase: SupabaseClient,
  scope?: TxAggregateScope | null,
): Promise<BudgetRealizedWindow> {
  const now = new Date()
  const monthKeys = windowMonthKeys(now)
  const windowEndMonth = monthKeys[monthKeys.length - 1]

  if (scope && !isUuid(scope.userId)) {
    console.error('[budget-realized] scope zonder geldig user-id — terugval op de planning')
    return { ...EMPTY_REALIZED_WINDOW, windowEndMonth }
  }

  const chunks = realizedChunks(now)

  // Elke chunk vangt zijn EIGEN fout. Zonder deze guard zou één afgewezen RPC
  // de hele `Promise.all` laten rejecten en daarmee de aanroepende loader —
  // een netwerkfout op een grondslag-detail mag nooit een dashboard, een
  // rapport of een snapshot-schrijfronde omvertrekken. De grondslag valt dan
  // terug op de geplande limieten, wat een geldig (zij het minder precies)
  // antwoord is.
  const results = await Promise.all(
    chunks.map((c) =>
      fetchTxMonthAggregate(supabase, { from: c.from, to: c.to, scope }).then(
        (r) => r,
        (error) => {
          console.error('[budget-realized] aggregaat-chunk mislukt:', error)
          return { data: null, error }
        },
      ),
    ),
  )

  const rows: TxMonthAggregateRow[] = []
  let truncationSuspected = false
  let anyChunkFailed = false
  for (const r of results) {
    if (r.error || !r.data) {
      anyChunkFailed = true
      continue
    }
    if (r.data.length >= POSTGREST_MAX_ROWS) truncationSuspected = true
    rows.push(...r.data)
  }

  // EEN GEDEELTELIJKE RONDE IS GEEN GELDIGE RONDE.
  // Bij een gefaalde chunk ontbreken de sommen van vier maanden, terwijl de
  // deler (de leeftijd van het budget) gewoon 12 blijft — dat levert een
  // structureel TE LAGE realisatie op, en voor uitgaven is te laag optimistisch
  // (te vroege FIRE-datum). Erger nog: de post blijft `source: 'realized'`
  // heten, dus niets aan het getal verraadt dat er data mist. Daarom valt de
  // hele ronde terug op het lege venster: elke post gaat zichtbaar op
  // `'planned'`, en dat is een toestand die de UI wél benoemt.
  if (anyChunkFailed) {
    return { ...EMPTY_REALIZED_WINDOW, windowEndMonth }
  }

  return {
    windowMonths: REALIZED_WINDOW_MONTHS,
    windowEndMonth,
    truncationSuspected,
    byBudgetId: reduceRealizedByBudget(rows, monthKeys),
  }
}

/**
 * De gerealiseerde bedragen per budget over het rollende 12-maands venster, voor
 * het SESSIE-pad.
 *
 * `cache()` op de supabase-client (nooit op een vers `{from,to}`-object — dat
 * zou een stille no-op zijn, zie de toelichting bij `getTxAgg12m`): binnen één
 * RSC-render delen alle zeven grondslag-aanroepers dezelfde drie RPC's.
 *
 * MOET met de authenticated/anon RLS-client worden aangeroepen, NOOIT met
 * `getServiceClient()`: `tx_month_aggregate` is SECURITY INVOKER, dus onder
 * service-role vervalt de RLS-scope en zou de functie de transacties van ÁLLE
 * gebruikers aggregeren. Het service-role-pad gebruikt daarom
 * {@link fetchRealizedBudgetAmounts} mét een expliciete scope — en bewust NIET
 * deze cache, die over gebruikers heen zou hergebruiken.
 */
export const getRealizedBudgetAmounts = cache(
  async (supabase: SupabaseClient): Promise<BudgetRealizedWindow> =>
    fetchRealizedBudgetAmounts(supabase),
)

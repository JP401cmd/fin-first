// lib/budget-realized.ts
//
// GEREALISEERDE BEDRAGEN PER BUDGET (ADR 0103, correctie 11 aug 2026;
// historiebasis ADR 0138, 11 sep 2026)
// ───────────────────────────────────────────────────────────────────────────
// De budgetgrondslag levert niet de GEPLANDE limiet maar het GEREALISEERDE
// bedrag per budget over de afgelopen twaalf AFGESLOTEN maanden. Deze module
// haalt die realisatie op; `computeBudgetBasis` (lib/budget-basis.ts) blijft
// puur en krijgt het resultaat als parameter.
//
// HET VENSTER EN DE DELER komen uit lib/history-basis.ts (ADR 0138): de
// lopende maand valt er per definitie buiten, en het venster draagt ÉÉN
// `historyMonths` — het aantal afgesloten maanden met transactiehistorie,
// geklemd op 1..12 — als de deler voor ÁLLE budgetten én voor het
// transactie-jaarinkomen (`transactionAnnualIncome`). Zo komen teller en noemer
// van élk maandgemiddelde uit hetzelfde venster.
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
import { HISTORY_WINDOW_MONTHS } from '@/lib/constants'
import {
  annualizeHistorySum,
  historyMonthKeys,
  historyMonthsFromRows,
} from '@/lib/history-basis'
import { localMonthStartMonthsAgo } from '@/lib/month-range'
import {
  fetchTxMonthAggregate,
  isRealAggRow,
  type TxAggregateScope,
  type TxMonthAggregateRow,
} from '@/lib/server-data/tx-aggregates'
import { isUuid } from '@/lib/unlinked-cash'

/**
 * Breedte van het meetvenster in AFGESLOTEN maanden (de lopende maand valt er
 * buiten). Alias van `HISTORY_WINDOW_MONTHS` (lib/constants.ts) — de naam blijft
 * bestaan voor de bestaande importeurs.
 */
export const REALIZED_WINDOW_MONTHS = HISTORY_WINDOW_MONTHS

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
}

/**
 * Σ positieve bedragen over het HELE venster, ongeacht budget — de
 * transactiekant van het jaarinkomen (ADR 0138). Twee smaken, omdat de app
 * twee grondslagen kent: `real` is transfer-gefilterd (`realOnly: true`, de
 * spaarquote-/Box 1-/dashboard-grondslag), `all` telt (joint_)transfers mee —
 * de bewust transfer-INCLUSIEVE FIRE-projectiesom van de horizon-loader.
 */
export interface WindowIncome {
  real: number
  all: number
}

/** Transfer-gefilterde in- en uitstroom van één maand in het venster. */
export interface WindowMonthFlow {
  /** Σ positieve bedragen (= de rij van de inkomen-kassabon). */
  income: number
  /** Σ |negatieve bedragen|. */
  expenses: number
}

export interface BudgetRealizedWindow {
  /** Breedte van het meetvenster (12 afgesloten maanden), voor de UI-uitleg. */
  windowMonths: number
  /** Laatste maand van het venster als 'YYYY-MM' — de vorige kalendermaand. */
  windowEndMonth: string
  /**
   * DE DELER (ADR 0138): afgesloten maanden met transactiehistorie in het
   * venster, 1..12, voor álle budgetten én het transactie-jaarinkomen. Zie
   * `historyMonthsFromRows` in lib/history-basis.ts.
   */
  historyMonths: number
  /** Σ positieve bedragen over het venster, ongeacht budget. */
  windowIncome: WindowIncome
  /**
   * Per maand in het venster ('YYYY-MM' → in/uit), transfer-gefilterd, ongeacht
   * budget — alleen maanden mét een boeking. INVARIANT: Σ income over deze map
   * = `windowIncome.real`. Voedt de inkomen-kassabon op de cash-pagina
   * (rijen, subtotaal én deler uit hetzelfde venster als het jaarinkomen —
   * review golf 2, R1) en `CorePageData.monthlyIncomeExpenseSeries`.
   */
  byMonth: Record<string, WindowMonthFlow>
  /** Kanarie: een chunk kwam op exact `POSTGREST_MAX_ROWS` rijen terug. */
  truncationSuspected: boolean
  /** budget_id → realisatie. Plain object (serialiseerbaar naar de client). */
  byBudgetId: Record<string, BudgetRealizedEntry>
}

export const EMPTY_REALIZED_WINDOW: BudgetRealizedWindow = {
  windowMonths: REALIZED_WINDOW_MONTHS,
  windowEndMonth: '',
  historyMonths: REALIZED_WINDOW_MONTHS,
  windowIncome: { real: 0, all: 0 },
  byMonth: {},
  truncationSuspected: false,
  byBudgetId: {},
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
 * toe te rekenen. Rijen buiten `monthKeys` tellen niet mee.
 */
export function reduceRealizedByBudget(
  rows: readonly TxMonthAggregateRow[],
  monthKeys: readonly string[],
): Record<string, BudgetRealizedEntry> {
  const inWindow = new Set(monthKeys)
  const out: Record<string, BudgetRealizedEntry> = {}

  for (const row of rows) {
    if (!row.budget_id) continue
    if (!isRealAggRow(row)) continue
    if (!inWindow.has(row.month)) continue

    const pos = Number(row.sum_positief) || 0
    const neg = Math.abs(Number(row.sum_negatief) || 0)
    if (pos === 0 && neg === 0) continue

    const entry = (out[row.budget_id] ??= { incoming: 0, outgoing: 0 })
    entry.incoming += pos
    entry.outgoing += neg
  }
  return out
}

/**
 * Σ positieve bedragen over het venster, ongeacht budget — in beide smaken
 * (zie `WindowIncome`). Rijen buiten `monthKeys` tellen niet mee.
 */
export function reduceWindowIncome(
  rows: readonly TxMonthAggregateRow[],
  monthKeys: readonly string[],
): WindowIncome {
  const inWindow = new Set(monthKeys)
  let real = 0
  let all = 0
  for (const row of rows) {
    if (!inWindow.has(row.month)) continue
    const pos = Number(row.sum_positief) || 0
    if (pos === 0) continue
    all += pos
    if (isRealAggRow(row)) real += pos
  }
  return { real, all }
}

/**
 * Transfer-gefilterde in-/uitstroom per maand in het venster, ongeacht budget.
 * Alleen maanden mét een boeking krijgen een entry. Zie `BudgetRealizedWindow.byMonth`.
 */
export function reduceWindowByMonth(
  rows: readonly TxMonthAggregateRow[],
  monthKeys: readonly string[],
): Record<string, WindowMonthFlow> {
  const inWindow = new Set(monthKeys)
  const out: Record<string, WindowMonthFlow> = {}
  for (const row of rows) {
    if (!inWindow.has(row.month)) continue
    if (!isRealAggRow(row)) continue
    const pos = Number(row.sum_positief) || 0
    const neg = Math.abs(Number(row.sum_negatief) || 0)
    if (pos === 0 && neg === 0) continue
    const m = (out[row.month] ??= { income: 0, expenses: 0 })
    m.income += pos
    m.expenses += neg
  }
  return out
}

/**
 * Het TRANSACTIE-JAARINKOMEN op de historiebasis (ADR 0138): de positieve som
 * over de twaalf afgesloten maanden, geschaald met dezelfde `historyMonths` als
 * de budgetposten. Vervangt de per-loader `extrapolateAnnualIncome(Σ txAgg12,
 * vroegste inkomstendatum)` — die som liep tot en met de lopende maand terwijl
 * de deler alleen afgesloten maanden telde, en verschoof dus dagelijks.
 *
 * ÉÉN GRONDSLAG (ADR 0169, eigenaarsbesluit 6 sep 2026): altijd de transfer-
 * GEFILTERDE som (`windowIncome.real`). Tot 19 sep 2026 kende deze helper een
 * `includeTransfers`-optie waarmee de horizon-FIRE-som (pensioenuitgave-methode
 * `current_income`, FIRE-spaarbron) en de uitgaven-na-pensioen-sheet transfers
 * bewust meetelden, terwijl dashboard/core/spaarquote ze filterden. Die per-
 * module-splitsing heropende exact het repro-pad van WF-TOEK-02-bug2 (KPI ≠
 * sheet na sluiten) zodra income_source ≠ manual, geen bruikbare budgetbasis
 * en inkomsten-transfers samenkwamen. De optie is bewust weg — niet op
 * default gezet — zodat een tweede waarheid niet stil terug kan komen
 * (vangrail: lib/retirement-expense-basis.grondslag.test.ts).
 */
export function transactionAnnualIncome(
  window: Pick<BudgetRealizedWindow, 'historyMonths' | 'windowIncome'>,
): number {
  return annualizeHistorySum(window.windowIncome.real, window.historyMonths)
}

/**
 * De chunk-grenzen van het historievenster: drie blokken van vier maanden, oud
 * naar nieuw. Het laatste blok sluit op de 1e van de LOPENDE maand (exclusief):
 * de lopende maand hoort niet in het venster (ADR 0138). Apart benoemd zodat
 * het gescoopte en het RLS-pad aantoonbaar dezelfde vensters bevragen.
 */
function realizedChunks(now: Date): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = []
  for (let offset = REALIZED_WINDOW_MONTHS; offset > 0; offset -= REALIZED_CHUNK_MONTHS) {
    const size = Math.min(REALIZED_CHUNK_MONTHS, offset)
    chunks.push({
      from: localMonthStartMonthsAgo(now, offset),
      to: localMonthStartMonthsAgo(now, offset - size),
    })
  }
  return chunks
}

/**
 * De gerealiseerde bedragen per budget over de twaalf afgesloten maanden — de
 * ONGECACHETE kern.
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
 * venster (alles terug op de geplande limiet, jaarinkomen 0 → profiel). Liever
 * geen realisatie dan een aanroep waarvan de afbakening niet vaststaat.
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
  const monthKeys = historyMonthKeys(now)
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
  // deler (`historyMonths`) op de overige rijen gewoon vol blijft — dat levert
  // een structureel TE LAGE realisatie op, en voor uitgaven is te laag
  // optimistisch (te vroege FIRE-datum). Erger nog: de post blijft
  // `source: 'realized'` heten, dus niets aan het getal verraadt dat er data
  // mist. Daarom valt de hele ronde terug op het lege venster: elke post gaat
  // zichtbaar op `'planned'` en het transactie-jaarinkomen op 0 (→ de
  // profiel-terugval, met zichtbare grondslag) — toestanden die de UI benoemt.
  if (anyChunkFailed) {
    return { ...EMPTY_REALIZED_WINDOW, windowEndMonth }
  }

  return {
    windowMonths: REALIZED_WINDOW_MONTHS,
    windowEndMonth,
    historyMonths: historyMonthsFromRows(rows, monthKeys),
    windowIncome: reduceWindowIncome(rows, monthKeys),
    byMonth: reduceWindowByMonth(rows, monthKeys),
    truncationSuspected,
    byBudgetId: reduceRealizedByBudget(rows, monthKeys),
  }
}

/**
 * De gerealiseerde bedragen per budget over de twaalf afgesloten maanden, voor
 * het SESSIE-pad.
 *
 * `cache()` op de supabase-client (nooit op een vers `{from,to}`-object — dat
 * zou een stille no-op zijn, zie de toelichting bij `getTxAgg12m`): binnen één
 * RSC-render delen alle grondslag-aanroepers dezelfde drie RPC's.
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

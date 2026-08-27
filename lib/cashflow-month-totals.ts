// lib/cashflow-month-totals.ts
//
// DE MAANDTOTALEN-KERN — inkomen + uitgaven van één kalendermaand uit rauwe
// transactierijen. Eén implementatie, twee soorten consumenten.
// ───────────────────────────────────────────────────────────────────────────
//
// WAAROM DIT EEN EIGEN (BLAD-)MODULE IS
// `deriveRealMonthTotals` woonde in `lib/cashflow-kpis.ts`. Dat is een
// LOADER-module: hij trekt `lib/server-data/*`, de perspectief-context en de
// budget-grondslag mee. Prima voor server-code — maar de figures-strip op
// /overzicht/cashflow is een CLIENT-component die per gekozen maand zijn eigen
// rijen ophaalt en dus dezelfde totalen moet kunnen afleiden. Die de hele
// loader-graaf laten importeren om bij tien regels pure rekenkunde te komen is
// geen optie; de formule kopiëren nog minder — precies zó ontstond bevinding H6
// (de strip telde op vier assen anders dan de canonieke motor).
//
// Daarom is de functie hierheen VERPLAATST — niet nagebouwd. `lib/cashflow-kpis.ts`
// re-exporteert hem onder dezelfde naam, dus geen enkele bestaande importeur
// verandert. Deze module importeert alleen `isRealAggRow` (het transfer-predicaat)
// en is verder afhankelijkheidsvrij, zodat hij zowel op de server als in de
// browser-bundle thuishoort.
//
// DE TWEE CONVENTIES DIE HIER WONEN
//  1. CLASSIFICATIE = HET TEKEN VAN `amount`. Positief = inkomen, negatief =
//     uitgave, `Math.abs` bij het optellen. NIET de boolean `is_income`: die is
//     een tweede, NIET-afgedwongen weergave van dezelfde waarheid —
//     `supabase/migrations/20260215000000_create_base_tables.sql` zet
//     `is_income BOOLEAN DEFAULT false` zonder CHECK tegen `sign(amount)`. Vandaag
//     lopen ze gelijk (0 van 21.536 productierijen wijkt af); dat is een
//     momentopname, geen garantie.
//  2. TRANSFER-FILTER = `isRealAggRow`, dus `transfer` ÉN `joint_transfer`. Een
//     filter op alleen `'transfer'` laat huishoud-overboekingen als echt
//     inkomen/echte uitgave meetellen.

import { isRealAggRow } from '@/lib/server-data/tx-aggregates'

/** De transactie-kolommen die de maand-passes nodig hebben. */
export interface MonthTxRow {
  amount: number | string
  budget_id?: string | null
  transaction_type?: string | null
}

/** Inkomen + uitgaven (absoluut) van één maand. */
export interface RealMonthTotals {
  income: number
  expenses: number
}

/**
 * Inkomen + uitgaven (absoluut) uit de RAUWE transactierijen van een maand, met
 * de transfer-filter (`transfer`/`joint_transfer` tellen niet mee).
 *
 * Oorspronkelijk verplaatst uit `loadDashboardData` (was ~r488-495), daarna uit
 * `lib/cashflow-kpis.ts` hierheen. Het predicaat is `isRealAggRow` — exact
 * dezelfde transfer-definitie als de `realOnly`-vlag op de aggregaat-reducers,
 * zodat er één plek is waar "wat telt als echte transactie" staat.
 *
 * DE ROLLEN VAN DE TWEE CONSUMENTEN VERSCHILLEN, DE FORMULE NIET:
 *  · `lib/dashboard-data-loader.ts` / `lib/cashflow-kpis.ts` voeden hiermee de
 *    EFFECTIVE grondslag (`resolveEffectiveIncomeExpenses`), niet de
 *    `currentMonth*`-velden — die komen uit het maandaggregaat.
 *  · `components/app/cash-overview.tsx` (de figures-strip) leidt hiermee de
 *    getoonde maandtotalen van de GEKOZEN maand af.
 *
 * `rows` mag ALLE RLS-zichtbare rijen van de maand bevatten; deze functie scoopt
 * bewust NIET op rekening. Zie de kop van `loadTransactions` in cash-overview
 * voor waarom die scoping daar is losgelaten.
 */
export function deriveRealMonthTotals(rows: MonthTxRow[]): RealMonthTotals {
  let income = 0
  let expenses = 0
  for (const tx of rows) {
    if (!isRealAggRow(tx)) continue
    const amt = Number(tx.amount)
    if (amt > 0) income += amt
    else expenses += Math.abs(amt)
  }
  return { income, expenses }
}

/**
 * De canonieke classificatie van ÉÉN rij, als predicaat — voor oppervlakken die
 * niet alleen de twee totalen nodig hebben maar ook een opsplitsing per budget
 * of per dag (de strip-grafiek, de kassabonnen). Zonder deze export zou zo'n
 * oppervlak alsnog zelf `tx.is_income` gaan lezen en de totalen weer laten
 * afwijken van hun eigen onderverdeling — de vorm waarin H6 ontstond.
 */
export function isIncomeRow(tx: { amount: number | string }): boolean {
  return Number(tx.amount) > 0
}

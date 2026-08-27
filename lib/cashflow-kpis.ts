// lib/cashflow-kpis.ts
//
// SLANKE KPI-LAAG VOOR /overzicht/cashflow (FASE 2 · Task 2.1)
// ───────────────────────────────────────────────────────────────────────────
// `buildCashflowCards` (lib/cashflow-cards.ts) kreeg de volledige
// `DashboardData` binnen maar gebruikt daaruit precies ZEVEN scalars. Om die
// zeven te krijgen draaide de cashflow-hub de hele `loadDashboardData`: ~40
// queries in 5-6 seriële golven plus — de dure staart — een KOUDE horizon-tak
// (`computeHorizonFireSim` → `loadHorizonData`, nog eens ~17 queries plus een
// bisectie-solve). Op /overzicht is die tak warm; op cashflow niet.
//
// HET BESLUIT: EXTRAHEREN, NIET HERBEREKENEN (ADR 0083)
// De zeven scalars hangen aan VIER fetches die alle vier al `cache()`-gedeeld
// zijn (`getOwnProfile`, `getBudgets`, `getCurrentMonthTx` uit
// lib/server-data/base.ts + `getTxAgg12m` uit lib/server-data/tx-aggregates.ts).
// De afleidingen zelf zijn pure JS. Die afleidingen zijn hierheen VERPLAATST —
// niet nagebouwd — en `lib/dashboard-data-loader.ts` consumeert exact dezelfde
// helpers. Eén implementatie, dus geen tweede rekenweg die kan wegdrijven; een
// parity-belofte in een comment zou dat niet zijn. `lib/cashflow-kpis.parity.
// test.ts` bewijst de gelijkheid end-to-end op vijf fixtures.
//
// CONSUME, DON'T RECOMPUTE. Hier staat GEEN nieuwe formule. De budget-oprol en
// de budgetdekkings-score zijn letterlijk verplaatst; `currentMonth*` komt uit
// de bestaande aggregaat-reducers (`aggIncomeByMonth`/`aggExpenseByMonthAbs`) en
// de effective grootheden uit de bestaande `resolveEffectiveIncomeExpenses`.
//
// RLS: `loadCashflowKpis` MOET met de anon/authenticated client (createClient uit
// lib/supabase/server.ts) worden aangeroepen — nooit met getServiceClient(). Zie
// de kopteksten van lib/server-data/base.ts en lib/server-data/tx-aggregates.ts.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getOwnProfile,
  getBudgets,
  getCurrentMonthTx,
  getActiveAssets,
  getActiveDebts,
  getEarliestIncomeDate,
  getNetWorthSnapshots12m,
} from '@/lib/server-data/base'
import {
  getTxAgg12m,
  aggIncomeByMonth,
  aggExpenseByMonthAbs,
  aggSumPositief,
  aggSumNegatiefAbs,
  aggToExpenseRows,
  type TxMonthAggregateRow,
} from '@/lib/server-data/tx-aggregates'
import { deriveRealMonthTotals, type MonthTxRow } from '@/lib/cashflow-month-totals'
import { recentDailyExpenseRateFromRows } from '@/lib/expense-rate'
import { resolveEffectiveIncomeExpenses, type IncomeExpenseSources } from '@/lib/effective-financials'
import { buildBudgetTypeMap } from '@/lib/budget-utils'
import { loadBudgetBasis } from '@/lib/household/budget-share'
import type { BudgetBasisRow } from '@/lib/budget-basis'
import { localMonthBounds } from '@/lib/month-range'
import {
  computeSavingsRate6m,
  computeDebtAflossingMonthly,
  savingsRateWindow,
  savingsRateDataMonths,
} from '@/lib/savings-source'
import { computeSavingsRateFromNetWorthDelta } from '@/lib/core-metrics'
import { computeExpectedAnnualAppreciation, type Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

// ── Invoervormen ────────────────────────────────────────────────────────────

/** De budget-kolommen die de oprol nodig heeft (subset van de `budgets`-rij). */
export interface BudgetRowForTotals {
  id: string
  parent_id: string | null
  budget_type: string
  default_limit: number | string | null
  interval: string | null
}

// De transactie-kolommen die de huidige-maand-passes nodig hebben (`MonthTxRow`)
// en de maandtotalen-pass (`deriveRealMonthTotals`) wonen sinds H6 in de
// bladmodule `lib/cashflow-month-totals.ts` — zie de kop daar voor het waarom.
// Hier alleen nog RE-EXPORT onder dezelfde namen, zodat geen enkele bestaande
// importeur van deze module iets merkt van de verhuizing.
export {
  deriveRealMonthTotals,
  isIncomeRow,
  type MonthTxRow,
  type RealMonthTotals,
} from '@/lib/cashflow-month-totals'

/**
 * De snapshot-kolommen die de forecast-laag nodig heeft (subset van de
 * `net_worth_snapshots`-rij zoals `getNetWorthSnapshots12m` 'm ophaalt).
 */
export interface NetWorthSnapshotRow {
  snapshot_date: string
  net_worth: number
  savings_rate?: number | null
}

/** Eén punt in een maandreeks (sparkline-vorm: `{ month, value }`). */
export interface MonthValue {
  month: string
  value: number
}

/** Budgetlimiet + besteding per budget-type, genormaliseerd naar één maand. */
export interface BudgetTotalsByType {
  income: { limit: number; spent: number }
  expense: { limit: number; spent: number }
  savings: { limit: number; spent: number }
  debt: { limit: number; spent: number }
}

/**
 * Precies wat `buildCashflowCards` uit de bundel leest — niets meer.
 *
 * `DashboardData` is hier structureel aan toewijsbaar (bredere `budgetTotals`/
 * `monthSummary` + extra velden), dus elke bestaande callsite die de volle
 * bundel doorgeeft blijft ongewijzigd compileren. Dat is bewust: het maakt de
 * omzetting van de cashflow-pagina naar `loadCashflowKpis` een aparte,
 * terugdraaibare stap.
 */
export interface CashflowCardScalars {
  budgetTotals: { expense: { limit: number; spent: number } }
  monthSummary: { budgetScore: number }
  budgetingActive: boolean
  /** GEREALISEERDE huidige kalendermaand (aggregaat, transfers eruit) — ADR 0073. */
  currentMonthIncome: number
  /** GEREALISEERDE huidige kalendermaand (aggregaat, transfers eruit) — ADR 0073. */
  currentMonthExpenses: number
  /** EFFECTIVE maandinkomen (`income_source='manual'` wint) — ADR 0073. */
  monthlyIncome: number
  /** EFFECTIVE maanduitgaven (`expenses_source='manual'` wint) — ADR 0073. */
  monthlyExpenses: number
  /**
   * CANONIEK dagtarief (€/dag) voor €→vrijheidstijd — 12-mnd ROLLING grondslag
   * via `lib/expense-rate.ts`, exact dezelfde keten als
   * `DashboardData.dailyExpenseRate`. Nul extra queries: `txAgg12` is er al.
   *
   * Staat er bewust NAAST `monthlyExpenses` en vervangt hem niet: die blijft de
   * EFFECTIVE grondslag voor structurele aandeel-vragen ("hoeveel van mijn
   * inkomen ligt vast?"). Maar een dagtarief mag NOOIT uit de effective waarde
   * komen — dat is de losse kalendermaand, die vroeg in de maand naar ~0
   * uitschiet en dan hetzelfde bedrag een veelvoud aan "jaren vrijheid" geeft
   * t.o.v. de widget ernaast (vervolg KRUIS-20). 0 = geen eerlijke dagbasis.
   *
   * Optioneel/additief om exact dezelfde reden als `DashboardData.dailyExpenseRate`:
   * die bundel is structureel toewijsbaar aan dit type (page-status, cashflow-cards,
   * UAT-checks geven 'm door) en draagt het veld óók als optioneel voor
   * mock-/empty-bundels. Consumenten kiezen expliciet hun terugval — nooit stil
   * een eigen maand-conversie.
   */
  dailyExpenseRate?: number
}

// ── Pure afleidingen (verplaatst uit lib/dashboard-data-loader.ts) ───────────

/**
 * De vier budget-types die meetellen in de limiet-/besteding-oprol. `archive`
 * valt er bewust buiten (gearchiveerde budgetten tellen nergens mee).
 */
export const BUDGET_TYPES = ['income', 'expense', 'savings', 'debt'] as const
export type BudgetType = typeof BUDGET_TYPES[number]

/**
 * Map budget_id → budget_type, voor ZOWEL parent- als child-budgetten. Een child
 * erft het type van zijn parent (en valt weg als die parent ontbreekt).
 *
 * Verplaatst uit `loadDashboardData` (was ~r552-557), waar de map behalve de
 * budget-oprol ook de spaar- en schuld-budget-ID-sets voedt.
 *
 * VERHUISD naar lib/budget-utils.ts (ADR 0103): de pure grondslag-motor
 * `lib/budget-basis.ts` heeft precies deze erfregel nodig en mag géén
 * Supabase-import binnentrekken (deze module doet dat wel, via
 * lib/server-data/base.ts). Hier blijft een re-export staan zodat de bestaande
 * call-sites (lib/dashboard-data-loader.ts) ongewijzigd blijven — één definitie,
 * twee ingangen.
 */
export { buildBudgetTypeMap }

/**
 * Budgetlimiet + besteding per type over de HUIDIGE kalendermaand.
 *
 * Verplaatst uit `loadDashboardData` (was ~r550-589) — gedragsneutraal, regel
 * voor regel. Twee eigenschappen die bewust ONGEWIJZIGD zijn overgenomen en dus
 * geen "verbetering" mogen krijgen zonder eigen besluit:
 *
 *  1. **De limiet rolt kinderen op**: heeft een parent kinderen, dan is de
 *     limiet de som van de kinder-limieten (anders de eigen `default_limit`).
 *     Daarna genormaliseerd naar een maand (`quarterly` ÷3, alles wat niet
 *     `monthly`/`quarterly` is ÷12).
 *  2. **De `spent`-pass heeft GÉÉN transfer-filter.** Anders dan de
 *     inkomen/uitgaven-sommen (die `isRealTx`/`realOnly` toepassen) telt hier
 *     élke transactie mét budget_id mee, ongeacht `transaction_type`, en
 *     absoluut (`Math.abs`). Dat is bestaand gedrag van élke budget-surface;
 *     het hier "logischer" maken zou de budgetdekking op /overzicht en op
 *     /overzicht/cashflow uit elkaar laten lopen.
 */
export function deriveBudgetTotals(
  budgets: BudgetRowForTotals[],
  currentMonthTx: MonthTxRow[],
): BudgetTotalsByType {
  const parents = budgets.filter(b => b.parent_id === null)
  const children = budgets.filter(b => b.parent_id !== null)
  const budgetTypeMap = buildBudgetTypeMap(budgets)

  const budgetLimits: Record<string, number> = { income: 0, expense: 0, savings: 0, debt: 0 }
  for (const b of parents) {
    const type = b.budget_type as string
    if (!BUDGET_TYPES.includes(type as BudgetType)) continue
    const kids = children.filter(c => c.parent_id === b.id)
    const limit = kids.length > 0
      ? kids.reduce((sum, c) => sum + Number(c.default_limit), 0)
      : Number(b.default_limit)
    const monthlyLimit = b.interval === 'monthly' ? limit
      : b.interval === 'quarterly' ? limit / 3
      : limit / 12
    budgetLimits[type] = (budgetLimits[type] ?? 0) + monthlyLimit
  }

  const budgetSpent: Record<string, number> = { income: 0, expense: 0, savings: 0, debt: 0 }
  for (const tx of currentMonthTx) {
    const amt = Number(tx.amount)
    const budgetId = tx.budget_id
    if (!budgetId) continue
    const type = budgetTypeMap.get(budgetId)
    if (!type || !BUDGET_TYPES.includes(type as BudgetType)) continue
    budgetSpent[type] = (budgetSpent[type] ?? 0) + Math.abs(amt)
  }

  return {
    income:  { limit: budgetLimits.income,  spent: budgetSpent.income },
    expense: { limit: budgetLimits.expense, spent: budgetSpent.expense },
    savings: { limit: budgetLimits.savings, spent: budgetSpent.savings },
    debt:    { limit: budgetLimits.debt,    spent: budgetSpent.debt },
  }
}

/**
 * Budgetdekkings-score 0-100: het gemiddelde over ÁLLE VIER de budget-types met
 * `limit > 0` van "hoeveel procent van de limiet is niet overschreden".
 * Geen budget met een limiet → 100 (niets om te overschrijden).
 *
 * Verplaatst uit `loadDashboardData` (was ~r1691-1694) en daar de bron van
 * `monthSummary.budgetScore`, waar de Budget-kaart en de sidebar-statusdot via
 * `budgetCardStatus`/`pillarStatus` op draaien. LET OP: de score middelt over
 * alle vier de types, terwijl de Budget-KPI zelf uitsluitend op
 * `budgetTotals.expense` staat — dat is bestaand, bewust gedrag (de KPI is een
 * bedrag, de score een dekkingsoordeel), geen inconsistentie om op te lossen.
 */
export function deriveBudgetScore(budgetTotals: BudgetTotalsByType): number {
  const budgetScoreEntries = Object.values(budgetTotals).filter(v => v.limit > 0)
  return budgetScoreEntries.length > 0
    ? Math.round(budgetScoreEntries.reduce((s, v) => s + Math.min(100, (1 - Math.max(0, v.spent - v.limit) / v.limit) * 100), 0) / budgetScoreEntries.length)
    : 100
}

/**
 * De budgetteren-gate uit het profiel. `undefined` (kolom ontbreekt) en `null`
 * gelden als AAN — alleen een expliciete `false` zet 'm uit. Verplaatst uit
 * `loadDashboardData` (was ~r476).
 */
export function resolveBudgetingActive(profile: Record<string, unknown> | null | undefined): boolean {
  return profile?.budgeting_active !== false
}

/**
 * De aggregaat-sleutel ('YYYY-MM') van de kalendermaand waarin `now` valt.
 *
 * Tijdzone-veilig via `localMonthBounds` (het TZ-lint verbiedt `toISOString()`
 * op maandgrenzen) en byte-identiek aan de `monthStart.slice(0, 7)` die
 * `loadDashboardData` gebruikt: beide leveren jaar/maand uit de LOKALE
 * componenten van `now`. `cashflow-kpis.parity.test.ts` pint die gelijkheid vast
 * over jaar-, schrikkel- en DST-grenzen.
 */
export function currentMonthKey(now: Date): string {
  return localMonthBounds(now).start.slice(0, 7)
}

// ── Afleidingen voor de forecast-samenvatting (T2.5) ────────────────────────
//
// Alles hieronder is — net als de blokken erboven — VERPLAATST uit
// `loadDashboardData`, niet nagebouwd. Die loader consumeert exact deze functies,
// zodat er per afleiding één implementatie bestaat.

/**
 * Een `Map<'YYYY-MM', bedrag>` als oplopende reeks `{ month, value }`.
 *
 * Verplaatst uit `loadDashboardData` (was de lokale `toSortedHistory`, ~r1439).
 * De sortering is lexicografisch op de maandsleutel — voor `YYYY-MM` is dat
 * gelijk aan chronologisch, óók over een jaargrens heen.
 */
export function toSortedMonthHistory(byMonth: Map<string, number>): MonthValue[] {
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value }))
}

/**
 * Uitgaven per maand (Σ |negatieve bedragen|, transfer-gefilterd) als oplopende
 * reeks — de bron van `DashboardData.expenseHistory` en van de uitgaventrend-
 * sparkline op /overzicht/cashflow/forecast.
 *
 * Verplaatst uit `loadDashboardData` (was ~r1409-1412). Uit het MAANDAGGREGAAT,
 * niet uit rauwe rijen: een aggregaat kan niet stil op `max_rows` afkappen.
 */
export function deriveExpenseHistory(txAgg12: TxMonthAggregateRow[]): MonthValue[] {
  return toSortedMonthHistory(aggExpenseByMonthAbs(txAgg12, { realOnly: true }))
}

/**
 * Spaarquote-historie: het percentage per snapshot-maand.
 *
 * Verplaatst uit `loadDashboardData` (was ~r1330-1335). LET OP DE BRON: deze
 * reeks komt uit `net_worth_snapshots.savings_rate` — de opgeslagen quote per
 * maand — en NIET uit de transactie-aggregaten. De maandsleutel is dus de volle
 * `snapshot_date` (`YYYY-MM-DD`), niet een `YYYY-MM`-aggregaatsleutel; dat is
 * bestaand gedrag waar de sparkline alleen `value` van leest.
 *
 * Rijen zónder `savings_rate` vallen weg (een snapshot van vóór de kolom, of een
 * schrijver die 'm niet zette) — bewust géén 0-fallback: een 0 % zou als échte
 * meting in de sparkline landen.
 */
export function deriveSavingsHistory(snapshots: NetWorthSnapshotRow[]): MonthValue[] {
  return snapshots
    .filter(s => s.savings_rate != null)
    .map(s => ({ month: s.snapshot_date, value: Number(s.savings_rate) }))
}

/**
 * Aantal maanden werkelijke data (1-6) voor de extrapolatie in de 6-maands
 * spaarquote.
 *
 * DELEGEERT sinds bevinding C6 naar `savingsRateDataMonths` (lib/savings-source.ts),
 * waar de telling naast het venster woont dat ze moet beschrijven. De vier
 * loaders die deze afleiding elk inline droegen (dashboard/core/horizon/lever)
 * lezen nu allemaal diezelfde bron. Blijft hier als naam bestaan omdat
 * `loadDashboardData` en `loadCashflowKpis` hem onder deze naam consumeren.
 */
export function deriveDataMonths6(now: Date, earliestIncomeDate: string | null | undefined): number {
  return savingsRateDataMonths(now, earliestIncomeDate)
}

/** De budget-ID's (parent + child) van één type, uit de gedeelde type-map. */
export function budgetIdsOfType(budgetTypeMap: Map<string, string>, type: BudgetType): Set<string> {
  const ids = new Set<string>()
  for (const [id, t] of budgetTypeMap) if (t === type) ids.add(id)
  return ids
}

/** De 6-maands sommen die de canonieke spaarquote voeden, uit het maandaggregaat. */
export interface SavingsRate6mWindow {
  income6m: number
  expenses6m: number
  savingsBudgetSpent6m: number
}

/**
 * Het 6-maands sub-venster op het 12-maands maandaggregaat: inkomsten, uitgaven
 * en spaarbudget-stortingen, alle drie transfer-gefilterd.
 *
 * Verplaatst uit `loadDashboardData` (was ~r792-805). De grenzen komen sinds
 * bevinding C6 uit `savingsRateWindow` (lib/savings-source.ts): zes VOLTOOIDE
 * kalendermaanden, de lopende maand EXCLUSIEF. Voorheen liep het venster t/m de
 * lopende maand terwijl `deriveDataMonths6` er alleen de verstreken maanden in
 * telde — die scheefheid maakte de quote structureel te laag en bij weinig
 * historie extreem negatief. Beide grenzen zijn de 1e van een maand, dus
 * `date >= grens` is exact `maand >= grens.slice(0,7)`.
 */
export function deriveSavingsRate6mWindow(
  now: Date,
  txAgg12: TxMonthAggregateRow[],
  savingsBudgetIds: Set<string>,
): SavingsRate6mWindow {
  const { sinceMonth, beforeMonth } = savingsRateWindow(now)
  return {
    income6m: aggSumPositief(txAgg12, { realOnly: true, sinceMonth, beforeMonth }),
    expenses6m: aggSumNegatiefAbs(txAgg12, { realOnly: true, sinceMonth, beforeMonth }),
    savingsBudgetSpent6m: aggSumNegatiefAbs(txAgg12, {
      realOnly: true,
      sinceMonth,
      beforeMonth,
      budgetIds: savingsBudgetIds,
    }),
  }
}

export interface SavingsRate6mInput extends SavingsRate6mWindow {
  /** `computeDebtAflossingMonthly(debts) × 6`. */
  debtAflossing6m: number
  /** 1-6, uit `deriveDataMonths6`. */
  dataMonths: number
  /** EFFECTIVE maandinkomen (ADR 0073) — profiel-fallback én noemer van de delta-tak. */
  effectiveMonthlyIncome: number
  /** EFFECTIVE maanduitgaven (ADR 0073) — alleen voor de profiel-fallback. */
  effectiveMonthlyExpenses: number
  /** 12-maands netto-vermogen-snapshots (oplopend) voor de delta-tak. */
  netWorthSnapshots: NetWorthSnapshotRow[]
  /** Actieve bezittingen — ALLEEN gelezen wanneer de delta-tak aanslaat. */
  assets: Asset[]
}

export interface SavingsRate6mOutcome {
  /** ONAFGEROND (de bundel rondt zelf af op één decimaal bij het teruggeven). */
  savingsRate6m: number
  /** De aggregaat-formule gaf 0 → er is teruggevallen op profiel of net-worth-delta. */
  isEstimate: boolean
  /** Geëxtrapoleerde 6m-inkomsten — het inkomen-anker van het normale pad. */
  extIncome6: number
}

/**
 * De canonieke 6-maands spaarquote MÉT haar twee fallbacks, in de volgorde
 * waarin `loadDashboardData` ze altijd al toepaste:
 *
 *  1. `computeSavingsRate6m` — extrapolatie <6m data, spaarbudget-stortingen uit
 *     de uitgaven-term, schuldaflossing erbij (lib/savings-source.ts), plús de
 *     PROFIEL-fallback `(inkomen − uitgaven) / inkomen` wanneer de aggregaat-
 *     formule 0 gaf;
 *  2. de NET-VERMOGEN-DELTA-tak — slaat aan als (1) `isEstimate` is (aggregaat 0),
 *     er ≥2 snapshots zijn én het effectieve maandinkomen > 0. Overschrijft dan de
 *     profiel-fallback met `computeSavingsRateFromNetWorthDelta`: de netto-
 *     vermogensgroei over de snapshot-periode, minus de verwachte koerswinst op
 *     beleggingen (dat is geen sparen), gedeeld door het maandinkomen.
 *
 * Verplaatst uit `loadDashboardData` (was ~r827-855) — regel voor regel, inclusief
 * twee eigenschappen die geen "verbetering" mogen krijgen zonder eigen besluit:
 *
 *  · `computeExpectedAnnualAppreciation` draait ALLEEN binnen de tak. Buiten de
 *    tak worden de assets dus niet gelezen; dat scheelt niets in queries maar
 *    houdt het gedrag identiek.
 *  · `isEstimate` blijft de uitkomst van de AGGREGAAT-formule — ook wanneer de
 *    delta-tak een getal levert. De bundel exporteert 'm als
 *    `savingsRateIsEstimate` ("dit is geen transactie-quote") en gebruikt 'm om
 *    het inkomen-anker van `monthlySavingsAmount` te kiezen.
 */
export function resolveSavingsRate6m(input: SavingsRate6mInput): SavingsRate6mOutcome {
  const savings6m = computeSavingsRate6m({
    income6m: input.income6m,
    expenses6m: input.expenses6m,
    savingsBudgetSpent6m: input.savingsBudgetSpent6m,
    debtAflossing6m: input.debtAflossing6m,
    dataMonths: input.dataMonths,
    fallbackMonthlyIncome: input.effectiveMonthlyIncome,
    fallbackMonthlyExpenses: input.effectiveMonthlyExpenses,
  })

  let savingsRate6m = savings6m.savingsRate6m
  if (savings6m.isEstimate && input.netWorthSnapshots.length >= 2 && input.effectiveMonthlyIncome > 0) {
    const expectedAnnualAppreciation = computeExpectedAnnualAppreciation(input.assets)
    const deltaResult = computeSavingsRateFromNetWorthDelta(
      input.netWorthSnapshots,
      input.effectiveMonthlyIncome,
      { expectedAnnualAppreciation },
    )
    if (deltaResult) {
      savingsRate6m = deltaResult.rate
    }
  }

  return { savingsRate6m, isEstimate: savings6m.isEstimate, extIncome6: savings6m.extIncome6 }
}

// ── De loader ───────────────────────────────────────────────────────────────

/**
 * De zeven scalars die `buildCashflowCards` nodig heeft, uit VIER gedeelde
 * fetches — zonder de rest van `loadDashboardData` (en zonder de koude
 * horizon-tak met haar bisectie-solve).
 *
 * `cache()`-gewrapt op ALLEEN de supabase-client, precies zoals
 * lib/server-data/base.ts: `createClient()` is zelf `cache()`-gewrapt → één
 * instantie per RSC-render, dus pagina en API-route binnen hetzelfde request
 * raken dezelfde entry. De vier onderliggende fetches zijn óók `cache()`-gedeeld,
 * dus draait `loadDashboardData` in hetzelfde request tóch mee (bv. op
 * /overzicht), dan kosten ze daar nul extra queries.
 *
 * ── DE ASYMMETRIE DIE MOET BLIJVEN (ADR 0073 · ADR 0083) ───────────────────
 * De twee paren komen BEWUST uit verschillende bronnen, en dat is geen
 * slordigheid die "gelijkgetrokken" moet worden:
 *
 *  • `currentMonthIncome`/`currentMonthExpenses` — GEREALISEERDE maand, uit het
 *    12-maands MAANDAGGREGAAT (`tx_month_aggregate`) via de bestaande reducers.
 *    Een aggregaat levert enkele rijen en kan dus niet stil op PostgREST's
 *    `max_rows` (1000) afkappen.
 *  • `monthlyIncome`/`monthlyExpenses` — EFFECTIVE grondslag, uit de RAUWE
 *    huidige-maand-rijen (`getCurrentMonthTx`, mét `isRealTx`, en dus mét
 *    diezelfde stille 1000-rijen-cap) door `resolveEffectiveIncomeExpenses`
 *    heen, waar `income_source = 'manual'` de profielinschatting laat winnen.
 *
 * Beide grondslagen worden ook echt allebei gebruikt: de Transacties-kaart staat
 * op het gerealiseerde paar (een kaart die "deze maand" belooft mag geen
 * profielinschatting tonen — dat was de bug van ADR 0073), de Vaste-lasten-kaart
 * juist op het effective inkomen (een structureel aandeel meet je tegen een
 * stabiel maandinkomen, niet tegen een half-afgelopen maand).
 *
 * De cap op de rauwe pass is hier BEWUST niet "gerepareerd": `getCurrentMonthTx`
 * draagt 'm vandaag óók op /overzicht. Alleen in deze loader repareren zou
 * precies de drift creëren die deze module bestaat om te voorkomen — dat is een
 * eigen wijziging, op beide paden tegelijk.
 */
export const loadCashflowKpis = cache(async (supabase: SupabaseClient): Promise<CashflowCardScalars> => {
  // `now` VÓÓR de fetches bemonsteren, net als `loadDashboardData` doet. Zou de
  // maandsleutel ná de awaits worden afgeleid, dan kan een request dat over
  // middernacht op de 1e heen loopt een maand opzoeken die de queries niet
  // getarget hebben — een gratis asymmetrie met het pad dat dit moet spiegelen.
  const now = new Date()

  const [profileResult, budgetsResult, txResult, txAgg12Result] = await Promise.all([
    getOwnProfile(supabase),
    getBudgets(supabase),
    getCurrentMonthTx(supabase),
    getTxAgg12m(supabase),
  ])

  const profile = (profileResult.data ?? null) as (Record<string, unknown> & IncomeExpenseSources) | null
  const budgets = (budgetsResult.data ?? []) as unknown as BudgetRowForTotals[]
  const monthTx = (txResult.data ?? []) as unknown as MonthTxRow[]
  const txAgg12 = (txAgg12Result.data ?? []) as TxMonthAggregateRow[]

  // Budget: limiet/besteding per type → de expense-KPI + de dekkings-score.
  const budgetTotals = deriveBudgetTotals(budgets, monthTx)

  // Gerealiseerde maand uit het aggregaat (zie de asymmetrie hierboven).
  const monthKey = currentMonthKey(now)
  const currentMonthIncome = aggIncomeByMonth(txAgg12, { realOnly: true }).get(monthKey) ?? 0
  const currentMonthExpenses = aggExpenseByMonthAbs(txAgg12, { realOnly: true }).get(monthKey) ?? 0

  // Effective grondslag uit de rauwe maand-rijen (zie de asymmetrie hierboven).
  // De budgetgrondslag (ADR 0103) loopt via dezelfde gedeelde samenstelling als
  // `loadDashboardData` — anders zou deze KPI-laag een ander effectief inkomen
  // tonen dan /overzicht zodra iemand op budgetten staat (de parity-suite
  // hieronder vangt dat).
  const kpiBudgetBasis = await loadBudgetBasis(supabase, profile, budgets as unknown as BudgetBasisRow[])
  const realMonth = deriveRealMonthTotals(monthTx)
  const { income: monthlyIncome, expenses: monthlyExpenses } =
    resolveEffectiveIncomeExpenses(profile ?? {}, realMonth.income, realMonth.expenses, {
      income: kpiBudgetBasis.income.monthlyTotal,
      expenses: kpiBudgetBasis.expenses.monthlyTotal,
    })

  // Canoniek dagtarief — GEEN eigen som: dezelfde helper-keten als de
  // dashboardbundel, op het al opgehaalde 12-mnd aggregaat. `realOnly: false`
  // houdt de basis (alle ruwe negatieve transacties) byte-identiek aan
  // `DashboardData.dailyExpenseRate`; de effective maandwaarde dient alleen nog
  // als terugval voor gebruikers zónder transacties in het venster.
  const { dailyRate: canonicalDailyExpenseRate } = recentDailyExpenseRateFromRows(
    aggToExpenseRows(txAgg12, { realOnly: false }),
    now,
    monthlyExpenses,
  )

  return {
    budgetTotals: { expense: budgetTotals.expense },
    monthSummary: { budgetScore: deriveBudgetScore(budgetTotals) },
    budgetingActive: resolveBudgetingActive(profile),
    currentMonthIncome,
    currentMonthExpenses,
    monthlyIncome,
    monthlyExpenses,
    dailyExpenseRate: canonicalDailyExpenseRate,
  }
})

/**
 * Precies wat `CashflowSection` uit de bundel leest — niets meer.
 *
 * Bewust een APART type naast `CashflowCardScalars`: dat type dient de vier
 * hefboom-kaarten en moet smal blijven. `DashboardData` is hier structureel aan
 * toewijsbaar, dus een caller die de volle bundel doorgeeft blijft compileren.
 */
export interface CashflowSectionScalars {
  /** EFFECTIVE maandinkomen (`income_source='manual'` wint) — ADR 0073. */
  monthlyIncome: number
  /** EFFECTIVE maanduitgaven (`expenses_source='manual'` wint) — ADR 0073. */
  monthlyExpenses: number
  /** Canonieke 6-maands spaarquote (%), afgerond op één decimaal. */
  savingsRate6m: number
  /** Spaarquote per snapshot-maand (uit `net_worth_snapshots.savings_rate`). */
  savingsHistory: MonthValue[]
  /** Uitgaven per maand uit het 12-maands maandaggregaat. */
  expenseHistory: MonthValue[]
}

/**
 * De vijf velden die `CashflowSection` (/overzicht/cashflow/forecast) nodig heeft,
 * uit ACHT gedeelde fetches — zonder de rest van `loadDashboardData` (~40 queries
 * in 5-6 seriële golven plus een koude horizon-tak met bisectie-solve).
 *
 * ── WAAROM APART VAN `loadCashflowKpis` ────────────────────────────────────
 * De vier extra fetches (schulden, bezittingen, vroegste-inkomsten-datum,
 * snapshots) hangen UITSLUITEND aan `savingsRate6m` en `savingsHistory`. Ze in
 * `loadCashflowKpis` schuiven zou de hub en de vaste-lasten-pagina — die alleen
 * de zeven kaart-scalars lezen — vier queries duurder maken voor niets. Alle acht
 * fetches zijn `cache()`-gedeeld, dus op een request waar beide loaders draaien
 * overlappen ze volledig.
 *
 * ── HERKOMST PER VELD (consume, don't recompute) ───────────────────────────
 *  · `monthlyIncome`/`monthlyExpenses` — EFFECTIVE grondslag, exact zoals
 *    `loadCashflowKpis` 'm afleidt (rauwe maand-pass → `resolveEffective…`).
 *  · `savingsRate6m` — `resolveSavingsRate6m`: de canonieke keten
 *    (`computeSavingsRate6m` + profiel-fallback + net-vermogen-delta-tak),
 *    afgerond op één decimaal zoals de bundel dat doet. Dit is HETZELFDE getal als
 *    op /overzicht en in het instellingenblok; wijkt het af, dan toont de app twee
 *    spaarquotes.
 *  · `savingsHistory` — `net_worth_snapshots.savings_rate`, NIET de transactie-
 *    aggregaten (zie `deriveSavingsHistory`).
 *  · `expenseHistory` — het 12-maands maandaggregaat.
 *
 * ── WAT HIER BEWUST NIET GEBEURT ───────────────────────────────────────────
 * De EFFECTIEVE spaarquote (`resolveSavingsSource`, waar `expenses_source =
 * 'manual'` de transactiequote overrulet) is een ANDER getal dan `savingsRate6m`,
 * en de bundel houdt ze uit elkaar: de kaart toont de 6-maands transactiequote,
 * de gezondheidsscore oordeelt op de effectieve. Die splitsing verhuist hier niet
 * mee — `CashflowSection` las altijd al `savingsRate6m`.
 *
 * RLS: MOET met de anon/authenticated client worden aangeroepen — nooit met
 * getServiceClient(). Zie de koptekst van lib/server-data/base.ts.
 */
export const loadForecastSectionData = cache(async (supabase: SupabaseClient): Promise<CashflowSectionScalars> => {
  // `now` VÓÓR de fetches bemonsteren — zelfde reden als in `loadCashflowKpis`.
  const now = new Date()

  const [
    profileResult,
    budgetsResult,
    txResult,
    txAgg12Result,
    debtsResult,
    assetsResult,
    earliestIncomeResult,
    snapshotsResult,
  ] = await Promise.all([
    getOwnProfile(supabase),
    getBudgets(supabase),
    getCurrentMonthTx(supabase),
    getTxAgg12m(supabase),
    getActiveDebts(supabase),
    getActiveAssets(supabase),
    getEarliestIncomeDate(supabase),
    getNetWorthSnapshots12m(supabase),
  ])

  const profile = (profileResult.data ?? null) as (Record<string, unknown> & IncomeExpenseSources) | null
  const budgets = (budgetsResult.data ?? []) as unknown as BudgetRowForTotals[]
  const monthTx = (txResult.data ?? []) as unknown as MonthTxRow[]
  const txAgg12 = (txAgg12Result.data ?? []) as TxMonthAggregateRow[]
  const debts = (debtsResult.data ?? []) as unknown as Debt[]
  const assets = (assetsResult.data ?? []) as unknown as Asset[]
  const snapshots = (snapshotsResult.data ?? []) as unknown as NetWorthSnapshotRow[]

  // EFFECTIVE grondslag uit de rauwe maand-rijen (ADR 0073), met de
  // budgetgrondslag (ADR 0103) uit dezelfde gedeelde samenstelling.
  const forecastBudgetBasis = await loadBudgetBasis(supabase, profile, budgets as unknown as BudgetBasisRow[])
  const realMonth = deriveRealMonthTotals(monthTx)
  const { income: monthlyIncome, expenses: monthlyExpenses } =
    resolveEffectiveIncomeExpenses(profile ?? {}, realMonth.income, realMonth.expenses, {
      income: forecastBudgetBasis.income.monthlyTotal,
      expenses: forecastBudgetBasis.expenses.monthlyTotal,
    })

  // 6-maands sub-venster op het aggregaat, met de spaarbudget-correctie.
  const savingsBudgetIds = budgetIdsOfType(buildBudgetTypeMap(budgets), 'savings')
  const window6m = deriveSavingsRate6mWindow(now, txAgg12, savingsBudgetIds)

  const { savingsRate6m } = resolveSavingsRate6m({
    ...window6m,
    debtAflossing6m: computeDebtAflossingMonthly(debts) * 6,
    dataMonths: deriveDataMonths6(now, (earliestIncomeResult.data as { date?: string | null } | null)?.date),
    effectiveMonthlyIncome: monthlyIncome,
    effectiveMonthlyExpenses: monthlyExpenses,
    netWorthSnapshots: snapshots,
    assets,
  })

  return {
    monthlyIncome,
    monthlyExpenses,
    // Zelfde afronding als `DashboardData.savingsRate6m` — één decimaal.
    savingsRate6m: Math.round(savingsRate6m * 10) / 10,
    savingsHistory: deriveSavingsHistory(snapshots),
    expenseHistory: deriveExpenseHistory(txAgg12),
  }
})

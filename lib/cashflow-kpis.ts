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
// HET BESLUIT: EXTRAHEREN, NIET HERBEREKENEN (ADR 0077)
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
// DEZE STAP is de extractie zelf: de helpers hieronder zijn puur en
// DB-onafhankelijk, en `lib/dashboard-data-loader.ts` consumeert ze al. De
// `loadCashflowKpis`-fetcher die erop staat volgt als aparte stap, zodat de
// refactor los terug te draaien is.

import { isRealAggRow } from '@/lib/server-data/tx-aggregates'
import { localMonthBounds } from '@/lib/month-range'

// ── Invoervormen ────────────────────────────────────────────────────────────

/** De budget-kolommen die de oprol nodig heeft (subset van de `budgets`-rij). */
export interface BudgetRowForTotals {
  id: string
  parent_id: string | null
  budget_type: string
  default_limit: number | string | null
  interval: string | null
}

/** De transactie-kolommen die de huidige-maand-passes nodig hebben. */
export interface MonthTxRow {
  amount: number | string
  budget_id?: string | null
  transaction_type?: string | null
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
 * budget-oprol ook de spaar- en schuld-budget-ID-sets voedt. Die loader
 * consumeert deze functie nu, zodat er één definitie van "welk type is dit
 * budget" bestaat.
 */
export function buildBudgetTypeMap(budgets: BudgetRowForTotals[]): Map<string, string> {
  const parents = budgets.filter(b => b.parent_id === null)
  const children = budgets.filter(b => b.parent_id !== null)
  const budgetTypeMap = new Map<string, string>()
  for (const b of parents) budgetTypeMap.set(b.id, b.budget_type)
  for (const c of children) {
    const parentType = budgetTypeMap.get(c.parent_id ?? '')
    if (parentType) budgetTypeMap.set(c.id, parentType)
  }
  return budgetTypeMap
}

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
 * Inkomen + uitgaven (absoluut) uit de RAUWE transactierijen van een maand, met
 * de transfer-filter (`transfer`/`joint_transfer` tellen niet mee).
 *
 * Verplaatst uit `loadDashboardData` (was ~r488-495). Het predicaat is
 * `isRealAggRow` uit lib/server-data/tx-aggregates.ts — exact dezelfde
 * transfer-definitie als de `realOnly`-vlag op de aggregaat-reducers, zodat er
 * één plek is waar "wat telt als echte transactie" staat.
 *
 * Deze pass voedt UITSLUITEND de effective grondslag (zie `loadCashflowKpis`),
 * niet de `currentMonth*`-velden.
 */
export function deriveRealMonthTotals(rows: MonthTxRow[]): { income: number; expenses: number } {
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

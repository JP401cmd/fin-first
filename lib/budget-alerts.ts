/**
 * Budget alert threshold logic — shared between client components and server API routes.
 * This file has NO 'use client' directive so it can be imported anywhere.
 */

export type BudgetType = 'income' | 'expense' | 'savings' | 'debt'

/**
 * Check if a budget should trigger an alert.
 * For expenses: alert when spent >= threshold% of limit (spending too much)
 * For savings/debt: alert when spent < threshold% of limit (too little saved/repaid)
 * For income: never alert
 */
export function shouldAlert(spent: number, limit: number, threshold: number, budgetType: BudgetType = 'expense'): boolean {
  if (limit <= 0 || threshold <= 0) return false
  if (budgetType === 'income') return false

  const pct = (spent / limit) * 100

  if (budgetType === 'savings' || budgetType === 'debt') {
    // Alert when under target
    return pct < threshold
  }

  // Expense: alert when over threshold
  return pct >= threshold
}

/**
 * Cent-tolerantie voor de vergelijking besteed ↔ limiet.
 *
 * Beide kanten zijn euro-floats: `spent` is een som van transactiebedragen,
 * `limit` is een basislimiet plus een eventuele rollover. Een strikte `===`
 * zou daardoor op 1280.0000000000002 stuklopen terwijl de gebruiker "€1280 van
 * €1280" ziet. Een halve cent is de kleinste eenheid die er in euro's toe doet.
 */
const CENT_EPSILON = 0.005

/**
 * De drie toestanden van een uitgavenbudget ten opzichte van zijn limiet.
 *
 * - `onder`   — er is nog ruimte
 * - `bereikt` — besteed is (op de cent) gelijk aan de limiet: er is niets meer
 *               over, maar er is óók niets overschreden
 * - `over`    — er is méér uitgegeven dan de limiet toestaat
 */
export type BudgetLimitStatus = 'onder' | 'bereikt' | 'over'

/**
 * Canonieke drempelvergelijking voor "hoe staat dit budget ervoor".
 *
 * Waarom dit een gedeelde functie is en geen `>=`/`>` ter plekke: de app had
 * twee lezingen naast elkaar. Zeven oppervlakken gebruikten strikt
 * `spent > limit`, maar de meldingenroute (`pct >= 100`) en `budgets-client`
 * noemden exact-op-de-grens óók "overschreden". Omdat `lib/budget-plan-diff.ts`
 * de limiet van een vaste last per constructie gelijkzet aan de maandelijkse
 * afschrijving, raakt élke vaste last elke maand exact 100% — die maandelijkse
 * gezonde eindstand werd dus als rood alarm gemeld (bevinding H16).
 *
 * "Bereikt" is bewust een eigen toestand en geen randgeval van "over": de
 * gebruiker moet het verschil kunnen lezen tussen "precies op de grens" en
 * "eroverheen".
 */
export function budgetLimitStatus(spent: number, limit: number): BudgetLimitStatus {
  if (spent > limit + CENT_EPSILON) return 'over'
  if (spent >= limit - CENT_EPSILON) return 'bereikt'
  return 'onder'
}

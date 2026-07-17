/**
 * Budget rollover calculations.
 * Activates the rollover_type field on budgets:
 * - reset: carry = 0 each month
 * - carry-over: leftover rolls into next month
 * - invest-sweep: leftover goes to investment, carry = 0
 */

export type BudgetRollover = {
  id: string
  user_id: string
  budget_id: string
  period: string // 'YYYY-MM'
  carried_amount: number
  rollover_type: string
  created_at: string
}

/**
 * Compute rollover result for a budget period.
 * @param limit - base budget limit
 * @param spent - total spent in that period
 * @param previousCarry - carried amount from previous period
 * @param rolloverType - 'reset' | 'carry-over' | 'invest-sweep'
 */
export function computeRollover(
  limit: number,
  spent: number,
  previousCarry: number,
  rolloverType: string,
): { carry: number; swept: number } {
  const effectiveLimit = limit + previousCarry
  const remaining = Math.max(0, effectiveLimit - spent)

  switch (rolloverType) {
    case 'carry-over':
      return { carry: remaining, swept: 0 }
    case 'invest-sweep':
      return { carry: 0, swept: remaining }
    case 'reset':
    default:
      return { carry: 0, swept: 0 }
  }
}

/**
 * Get the effective budget limit for a given period (base + carry-over).
 */
export function getEffectiveLimit(
  defaultLimit: number,
  rollovers: BudgetRollover[],
  period: string,
): number {
  const rollover = rollovers.find((r) => r.period === period)
  return defaultLimit + (rollover ? Number(rollover.carried_amount) : 0)
}

/**
 * Get the carried amount for a specific period.
 */
export function getCarriedAmount(
  rollovers: BudgetRollover[],
  period: string,
): number {
  const rollover = rollovers.find((r) => r.period === period)
  return rollover ? Number(rollover.carried_amount) : 0
}

/** Een periode-specifieke limiet-override uit `budget_amounts`. */
export type BudgetAmountOverride = {
  budget_id: string
  effective_from: string // 'YYYY-MM-DD'
  amount: number
}

/**
 * Canonieke effectieve-limiet — de ENE bron van waarheid voor "wat is het
 * budget deze periode", die zowel de budgetten-pagina (`budgets-client`) als
 * het dashboard (`dashboard-data-loader` → heatmap-widget) consumeren, zodat
 * "beschikbaar" nooit tussen twee schermen uiteenloopt (consume, don't recompute).
 *
 * Samenstelling van de limiet:
 * - `base`   = meest recente periode-override uit `budget_amounts`
 *              (`effective_from <= displayDate`), of anders `defaultLimit`.
 * - single   = `(base + carry) * fraction` — `carry` = rollover-overschot dat
 *              vanuit de vorige periode is meegenomen (`carry-over`-budgetten).
 * - multi    = `base * monthCount * fraction` — over meerdere periodes telt een
 *              rollover niet mee (die geldt per maand).
 *
 * `shareFraction` is het pro-rata huishoud-aandeel waarmee een gedeeld budget
 * WORDT WEERGEGEVEN (1 = eigen budget / geen deling). Laat 'm op 1 wanneer de
 * bijbehorende besteding óók ongeschaald is (bv. de personal-perspective
 * dashboard-loader), anders lopen limiet en besteding uiteen.
 */
export function computeEffectiveLimit(params: {
  defaultLimit: number
  rollovers: BudgetRollover[]
  amountOverrides: BudgetAmountOverride[]
  period: string // 'YYYY-MM'
  displayDate: string // 'YYYY-MM-DD'
  periodMonthCount?: number
  shareFraction?: number
}): number {
  const {
    defaultLimit,
    rollovers,
    amountOverrides,
    period,
    displayDate,
    periodMonthCount = 1,
    shareFraction = 1,
  } = params

  const carry = getCarriedAmount(rollovers, period)

  const applicable = amountOverrides
    .filter((a) => a.effective_from <= displayDate)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
  const baseLimit = applicable.length > 0 ? Number(applicable[0].amount) : Number(defaultLimit)

  if (periodMonthCount > 1) {
    return baseLimit * periodMonthCount * shareFraction
  }

  return (baseLimit + carry) * shareFraction
}

/**
 * Format a period string from a Date.
 */
export function formatPeriod(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Get the previous period string.
 */
export function getPreviousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const date = new Date(y, m - 2, 1) // m-1 is current month (0-based), m-2 is previous
  return formatPeriod(date)
}

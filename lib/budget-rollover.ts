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

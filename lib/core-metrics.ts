/**
 * Shared FIRE calculation primitives.
 *
 * Single source of truth for fireTarget, freedomPercentage, freedomTime,
 * savingsRate, and effectiveExpenses.  Used by computeCoreData() (mock-data),
 * computeFireProjection() (horizon-data), and dashboard inline calculations.
 */

/** Determine effective yearly expenses: prefer must-expenses when available. */
export function computeEffectiveExpenses(
  yearlyMustExpenses: number,
  yearlyExpenses: number,
): number {
  return yearlyMustExpenses > 0 ? yearlyMustExpenses : yearlyExpenses
}

/** FIRE target = yearly expenses / SWR. */
export function computeFireTarget(
  effectiveYearlyExpenses: number,
  swr: number,
): number {
  return effectiveYearlyExpenses > 0 ? effectiveYearlyExpenses / swr : 0
}

/** Freedom percentage: progress toward FIRE (0–100). */
export function computeFreedomPercentage(
  netWorth: number,
  fireTarget: number,
): number {
  return fireTarget > 0
    ? Math.max(0, Math.min((netWorth / fireTarget) * 100, 100))
    : 0
}

/** Freedom time: how many years + months net worth covers expenses. */
export function computeFreedomTime(
  netWorth: number,
  effectiveYearlyExpenses: number,
): { years: number; months: number } {
  const totalMonths =
    effectiveYearlyExpenses > 0 ? (netWorth / effectiveYearlyExpenses) * 12 : 0
  const clamped = Math.max(0, totalMonths)
  return {
    years: Math.floor(clamped / 12),
    months: Math.floor(clamped % 12),
  }
}

/** Savings rate as percentage of income. */
export function computeSavingsRate(
  monthlyIncome: number,
  monthlyExpenses: number,
): number {
  if (monthlyIncome <= 0) return 0
  return ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100
}

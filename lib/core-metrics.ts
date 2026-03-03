/**
 * Core financial types and dashboard metric calculations.
 *
 * FinancialInput  — raw data from the database (assets, debts, income, expenses, etc.)
 * FinancialMetrics — computed values derived from FinancialInput (FIRE target, freedom %, etc.)
 *
 * SWR (Safe Withdrawal Rate): defaults to NL Box 3-corrected SWR (≈2.88%)
 * via resolveFireParams(). Callers can override with swrOverride parameter.
 *
 * FIRE target = yearly expenses / SWR
 * Freedom % = net worth / FIRE target
 * Freedom time = net worth / yearly expenses
 */

import { resolveFireParams } from '@/lib/fire-params'

// ── Input: raw financial data from DB ────────────────────────

export interface FinancialInput {
  // Shared (used by both core metrics and horizon projections)
  totalAssets: number
  totalDebts: number
  monthlyIncome: number
  monthlyExpenses: number
  yearlyMustExpenses: number

  // Horizon-specific
  monthlyContributions: number       // sum of asset monthly_contributions
  dateOfBirth: string | null         // ISO date or null
  expectedReturn?: number            // annual decimal, default 0.07

  // Core-specific
  last12MonthsIncome?: number        // actual 12-month income (more accurate than monthly×12)
}

// ── Output: computed metrics ─────────────────────────────────

export type FinancialMetrics = {
  // Freedom timeline
  freedomPercentage: number
  freedomYears: number
  freedomMonths: number
  netWorth: number
  fireTarget: number
  expectedFireDate: string
  yearsToFire: number
  monthsToFire: number

  // KPIs
  daysWonPerMonth: number
  savingsRate: number
  freeDaysPerYear: number
  autonomyScore: string

  // Derived/annualized values
  /**
   * Best estimate of annual income, preferring actual 12-month history.
   * = last12MonthsIncome ?? (monthlyIncome × 12)
   * Contrast with yearlyIncome (local var): simple extrapolation = monthlyIncome × 12.
   */
  estimatedYearlyIncome: number
  yearlyMustExpenses: number
  yearlyExpenses: number
}

export function computeCoreData(
  input: FinancialInput,
  swrOverride?: number,
): FinancialMetrics {
  const { monthlyIncome, monthlyExpenses, totalAssets, totalDebts, last12MonthsIncome, yearlyMustExpenses } = input
  const swr = swrOverride ?? resolveFireParams({}).effectiveSwr
  const yearlyIncome = monthlyIncome * 12
  const yearlyExpenses = monthlyExpenses * 12
  const effectiveYearlyExpenses = yearlyMustExpenses && yearlyMustExpenses > 0 ? yearlyMustExpenses : yearlyExpenses
  const monthlySavings = monthlyIncome - monthlyExpenses
  const netWorth = totalAssets - totalDebts

  // FIRE calculations
  const fireTarget = effectiveYearlyExpenses > 0 ? effectiveYearlyExpenses / swr : 0
  const freedomPercentage = fireTarget > 0 ? Math.max(Math.min((netWorth / fireTarget) * 100, 100), 0) : 0

  // Freedom time: how long could you live off net worth
  const freedomMonthsTotal = effectiveYearlyExpenses > 0 ? (netWorth / effectiveYearlyExpenses) * 12 : 0
  const freedomYears = Math.floor(freedomMonthsTotal / 12)
  const freedomMonths = Math.floor(freedomMonthsTotal % 12)

  // Savings rate
  const savingsRate = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0

  // Days won per month (how many days of expenses covered by monthly savings)
  // dailyExpense = all expenses / 365 (used for daysWonPerMonth: general savings impact)
  const dailyExpense = monthlyExpenses > 0 ? yearlyExpenses / 365 : 0
  const daysWonPerMonth = dailyExpense > 0 ? Math.round(monthlySavings / dailyExpense) : 0

  // Free days per year (passive income from net worth at SWR / daily must expenses)
  // dailyMustExpense = essential expenses only / 365 (used for FIRE freedom-day calculations)
  // Falls back to dailyExpense when no essential budget data is available.
  // See also: DailyExpenseProvider (dailyExpenseRate) — transaction-history-based daily rate.
  const dailyMustExpense = effectiveYearlyExpenses > 0 ? effectiveYearlyExpenses / 365 : dailyExpense
  const passiveIncome = netWorth * swr
  const freeDaysPerYear = dailyMustExpense > 0 ? Math.round(passiveIncome / dailyMustExpense) : 0

  // Expected FIRE date
  let yearsToFire = 0
  let monthsToFire = 0
  let expectedFireDate = ''
  if (monthlySavings > 0 && fireTarget > netWorth) {
    // Simple compound growth: assume 7% annual return on investments
    const annualReturn = 0.07
    const monthlyReturn = annualReturn / 12
    let projected = netWorth
    let months = 0
    while (projected < fireTarget && months < 600) {
      projected = projected * (1 + monthlyReturn) + monthlySavings
      months++
    }
    yearsToFire = Math.floor(months / 12)
    monthsToFire = months % 12

    const fireDate = new Date()
    fireDate.setMonth(fireDate.getMonth() + months)
    expectedFireDate = fireDate.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
  } else if (netWorth >= fireTarget && fireTarget > 0) {
    expectedFireDate = 'Bereikt!'
  }

  // Autonomy score (A-F based on freedom %)
  let autonomyScore: string
  if (freedomPercentage >= 100) autonomyScore = 'A+'
  else if (freedomPercentage >= 75) autonomyScore = 'A'
  else if (freedomPercentage >= 50) autonomyScore = 'B'
  else if (freedomPercentage >= 25) autonomyScore = 'C'
  else if (freedomPercentage >= 10) autonomyScore = 'D'
  else autonomyScore = 'E'

  return {
    freedomPercentage,
    freedomYears,
    freedomMonths,
    netWorth,
    fireTarget,
    expectedFireDate,
    yearsToFire,
    monthsToFire,
    daysWonPerMonth,
    savingsRate,
    freeDaysPerYear,
    autonomyScore,
    estimatedYearlyIncome: last12MonthsIncome ?? yearlyIncome,
    yearlyMustExpenses: yearlyMustExpenses ?? 0,
    yearlyExpenses,
  }
}

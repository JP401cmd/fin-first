/**
 * Core dashboard data calculation.
 * Computes freedom metrics from real financial data.
 *
 * SWR (Safe Withdrawal Rate): defaults to NL Box 3-corrected SWR (≈2.88%)
 * via resolveFireParams(). Callers can override with swrOverride parameter.
 *
 * FIRE target = yearly expenses / SWR
 * Freedom % = net worth / FIRE target
 * Freedom time = net worth / yearly expenses
 */

import { SWR, DEFAULT_RETURN } from '@/lib/constants'
import {
  computeEffectiveExpenses,
  computeFireTarget,
  computeFreedomPercentage,
  computeFreedomTime,
  computeSavingsRate,
} from '@/lib/core-metrics'
import { resolveFireParams } from '@/lib/fire-params'

export type CoreData = {
  // Freedom timeline
  freedomPercentage: number
  freedomYears: number
  freedomMonths: number
  netWorth: number
  fireTarget: number
  expectedFireDate: string
  yearsToFire: number
  monthsToFire: number

  // KPI's
  daysWonPerMonth: number
  savingsRate: number
  freeDaysPerYear: number
  autonomyScore: string

  // Kerngetallen
  /**
   * Best estimate of annual income, preferring actual 12-month history.
   * = last12MonthsIncome ?? (monthlyIncome × 12)
   * Contrast with yearlyIncome (local var): simple extrapolation = monthlyIncome × 12.
   */
  estimatedYearlyIncome: number
  yearlyMustExpenses: number
  yearlyExpenses: number
  monthlyIncome: number
  monthlyExpenses: number
  totalAssets: number
  totalDebts: number
}


export function computeCoreData(
  monthlyIncome: number,
  monthlyExpenses: number,
  totalAssets: number,
  totalDebts: number,
  last12MonthsIncome?: number,
  yearlyMustExpenses?: number,
  swrOverride?: number,
): CoreData {
  const swr = swrOverride ?? resolveFireParams({}).effectiveSwr
  const yearlyIncome = monthlyIncome * 12
  const yearlyExpenses = monthlyExpenses * 12
  const effectiveYearlyExpenses = computeEffectiveExpenses(yearlyMustExpenses ?? 0, yearlyExpenses)
  const monthlySavings = monthlyIncome - monthlyExpenses
  const netWorth = totalAssets - totalDebts

  // FIRE calculations (shared primitives from core-metrics.ts)
  const fireTarget = computeFireTarget(effectiveYearlyExpenses, swr)
  const freedomPercentage = computeFreedomPercentage(netWorth, fireTarget)
  const { years: freedomYears, months: freedomMonths } = computeFreedomTime(netWorth, effectiveYearlyExpenses)
  const savingsRate = computeSavingsRate(monthlyIncome, monthlyExpenses)

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
    const annualReturn = DEFAULT_RETURN
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
    monthlyIncome,
    monthlyExpenses,
    totalAssets,
    totalDebts,
  }
}

/**
 * Core financial types, shared FIRE calculation primitives,
 * and dashboard metric calculations.
 *
 * FinancialInput  — raw data from the database (assets, debts, income, expenses, etc.)
 * FinancialMetrics — computed values derived from FinancialInput (FIRE target, freedom %, etc.)
 *
 * Shared primitives (computeFireTarget, computeFreedomPercentage, etc.) are the
 * single source of truth — used by computeCoreData(), computeFireProjection(),
 * and dashboard inline calculations.
 *
 * SWR (Safe Withdrawal Rate): defaults to NL Box 3-corrected SWR (≈2.88%)
 * via resolveFireParams(). Callers can override with swrOverride parameter.
 */

import { DEFAULT_RETURN } from '@/lib/constants'
import { resolveFireParams } from '@/lib/fire-params'

// ── Shared FIRE calculation primitives ───────────────────────

/** Determine effective yearly expenses: prefer must-expenses when available. */
export function computeEffectiveExpenses(
  yearlyMustExpenses: number,
  yearlyExpenses: number,
): number {
  return yearlyMustExpenses > 0 ? yearlyMustExpenses : yearlyExpenses
}

/**
 * FIRE target = yearly expenses / SWR (perpetuele formule).
 *
 * Optioneel: bij deplete strategie wordt depleteFireTarget() gebruikt
 * als strategy en yearsInRetirement worden meegegeven.
 */
export function computeFireTarget(
  effectiveYearlyExpenses: number,
  swr: number,
  options?: {
    strategy?: 'perpetual' | 'legacy' | 'deplete' | 'pensioen'
    yearsInRetirement?: number
    realReturn?: number
  },
): number {
  if (effectiveYearlyExpenses <= 0) return 0

  if (options?.strategy === 'deplete' && options.yearsInRetirement && options.yearsInRetirement > 0) {
    const r = options.realReturn ?? swr
    return depleteFireTarget(effectiveYearlyExpenses, r, options.yearsInRetirement)
  }

  return effectiveYearlyExpenses / swr
}

/**
 * FIRE-target voor deplete strategie: contante waarde van een annuïteit.
 *
 * target = uitgaven × (1 − (1+r)^(−n)) / r
 *
 * Dit geeft het minimale vermogen dat nodig is om n jaar lang
 * de uitgaven te dekken met een reëel rendement van r per jaar,
 * waarna het vermogen ≈ €0 is.
 */
export function depleteFireTarget(
  yearlyExpenses: number,
  realReturn: number,
  yearsInRetirement: number,
): number {
  if (yearlyExpenses <= 0 || yearsInRetirement <= 0) return 0

  if (Math.abs(realReturn) < 1e-10) {
    // Zero return: simple multiplication
    return yearlyExpenses * yearsInRetirement
  }

  // PV annuity formula: PMT × (1 − (1+r)^(−n)) / r
  return yearlyExpenses * (1 - Math.pow(1 + realReturn, -yearsInRetirement)) / realReturn
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

/** Savings rate as percentage of income.
 *  savingsBudgetSpent: absolute amount spent on savings-type budgets (counted as saving, not expense). */
export function computeSavingsRate(
  monthlyIncome: number,
  monthlyExpenses: number,
  savingsBudgetSpent = 0,
): number {
  if (monthlyIncome <= 0) return 0
  return ((monthlyIncome - monthlyExpenses + savingsBudgetSpent) / monthlyIncome) * 100
}

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
  const effectiveYearlyExpenses = computeEffectiveExpenses(yearlyMustExpenses ?? 0, yearlyExpenses)
  const monthlySavings = monthlyIncome - monthlyExpenses
  const netWorth = totalAssets - totalDebts

  // FIRE calculations (shared primitives)
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
  }
}

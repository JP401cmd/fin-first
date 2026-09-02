/**
 * Horizon — LIVE scalar FIRE-helpers. Bewust hergebruikt door de horizon-kernel
 * (scalar-router) + snapshots/projections/withdrawal/dashboard-loader: leveren de
 * statische ratio-/weergavevelden en de nette degradatie zonder geboortedatum.
 * Afgesplitst van lib/horizon-data.ts (pure move, geen gedragswijziging).
 */
import type { FinancialInput } from '../core-metrics'
import type { FireEndStrategy } from '../fire-strategy'
import {
  computeEffectiveExpenses,
  computeFireTarget,
  computeFreedomPercentage,
  computeFreedomTime,
  computePassiveIncomeMonthly,
  computeSavingsRate,
} from '../core-metrics'
import { DEFAULT_RETURN, INFLATION, NL_SWR } from '../constants'
import { ageAtDate } from './fire-format'
import type { LifeEvent, LifeEventImpact } from './life-events-catalog'

export type FireMethod = 'nl'

export function getSwrForMethod(_method: FireMethod): number {
  return NL_SWR
}

export interface FireProjection {
  fireTarget: number
  netWorth: number
  freedomPercentage: number
  fireAge: number | null // null if no DOB
  currentAge: number | null
  fireDate: string // 'mrt 2038' or 'Bereikt!'
  countdownDays: number
  countdownYears: number
  countdownMonths: number
  freedomYears: number
  freedomMonths: number
  monthlyPassiveIncome: number
  monthlySavings: number
  savingsRate: number
  /**
   * Het bruto jaarrendement waarmee deze projectie is doorgerekend (bv. 0.07).
   * Canoniek doorgegeven zodat oppervlakken het scenario-rendement kunnen tonen
   * i.p.v. een hardcoded label — bij de band (`computeFireRange`) draagt elk
   * scenario zijn eigen offset-rendement (`base+0.02` / `base` / `base−0.03`).
   */
  annualReturn: number
}

export interface FireRange {
  optimistic: FireProjection
  expected: FireProjection
  pessimistic: FireProjection
}

// ── Core Computations ────────────────────────────────────────

/**
 * Compute FIRE projection from financial inputs.
 */
export function computeFireProjection(
  input: FinancialInput,
  annualReturn: number = DEFAULT_RETURN,
  swrOverride?: number,
  inflationOverride?: number,
  strategyOptions?: {
    strategy?: FireEndStrategy
    endAge?: number
  },
): FireProjection {
  const { totalAssets, totalDebts, monthlyIncome, monthlyExpenses, monthlyContributions, yearlyMustExpenses, dateOfBirth } = input
  const swr = swrOverride ?? NL_SWR
  const inflationRate = inflationOverride ?? INFLATION
  const netWorth = totalAssets - totalDebts
  const yearlyExpenses = monthlyExpenses * 12
  const effectiveYearlyExpenses = computeEffectiveExpenses(yearlyMustExpenses, yearlyExpenses)
  const currentAge = dateOfBirth ? ageAtDate(dateOfBirth) : null
  const realReturn = (1 + annualReturn) / (1 + inflationRate) - 1
  const yearsInRetirement = (strategyOptions?.strategy === 'deplete' && strategyOptions.endAge && currentAge != null)
    ? Math.max(1, strategyOptions.endAge - Math.round(currentAge))
    : undefined
  const fireTarget = computeFireTarget(effectiveYearlyExpenses, swr, {
    strategy: strategyOptions?.strategy,
    yearsInRetirement,
    realReturn,
  })
  const freedomPercentage = computeFreedomPercentage(netWorth, fireTarget)
  const monthlySavings = monthlyIncome - monthlyExpenses
  const savingsRate = computeSavingsRate(monthlyIncome, monthlyExpenses)
  const monthlyPassiveIncome = computePassiveIncomeMonthly(netWorth, swr)

  // Freedom time (shared primitives from core-metrics.ts)
  const { years: freedomYears, months: freedomMonths } = computeFreedomTime(netWorth, effectiveYearlyExpenses)

  // FIRE date calculation (inflation-adjusted real return)
  const monthlyReturn = realReturn / 12
  let projected = netWorth
  let months = 0
  let fireDate = ''
  let countdownDays = 0
  let countdownYears = 0
  let countdownMonths = 0
  let fireAge: number | null = null

  if (netWorth >= fireTarget && fireTarget > 0) {
    fireDate = 'Bereikt!'
    fireAge = currentAge
  } else if (monthlySavings > 0 && fireTarget > netWorth) {
    while (projected < fireTarget && months < 600) {
      projected = projected * (1 + monthlyReturn) + monthlySavings
      months++
    }
    if (months < 600) {
      const fd = new Date()
      fd.setMonth(fd.getMonth() + months)
      fireDate = fd.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
      countdownDays = Math.round(months * 30.44)
      countdownYears = Math.floor(months / 12)
      countdownMonths = months % 12

      if (currentAge !== null) {
        fireAge = currentAge + months / 12
      }
    } else {
      fireDate = 'Niet haalbaar'
    }
  } else if (fireTarget > 0) {
    fireDate = 'Niet haalbaar'
  }

  return {
    fireTarget,
    netWorth,
    freedomPercentage,
    fireAge,
    currentAge,
    fireDate,
    countdownDays,
    countdownYears,
    countdownMonths,
    freedomYears,
    freedomMonths,
    monthlyPassiveIncome,
    monthlySavings,
    savingsRate,
    annualReturn,
  }
}

// ── Countdown derived from simulation ────────────────────────

export interface FireCountdown {
  countdownYears: number
  countdownMonths: number
  countdownDays: number
  fireDate: string
}

/**
 * Derive countdown values from the simulation engine's fireAgeFractional.
 * This ensures consistency between the displayed FIRE age and the countdown.
 */
export function deriveCountdown(
  fireAgeFractional: number | null,
  currentAge: number | null,
): FireCountdown {
  if (fireAgeFractional == null || currentAge == null) {
    return { countdownYears: 0, countdownMonths: 0, countdownDays: 0, fireDate: 'Niet haalbaar' }
  }
  const yearsToFire = fireAgeFractional - currentAge
  if (yearsToFire <= 0) {
    return { countdownYears: 0, countdownMonths: 0, countdownDays: 0, fireDate: 'Bereikt!' }
  }
  const countdownYears = Math.floor(yearsToFire)
  const countdownMonths = Math.round((yearsToFire - countdownYears) * 12)
  const countdownDays = Math.round(yearsToFire * 365.25)
  const fd = new Date()
  fd.setMonth(fd.getMonth() + Math.round(yearsToFire * 12))
  const fireDate = fd.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
  return { countdownYears, countdownMonths, countdownDays, fireDate }
}

/**
 * Compute optimistic / expected / pessimistic FIRE projections.
 */
export function computeFireRange(
  input: FinancialInput,
  swrOverride?: number,
  inflationOverride?: number,
  baseReturn: number = DEFAULT_RETURN,
  strategyOptions?: {
    strategy?: FireEndStrategy
    endAge?: number
  },
): FireRange {
  return {
    optimistic: computeFireProjection(input, Math.min(0.20, baseReturn + 0.02), swrOverride, inflationOverride, strategyOptions),
    expected: computeFireProjection(input, baseReturn, swrOverride, inflationOverride, strategyOptions),
    pessimistic: computeFireProjection(input, Math.max(0.01, baseReturn - 0.03), swrOverride, inflationOverride, strategyOptions),
  }
}

/**
 * Compute the FIRE delay caused by a single life event.
 */
export function computeLifeEventImpact(
  input: FinancialInput,
  event: LifeEvent,
): LifeEventImpact {
  const baseProjection = computeFireProjection(input)
  const baseFire = baseProjection.countdownDays

  // Compute adjusted input
  const totalCost = Number(event.one_time_cost) +
    (Number(event.monthly_cost_change) * Number(event.duration_months))
  const totalIncomeChange = Number(event.monthly_income_change) * Number(event.duration_months)

  const adjustedInput: FinancialInput = {
    ...input,
    totalAssets: input.totalAssets - Number(event.one_time_cost),
    monthlyExpenses: input.monthlyExpenses + Number(event.monthly_cost_change),
    monthlyIncome: input.monthlyIncome + Number(event.monthly_income_change),
  }

  const adjustedProjection = computeFireProjection(adjustedInput)
  const adjustedFire = adjustedProjection.countdownDays

  const fireDelayMonths = Math.round((adjustedFire - baseFire) / 30.44)
  const dailyExpense = input.yearlyMustExpenses > 0
    ? input.yearlyMustExpenses / 365
    : (input.monthlyExpenses > 0 ? (input.monthlyExpenses * 12) / 365 : 0)
  const freedomDaysLost = dailyExpense > 0 ? Math.round(totalCost / dailyExpense) : 0

  return {
    event,
    fireDelayMonths: Math.max(0, fireDelayMonths),
    totalCost: totalCost - totalIncomeChange,
    freedomDaysLost: Math.max(0, freedomDaysLost),
  }
}

import type { FinancialInput } from '@/lib/horizon-data'
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'

/**
 * Apply what-if overrides to a financial input to produce adjusted values.
 * Pure function — no side effects, no DB access.
 *
 * Income changes flow 1:1 to savings (lifestyle stays fixed).
 * Savings-rate changes adjust expenses on the BASELINE income.
 * Extra contribution is additive on top of base monthly contributions.
 */
export function applyWhatIfOverrides(
  input: FinancialInput,
  overrides: WhatIfOverrides,
  baseline: WhatIfOverrides,
): { adjustedInput: FinancialInput; annualSavings: number } {
  const effectiveIncome = overrides.monthlyIncome * (overrides.workDaysPerWeek / 5)
  const baselineEffectiveIncome = baseline.monthlyIncome * (baseline.workDaysPerWeek / 5)

  // Savings-rate delta reduces expenses relative to baseline income (lifestyle change)
  const savingsRateExpenseDelta = baselineEffectiveIncome * ((overrides.savingsRate - baseline.savingsRate) / 100)
  const adjustedExpenses = Math.max(0, input.monthlyExpenses - savingsRateExpenseDelta)
  const adjustedContributions = input.monthlyContributions + overrides.extraContribution

  const adjustedInput: FinancialInput = {
    ...input,
    monthlyIncome: effectiveIncome,
    monthlyExpenses: adjustedExpenses,
    monthlyContributions: adjustedContributions,
    expectedReturn: overrides.expectedReturn / 100,
  }

  const baseAnnualSavings = (input.monthlyContributions ?? 0) * 12
  const incomeDelta = effectiveIncome - baselineEffectiveIncome
  const savingsRateDelta = baselineEffectiveIncome * ((overrides.savingsRate - baseline.savingsRate) / 100)
  const extraDelta = overrides.extraContribution ?? 0
  const annualSavings = Math.max(0, baseAnnualSavings + (incomeDelta + savingsRateDelta + extraDelta) * 12)

  return { adjustedInput, annualSavings }
}

/**
 * Build a baseline WhatIfOverrides snapshot from real financial data.
 * The baseline is the "reality" anchor that sliders are measured against.
 */
export function buildBaselineOverrides(
  input: FinancialInput,
  grossReturn: number,
): WhatIfOverrides {
  const savingsRate = input.monthlyIncome > 0
    ? Math.round(((input.monthlyIncome - input.monthlyExpenses) / input.monthlyIncome) * 100)
    : 0
  return {
    monthlyIncome: Math.round(input.monthlyIncome),
    workDaysPerWeek: 5,
    savingsRate: Math.max(0, Math.min(80, savingsRate)),
    expectedReturn: grossReturn * 100,
    extraContribution: 0,
  }
}

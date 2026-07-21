import type { FinancialInput } from '@/lib/horizon-data'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import type { UnifiedProjectionInput } from '@/lib/unified-projection'

/**
 * Apply what-if overrides to a financial input to produce adjusted values.
 * Pure function — no side effects, no DB access.
 *
 * Income changes flow 1:1 to savings (lifestyle stays fixed).
 * Savings-rate changes adjust expenses on the BASELINE income.
 * Extra contribution is additive on top of base monthly contributions.
 *
 * @deprecated Prefer applyWhatIfOverridesToUnified() for new code paths
 * that use the unified projection engine.
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
  const adjustedContributions = input.monthlyContributions + savingsRateExpenseDelta + overrides.extraContribution

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
 * Apply what-if slider overrides directly to a UnifiedProjectionInput.
 * Pure function — no side effects, no DB access.
 *
 * This is the preferred path after migrating to runUnifiedProjection.
 * It mutates the projection input fields that each slider controls:
 *
 * - **Income slider** → monthlyIncome, monthlySurplus, annualSavings
 * - **Work-days slider** → scales income (4/5 = 80% income)
 * - **Savings-rate slider** → adjusts yearlyExpenses (lifestyle change)
 * - **Return slider** → grossReturn
 * - **Extra contribution** → annualSavings, monthlySurplus
 */
export function applyWhatIfOverridesToUnified(
  base: UnifiedProjectionInput,
  overrides: WhatIfOverrides,
  baseline: WhatIfOverrides,
): UnifiedProjectionInput {
  const effectiveIncome = overrides.monthlyIncome * (overrides.workDaysPerWeek / 5)
  const baselineEffectiveIncome = baseline.monthlyIncome * (baseline.workDaysPerWeek / 5)

  // Income delta flows 1:1 to savings (lifestyle stays fixed)
  const incomeDelta = effectiveIncome - baselineEffectiveIncome

  // Savings-rate delta adjusts expenses on baseline income (lifestyle change)
  const savingsRateExpenseDelta = baselineEffectiveIncome * ((overrides.savingsRate - baseline.savingsRate) / 100)

  // Extra contribution is additive
  const extraContribution = overrides.extraContribution ?? 0

  // Compute adjusted annualSavings
  const baseAnnualSavings = base.annualSavings
  const annualSavings = Math.max(0, baseAnnualSavings + (incomeDelta + savingsRateExpenseDelta + extraContribution) * 12)

  // Compute adjusted monthlySurplus (used for per-asset distribution)
  const baseMonthlySurplus = base.monthlySurplus
  const monthlySurplus = Math.max(0, baseMonthlySurplus + incomeDelta + savingsRateExpenseDelta + extraContribution)

  // Compute adjusted yearlyExpenses (lifestyle change from savings-rate slider)
  const adjustedYearlyExpenses = Math.max(0, base.yearlyExpenses - savingsRateExpenseDelta * 12)

  // Return slider → grossReturn (overrides.expectedReturn is a percentage, e.g. 7 → 0.07)
  const grossReturn = overrides.expectedReturn / 100

  return {
    ...base,
    monthlyIncome: effectiveIncome,
    monthlySurplus,
    annualSavings,
    yearlyExpenses: adjustedYearlyExpenses,
    grossReturn,
  }
}

/**
 * Build a baseline WhatIfOverrides snapshot from real financial data.
 * The baseline is the "reality" anchor that sliders are measured against.
 *
 * Geef waar mogelijk de canonieke 6-maands spaarquote mee (savingsRate6m uit
 * de loaders — incl. spaarbudgetten + aflossing als vermogensopbouw): dan
 * start de slider op hetzelfde getal dat de gebruiker op de cashflow-pagina
 * als "jouw spaarquote" ziet. De maand-surplus-benadering is alleen nog de
 * fallback voor call-sites zonder loader-data.
 */
export function buildBaselineOverrides(
  input: FinancialInput,
  grossReturn: number,
  savingsRate6m?: number | null,
): WhatIfOverrides {
  const savingsRate = savingsRate6m != null && Number.isFinite(savingsRate6m)
    ? Math.round(savingsRate6m)
    : (input.monthlyIncome > 0
        ? Math.round(((input.monthlyIncome - input.monthlyExpenses) / input.monthlyIncome) * 100)
        : 0)
  return {
    monthlyIncome: Math.round(input.monthlyIncome),
    workDaysPerWeek: 5,
    savingsRate: Math.max(0, Math.min(80, savingsRate)),
    expectedReturn: grossReturn * 100,
    extraContribution: 0,
  }
}

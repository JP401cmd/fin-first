import type { FinancialInput } from '@/lib/horizon-data'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'

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

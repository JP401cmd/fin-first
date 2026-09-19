import type { FinancialInput } from '@/lib/horizon-data'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'

/**
 * Build a baseline WhatIfOverrides snapshot from real financial data.
 * The baseline is the "reality" anchor that sliders are measured against.
 *
 * Geef waar mogelijk DE spaarquote mee: de EFFECTIEVE, grondslag-geresolveerde
 * quote (`healthScoreInput.effectiveSavingsRatePct`, ADR 0121) — dan start de
 * slider op hetzelfde getal dat de gebruiker op /overzicht en de cashflow-kaart
 * als "jouw spaarquote" ziet. De parameter heette tot 19 sep 2026
 * `savingsRate6m` terwijl de enige aanroeper (horizon-client) er al de
 * effectieve quote in zette; de venster-naam beschreef een rauwe meting die
 * hier nooit meer binnenkwam (kaart "what-if-slider start op een andere
 * spaarquote-grondslag"). De maand-surplus-benadering is alleen nog de fallback
 * voor call-sites zonder loader-data.
 */
export function buildBaselineOverrides(
  input: FinancialInput,
  grossReturn: number,
  effectiveSavingsRatePct?: number | null,
): WhatIfOverrides {
  const savingsRate = effectiveSavingsRatePct != null && Number.isFinite(effectiveSavingsRatePct)
    ? Math.round(effectiveSavingsRatePct)
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

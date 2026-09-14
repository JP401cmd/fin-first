import { describe, it, expect } from 'vitest'
import type { FinancialInput } from '@/lib/horizon-data'
import { buildBaselineOverrides } from '@/lib/whatif-overrides'

/**
 * `buildBaselineOverrides` levert de nul-stand van het inline wat-als-lab op
 * /toekomst (KATERN II). Verhuisd uit de vervallen regressiesuite
 * `whatif-scenarios` (ADR 0144): de kwantisatie-guard hoort bij het lab dat
 * blijft, niet bij de pagina die verdween.
 */

const BASE_INPUT: FinancialInput = {
  totalAssets: 200_000, totalDebts: 0, monthlyIncome: 4_000,
  monthlyExpenses: 2_500, yearlyMustExpenses: 30_000, monthlyContributions: 1_500,
  dateOfBirth: '1991-03-18',
}

/**
 * Tolerantie voor `WhatIfOverrides.expectedReturn` (een percentage op schaal
 * 0–100, géén geldbedrag). ABSOLUUT gekozen: de enige verwachte afwijking is de
 * IEEE-754-representatie van de decimaal→procent-conversie in
 * buildBaselineOverrides (`grossReturn * 100`, ulp ≈ 1e-15 op deze schaal), en
 * een relatieve tolerantie zou degenereren bij een rendement van 0%. 1e-9 ligt
 * zes ordes boven die ruis en acht ordes ónder het kleinste verschil dat de UI
 * überhaupt toont (0,1 procentpunt, `toFixed(1)`) — een echte aannamewijziging
 * valt er dus nog steeds doorheen.
 */
const RETURN_PCT_EPSILON = 1e-9

describe('buildBaselineOverrides', () => {
  it('bouwt een correcte snapshot van de huidige data', () => {
    const b = buildBaselineOverrides(BASE_INPUT, 0.07)
    expect(b.monthlyIncome).toBe(4000)
    expect(b.workDaysPerWeek).toBe(5)
    // buildBaselineOverrides doet één legitieme conversie: `grossReturn * 100`.
    // In IEEE-754 is 0.07 * 100 === 7.000000000000001, dus een strikte
    // gelijkheid faalt hier op representatie, niet op gedrag. Bewust GEEN
    // afronding in de motor: de baseline-waarde stroomt als
    // `overrides.expectedReturn / 100` terug de projectie in, en die op een
    // 0,1%-raster kwantiseren zou het wat-als-scenario laten afwijken van de
    // hoofdprojectie voor iedere gebruiker met een rendement dat geen ronde
    // tiende is (bv. 6,85%).
    expect(Math.abs(b.expectedReturn - 7)).toBeLessThanOrEqual(RETURN_PCT_EPSILON)
    expect(b.extraContribution).toBe(0)
    expect(b.savingsRate).toBeGreaterThanOrEqual(0)
  })

  it('kwantiseert het rendement niet op een 0,1%-raster', () => {
    const b = buildBaselineOverrides(BASE_INPUT, 0.0685)
    expect(Math.abs(b.expectedReturn - 6.85)).toBeLessThanOrEqual(RETURN_PCT_EPSILON)
  })
})

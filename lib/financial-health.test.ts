import { describe, it, expect } from 'vitest'
import {
  computeHealthScoreFromInputs,
  type HealthScoreInput,
} from '@/lib/financial-health'

/**
 * Test-suite voor de 7-pillar HealthScore met focus op de nieuwe
 * tax_optimization-pillar. Gebruikt computeHealthScoreFromInputs
 * (lightweight server-side variant) zodat we niet de hele
 * DashboardData-bundle hoeven te mocken.
 */

const baseInput: HealthScoreInput = {
  savingsRate6m: 20,
  totalAssets: 100_000,
  totalDebts: 20_000,
  emergencyFundMonths: 3,
  freedomPct: 25,
  assetTypeCount: 3,
  budgetCategories: [
    { limit: 1500, spent: 1400 },
    { limit: 500, spent: 450 },
  ],
}

describe('computeHealthScoreFromInputs — 7-pillar', () => {
  it('returnert 7 pillars wanneer alle modules actief', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    expect(score.pillars).toHaveLength(7)
    expect(score.pillars.map((p) => p.id)).toContain('tax_optimization')
  })

  it('total-score is een gewogen gemiddelde tussen 0 en 100', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    expect(score.total).toBeGreaterThanOrEqual(0)
    expect(score.total).toBeLessThanOrEqual(100)
  })

  it('weights sommeren tot ~1.0 over alle actieve pillars', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    const totalWeight = score.pillars.reduce((s, p) => s + p.weight, 0)
    expect(totalWeight).toBeCloseTo(1.0, 5)
  })

  it('budget_discipline weglaten geeft 6 pillars met herverdeelde weights', () => {
    const score = computeHealthScoreFromInputs(baseInput, false)
    expect(score.pillars).toHaveLength(6)
    expect(score.pillars.map((p) => p.id)).not.toContain('budget_discipline')
    const totalWeight = score.pillars.reduce((s, p) => s + p.weight, 0)
    expect(totalWeight).toBeCloseTo(1.0, 5)
  })
})

describe('tax_optimization pillar', () => {
  it('geeft neutrale score 50 wanneer geen taxData', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    const tax = score.pillars.find((p) => p.id === 'tax_optimization')
    expect(tax?.score).toBe(50)
    expect(tax?.rawValue).toBe('Geen Box 3')
  })

  it('geeft neutrale score 50 wanneer Box 3-bezit < €1.000', () => {
    const input: HealthScoreInput = {
      ...baseInput,
      taxData: {
        box3Bezittingen: 500,
        box3Tax: 0,
        heffingsvrijVermogen: 57_000,
        rendementsgrondslag: 0,
      },
    }
    const score = computeHealthScoreFromInputs(input, true)
    const tax = score.pillars.find((p) => p.id === 'tax_optimization')
    expect(tax?.score).toBe(50)
  })

  it('geeft hoge score (~100) bij volledige vrijstellingsbenutting + lage tax-drag', () => {
    const input: HealthScoreInput = {
      ...baseInput,
      taxData: {
        box3Bezittingen: 57_000,        // = heffingsvrij, 100% benut
        box3Tax: 0,                      // 0% drag
        heffingsvrijVermogen: 57_000,
        rendementsgrondslag: 57_000,    // capped op vrijstelling
      },
    }
    const score = computeHealthScoreFromInputs(input, true)
    const tax = score.pillars.find((p) => p.id === 'tax_optimization')
    expect(tax?.score).toBeGreaterThanOrEqual(90)
    expect(tax?.rawValue).toContain('€0/jaar')
  })

  it('hoge tax-drag (>2%) drukt score onder optimaal', () => {
    // 3% drag → dragScore=0. vrijstellingPct=43k/57k=0.754 → ~94pt.
    // Allocatie-hygiene placeholder=100. Totaal: 94*0.4 + 0*0.4 + 100*0.2 = ~58.
    const input: HealthScoreInput = {
      ...baseInput,
      taxData: {
        box3Bezittingen: 100_000,
        box3Tax: 3_000,
        heffingsvrijVermogen: 57_000,
        rendementsgrondslag: 43_000,
      },
    }
    const score = computeHealthScoreFromInputs(input, true)
    const tax = score.pillars.find((p) => p.id === 'tax_optimization')
    expect(tax?.score).toBeLessThan(80) // duidelijk lager dan perfect (>=90)
    expect(tax?.score).toBeGreaterThan(30) // niet kritiek dankzij vrijstellings-credit
  })

  it('improvementTip geeft contextuele suggestie op basis van data', () => {
    const noData = computeHealthScoreFromInputs(baseInput, true)
    const tipNoData = noData.pillars.find((p) => p.id === 'tax_optimization')?.improvementTip
    expect(tipNoData).toContain('Voeg Box 3-data toe')

    const withData: HealthScoreInput = {
      ...baseInput,
      taxData: {
        box3Bezittingen: 100_000,
        box3Tax: 3_000,
        heffingsvrijVermogen: 57_000,
        rendementsgrondslag: 43_000,
      },
    }
    const scoreWithData = computeHealthScoreFromInputs(withData, true)
    const tipWithData = scoreWithData.pillars.find((p) => p.id === 'tax_optimization')?.improvementTip
    expect(tipWithData).not.toContain('Voeg Box 3-data toe')
  })

  it('actionHref wijst naar /overzicht/belasting', () => {
    const score = computeHealthScoreFromInputs(baseInput, true)
    const tax = score.pillars.find((p) => p.id === 'tax_optimization')
    expect(tax?.actionHref).toBe('/overzicht/belasting')
  })
})

describe('label-band', () => {
  it('uitstekend wanneer total >= 80', () => {
    const highInput: HealthScoreInput = {
      savingsRate6m: 30,
      totalAssets: 500_000,
      totalDebts: 0,
      emergencyFundMonths: 6,
      freedomPct: 90,
      assetTypeCount: 4,
      budgetCategories: [{ limit: 1000, spent: 800 }],
      taxData: {
        box3Bezittingen: 57_000,
        box3Tax: 0,
        heffingsvrijVermogen: 57_000,
        rendementsgrondslag: 57_000,
      },
    }
    const score = computeHealthScoreFromInputs(highInput, true)
    expect(score.total).toBeGreaterThanOrEqual(80)
    expect(score.label).toBe('Uitstekend')
  })

  it('kritiek wanneer total < 20', () => {
    const lowInput: HealthScoreInput = {
      savingsRate6m: 0,
      totalAssets: 1_000,
      totalDebts: 50_000,
      emergencyFundMonths: 0,
      freedomPct: 0,
      assetTypeCount: 1,
      budgetCategories: [{ limit: 100, spent: 500 }],
    }
    const score = computeHealthScoreFromInputs(lowInput, true)
    expect(score.total).toBeLessThan(20)
    expect(score.label).toBe('Kritiek')
  })
})

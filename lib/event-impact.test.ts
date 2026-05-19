import { describe, it, expect } from 'vitest'
import { computeEventImpact } from './event-impact'

/**
 * Tests voor computeEventImpact — pure functie, geen React-deps.
 */

const baseEvent = {
  one_time_cost: 0,
  monthly_cost_change: 0,
  monthly_income_change: 0,
  duration_months: 0,
}

describe('computeEventImpact — basis', () => {
  it('returnt "Impact onbekend" bij annualSavings = 0', () => {
    const result = computeEventImpact({ ...baseEvent, one_time_cost: 5000 }, 0)
    expect(result.displayLabel).toBe('Impact onbekend')
    expect(result.tone).toBe('neutral')
  })

  it('returnt "Geen impact" bij netCost ≈ 0', () => {
    const result = computeEventImpact(baseEvent, 12000)
    expect(result.displayLabel).toBe('Geen impact')
    expect(result.tone).toBe('neutral')
  })
})

describe('computeEventImpact — kosten (positieve impact)', () => {
  it('eenmalige €12.000 op €12k/jaar = +1.0 jaar vrijheid', () => {
    const result = computeEventImpact(
      { ...baseEvent, one_time_cost: 12000 },
      12000,
    )
    expect(result.yearsImpact).toBeCloseTo(1.0)
    expect(result.tone).toBe('cost')
    expect(result.displayLabel).toMatch(/\+1\.0 jaar/)
  })

  it('€6.000 eenmalig op €12k/jaar = +6 mnd', () => {
    const result = computeEventImpact(
      { ...baseEvent, one_time_cost: 6000 },
      12000,
    )
    expect(result.displayLabel).toBe('+6 mnd vrijheid')
    expect(result.tone).toBe('cost')
  })

  it('monthly_cost_change × duration werkt cumulatief', () => {
    // €350/mnd × 18 jaar (216 mnd) = €75600 / €12000 = 6.3 jaar
    const result = computeEventImpact(
      { ...baseEvent, monthly_cost_change: 350, duration_months: 216 },
      12000,
    )
    expect(result.yearsImpact).toBeCloseTo(6.3, 1)
    expect(result.tone).toBe('cost')
  })
})

describe('computeEventImpact — opbrengsten (negatieve impact)', () => {
  it('erfenis €50.000 op €12k/jaar = −4.2 jaar vrijheid', () => {
    const result = computeEventImpact(
      { ...baseEvent, one_time_cost: -50000 },
      12000,
    )
    expect(result.yearsImpact).toBeCloseTo(-4.2, 1)
    expect(result.tone).toBe('gain')
    expect(result.displayLabel).toMatch(/−4\.2 jaar/)
  })

  it('positieve monthly_income_change verlaagt netCost', () => {
    // +€500/mnd × 12 mnd = +6000 inkomen
    const result = computeEventImpact(
      { ...baseEvent, monthly_income_change: 500, duration_months: 12 },
      12000,
    )
    expect(result.yearsImpact).toBeCloseTo(-0.5)
    expect(result.tone).toBe('gain')
  })
})

describe('computeEventImpact — permanent (duration=0)', () => {
  it('gebruikt 60-maanden proxy voor permanente delta', () => {
    // monthly_income_change=-700 (deeltijd 4d), duration=0
    // 60 mnd × -(-700) = 42000 / 12000 = 3.5 jaar later vrij
    const result = computeEventImpact(
      { ...baseEvent, monthly_income_change: -700, duration_months: 0 },
      12000,
    )
    expect(result.yearsImpact).toBeCloseTo(3.5)
    expect(result.tone).toBe('cost')
  })
})

describe('computeEventImpact — combinaties', () => {
  it('huis-kopen: €30k aankoop + permanent maandlast', () => {
    // one_time 30k + monthly 0 + duration 0
    const result = computeEventImpact(
      { ...baseEvent, one_time_cost: 30000 },
      15000,
    )
    expect(result.yearsImpact).toBeCloseTo(2.0)
    expect(result.tone).toBe('cost')
  })

  it('tweede kind: €5k start + €350/mnd × 216 mnd', () => {
    const result = computeEventImpact(
      {
        ...baseEvent,
        one_time_cost: 5000,
        monthly_cost_change: 350,
        duration_months: 216,
      },
      20000,
    )
    // 5000 + 350×216 = 80600 / 20000 = 4.03 jaar
    expect(result.yearsImpact).toBeCloseTo(4.0, 1)
    expect(result.tone).toBe('cost')
  })
})

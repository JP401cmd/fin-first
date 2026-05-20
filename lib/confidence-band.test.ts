import { describe, it, expect } from 'vitest'
import { computeConfidenceBand, DEFAULT_VOLATILITY } from './confidence-band'

const SIM_ROWS = [
  { age: 35, endPortfolio: 100_000 },
  { age: 36, endPortfolio: 110_000 },
  { age: 37, endPortfolio: 121_000 },
  { age: 50, endPortfolio: 500_000 },
]

describe('computeConfidenceBand — basis', () => {
  it('returnt lege array bij lege input', () => {
    expect(computeConfidenceBand([])).toEqual([])
  })

  it('eerste jaar heeft spread = 0 (P10 = P50 = P90)', () => {
    const result = computeConfidenceBand(SIM_ROWS)
    expect(result[0]?.p10).toBe(100_000)
    expect(result[0]?.p50).toBe(100_000)
    expect(result[0]?.p90).toBe(100_000)
  })

  it('P50 = endPortfolio uit simRows', () => {
    const result = computeConfidenceBand(SIM_ROWS)
    expect(result[1]?.p50).toBe(110_000)
    expect(result[3]?.p50).toBe(500_000)
  })

  it('spread groeit met sqrt(jaren_vooruit)', () => {
    const result = computeConfidenceBand(SIM_ROWS)
    // year 1: sigma×√1 = 0.15
    // year 3: sigma×√3 ≈ 0.26
    // P90 jaar 3 > P90 jaar 1 in relatieve termen
    const year1Spread = (result[1]!.p90 - result[1]!.p50) / result[1]!.p50
    const year3Spread = (result[3]!.p90 - result[3]!.p50) / result[3]!.p50
    expect(year3Spread).toBeGreaterThan(year1Spread)
  })

  it('P10 niet negatief (clamp op 0)', () => {
    // Verzin extreem hoog jaar zodat factor > 1 zou worden
    const longHorizon = Array.from({ length: 100 }, (_, i) => ({
      age: 35 + i,
      endPortfolio: 100_000,
    }))
    const result = computeConfidenceBand(longHorizon, 0.5) // hoge sigma
    for (const p of result) {
      expect(p.p10).toBeGreaterThanOrEqual(0)
    }
  })

  it('P90 > P50 > P10 op alle non-eerste jaren', () => {
    const result = computeConfidenceBand(SIM_ROWS)
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.p90).toBeGreaterThan(result[i]!.p50)
      expect(result[i]!.p50).toBeGreaterThan(result[i]!.p10)
    }
  })

  it('default sigma = 0.15', () => {
    expect(DEFAULT_VOLATILITY).toBe(0.15)
  })

  it('lagere sigma → smallere band', () => {
    const normal = computeConfidenceBand(SIM_ROWS, 0.15)
    const low = computeConfidenceBand(SIM_ROWS, 0.05)
    // Lager sigma → kleiner verschil tussen P10 en P90
    const normalSpread = normal[3]!.p90 - normal[3]!.p10
    const lowSpread = low[3]!.p90 - low[3]!.p10
    expect(lowSpread).toBeLessThan(normalSpread)
  })
})

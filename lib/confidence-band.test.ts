import { describe, it, expect } from 'vitest'
import {
  computeConfidenceBand,
  DEFAULT_VOLATILITY,
  Z_SCORE_P40_P60,
  Z_SCORE_P10_P90,
} from './confidence-band'

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

  it('eerste jaar heeft spread = 0 (low = mid = high)', () => {
    const result = computeConfidenceBand(SIM_ROWS)
    expect(result[0]?.low).toBe(100_000)
    expect(result[0]?.mid).toBe(100_000)
    expect(result[0]?.high).toBe(100_000)
  })

  it('mid = endPortfolio uit simRows', () => {
    const result = computeConfidenceBand(SIM_ROWS)
    expect(result[1]?.mid).toBe(110_000)
    expect(result[3]?.mid).toBe(500_000)
  })

  it('spread groeit met sqrt(jaren_vooruit)', () => {
    const result = computeConfidenceBand(SIM_ROWS)
    // year 1: sigma×√1 = 0.15
    // year 3: sigma×√3 ≈ 0.26
    // high jaar 3 > high jaar 1 in relatieve termen
    const year1Spread = (result[1]!.high - result[1]!.mid) / result[1]!.mid
    const year3Spread = (result[3]!.high - result[3]!.mid) / result[3]!.mid
    expect(year3Spread).toBeGreaterThan(year1Spread)
  })

  // B-053 (19 sep 2026): geen klem op nul — de band volgt het teken van de lijn.
  it('negatieve lijn (tekort-lening) ⇒ band rond de negatieve waarde, low ≤ mid ≤ high', () => {
    const tekort = [
      { age: 60, endPortfolio: 20_000 },
      { age: 61, endPortfolio: -80_000 },
      { age: 62, endPortfolio: -170_000 },
    ]
    const result = computeConfidenceBand(tekort)
    // Jaar 1 en 2: mid negatief, band symmetrisch eromheen — niets blijft op 0 hangen.
    for (const p of result.slice(1)) {
      expect(p.mid).toBeLessThan(0)
      expect(p.low).toBeLessThan(p.mid)
      expect(p.high).toBeGreaterThan(p.mid)
      expect(p.high).toBeLessThan(0)
      expect(p.high - p.mid).toBeCloseTo(p.mid - p.low, 6)
    }
  })

  it('positieve lijn onder de default P40–P60 houdt over 65 jaar een positieve onderrand (factor < 1)', () => {
    const lang = Array.from({ length: 66 }, (_, i) => ({ age: 30 + i, endPortfolio: 100_000 }))
    const result = computeConfidenceBand(lang)
    for (const p of result) expect(p.low).toBeGreaterThan(0)
  })

  it('high > mid > low op alle non-eerste jaren', () => {
    const result = computeConfidenceBand(SIM_ROWS)
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.high).toBeGreaterThan(result[i]!.mid)
      expect(result[i]!.mid).toBeGreaterThan(result[i]!.low)
    }
  })

  it('default sigma = 0.15', () => {
    expect(DEFAULT_VOLATILITY).toBe(0.15)
  })

  it('lagere sigma → smallere band', () => {
    const normal = computeConfidenceBand(SIM_ROWS, 0.15)
    const low = computeConfidenceBand(SIM_ROWS, 0.05)
    // Lager sigma → kleiner verschil tussen low en high
    const normalSpread = normal[3]!.high - normal[3]!.low
    const lowSpread = low[3]!.high - low[3]!.low
    expect(lowSpread).toBeLessThan(normalSpread)
  })
})

describe('computeConfidenceBand — percentiel-keuze (z-score)', () => {
  it('default = P40–P60 (smalle kern-band)', () => {
    const defaultBand = computeConfidenceBand(SIM_ROWS)
    const explicit = computeConfidenceBand(SIM_ROWS, DEFAULT_VOLATILITY, Z_SCORE_P40_P60)
    expect(defaultBand).toEqual(explicit)
  })

  it('P40–P60 is smaller dan P10–P90 bij gelijke sigma', () => {
    const narrow = computeConfidenceBand(SIM_ROWS, 0.15, Z_SCORE_P40_P60)
    const wide = computeConfidenceBand(SIM_ROWS, 0.15, Z_SCORE_P10_P90)
    const narrowSpread = narrow[3]!.high - narrow[3]!.low
    const wideSpread = wide[3]!.high - wide[3]!.low
    expect(narrowSpread).toBeLessThan(wideSpread)
  })

  it('z-score-constanten kloppen met de normaalverdeling', () => {
    // 60e percentiel ≈ 0.2533, 90e percentiel ≈ 1.28
    expect(Z_SCORE_P40_P60).toBeCloseTo(0.2533, 3)
    expect(Z_SCORE_P10_P90).toBeCloseTo(1.28, 2)
  })
})

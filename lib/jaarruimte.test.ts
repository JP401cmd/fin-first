import { describe, it, expect } from 'vitest'
import {
  computeJaarruimte,
  JAARRUIMTE_FACTOR_A,
  JAARRUIMTE_FRANCHISE_2025,
  JAARRUIMTE_MAX_2025,
  JAARRUIMTE_FRANCHISE_2026,
  JAARRUIMTE_MAX_2026,
} from './jaarruimte'

describe('computeJaarruimte — basis', () => {
  it('returnt hasData=false bij grossYearlyIncome ≤ 0', () => {
    const result = computeJaarruimte(0)
    expect(result.hasData).toBe(false)
    expect(result.jaarruimte).toBe(0)
  })

  it('returnt jaarruimte=0 bij inkomen onder franchise (2026 default)', () => {
    const result = computeJaarruimte(JAARRUIMTE_FRANCHISE_2026 - 1000)
    expect(result.hasData).toBe(true)
    expect(result.jaarruimte).toBe(0)
  })

  it('default jaar = 2026', () => {
    const result = computeJaarruimte(50_000, 0)
    expect(result.year).toBe(2026)
    expect(result.franchise).toBe(JAARRUIMTE_FRANCHISE_2026)
    expect(result.max).toBe(JAARRUIMTE_MAX_2026)
  })
})

describe('computeJaarruimte — formule (default 2026)', () => {
  it('berekent (factor × (income − franchise)) bij modaal inkomen', () => {
    // €50.000 bruto, geen pensioen-aangroei, 2026-franchise €19.172
    const result = computeJaarruimte(50_000, 0)
    // grondslag = 50000 − 19172 = 30828
    // basis = 30828 × 0.133 = 4100.124 → afgerond 4100
    expect(result.jaarruimte).toBe(4100)
  })

  it('cap op MAX_JAARRUIMTE_2026 bij hoog inkomen', () => {
    const veryHighIncome = 1_000_000
    const result = computeJaarruimte(veryHighIncome, 0)
    expect(result.jaarruimte).toBe(JAARRUIMTE_MAX_2026)
  })

  it('aftrek pensioenAangroei verlaagt jaarruimte', () => {
    // €50.000 bruto, €2.000 pensioen-aangroei werkgever
    const result = computeJaarruimte(50_000, 2_000)
    // basis 4100.124 − 2000 = 2100.124 → afgerond 2100
    expect(result.jaarruimte).toBe(2100)
  })

  it('pensioenAangroei > basis returnt 0 (geen negatief)', () => {
    const result = computeJaarruimte(50_000, 10_000)
    expect(result.jaarruimte).toBe(0)
  })
})

describe('computeJaarruimte — expliciet jaar 2025 (achterwaarts compatibel)', () => {
  it('2025-franchise + cap toepasbaar via expliciet jaar-argument', () => {
    const result = computeJaarruimte(50_000, 0, 2025)
    // grondslag = 50000 − 17545 = 32455 × 0.133 = 4316.515 → 4317
    expect(result.jaarruimte).toBe(4317)
    expect(result.year).toBe(2025)
    expect(result.franchise).toBe(JAARRUIMTE_FRANCHISE_2025)
    expect(result.max).toBe(JAARRUIMTE_MAX_2025)
  })

  it('cap op MAX_JAARRUIMTE_2025 bij hoog inkomen (2025)', () => {
    const result = computeJaarruimte(1_000_000, 0, 2025)
    expect(result.jaarruimte).toBe(JAARRUIMTE_MAX_2025)
  })

  it('jaar als options-object', () => {
    const result = computeJaarruimte(50_000, 0, { year: 2025 })
    expect(result.year).toBe(2025)
    expect(result.jaarruimte).toBe(4317)
  })
})

describe('computeJaarruimte — edge-cases', () => {
  it('negatieve pensioenAangroei wordt gefilterd op 0', () => {
    const result = computeJaarruimte(50_000, -1_000)
    // Pretty robust: negatieve wordt 0, dus zelfde als zonder aangroei (2026)
    expect(result.jaarruimte).toBe(4100)
  })

  it('inkomen exact op franchise = 0 jaarruimte (2026)', () => {
    const result = computeJaarruimte(JAARRUIMTE_FRANCHISE_2026, 0)
    expect(result.jaarruimte).toBe(0)
  })
})

describe('computeJaarruimte — constants', () => {
  it('FACTOR_A is 13.3%', () => {
    expect(JAARRUIMTE_FACTOR_A).toBe(0.133)
  })
  it('FRANCHISE_2025 = €17.545', () => {
    expect(JAARRUIMTE_FRANCHISE_2025).toBe(17_545)
  })
  it('MAX_JAARRUIMTE_2025 = €34.310', () => {
    expect(JAARRUIMTE_MAX_2025).toBe(34_310)
  })
  it('FRANCHISE_2026 = €19.172', () => {
    expect(JAARRUIMTE_FRANCHISE_2026).toBe(19_172)
  })
  it('MAX_JAARRUIMTE_2026 = €35.589', () => {
    expect(JAARRUIMTE_MAX_2026).toBe(35_589)
  })
})

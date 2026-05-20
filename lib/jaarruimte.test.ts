import { describe, it, expect } from 'vitest'
import {
  computeJaarruimte,
  JAARRUIMTE_FACTOR_A,
  JAARRUIMTE_FRANCHISE_2025,
  JAARRUIMTE_MAX_2025,
} from './jaarruimte'

describe('computeJaarruimte — basis', () => {
  it('returnt hasData=false bij grossYearlyIncome ≤ 0', () => {
    const result = computeJaarruimte(0)
    expect(result.hasData).toBe(false)
    expect(result.jaarruimte).toBe(0)
  })

  it('returnt jaarruimte=0 bij inkomen onder franchise', () => {
    const result = computeJaarruimte(JAARRUIMTE_FRANCHISE_2025 - 1000)
    expect(result.hasData).toBe(true)
    expect(result.jaarruimte).toBe(0)
  })
})

describe('computeJaarruimte — formule', () => {
  it('berekent (factor × (income − franchise)) bij modaal inkomen', () => {
    // €50.000 bruto, geen pensioen-aangroei
    const result = computeJaarruimte(50_000, 0)
    // grondslag = 50000 − 17545 = 32455
    // basis = 32455 × 0.133 = 4316.515 → afgerond 4317
    expect(result.jaarruimte).toBe(4317)
  })

  it('cap op MAX_JAARRUIMTE bij hoog inkomen', () => {
    const veryHighIncome = 1_000_000
    const result = computeJaarruimte(veryHighIncome, 0)
    expect(result.jaarruimte).toBe(JAARRUIMTE_MAX_2025)
  })

  it('aftrek pensioenAangroei verlaagt jaarruimte', () => {
    // €50.000 bruto, €2.000 pensioen-aangroei werkgever
    const result = computeJaarruimte(50_000, 2_000)
    // basis 4316.515 − 2000 = 2316.515 → afgerond 2317
    expect(result.jaarruimte).toBe(2317)
  })

  it('pensioenAangroei > basis returnt 0 (geen negatief)', () => {
    const result = computeJaarruimte(50_000, 10_000)
    expect(result.jaarruimte).toBe(0)
  })
})

describe('computeJaarruimte — edge-cases', () => {
  it('negatieve pensioenAangroei wordt gefilterd op 0', () => {
    const result = computeJaarruimte(50_000, -1_000)
    // Pretty robust: negatieve wordt 0, dus zelfde als zonder aangroei
    expect(result.jaarruimte).toBe(4317)
  })

  it('inkomen exact op franchise = 0 jaarruimte', () => {
    const result = computeJaarruimte(JAARRUIMTE_FRANCHISE_2025, 0)
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
  it('MAX_JAARRUIMTE = €34.310', () => {
    expect(JAARRUIMTE_MAX_2025).toBe(34_310)
  })
})

import { describe, expect, it } from 'vitest'
import { resolveFireAssumptions, type FireAssumptionRow } from './fire-assumptions'
import { DEFAULT_RETURN, DEFAULT_VOLATILITY, INFLATION } from './constants'
import { CURRENT_TAX_YEAR } from './box3-data'

describe('resolveFireAssumptions', () => {
  it('valt terug op de TS-constanten bij een lege set rijen', () => {
    expect(resolveFireAssumptions([])).toEqual({
      expectedReturn: DEFAULT_RETURN,
      inflation: INFLATION,
      volatility: DEFAULT_VOLATILITY,
    })
  })

  it('valt terug op de TS-constanten bij null/undefined', () => {
    expect(resolveFireAssumptions(null)).toEqual({
      expectedReturn: DEFAULT_RETURN,
      inflation: INFLATION,
      volatility: DEFAULT_VOLATILITY,
    })
    expect(resolveFireAssumptions(undefined)).toEqual({
      expectedReturn: DEFAULT_RETURN,
      inflation: INFLATION,
      volatility: DEFAULT_VOLATILITY,
    })
  })

  it('valt terug op de TS-constanten wanneer het gevraagde jaar ontbreekt', () => {
    const rows: FireAssumptionRow[] = [
      { year: 2025, expected_return: 0.05, inflation: 0.03, volatility: 0.2 },
    ]
    expect(resolveFireAssumptions(rows, 2099)).toEqual({
      expectedReturn: DEFAULT_RETURN,
      inflation: INFLATION,
      volatility: DEFAULT_VOLATILITY,
    })
  })

  it('gebruikt de DB-jaarlaag wanneer aanwezig', () => {
    const rows: FireAssumptionRow[] = [
      { year: 2025, expected_return: 0.05, inflation: 0.03, volatility: 0.2 },
      { year: 2026, expected_return: 0.065, inflation: 0.025, volatility: 0.18 },
    ]
    expect(resolveFireAssumptions(rows, 2026)).toEqual({
      expectedReturn: 0.065,
      inflation: 0.025,
      volatility: 0.18,
    })
  })

  it('gebruikt standaard CURRENT_TAX_YEAR als jaar-argument', () => {
    const rows: FireAssumptionRow[] = [
      { year: CURRENT_TAX_YEAR, expected_return: 0.088, inflation: 0.011, volatility: 0.222 },
    ]
    expect(resolveFireAssumptions(rows)).toEqual({
      expectedReturn: 0.088,
      inflation: 0.011,
      volatility: 0.222,
    })
  })

  it('cast PostgREST-strings (numeric komt als string terug) naar getallen', () => {
    // numeric-kolommen arriveren bij PostgREST als JSON-string.
    const rows: FireAssumptionRow[] = [
      { year: 2026, expected_return: '0.07', inflation: '0.02', volatility: '0.15' },
    ]
    const out = resolveFireAssumptions(rows, 2026)
    expect(out.expectedReturn).toBe(0.07)
    expect(out.inflation).toBe(0.02)
    expect(out.volatility).toBe(0.15)
  })

  it('valt per veld terug op de constante bij een niet-eindige (corrupte) waarde', () => {
    const rows: FireAssumptionRow[] = [
      { year: 2026, expected_return: 0.09, inflation: 'nonsense', volatility: 0.1 },
    ]
    const out = resolveFireAssumptions(rows, 2026)
    expect(out.expectedReturn).toBe(0.09)
    expect(out.inflation).toBe(INFLATION) // corrupt → fallback
    expect(out.volatility).toBe(0.1)
  })
})

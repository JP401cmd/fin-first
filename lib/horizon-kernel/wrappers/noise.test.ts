import { describe, expect, it } from 'vitest'
import { normInv, potIdiosyncraticNoise, sharedMarketShock, sinHashUniform } from './noise'

/**
 * Unit-test van de deterministische MC-ruiskern (los van de projectie). Deze
 * grootheden zijn de crux van de Monte-Carlo-parity: als de sin-hash-constanten
 * of `NORM.INV` ongemerkt verschuiven, klappen de 1/0-slaagcriteria om. De
 * regressiewaarden hieronder zijn met deze exacte formules vastgelegd (en
 * kruisgecontroleerd tegen de bevroren fixture-reeksen in parity-mc).
 */

describe('normInv — inverse normale CDF (Excel NORM.INV)', () => {
  it('matcht bekende standaard-normale kwantielen', () => {
    expect(normInv(0.975)).toBeCloseTo(1.959964, 6)
    expect(normInv(0.5)).toBeCloseTo(0, 9)
    expect(normInv(0.0001)).toBeCloseTo(-3.719016, 5)
    expect(normInv(0.1)).toBeCloseTo(-1.281552, 6)
    expect(normInv(0.9999)).toBeCloseTo(3.719016, 5)
  })

  it('schaalt met gemiddelde en standaarddeviatie', () => {
    // NORM.INV(p, µ, σ) = µ + σ·NORM.INV(p,0,1).
    expect(normInv(0.975, 0, 0.15)).toBeCloseTo(0.15 * 1.959964, 6)
    expect(normInv(0.5, 2, 3)).toBeCloseTo(2, 9)
  })
})

describe('sinHashUniform — pseudo-uniform seeding', () => {
  it('ligt altijd in [0,0001; 0,9999)', () => {
    for (let i = 1; i <= 200; i++) {
      const u = sinHashUniform(i * 12.9898 + 3.1416)
      expect(u).toBeGreaterThanOrEqual(0.0001)
      expect(u).toBeLessThan(0.9999)
    }
  })

  it('is deterministisch (zelfde argument → zelfde uitkomst)', () => {
    expect(sinHashUniform(42)).toBe(sinHashUniform(42))
  })
})

describe('MC-ruis — gedeelde schok (MC!B10) & per-pot (MC!C12:L12)', () => {
  const sigma = 0.15 // MC!B3

  it('reproduceert de gedeelde marktschok per run (regressie)', () => {
    // Vastgelegd met SIN(i·12,9898 + 3,1416)·43758,5453 → NORM.INV(u, 0, 0,15).
    expect(sharedMarketShock(1, sigma)).toBeCloseTo(0.118469, 6)
    expect(sharedMarketShock(3, sigma)).toBeCloseTo(-0.059156, 6)
    expect(sharedMarketShock(7, sigma)).toBeCloseTo(-0.154886, 6)
    expect(sharedMarketShock(8, sigma)).toBeCloseTo(0.316583, 6)
  })

  it('reproduceert de per-pot idiosyncratische ruis (0,3·sigma, seed=slot+1)', () => {
    // Slot 0 → seed-offset 1 (MC!C11=1); slot 3 → seed-offset 4 (MC!F11=4).
    expect(potIdiosyncraticNoise(1, 0, sigma)).toBeCloseTo(0.103065, 6)
    expect(potIdiosyncraticNoise(1, 3, sigma)).toBeCloseTo(-0.017983, 6)
    expect(potIdiosyncraticNoise(2, 0, sigma)).toBeCloseTo(-0.003578, 6)
  })

  it('geeft verschillende potten verschillende ruis op dezelfde run', () => {
    expect(potIdiosyncraticNoise(5, 0, sigma)).not.toBe(potIdiosyncraticNoise(5, 1, sigma))
  })
})

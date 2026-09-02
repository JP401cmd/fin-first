import { describe, it, expect } from 'vitest'
import { computeDekkingsradar, type DekkingsradarInput } from './dekkingsradar'
import { DEFAULT_HOUSING_STRATEGY } from '@/lib/housing-strategy'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'

/**
 * ADR 0127 — de eindstrategie-as van de dekkingsradar deelt onder 'nu-stoppen' de
 * deplete-semantiek (doel €0 op de eigen eindleeftijd): eindvermogen ≥ 0 = gehaald.
 * Zonder deze tak viel 'nu-stoppen' in de behoud-tak en werd getoetst tegen een
 * FIRE-pot die er niet is.
 */

function rows(eindNetWorth: number): UnifiedProjectionRow[] {
  return [
    { age: 42, netWorth: 300_000, endPortfolio: 300_000, startPortfolio: 300_000, phase: 'withdrawal', debtBalances: {}, inflationFactor: 1 },
    { age: 90, netWorth: eindNetWorth, endPortfolio: eindNetWorth, startPortfolio: eindNetWorth, phase: 'withdrawal', debtBalances: {}, inflationFactor: 2.5 },
  ] as unknown as UnifiedProjectionRow[]
}

function input(endStrategy: DekkingsradarInput['endStrategy'], eind: number): DekkingsradarInput {
  return {
    rows: rows(eind),
    currentAge: 42,
    fireAgeFractional: 42,
    aowAgeFractional: 67,
    requiredFirePortfolio: 300_000,
    targetEndPortfolio: 0,
    endStrategy,
    housingStrategy: DEFAULT_HOUSING_STRATEGY,
    hasEigenHuis: false,
    kernelHousingSale: null,
    jaarBesteding: 30_000,
  }
}

const eindAs = (i: DekkingsradarInput) => computeDekkingsradar(i).find((a) => a.key === 'eindstrategie')!

describe("dekkingsradar — eindstrategie-as onder 'nu-stoppen'", () => {
  it('rekent als deplete: hetzelfde percentage, eigen duiding', () => {
    const nu = eindAs(input('nu-stoppen', 60_000))
    const dep = eindAs(input('deplete', 60_000))
    expect(nu.pct).toBe(dep.pct)
    expect(nu.pct).toBeGreaterThanOrEqual(100)
    expect(nu.detail).toMatch(/^Nu-stoppen:/)
    expect(dep.detail).toMatch(/^Opeten-strategie:/)
  })

  it('een tekort aan het eind scoort < 100, net als deplete', () => {
    const nu = eindAs(input('nu-stoppen', -60_000))
    expect(nu.pct).toBeLessThan(100)
    expect(nu.pct).toBe(eindAs(input('deplete', -60_000)).pct)
    expect(nu.detail).toMatch(/tekort/)
  })

  it('valt NIET in de behoud-tak (die toetst tegen de FIRE-pot)', () => {
    const nu = eindAs(input('nu-stoppen', 60_000))
    expect(nu.detail).not.toMatch(/Behoud-strategie/)
  })
})

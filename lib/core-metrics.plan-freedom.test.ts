import { describe, it, expect } from 'vitest'
import {
  computeFreedomPctForPlan,
  computeFreedomProgressWithBasis,
  computeRunwayCoveragePct,
  type FreedomProgressBasisInput,
} from './core-metrics'
import { eindMaandVan } from './horizon-kernel/gap'

/**
 * ADR 0129 B3/D5 (F3a) — `computeFreedomPctForPlan` is de ENE keuze tussen de twee
 * definities van het vrijheids-%: kapitaalratio onder `solved`, dekking onder een
 * vast anker. De drie loaders (dashboard/horizon/core) roepen 'm aan; hier staat de
 * semantiek vast zodat geen loader een eigen `if` hoeft te dragen.
 *
 * TOLERANTIE: absoluut (1e-9 pp) — het zijn identiteiten met de primitieven, geen
 * geschaalde vergelijkingen.
 */
const basis: FreedomProgressBasisInput = {
  homeExcludedFromFire: false,
  netWorthInclHome: 500_000,
  fireEligibleNetWorth: 500_000,
  requiredNetWorthInclHome: 1_000_000,
  requiredPortfolioExclHome: 1_000_000,
}

describe('computeFreedomPctForPlan', () => {
  it('solved ⇒ de kapitaalratio, ongeacht een meegegeven dekking', () => {
    const pct = computeFreedomPctForPlan({
      anchorFixed: false,
      coverage: { kernelDepletionMonth: 480, eindMaand: 576, ankerMaand: 300 },
      basis,
    })
    expect(pct).toBeCloseTo(computeFreedomProgressWithBasis(basis), 9)
    expect(pct).toBe(50)
  })

  it('vast anker ⇒ de dekking met het stopmoment als nulpunt (D5), NIET de kapitaalratio', () => {
    // Start 42, eind 90 ⇒ eindMaand 576; anker AOW op 67 ⇒ maand 300; uitputting maand 480.
    const eindMaand = eindMaandVan(90, 42)
    expect(eindMaand).toBe(576)
    const coverage = { kernelDepletionMonth: 480, eindMaand, ankerMaand: 300 }
    const pct = computeFreedomPctForPlan({ anchorFixed: true, coverage, basis })
    expect(pct).toBeCloseTo(computeRunwayCoveragePct(coverage), 9)
    expect(pct).toBeCloseTo(((480 - 300) / (576 - 300)) * 100, 9)
    // De kapitaalratio op dezelfde basis is 50 — een ander getal, bewust.
    expect(pct).not.toBeCloseTo(50, 3)
  })

  it('now-anker (ankerMaand 0) ⇒ letterlijk de ADR 0127-formule', () => {
    const pct = computeFreedomPctForPlan({
      anchorFixed: true,
      coverage: { kernelDepletionMonth: 288, eindMaand: 576, ankerMaand: 0 },
      basis,
    })
    expect(pct).toBe(50)
  })

  it('age-anker: uitputting vóór het stopmoment ⇒ 0 (het plan faalt al vóór je stopt)', () => {
    expect(
      computeFreedomPctForPlan({
        anchorFixed: true,
        coverage: { kernelDepletionMonth: 100, eindMaand: 576, ankerMaand: 192 },
        basis,
      }),
    ).toBe(0)
  })

  it('vast anker, gedekt tot het plan-einde ⇒ 100', () => {
    expect(
      computeFreedomPctForPlan({ anchorFixed: true, coverage: { kernelDepletionMonth: null, eindMaand: 576, ankerMaand: 300 }, basis }),
    ).toBe(100)
  })

  it('vast anker zonder kernel-run ⇒ 0 (onbekend), nooit stil de kapitaalratio', () => {
    expect(computeFreedomPctForPlan({ anchorFixed: true, coverage: null, basis })).toBe(0)
  })
})

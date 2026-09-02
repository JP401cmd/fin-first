import { describe, it, expect } from 'vitest'
import { computeFireTarget, computeRunwayCoveragePct } from './core-metrics'

/**
 * ADR 0127 D4/D5 — de scalar-kant van 'nu-stoppen'.
 *  D4  `computeFireTarget` levert GEEN doel (0): de kernel bisecteert op tijd; de
 *      scalar-formule mag 'nu-stoppen' niet stil als perpetual (uitgaven ÷ SWR) rekenen.
 *  D5  `computeRunwayCoveragePct` = min(100, uitputtingsmaand ÷ eindmaand × 100) —
 *      de vrijheidsvoortgang als TIJDSDEKKING, één home naast computeFreedomProgress.
 */

describe('computeFireTarget — nu-stoppen kent geen doel (D4)', () => {
  it('geeft 0 voor nu-stoppen, ook met positieve uitgaven', () => {
    expect(computeFireTarget(36_000, 0.04, { strategy: 'nu-stoppen' })).toBe(0)
  })

  it('de overige strategieën zijn ongewijzigd', () => {
    expect(computeFireTarget(36_000, 0.04, { strategy: 'perpetual' })).toBe(900_000)
    expect(computeFireTarget(36_000, 0.04, { strategy: 'pensioen' })).toBe(900_000)
    expect(computeFireTarget(36_000, 0.04)).toBe(900_000)
  })
})

describe('computeRunwayCoveragePct — tijdsdekking (D5)', () => {
  const eindMaand = 576 // 48 jaar × 12 (42 → 90)

  it('geld reikt tot de horizon (null) → 100', () => {
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: null, eindMaand })).toBe(100)
  })

  it('geld reikt voorbij de eindmaand → 100 (geclampt)', () => {
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 600, eindMaand })).toBe(100)
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 577, eindMaand })).toBe(100)
  })

  it('exact op de eindmaand → 100', () => {
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 576, eindMaand })).toBe(100)
  })

  it('deficit (maand 0) → 0', () => {
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 0, eindMaand })).toBe(0)
  })

  it('halverwege → 50', () => {
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 288, eindMaand })).toBe(50)
  })

  it('lineair: m ÷ eindmaand × 100', () => {
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 144, eindMaand })).toBeCloseTo(25, 10)
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 12, eindMaand })).toBeCloseTo((12 / 576) * 100, 10)
  })

  it('ongeldige eindmaand (≤ 0 of niet-finite) → 0, geen NaN', () => {
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 100, eindMaand: 0 })).toBe(0)
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: null, eindMaand: Number.NaN })).toBe(0)
  })

  it('waarom dit bestaat: de vulling-ratio zou onder nu-stoppen ~100 zijn voor iedereen', () => {
    // Bij FIRE-maand 0 is requiredPortfolio ≈ het huidige vermogen; de dekking
    // onderscheidt wél "twee jaar" van "tot je 90e".
    const kort = computeRunwayCoveragePct({ kernelDepletionMonth: 24, eindMaand })
    const lang = computeRunwayCoveragePct({ kernelDepletionMonth: null, eindMaand })
    expect(kort).toBeLessThan(5)
    expect(lang).toBe(100)
  })
})

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

  it('zonder ankerMaand is het gedrag letterlijk de ADR 0127-formule (default 0)', () => {
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 288, eindMaand, ankerMaand: 0 })).toBe(50)
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 288, eindMaand, ankerMaand: null })).toBe(50)
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

/**
 * ADR 0129 D5 — het STOPMOMENT als nulpunt. Onder een anker dat niet vandaag ligt
 * (AOW, of een zelfgekozen leeftijd) meet de dekking de periode NÁ het stopmoment;
 * de jaren dat je nog werkt tellen niet als "dekking".
 */
describe('computeRunwayCoveragePct — ankerMaand verschuift teller én noemer (D5)', () => {
  const eindMaand = 576 // 42 → 90
  const ankerMaand = 300 // stop op 67 (AOW) bij startleeftijd 42

  it('uitputting halverwege ná het stopmoment → 50 (niet 72, zoals zonder anker)', () => {
    const halverwege = ankerMaand + (eindMaand - ankerMaand) / 2 // 438
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: halverwege, eindMaand, ankerMaand })).toBe(50)
    // Zonder de anker-verschuiving zou dezelfde uitputting ~76% "op weg" melden —
    // de opbouwjaren vóór het stopmoment zouden dan als dekking meetellen.
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: halverwege, eindMaand })).toBeCloseTo(
      (438 / 576) * 100,
      10,
    )
  })

  it('uitputting VÓÓR het stopmoment → 0 ("je plan faalt al vóór je stopt")', () => {
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 120, eindMaand, ankerMaand })).toBe(0)
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: ankerMaand - 1, eindMaand, ankerMaand })).toBe(0)
  })

  it('uitputting exact op het stopmoment → 0 (nul maanden gedekt)', () => {
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: ankerMaand, eindMaand, ankerMaand })).toBe(0)
  })

  it('reikt tot/voorbij de eindmaand of tot de horizon → 100', () => {
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: null, eindMaand, ankerMaand })).toBe(100)
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: eindMaand, eindMaand, ankerMaand })).toBe(100)
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 700, eindMaand, ankerMaand })).toBe(100)
  })

  it('een GEPASSEERD anker (negatieve ankerMaand) telt als vandaag — geen negatieve noemer', () => {
    // AOW-anker bij iemand die de AOW al voorbij is: ankerMaand < 0.
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 288, eindMaand, ankerMaand: -36 })).toBe(50)
  })

  it('een anker op/voorbij de eindmaand → 0, geen deling door nul of negatieve noemer', () => {
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 500, eindMaand, ankerMaand: 576 })).toBe(0)
    expect(computeRunwayCoveragePct({ kernelDepletionMonth: 500, eindMaand, ankerMaand: 700 })).toBe(0)
  })
})

import { describe, it, expect } from 'vitest'
import { compareForfaitairVsWerkelijk } from './box3-tegenbewijs'
import { BOX3_PARAMS, type Box3Result } from './box3-data'

/**
 * Tests voor compareForfaitairVsWerkelijk() — tegenbewijsregeling Box 3.
 * Pure vergelijking forfaitair vs. werkelijk rendement.
 */

/**
 * Minimale Box3Result-fixture. Alleen de velden die de tegenbewijs-motor
 * leest hoeven echte waarden te hebben; de rest is opvulling om het type
 * te bevredigen.
 */
function makeBox3Result(overrides: {
  totaalSpaargeld?: number
  totaalBeleggingen?: number
  tax?: number
  dailyExpenses?: number
  tarief?: number
}): Box3Result {
  const tarief = overrides.tarief ?? BOX3_PARAMS[2026].tarief
  const params = { ...BOX3_PARAMS[2026], tarief }
  return {
    year: 2026,
    hasPartner: false,
    params,
    assetClassifications: [],
    debtClassifications: [],
    totaalSpaargeld: overrides.totaalSpaargeld ?? 0,
    totaalBeleggingen: overrides.totaalBeleggingen ?? 0,
    totaalUitgesloten: 0,
    totaalBox3Schulden: 0,
    totaalUitgeslotenSchulden: 0,
    schuldendrempel: 0,
    aftrekbareSchulden: 0,
    forfaitairSpaargeld: 0,
    forfaitairBeleggingen: 0,
    forfaitairSchulden: 0,
    voordeelUitSparen: 0,
    rendementsgrondslag: 0,
    heffingsvrijVermogen: 0,
    grondslagSparen: 0,
    effectiefRendement: 0,
    box3Income: 0,
    tax: overrides.tax ?? 0,
    freedomDays: 0,
    dailyExpenses: overrides.dailyExpenses ?? 0,
  }
}

describe('compareForfaitairVsWerkelijk — gunstigste keuze', () => {
  it('laag werkelijk rendement → werkelijk is gunstiger, besparing > 0', () => {
    // €200k beleggingen, forfaitaire heffing van €4000.
    const box3Result = makeBox3Result({
      totaalBeleggingen: 200_000,
      tax: 4_000,
      dailyExpenses: 100,
      tarief: 0.36,
    })
    // 1% werkelijk = €2000 → heffing 0.36 × 2000 = €720 < €4000.
    const r = compareForfaitairVsWerkelijk({ box3Result, werkelijkRendementPct: 1.0 })

    expect(r.werkelijkRendementEur).toBe(2_000)
    expect(r.werkelijkeHeffing).toBeCloseTo(720, 6)
    expect(r.gunstigste).toBe('werkelijk')
    expect(r.besparing).toBeCloseTo(3_280, 6)
    expect(r.besparing).toBeGreaterThan(0)
    expect(r.freedomDays).toBeCloseTo(32.8, 6)
  })

  it('hoog werkelijk rendement → forfaitair blijft gunstiger, besparing = 0', () => {
    const box3Result = makeBox3Result({
      totaalBeleggingen: 200_000,
      tax: 4_000,
      dailyExpenses: 100,
      tarief: 0.36,
    })
    // 10% werkelijk = €20.000 → heffing 0.36 × 20000 = €7200 > €4000.
    const r = compareForfaitairVsWerkelijk({ box3Result, werkelijkRendementPct: 10.0 })

    expect(r.werkelijkRendementEur).toBe(20_000)
    expect(r.werkelijkeHeffing).toBeCloseTo(7_200, 6)
    expect(r.gunstigste).toBe('forfaitair')
    expect(r.besparing).toBe(0)
    expect(r.freedomDays).toBe(0)
  })
})

describe('compareForfaitairVsWerkelijk — omslagpunt', () => {
  it('op het omslagpunt is werkelijke heffing == forfaitair en besparing ~0', () => {
    const box3Result = makeBox3Result({
      totaalSpaargeld: 50_000,
      totaalBeleggingen: 150_000,
      tax: 4_000,
      dailyExpenses: 100,
      tarief: 0.36,
    })
    const r = compareForfaitairVsWerkelijk({ box3Result, werkelijkRendementPct: 5.0 })

    // Voer het berekende omslag-% terug in: heffing moet nu gelijk zijn aan forfaitair.
    const atOmslag = compareForfaitairVsWerkelijk({
      box3Result,
      werkelijkRendementPct: r.omslagRendementPct,
    })
    expect(atOmslag.werkelijkeHeffing).toBeCloseTo(box3Result.tax, 6)
    expect(atOmslag.besparing).toBeCloseTo(0, 6)
  })

  it('omslag-% klopt analytisch: forfait/tarief / bezittingen × 100', () => {
    const box3Result = makeBox3Result({
      totaalBeleggingen: 200_000,
      tax: 4_000,
      tarief: 0.36,
    })
    const r = compareForfaitairVsWerkelijk({ box3Result, werkelijkRendementPct: 3.0 })
    // forfait/tarief = 4000/0.36 = 11111.11; / 200000 × 100 = 5.5556%.
    expect(r.omslagRendementPct).toBeCloseTo((4_000 / 0.36 / 200_000) * 100, 6)
  })
})

describe('compareForfaitairVsWerkelijk — renteschuld-aftrek', () => {
  it('werkelijke renteschuld verlaagt de werkelijke heffing', () => {
    const box3Result = makeBox3Result({
      totaalBeleggingen: 100_000,
      tax: 2_000,
      tarief: 0.36,
    })
    // 4% = €4000 rendement, €1000 rente → belastbaar €3000 → heffing €1080.
    const r = compareForfaitairVsWerkelijk({
      box3Result,
      werkelijkRendementPct: 4.0,
      werkelijkeRenteSchuld: 1_000,
    })
    expect(r.werkelijkRendementEur).toBe(4_000)
    expect(r.werkelijkeHeffing).toBeCloseTo(1_080, 6)
    expect(r.gunstigste).toBe('werkelijk')
    expect(r.besparing).toBeCloseTo(920, 6)
  })

  it('renteschuld groter dan rendement → werkelijke heffing geclampt op 0', () => {
    const box3Result = makeBox3Result({
      totaalBeleggingen: 100_000,
      tax: 2_000,
      tarief: 0.36,
    })
    const r = compareForfaitairVsWerkelijk({
      box3Result,
      werkelijkRendementPct: 1.0, // €1000 rendement
      werkelijkeRenteSchuld: 5_000, // rente > rendement
    })
    expect(r.werkelijkeHeffing).toBe(0)
    expect(r.gunstigste).toBe('werkelijk')
    expect(r.besparing).toBe(2_000)
  })

  it('omslag-% verschuift omhoog als er renteschuld is', () => {
    const base = makeBox3Result({ totaalBeleggingen: 200_000, tax: 4_000, tarief: 0.36 })
    const zonderRente = compareForfaitairVsWerkelijk({ box3Result: base, werkelijkRendementPct: 3 })
    const metRente = compareForfaitairVsWerkelijk({
      box3Result: base,
      werkelijkRendementPct: 3,
      werkelijkeRenteSchuld: 2_000,
    })
    expect(metRente.omslagRendementPct).toBeGreaterThan(zonderRente.omslagRendementPct)
    // analytisch: (4000/0.36 + 2000)/200000 × 100
    expect(metRente.omslagRendementPct).toBeCloseTo(((4_000 / 0.36 + 2_000) / 200_000) * 100, 6)
  })
})

describe('compareForfaitairVsWerkelijk — randgevallen', () => {
  it('geen bezittingen → omslag-% = 0, geen werkelijke heffing', () => {
    const box3Result = makeBox3Result({ tax: 0, tarief: 0.36 })
    const r = compareForfaitairVsWerkelijk({ box3Result, werkelijkRendementPct: 5 })
    expect(r.werkelijkRendementEur).toBe(0)
    expect(r.werkelijkeHeffing).toBe(0)
    expect(r.omslagRendementPct).toBe(0)
    expect(r.gunstigste).toBe('forfaitair')
    expect(r.besparing).toBe(0)
  })

  it('dailyExpenses = 0 → freedomDays = 0 (geen deel-door-nul)', () => {
    const box3Result = makeBox3Result({
      totaalBeleggingen: 200_000,
      tax: 4_000,
      dailyExpenses: 0,
      tarief: 0.36,
    })
    const r = compareForfaitairVsWerkelijk({ box3Result, werkelijkRendementPct: 1 })
    expect(r.besparing).toBeGreaterThan(0)
    expect(r.freedomDays).toBe(0)
  })

  it('forfaitaireHeffing spiegelt box3Result.tax', () => {
    const box3Result = makeBox3Result({ totaalBeleggingen: 100_000, tax: 1_234, tarief: 0.36 })
    const r = compareForfaitairVsWerkelijk({ box3Result, werkelijkRendementPct: 3 })
    expect(r.forfaitaireHeffing).toBe(1_234)
  })
})

import { describe, it, expect } from 'vitest'
import {
  isFinanciallyFree,
  isRetiredView,
  resolveFreedomFraming,
  type FreedomStateInput,
} from './fire-strategy'

/**
 * Tests voor de afgeleide vrijheids-/pensioentoestand — de gedeelde, consume-only
 * vlag die hero, status-banner en AI delen (geen drift). Randgevallen rond
 * freedomPct 99,9/100/100+, currentAge </=/> fireAge, fireAge </=/> aowAge,
 * strategie 'pensioen' en null-leeftijden.
 */

const base: FreedomStateInput = {
  freedomPct: 40,
  currentAge: 40,
  fireAge: 55,
}

describe('isFinanciallyFree', () => {
  it('false bij freedomPct net onder 100 zonder leeftijd-trigger', () => {
    expect(isFinanciallyFree({ ...base, freedomPct: 99.9 })).toBe(false)
  })

  it('true bij freedomPct exact 100', () => {
    expect(isFinanciallyFree({ ...base, freedomPct: 100 })).toBe(true)
  })

  it('true bij freedomPct boven 100', () => {
    expect(isFinanciallyFree({ ...base, freedomPct: 150 })).toBe(true)
  })

  it('true wanneer currentAge gelijk aan fireAge', () => {
    expect(isFinanciallyFree({ freedomPct: 50, currentAge: 55, fireAge: 55 })).toBe(true)
  })

  it('true wanneer currentAge voorbij fireAge', () => {
    expect(isFinanciallyFree({ freedomPct: 10, currentAge: 60, fireAge: 55 })).toBe(true)
  })

  it('false wanneer currentAge vóór fireAge en lage freedomPct', () => {
    expect(isFinanciallyFree({ freedomPct: 30, currentAge: 40, fireAge: 55 })).toBe(false)
  })

  // WF-CANON-03: fireAge is een DREMPEL, dus de callers geven de FRACTIONELE
  // vrijheidsleeftijd door. Voor elke fractie in (currentAge, currentAge+0,5)
  // rondde Math.round OMLAAG naar currentAge, waardoor deze vlag tot 6 maanden
  // vóór de daadwerkelijke FIRE-maand omsloeg naar "vrij".
  it('false bij een fractionele fireAge die nog nét niet bereikt is', () => {
    expect(isFinanciallyFree({ freedomPct: 99.4, currentAge: 45, fireAge: 45.3 })).toBe(false)
    // Het afgeronde equivalent geeft hier ten onrechte true — regressie-slot.
    expect(isFinanciallyFree({ freedomPct: 99.4, currentAge: 45, fireAge: Math.round(45.3) })).toBe(true)
  })

  it('true zodra de fractionele fireAge is gepasseerd', () => {
    expect(isFinanciallyFree({ freedomPct: 99.4, currentAge: 46, fireAge: 45.3 })).toBe(true)
  })

  it('false bij freedomPct null en ontbrekende leeftijden', () => {
    expect(isFinanciallyFree({ freedomPct: null, currentAge: null, fireAge: null })).toBe(false)
  })

  it('false bij niet-finite freedomPct', () => {
    expect(isFinanciallyFree({ freedomPct: NaN, currentAge: null, fireAge: null })).toBe(false)
  })
})

describe('isRetiredView', () => {
  it('true zodra financieel vrij (subsumeert)', () => {
    expect(isRetiredView({ ...base, freedomPct: 100 })).toBe(true)
  })

  it('true bij pensioen-strategie voorbij AOW (currentAge ≥ aowAge)', () => {
    expect(
      isRetiredView({ freedomPct: 20, currentAge: 68, fireAge: 67, strategy: 'pensioen', aowAge: 67 }),
    ).toBe(true)
  })

  it('valt terug op fireAge als AOW-drempel wanneer aowAge ontbreekt', () => {
    expect(
      isRetiredView({ freedomPct: 20, currentAge: 67, fireAge: 67, strategy: 'pensioen' }),
    ).toBe(true)
  })

  it('false bij pensioen-strategie vóór AOW en niet vrij', () => {
    expect(
      isRetiredView({ freedomPct: 30, currentAge: 50, fireAge: 67, strategy: 'pensioen', aowAge: 67 }),
    ).toBe(false)
  })

  it('false bij niet-pensioen-strategie en niet vrij', () => {
    expect(isRetiredView({ freedomPct: 30, currentAge: 40, fireAge: 55, strategy: 'deplete' })).toBe(false)
  })
})

describe('resolveFreedomFraming', () => {
  it("'building' wanneer nog niet vrij", () => {
    expect(resolveFreedomFraming({ freedomPct: 40, currentAge: 40, fireAge: 55 })).toBe('building')
  })

  it("'free' bij vervroegde vrijheid (vrij vóór AOW)", () => {
    expect(
      resolveFreedomFraming({ freedomPct: 100, currentAge: 45, fireAge: 45, strategy: 'deplete', aowAge: 67 }),
    ).toBe('free')
  })

  it("'pensioen' bij expliciete pensioen-strategie", () => {
    expect(
      resolveFreedomFraming({ freedomPct: 100, currentAge: 67, fireAge: 67, strategy: 'pensioen' }),
    ).toBe('pensioen')
  })

  it("'pensioen' wanneer huidige leeftijd op/voorbij AOW", () => {
    expect(
      resolveFreedomFraming({ freedomPct: 20, currentAge: 68, fireAge: 60, strategy: 'deplete', aowAge: 67 }),
    ).toBe('pensioen')
  })

  it("'pensioen' wanneer vrijheidsleeftijd op/voorbij AOW", () => {
    expect(
      resolveFreedomFraming({ freedomPct: 100, currentAge: 70, fireAge: 67, strategy: 'deplete', aowAge: 67 }),
    ).toBe('pensioen')
  })

  it("'free' wanneer vrij maar vóór AOW zonder pensioen-strategie", () => {
    expect(
      resolveFreedomFraming({ freedomPct: 100, currentAge: 50, fireAge: 50, strategy: 'perpetual', aowAge: 67 }),
    ).toBe('free')
  })
})

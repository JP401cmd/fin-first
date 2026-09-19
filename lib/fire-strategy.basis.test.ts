/**
 * B-058 — de VOORPOORT onder `isFinanciallyFree`: een vrijheidsconclusie zonder
 * feitenbasis is geen conclusie.
 *
 * Melding: vlak na de onboarding toonde /overzicht "je hoeft niet meer te
 * werken". Geen rekenfout — met een nog niet ingevulde uitgavenkant is het
 * FIRE-doel ≈ 0 en haalt élke portefeuille de 100 %. De gate kreeg daarom een
 * expliciete ondergrens op de EFFECTIEVE maanduitgaven
 * (`FREEDOM_BASIS_MIN_MONTHLY_EXPENSES`), zodat de drempel niet opnieuw
 * impliciet in de aanroepers gaat zitten.
 *
 * Wat hier vastligt:
 *  - basis onder de grens ⇒ gate dicht, ongeacht freedomPct/leeftijd/anker;
 *  - basis boven de grens ⇒ het bestaande gedrag, ongewijzigd;
 *  - géén basis meegegeven ⇒ het bestaande gedrag (bewuste terugval, zodat de
 *    aanroepers die 'm nog niet dragen hun framing niet stil verliezen).
 */

import { describe, it, expect } from 'vitest'
import {
  FREEDOM_BASIS_MIN_MONTHLY_EXPENSES,
  hasFreedomBasis,
  isFinanciallyFree,
  resolveFreedomFraming,
  type FreedomStateInput,
} from './fire-strategy'

/** Een plaatje dat zonder voorpoort onmiskenbaar 'vrij' oplevert. */
const vrij: FreedomStateInput = { freedomPct: 100, currentAge: 45, fireAge: 40 }

describe('hasFreedomBasis — de ondergrens is expliciet', () => {
  it('geen basis meegegeven telt als "doet niet mee aan deze poort"', () => {
    expect(hasFreedomBasis(undefined)).toBe(true)
    expect(hasFreedomBasis(null)).toBe(true)
  })

  it('onbekende of onbruikbare uitgaven zijn géén basis', () => {
    expect(hasFreedomBasis({ monthlyExpenses: null })).toBe(false)
    expect(hasFreedomBasis({ monthlyExpenses: NaN })).toBe(false)
    expect(hasFreedomBasis({ monthlyExpenses: 0 })).toBe(false)
  })

  it('de grens zelf telt mee, eronder niet', () => {
    expect(hasFreedomBasis({ monthlyExpenses: FREEDOM_BASIS_MIN_MONTHLY_EXPENSES })).toBe(true)
    expect(hasFreedomBasis({ monthlyExpenses: FREEDOM_BASIS_MIN_MONTHLY_EXPENSES - 1 })).toBe(false)
  })
})

describe('isFinanciallyFree — voorpoort op de feitenbasis', () => {
  it('sluit de gate bij een lege uitgavenkant, ook bij 100% dekking', () => {
    expect(isFinanciallyFree(vrij)).toBe(true)
    expect(isFinanciallyFree({ ...vrij, basis: { monthlyExpenses: null } })).toBe(false)
    expect(isFinanciallyFree({ ...vrij, basis: { monthlyExpenses: 0 } })).toBe(false)
  })

  it('sluit de gate ook wanneer alleen de leeftijd-trigger zou vuren', () => {
    const opLeeftijd: FreedomStateInput = { freedomPct: 12, currentAge: 68, fireAge: 60 }
    expect(isFinanciallyFree(opLeeftijd)).toBe(true)
    expect(isFinanciallyFree({ ...opLeeftijd, basis: { monthlyExpenses: null } })).toBe(false)
  })

  it('sluit de gate onder een vast anker dat al bereikt is', () => {
    const aowBereikt: FreedomStateInput = {
      freedomPct: 100,
      currentAge: 70,
      fireAge: 67,
      anchor: { kind: 'aow' },
      aowAge: 67,
    }
    expect(isFinanciallyFree(aowBereikt)).toBe(true)
    expect(isFinanciallyFree({ ...aowBereikt, basis: { monthlyExpenses: 0 } })).toBe(false)
  })

  it('laat een ingevulde uitgavenkant het bestaande gedrag houden', () => {
    expect(isFinanciallyFree({ ...vrij, basis: { monthlyExpenses: 2400 } })).toBe(true)
    expect(
      isFinanciallyFree({ freedomPct: 40, currentAge: 35, fireAge: 55, basis: { monthlyExpenses: 2400 } }),
    ).toBe(false)
  })
})

describe('resolveFreedomFraming — de framing volgt de voorpoort', () => {
  it('valt zonder basis terug op building in plaats van free', () => {
    expect(resolveFreedomFraming(vrij)).toBe('free')
    expect(resolveFreedomFraming({ ...vrij, basis: { monthlyExpenses: null } })).toBe('building')
  })

  it('valt onder een vast anker terug op anchored, niet op free', () => {
    const state: FreedomStateInput = {
      freedomPct: 100,
      currentAge: 70,
      fireAge: 67,
      anchor: { kind: 'aow' },
      aowAge: 67,
      basis: { monthlyExpenses: null },
    }
    expect(resolveFreedomFraming(state)).toBe('anchored')
  })
})

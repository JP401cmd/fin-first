import { describe, it, expect } from 'vitest'
import { guardFireTarget, HORIZON_MISSENDE_GEGEVENS_HINTS } from './outcome-guard'

/**
 * ADR 0127 D4 — onder 'nu-stoppen' is er geen doelvermogen: `guardFireTarget` weigert
 * het bedrag met 'geen-doelvermogen', óók als het positief is (het is het huidige
 * vermogen, geen doel).
 */
describe('guardFireTarget — isStartPortfolio', () => {
  it("een positief bedrag met de start-vlag is géén doelbedrag → 'geen-doelvermogen'", () => {
    const g = guardFireTarget(420_000, { isStartPortfolio: true })
    expect(g.ok).toBe(false)
    expect(g.issue).toBe('geen-doelvermogen')
    expect(g.hint).toBe(HORIZON_MISSENDE_GEGEVENS_HINTS['geen-doelvermogen'])
  })

  it('de vlag wint van de eind-horizon-vlag en van de bedragtoetsen', () => {
    expect(guardFireTarget(-5, { isStartPortfolio: true, isEndOfHorizonFallback: true }).issue).toBe('geen-doelvermogen')
    expect(guardFireTarget(null, { isStartPortfolio: true }).issue).toBe('geen-doelvermogen')
  })

  it('zonder de vlag is het gedrag ongewijzigd', () => {
    expect(guardFireTarget(420_000).ok).toBe(true)
    expect(guardFireTarget(420_000, { isStartPortfolio: false }).ok).toBe(true)
    expect(guardFireTarget(420_000, { isEndOfHorizonFallback: true }).issue).toBe('geen-fire-moment')
  })

  it('de hint benoemt de vraag die wél telt (tot welke leeftijd reikt het geld), zonder doelbelofte', () => {
    expect(HORIZON_MISSENDE_GEGEVENS_HINTS['geen-doelvermogen']).toMatch(/reikt/i)
    expect(HORIZON_MISSENDE_GEGEVENS_HINTS['geen-doelvermogen']).not.toMatch(/kunt stoppen/i)
  })
})

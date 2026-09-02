import { describe, it, expect } from 'vitest'
import { buildVrijheidsleeftijdZin } from './vrijheidsleeftijd-zin'

/**
 * ADR 0127 D6 — de duidingszin bij framing 'nu-stoppen': een uitspraak over bereik
 * ("reikt tot je eindleeftijd"), beschrijvend, nooit aansporend.
 */
describe("buildVrijheidsleeftijdZin — framing 'nu-stoppen'", () => {
  it('duiding: bereik-zin, geen belofte over een moment', () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 42, framing: 'nu-stoppen' })
    expect(zin.kind).toBe('nu-al')
    expect(zin.text).toBe('Als je nu stopt, reikt je vermogen tot je eindleeftijd.')
    expect(zin.text).not.toMatch(/kunt stoppen|kun je stoppen|pensioen/i)
  })

  it('inline-variant', () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 42, framing: 'nu-stoppen', variant: 'inline' })
    expect(zin.text).toBe('je vermogen reikt tot je eindleeftijd als je nu stopt')
  })

  it("in een perspectiefweergave (met naam) valt de eigen framing weg, zoals bij 'free'", () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 61, framing: 'nu-stoppen', subjectName: 'Sam' })
    expect(zin.kind).not.toBe('nu-al')
  })

  it("de bestaande 'free'- en 'pensioen'-zinnen zijn ongewijzigd", () => {
    expect(buildVrijheidsleeftijdZin({ freedomAge: 50, framing: 'free' }).text).toBe('Werken is voor jou nu al een keuze.')
    expect(buildVrijheidsleeftijdZin({ freedomAge: 67, framing: 'pensioen' }).text).toBe('Je pensioen is ingegaan — werken is nu een keuze.')
  })
})

import { describe, it, expect } from 'vitest'
import { buildVrijheidsleeftijdZin } from './vrijheidsleeftijd-zin'

/**
 * ADR 0127 D6 → ADR 0129 F3a — de duidingszin onder het nu-anker: een uitspraak over
 * BEREIK ("reikt tot het einde van je plan"), beschrijvend, nooit aansporend. Sinds
 * F3a is 'nu-stoppen' geen framing meer: de gate levert 'free' (gedekt) of 'anchored'
 * (tekort), en het ANKER reist apart mee. De grondslag heet "liquide vermogen" — de
 * oude zin ("reikt je vermogen") miste dat woord en legde daarmee het netto vermogen
 * mét woning op de liquide portefeuille.
 */
describe("buildVrijheidsleeftijdZin — het nu-anker (framing 'free' + anchor now)", () => {
  it('duiding: bereik-zin, geen belofte over een moment, grondslag liquide', () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 42, framing: 'free', anchor: { kind: 'now' } })
    expect(zin.kind).toBe('nu-al')
    expect(zin.text).toBe('Als je nu stopt, reikt je liquide vermogen tot het einde van je plan.')
    expect(zin.text).not.toMatch(/kunt stoppen|kun je stoppen|pensioen|keuze/i)
  })

  it('inline-variant', () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 42, framing: 'free', anchor: { kind: 'now' }, variant: 'inline' })
    expect(zin.text).toBe('je liquide vermogen reikt tot het einde van je plan')
  })

  it('met bereik-invoer wint het echte bereik (dezelfde zin als het statusblok)', () => {
    const zin = buildVrijheidsleeftijdZin({
      freedomAge: 42,
      framing: 'free',
      anchor: { kind: 'now' },
      ankerReach: { kind: 'gedekt', endAge: 90 },
    })
    expect(zin.text).toBe('Als je nu stopt, reikt je liquide vermogen tot je 90e — het einde van je plan.')
  })

  it("een aow-/age-anker met bereik noemt het stopmoment als getal (nooit het woord AOW)", () => {
    const zin = buildVrijheidsleeftijdZin({
      freedomAge: 62,
      framing: 'anchored',
      anchor: { kind: 'age', age: 62 },
      ankerReach: { kind: 'reikt-tot', age: 83.4, endAge: 90 },
      ankerStop: { kind: 'age', stopAge: 62 },
    })
    expect(zin.kind).toBe('nu-al')
    expect(zin.text).toBe('Als je op 62 stopt, reikt je liquide vermogen tot je 83e. Je plan loopt tot je 90e.')
    expect(zin.text).not.toMatch(/\bAOW\b/)
  })

  it("in een perspectiefweergave (met naam) valt de eigen framing weg, zoals bij 'free'", () => {
    const zin = buildVrijheidsleeftijdZin({ freedomAge: 61, framing: 'free', anchor: { kind: 'now' }, subjectName: 'Sam' })
    expect(zin.kind).not.toBe('nu-al')
  })

  it("de bestaande 'free'- en pensioen-zinnen zijn ongewijzigd (pensioen nu via het aow-anker)", () => {
    expect(buildVrijheidsleeftijdZin({ freedomAge: 50, framing: 'free' }).text).toBe('Werken is voor jou nu al een keuze.')
    expect(buildVrijheidsleeftijdZin({ freedomAge: 67, framing: 'free', anchor: { kind: 'aow' } }).text).toBe(
      'Je pensioen is ingegaan — werken is nu een keuze.',
    )
    // De legacy-vlag blijft werken voor lezers die het anker nog niet doorgeven.
    expect(buildVrijheidsleeftijdZin({ freedomAge: 67, framing: 'free', isPensioen: true }).text).toBe(
      'Je pensioen is ingegaan — werken is nu een keuze.',
    )
  })
})

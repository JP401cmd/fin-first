import { describe, it, expect } from 'vitest'
import { resolveFreedomBanner } from './freedom'
import { FREEDOM_BANNER_COPY } from './copy'

/**
 * ADR 0129 D8 (F3a) — de vrijheidsbanner op /overzicht leest de GATE: onder een vast
 * anker verschijnt hij alleen bij anker bereikt ∧ dekking ≥ 100. Dit sluit de
 * Fable-H1-exposure: een dertigjarige op een AOW-anker met een gedekt plan kreeg
 * "Met pensioen"; een age-anker in het verleden bij 40% dekking kreeg "Financieel vrij".
 */
describe('resolveFreedomBanner — de D8-gate', () => {
  it('30-jarige op aow met dekking 100 ⇒ geen banner', () => {
    expect(resolveFreedomBanner({ freedomPct: 100, currentAge: 30, fireAge: 67, anchor: { kind: 'aow' }, aowAge: 67 })).toBeNull()
  })

  it('aow bereikt ∧ gedekt ⇒ de pensioen-kopij', () => {
    const info = resolveFreedomBanner({ freedomPct: 100, currentAge: 67, fireAge: 67, anchor: { kind: 'aow' }, aowAge: 67 })
    expect(info?.title).toBe(FREEDOM_BANNER_COPY.pensioen.title)
  })

  it('age 30 in het verleden op 42 met dekking 40 ⇒ geen banner (vóór F3a: "Financieel vrij")', () => {
    expect(resolveFreedomBanner({ freedomPct: 40, currentAge: 42, fireAge: 30, anchor: { kind: 'age', age: 30 } })).toBeNull()
  })

  it('age bereikt ∧ gedekt, vóór AOW ⇒ de vrij-kopij', () => {
    const info = resolveFreedomBanner({ freedomPct: 100, currentAge: 60, fireAge: 58.5, anchor: { kind: 'age', age: 58.5 }, aowAge: 67 })
    expect(info?.title).toBe(FREEDOM_BANNER_COPY.free.title)
  })

  it('now gedekt ⇒ de eigen nu-kopij (ongewijzigd t.o.v. ADR 0127)', () => {
    const info = resolveFreedomBanner({ freedomPct: 100, currentAge: 42, fireAge: 42, anchor: { kind: 'now' } })
    expect(info?.title).toBe(FREEDOM_BANNER_COPY['nu-stoppen'].title)
  })

  it('F3b — vast anker, nog niet vrij, mét bereik ⇒ de banner volgt de strip (anker-kopij)', () => {
    const tekort = resolveFreedomBanner(
      { freedomPct: 62, currentAge: 45, fireAge: 58.5, anchor: { kind: 'age', age: 58.5 }, aowAge: 67 },
      { reach: { kind: 'reikt-tot', age: 83.4, endAge: 90 }, stop: { kind: 'age', stopAge: 58.5 } },
    )
    expect(tekort?.title).toBe('Je rekent met stoppen op 58,5')
    expect(tekort?.reason).toBe('Als je op 58,5 stopt, reikt je liquide vermogen tot je 83e. Je plan loopt tot je 90e.')
    expect(tekort?.status).toBe('warn')
    expect(tekort?.reason).not.toMatch(/\bAOW\b/)

    const gedekt = resolveFreedomBanner(
      { freedomPct: 100, currentAge: 30, fireAge: 67, anchor: { kind: 'aow' }, aowAge: 67 },
      { reach: { kind: 'gedekt', endAge: 90 }, stop: { kind: 'aow', stopAge: 67 } },
    )
    expect(gedekt?.title).toBe('Je rekent met stoppen op 67')
    expect(gedekt?.status).toBe('neutral')
    expect(gedekt?.title).not.toMatch(/pensioen|vrij/i)
  })

  it('F3b — onbekend bereik of solved-anker ⇒ geen anker-banner', () => {
    expect(
      resolveFreedomBanner(
        { freedomPct: 62, currentAge: 45, fireAge: 58.5, anchor: { kind: 'age', age: 58.5 } },
        { reach: { kind: 'onbekend' }, stop: { kind: 'age', stopAge: 58.5 } },
      ),
    ).toBeNull()
    expect(
      resolveFreedomBanner(
        { freedomPct: 62, currentAge: 45, fireAge: 58.5, anchor: { kind: 'solved' } },
        { reach: { kind: 'reikt-tot', age: 83, endAge: 90 }, stop: { kind: 'now' } },
      ),
    ).toBeNull()
  })

  it('het anker wint van de legacy-label wanneer beide er staan', () => {
    // Legacy zegt pensioen (aow), het plan zegt age 58,5: gate op het anker.
    expect(resolveFreedomBanner({ freedomPct: 100, currentAge: 59, fireAge: 58.5, strategy: 'pensioen', anchor: { kind: 'age', age: 58.5 }, aowAge: 67 })?.title).toBe(
      FREEDOM_BANNER_COPY.free.title,
    )
  })
})

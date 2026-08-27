import { describe, it, expect } from 'vitest'
import {
  guardFreedomAge,
  guardFireTarget,
  HORIZON_MISSENDE_GEGEVENS_LABEL,
} from './outcome-guard'
import { HORIZON_PLAFOND_LEEFTIJD } from '@/lib/constants'
import { MAX_AGE } from '@/lib/horizon-kernel/types'

/**
 * Vangrails uit bevinding M6: een onmogelijke uitkomst mag nooit als gewoon
 * getal op het scherm. De rekenkant is bij de bron gerepareerd (solver-scoping +
 * gemarkeerde bridge-terugval); dit is de tweede verdedigingslinie.
 */

describe('HORIZON_PLAFOND_LEEFTIJD', () => {
  it('is een alias van de kernel-horizon (geen tweede getal dat kan driften)', () => {
    expect(HORIZON_PLAFOND_LEEFTIJD).toBe(MAX_AGE)
  })
})

describe('guardFreedomAge', () => {
  it('laat een gewone vrijheidsleeftijd door', () => {
    expect(guardFreedomAge(52.4).ok).toBe(true)
    expect(guardFreedomAge(99.9).ok).toBe(true)
  })

  it('blokkeert de horizon-parkeerstand (leeftijd = plafond)', () => {
    const g = guardFreedomAge(HORIZON_PLAFOND_LEEFTIJD)
    expect(g.ok).toBe(false)
    expect(g.issue).toBe('buiten-horizon')
    expect(g.label).toBe(HORIZON_MISSENDE_GEGEVENS_LABEL)
    expect(g.hint).toBeTruthy()
  })

  it('blokkeert alles bóven het plafond', () => {
    expect(guardFreedomAge(144.7).ok).toBe(false)
  })

  it('blokkeert niet-eindige waarden', () => {
    expect(guardFreedomAge(Number.NaN).issue).toBe('geen-gegevens')
    expect(guardFreedomAge(Number.POSITIVE_INFINITY).issue).toBe('geen-gegevens')
  })

  it('null/undefined is GEEN probleem — "niet haalbaar" is een geldig antwoord', () => {
    expect(guardFreedomAge(null).ok).toBe(true)
    expect(guardFreedomAge(undefined).ok).toBe(true)
  })
})

describe('guardFireTarget', () => {
  it('laat een positief doelbedrag door', () => {
    expect(guardFireTarget(875_000).ok).toBe(true)
  })

  it('blokkeert het negatieve doelbedrag uit de bevinding', () => {
    const g = guardFireTarget(-11_328_971)
    expect(g.ok).toBe(false)
    expect(g.issue).toBe('onmogelijk-bedrag')
    expect(g.label).toBe(HORIZON_MISSENDE_GEGEVENS_LABEL)
  })

  it('blokkeert 0 — een doelbedrag van niets is geen doel', () => {
    expect(guardFireTarget(0).issue).toBe('onmogelijk-bedrag')
  })

  it('blokkeert een positief bedrag dat uit de eind-horizon-terugval komt', () => {
    const g = guardFireTarget(420_000, { isEndOfHorizonFallback: true })
    expect(g.ok).toBe(false)
    expect(g.issue).toBe('geen-fire-moment')
  })

  it('blokkeert ontbrekende/niet-eindige bedragen', () => {
    expect(guardFireTarget(null).issue).toBe('geen-gegevens')
    expect(guardFireTarget(undefined).issue).toBe('geen-gegevens')
    expect(guardFireTarget(Number.NaN).issue).toBe('geen-gegevens')
  })

  it('geeft bij elk probleem dezelfde kop, met een eigen uitleg', () => {
    const problemen = [
      guardFireTarget(-1),
      guardFireTarget(1, { isEndOfHorizonFallback: true }),
      guardFreedomAge(HORIZON_PLAFOND_LEEFTIJD),
    ]
    for (const g of problemen) expect(g.label).toBe(HORIZON_MISSENDE_GEGEVENS_LABEL)
    expect(new Set(problemen.map((g) => g.hint)).size).toBe(3)
  })
})

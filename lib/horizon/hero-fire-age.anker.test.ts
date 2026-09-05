import { describe, it, expect } from 'vitest'
import { formatHeroFireAge, heroFireAgeCaption, resolveHeroFireAge } from './hero-fire-age'

/**
 * ADR 0129 F3a (D7/B9) — ÉÉN anker-tak in de hero-seam. Onder elk vast anker
 * (aow/nu/leeftijd) is het kopgetal de leeftijd tot waar het vermogen REIKT, en reist
 * de drieslag mee als `anker`: JOUW STOPMOMENT (uit `vastStopLeeftijd`, nooit uit
 * `fireAge`) · VRIJ MOGELIJK VANAF (de tweede run) · REIKT TOT.
 *
 * Bevinding 11 (Fable-review): `fireAge = ceil(fireAgeFractional)` maakte van een
 * gekozen 58,5 een 59 — de seam levert daarom het stopmoment uit het anker.
 */
describe('resolveHeroFireAge — één anker-tak', () => {
  it('leeftijd-anker 58,5: het stopmoment blijft 58,5 (niet ceil → 59), het kopgetal is het bereik', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      kernelFireAgeFractional: 58.5,
      kernelFireAge: 59, // ceil — precies wat NIET als stopmoment mag doorreizen
      stopAnker: { soort: 'leeftijd', leeftijd: 58.5 },
      vastStopLeeftijd: 58.5,
      ankerReach: { kind: 'reikt-tot', age: 83.25, endAge: 90 },
      solvedFireAgeFractional: 54.2,
    })
    expect(state.status).toBe('definitief')
    expect(state.bron).toBe('kernel-runway')
    expect(state.age).toBe(83.25)
    expect(formatHeroFireAge(state)).toBe('83')
    expect(state.anker).toEqual({
      soort: 'leeftijd',
      stopAge: 58.5,
      solvedFireAge: 54.2,
      reachesAge: 83.25,
      reach: { kind: 'reikt-tot', age: 83.25, endAge: 90 },
      gedekt: false,
    })
  })

  it('zonder vastStopLeeftijd valt het stopmoment terug op de ankerleeftijd zelf — nooit op fireAge', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      kernelFireAge: 59,
      stopAnker: { soort: 'leeftijd', leeftijd: 58.5 },
      ankerReach: { kind: 'gedekt', endAge: 90 },
    })
    expect(state.anker?.stopAge).toBe(58.5)
    expect(state.anker?.gedekt).toBe(true)
    expect(state.age).toBe(90)
  })

  it('nu-anker: identiek aan het ADR 0127-gedrag (bereik als kopgetal, eindleeftijd bij dekking)', () => {
    const tekort = resolveHeroFireAge({
      hasKernelResult: true,
      kernelFireAgeFractional: 42,
      stopAnker: { soort: 'nu' },
      vastStopLeeftijd: 42,
      ankerReach: { kind: 'reikt-tot', age: 61.25, endAge: 90 },
    })
    expect(tekort).toMatchObject({ status: 'definitief', age: 61.25, bron: 'kernel-runway' })
    expect(formatHeroFireAge(tekort)).toBe('61')
    const gedekt = resolveHeroFireAge({
      hasKernelResult: true,
      stopAnker: { soort: 'nu' },
      ankerReach: { kind: 'gedekt', endAge: 100 },
    })
    // Een eindleeftijd op het horizonplafond is hier een antwoord, geen M6-parkeerstand.
    expect(gedekt.status).toBe('definitief')
    expect(gedekt.age).toBe(100)
  })

  it("'nu-op': het geld is vandaag al op — het getal is de huidige leeftijd, de woorden zitten in het onderschrift", () => {
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      stopAnker: { soort: 'aow' },
      vastStopLeeftijd: 67,
      ankerReach: { kind: 'nu-op' },
      currentAge: 42,
      aowTableLoaded: true,
    })
    expect(state.age).toBe(42)
    expect(state.anker?.reachesAge).toBeNull()
    expect(heroFireAgeCaption(state, 'jaar')).toBe('jaar')
  })

  it("zonder bereik: 'berekenen' zolang de kernel rekent, anders 'onbekend' — nooit een FIRE-getal", () => {
    expect(resolveHeroFireAge({ hasKernelResult: false, stopAnker: { soort: 'aow' }, isRefining: true }).status).toBe('berekenen')
    expect(resolveHeroFireAge({ hasKernelResult: false, stopAnker: { soort: 'nu' }, isRefining: false }).status).toBe('onbekend')
    const onbekend = resolveHeroFireAge({
      hasKernelResult: true,
      kernelFireAgeFractional: 67,
      stopAnker: { soort: 'aow' },
      ankerReach: { kind: 'onbekend' },
    })
    expect(onbekend.status).toBe('onbekend')
    expect(onbekend.age).toBeNull()
    expect(onbekend.anker?.reach).toEqual({ kind: 'onbekend' })
  })

  it('solved (geen anker): ongewijzigd — de kernel-leeftijd wint en er is geen drieslag', () => {
    const state = resolveHeroFireAge({ hasKernelResult: true, kernelFireAgeFractional: 52.9, serverFireAge: 67, stopAnker: null })
    expect(state).toEqual({ status: 'definitief', age: 52.9, bron: 'kernel' })
    expect(state.anker).toBeUndefined()
  })

  it('de tweede run die niets vindt levert solvedFireAge null (geen verzonnen leeftijd)', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      stopAnker: { soort: 'aow' },
      vastStopLeeftijd: 67,
      ankerReach: { kind: 'gedekt', endAge: 90 },
      solvedFireAgeFractional: null,
      aowTableLoaded: true,
    })
    expect(state.anker?.solvedFireAge).toBeNull()
  })
})

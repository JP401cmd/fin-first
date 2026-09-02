import { describe, it, expect } from 'vitest'
import { formatHeroFireAge, resolveHeroFireAge } from './hero-fire-age'

/**
 * ADR 0127 D6 — onder 'nu-stoppen' toont de hero niet de kernel-`fireAge` (per
 * constructie de startleeftijd) maar de leeftijd tot waar het vermogen reikt —
 * spiegel van `isPensioenMode`.
 */
describe('resolveHeroFireAge — isNuStoppenMode', () => {
  it('toont de uitputtingsleeftijd, niet de kernel-fireAge', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      kernelFireAgeFractional: 42, // de startleeftijd — zegt niets
      isNuStoppenMode: true,
      nuStoppenRunway: { depletionAgeFractional: 61.25, endAge: 90 },
    })
    expect(state).toEqual({ status: 'definitief', age: 61.25, bron: 'kernel-runway' })
    expect(formatHeroFireAge(state)).toBe('61')
  })

  it('reikt het geld tot de eindleeftijd, dan is de eindleeftijd het getal', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      kernelFireAgeFractional: 42,
      isNuStoppenMode: true,
      nuStoppenRunway: { depletionAgeFractional: null, endAge: 90 },
    })
    expect(state).toEqual({ status: 'definitief', age: 90, bron: 'kernel-runway' })
  })

  it('een eindleeftijd op het horizonplafond is hier een antwoord, geen M6-parkeerstand', () => {
    const state = resolveHeroFireAge({
      hasKernelResult: true,
      isNuStoppenMode: true,
      nuStoppenRunway: { depletionAgeFractional: null, endAge: 100 },
    })
    expect(state.status).toBe('definitief')
    expect(state.age).toBe(100)
  })

  it("zonder runway: 'berekenen' zolang de kernel rekent, anders 'onbekend'", () => {
    expect(resolveHeroFireAge({ hasKernelResult: false, isNuStoppenMode: true, isRefining: true }).status).toBe('berekenen')
    expect(resolveHeroFireAge({ hasKernelResult: false, isNuStoppenMode: true, isRefining: false }).status).toBe('onbekend')
  })

  it('zonder de modus is het gedrag ongewijzigd (kernel wint)', () => {
    const state = resolveHeroFireAge({ hasKernelResult: true, kernelFireAgeFractional: 52.9, serverFireAge: 67 })
    expect(state).toEqual({ status: 'definitief', age: 52.9, bron: 'kernel' })
  })
})

import { describe, it, expect } from 'vitest'
import { ALL_MODULES } from '@/lib/module-registry'
import { isNewsOnly, resolveActiveModules } from './resolve'

describe('resolveActiveModules — bestaande profielen (poort K1: gedragsneutraal)', () => {
  // Productie 21 sep 2026: 26 × alle zes, 3 × null. Vóór Krant 2A las de
  // shell de kolom niet en gebruikte hij `[...ALL_MODULES]`.
  it('null → alle modules in catalogusvolgorde', () => {
    expect(resolveActiveModules({ active_modules: null })).toEqual(ALL_MODULES)
  })

  it('kolom afwezig of geen profielrij → alle modules', () => {
    expect(resolveActiveModules({})).toEqual(ALL_MODULES)
    expect(resolveActiveModules(null)).toEqual(ALL_MODULES)
    expect(resolveActiveModules(undefined)).toEqual(ALL_MODULES)
  })

  it('alle zes → alle modules, ongeacht de volgorde in de DB', () => {
    expect(resolveActiveModules({ active_modules: [...ALL_MODULES] })).toEqual(ALL_MODULES)
    expect(resolveActiveModules({ active_modules: [...ALL_MODULES].reverse() })).toEqual(ALL_MODULES)
  })

  it('geeft een verse array terug, nooit de gedeelde ALL_MODULES-instantie', () => {
    const a = resolveActiveModules(null)
    const b = resolveActiveModules({ active_modules: [...ALL_MODULES] })
    expect(a).not.toBe(ALL_MODULES)
    expect(b).not.toBe(ALL_MODULES)
    a.pop()
    expect(ALL_MODULES).toHaveLength(6)
  })
})

describe('resolveActiveModules — subsets en fail-open', () => {
  it("['nieuws'] → alleen nieuws", () => {
    expect(resolveActiveModules({ active_modules: ['nieuws'] })).toEqual(['nieuws'])
  })

  it('een subset komt in catalogusvolgorde terug, zonder dubbelen', () => {
    expect(
      resolveActiveModules({ active_modules: ['nieuws', 'budgetteren', 'nieuws'] }),
    ).toEqual(['budgetteren', 'nieuws'])
  })

  it('onbekende en niet-string waarden worden weggefilterd', () => {
    expect(resolveActiveModules({ active_modules: ['nieuws', 'x', 42, null] })).toEqual(['nieuws'])
  })

  it('lege array of alleen onbekende ids → alle modules (nooit een lege shell)', () => {
    expect(resolveActiveModules({ active_modules: [] })).toEqual(ALL_MODULES)
    expect(resolveActiveModules({ active_modules: ['x'] })).toEqual(ALL_MODULES)
  })

  it('geen array (corrupte waarde) → alle modules', () => {
    expect(resolveActiveModules({ active_modules: 'nieuws' })).toEqual(ALL_MODULES)
    expect(resolveActiveModules({ active_modules: { 0: 'nieuws' } })).toEqual(ALL_MODULES)
  })
})

describe('isNewsOnly', () => {
  it('waar voor precies nieuws, onwaar voor elke andere set', () => {
    expect(isNewsOnly(['nieuws'])).toBe(true)
    expect(isNewsOnly(['budgetteren', 'nieuws'])).toBe(false)
    expect(isNewsOnly(ALL_MODULES)).toBe(false)
    expect(isNewsOnly([])).toBe(false)
  })
})

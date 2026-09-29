import { describe, it, expect } from 'vitest'
import { ALL_MODULES, validateModules } from '@/lib/module-registry'
import { HOME_SCREEN_VALUES, resolveHomeHref } from '@/lib/home-screen'
import { PRODUCTS, PRODUCT_PRESETS, isNewsOnly, resolveActiveModules } from './resolve'

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

describe('PRODUCT_PRESETS (Krant 2A fase 2, ADR 0184)', () => {
  it('precies twee producten: krant en geheel', () => {
    expect([...PRODUCTS]).toEqual(['krant', 'geheel'])
    expect(Object.keys(PRODUCT_PRESETS).sort()).toEqual([...PRODUCTS].sort())
  })

  it("krant = alleen 'nieuws', home 'nieuws'", () => {
    expect(PRODUCT_PRESETS.krant).toEqual({ modules: ['nieuws'], homeScreen: 'nieuws' })
  })

  it("geheel = alle modules in catalogusvolgorde, home 'overzicht'", () => {
    expect(PRODUCT_PRESETS.geheel).toEqual({ modules: ALL_MODULES, homeScreen: 'overzicht' })
    expect(PRODUCT_PRESETS.geheel.modules).not.toBe(ALL_MODULES)
  })

  it.each(PRODUCTS)('%s: de moduleset is geldig en overleeft een round-trip door de lezer', (p) => {
    const { modules, homeScreen } = PRODUCT_PRESETS[p]
    expect(validateModules([...modules]).valid).toBe(true)
    // Wat de route schrijft, leest de shell exact zo terug (catalogusvolgorde, geen fail-open).
    expect(resolveActiveModules({ active_modules: [...modules] })).toEqual([...modules])
    expect(HOME_SCREEN_VALUES).toContain(homeScreen)
  })

  it('de preset-home klopt met de productgrens van resolveHomeHref', () => {
    expect(isNewsOnly(resolveActiveModules({ active_modules: [...PRODUCT_PRESETS.krant.modules] }))).toBe(true)
    expect(isNewsOnly(resolveActiveModules({ active_modules: [...PRODUCT_PRESETS.geheel.modules] }))).toBe(false)
    const row = (p: 'krant' | 'geheel') => ({
      active_modules: [...PRODUCT_PRESETS[p].modules],
      home_screen: PRODUCT_PRESETS[p].homeScreen,
    })
    expect(resolveHomeHref(row('krant'))).toBe('/nieuws')
    expect(resolveHomeHref(row('geheel'))).toBe('/overzicht')
  })

  it('is bevroren — een consument kan de preset niet muteren', () => {
    expect(Object.isFrozen(PRODUCT_PRESETS)).toBe(true)
    expect(Object.isFrozen(PRODUCT_PRESETS.krant.modules)).toBe(true)
    expect(Object.isFrozen(PRODUCT_PRESETS.geheel.modules)).toBe(true)
  })
})

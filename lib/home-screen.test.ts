import { describe, it, expect } from 'vitest'
import { ALL_MODULES } from '@/lib/module-registry'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  HOME_SCREEN_HREFS,
  HOME_SCREEN_PICKABLE,
  HOME_SCREEN_VALUES,
  homeHrefFor,
  isHomeScreen,
  resolveHomeHref,
  NEWS_ONLY_HOME_HREF,
} from './home-screen'

describe('resolveHomeHref — bestaande profielen landen waar ze vóór Krant 2A landden', () => {
  // Vóór 2A las de proxy alleen home_screen: `homeHrefFor(home_screen)`.
  const moduleValues: unknown[] = [null, undefined, [...ALL_MODULES], [...ALL_MODULES].reverse()]
  const homeValues: unknown[] = [null, undefined, 'overzicht', 'budget', 'onbekend']

  for (const active_modules of moduleValues) {
    for (const home_screen of homeValues) {
      it(`modules=${JSON.stringify(active_modules)} home_screen=${String(home_screen)}`, () => {
        expect(resolveHomeHref({ active_modules, home_screen })).toBe(homeHrefFor(home_screen))
      })
    }
  }

  it('geen profielrij → /overzicht', () => {
    expect(resolveHomeHref(null)).toBe('/overzicht')
    expect(resolveHomeHref(undefined)).toBe('/overzicht')
  })
})

describe('resolveHomeHref — de productgrens wint van de voorkeur', () => {
  it("alleen 'nieuws' → /nieuws, ook met home_screen='budget'", () => {
    expect(resolveHomeHref({ active_modules: ['nieuws'] })).toBe(NEWS_ONLY_HOME_HREF)
    expect(resolveHomeHref({ active_modules: ['nieuws'], home_screen: 'budget' })).toBe('/nieuws')
  })

  it('nieuws naast een andere module volgt home_screen', () => {
    expect(resolveHomeHref({ active_modules: ['nieuws', 'budgetteren'], home_screen: 'budget' })).toBe(
      '/overzicht/budget',
    )
    expect(resolveHomeHref({ active_modules: ['nieuws', 'budgetteren'] })).toBe('/overzicht')
  })

  it('een lege moduleset is geen Krant-account (fail-open naar alle modules)', () => {
    expect(resolveHomeHref({ active_modules: [], home_screen: 'budget' })).toBe('/overzicht/budget')
  })
})

describe("'nieuws' als home_screen-waarde (Krant 2A fase 2, ADR 0184)", () => {
  it("'nieuws' is persisteerbaar en wijst naar /nieuws", () => {
    expect(isHomeScreen('nieuws')).toBe(true)
    expect(HOME_SCREEN_HREFS.nieuws).toBe('/nieuws')
    expect(homeHrefFor('nieuws')).toBe('/nieuws')
    expect(NEWS_ONLY_HOME_HREF).toBe(HOME_SCREEN_HREFS.nieuws)
  })

  it("'nieuws' is NIET kiesbaar — PICKABLE is precies overzicht en budget", () => {
    expect([...HOME_SCREEN_PICKABLE]).toEqual(['overzicht', 'budget'])
    expect(HOME_SCREEN_PICKABLE as readonly string[]).not.toContain('nieuws')
  })

  it('PICKABLE ⊂ VALUES, en elke waarde heeft een route', () => {
    for (const v of HOME_SCREEN_PICKABLE) expect(HOME_SCREEN_VALUES).toContain(v)
    expect(Object.keys(HOME_SCREEN_HREFS).sort()).toEqual([...HOME_SCREEN_VALUES].sort())
  })

  it("VALUES spiegelt de CHECK in migratie 20261006120000", () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20261006120000_profiles_home_screen_nieuws.sql'),
      'utf8',
    )
    const m = sql.match(/CHECK \(home_screen IN \(([^)]*)\)\)/)
    expect(m).not.toBeNull()
    const inCheck = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1])
    expect(inCheck.sort()).toEqual([...HOME_SCREEN_VALUES].sort())
  })

  it("home_screen 'nieuws' met alle modules landt op /nieuws; met de Krant-set ook", () => {
    expect(resolveHomeHref({ active_modules: [...ALL_MODULES], home_screen: 'nieuws' })).toBe('/nieuws')
    expect(resolveHomeHref({ active_modules: ['nieuws'], home_screen: 'nieuws' })).toBe('/nieuws')
  })
})

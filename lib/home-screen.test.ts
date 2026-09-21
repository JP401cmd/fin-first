import { describe, it, expect } from 'vitest'
import { ALL_MODULES } from '@/lib/module-registry'
import { homeHrefFor, resolveHomeHref, NEWS_ONLY_HOME_HREF } from './home-screen'

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

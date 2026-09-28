import { describe, it, expect } from 'vitest'
import { ALL_MODULES } from '@/lib/module-registry'
import { resolveActiveModules } from '@/lib/modules/resolve'
import { KRANT_MIJN_HREF, isKrantRoute } from '@/lib/modules/krant-grens'
import { globalNav, mainNav, menuNav, navGroups, navSurfaceFor } from './nav-config'

/**
 * Navigatie per product (Krant 2B). Eén beslissing in `navSurfaceFor`, gelezen
 * door zijbalk, nav-sheet, TopBar-menu, /mijn-tabbalk en ⌘K.
 */
describe('navSurfaceFor — bestaande profielen zien exact de oude navigatie', () => {
  it.each([
    ['null', null],
    ['alle zes', [...ALL_MODULES]],
    ['nieuws + budgetteren', ['nieuws', 'budgetteren']],
  ])('%s → dezelfde instanties en een isVisible die niets wegfiltert', (_label, raw) => {
    const nav = navSurfaceFor(resolveActiveModules({ active_modules: raw }))
    expect(nav.isKrant).toBe(false)
    // Dezelfde referenties: geen kopie die stil kan afwijken.
    expect(nav.menu).toBe(menuNav)
    expect(nav.globalNav).toBe(globalNav)
    // De Mijn-tak is die van vóór 2B: de /mijn-hub met alle onderdelen.
    expect(nav.mijn.href).toBe(mainNav[2]!.href)
    expect(nav.mijn.label).toBe(mainNav[2]!.label)
    expect(nav.mijn.children).toBe(navGroups[2]!.items)
    for (const href of ['/overzicht', '/rapportages', '/berichten', '/mijn', '/beheer', '/nieuws']) {
      expect(nav.isVisible(href), href).toBe(true)
    }
  })
})

describe('navSurfaceFor — een Krant-account ziet Krant en Mijn', () => {
  const nav = navSurfaceFor(['nieuws'])

  it('geen hoofdmenu (geen Home, hefbomen of Toekomst)', () => {
    expect(nav.isKrant).toBe(true)
    expect(nav.menu).toEqual([])
  })

  it('"overal beschikbaar" is alleen de Krant — geen Vraag Fin, Tips, Berichten of Rapportages', () => {
    expect(nav.globalNav.map((i) => i.href)).toEqual(['/nieuws'])
    expect(nav.globalNav.map((i) => i.label)).toEqual(['Krant'])
    expect(nav.globalNav.some((i) => i.action === 'open-chat')).toBe(false)
  })

  it('Mijn wijst naar /mijn/account en toont alleen onderdelen binnen de grens', () => {
    expect(nav.mijn.label).toBe('Mijn')
    expect(nav.mijn.href).toBe(KRANT_MIJN_HREF)
    const children = (nav.mijn.children ?? []).map((c) => c.href)
    expect(children.length).toBeGreaterThan(0)
    expect(children.every(isKrantRoute)).toBe(true)
    expect(children).toEqual(['/mijn/account', '/mijn/notificaties'])
  })

  it('elke ingang die dit oppervlak toont ligt binnen de grens', () => {
    const hrefs = [
      ...nav.menu.map((e) => e.href),
      nav.mijn.href,
      ...(nav.mijn.children ?? []).map((c) => c.href),
      ...nav.globalNav.flatMap((i) => (i.href ? [i.href] : [])),
    ]
    expect(hrefs.every(isKrantRoute)).toBe(true)
  })

  it('isVisible volgt de grens', () => {
    expect(nav.isVisible('/nieuws')).toBe(true)
    expect(nav.isVisible('/mijn/notificaties')).toBe(true)
    expect(nav.isVisible('/mijn')).toBe(false)
    expect(nav.isVisible('/rapportages')).toBe(false)
    expect(nav.isVisible('/overzicht/tips')).toBe(false)
    expect(nav.isVisible('/mijn/feedback')).toBe(false) // meldmodus = Fin
  })

  it('de gedeelde nav-bronnen blijven onaangeroerd (geen mutatie door het filteren)', () => {
    expect(mainNav[2]!.href).toBe('/mijn')
    expect(globalNav.some((i) => i.action === 'open-chat')).toBe(true)
    expect(menuNav.length).toBeGreaterThan(0)
  })
})

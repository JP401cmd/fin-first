import { describe, it, expect } from 'vitest'
import {
  resolveRouteTitle,
  navGroups,
  mainNav,
  EXTRA_ROUTE_TITLES,
  SIMPLE_HIDDEN_NAV_HREFS,
} from './nav-config'

describe('resolveRouteTitle', () => {
  it('resolveert toekomst-subroutes uit navGroups', () => {
    expect(resolveRouteTitle('/toekomst/gebeurtenissen')).toBe('Gebeurtenissen')
    expect(resolveRouteTitle('/toekomst/doelen')).toBe('Doelen')
    expect(resolveRouteTitle('/toekomst/voorkeuren')).toBe('Voorkeuren')
    expect(resolveRouteTitle('/toekomst/rekenhulp')).toBe('Rekenhulp')
  })

  it('resolveert geneste children (Box 1/2/3) onder Belasting', () => {
    expect(resolveRouteTitle('/overzicht/belasting/box1')).toBe('Box 1 · Werk + woning')
    expect(resolveRouteTitle('/overzicht/belasting/box3')).toBe('Box 3 · Sparen + beleggen')
  })

  it('resolveert hoofdpagina-routes', () => {
    // mainNav wordt vóór navGroups toegevoegd → mainNav-label wint ("first winner").
    // Tab-roots krijgen sowieso geen TopBar-fallback, dus dit raakt de UI niet.
    expect(resolveRouteTitle('/overzicht')).toBe('Overzicht')
    expect(resolveRouteTitle('/toekomst')).toBe('Toekomst')
    expect(resolveRouteTitle('/mijn')).toBe('Mijn')
  })

  it('resolveert EXTRA_ROUTE_TITLES (buiten de nav-structuur)', () => {
    expect(resolveRouteTitle('/mijn/checkins')).toBe('Check-ins')
    expect(resolveRouteTitle('/mijn/feedback')).toBe('Feedback')
    expect(resolveRouteTitle('/toekomst/strategie')).toBe('Strategie')
    expect(resolveRouteTitle('/toekomst/inflatie-koopkracht')).toBe('Inflatie & koopkracht')
  })

  it('resolveert deep-app-tools met gestripte querystring (OVERVIEW_APP_SUBROUTES)', () => {
    expect(resolveRouteTitle('/overzicht/cashflow/budget')).toBe('Budgetteren')
  })

  it('resolveert globalNav-routes met een echte href', () => {
    expect(resolveRouteTitle('/nieuws')).toBe('Krant')
    expect(resolveRouteTitle('/berichten')).toBe('Berichten')
  })

  it('normaliseert querystring, hash en trailing slash', () => {
    expect(resolveRouteTitle('/overzicht/cashflow/budget?x=1')).toBe('Budgetteren')
    expect(resolveRouteTitle('/toekomst/doelen#sectie')).toBe('Doelen')
    expect(resolveRouteTitle('/toekomst/doelen/')).toBe('Doelen')
  })

  it('retourneert null voor onbekende of lege routes', () => {
    expect(resolveRouteTitle('/onbekend')).toBeNull()
    expect(resolveRouteTitle('')).toBeNull()
    // Exact-match: een dynamische detail-route matcht bewust niet (NavStackMeta dekt 'm).
    expect(resolveRouteTitle('/toekomst/bibliotheek/abc-123')).toBeNull()
  })

  it('guard — elke nav-route (incl. children) resolveert naar een niet-lege titel', () => {
    const allHrefs: string[] = [
      ...mainNav.map((m) => m.href),
    ]
    for (const group of navGroups) {
      for (const item of group.items) {
        allHrefs.push(item.href)
        for (const child of item.children ?? []) allHrefs.push(child.href)
      }
    }
    for (const href of allHrefs) {
      const title = resolveRouteTitle(href)
      expect(title, `route ${href} moet een titel resolven`).toBeTruthy()
    }
  })

  it('guard — elke EXTRA_ROUTE_TITLES-route resolveert naar zijn label', () => {
    for (const [href, label] of Object.entries(EXTRA_ROUTE_TITLES)) {
      expect(resolveRouteTitle(href)).toBe(label)
    }
  })
})

describe('SIMPLE_HIDDEN_NAV_HREFS', () => {
  it('bevat Rekenhulp en Wat-Als', () => {
    expect(SIMPLE_HIDDEN_NAV_HREFS).toContain('/toekomst/rekenhulp')
    expect(SIMPLE_HIDDEN_NAV_HREFS).toContain('/toekomst/whatif')
  })

  it('laat navGroups (bron-integriteit) ongemoeid — hrefs staan er nog steeds in', () => {
    const horizon = navGroups.find((g) => g.parent.href === '/toekomst')
    const hrefs = horizon!.items.map((i) => i.href)
    for (const hidden of SIMPLE_HIDDEN_NAV_HREFS) {
      expect(hrefs, `${hidden} moet in navGroups blijven`).toContain(hidden)
    }
  })

  it('laat resolveRouteTitle (TopBar-titel-fallback) intact voor verborgen routes', () => {
    expect(resolveRouteTitle('/toekomst/rekenhulp')).toBe('Rekenhulp')
    expect(resolveRouteTitle('/toekomst/whatif')).toBe('Wat-Als')
  })
})

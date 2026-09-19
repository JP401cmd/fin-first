import { describe, expect, it } from 'vitest'
import { buildBreadcrumbs } from './breadcrumb'
import {
  EXTRA_ROUTE_TITLES,
  LABEL_UITZONDERINGEN,
  globalNav,
  navGroups,
  resolveRouteTitle,
} from '@/lib/nav-config'

/**
 * KRUIMELPAD-LABELS — het kruimelpad zegt wat de nav al weet (UR3-30).
 *
 * Aanleiding: `components/app/breadcrumb.tsx` droeg een eigen labeltabel met
 * `humanizeSegment()` als terugval. Op 23 van de 41 crumb-dragende routes viel
 * de laatste crumb op die terugval terug, en acht labels dreven weg van de naam
 * die nav-config al kende: "Box1" vs "Box 1 · Werk + woning", "Feedback" vs
 * "Melden", "Lokale-chat" vs "Lokale chat", "Uiterlijk" vs "Weergave en
 * uiterlijk". Twee bronnen voor één naam, dus drift met de dag.
 *
 * Deze test leest de routes uit de nav-config zelf, niet uit een lijst die
 * iemand bijhoudt: een nieuwe subpagina wordt hier automatisch meegenomen.
 *
 * Bijt-proef: haal de `resolveRouteTitle`-aanroep uit `buildBreadcrumbs` →
 * rood op `/overzicht/belasting/box1` ("Box1").
 */

/** Routes waar daadwerkelijk een kruimelpad rendert (de drie app-layouts). */
const CRUMB_PREFIXES = ['/overzicht/', '/mijn/', '/core/']

function crumbRoutes(): string[] {
  const hrefs = new Set<string>()
  for (const groep of navGroups) {
    for (const item of groep.items) {
      hrefs.add(item.href)
      for (const kind of item.children ?? []) hrefs.add(kind.href)
    }
  }
  for (const item of globalNav) if (item.href) hrefs.add(item.href)
  for (const href of Object.keys(EXTRA_ROUTE_TITLES)) hrefs.add(href)

  return [...hrefs]
    .filter((h) => CRUMB_PREFIXES.some((p) => h.startsWith(p)))
    .filter((h) => !(h in LABEL_UITZONDERINGEN))
    .sort()
}

function lastLabel(pathname: string): string {
  const crumbs = buildBreadcrumbs(pathname)
  return crumbs[crumbs.length - 1]!.label
}

describe('kruimelpad — de laatste crumb volgt de canonieke naam', () => {
  const routes = crumbRoutes()

  it('vindt de crumb-dragende routes nog (anders toetst deze suite niets)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(15)
  })

  for (const route of routes) {
    const canoniek = resolveRouteTitle(route)
    it(`${route} → "${canoniek}"`, () => {
      expect(lastLabel(route)).toBe(canoniek)
    })
  }
})

describe('kruimelpad — geen rauwe slugs meer', () => {
  // De acht labels die wegdreven van de nav, expliciet benoemd: een
  // route-afgeleide lus dekt ze wel, maar laat niet zien wélk gedrag hier
  // vastligt. Deze rijen zijn de bevinding zelf.
  const HERSTELD: Array<[string, string]> = [
    ['/overzicht/belasting/box1', 'Box 1 · Werk + woning'],
    ['/overzicht/belasting/box2', 'Box 2 · Aanmerkelijk belang'],
    ['/overzicht/belasting/box3', 'Box 3 · Sparen + beleggen'],
    ['/overzicht/belasting/optimizer', 'Fiscale kansen'],
    ['/mijn/uiterlijk', 'Weergave en uiterlijk'],
    ['/mijn/lokale-chat', 'Lokale chat'],
    ['/mijn/feedback', 'Melden'],
  ]

  for (const [route, label] of HERSTELD) {
    it(`${route} toont "${label}"`, () => {
      expect(lastLabel(route)).toBe(label)
    })
  }

  it('een onbekend segment lekt geen koppelteken of underscore meer', () => {
    // `/core/checkin` kent de nav niet (die pagina levert zelf een
    // NavStackMeta-titel), dus dit blijft de terugval — maar dan wel een
    // leesbare: geen "Lokale-chat"-klasse meer.
    expect(lastLabel('/beheer/iets-onbekends')).toBe('Iets onbekends')
    expect(lastLabel('/beheer/iets_onbekends')).toBe('Iets onbekends')
  })

  it('elk crumb-label begint met een hoofdletter en draagt geen underscore', () => {
    for (const route of crumbRoutes()) {
      for (const crumb of buildBreadcrumbs(route)) {
        expect(crumb.label, `${route} → ${crumb.label}`).not.toContain('_')
        expect(crumb.label[0], `${route} → ${crumb.label}`).toBe(crumb.label[0]!.toUpperCase())
      }
    }
  })
})

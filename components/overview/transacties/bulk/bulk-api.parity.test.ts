/**
 * Bróntest: doet de client precies wat de routes aanbieden?
 *
 * ## Waarom dit een bróntest is en geen gedragstest
 *
 * Deze functionaliteit is in twee parallelle stromen gebouwd — de routes en de
 * overlay — en beide leverden een groene suite op terwijl ze niet op elkaar
 * aansloten. Twee fouten, allebei onzichtbaar voor een gewone test:
 *
 *  1. De overlay bouwde tijdelijk tegen zélf verzonnen paden
 *     (`/api/transactions/selection`, `/api/transactions/bulk-rule`). Zijn tests
 *     waren groen omdat ze zijn eigen mock aanriepen.
 *  2. De gedeelde `fetch`-helper stuurde overal `POST`, terwijl
 *     `bulk-budget` server-side alleen `PATCH` exporteert. In de browser is dat
 *     een 405; in de tests niets, want de UI mockt `fetch` en de route wordt
 *     rechtstreeks als functie aangeroepen.
 *
 * Een gedragstest kan dit per definitie niet vangen: zodra je `fetch` mockt, is
 * de tegenpartij weg. Daarom leest deze test de route-bestanden van schijf.
 * Verdwijnt een route of verandert zijn verb, dan wordt deze test rood — niet de
 * gebruiker.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { BULK_ROUTES } from './bulk-api'

/** `/api/transactions/bulk-budget` → `app/api/transactions/bulk-budget/route.ts` */
function routeFileFor(urlPath: string): string {
  return join(process.cwd(), 'app', ...urlPath.split('/').filter(Boolean), 'route.ts')
}

/** De HTTP-verbs die een route-bestand daadwerkelijk exporteert. */
function exportedVerbs(source: string): string[] {
  return [...source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b/g)].map(
    (m) => m[1],
  )
}

describe('bulk-api ↔ routes — pariteit', () => {
  const entries = Object.entries(BULK_ROUTES)

  it.each(entries)('%s: het pad bestaat als route-bestand', (_key, route) => {
    expect(existsSync(routeFileFor(route.path))).toBe(true)
  })

  it.each(entries)('%s: de route exporteert de methode die de client stuurt', (_key, route) => {
    const verbs = exportedVerbs(readFileSync(routeFileFor(route.path), 'utf8'))
    // Falen leest als "client stuurt PATCH, route biedt POST aan" — niet als
    // een kale false, zodat de oorzaak meteen op tafel ligt.
    expect({ path: route.path, stuurt: route.method, biedtAan: verbs }).toEqual({
      path: route.path,
      stuurt: route.method,
      biedtAan: expect.arrayContaining([route.method]),
    })
  })

  it('de reads muteren niet en de mutaties zijn geen GET', () => {
    // Zoeken loopt bewust over POST (het criterium is een object met lijsten en
    // nulls, en de zoekterm hoort niet in een URL of serverlog). Dat mag nooit
    // verglijden naar een route die óók muteert: dan hangt een bulkmutatie aan
    // een verb die caches en prefetchers als veilig behandelen.
    expect(BULK_ROUTES.search.method).toBe('POST')
    expect(BULK_ROUTES.manifest.method).toBe('POST')
    for (const [, route] of entries) {
      expect(route.method).not.toBe('GET')
    }
  })
})

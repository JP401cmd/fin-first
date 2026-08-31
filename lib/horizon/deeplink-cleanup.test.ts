/**
 * Regressietest bij UR2-11 — "Wat-Als is onbereikbaar: eigen route opent de
 * overlay nooit".
 *
 * De keten is: nav-link `/toekomst/whatif` → routing-laag-redirect →
 * `/toekomst?whatif=open` → `horizon-client.tsx` zet `whatIfInlineOpen`, klapt
 * "Verken je aannames" open en scrollt ernaartoe → daarna wordt de URL
 * opgeschoond. Die laatste stap schreef een hardgecodeerd `/horizon` terug, wat
 * op de routing-laag weer naar `/toekomst` redirect: een ROUTE-wissel, dus een
 * remount, dus was de zojuist gezette state meteen weg. De gebruiker landde op
 * een kale `/toekomst` zonder paneel.
 *
 * De grendel bestaat daarom uit twee delen:
 *  1. deze unit-test op de pure URL-bouwer — hij mag nooit een ander pad
 *     opleveren dan waar de gebruiker al staat;
 *  2. een bron-grendel op `horizon-client.tsx` (onderaan) — het bestand is
 *     >9000 regels en niet importeerbaar in een unit-test, dus de eis "de
 *     opschoning navigeert niet naar een andere route" wordt op de bron
 *     afgedwongen. Precedent: `horizon-client.euro-view.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildDeeplinkCleanupUrl, CONSUMED_DEEPLINK_PARAMS } from './deeplink-cleanup'

describe('buildDeeplinkCleanupUrl — blijft op de huidige route', () => {
  it('houdt /toekomst na een geconsumeerde ?whatif=open (kern van UR2-11)', () => {
    expect(buildDeeplinkCleanupUrl('/toekomst', 'whatif=open')).toBe('/toekomst')
  })

  it('levert nooit de legacy /horizon-route op — dát was de remount-oorzaak', () => {
    for (const qs of ['whatif=open', 'strategie=open', 'uitgaven=open', 'modal=scenarios']) {
      const url = buildDeeplinkCleanupUrl('/toekomst', qs)
      expect(url.startsWith('/toekomst'), `${qs} → ${url}`).toBe(true)
      expect(url).not.toContain('/horizon')
    }
  })

  it('werkt ook op de legacy backing-route zelf (geen kruisnavigatie)', () => {
    expect(buildDeeplinkCleanupUrl('/horizon', 'whatif=open')).toBe('/horizon')
  })

  it('verwijdert alle geconsumeerde params, ook gecombineerd', () => {
    expect(buildDeeplinkCleanupUrl('/toekomst', 'event=abc&edit=true&modal=strategie')).toBe(
      '/toekomst',
    )
  })

  it('laat niet-geconsumeerde params staan', () => {
    expect(buildDeeplinkCleanupUrl('/toekomst', 'whatif=open&focus=g1')).toBe('/toekomst?focus=g1')
  })

  it('accepteert een URLSearchParams net zo goed als een string', () => {
    const sp = new URLSearchParams({ whatif: 'open', view: 'jaren' })
    expect(buildDeeplinkCleanupUrl('/toekomst', sp)).toBe('/toekomst?view=jaren')
  })

  it('valt zonder pathname terug op de canonieke tijdas, niet op /horizon', () => {
    expect(buildDeeplinkCleanupUrl(null, 'whatif=open')).toBe('/toekomst')
    expect(buildDeeplinkCleanupUrl('', 'whatif=open')).toBe('/toekomst')
  })

  it('dekt precies de params die het mount-effect leest', () => {
    // Loopt deze lijst uit de pas met horizon-client, dan blijft er een
    // deeplink-param in de URL staan die bij een refresh het paneel opnieuw
    // opent (of erger: hij wordt weggegooid terwijl een view hem nodig heeft).
    expect([...CONSUMED_DEEPLINK_PARAMS]).toEqual([
      'modal',
      'strategie',
      'uitgaven',
      'event',
      'edit',
      'whatif',
    ])
  })
})

describe('bron-grendel — de deeplink-opschoning wisselt niet van route', () => {
  const SOURCE = readFileSync(
    join(process.cwd(), 'components', 'app', 'horizon', 'horizon-client.tsx'),
    'utf8',
  )

  it('schoont op via de gedeelde helper', () => {
    expect(SOURCE).toContain("from '@/lib/horizon/deeplink-cleanup'")
    expect(SOURCE).toContain('router.replace(buildDeeplinkCleanupUrl(pathname, searchParams)')
  })

  it('navigeert nergens meer naar een legacy /horizon-route', () => {
    // `router.replace('/horizon', …)` was de bug, en `triggerDream('/horizon/whatif')`
    // droeg hetzelfde risico: /horizon** redirect op de routing-laag, dus een
    // client-navigatie daarheen wisselt van route (remount → state weg) én zet
    // de router-URL op een pad dat niets rendert — de React #310-desync.
    // Cross-page-navigatie naar échte routes (/toekomst/doelen, /core/debts)
    // blijft gewoon toegestaan; alleen /horizon** is verboden.
    const offenders = SOURCE.split(/\r?\n/)
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .filter((line) => /(router\.(replace|push)|triggerDream)\(\s*['"`]\/horizon/.test(line))
    expect(offenders).toEqual([])
  })

  it('stuurt de dream-gate naar de canonieke what-if-route', () => {
    expect(SOURCE).toContain("triggerDream('/toekomst/whatif')")
    expect(SOURCE).not.toContain("triggerDream('/horizon/whatif')")
  })
})

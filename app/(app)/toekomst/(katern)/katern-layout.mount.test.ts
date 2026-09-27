/**
 * Mount-grens van de katern-layout (ADR 0179 fase 1 stap 16, kaart §2.3 GW1).
 *
 * Next houdt een layout gemonteerd zolang je binnen zijn segment navigeert; alleen de
 * page eronder wisselt. Het canvas blijft dus staan bij Plan ↔ Doelen ↔ Instellingen,
 * op twee voorwaarden die deze test bewaakt:
 *
 *  1. de katernen zijn pages onder dezelfde `(katern)/layout.tsx` (een page erbuiten
 *     krijgt een eigen boom — dan monteert het canvas bij elke wissel opnieuw);
 *  2. provider, canvas, katern-koppen en overlay-host worden ALLEEN door die layout
 *     gerenderd. Rendert een page ze zelf, dan staat er per katern een tweede instantie
 *     die bij elke wissel opnieuw monteert (en de sim opnieuw draait).
 *
 * De echte DOM-identiteit over een katernwissel is in de browser gemeten (rapport stap
 * 16 en de visuele check na stap 17): hetzelfde `horizon-hero`-element vóór en na de
 * klik op de katern-kop.
 */
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { codeOnly, readRel, reachableModules, routeEntryFiles } from '@/lib/test-utils/route-import-graph'

const GROEP = 'app/(app)/toekomst/(katern)'
const LAYOUT = `${GROEP}/layout.tsx`
const KATERN_PAGES = [`${GROEP}/page.tsx`, `${GROEP}/doelen/page.tsx`, `${GROEP}/instellingen/page.tsx`] as const

/** De gedeelde onderdelen die precies één keer, in de layout, horen te staan. */
const LAYOUT_BLOKKEN = [
  '<ToekomstStateProvider',
  '<ToekomstCanvas',
  '<ToekomstKaternKoppen',
  // Fase 2 (D6): de meldingen-host en het slot bovenaan het actieve katern.
  '<ToekomstKaternMeldingenProvider',
  '<ToekomstKaternMeldingSlot',
  '<ToekomstOverlayHost',
]
/** De bestanden die deze blokken definiëren (de provider noemt zichzelf in een foutmelding). */
const DEFINITIES = new Set([
  'components/toekomst/state/toekomst-state-provider.tsx',
  'components/toekomst/canvas/toekomst-canvas.tsx',
  'components/toekomst/layout/toekomst-katern-navigatie.tsx',
  'components/toekomst/overlays/toekomst-overlay-host.tsx',
  'components/toekomst/meldingen/toekomst-katern-meldingen.tsx',
])

describe('katern-layout — het canvas blijft gemonteerd bij een katernwissel (GW1)', () => {
  it('Plan, Doelen en Instellingen zijn pages onder dezelfde (katern)-layout', () => {
    expect(existsSync(path.join(process.cwd(), LAYOUT))).toBe(true)
    const entries = routeEntryFiles(GROEP)
    for (const page of KATERN_PAGES) {
      expect(entries, `${page} hoort in de (katern)-groep`).toContain(page)
    }
    // De oude losse routes mogen niet terugkomen: die zouden de layout omzeilen.
    for (const oud of ['app/(app)/toekomst/page.tsx', 'app/(app)/toekomst/doelen/page.tsx', 'app/(app)/toekomst/instellingen/page.tsx']) {
      expect(existsSync(path.join(process.cwd(), oud)), `${oud} omzeilt de katern-layout`).toBe(false)
    }
  })

  it('de layout rendert provider, canvas, katern-koppen en overlay-host', () => {
    const layout = codeOnly(readRel(LAYOUT))
    for (const blok of LAYOUT_BLOKKEN) {
      expect(layout, `${blok} ontbreekt in de layout`).toContain(blok)
    }
    // …en het katern als kind, ná het canvas: alleen `{children}` wisselt.
    expect(layout.indexOf('{children}')).toBeGreaterThan(layout.indexOf('<ToekomstCanvas'))
    // Het meldingenslot staat bovenaan het katern: ná de koppen, vóór het katern.
    expect(layout.indexOf('<ToekomstKaternMeldingSlot')).toBeGreaterThan(layout.indexOf('<ToekomstKaternKoppen'))
    expect(layout.indexOf('<ToekomstKaternMeldingSlot')).toBeLessThan(layout.indexOf('{children}'))
  })

  it('de tabbladen staan boven het canvas, één exemplaar voor elke breedte (eigenaarswens 27 sep)', () => {
    const layout = codeOnly(readRel(LAYOUT))
    const koppen = layout.indexOf('<ToekomstKaternKoppen')
    expect(layout.split('<ToekomstKaternKoppen').length - 1).toBe(1)
    expect(koppen).toBeGreaterThan(-1)
    expect(koppen).toBeLessThan(layout.indexOf('<ToekomstCanvas'))
    // Geen breedte-klassen: dezelfde koppen op mobiel en desktop.
    expect(layout.slice(koppen, layout.indexOf('/>', koppen))).not.toMatch(/hidden/)
    // Het katern sluit direct onder het canvas aan.
    expect(layout.indexOf('{children}')).toBeGreaterThan(layout.indexOf('<ToekomstCanvas'))
  })

  it('de layout-laag ruimt een meegereisde ?tab= op, binnen Suspense (fixronde C1)', () => {
    const layout = codeOnly(readRel(LAYOUT))
    expect(layout).toMatch(/<Suspense fallback=\{null\}>\s*<OudeTabParam \/>\s*<\/Suspense>/)
  })

  it.each(KATERN_PAGES)('%s rendert geen tweede provider, canvas of overlay-host', (page) => {
    for (const mod of reachableModules([page])) {
      if (DEFINITIES.has(mod)) continue
      const src = codeOnly(readRel(mod))
      for (const blok of LAYOUT_BLOKKEN) {
        expect(src, `${mod} (bereikbaar vanuit ${page}) rendert ${blok}`).not.toContain(blok)
      }
    }
  })
})

describe('katern-pages laden alleen hun eigen deel (review fase 1, TTFB bij een katernwissel)', () => {
  // Bij client-navigatie rendert de layout niet opnieuw, dus `cache()` ontdubbelt dan
  // niets: een page die `loadToekomstData()` aanroept, draait de volle lading
  // (horizon-kernel, plan-oordeel, plan-review) voor één veld.
  it.each([`${GROEP}/doelen/page.tsx`, `${GROEP}/instellingen/page.tsx`])('%s roept loadToekomstData() niet aan', (page) => {
    expect(codeOnly(readRel(page))).not.toMatch(/loadToekomstData\(/)
  })

  it('Doelen leest alleen de Fin-deel-lading', () => {
    expect(codeOnly(readRel(`${GROEP}/doelen/page.tsx`))).toContain('loadToekomstFinData()')
  })
})

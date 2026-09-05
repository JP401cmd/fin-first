/**
 * Bron-grendel op de BLOKVOLGORDE bovenaan /overzicht (H20).
 *
 * De bevinding: de banners stonden bóven de begroeting — op een vers account
 * was het eerste scherm een lijstje, vóór je naam en vóór elk bedrag, terwijl
 * het welkomstscherm "geen klinisch dashboard, een rustig overzicht" belooft.
 * Besluit eigenaar 26-08-2026 = optie B: alléén de volgorde corrigeren; het
 * blokkenaantal in de Volledige weergave blijft (besluit 9 aug 2026).
 *
 * De welkomstgids was destijds de eerste bewoner van het `banners`-slot. Sinds
 * ADR 0130 woont hij in Fin en is de check-in de eerste banner — de grendel
 * blijft, met de check-in als anker.
 *
 * WAAROM EEN BRON-TEST: de volgorde is puur een JSX-eigenschap van de
 * pagina-compositie. Een render-test zou `OverzichtHeroPrimary` (client
 * component met dynamic import, BottomSheet en weergavemodus-context) moeten
 * optuigen om precies één ding te bewijzen dat letterlijk in de bron staat — en
 * zou bovendien niet vangen dat iemand de banners in `page.tsx` weer vóór de
 * hero hangt. Precedent: `overzicht-secondary.briefing-props.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pageSource = readFileSync(
  join(process.cwd(), 'app', '(app)', 'overzicht', 'page.tsx'),
  'utf8',
)
const heroSource = readFileSync(
  join(process.cwd(), 'components', 'overview', 'overzicht-hero.tsx'),
  'utf8',
)

/** Index van een fragment, met een sprekende fout als het ontbreekt. */
function at(source: string, needle: string, where: string): number {
  const i = source.indexOf(needle)
  expect(i, `"${needle}" niet gevonden in ${where} — grendel staat stil`).toBeGreaterThan(-1)
  return i
}

describe('/overzicht — de banners staan ná de begroeting (H20)', () => {
  it('page.tsx hangt de banners IN de hero, niet ervóór', () => {
    const hero = at(pageSource, '<OverzichtHeroPrimary', 'page.tsx')
    expect(
      at(pageSource, '<CheckinBanner', 'page.tsx'),
      'CheckinBanner staat weer vóór <OverzichtHeroPrimary> — dat is precies H20',
    ).toBeGreaterThan(hero)
  })

  it('page.tsx levert ze aan via het `banners`-slot', () => {
    const slot = at(pageSource, 'banners={', 'page.tsx')
    expect(at(pageSource, '<CheckinBanner', 'page.tsx')).toBeGreaterThan(slot)
  })

  it('de hero rendert het slot ná de begroeting en vóór het hefbomen-kompas', () => {
    const headline = at(heroSource, '<EditorialHeadline', 'overzicht-hero.tsx')
    const headerEnd = at(heroSource, '</header>', 'overzicht-hero.tsx')
    const banners = at(heroSource, '{banners}', 'overzicht-hero.tsx')
    const hefbomen = at(heroSource, '<HefbomenNav', 'overzicht-hero.tsx')

    expect(headerEnd).toBeGreaterThan(headline)
    expect(banners, 'de banners horen ná de begroeting').toBeGreaterThan(headerEnd)
    expect(banners, 'de banners horen vóór het hefbomen-kompas').toBeLessThan(hefbomen)
  })

  /**
   * De rondleiding loopt de hero in leesvolgorde af: eerst de vier hefbomen,
   * dan de gezondheidskaart, dan de grafiek (ADR 0130). Die volgorde is een
   * JSX-eigenschap van dit bestand, niet iets wat de spotlight afdwingt — hij
   * pakt de stappen in de volgorde van `RONDLEIDING_STAPPEN`. Draait iemand de
   * twee hero-cellen om, dan springt de spotlight zonder waarschuwing van rechts
   * naar links en terug. Vandaar dezelfde bron-grendel als hierboven.
   */
  it('de tour-ankers staan in de volgorde hefbomen → gezondheid → grafiek', () => {
    const hefbomen = at(heroSource, '<HefbomenNav', 'overzicht-hero.tsx')
    const gezondheid = at(heroSource, 'data-tour="gezondheid"', 'overzicht-hero.tsx')
    const grafiek = at(heroSource, 'data-tour="grafiek"', 'overzicht-hero.tsx')

    expect(gezondheid, 'gezondheid hoort ná het hefbomen-kompas').toBeGreaterThan(hefbomen)
    expect(grafiek, 'de grafiek hoort ná de gezondheidskaart').toBeGreaterThan(gezondheid)
  })

  it('de delta-regel (H11) blijft bij de begroeting staan, in de header', () => {
    const headline = at(heroSource, '<EditorialHeadline', 'overzicht-hero.tsx')
    const note = at(heroSource, '{greetingNote}', 'overzicht-hero.tsx')
    const headerEnd = at(heroSource, '</header>', 'overzicht-hero.tsx')
    expect(note).toBeGreaterThan(headline)
    expect(note).toBeLessThan(headerEnd)
  })
})

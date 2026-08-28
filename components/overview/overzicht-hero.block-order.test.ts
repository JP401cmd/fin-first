/**
 * Bron-grendel op de BLOKVOLGORDE bovenaan /overzicht (H20).
 *
 * De bevinding: de welkomstgids stond bóven de begroeting — op een vers account
 * was het eerste scherm een checklist, vóór je naam en vóór elk bedrag, terwijl
 * het welkomstscherm "geen klinisch dashboard, een rustig overzicht" belooft.
 * Besluit eigenaar 26-08-2026 = optie B: alléén de volgorde corrigeren; het
 * blokkenaantal in de Volledige weergave blijft (besluit 9 aug 2026).
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

describe('/overzicht — gids- en check-inbanner staan ná de begroeting (H20)', () => {
  it('page.tsx hangt de banners IN de hero, niet ervóór', () => {
    const hero = at(pageSource, '<OverzichtHeroPrimary', 'page.tsx')
    expect(
      at(pageSource, '<WelcomeGuideBanner', 'page.tsx'),
      'WelcomeGuideBanner staat weer vóór <OverzichtHeroPrimary> — dat is precies H20',
    ).toBeGreaterThan(hero)
    expect(
      at(pageSource, '<CheckinBanner', 'page.tsx'),
      'CheckinBanner staat weer vóór <OverzichtHeroPrimary> — dat is precies H20',
    ).toBeGreaterThan(hero)
  })

  it('page.tsx levert ze aan via het `banners`-slot', () => {
    const slot = at(pageSource, 'banners={', 'page.tsx')
    expect(at(pageSource, '<WelcomeGuideBanner', 'page.tsx')).toBeGreaterThan(slot)
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

  it('de delta-regel (H11) blijft bij de begroeting staan, in de header', () => {
    const headline = at(heroSource, '<EditorialHeadline', 'overzicht-hero.tsx')
    const note = at(heroSource, '{greetingNote}', 'overzicht-hero.tsx')
    const headerEnd = at(heroSource, '</header>', 'overzicht-hero.tsx')
    expect(note).toBeGreaterThan(headline)
    expect(note).toBeLessThan(headerEnd)
  })
})

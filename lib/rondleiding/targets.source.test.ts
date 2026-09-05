/**
 * Bron-grendel op het TARGET-CONTRACT van de rondleiding (ADR 0130).
 *
 * ── Waarom een bron-test en geen render-test ────────────────────────────────
 * De spotlight vindt zijn element met één `document.querySelector`. Verdwijnt
 * er ergens een `data-tour`-attribuut — bij een restyling, een refactor van de
 * hero-cellen, of een herbouw van de nav-pill — dan blijft ALLES compileren en
 * blijft elke render-test groen; alleen de rondleiding wijst dan in het niets,
 * en dat merk je pas als iemand hem live start. Een render-test zou daar niet
 * bij helpen: de zijbalk, de nav-pill en Fins companion leven in de shell, niet
 * op /overzicht, en zouden per stuk moeten worden opgetuigd om precies één
 * attribuut te bewijzen dat letterlijk in de bron staat.
 *
 * Deze suite leest dus de bronbestanden en eist dat de HOUDER van elke selector
 * er nog is. Precedent: `overzicht-hero.block-order.test.ts`.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RONDLEIDING_STAPPEN, resolveRondleidingStappen } from './steps'

const lees = (...pad: string[]) => readFileSync(join(process.cwd(), ...pad), 'utf8')

const BRON = {
  hero: lees('components', 'overview', 'overzicht-hero.tsx'),
  hefbomenNav: lees('components', 'overview', 'overzicht-hero', 'hefbomen-nav.tsx'),
  leverageCard: lees('components', 'overview', 'leverage-card.tsx'),
  finHome: lees('components', 'app', 'fin', 'fin-home.tsx'),
  sidebar: lees('components', 'app', 'shell', 'sidebar.tsx'),
  pill: lees('components', 'app', 'shell', 'floating-nav-button.tsx'),
}

/**
 * Per selector: in welk bestand hij zijn houder heeft, en welke letterlijke
 * tekst daar moet staan. De vier hefboom-selectors worden GETEMPLATEERD
 * (`hefboom-${key}`), dus daarvoor is de eis een drieluik: de kaart-shell reikt
 * het attribuut door, de nav vult het, en de key staat in de tegel-lijst.
 */
const HOUDERS: Record<string, { bron: string; eist: string[] }> = {
  '[data-tour="hefboom-bezittingen"]': {
    bron: 'hefbomen-nav.tsx',
    eist: ['dataTour={`hefboom-${key}`}', "key: 'bezittingen'"],
  },
  '[data-tour="hefboom-schulden"]': {
    bron: 'hefbomen-nav.tsx',
    eist: ['dataTour={`hefboom-${key}`}', "key: 'schulden'"],
  },
  '[data-tour="hefboom-cashflow"]': {
    bron: 'hefbomen-nav.tsx',
    eist: ['dataTour={`hefboom-${key}`}', "key: 'cashflow'"],
  },
  '[data-tour="hefboom-belasting"]': {
    bron: 'hefbomen-nav.tsx',
    eist: ['dataTour={`hefboom-${key}`}', "key: 'belasting'"],
  },
  '[data-tour="gezondheid"]': { bron: 'overzicht-hero.tsx', eist: ['data-tour="gezondheid"'] },
  '[data-tour="grafiek"]': { bron: 'overzicht-hero.tsx', eist: ['data-tour="grafiek"'] },
  '[data-tour="fin"]': { bron: 'fin-home.tsx', eist: ['data-tour="fin"'] },
  '#app-sidebar': { bron: 'sidebar.tsx', eist: ['id="app-sidebar"'] },
  '[data-mobile-floating-nav]': {
    bron: 'floating-nav-button.tsx',
    eist: ['data-mobile-floating-nav'],
  },
}

const BRON_PER_NAAM: Record<string, string> = {
  'overzicht-hero.tsx': BRON.hero,
  'hefbomen-nav.tsx': BRON.hefbomenNav,
  'fin-home.tsx': BRON.finHome,
  'sidebar.tsx': BRON.sidebar,
  'floating-nav-button.tsx': BRON.pill,
}

describe('rondleiding — elke selector heeft een houder in de bron', () => {
  const selectors = new Set<string>()
  for (const stap of RONDLEIDING_STAPPEN) {
    if (stap.target?.desktop) selectors.add(stap.target.desktop)
    if (stap.target?.mobiel) selectors.add(stap.target.mobiel)
  }

  for (const selector of selectors) {
    it(`${selector} bestaat nog`, () => {
      const houder = HOUDERS[selector]
      expect(
        houder,
        `Nieuwe selector "${selector}" zonder houder in deze tabel — voeg 'm toe, anders bewaakt niets 'm.`,
      ).toBeDefined()
      const src = BRON_PER_NAAM[houder.bron]
      expect(src, `Onbekend bronbestand "${houder.bron}"`).toBeDefined()
      for (const fragment of houder.eist) {
        expect(
          src.includes(fragment),
          `"${fragment}" staat niet meer in ${houder.bron} — de rondleiding wijst dan in het niets`,
        ).toBe(true)
      }
    })
  }

  it('de kaart-shell reikt `data-tour` door in álle varianten', () => {
    // Twee keer: de `compact`-tak en de gedeelde `full`/`verdict`-tak. In
    // Eenvoudig rendert de tegel als `verdict`, en dáár moet de spotlight 'm
    // even goed kunnen vinden.
    const treffers = BRON.leverageCard.split('data-tour={dataTour}').length - 1
    expect(treffers, 'leverage-card.tsx reikt data-tour niet meer in elke variant door').toBe(2)
  })

  it('elke stap met een hoofdstuk heeft ook een target voor minstens één platform', () => {
    for (const stap of RONDLEIDING_STAPPEN) {
      if (!stap.hoofdstuk) continue
      expect(
        stap.target?.desktop ?? stap.target?.mobiel,
        `stap "${stap.id}" heeft geen enkel target`,
      ).toBeTruthy()
    }
  })

  it('de shell-stappen zijn optioneel — ze kunnen legitiem ontbreken', () => {
    // Zijbalk, Fin-companion en nav-pill kunnen wegvallen (smal venster, gedokte
    // chat, verborgen pill). Ze moeten daarom een STAP OVERSLAAN toestaan in
    // plaats van de rondleiding te laten hangen.
    for (const id of ['zijbalk', 'fin', 'pill'] as const) {
      const stap = RONDLEIDING_STAPPEN.find((s) => s.id === id)!
      expect(stap.optioneel, `stap "${id}" hoort optioneel te zijn`).toBe(true)
    }
    // De hero-stappen juist NIET: die horen er altijd te zijn, en een stille
    // overslag zou een echt defect verbergen.
    for (const stap of resolveRondleidingStappen('desktop')) {
      if (['zijbalk', 'fin', 'pill', 'welkom'].includes(stap.id)) continue
      expect(stap.optioneel, `stap "${stap.id}" hoort NIET optioneel te zijn`).toBeFalsy()
    }
  })
})

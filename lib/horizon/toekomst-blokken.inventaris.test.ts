/**
 * Vangnet fase 1 "/toekomst in drie katernen" (ADR 0179) — geen blok gaat
 * verloren en geen blok verspringt, terwijl `horizon-client.tsx` wordt ontleed.
 *
 * Fase 1 belooft: "alles wat vandaag werkt, werkt na deze fase op dezelfde
 * manier op een andere plek" (spec §9). De 17 bron-scans op
 * `horizon-client.tsx` pinnen elk één rekeninvariant, maar niets pinde dát een
 * blok nog op /toekomst staat, of in welke volgorde. Dit bestand doet dat
 * zonder aan een bestandsnaam te hangen:
 *
 *  1. INVENTARIS — elk blok hieronder wordt gerenderd (`<Naam`) door een module
 *     die de /toekomst-routes laden (alle `page.tsx`/`layout.tsx` onder
 *     `app/(app)/toekomst` + hun imports). Verhuist een blok naar
 *     `components/toekomst/plan/…` of naar de Doelen-katern, dan blijft dit
 *     groen; valt het tussen wal en schip, dan wordt het rood.
 *  2. VOLGORDE — staan twee blokken in HETZELFDE bestand, dan in de volgorde
 *     van vandaag. Blokken die uit elkaar gaan (canvas in de layout, lab in
 *     Doelen) leggen elkaar niets op; blokken die samen blijven, verspringen niet.
 *
 * Gemeten 26 sep 2026 (render-volgorde in horizon-client.tsx, r. 5870–7958;
 * visuele baseline: kop → navkaarten → I "Waar je staat" (drieslag, KPI, grafiek,
 * Inkomen & Uitgaven, fasebalk) → doelscenario "Wanneer kun je stoppen?" →
 * III "Wat het betekent" (levensinkomenstrook, dekkingsradar) → verloop).
 *
 * Verwachte, bewuste wijzigingen: fase 4 verhuist `ScenarioKaarten` naar Doelen
 * (volgorde-paar met Dekkingsradar vervalt dan vanzelf); fase 5 haalt
 * `HorizonTrendGrid` naar /overzicht — haal hem dán uit INVENTARIS, niet eerder.
 */
import { describe, it, expect } from 'vitest'
import {
  codeOnly,
  reachableModules,
  readRel,
  routeEntryFiles,
} from '@/lib/test-utils/route-import-graph'

/** Render-volgorde van vandaag, van boven naar beneden. */
const VOLGORDE = [
  'AnkerDrieslag',
  'LifelineReadout',
  'SimChart',
  'WealthCompositionChart',
  'IncomeExpenseChart',
  'EventsTimeline',
  'PhaseBar',
  'LabKnoppen',
  'WhatIfMarketAssumptions',
  'LabOpslaanBalk',
  'LevensinkomenStrook',
  'Dekkingsradar',
  'ScenarioKaarten',
  'HouseholdFireSection',
  'HorizonTrendGrid',
] as const

/** Blokken zonder vaste plek in de leesvolgorde (sheets/panes), wel verplicht aanwezig. */
const OVERLAYS = ['DoelVastlegSheet', 'HorizonYearDetailsSheet', 'EventPane', 'PlanReviewProvider'] as const

/** De katern-inhoud van vandaag op de subroutes (stroom B stapelt ze in Instellingen). */
const SUBPAGINA_VIEWS = ['DoelenView', 'VoorkeurenView', 'GebeurtenissenView', 'AfbouwOverzichtCard'] as const

/**
 * Render-plekken die NIET de /toekomst-grafiek zijn maar wel in de graaf zitten:
 * de dashboard-widget en de grafiek-uitleg tekenen óók een `<SimChart`. Zonder
 * deze uitsluiting blijft de inventaris groen als het hoofdcanvas zijn grafiek kwijt is.
 */
const NIET_HET_CANVAS: Record<string, RegExp> = {
  SimChart: /(sim-chart-widget|grafiek-uitleg)/,
}

const modules = reachableModules(routeEntryFiles('app/(app)/toekomst'))
const bronnen = modules.map((rel) => ({ rel, code: codeOnly(readRel(rel)) }))

const renderRe = (naam: string) => new RegExp(`<${naam}\\b`)

function renderPlekken(naam: string): string[] {
  const uitgesloten = NIET_HET_CANVAS[naam]
  return bronnen
    .filter((b) => renderRe(naam).test(b.code))
    .map((b) => b.rel)
    .filter((rel) => !(uitgesloten && uitgesloten.test(rel)))
}

describe('/toekomst-blokken — inventaris (geen blok valt weg bij de decompositie)', () => {
  it('de route-graaf is echt gevonden (de scan mag niet leeg draaien)', () => {
    expect(modules.length).toBeGreaterThan(50)
  })

  for (const naam of [...VOLGORDE, ...OVERLAYS, ...SUBPAGINA_VIEWS]) {
    it(`<${naam}> wordt gerenderd door een module van de /toekomst-routes`, () => {
      expect(renderPlekken(naam), `${naam} staat nergens meer op /toekomst`).not.toEqual([])
    })
  }
})

describe('/toekomst-blokken — volgorde (blokken die samen blijven, verspringen niet)', () => {
  it('binnen elk bestand staan de blokken in de volgorde van vandaag', () => {
    const afwijkingen: string[] = []
    for (const { rel, code } of bronnen) {
      const posities = VOLGORDE.map((naam) => ({ naam, at: code.search(renderRe(naam)) })).filter(
        (p) => p.at >= 0,
      )
      for (let i = 1; i < posities.length; i++) {
        if (posities[i].at < posities[i - 1].at) {
          afwijkingen.push(`${rel}: <${posities[i].naam}> staat vóór <${posities[i - 1].naam}>`)
        }
      }
    }
    expect(afwijkingen).toEqual([])
  })

  it('de volgorde-toets heeft vandaag echt iets te vergelijken', () => {
    // Zonder een bestand met ≥ 2 blokken bewijst de toets hierboven niets. Vandaag
    // is dat horizon-client.tsx; ná fase 1 het canvas- of plan-bestand. Zakt dit
    // naar nul, dan is elk blok een eigen bestand — kies dan een fijnere toets.
    const metMeerdere = bronnen.filter(
      ({ code }) => VOLGORDE.filter((naam) => renderRe(naam).test(code)).length >= 2,
    )
    expect(metMeerdere.length).toBeGreaterThan(0)
  })
})

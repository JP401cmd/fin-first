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
 * Fase 2 (W3, bewust): in katern Plan staat de ankerdrieslag niet meer boven de KPI's
 * maar eronder — volgorde KPI-strip (`PlanKpiStrip`, één `FiguresStrip`) → ankerdrieslag
 * en voortgangsbalk (`PlanAnkerEnVoortgang`) → verdieping → jaar-op-jaar-link (spec §4.3).
 * De duidingszin en het grote mobiele kerngetal zijn vervallen (geen blok in deze lijst).
 * `AnkerDrieslag` blijft in VOLGORDE staan: hij deelt geen bestand met de grafiek, dus de
 * paartoets legt hem niets op; de Plan-volgorde staat in de aparte toets onderaan.
 *
 * Fase 2 (W1, bewust): het canvas verliest de tien pills (`CanvasPills` + `PillRow`), de
 * vijf `ChartOverlayExplainer`-blokken en de voetnoot met de strategie-hint onder de
 * grafiek; zie CANVAS_GESCHRAPT en CANVAS_GESCHRAPTE_TEKST. Hun opvolgers (modus-switch,
 * Lagen-menu, aannamesregel, marktcheck-getallen) staan in CANVAS_NIEUW en zijn verplicht.
 * `IncomeExpenseChart` is van uitklap modus Geldstroom geworden en houdt zijn plek in
 * VOLGORDE (na Samenstelling, vóór de tijdlijn).
 *
 * Verwachte, bewuste wijzigingen: fase 4 verhuist `ScenarioKaarten` naar Doelen. Het
 * addendum van 26 sep haalde fase 5 naar voren (`HorizonTrendGrid` naar /overzicht) en
 * schrapte levensinkomenstrook en dekkingsradar: zie PLAN_GESCHRAPT.
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
  'ScenarioKaarten',
  'HouseholdFireSection',
] as const

/**
 * Addendum 26 sep (ADR 0179, eigenaarsbesluit) — BEWUST van Plan af: de
 * levensinkomenstrook en de dekkingsradar (verwijderd), het verloop-grid (fase 5 naar
 * voren: het verloop staat in de gezondheidskassabon op /overzicht) en de scenario-chip
 * die alleen die twee duidingsblokken droeg.
 */
const PLAN_GESCHRAPT = ['LevensinkomenStrook', 'Dekkingsradar', 'HorizonTrendGrid', 'ScenarioChip', 'ActionCard'] as const

/** Addendum 26 sep — de geplande acties staan op /overzicht/tips, niet meer op Plan. */
const PLAN_GESCHRAPTE_TEKST = ['Geplande acties (komend jaar)'] as const

/** Blokken zonder vaste plek in de leesvolgorde (sheets/panes), wel verplicht aanwezig. */
const OVERLAYS = ['DoelVastlegSheet', 'HorizonYearDetailsSheet', 'EventPane', 'PlanReviewProvider'] as const

/**
 * Fase 2 (ADR 0179 D2/D6, stroom W2) — BEWUSTE aanpassing: de kop (oordeelzin +
 * ankerregel), de katern-koppen en het meldingenslot per katern zijn nieuwe, verplichte
 * blokken van de katern-layout.
 */
const KATERN_LAAG = ['PageVerdictOpening', 'ToekomstAnkerregel', 'KaternKoppen', 'KaternMelding'] as const

/**
 * Fase 2 — BEWUST verdwenen: de meldingen boven de grafiek (`PlanMeldingen`, met daarin
 * de eindsituatie-uitleg), de drie statuspunten in de paginakop en de lab-melding in de
 * doelenlijst. Ze gingen op in het meldingenslot per katern (`KaternMelding`) en het
 * punt op de katern-kop. Komt er één terug, dan staan er weer twee meldingen voor
 * dezelfde toestand op het scherm.
 */
const VERDWENEN = [
  'PlanMeldingen',
  'EindsituatieNotice',
  'DeficitNoticeDot',
  'AowNoticeDot',
  'EindsituatieNoticeDot',
  'LabPlanMelding',
] as const

/** Fase 2 (W1) — BEWUST nieuw: de canvasbediening die de pills en explainers vervangt. */
const CANVAS_NIEUW = ['ModusSwitch', 'LagenMenu', 'Aannamesregel', 'MarktcheckGetallen'] as const

/** Fase 2 (W1) — BEWUST geschrapt: de pillenrij en de laaguitleg boven de grafiek. */
const CANVAS_GESCHRAPT = ['CanvasPills', 'PillRow', 'ChartOverlayExplainer'] as const

/**
 * Fase 2 (W1) — de strategie-hint onder de grafiek had geen eigen component; dit zijn
 * zijn teksten. (De voetnoot-knop "Open de jaar-op-jaar-tabel" bestaat bewust nog wél:
 * als link-rij in het Plan-paneel, spec §4.9.)
 */
const CANVAS_GESCHRAPTE_TEKST = ['Stopmoment wijzigen', 'Zelf een stopmoment kiezen'] as const

/**
 * Fase 2 (fixronde B, spec §4.8/§4.9) — BEWUST geschrapt: de "Vul profiel aan"-actie
 * onder de KPI-rij van Plan. Ontbrekende gegevens hebben één ingang naar /mijn/profiel:
 * het meldingenslot van Instellingen (`instellingen-gegevens`). De KPI-waarde "We missen
 * gegevens" blijft, want dat is de weergave van de waarde zelf.
 */
const DUBBELE_INGANG_GESCHRAPT = ['hero-missende-gegevens-cta', 'Vul profiel aan'] as const

/**
 * De katern-inhoud op de subroutes. Fase 3 (ADR 0179): de Voorkeuren-kaarten werden rijen
 * (`InstellingenRijen`); `AfbouwOverzichtCard` verhuist naar de verdieping van Plan
 * (`PlanAfbouwOverzicht`, spec §5) — die montage staat nog uit (orchestrator) en komt dan
 * hier terug in de lijst.
 */
const SUBPAGINA_VIEWS = ['DoelenView', 'InstellingenRijen', 'GebeurtenissenView', 'PlanAfbouwOverzicht'] as const

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

  for (const naam of [...VOLGORDE, ...OVERLAYS, ...SUBPAGINA_VIEWS, ...KATERN_LAAG, ...CANVAS_NIEUW]) {
    it(`<${naam}> wordt gerenderd door een module van de /toekomst-routes`, () => {
      expect(renderPlekken(naam), `${naam} staat nergens meer op /toekomst`).not.toEqual([])
    })
  }

  for (const naam of VERDWENEN) {
    it(`<${naam}> staat bewust niet meer op /toekomst (fase 2, meldingen per katern)`, () => {
      expect(renderPlekken(naam)).toEqual([])
    })
  }

  for (const naam of PLAN_GESCHRAPT) {
    it(`<${naam}> staat bewust niet meer op /toekomst (addendum 26 sep)`, () => {
      expect(renderPlekken(naam)).toEqual([])
    })
  }

  for (const tekst of PLAN_GESCHRAPTE_TEKST) {
    it(`"${tekst}" staat bewust niet meer op /toekomst (addendum 26 sep)`, () => {
      expect(bronnen.filter((b) => b.code.includes(tekst)).map((b) => b.rel)).toEqual([])
    })
  }

  for (const naam of CANVAS_GESCHRAPT) {
    it(`<${naam}> staat bewust niet meer op /toekomst (fase 2, canvas)`, () => {
      expect(renderPlekken(naam)).toEqual([])
    })
  }

  for (const tekst of CANVAS_GESCHRAPTE_TEKST) {
    it(`de voetnoottekst "${tekst}" staat bewust niet meer op /toekomst (fase 2, canvas)`, () => {
      expect(bronnen.filter((b) => b.code.includes(tekst)).map((b) => b.rel)).toEqual([])
    })
  }

  for (const tekst of DUBBELE_INGANG_GESCHRAPT) {
    it(`"${tekst}" staat bewust niet meer op /toekomst (één ingang naar ontbrekende gegevens)`, () => {
      expect(bronnen.filter((b) => b.code.includes(tekst)).map((b) => b.rel)).toEqual([])
    })
  }

  it('ontbrekende gegevens wonen in het meldingenslot van Instellingen, met de actie naar je profiel', () => {
    const toewijzing = codeOnly(readRel('lib/horizon/katern-meldingen.ts'))
    expect(toewijzing).toContain("id: 'instellingen-gegevens'")
    expect(toewijzing).toContain('href: PROFIEL_HREF')
  })
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

describe('/toekomst-blokken — katern Plan (fase 2, spec §4.3)', () => {
  // Addendum 26 sep: de levensgebeurtenissen staan tussen de voortgang en de verdieping.
  // 27 sep: onder `lg` op deze plek (`PlanGebeurtenissen plek="pagina"`, met de
  // jaar-op-jaar-link onder de verdieping); vanaf `lg` in de kolom naast de grafiek.
  const PLAN_VOLGORDE = ['PlanKpiStrip', 'PlanAnkerEnVoortgang', 'PlanGebeurtenissen', 'PlanVerdieping', 'PlanJaartabelLink'] as const
  const plan = codeOnly(readRel('components/toekomst/plan/plan-paneel.tsx'))

  it('KPI-strip → ankerdrieslag en voortgangsbalk → gebeurtenissen → verdieping → jaar-op-jaar-tabel', () => {
    const posities = PLAN_VOLGORDE.map((naam) => plan.search(renderRe(naam)))
    expect(posities.every((p) => p >= 0), PLAN_VOLGORDE.join(', ')).toBe(true)
    expect([...posities].sort((x, y) => x - y)).toEqual(posities)
    const sectie = codeOnly(readRel('components/toekomst/plan/plan-gebeurtenissen.tsx'))
    expect(renderRe('GebeurtenissenMetHoofdrun').test(sectie)).toBe(true)
  })

  it('de jaar-op-jaar-tabel heeft één ingang per breekpunt: de link in Plan (spec §4.2 regel 10)', () => {
    // Twee knoppen naar dezelfde tabel (Details in de canvaskop én de link in Plan) is
    // precies wat §4.2 regel 10 verbiedt; de wireframe (§4.3 regel 7) houdt de link.
    // Sinds 27 sep staat hij bij de gebeurtenissen: in de kolom vanaf `lg`, op de pagina
    // eronder (`lg:hidden`) — nooit twee tegelijk zichtbaar.
    const openers = bronnen
      .filter(({ code }) => code.includes('setSimModalOpen(true)'))
      .map(({ rel }) => rel.replace(/\\/g, '/'))
    expect(openers).toEqual(['components/toekomst/plan/plan-gebeurtenissen.tsx'])
    const sectie = codeOnly(readRel('components/toekomst/plan/plan-gebeurtenissen.tsx'))
    expect(sectie).toContain('<p className="mt-6 sm:mt-8 lg:hidden">')
  })

  it('de drieslag staat onder de KPI-strip, in het voortgangsblok', () => {
    const blok = codeOnly(readRel('components/toekomst/plan/plan-hero-duiding.tsx'))
    expect(renderRe('AnkerDrieslag').test(blok)).toBe(true)
  })
})

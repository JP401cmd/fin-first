/**
 * De stand van het canvas per katern (ADR 0179 D3/D5, spec §4.5).
 *
 * Pint: de keuze van de gebruiker blijft staan bij een katernwissel; alleen vaste
 * lagen komen erbij en gaan weer weg; Instellingen is compact (geen Lagen, geen
 * fasebalk, niet op mobiel) en volgt sinds 27 sep de modus-keuze; de aannamesregel en de
 * fasebalk staan alleen in Plan; Doelen buiten Vermogen zegt dat die modi het plan volgen;
 * op desktop delen Plan en Doelen de maat van de canvas-rij (de harp is maatgevend).
 */
import { describe, it, expect } from 'vitest'
import { LAAG_VOLGORDE, LAGEN_EENVOUDIG, type LaagId } from '@/lib/horizon/katern-copy'
import {
  COMPACTE_PLOTHOOGTE,
  DOELEN_PLOTHOOGTE_DESKTOP,
  KOLOM_PLOTHOOGTE,
  SAMENSTELLING_MOBIEL,
  samenstellingPlotPassend,
  samenstellingStartMobiel,
  doelenPlotHoogteMobiel,
  klemKolomPlotHoogte,
  kolomPlotHoogte,
  canvasStand,
  type CanvasBeschikbaarheid,
  type CanvasKeuze,
  type CanvasWeergave,
} from './canvas-stand'

const alleLagen = (aan: readonly LaagId[] = []): Record<LaagId, boolean> =>
  Object.fromEntries(LAAG_VOLGORDE.map((id) => [id, aan.includes(id)])) as Record<LaagId, boolean>

/** De standaardkeuze van Plan: Gebeurtenissen en Mijlpalen aan. */
const standaard: CanvasKeuze = { modus: 'vermogen', lagen: alleLagen(['gebeurtenissen', 'mijlpalen']) }
const alles: CanvasBeschikbaarheid = { doelen: true, doelscenario: true, metHuis: true }
const VOLLEDIG: CanvasWeergave = { eenvoudig: false }
const EENVOUDIG: CanvasWeergave = { eenvoudig: true }

describe('canvasStand — Plan', () => {
  const stand = canvasStand('plan', standaard, alles, VOLLEDIG)

  it('biedt alle drie de modi en de Lagen-knop, zonder vaste lagen', () => {
    expect(stand.modi).toEqual(['vermogen', 'samenstelling', 'geldstroom'])
    expect(stand.toonModusSwitch).toBe(true)
    expect(stand.toonLagenKnop).toBe(true)
    expect(stand.vast).toEqual([])
    expect(stand.beschikbaar).toEqual(LAAG_VOLGORDE)
  })

  it('tekent precies de keuze: standaard Gebeurtenissen en Mijlpalen', () => {
    expect(Object.entries(stand.lagen).filter(([, aan]) => aan).map(([id]) => id)).toEqual([
      'gebeurtenissen',
      'mijlpalen',
    ])
  })

  it('draagt de fasebalk en de aannamesregel', () => {
    expect(stand.toonFasebalk).toBe(true)
    expect(stand.toonAannamesregel).toBe(true)
    expect(stand.toonPlanVolgtRegel).toBe(false)
    expect(stand.alleenDesktop).toBe(false)
  })

  it('laat lagen zonder data uit het menu', () => {
    const s = canvasStand('plan', standaard, { doelen: false, doelscenario: false, metHuis: false }, VOLLEDIG)
    expect(s.beschikbaar).not.toContain('doelen')
    expect(s.beschikbaar).not.toContain('doelscenario')
    expect(s.beschikbaar).not.toContain('metHuis')
  })

  it('heeft buiten Vermogen geen lagenmenu (lagen gelden alleen in Vermogen)', () => {
    const s = canvasStand('plan', { ...standaard, modus: 'geldstroom' }, alles, VOLLEDIG)
    expect(s.modus).toBe('geldstroom')
    expect(s.beschikbaar).toEqual([])
    expect(s.toonLagenKnop).toBe(false)
  })
})

describe('canvasStand — Doelen', () => {
  const stand = canvasStand('doelen', standaard, alles, VOLLEDIG)

  it('zet doelscenario en doelen vast aan, bovenop de keuze', () => {
    expect(stand.vast).toEqual(['doelscenario', 'doelen'])
    expect(stand.lagen.doelscenario).toBe(true)
    expect(stand.lagen.doelen).toBe(true)
    expect(stand.lagen.gebeurtenissen).toBe(true)
  })

  it('laat Marktcheck en Rendement hoger en lager standaard uit', () => {
    expect(stand.lagen.marktcheck).toBe(false)
    expect(stand.lagen.rendementScenarios).toBe(false)
  })

  it('heeft geen fasebalk en geen aannamesregel', () => {
    expect(stand.toonFasebalk).toBe(false)
    expect(stand.toonAannamesregel).toBe(false)
  })

  it('zegt in Samenstelling en Geldstroom dat die het plan volgen, in Vermogen niet', () => {
    expect(stand.toonPlanVolgtRegel).toBe(false)
    expect(canvasStand('doelen', { ...standaard, modus: 'samenstelling' }, alles, VOLLEDIG).toonPlanVolgtRegel).toBe(true)
    expect(canvasStand('doelen', { ...standaard, modus: 'geldstroom' }, alles, VOLLEDIG).toonPlanVolgtRegel).toBe(true)
  })

  it('zet een vaste laag zonder data niet vast', () => {
    const s = canvasStand('doelen', standaard, { doelen: false, doelscenario: true, metHuis: false }, VOLLEDIG)
    expect(s.vast).toEqual(['doelscenario'])
    expect(s.lagen.doelen).toBe(false)
  })
})

describe('canvasStand — Instellingen', () => {
  const keuze: CanvasKeuze = {
    modus: 'samenstelling',
    lagen: alleLagen(['mijlpalen', 'marktcheck', 'rendementScenarios', 'metHuis', 'doelscenario']),
  }
  const stand = canvasStand('instellingen', keuze, alles, VOLLEDIG)

  it('volgt de keuze van het canvas (27 sep: Samenstelling is de basis), mét modus-switch, zonder Lagen-knop', () => {
    expect(stand.modi).toEqual(['vermogen', 'samenstelling', 'geldstroom'])
    expect(stand.modus).toBe('samenstelling')
    expect(stand.toonModusSwitch).toBe(true)
    expect(stand.toonLagenKnop).toBe(false)
    expect(stand.beschikbaar).toEqual([])
    for (const modus of ['vermogen', 'geldstroom'] as const) {
      const s = canvasStand('instellingen', { ...keuze, modus }, alles, VOLLEDIG)
      expect(s.modus).toBe(modus)
      expect(s.toonLagenKnop).toBe(false)
      expect(s.grafiekBron).toBe('plan')
    }
  })

  it('heeft geen kolom naast de grafiek', () => {
    expect(stand.kolom).toBeNull()
  })

  it('tekent alleen de hoofdlijn met de gebeurtenissen (vast)', () => {
    expect(stand.vast).toEqual(['gebeurtenissen'])
    expect(Object.entries(stand.lagen).filter(([, aan]) => aan).map(([id]) => id)).toEqual(['gebeurtenissen'])
  })

  it('is compact: geen fasebalk, geen legenda, geen aannamesregel, alleen op desktop', () => {
    expect(stand.toonFasebalk).toBe(false)
    expect(stand.toonLegenda).toBe(false)
    expect(stand.toonAannamesregel).toBe(false)
    expect(stand.alleenDesktop).toBe(true)
  })

  it('geeft de grafiek een compacte plothoogte; Plan houdt de standaard (spec §4.5)', () => {
    expect(stand.plotHoogte).toBe(COMPACTE_PLOTHOOGTE)
    expect(COMPACTE_PLOTHOOGTE).toBeLessThan(220)
    expect(canvasStand('plan', standaard, alles, VOLLEDIG).plotHoogte).toBeNull()
  })

  it('Samenstelling op desktop: dezelfde compacte hoogte; op mobiel (geen canvas) de eigen hoogte', () => {
    expect(canvasStand('instellingen', keuze, alles, { eenvoudig: false, breed: true }).samenstellingHoogte).toBe(
      COMPACTE_PLOTHOOGTE,
    )
    expect(stand.samenstellingHoogte).toBeNull()
  })

  it('in Vermogen alleen de hoofdlijn en geen cijferbalk; in de andere modi geen hoofdlijn-beperking; Plan wel, Doelen wel de doellijnen', () => {
    const vermogen = canvasStand('instellingen', { ...keuze, modus: 'vermogen' }, alles, VOLLEDIG)
    expect(vermogen.alleenHoofdlijn).toBe(true)
    expect(vermogen.toonReadout).toBe(false)
    expect(stand.alleenHoofdlijn).toBe(false)
    expect(stand.toonReadout).toBe(false)
    expect(canvasStand('plan', standaard, alles, VOLLEDIG).toonReadout).toBe(true)
    for (const katern of ['plan', 'doelen'] as const) {
      expect(canvasStand(katern, standaard, alles, VOLLEDIG).alleenHoofdlijn).toBe(false)
    }
  })
})

describe('canvasStand — de keuze blijft staan bij een katernwissel', () => {
  it('Plan → Instellingen → Plan geeft dezelfde modus en lagen terug', () => {
    const keuze: CanvasKeuze = { modus: 'geldstroom', lagen: alleLagen(['marktcheck', 'mijlpalen']) }
    const voor = canvasStand('plan', keuze, alles, VOLLEDIG)
    canvasStand('instellingen', keuze, alles, VOLLEDIG)
    const na = canvasStand('plan', keuze, alles, VOLLEDIG)
    expect(na).toEqual(voor)
    expect(na.modus).toBe('geldstroom')
  })

  it('de vaste lagen van Doelen verdwijnen weer in Plan', () => {
    const doelen = canvasStand('doelen', standaard, alles, VOLLEDIG)
    const plan = canvasStand('plan', standaard, alles, VOLLEDIG)
    expect(doelen.lagen.doelscenario).toBe(true)
    expect(plan.lagen.doelscenario).toBe(false)
    expect(plan.vast).toEqual([])
  })
})

describe('canvasStand — Eenvoudig tekent alleen de lagen van zijn menu (spec §4.7)', () => {
  // Alles aan, zoals een gebruiker die in Volledig elke laag aanzette en daarna naar
  // Eenvoudig schakelde (Met je huis staat in localStorage en overleeft dat).
  const allesAan: CanvasKeuze = { modus: 'vermogen', lagen: alleLagen(LAAG_VOLGORDE) }
  const aan = (lagen: Readonly<Record<LaagId, boolean>>) =>
    Object.entries(lagen).filter(([, v]) => v).map(([id]) => id)

  it('Eenvoudig: Marktcheck, Rendement hoger en lager, Met je huis en Speel af zijn niet getekend', () => {
    for (const katern of ['plan', 'doelen'] as const) {
      const s = canvasStand(katern, allesAan, alles, EENVOUDIG)
      expect(aan(s.lagen)).toEqual([...LAGEN_EENVOUDIG].sort((a, b) => LAAG_VOLGORDE.indexOf(a) - LAAG_VOLGORDE.indexOf(b)))
      for (const id of ['marktcheck', 'rendementScenarios', 'metHuis', 'speelAf'] as const) {
        expect(s.lagen[id]).toBe(false)
        expect(s.beschikbaar).not.toContain(id)
      }
    }
  })

  it('Volledig: dezelfde keuze tekent alles', () => {
    expect(aan(canvasStand('plan', allesAan, alles, VOLLEDIG).lagen)).toEqual([...LAAG_VOLGORDE])
  })

  it('de keuze blijft staan: terug naar Volledig tekent de lagen weer', () => {
    canvasStand('plan', allesAan, alles, EENVOUDIG)
    expect(canvasStand('plan', allesAan, alles, VOLLEDIG).lagen.metHuis).toBe(true)
    expect(allesAan.lagen.marktcheck).toBe(true)
  })

  it('de vaste lagen van Doelen blijven in Eenvoudig vast', () => {
    const s = canvasStand('doelen', standaard, alles, EENVOUDIG)
    expect(s.vast).toEqual(['doelscenario', 'doelen'])
    expect(s.lagen.doelscenario).toBe(true)
  })
})

describe('canvasStand — bron van Samenstelling en Geldstroom (ADR 0179 fase 4)', () => {
  const keuze = (modus: 'vermogen' | 'samenstelling' | 'geldstroom') => ({
    modus,
    lagen: Object.fromEntries(LAAG_VOLGORDE.map((id) => [id, false])) as Record<LaagId, boolean>,
  })
  const b = (doelscenario: boolean, doelscenarioRijen?: boolean) => ({
    doelen: false,
    doelscenario,
    metHuis: false,
    ...(doelscenarioRijen === undefined ? {} : { doelscenarioRijen }),
  })
  const W = { eenvoudig: false }

  it('Doelen + doellijn + doelrijen: het doelscenario, zonder regel', () => {
    for (const modus of ['samenstelling', 'geldstroom'] as const) {
      const s = canvasStand('doelen', keuze(modus), b(true, true), W)
      expect(s.grafiekBron).toBe('doelscenario')
      expect(s.toonPlanVolgtRegel).toBe(false)
    }
  })

  it('Doelen + doellijn zonder doelrijen: het plan met de regel', () => {
    const s = canvasStand('doelen', keuze('samenstelling'), b(true, false), W)
    expect(s.grafiekBron).toBe('plan-met-regel')
    expect(s.toonPlanVolgtRegel).toBe(true)
  })

  it('Doelen zonder doellijn: het plan, geen regel (plan en doelscenario zijn gelijk)', () => {
    const s = canvasStand('doelen', keuze('geldstroom'), b(false, true), W)
    expect(s.grafiekBron).toBe('plan')
    expect(s.toonPlanVolgtRegel).toBe(false)
  })

  it('Vermogen, Plan en Instellingen: altijd het plan', () => {
    expect(canvasStand('doelen', keuze('vermogen'), b(true, true), W).grafiekBron).toBe('plan')
    expect(canvasStand('plan', keuze('samenstelling'), b(true, true), W).grafiekBron).toBe('plan')
    expect(canvasStand('instellingen', keuze('samenstelling'), b(true, true), W).grafiekBron).toBe('plan')
  })
})

describe('canvasStand — Doelen: grafiek en knoppen op één scherm (ADR 0179 D7, spec §4.2 regel 9)', () => {
  const k = { modus: 'vermogen' as const, lagen: Object.fromEntries(LAAG_VOLGORDE.map((id) => [id, false])) as Record<LaagId, boolean> }
  const b = { doelen: true, doelscenario: true, metHuis: false }

  it('mobiel: clamp(170px, 24vh, 200px); zonder viewport 200', () => {
    expect([500, 600, 700, 800, 900].map((vh) => doelenPlotHoogteMobiel(vh))).toEqual([170, 170, 170, 192, 200])
    expect(doelenPlotHoogteMobiel(null)).toBe(200)
    expect(doelenPlotHoogteMobiel(undefined)).toBe(200)
    expect(doelenPlotHoogteMobiel(0)).toBe(200)
    // 360×800 → 192, 390×844 → 200 (plafond), iPhone SE 667 → 170 (vloer).
    expect(canvasStand('doelen', k, b, { eenvoudig: false, viewportHoogte: 800 }).plotHoogte).toBe(192)
    expect(canvasStand('doelen', k, b, { eenvoudig: false, viewportHoogte: 844 }).plotHoogte).toBe(200)
    expect(canvasStand('doelen', k, b, { eenvoudig: false, viewportHoogte: 667 }).plotHoogte).toBe(170)
  })

  it('desktop: de maat van de canvas-rij — start zonder meting, anders de onthouden meting (geklemd)', () => {
    const zonder = canvasStand('doelen', k, b, { eenvoudig: false, breed: true, viewportHoogte: 720 })
    expect(zonder.plotHoogte).toBe(KOLOM_PLOTHOOGTE.start)
    expect(zonder.samenstellingHoogte).toBe(KOLOM_PLOTHOOGTE.start)
    expect(zonder.kolom).toBe('maatgevend')
    const gemeten = canvasStand('doelen', k, b, { eenvoudig: false, breed: true, kolomPlotHoogte: 312 })
    expect(gemeten.plotHoogte).toBe(312)
    expect(canvasStand('doelen', k, b, { eenvoudig: false, breed: true, kolomPlotHoogte: 90 }).plotHoogte).toBe(
      DOELEN_PLOTHOOGTE_DESKTOP,
    )
    expect(canvasStand('doelen', k, b, { eenvoudig: false, breed: true, kolomPlotHoogte: 900 }).plotHoogte).toBe(
      KOLOM_PLOTHOOGTE.max,
    )
  })

  it('Plan deelt de maat op desktop (de grafiek verspringt niet bij de wissel); mobiel de standaard', () => {
    const w = { eenvoudig: false, breed: true, kolomPlotHoogte: 300 }
    expect(canvasStand('plan', k, b, w).plotHoogte).toBe(canvasStand('doelen', k, b, w).plotHoogte)
    expect(canvasStand('plan', k, b, w).kolom).toBe('volgend')
    expect(canvasStand('plan', k, b, { eenvoudig: false, viewportHoogte: 800 }).plotHoogte).toBeNull()
    expect(canvasStand('plan', k, b, { eenvoudig: false }).samenstellingHoogte).toBeNull()
    // Mobiel Doelen: Samenstelling past in de Vermogen-cel (start = Vermogen-plot − marge,
    // daarna gemeten). Desktop, Plan en Instellingen doen dat niet.
    const m844 = canvasStand('doelen', k, b, { eenvoudig: false, viewportHoogte: 844 })
    expect(m844.samenstellingPastInVermogen).toBe(true)
    expect(m844.samenstellingHoogte).toBe(200 - SAMENSTELLING_MOBIEL.startMarge)
    expect(canvasStand('doelen', k, b, { eenvoudig: false, viewportHoogte: 800 }).samenstellingHoogte).toBe(
      192 - SAMENSTELLING_MOBIEL.startMarge,
    )
    expect(canvasStand('doelen', k, b, w).samenstellingPastInVermogen).toBe(false)
    expect(canvasStand('plan', k, b, { eenvoudig: false }).samenstellingPastInVermogen).toBe(false)
    expect(canvasStand('instellingen', k, b, { eenvoudig: false }).samenstellingPastInVermogen).toBe(false)
  })

  it('geen cijferbalk, geen tijdlijn, legenda op één regel; Plan houdt ze', () => {
    const d = canvasStand('doelen', k, b, { eenvoudig: false })
    expect(d.toonReadout).toBe(false)
    expect(d.toonTijdlijn).toBe(false)
    expect(d.legendaEenRegel).toBe(true)
    expect(d.toonAannamesregel).toBe(false)
    const p = canvasStand('plan', k, b, { eenvoudig: false })
    expect(p.toonTijdlijn).toBe(true)
    expect(p.legendaEenRegel).toBe(false)
  })

  it('marktcheck staat in Doelen uit zolang de gebruiker hem niet koos; een eigen keuze blijft staan', () => {
    const b2 = { doelen: true, doelscenario: true, metHuis: false }
    expect(canvasStand('doelen', k, b2, { eenvoudig: false }).lagen.marktcheck).toBe(false)
    const metKeuze = { ...k, lagen: { ...k.lagen, marktcheck: true } }
    expect(canvasStand('doelen', metKeuze, b2, { eenvoudig: false }).lagen.marktcheck).toBe(true)
  })
})

describe('canvasStand — gedempte hoofdlijn (spec §4.5, fase 4 S5b)', () => {
  const k = { modus: 'vermogen' as const, lagen: Object.fromEntries(LAAG_VOLGORDE.map((id) => [id, false])) as Record<LaagId, boolean> }
  it('Doelen met een doellijn: de hoofdlijn als referentie gedempt; zonder doellijn niet', () => {
    expect(canvasStand('doelen', k, { doelen: false, doelscenario: true, metHuis: false }, { eenvoudig: false }).hoofdlijnGedempt).toBe(true)
    expect(canvasStand('doelen', k, { doelen: false, doelscenario: false, metHuis: false }, { eenvoudig: false }).hoofdlijnGedempt).toBe(false)
  })
  it('Plan en Instellingen: nooit', () => {
    const metKeuze = { ...k, lagen: { ...k.lagen, doelscenario: true } }
    const b = { doelen: false, doelscenario: true, metHuis: false }
    expect(canvasStand('plan', metKeuze, b, { eenvoudig: false }).hoofdlijnGedempt).toBe(false)
    expect(canvasStand('instellingen', metKeuze, b, { eenvoudig: false }).hoofdlijnGedempt).toBe(false)
  })
})

describe('kolomPlotHoogte — de harp is maatgevend (27 sep)', () => {
  const { min, max, start } = KOLOM_PLOTHOOGTE

  it('plot = kolomhoogte − chrome van de grafiekkolom (midden van de band)', () => {
    // Grafiekkolom 400 bij plot 240 ⇒ chrome 160; kolom 460 ⇒ plot 300.
    expect(kolomPlotHoogte({ kolomHoogte: 460, grafiekKolomHoogte: 400, huidigePlot: 240 })).toBe(300)
  })

  it('stabiel: na de volgende render levert dezelfde som dezelfde plot (geen feedback-lus)', () => {
    const eerste = kolomPlotHoogte({ kolomHoogte: 460, grafiekKolomHoogte: 400, huidigePlot: 240 })!
    // De grafiekkolom is nu chrome + nieuwe plot = de kolomhoogte.
    expect(kolomPlotHoogte({ kolomHoogte: 460, grafiekKolomHoogte: 160 + eerste, huidigePlot: eerste })).toBe(eerste)
  })

  it('klemt op beide uiteinden: een lage kolom houdt het minimum, een hoge het maximum', () => {
    expect(kolomPlotHoogte({ kolomHoogte: 200, grafiekKolomHoogte: 400, huidigePlot: 240 })).toBe(min)
    expect(kolomPlotHoogte({ kolomHoogte: 160 + min, grafiekKolomHoogte: 400, huidigePlot: 240 })).toBe(min)
    expect(kolomPlotHoogte({ kolomHoogte: 160 + max, grafiekKolomHoogte: 400, huidigePlot: 240 })).toBe(max)
    expect(kolomPlotHoogte({ kolomHoogte: 2000, grafiekKolomHoogte: 400, huidigePlot: 240 })).toBe(max)
  })

  it('een onbruikbare meting (0, negatief, NaN) geeft null: de onthouden maat blijft staan', () => {
    expect(kolomPlotHoogte({ kolomHoogte: 0, grafiekKolomHoogte: 400, huidigePlot: 240 })).toBeNull()
    expect(kolomPlotHoogte({ kolomHoogte: 460, grafiekKolomHoogte: -1, huidigePlot: 240 })).toBeNull()
    expect(kolomPlotHoogte({ kolomHoogte: 460, grafiekKolomHoogte: 400, huidigePlot: Number.NaN })).toBeNull()
  })

  it('klemKolomPlotHoogte: null/ongeldig ⇒ start; binnen de band afgerond; buiten de band geklemd', () => {
    expect(klemKolomPlotHoogte(null)).toBe(start)
    expect(klemKolomPlotHoogte(undefined)).toBe(start)
    expect(klemKolomPlotHoogte(Number.POSITIVE_INFINITY)).toBe(start)
    expect(klemKolomPlotHoogte(301.6)).toBe(302)
    expect(klemKolomPlotHoogte(min - 1)).toBe(min)
    expect(klemKolomPlotHoogte(max + 1)).toBe(max)
    expect(start).toBeGreaterThanOrEqual(min)
    expect(start).toBeLessThanOrEqual(max)
  })
})

describe('samenstellingPlotPassend — Samenstelling past in de Vermogen-cel (mobiel Doelen, 27 sep)', () => {
  const { min, maxBoven, startMarge } = SAMENSTELLING_MOBIEL

  it('te hoog: krimpt met precies het overschot (gemeten 27 px boven Vermogen)', () => {
    // Vermogen-laag 232 (plot 192 + band 40), Samenstelling 259 bij plot 180 ⇒ 153.
    expect(samenstellingPlotPassend({ vermogenHoogte: 232, samenstellingHoogte: 259, huidigePlot: 180, vermogenPlot: 192 })).toBe(153)
  })

  it('te laag (lege strook): groeit met het tekort', () => {
    expect(samenstellingPlotPassend({ vermogenHoogte: 240, samenstellingHoogte: 200, huidigePlot: 150, vermogenPlot: 200 })).toBe(190)
  })

  it('stabiel: bij gelijke hoogte blijft de plot staan (geen trilling bij een modus-wissel)', () => {
    expect(samenstellingPlotPassend({ vermogenHoogte: 232, samenstellingHoogte: 232, huidigePlot: 153, vermogenPlot: 192 })).toBe(153)
  })

  it('klemt op beide uiteinden', () => {
    expect(samenstellingPlotPassend({ vermogenHoogte: 100, samenstellingHoogte: 400, huidigePlot: 180, vermogenPlot: 192 })).toBe(min)
    expect(samenstellingPlotPassend({ vermogenHoogte: 400, samenstellingHoogte: 100, huidigePlot: 180, vermogenPlot: 192 })).toBe(192 + maxBoven)
  })

  it('onbruikbare meting ⇒ null', () => {
    expect(samenstellingPlotPassend({ vermogenHoogte: 0, samenstellingHoogte: 200, huidigePlot: 180, vermogenPlot: 192 })).toBeNull()
    expect(samenstellingPlotPassend({ vermogenHoogte: 200, samenstellingHoogte: Number.NaN, huidigePlot: 180, vermogenPlot: 192 })).toBeNull()
  })

  it('startwaarde: Vermogen-plot − marge, nooit onder het minimum', () => {
    expect(samenstellingStartMobiel(200)).toBe(200 - startMarge)
    expect(samenstellingStartMobiel(min)).toBe(min)
  })
})

/**
 * De stand van het canvas per katern (ADR 0179 D3/D5, spec §4.5) — pure logica,
 * zodat "wat staat er per katern" zonder DOM te toetsen is.
 *
 * Uitgangspunt: modus en lagen horen bij het canvas, niet bij een katern. De keuze
 * van de gebruiker (`keuze`) blijft dus staan bij een katernwissel; een katern
 * voegt alleen vaste lagen toe (Doelen: doelscenario en doelen; Instellingen:
 * gebeurtenissen) of beperkt wat er kan (Instellingen: compact, geen Lagen-knop, in
 * Vermogen alleen de hoofdlijn). Bij het verlaten van het katern verdwijnen de vaste
 * lagen weer, omdat ze nooit in de keuze zelf worden geschreven.
 *
 * Sinds 27 sep is Samenstelling de basisweergave (`use-toekomst-lagen.ts`), in alle drie
 * de katernen; Instellingen volgt de keuze (vroeger dwong het Vermogen af).
 */

import {
  CANVAS_MODUS_VOLGORDE,
  LAAG_VOLGORDE,
  LAGEN_EENVOUDIG,
  type CanvasModus,
  type KaternId,
  type LaagId,
} from '@/lib/horizon/katern-copy'

/** Welke lagen er in deze data überhaupt iets te tekenen hebben. */
export interface CanvasBeschikbaarheid {
  /** Er zijn doel-markers (doelen met een streefdatum). */
  readonly doelen: boolean
  /** Er is een doelscenario-lijn (`hasDoelLijn`). */
  readonly doelscenario: boolean
  /** Er is een tweede grondslag-lijn (`dualBasisAvailable`). */
  readonly metHuis: boolean
  /**
   * De doelscenario-run levert ook grootboekrijen (`doelGrootboek`) én het perspectief is
   * solo (het lab is solo, ADR 0170 B10). Dan tonen Samenstelling en Geldstroom in Doelen
   * het doelscenario (ADR 0179 fase 4). Afwezig = nee.
   */
  readonly doelscenarioRijen?: boolean
}

/**
 * Welke rijen Samenstelling en Geldstroom tekenen (spec §4.5, "Het enige controlepunt"):
 * - `plan`: het plan (overal buiten Doelen, in Vermogen, en in Doelen zonder doellijn —
 *   dan zijn plan en doelscenario gelijk);
 * - `doelscenario`: de rijen van de doelrun, met het label "Je doelscenario";
 * - `plan-met-regel`: er is wél een doellijn maar geen doelrijen (partner- of
 *   huishoudperspectief) ⇒ het plan, met de regel dat die modi het plan volgen.
 */
export type CanvasGrafiekBron = 'plan' | 'doelscenario' | 'plan-met-regel'

export interface CanvasKeuze {
  readonly modus: CanvasModus
  readonly lagen: Readonly<Record<LaagId, boolean>>
}

export interface CanvasStand {
  /** De modi die de modus-switch aanbiedt. */
  readonly modi: readonly CanvasModus[]
  /** De modus die het canvas tekent: de keuze van de gebruiker, in elk katern (27 sep). */
  readonly modus: CanvasModus
  /** Toont de modus-switch (niet bij één modus). */
  readonly toonModusSwitch: boolean
  /** Toont de Lagen-knop (Instellingen niet). */
  readonly toonLagenKnop: boolean
  /** Lagen die dit katern vast aanzet ("vast" in het menu). */
  readonly vast: readonly LaagId[]
  /** Lagen die het menu toont (alleen in Vermogen, alleen met iets te tekenen). */
  readonly beschikbaar: readonly LaagId[]
  /** Wat er effectief op de grafiek staat: keuze ∨ vast, begrensd door het katern. */
  readonly lagen: Readonly<Record<LaagId, boolean>>
  /** De fasebalk staat alleen in Plan. */
  readonly toonFasebalk: boolean
  /** De aannamesregel staat alleen in Plan (D5). */
  readonly toonAannamesregel: boolean
  /** Doelen, buiten Vermogen, zonder doelrijen: "Samenstelling en Geldstroom volgen je plan; …" (§4.5). */
  readonly toonPlanVolgtRegel: boolean
  /** Welke rijen Samenstelling en Geldstroom tekenen (zie `CanvasGrafiekBron`). */
  readonly grafiekBron: CanvasGrafiekBron
  /** Legenda onder het canvas (Instellingen: geen). */
  readonly toonLegenda: boolean
  /** Instellingen: compact canvas op desktop, geen canvas op mobiel. */
  readonly alleenDesktop: boolean
  /**
   * Instellingen: alleen de hoofdlijn met de gebeurtenis-markers (spec §4.5), dus geen
   * doellijnen (doelbedrag, meegroeiend doel, de doelscenario-stippellijn met zijn
   * verschilvlak en nalatenschap-bol).
   */
  readonly alleenHoofdlijn: boolean
  /** De cijferbalk (`LifelineReadout`) boven de grafiek: niet in Instellingen (§4.7) en niet in Doelen (§4.2 regel 9). */
  readonly toonReadout: boolean
  /**
   * De gebeurtenissentijdlijn onder de grafiek. Niet in Doelen: de markers staan al op de
   * lijn, en de ±40 px zijn nodig om grafiek en knoppen samen in beeld te houden (§4.2
   * regel 9). Plan en Instellingen houden hem.
   */
  readonly toonTijdlijn: boolean
  /** De legenda past op mobiel op hoogstens één regel (Doelen, §4.2 regel 9). */
  readonly legendaEenRegel: boolean
  /**
   * De hoofdlijn als gedempte referentie (spec §4.5: "ja, als referentie in gedempte
   * inkt"): in Doelen, zodra er een doelscenario-lijn is om tegen af te zetten.
   */
  readonly hoofdlijnGedempt: boolean
  /**
   * Basishoogte van de vermogensgrafiek in px (`SimChart.plotHoogte`); `null` ⇒ de
   * standaardhoogte van de grafiek. Instellingen: compact (spec §4.5). Plan en Doelen op
   * desktop: de maat van de canvas-rij (`KOLOM_PLOTHOOGTE`).
   */
  readonly plotHoogte: number | null
  /**
   * Basishoogte van de Samenstelling-grafiek (`WealthCompositionChart.plotHoogte`). Op
   * desktop gelijk aan `plotHoogte`, zodat de standaardweergave (Samenstelling) even hard
   * meegroeit met de kolom als Vermogen. Mobiel in Doelen: de startwaarde van
   * `samenstellingPastInVermogen` (de Vermogen-plot min de extra chrome van Samenstelling).
   * Verder op mobiel `null` (de eigen hoogte van de grafiek).
   */
  readonly samenstellingHoogte: number | null
  /**
   * Mobiel in Doelen (één-scherm-eis, ADR 0179 D7): de Samenstelling-laag mag de modus-cel
   * niet hoger maken dan de Vermogen-laag. De grafiek meet beide lagen en past de plot van
   * Samenstelling aan (`samenstellingPlotPassend`), zodat het rad op zijn plek blijft en er
   * onder Samenstelling geen lege strook staat. Buiten Doelen-mobiel `false`.
   */
  readonly samenstellingPastInVermogen: boolean
  /**
   * De kolom naast de grafiek op desktop (27 sep):
   * - `maatgevend` (Doelen): het lab bepaalt de hoogte van de rij, de grafiek groeit mee;
   * - `volgend` (Plan): de gebeurtenissen volgen de rijhoogte en scrollen zelf;
   * - `null` (Instellingen): geen kolom.
   */
  readonly kolom: 'maatgevend' | 'volgend' | null
}

/** De compacte plothoogte van katern Instellingen op desktop (spec §4.5: "compact"). */
export const COMPACTE_PLOTHOOGTE = 180

/**
 * De plothoogte van de canvas-rij op desktop (Plan en Doelen; eigenaarsbesluit 27 sep):
 * de harp is maatgevend. De canvas meet in Doelen de natuurlijke hoogte van de lab-kolom
 * (zonder de acties, die staan eronder) en geeft de grafiek de rest: plot = kolomhoogte −
 * de chrome van de grafiekkolom (`kolomPlotHoogte`). Die maat onthoudt de canvas; Plan
 * gebruikt dezelfde, zodat de grafiek bij een katernwissel niet verspringt.
 *
 * - `min`: nooit lager dan de vroegere vaste Doelen-hoogte;
 * - `max`: een hoge kolom (lange uitkomst, eerste-sleep-hint) rekt de grafiek niet eindeloos op;
 * - `start`: vóór de eerste meting (server, eerste render, eerste bezoek aan Plan) — een
 *   schatting van de typische harpkolom met vijf knoppen, zodat er bij het eerste bezoek
 *   aan Doelen geen merkbare sprong is. Vervangt het oude plafond "kop plus canvas-rij
 *   binnen 480 px", dat door dit eigenaarsbesluit is vervallen.
 */
export const KOLOM_PLOTHOOGTE = { min: 220, max: 560, start: 240 } as const

/** De ondergrens van de desktop-plot in Plan en Doelen (de vroegere vaste Doelen-hoogte). */
export const DOELEN_PLOTHOOGTE_DESKTOP = KOLOM_PLOTHOOGTE.min

/** Begrenst een plothoogte tot de band van de canvas-rij; ongeldig ⇒ de startwaarde. */
export function klemKolomPlotHoogte(plot: number | null | undefined): number {
  const { min, max, start } = KOLOM_PLOTHOOGTE
  if (plot == null || !Number.isFinite(plot)) return start
  return Math.min(max, Math.max(min, Math.round(plot)))
}

/**
 * De plothoogte waarbij de grafiekkolom even hoog is als de lab-kolom (Doelen, desktop).
 *
 * `grafiekKolomHoogte` is gemeten bij `huidigePlot`; alles daarbuiten (kop, legenda,
 * marker-band, labels) is chrome en hangt niet van de plot af. Beide hoogtes zijn de
 * NATUURLIJKE hoogtes (de kolommen worden niet door de gridrij uitgerekt), dus er is geen
 * terugkoppeling: na de volgende render is de grafiekkolom precies de kolomhoogte, en
 * levert dezelfde som dezelfde plot. `null` bij een onbruikbare meting.
 */
export function kolomPlotHoogte({
  kolomHoogte,
  grafiekKolomHoogte,
  huidigePlot,
}: {
  kolomHoogte: number
  grafiekKolomHoogte: number
  huidigePlot: number
}): number | null {
  if (![kolomHoogte, grafiekKolomHoogte, huidigePlot].every((v) => Number.isFinite(v) && v > 0)) return null
  const chrome = grafiekKolomHoogte - huidigePlot
  return klemKolomPlotHoogte(kolomHoogte - chrome)
}

/**
 * Mobiele plothoogte van Doelen: `clamp(170px, 24vh, 200px)`. De spec noemde
 * `clamp(170px, 30vh, 230px)` (§4.2 regel 9), maar begroot zelf 200 op 390×844 en 170 op
 * 360×800 (§4.4); de meting van 27 sep liet zien dat 230 het rad onder de vouw duwt.
 */
export const DOELEN_PLOTHOOGTE_MOBIEL = { min: 170, vh: 0.24, max: 200, zonderViewport: 200 } as const

/**
 * De plothoogte van Doelen op mobiel bij een viewporthoogte (px). Zonder hoogte (server,
 * eerste render) het midden van de band, 200 px (de begroting van spec §4.4).
 */
export function doelenPlotHoogteMobiel(viewportHoogte: number | null | undefined): number {
  const { min, vh, max, zonderViewport } = DOELEN_PLOTHOOGTE_MOBIEL
  if (viewportHoogte == null || !Number.isFinite(viewportHoogte) || viewportHoogte <= 0) return zonderViewport
  return Math.min(max, Math.max(min, Math.round(viewportHoogte * vh)))
}

/**
 * Samenstelling op mobiel in Doelen (27 sep, na de visuele check): de modus-cel is zo hoog
 * als de hoogste laag, en Samenstelling (180 + markerbanden boven én onder + legendarij)
 * kwam ~27 px boven de Vermogen-plot uit. Dat duwde het rad op 360×800 onder de bar.
 * - `startMarge`: de extra chrome van Samenstelling t.o.v. Vermogen, als startwaarde vóór
 *   de meting (gemeten ~27 px boven een basis van 180 bij een Vermogen-plot van 192/200);
 * - `min`: ondergrens van de Samenstelling-plot;
 * - `maxBoven`: hoeveel de plot boven de Vermogen-plot mag groeien om een lege strook te
 *   vullen (als Samenstelling juist minder chrome heeft).
 */
export const SAMENSTELLING_MOBIEL = { startMarge: 40, min: 120, maxBoven: 40 } as const

/** De Samenstelling-plot vóór de meting: de Vermogen-plot min de verwachte extra chrome. */
export function samenstellingStartMobiel(vermogenPlot: number): number {
  return Math.max(SAMENSTELLING_MOBIEL.min, vermogenPlot - SAMENSTELLING_MOBIEL.startMarge)
}

/**
 * De Samenstelling-plot waarbij de Samenstelling-laag precies zo hoog is als de
 * Vermogen-laag (natuurlijke hoogtes van de inhoud van beide lagen, gemeten bij
 * `huidigePlot`). De Vermogen-laag hangt niet van deze plot af en de chrome van
 * Samenstelling ook niet, dus na één ronde is het stabiel. Geklemd op
 * [`min`, `vermogenPlot + maxBoven`]; `null` bij een onbruikbare meting.
 */
export function samenstellingPlotPassend({
  vermogenHoogte,
  samenstellingHoogte,
  huidigePlot,
  vermogenPlot,
}: {
  vermogenHoogte: number
  samenstellingHoogte: number
  huidigePlot: number
  vermogenPlot: number
}): number | null {
  if (![vermogenHoogte, samenstellingHoogte, huidigePlot, vermogenPlot].every((v) => Number.isFinite(v) && v > 0)) {
    return null
  }
  const doel = huidigePlot - (samenstellingHoogte - vermogenHoogte)
  const { min, maxBoven } = SAMENSTELLING_MOBIEL
  return Math.min(vermogenPlot + maxBoven, Math.max(min, Math.round(doel)))
}

const GEEN_LAGEN: Record<LaagId, boolean> = Object.fromEntries(
  LAAG_VOLGORDE.map((id) => [id, false]),
) as Record<LaagId, boolean>

function beschikbareLagen(b: CanvasBeschikbaarheid): LaagId[] {
  return LAAG_VOLGORDE.filter((id) => {
    if (id === 'doelen') return b.doelen
    if (id === 'doelscenario') return b.doelscenario
    if (id === 'metHuis') return b.metHuis
    return true
  })
}

/**
 * De weergave van de gebruiker (spec §4.7). Verplicht, zodat de host de Eenvoudig-stand
 * niet kan vergeten door te geven.
 */
export interface CanvasWeergave {
  /** Eenvoudig tekent alleen `LAGEN_EENVOUDIG`; de rest van de keuze blijft staan. */
  readonly eenvoudig: boolean
  /** Breed scherm (≥ lg). Afwezig = smal (de server rendert mobile-first). */
  readonly breed?: boolean
  /** `window.innerHeight` in px; afwezig/`null` op de server. Voedt de mobiele Doelen-hoogte. */
  readonly viewportHoogte?: number | null
  /**
   * De onthouden plothoogte van de canvas-rij (desktop, gemeten aan de harp in Doelen,
   * `kolomPlotHoogte`). Afwezig/`null` ⇒ `KOLOM_PLOTHOOGTE.start`.
   */
  readonly kolomPlotHoogte?: number | null
}

/** De stand van het canvas voor `katern`, gegeven de keuze en de weergave van de gebruiker. */
export function canvasStand(
  katern: KaternId,
  keuze: CanvasKeuze,
  beschikbaarheid: CanvasBeschikbaarheid,
  weergave: CanvasWeergave,
): CanvasStand {
  // Eenvoudig kent alleen de lagen van zijn menu (spec §4.7). Een laag die in Volledig
  // aan staat (Marktcheck, Rendement hoger en lager, Met je huis, Speel af) zou anders
  // getekend blijven terwijl het menu hem verbergt, en dus niet meer uit te zetten zijn.
  // Alleen de tekening wordt gemaskeerd: de keuze zelf blijft staan voor Volledig.
  const bestaat = beschikbareLagen(beschikbaarheid).filter(
    (id) => !weergave.eenvoudig || LAGEN_EENVOUDIG.includes(id),
  )

  if (katern === 'instellingen') {
    // Compact en alleen op desktop (spec §4.5), maar de modus volgt de keuze van het
    // canvas (27 sep: Samenstelling is de basisweergave, ook hier), mét de switch. In
    // Vermogen alleen de hoofdlijn met de gebeurtenis-markers (vast); geen lagenkeuze, geen
    // fasebalk, geen legenda, geen aannamesregel.
    const lagen = { ...GEEN_LAGEN, gebeurtenissen: true }
    return {
      modi: CANVAS_MODUS_VOLGORDE,
      modus: keuze.modus,
      toonModusSwitch: true,
      toonLagenKnop: false,
      vast: ['gebeurtenissen'],
      beschikbaar: [],
      lagen,
      toonFasebalk: false,
      toonAannamesregel: false,
      toonPlanVolgtRegel: false,
      grafiekBron: 'plan',
      toonLegenda: false,
      alleenDesktop: true,
      alleenHoofdlijn: keuze.modus === 'vermogen',
      toonReadout: false,
      toonTijdlijn: true,
      legendaEenRegel: false,
      hoofdlijnGedempt: false,
      plotHoogte: COMPACTE_PLOTHOOGTE,
      samenstellingHoogte: weergave.breed ? COMPACTE_PLOTHOOGTE : null,
      samenstellingPastInVermogen: false,
      kolom: null,
    }
  }

  // De maat van de canvas-rij op desktop: Plan en Doelen delen hem (27 sep).
  const rijPlot = klemKolomPlotHoogte(weergave.kolomPlotHoogte)
  const plotHoogte =
    katern === 'doelen'
      ? weergave.breed
        ? rijPlot
        : doelenPlotHoogteMobiel(weergave.viewportHoogte)
      : weergave.breed
        ? rijPlot
        : null

  const vast: LaagId[] =
    katern === 'doelen' ? (['doelscenario', 'doelen'] as const).filter((id) => bestaat.includes(id)) : []
  const lagen = { ...GEEN_LAGEN }
  for (const id of bestaat) lagen[id] = keuze.lagen[id] || vast.includes(id)

  // Lagen gelden alleen in Vermogen (spec §7.2); in de andere modi geen menu.
  const beschikbaar = keuze.modus === 'vermogen' ? bestaat : []

  const grafiekBron: CanvasGrafiekBron =
    katern !== 'doelen' || keuze.modus === 'vermogen' || !beschikbaarheid.doelscenario
      ? 'plan'
      : beschikbaarheid.doelscenarioRijen
        ? 'doelscenario'
        : 'plan-met-regel'

  return {
    modi: CANVAS_MODUS_VOLGORDE,
    modus: keuze.modus,
    toonModusSwitch: true,
    toonLagenKnop: beschikbaar.length > 0,
    vast,
    beschikbaar,
    lagen,
    toonFasebalk: katern === 'plan',
    toonAannamesregel: katern === 'plan',
    toonPlanVolgtRegel: grafiekBron === 'plan-met-regel',
    grafiekBron,
    toonLegenda: true,
    alleenDesktop: false,
    alleenHoofdlijn: false,
    toonReadout: katern !== 'doelen',
    toonTijdlijn: katern !== 'doelen',
    legendaEenRegel: katern === 'doelen',
    hoofdlijnGedempt: katern === 'doelen' && lagen.doelscenario,
    plotHoogte,
    samenstellingHoogte: weergave.breed
      ? plotHoogte
      : katern === 'doelen' && plotHoogte != null
        ? samenstellingStartMobiel(plotHoogte)
        : null,
    samenstellingPastInVermogen: katern === 'doelen' && !weergave.breed,
    kolom: katern === 'doelen' ? 'maatgevend' : 'volgend',
  }
}

/**
 * Hoeveel reeksen de grafiek tekent: de hoofdlijn plus elke actieve extra lijn of
 * band (doelscenario, marktcheck, rendement hoger en lager, met je huis). Markers
 * zijn geen reeks. De legenda staat er alleen bij twee of meer (spec §4.9).
 */
export function aantalReeksen(reeksen: {
  readonly doelscenario: boolean
  readonly marktcheck: boolean
  readonly rendementScenarios: boolean
  readonly metHuis: boolean
}): number {
  return (
    1 +
    Number(reeksen.doelscenario) +
    Number(reeksen.marktcheck) +
    Number(reeksen.rendementScenarios) +
    Number(reeksen.metHuis)
  )
}

/** De legenda-regel van spec §4.9: alleen bij twee of meer reeksen. */
export function toonLegendaBij(aantal: number): boolean {
  return aantal >= 2
}

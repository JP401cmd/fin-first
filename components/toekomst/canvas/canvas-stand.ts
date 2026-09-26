/**
 * De stand van het canvas per katern (ADR 0179 D3/D5, spec §4.5) — pure logica,
 * zodat "wat staat er per katern" zonder DOM te toetsen is.
 *
 * Uitgangspunt: modus en lagen horen bij het canvas, niet bij een katern. De keuze
 * van de gebruiker (`keuze`) blijft dus staan bij een katernwissel; een katern
 * voegt alleen vaste lagen toe (Doelen: doelscenario en doelen; Instellingen:
 * gebeurtenissen) of beperkt wat er kan (Instellingen: alleen Vermogen, geen
 * Lagen-knop). Bij het verlaten van het katern verdwijnen de vaste lagen weer,
 * omdat ze nooit in de keuze zelf worden geschreven.
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
  /** De modus die het canvas tekent (Instellingen: altijd Vermogen). */
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
   * standaardhoogte van de grafiek. Instellingen: compact (spec §4.5).
   */
  readonly plotHoogte: number | null
}

/** De compacte plothoogte van katern Instellingen op desktop (spec §4.5: "compact"). */
export const COMPACTE_PLOTHOOGTE = 180

/**
 * De plothoogte van katern Doelen op desktop (ADR 0179 D7): lager dan de standaard 260,
 * zodat kop plus canvas-rij binnen 480 px blijven en de harp ernaast in beeld staat.
 */
export const DOELEN_PLOTHOOGTE_DESKTOP = 220

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
    // Alleen de hoofdlijn met de gebeurtenissen waar je hier aan werkt (vast);
    // geen lagenkeuze, geen fasebalk, geen legenda.
    const lagen = { ...GEEN_LAGEN, gebeurtenissen: true }
    return {
      modi: ['vermogen'],
      modus: 'vermogen',
      toonModusSwitch: false,
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
      alleenHoofdlijn: true,
      toonReadout: false,
      toonTijdlijn: true,
      legendaEenRegel: false,
      hoofdlijnGedempt: false,
      plotHoogte: COMPACTE_PLOTHOOGTE,
    }
  }

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
    plotHoogte:
      katern === 'doelen'
        ? weergave.breed
          ? DOELEN_PLOTHOOGTE_DESKTOP
          : doelenPlotHoogteMobiel(weergave.viewportHoogte)
        : null,
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

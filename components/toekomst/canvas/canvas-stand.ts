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
}

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
  /** Doelen, buiten Vermogen: "Samenstelling en Geldstroom volgen je plan; …" (§4.5). */
  readonly toonPlanVolgtRegel: boolean
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
  /** De cijferbalk (`LifelineReadout`) boven de grafiek: niet in Instellingen (§4.7). */
  readonly toonReadout: boolean
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
      toonLegenda: false,
      alleenDesktop: true,
      alleenHoofdlijn: true,
      toonReadout: false,
    }
  }

  const vast: LaagId[] =
    katern === 'doelen' ? (['doelscenario', 'doelen'] as const).filter((id) => bestaat.includes(id)) : []
  const lagen = { ...GEEN_LAGEN }
  for (const id of bestaat) lagen[id] = keuze.lagen[id] || vast.includes(id)

  // Lagen gelden alleen in Vermogen (spec §7.2); in de andere modi geen menu.
  const beschikbaar = keuze.modus === 'vermogen' ? bestaat : []

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
    toonPlanVolgtRegel: katern === 'doelen' && keuze.modus !== 'vermogen',
    toonLegenda: true,
    alleenDesktop: false,
    alleenHoofdlijn: false,
    toonReadout: true,
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

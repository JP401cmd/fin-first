/**
 * Bronselectie voor de gestippelde doel-/wat-als-lijn op /toekomst.
 *
 * De grafiek tekent naast "Jouw pad" (de gesolvede basislijn) één gestippelde
 * tweede lijn. Die lijn had tot nu toe altijd de scenario-run als bron — de
 * VROEGST mogelijke FIRE onder de gedraaide knoppen. Sinds ADR 0085 wint de
 * GEKOZEN STOPLEEFTIJD wanneer die er is: opbouw tot de stopleeftijd, daarna
 * onttrekking. Die run bestaat al (`stopPad`, `runForcedStopPath` met
 * `endStrategy: 'inherit'`) en wordt hier alleen geselecteerd — géén extra
 * kernel-run, géén eigen som.
 *
 * Pure functie: consumeert alleen al berekende run-uitvoer.
 *
 * ## Keuzeregels
 *   1. **Stop-bron** wanneer er een stopleeftijd staat, het stop-pad geland is,
 *      we niet in pensioen-modus zitten (daar is "stoppen" al de pensioendatum)
 *      én de stopkeuze betekenisvol is:
 *        - er is een actief wat-als-scenario (dan vertelt de stoplijn het
 *          doel-verhaal: gedraaide knoppen tot je eigen stopleeftijd), OF
 *        - de verwachte FIRE-leeftijd is onbekend, OF
 *        - de stopleeftijd van de GELANDE run ligt ≥
 *          {@link DOEL_LIJN_STOP_DREMPEL_JAAR} jaar van de verwachte
 *          FIRE-leeftijd af. Onder die drempel zou de stippellijn de hoofdlijn
 *          vrijwel exact overlappen — ruis, geen informatie.
 *   2. Anders de **scenario-bron** (het gedrag van vóór ADR 0085).
 *   3. Anders `null` — geen tweede lijn.
 *
 * ## Waarom alles uit de RUN en niet uit de rauwe sliderwaarde
 * Het stop-pad draait in een worker; tijdens het slepen kan de gelande run nog
 * bij een oudere stopleeftijd horen. Door rijen, FIRE-stip én de ruis-drempel
 * allemaal uit hetzelfde `result`-object te halen, zit de stip altijd op de
 * getekende lijn en flikkert de drempel niet op halfweg-waarden. Bijkomend
 * effect (bewust): de caller hoeft de rauwe `scenarioStopAge` niet als
 * memo-dependency te dragen — alleen het (deferred) `stopPad` en de boolean
 * `stopKeuzeActief` — zodat een 0,5-slider-tick de chart-overlay-identiteit
 * niet per tick ververst (review M1).
 */
import type { SimRow } from '@/lib/fire-simulation'

/** Drempel (jaren) waaronder een stopkeuze te dicht op de verwachting ligt. */
export const DOEL_LIJN_STOP_DREMPEL_JAAR = 0.5

/**
 * Minimale vorm van een geland pad. Structureel compatibel met
 * `HorizonScenarioResult` en `ForcedStopPathResult` (beide `{ result: SimResult, … }`).
 */
export interface DoelLijnPad {
  result: {
    rows: SimRow[]
    fireAgeFractional: number | null
  }
}

export interface SelectDoelLijnBronParams {
  /** Het geforceerde stop-pad; `null`/`undefined` = nog niet geland of geen stopkeuze. */
  stopPad: DoelLijnPad | null | undefined
  /** De gescheiden scenario-run; `null`/`undefined` = geen actief wat-als. */
  scenario: DoelLijnPad | null | undefined
  /** Staat er een gekozen stopleeftijd? (`scenarioStopAge != null` — de wáárde komt uit de run.) */
  stopKeuzeActief: boolean
  /** FIRE-leeftijd van het actieve pad (scenario indien aanwezig, anders basis). */
  verwachtFireAge: number | null | undefined
  /** Is er een actief wat-als-scenario (gedraaide knoppen/rendement)? */
  hasScenario: boolean
  /** Pensioen-modus — daar onderdrukken we de stop-bron (huidig gedrag). */
  isPensioenMode: boolean
}

export interface DoelLijnSelectie {
  /** Rijen van de gekozen run (nog ongeclipt — de consument clipt op `displayEndAge`). */
  rows: SimRow[]
  /** FIRE-stip-leeftijd, uit DEZELFDE run als `rows`. */
  fireAgeFractional: number | null
  /** Welke run de lijn voedt — stuurt de legenda-vorm ("(stop 63)" vs. "(57j)"). */
  bron: 'stop' | 'scenario'
}

/**
 * Kiest de bron voor de gestippelde doel-lijn. Zie de moduledoc voor de regels.
 * Geeft `null` wanneer er niets te tekenen valt.
 */
export function selectDoelLijnBron(params: SelectDoelLijnBronParams): DoelLijnSelectie | null {
  const { stopPad, scenario, stopKeuzeActief, verwachtFireAge, hasScenario, isPensioenMode } = params

  // Drempel meet tegen de stopleeftijd van de GELANDE run (== de geforceerde
  // leeftijd uit `evaluateFireAt`), niet tegen de rauwe sliderwaarde — zie moduledoc.
  const stopRunAge = stopPad?.result.fireAgeFractional ?? null
  const stopBronWint =
    stopKeuzeActief &&
    stopPad != null &&
    !isPensioenMode &&
    (hasScenario ||
      verwachtFireAge == null ||
      stopRunAge == null ||
      Math.abs(stopRunAge - verwachtFireAge) >= DOEL_LIJN_STOP_DREMPEL_JAAR)

  if (stopBronWint) {
    return {
      rows: stopPad.result.rows,
      fireAgeFractional: stopPad.result.fireAgeFractional,
      bron: 'stop',
    }
  }

  if (scenario != null) {
    return {
      rows: scenario.result.rows,
      fireAgeFractional: scenario.result.fireAgeFractional,
      bron: 'scenario',
    }
  }

  return null
}

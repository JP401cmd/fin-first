/**
 * Stop-marge — de afstand tussen de gekozen stopleeftijd en de FIRE-uitkomst, als een
 * driezone-band (tekort · krap · stevig). Voedt de marge-track van de Vrijheidsas op
 * /toekomst (mockup-blok ⑤).
 *
 * Pure afleiding — GEEN solver-run. De twee FIRE-leeftijden komen als input binnen
 * (consume, niet herrekenen):
 *   - `verwacht` = de FIRE-leeftijd van het ACTIEVE pad (scenario indien aanwezig, anders
 *     de basislijn) = `fireAgeFractional` van die run.
 *   - `laatst`   = de FIRE-leeftijd van de VOORZICHTIGE variant van datzelfde pad — door de
 *     consument aangeleverd uit `buildScenarioPathsFromSim` (pessimist-variant `.fireAge`,
 *     `SCENARIO_VARIANTS` rendement-delta −0,02, `sim-chart.tsx`). Kan `null` zijn wanneer
 *     de voorzichtige variant het doel nooit haalt.
 *
 * ## Zones (tick-labels "verwacht" en "laatst" in de UI)
 *   - `stop < verwacht`            → 'tekort'  (je wilt stoppen vóór je verwacht vrij bent)
 *   - `verwacht ≤ stop < rand`     → 'krap'    (haalbaar op de verwachting, maar niet op de
 *                                               voorzichtige variant)
 *   - `stop ≥ rand`                → 'stevig'  (ook op de voorzichtige variant gedekt, of —
 *                                               zonder die variant — ruim voorbij de streep)
 *   waarbij `rand` = `resolveVoorzichtigeRand(verwacht, laatst)`: de echte voorzichtige
 *   FIRE-leeftijd wanneer die bestaat, anders de terugval-rand `verwacht + TERUGVAL_RAND_JAREN`.
 *
 * ## Formule
 *   margeJaren   = stopAge − verwacht
 *   deltaVsBasis = verwacht − basis        (null als één van beide null)
 *
 * ## Randgevallen
 *   - `verwacht === null` (onbereikbaar) → alles null.
 *   - `laatst === null` (voorzichtige variant haalt het doel binnen de planperiode niet —
 *     structureel gangbaar: het pessimist-pad volgt het kasstroompatroon van de hoofdsim en
 *     kruist het doel na de hoofd-FIRE vrijwel nooit meer) → terugval-rand op
 *     `verwacht + TERUGVAL_RAND_JAREN`; 'stevig' is dan een houdbaarheids-, geen
 *     voorzichtige-dekking-claim (de UI voert daar een eigen duidingszin voor).
 *   - `laatst < verwacht` kan door de afleiding niet voorkomen, maar wordt defensief
 *     geclamped (`laatst = max(laatst, verwacht)`).
 *   - `stopAge` mag halve jaren zijn (slider-stap 0,5).
 */

export type StopMargeZone = 'tekort' | 'krap' | 'stevig'

/**
 * Terugval-rand (jaren ná de verwacht-streep) wanneer de voorzichtige variant het doel
 * binnen de planperiode niet haalt (`laatst = null`): de oranje zone is dan precies zo
 * breed, daarna geldt de stop als 'stevig'. Zonder deze terugval was groen onbereikbaar
 * en bleef 'krap' het plafond, hoe ver de stop ook lag (band-bug 6 aug 2026).
 */
export const TERUGVAL_RAND_JAREN = 3

/**
 * De voorzichtige rand waar zowel de zone-classificatie als de UI-band op leunt — één
 * bron, zodat band en zone-woord niet kunnen drijven:
 *   - echte `laatst` aanwezig → die rand (defensief geclamped op `verwacht`);
 *   - `laatst = null`         → terugval-rand `verwacht + TERUGVAL_RAND_JAREN`;
 *   - `verwacht = null`       → null (onbereikbaar, geen rand te bepalen).
 */
export function resolveVoorzichtigeRand(
  verwacht: number | null,
  laatst: number | null,
): number | null {
  if (verwacht === null) return null
  if (laatst === null) return verwacht + TERUGVAL_RAND_JAREN
  return Math.max(laatst, verwacht)
}

export interface ComputeStopMargeParams {
  /** Gekozen stopleeftijd (jaren, mag halve jaren zijn). */
  stopAge: number
  /** FIRE-leeftijd van het actieve pad (scenario, anders basis); null = onbereikbaar. */
  verwachtFireAgeFractional: number | null
  /** FIRE-leeftijd van de voorzichtige variant van datzelfde pad; null = nooit bereikt. */
  laatstFireAgeFractional: number | null
  /** Basis-FIRE-leeftijd (voor `deltaVsBasis`); null = onbereikbaar. */
  baseFireAgeFractional: number | null
}

export interface StopMargeResult {
  /** stopAge − verwacht; null als de verwacht-FIRE onbereikbaar is. */
  margeJaren: number | null
  /** Driezone-status; null als de verwacht-FIRE onbereikbaar is. */
  zone: StopMargeZone | null
  /** verwacht − basis (positief = later dan basis, negatief = eerder); null als één van beide onbereikbaar. */
  deltaVsBasis: number | null
}

/**
 * Leid de stop-marge + zone af uit de gekozen stopleeftijd en de twee FIRE-leeftijden
 * (verwacht + voorzichtig). Zie de module-doc voor de zone-grenzen en randgevallen.
 */
export function computeStopMarge({
  stopAge,
  verwachtFireAgeFractional,
  laatstFireAgeFractional,
  baseFireAgeFractional,
}: ComputeStopMargeParams): StopMargeResult {
  const verwacht = verwachtFireAgeFractional
  const basis = baseFireAgeFractional

  const deltaVsBasis = verwacht !== null && basis !== null ? verwacht - basis : null

  // Onbereikbare verwacht-FIRE → geen marge/zone te bepalen.
  if (verwacht === null) {
    return { margeJaren: null, zone: null, deltaVsBasis }
  }

  const margeJaren = stopAge - verwacht

  let zone: StopMargeZone
  if (stopAge < verwacht) {
    zone = 'tekort'
  } else {
    // Echte voorzichtige rand, of de terugval-rand wanneer die variant het doel nooit
    // haalt — zie resolveVoorzichtigeRand (verwacht ≠ null ⇒ rand ≠ null).
    const rand = resolveVoorzichtigeRand(verwacht, laatstFireAgeFractional)!
    zone = stopAge >= rand ? 'stevig' : 'krap'
  }

  return { margeJaren, zone, deltaVsBasis }
}

/**
 * Stap-granulariteit voor `<input type="range">`-schuiven met een BEREKENDE
 * startstand — zonder dat de browser die startstand stilletjes verschuift.
 *
 * Het probleem (WF-BELAST-10-bug1, 2 sep 2026): een native range-input
 * saneert élke gezette `value` (ook Reacts controlled-value-prop) naar het
 * dichtstbijzijnde veelvoud van `step`, gerekend vanaf `min` — buiten React
 * om. Is de berekende startstand géén veelvoud (de jaarruimte-ondergrens
 * €18.955 bij stap 356; een werkelijk dividend van €45.678 bij stap 1000),
 * dan wijken de DOM-waarde en de thumb af van het label en van de React-state
 * (18.955 → 18.868), tot de gebruiker zelf sleept. Ook een bovengrens die geen
 * veelvoud is wordt zo onbereikbaar (35.588 → 35.244).
 *
 * De oplossing: `step="any"` op de input (de browser saneert dan alleen nog op
 * min/max, en een berekende stand blijft exact staan) en de stapgranulariteit
 * hier in JS — uitsluitend toegepast op GEBRUIKERSinteracties (slepen, pijltjes,
 * Home/End/PageUp/PageDown), nooit op de startstand. Zo blijft de bediening
 * "in stappen" zoals voorheen, maar zijn startstand, ondergrens én bovengrens
 * altijd exact bereikbaar.
 *
 * Dit is bedieningslogica, geen rekenmotor: er wordt geen bedrag afgeleid.
 */

export interface RangeStepBounds {
  step: number
  min: number
  max: number
}

/** Waarde van het `step`-attribuut waarmee de browser niet meer snapt. */
export const RANGE_STEP_ANY = 'any'

/** Aantal stappen per PageUp/PageDown — bewust een vast veelvoud van de stap. */
export const RANGE_PAGE_STEPS = 10

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Snap een gesleepte (ruwe) waarde naar het dichtstbijzijnde veelvoud van de
 * stap, geklemd op [min, max]. Rondt het veelvoud óver max heen, dan wint max
 * zelf — de bovengrens moet bereikbaar blijven, ook als hij geen veelvoud is.
 * Een stap ≤ 0 of niet-eindig betekent "geen granulariteit": alleen klemmen.
 */
export function snapToStep(raw: number, { step, min, max }: RangeStepBounds): number {
  const value = Number.isFinite(raw) ? raw : min
  if (!(step > 0) || !Number.isFinite(step)) return clamp(value, min, max)
  return clamp(Math.round(value / step) * step, min, max)
}

/**
 * Verplaats `current` een aantal stappen (`count` > 0 omhoog, < 0 omlaag) naar
 * het eerstvolgende veelvoud in die richting. Vanaf een niet-veelvoud (de
 * berekende startstand) telt de eerste stap dus tot het eerstvolgende
 * veelvoud, niet "huidige + stap" — daarna liggen alle standen op het raster,
 * precies zoals de native stap-bediening deed. Geklemd op [min, max].
 */
export function stepBy(current: number, count: number, { step, min, max }: RangeStepBounds): number {
  if (count === 0) return clamp(current, min, max)
  if (!(step > 0) || !Number.isFinite(step)) return clamp(current + count, min, max)
  const base = count > 0 ? Math.floor(current / step) : Math.ceil(current / step)
  return clamp((base + count) * step, min, max)
}

/**
 * Toetsenbord-bediening die de native range-input met `step="any"` NIET meer
 * (Chrome: 1% van het bereik; Firefox: 1) uniform levert. Geeft de nieuwe stand
 * terug, of `null` als de toets niet van de schuif is (Tab etc. blijft native).
 */
export function nextRangeValueForKey(
  key: string,
  current: number,
  bounds: RangeStepBounds,
): number | null {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return stepBy(current, 1, bounds)
    case 'ArrowLeft':
    case 'ArrowDown':
      return stepBy(current, -1, bounds)
    case 'PageUp':
      return stepBy(current, RANGE_PAGE_STEPS, bounds)
    case 'PageDown':
      return stepBy(current, -RANGE_PAGE_STEPS, bounds)
    case 'Home':
      return bounds.min
    case 'End':
      return bounds.max
    default:
      return null
  }
}

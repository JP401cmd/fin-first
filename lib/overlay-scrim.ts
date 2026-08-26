/**
 * overlay-scrim — de ENIGE bron voor de gedimde achtergrond achter een modal.
 *
 * Aanleiding: er waren zeven verschillende scrims in omloop (0.2 / 0.3 / 0.4 /
 * 0.5 / 0.6, `black` vs. `var(--ink)`, blur wel/niet). Dezelfde handeling —
 * "de pagina donker maken achter een modal" — zag er per oppervlak anders uit.
 *
 * Twee verschijningsvormen, één waarde:
 *  - **CSS**: `var(--scrim)` (+ `var(--scrim-blur)`) in `app/globals.css`. Dit
 *    is wat elke overlay-className gebruikt: `bg-[var(--scrim)]`.
 *  - **JS**: `scrimColor(opacity)` — nodig omdat het swipe-gebaar de dekking
 *    van de scrim met de vinger mee laat lopen (`element.style.backgroundColor`
 *    met een tussenwaarde). Een `var()`-referentie kan daar niet geïnterpoleerd
 *    worden, dus die tak rekent met dezelfde kanalen.
 *
 * `overlay-scrim.test.ts` leest `app/globals.css` en dwingt af dat `--scrim`
 * exact `scrimColor()` is — zonder die test zouden de twee takken stil uit
 * elkaar lopen, precies zoals de zeven scrims dat deden.
 */

/** RGB-kanalen van de scrim, als CSS-kanalenlijst. */
export const SCRIM_RGB = '0, 0, 0'

/** Dekking van de scrim in ruststand. */
export const SCRIM_OPACITY = 0.5

/**
 * Scrim-kleur als `rgba(...)`-string. Zonder argument de ruststand — die moet
 * gelijk zijn aan het CSS-token `--scrim`. Met een argument een tussenwaarde
 * voor de drag-animatie (0 = volledig doorzichtig aan het eind van de exit).
 */
export function scrimColor(opacity: number = SCRIM_OPACITY): string {
  return `rgba(${SCRIM_RGB}, ${opacity})`
}

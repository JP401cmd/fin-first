/**
 * Vast categorisch reekspalet voor beheer-grafieken (/beheer/gebruik).
 *
 * De CSS-custom-properties staan in `app/globals.css` onder `.beheer-viz`
 * (licht) en `:root[data-theme="dark"] .beheer-viz` (donker) — mét de keuze en
 * de uitkomst van het dataviz-validatiescript. Deze module is de spiegel voor
 * code en tests; `palet.test.ts` pint beide aan elkaar.
 *
 * Kleur volgt de POSITIE van een stroom in de opgeslagen indeling
 * (`GebruikStroom.kleurIndex`), nooit de rangorde: een stroom houdt zijn kleur
 * als een filter de volgorde of het aantal verandert.
 */

export const BEHEER_REEKS_LICHT = ['#4076b9', '#904b23', '#009091', '#6d509a', '#707e1f', '#8f3e69'] as const
export const BEHEER_REEKS_DONKER = ['#5591dd', '#c06f44', '#00a1a1', '#7858a9', '#879831', '#cc6e9d'] as const

export const BEHEER_REEKS_AANTAL = BEHEER_REEKS_LICHT.length

/** CSS-waarde voor de reekskleur op positie `kleurIndex` (0..5). Buiten bereik → neutrale inkt. */
export function reeksKleur(kleurIndex: number): string {
  if (!Number.isInteger(kleurIndex) || kleurIndex < 0 || kleurIndex >= BEHEER_REEKS_AANTAL) {
    return 'var(--ink-3)'
  }
  return `var(--beheer-reeks-${kleurIndex + 1})`
}

/** Neutrale tint voor grafieken zonder stroomidentiteit (weektrend, overlap, "geen stroom"). */
export const NEUTRALE_REEKS = 'var(--ink-3)'

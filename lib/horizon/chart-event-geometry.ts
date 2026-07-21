// ── Chart event-marker geometrie ───────────────────────────
// Pure geometrie-helpers voor de event-marker-stapels op de Toekomst-grafieken.
// Verhuisd uit components/app/horizon/chart-event-markers.tsx zodat lib
// (sim-chart-geometry) ze kan importeren zonder terug naar components te reiken
// (import-richting UI→lib). De gedeelde layout-consts worden ge-re-exporteerd
// zodat de component-render ze blijft consumeren uit één bron.

import { MAX_STACK_VISIBLE } from '@/lib/chart-event-overlay'

// ── Layout-constanten ────────────────────────────────────────
export const ICON_R = 8
export const STACK_SPACING = 20
export const TOP_GUTTER = 6
export const BOTTOM_GUTTER = 6
/** Verticale afstand tussen het lijn-punt en het midden van het onderste icoon. */
export const LINE_GAP = 10

/** Minimale extra PAD-bovenrand zodat een icoon-stapel boven de bar (legacy)
 *  of vlak onder de chart-bovenrand op de lijn ankert zonder te clippen. */
export function topPaddingFor(eventCount: number): number {
  const stack = Math.min(eventCount, MAX_STACK_VISIBLE)
  return stack > 0 ? TOP_GUTTER + ICON_R * 2 + (stack - 1) * STACK_SPACING + LINE_GAP : 0
}

/** Minimale extra PAD-onderrand zodat events onder de bar passen (legacy
 *  boven/onder-modus, bv. wealth-composition-chart die geen lijn-anker geeft). */
export function bottomPaddingFor(eventCount: number): number {
  const stack = Math.min(eventCount, MAX_STACK_VISIBLE)
  return stack > 0 ? BOTTOM_GUTTER + ICON_R * 2 + (stack - 1) * STACK_SPACING + 4 : 0
}

/**
 * Absoluut minimum-y (clamp-vloer) voor het centrum van het ONDERSTE icoon
 * (stackIndex 0) wanneer de vermogenslijn zó hoog ligt dat de stapel anders
 * tegen de plot-bovenrand klemt.
 *
 * De clamp gebruikt deze vloer i.p.v. binnen het plot te klemmen, zodat de
 * iconen omhoog uitwijken in de via `topPaddingFor(maxStackAtAge)` gereserveerde
 * marge BOVEN het plot-vlak — wég van de doellijn-/FIRE-labels die ín het plot
 * staan. De vloer is zó gekozen dat de volledige stapel van `maxStackAtAge`
 * iconen rechtop in die marge past: het ONDERSTE icoon zit
 * `(stack-1)·STACK_SPACING` lager dan het bovenste, en het bovenste mag niet
 * boven `chartGutterTop + TOP_GUTTER` uitkomen (SVG-bovenrand-vrij).
 *
 * @param maxStackAtAge  grootste stapel op één leeftijd (zoals doorgegeven aan
 *                       topPaddingFor) — bepaalt hoe diep de vloer moet liggen.
 * @param chartGutterTop de vaste bovenmarge van de host-chart (CHART_PAD.top),
 *                       d.w.z. de bovenkant van de gereserveerde icoon-band.
 */
export function iconStackTopFloor(maxStackAtAge: number, chartGutterTop: number): number {
  const stack = Math.min(Math.max(maxStackAtAge, 1), MAX_STACK_VISIBLE)
  return chartGutterTop + TOP_GUTTER + ICON_R + (stack - 1) * STACK_SPACING
}

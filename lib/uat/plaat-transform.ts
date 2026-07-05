// Pure zoom/pan-transformrekenkunde voor de UAT-procesplaat (Deel 3 §3.3).
// GEEN React, GEEN DOM — alle wiskunde in SVG-gebruikerscoördinaten (de
// viewBox-ruimte van plaat-layout). De hook (use-plaat-zoom-pan) doet de
// DOM-kant (getScreenCTM, pointer events) en leunt op deze functies, zodat de
// lastige stukjes — cursor-gecentreerd zoomen, fit-to-box, pan-begrenzing en
// klik-vs-sleep — los getest kunnen worden.

export interface PlaatTransform {
  /** schaalfactor van de inner <g> t.o.v. de basis-viewBox (1 = fit-to-screen). */
  scale: number
  /** translatie in viewBox-eenheden: displayed = scale·content + t. */
  tx: number
  ty: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export const IDENTITY: PlaatTransform = { scale: 1, tx: 0, ty: 0 }

function clampNum(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Begrens de schaal op [min, max]. */
export function clampScale(scale: number, minScale: number, maxScale: number): number {
  return clampNum(scale, minScale, maxScale)
}

/**
 * Zoom met `factor` (>1 = inzoomen) en houd het gebruikers-punt (ux,uy) — het
 * punt onder de cursor in viewBox-coördinaten — exact op z'n plek. Standaard-
 * formule: het content-punt onder de cursor is c=(u−t)/scale; na de zoom moet
 * newScale·c + t' = u, dus t' = u − (newScale/scale)·(u − t).
 */
export function zoomAtPoint(
  t: PlaatTransform,
  factor: number,
  ux: number,
  uy: number,
  minScale: number,
  maxScale: number,
): PlaatTransform {
  const newScale = clampScale(t.scale * factor, minScale, maxScale)
  const k = newScale / t.scale
  return {
    scale: newScale,
    tx: ux - k * (ux - t.tx),
    ty: uy - k * (uy - t.ty),
  }
}

/**
 * Bereken de transform die `box` (in content-coördinaten) gecentreerd in de
 * viewBox (0,0,viewW,viewH) laat passen, met optionele padding en een maximale
 * schaal. Fit-to-screen = fitToBox met de hele content-box.
 */
export function fitToBox(
  box: Box,
  viewW: number,
  viewH: number,
  padding = 0,
  maxScale = Infinity,
): PlaatTransform {
  const availW = Math.max(1, viewW - padding * 2)
  const availH = Math.max(1, viewH - padding * 2)
  const w = Math.max(1e-6, box.w)
  const h = Math.max(1e-6, box.h)
  const scale = Math.min(maxScale, Math.min(availW / w, availH / h))
  return {
    scale,
    tx: (viewW - box.w * scale) / 2 - box.x * scale,
    ty: (viewH - box.h * scale) / 2 - box.y * scale,
  }
}

/**
 * Begrens de pan zodat de content nooit volledig uit beeld wegdrijft: de
 * getoonde content-randen worden aan de viewBox-randen vastgezet (edge-snap).
 * Grotere content dan de viewBox → randen mogen tot de viewBox-randen; kleinere
 * content → blijft binnen de viewBox.
 */
export function clampPan(
  t: PlaatTransform,
  viewW: number,
  viewH: number,
  contentW: number,
  contentH: number,
): PlaatTransform {
  const dispW = contentW * t.scale
  const dispH = contentH * t.scale
  const loX = Math.min(0, viewW - dispW)
  const hiX = Math.max(0, viewW - dispW)
  const loY = Math.min(0, viewH - dispH)
  const hiY = Math.max(0, viewH - dispH)
  return {
    scale: t.scale,
    tx: clampNum(t.tx, loX, hiX),
    ty: clampNum(t.ty, loY, hiY),
  }
}

/** Onderscheid een klik van een sleep: verplaatsing (px) binnen de drempel = klik. */
export function isClick(dx: number, dy: number, threshold = 5): boolean {
  return Math.hypot(dx, dy) <= threshold
}

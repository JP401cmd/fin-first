/**
 * Gedeelde SVG-schaal-helpers voor de rapport-grafieken.
 *
 * De grafieken tekenen op basis van de DTO-reeksen (ReportProjectionPoint[]).
 * Assen schalen DYNAMISCH op de echte waarden — geen hardcoded €1,2M uit het
 * ontwerp. Deze helpers leveren de schaalfuncties + "nette" as-ticks.
 */

import type { ReportProjectionPoint } from '@/lib/check/types'

export interface ChartBox {
  /** Plot-gebied binnen de viewBox. */
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface LinearScale {
  (value: number): number
  domainMin: number
  domainMax: number
}

/** Lineaire schaal van [domainMin..domainMax] → [rangeMin..rangeMax]. */
export function makeScale(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): LinearScale {
  const span = domainMax - domainMin || 1
  const fn = ((value: number) =>
    rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin)) as LinearScale
  fn.domainMin = domainMin
  fn.domainMax = domainMax
  return fn
}

/**
 * Kies een "nette" bovengrens voor de Y-as (1/2/2.5/5 × 10^n) net boven de max,
 * zodat de as-labels ronde getallen tonen.
 */
export function niceMax(rawMax: number): number {
  if (rawMax <= 0) return 1
  const exp = Math.floor(Math.log10(rawMax))
  const base = Math.pow(10, exp)
  const frac = rawMax / base
  let niceFrac: number
  if (frac <= 1) niceFrac = 1
  else if (frac <= 2) niceFrac = 2
  else if (frac <= 2.5) niceFrac = 2.5
  else if (frac <= 5) niceFrac = 5
  else niceFrac = 10
  return niceFrac * base
}

/** Maximale waarde over één of meer reeksen (voor de Y-domeingrens). */
export function seriesMax(...series: ReportProjectionPoint[][]): number {
  let max = 0
  for (const s of series) {
    for (const p of s) {
      if (p.value > max) max = p.value
    }
  }
  return max
}

/** Min/max leeftijd over reeksen (voor de X-domeingrens). */
export function ageExtent(
  ...series: ReportProjectionPoint[][]
): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const s of series) {
    for (const p of s) {
      if (p.age < min) min = p.age
      if (p.age > max) max = p.age
    }
  }
  if (!isFinite(min)) return { min: 0, max: 1 }
  return { min, max: max > min ? max : min + 1 }
}

/**
 * Smooth cubic-Bézier pad door de punten (Catmull-Rom → Bézier).
 * Levert een vloeiende curve zoals het ontwerp, maar uit échte datapunten.
 */
export function smoothPath(
  points: { x: number; y: number }[],
): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M${points[0].x},${points[0].y}`
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`
  }

  const d: string[] = [`M${points[0].x},${points[0].y}`]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d.push(`C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`)
  }
  return d.join(' ')
}

/** Geometrische lengte van een polyline door de punten — voor dash-animatie. */
export function pathLength(points: { x: number; y: number }[]): number {
  let len = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    len += Math.hypot(dx, dy)
  }
  // ruime marge zodat de smooth-curve (langer dan de polyline) zeker bedekt is
  return Math.ceil(len * 1.4) + 50
}

/** Y-as ticks (4 lijnen) als nette ronde euro-bedragen. */
export function euroAxisTicks(maxValue: number, count = 4): number[] {
  const top = niceMax(maxValue)
  const step = top / count
  const ticks: number[] = []
  for (let i = count; i >= 1; i--) ticks.push(step * i)
  return ticks
}

/** Compacte euro-as-label: €1,2M / €640k / €0. */
export function euroAxisLabel(value: number): string {
  if (value === 0) return '€0'
  if (value >= 1_000_000) {
    const m = value / 1_000_000
    return `€${m.toFixed(m % 1 === 0 ? 0 : 1).replace('.', ',')}M`
  }
  if (value >= 1000) {
    return `€${Math.round(value / 1000)}k`
  }
  return `€${Math.round(value)}`
}

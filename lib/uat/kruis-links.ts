// Pure geometrie voor de KRUIS-verbindingslijnen op de UAT-procesplaat
// (docs/uat/uat-plan.md Deel 3 §3.2/§3.6 brok 5). Elk KRUIS-scenario met een
// `kruisZones` van 2+ deelgebieden wordt een verbinding tussen de betrokken
// zone-tegels: één lijnsegment per zone (van de tegelrand naar een centrale
// hub) plus de hub zelf, waar het klikbare knoopje komt.
//
// GEEN React, GEEN data-fetching — puur geometrie op de (deterministische)
// plaat-layout + catalogus. Dezelfde layout geeft altijd dezelfde lijnen.
// De renderer (uat-plaat-svg.tsx) tekent de segmenten en de hub; het klikken
// op de hub opent hetzelfde detailpaneel als een gewone scenario-knoop.

import { UAT_SCENARIOS, type UatScenario, type UatZone } from './catalog'
import type { PlaatLayout } from './plaat-layout'

export interface KruisLinkSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface KruisLink {
  scenario: UatScenario
  zones: UatZone[]
  /** Middelpunt van de verbinding (centroïde van de betrokken zone-tegels) — hier komt het klikbare knoopje. */
  hub: { x: number; y: number }
  /** Eén segment per betrokken zone, in dezelfde volgorde als `zones`: van de tegelrand naar de hub. */
  segments: KruisLinkSegment[]
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Het punt op de rand van `rect` op de rechte lijn van het midden van `rect`
 * naar `target` — d.w.z. waar een lijn naar `target` de tegelrand doorkruist.
 * Standaard center-naar-punt rechthoek-randintersectie.
 */
function edgeTowards(rect: Rect, target: { x: number; y: number }): { x: number; y: number } {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const dx = target.x - cx
  const dy = target.y - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const halfW = rect.w / 2
  const halfH = rect.h / 2
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Number.POSITIVE_INFINITY
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Number.POSITIVE_INFINITY
  const scale = Math.min(scaleX, scaleY)
  return { x: cx + dx * scale, y: cy + dy * scale }
}

/**
 * Bouwt de KRUIS-verbindingen uit de gegeven plaat-layout. Scenario's zonder
 * `kruisZones` (of met minder dan 2) leveren geen link — die blijven gewone
 * knopen ín de KRUIS-zonetegel. Een verwijzing naar een zone die niet in de
 * layout voorkomt (zou niet moeten gebeuren; catalog.test.ts bewaakt dat elke
 * `kruisZones`-vermelding een bestaande zone is) slaat de link over in plaats
 * van met NaN-coördinaten te renderen.
 */
export function buildKruisLinks(
  layout: PlaatLayout,
  scenarios: readonly UatScenario[] = UAT_SCENARIOS,
): KruisLink[] {
  const rectByZone = new Map<UatZone, Rect>()
  const centerByZone = new Map<UatZone, { x: number; y: number }>()
  for (const zone of layout.zones) {
    rectByZone.set(zone.zone.zone, { x: zone.x, y: zone.y, w: zone.w, h: zone.h })
    centerByZone.set(zone.zone.zone, { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 })
  }

  const links: KruisLink[] = []
  for (const scenario of scenarios) {
    const zones = scenario.kruisZones
    if (!zones || zones.length < 2) continue

    const rects = zones.map((z) => rectByZone.get(z))
    const centers = zones.map((z) => centerByZone.get(z))
    if (rects.some((r) => !r) || centers.some((c) => !c)) continue
    const validRects = rects as Rect[]
    const validCenters = centers as { x: number; y: number }[]

    const hub = {
      x: validCenters.reduce((sum, c) => sum + c.x, 0) / validCenters.length,
      y: validCenters.reduce((sum, c) => sum + c.y, 0) / validCenters.length,
    }

    const segments: KruisLinkSegment[] = validRects.map((rect) => {
      const edge = edgeTowards(rect, hub)
      return { x1: edge.x, y1: edge.y, x2: hub.x, y2: hub.y }
    })

    links.push({ scenario, zones, hub, segments })
  }
  return links
}

// Pure layout voor de UAT-procesplaat: berekent in een vaste SVG-coördinaten-
// ruimte (vaste breedte, berekende hoogte) de posities van de reis-banden, de
// zone-tegels binnen hun band en de scenario-knopen in een raster per zone.
//
// GEEN React, GEEN data — alleen geometrie, deterministisch en herbruikbaar
// (brok 3 zoomt/pant op deze coördinatenruimte; brok 5 tekent de KRUIS-lijnen
// tussen zone-knopen). De statuskleuren komen los uit lib/uat/status.ts.

import {
  UAT_BANDEN,
  UAT_SCENARIOS,
  UAT_ZONES,
  type UatBand,
  type UatKriticiteit,
  type UatScenario,
  type UatZone,
  type UatZoneMeta,
} from './catalog'

// ── Vaste maatvoering ─────────────────────────────────────────────────────────

const WIDTH = 1240
const PAD = 18
const BAND_LABEL_H = 26
const BAND_GAP = 20
const ZONE_GAP = 14
const ZONE_PAD = 10
const ZONE_HEADER_H = 44
const CELL = 26

/** Knoop-straal naar kriticiteit: KERN groot, BELANGRIJK middel, OVERIG klein. */
const NODE_RADIUS: Record<UatKriticiteit, number> = {
  KERN: 10,
  BELANGRIJK: 7.5,
  OVERIG: 5.5,
}

export function nodeRadius(kriticiteit: UatKriticiteit): number {
  return NODE_RADIUS[kriticiteit]
}

// ── Resultaat-typen ───────────────────────────────────────────────────────────

export interface NodeLayout {
  scenario: UatScenario
  cx: number
  cy: number
  r: number
}

export interface ZoneLayout {
  zone: UatZoneMeta
  x: number
  y: number
  w: number
  h: number
  headerH: number
  nodes: NodeLayout[]
}

export interface BandLayout {
  id: UatBand
  label: string
  x: number
  y: number
  w: number
  h: number
  labelH: number
}

export interface PlaatLayout {
  width: number
  height: number
  bands: BandLayout[]
  zones: ZoneLayout[]
}

// ── Hulpfuncties ──────────────────────────────────────────────────────────────

/** Aantal kolommen voor een zone met n knopen (min 3, max 8, ~vierkant met bias naar breedte). */
function columnsFor(n: number): number {
  if (n <= 0) return 3
  return Math.min(8, Math.max(3, Math.ceil(Math.sqrt(n * 1.6))))
}

const ZONE_BY_ID = new Map<UatZone, UatZoneMeta>(UAT_ZONES.map((z) => [z.zone, z]))

/**
 * Scenario's van één zone als tegel-knopen, op volgorde. Voor de KRUIS-zone
 * vallen scenario's mét 2+ `kruisZones` hier weg: die worden door kruis-links.ts
 * als cross-zone verbindingshub getekend, niet als gewone tegel-node (anders
 * dubbel). Alleen 'orphan'-KRUIS-scenario's (geen/te weinig kruisZones) blijven.
 */
function scenariosForZone(zone: UatZone): UatScenario[] {
  const inZone = UAT_SCENARIOS.filter((s) => s.zone === zone)
  const filtered =
    zone === 'KRUIS' ? inZone.filter((s) => !(s.kruisZones && s.kruisZones.length >= 2)) : inZone
  return filtered.sort((a, b) => a.volgorde - b.volgorde)
}

/** Meet een zone-tegel (breedte/hoogte + kolommen) zonder 'm te plaatsen. */
function measureZone(scenarios: UatScenario[]): { w: number; h: number; cols: number; rows: number } {
  const cols = columnsFor(scenarios.length)
  const rows = Math.max(1, Math.ceil(scenarios.length / cols))
  const w = ZONE_PAD * 2 + cols * CELL
  const h = ZONE_HEADER_H + rows * CELL + ZONE_PAD
  return { w, h, cols, rows }
}

// ── Hoofdfunctie ──────────────────────────────────────────────────────────────

/**
 * Bouwt de volledige plaat-layout uit de catalogus. Deterministisch: dezelfde
 * catalogus geeft altijd exact dezelfde coördinaten.
 */
export function buildPlaatLayout(): PlaatLayout {
  const innerLeft = PAD
  const innerWidth = WIDTH - PAD * 2

  const bands: BandLayout[] = []
  const zones: ZoneLayout[] = []

  let cursorY = PAD

  for (const band of UAT_BANDEN) {
    const bandTop = cursorY
    let rowX = innerLeft
    let rowY = bandTop + BAND_LABEL_H
    let rowMaxH = 0

    for (const zoneId of band.zones) {
      const meta = ZONE_BY_ID.get(zoneId)
      if (!meta) continue
      const scenarios = scenariosForZone(zoneId)
      const { w, h, cols } = measureZone(scenarios)

      // Wrap naar een nieuwe rij binnen de band als de tegel niet meer past.
      if (rowX + w > innerLeft + innerWidth && rowX > innerLeft) {
        rowX = innerLeft
        rowY += rowMaxH + ZONE_GAP
        rowMaxH = 0
      }

      const gridX0 = rowX + ZONE_PAD
      const gridY0 = rowY + ZONE_HEADER_H
      const nodes: NodeLayout[] = scenarios.map((scenario, i) => {
        const col = i % cols
        const rowIdx = Math.floor(i / cols)
        return {
          scenario,
          cx: gridX0 + col * CELL + CELL / 2,
          cy: gridY0 + rowIdx * CELL + CELL / 2,
          r: NODE_RADIUS[scenario.kriticiteit],
        }
      })

      zones.push({ zone: meta, x: rowX, y: rowY, w, h, headerH: ZONE_HEADER_H, nodes })

      rowX += w + ZONE_GAP
      rowMaxH = Math.max(rowMaxH, h)
    }

    const bandBottom = rowY + rowMaxH
    bands.push({
      id: band.id,
      label: band.label,
      x: innerLeft,
      y: bandTop,
      w: innerWidth,
      h: bandBottom - bandTop,
      labelH: BAND_LABEL_H,
    })

    cursorY = bandBottom + BAND_GAP
  }

  const height = cursorY - BAND_GAP + PAD

  return { width: WIDTH, height, bands, zones }
}

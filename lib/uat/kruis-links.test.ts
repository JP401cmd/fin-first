import { describe, expect, it } from 'vitest'
import { UAT_SCENARIOS } from './catalog'
import { buildKruisLinks } from './kruis-links'
import { buildPlaatLayout } from './plaat-layout'

describe('buildKruisLinks', () => {
  const layout = buildPlaatLayout()
  const links = buildKruisLinks(layout)
  const kruisScenariosWithZones = UAT_SCENARIOS.filter((s) => s.kruisZones && s.kruisZones.length >= 2)

  it('bouwt exact één link per KRUIS-scenario met 2+ kruisZones (geen extra, geen gemiste)', () => {
    expect(kruisScenariosWithZones.length).toBeGreaterThan(0)
    expect(links.length).toBe(kruisScenariosWithZones.length)
    expect(new Set(links.map((l) => l.scenario.id))).toEqual(new Set(kruisScenariosWithZones.map((s) => s.id)))
  })

  it("scenario's mét kruisZones verschijnen niet óók als gewone zone-node in de KRUIS-tegel", () => {
    // Deze scenario's worden al als cross-zone KruisLink-hub getekend; ze mogen
    // niet dubbel óók als gewone knoop ín de KRUIS-tegel verschijnen.
    const kruisZone = layout.zones.find((z) => z.zone.zone === 'KRUIS')
    expect(kruisZone).toBeDefined()
    const nodeIds = new Set(kruisZone!.nodes.map((n) => n.scenario.id))
    for (const s of kruisScenariosWithZones) {
      expect(nodeIds.has(s.id), `${s.id} hoort als KruisLink-hub getekend te worden, niet als tegel-node`).toBe(false)
    }
  })

  it('de tegel-nodes en de KruisLink-hubs partitioneren álle KRUIS-scenario\'s (geen dubbel, geen gemist)', () => {
    // De partitie-invariant achter de H1-fix: elk KRUIS-zone-scenario wordt
    // PRECIES één keer getekend — als hub (kruisZones ≥ 2) óf als tegel-node
    // (wees-KRUIS zonder linkbare zones), nooit beide, nooit geen van beide.
    const kruisZone = layout.zones.find((z) => z.zone.zone === 'KRUIS')
    expect(kruisZone).toBeDefined()
    const tegelIds = new Set(kruisZone!.nodes.map((n) => n.scenario.id))
    const hubIds = new Set(links.map((l) => l.scenario.id))

    // Disjunct: geen enkel scenario in beide verzamelingen.
    for (const id of tegelIds) {
      expect(hubIds.has(id), `${id} staat zowel als tegel-node als als hub`).toBe(false)
    }

    // Volledig: samen dekken ze exact de KRUIS-zone-scenario's — geen drop.
    const allKruisZoneIds = new Set(UAT_SCENARIOS.filter((s) => s.zone === 'KRUIS').map((s) => s.id))
    const union = new Set<string>([...tegelIds, ...hubIds])
    expect(union).toEqual(allKruisZoneIds)
    expect(tegelIds.size + hubIds.size).toBe(allKruisZoneIds.size)
  })

  it('elke link heeft evenveel segmenten als betrokken zones, en elk segment eindigt exact in de hub', () => {
    for (const link of links) {
      expect(link.segments.length).toBe(link.zones.length)
      for (const seg of link.segments) {
        expect(seg.x2).toBeCloseTo(link.hub.x, 6)
        expect(seg.y2).toBeCloseTo(link.hub.y, 6)
        expect(Number.isFinite(seg.x1)).toBe(true)
        expect(Number.isFinite(seg.y1)).toBe(true)
      }
    }
  })

  it('elke link verwijst alleen naar zones die ook echt in de layout bestaan', () => {
    const layoutZoneIds = new Set(layout.zones.map((z) => z.zone.zone))
    for (const link of links) {
      for (const zone of link.zones) {
        expect(layoutZoneIds.has(zone), `${link.scenario.id}: onbekende zone '${zone}' in de layout`).toBe(true)
      }
    }
  })

  it('het startpunt van elk segment ligt op de rand van zijn zone-tegel (niet in het midden, niet erbuiten)', () => {
    const rectByZone = new Map(layout.zones.map((z) => [z.zone.zone, z]))
    for (const link of links) {
      link.zones.forEach((zoneId, i) => {
        const rect = rectByZone.get(zoneId)
        expect(rect, `${link.scenario.id}: zone '${zoneId}' niet gevonden`).toBeDefined()
        if (!rect) return
        const seg = link.segments[i]
        expect(seg.x1).toBeGreaterThanOrEqual(rect.x - 0.01)
        expect(seg.x1).toBeLessThanOrEqual(rect.x + rect.w + 0.01)
        expect(seg.y1).toBeGreaterThanOrEqual(rect.y - 0.01)
        expect(seg.y1).toBeLessThanOrEqual(rect.y + rect.h + 0.01)
      })
    }
  })

  it('de hub ligt binnen de plaat-viewBox', () => {
    for (const link of links) {
      expect(link.hub.x).toBeGreaterThanOrEqual(0)
      expect(link.hub.x).toBeLessThanOrEqual(layout.width)
      expect(link.hub.y).toBeGreaterThanOrEqual(0)
      expect(link.hub.y).toBeLessThanOrEqual(layout.height)
    }
  })

  it('is deterministisch: opnieuw bouwen met een verse layout geeft identieke coördinaten', () => {
    const again = buildKruisLinks(buildPlaatLayout())
    expect(again).toEqual(links)
  })

  it('slaat scenario\'s zonder (of met te weinig) kruisZones over', () => {
    const idsWithLinks = new Set(links.map((l) => l.scenario.id))
    const zonderLink = UAT_SCENARIOS.filter((s) => !s.kruisZones || s.kruisZones.length < 2)
    for (const s of zonderLink) {
      expect(idsWithLinks.has(s.id)).toBe(false)
    }
  })
})

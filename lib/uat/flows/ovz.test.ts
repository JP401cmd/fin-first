import { describe, expect, it } from 'vitest'
import { OVZ_FLOW } from './ovz'
import { UAT_SCENARIOS, UAT_ZONES, type UatZone } from '../catalog'

const SCENARIO_BY_ID = new Map(UAT_SCENARIOS.map((s) => [s.id, s]))
const VALID_ZONES = new Set<UatZone>(UAT_ZONES.map((z) => z.zone))
const NODE_IDS = new Set(OVZ_FLOW.nodes.map((n) => n.id))

describe('OVZ_FLOW — curatie-integriteit', () => {
  it('is de OVZ-zone', () => {
    expect(OVZ_FLOW.zone).toBe('OVZ')
  })

  it('heeft unieke knoop-ids', () => {
    expect(NODE_IDS.size).toBe(OVZ_FLOW.nodes.length)
  })

  it('elke scenarioId (indien aanwezig) bestaat en heeft zone OVZ', () => {
    for (const node of OVZ_FLOW.nodes) {
      if (!node.scenarioId) continue
      const scenario = SCENARIO_BY_ID.get(node.scenarioId)
      expect(scenario, `scenario ${node.scenarioId} (knoop ${node.id}) moet bestaan`).toBeDefined()
      expect(scenario!.zone, `scenario ${node.scenarioId} moet zone OVZ hebben`).toBe('OVZ')
    }
  })

  it('elke edge.from/edge.to verwijst naar een bestaande node-id', () => {
    for (const edge of OVZ_FLOW.edges) {
      expect(NODE_IDS.has(edge.from), `edge.from ${edge.from} moet bestaan`).toBe(true)
      expect(NODE_IDS.has(edge.to), `edge.to ${edge.to} moet bestaan`).toBe(true)
    }
  })

  it('elke subOf verwijst naar een bestaande node-id (en niet naar zichzelf)', () => {
    for (const node of OVZ_FLOW.nodes) {
      if (!node.subOf) continue
      expect(NODE_IDS.has(node.subOf), `subOf ${node.subOf} (knoop ${node.id}) moet bestaan`).toBe(true)
      expect(node.subOf).not.toBe(node.id)
    }
  })

  it('crossZone is alleen gezet op kind=cross en verwijst naar een geldige UatZone', () => {
    for (const node of OVZ_FLOW.nodes) {
      if (node.crossZone === undefined) continue
      expect(node.kind, `knoop ${node.id} met crossZone moet kind=cross zijn`).toBe('cross')
      expect(VALID_ZONES.has(node.crossZone), `crossZone ${node.crossZone} moet geldig zijn`).toBe(true)
    }
  })

  it('dekt alle 19 WF-OVZ-scenario\'s (01..16, 19..21 — WF-OVZ-17/18 bestaan niet in de catalogus)', () => {
    const covered = new Set(
      OVZ_FLOW.nodes.map((n) => n.scenarioId).filter((id): id is string => Boolean(id)),
    )
    const expected = [
      ...Array.from({ length: 16 }, (_, i) => i + 1),
      19, 20, 21,
    ].map((n) => `UAT-OVZ-${String(n).padStart(2, '0')}`)
    for (const id of expected) {
      expect(covered.has(id), `${id} moet als flow-knoop voorkomen`).toBe(true)
    }
    expect(covered.size).toBe(19)
  })

  it('de domeinoverschrijdende cross-knopen dekken WILL/TOEK/MIJN/NAV/BEZIT', () => {
    const crossZones = new Set(
      OVZ_FLOW.nodes
        .filter((n) => n.kind === 'cross')
        .map((n) => n.crossZone)
        .filter((z): z is UatZone => Boolean(z)),
    )
    for (const z of ['WILL', 'TOEK', 'MIJN', 'NAV', 'BEZIT'] as const) {
      expect(crossZones.has(z), `cross naar ${z} moet aanwezig zijn`).toBe(true)
    }
  })
})

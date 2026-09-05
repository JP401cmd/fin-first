import { describe, expect, it } from 'vitest'
import { WILL_FLOW } from './will'
import { UAT_SCENARIOS, UAT_ZONES, type UatZone } from '../catalog'

const SCENARIO_BY_ID = new Map(UAT_SCENARIOS.map((s) => [s.id, s]))
const VALID_ZONES = new Set<UatZone>(UAT_ZONES.map((z) => z.zone))
const NODE_IDS = new Set(WILL_FLOW.nodes.map((n) => n.id))

describe('WILL_FLOW — curatie-integriteit', () => {
  it('is de WILL-zone', () => {
    expect(WILL_FLOW.zone).toBe('WILL')
  })

  it('heeft unieke knoop-ids', () => {
    expect(NODE_IDS.size).toBe(WILL_FLOW.nodes.length)
  })

  it('elke scenarioId (indien aanwezig) bestaat en heeft zone WILL', () => {
    for (const node of WILL_FLOW.nodes) {
      if (!node.scenarioId) continue
      const scenario = SCENARIO_BY_ID.get(node.scenarioId)
      expect(scenario, `scenario ${node.scenarioId} (knoop ${node.id}) moet bestaan`).toBeDefined()
      expect(scenario!.zone, `scenario ${node.scenarioId} moet zone WILL hebben`).toBe('WILL')
    }
  })

  it('elke edge.from/edge.to verwijst naar een bestaande node-id', () => {
    for (const edge of WILL_FLOW.edges) {
      expect(NODE_IDS.has(edge.from), `edge.from ${edge.from} moet bestaan`).toBe(true)
      expect(NODE_IDS.has(edge.to), `edge.to ${edge.to} moet bestaan`).toBe(true)
    }
  })

  it('elke subOf verwijst naar een bestaande node-id (en niet naar zichzelf)', () => {
    for (const node of WILL_FLOW.nodes) {
      if (!node.subOf) continue
      expect(NODE_IDS.has(node.subOf), `subOf ${node.subOf} (knoop ${node.id}) moet bestaan`).toBe(true)
      expect(node.subOf).not.toBe(node.id)
    }
  })

  it('crossZone is alleen gezet op kind=cross en verwijst naar een geldige UatZone', () => {
    for (const node of WILL_FLOW.nodes) {
      if (node.crossZone === undefined) continue
      expect(node.kind, `knoop ${node.id} met crossZone moet kind=cross zijn`).toBe('cross')
      expect(VALID_ZONES.has(node.crossZone), `crossZone ${node.crossZone} moet geldig zijn`).toBe(true)
    }
  })

  it('dekt alle 24 WF-WILL-scenario\'s (01..20 + 23 t/m 26 — WF-WILL-21/22 bestaan niet in de catalogus)', () => {
    const covered = new Set(
      WILL_FLOW.nodes.map((n) => n.scenarioId).filter((id): id is string => Boolean(id)),
    )
    const expected = [
      ...Array.from({ length: 20 }, (_, i) => `UAT-WILL-${String(i + 1).padStart(2, '0')}`),
      'UAT-WILL-23',
      'UAT-WILL-24',
      'UAT-WILL-25',
      'UAT-WILL-26',
    ]
    for (const id of expected) {
      expect(covered.has(id), `${id} moet als flow-knoop voorkomen`).toBe(true)
    }
    expect(covered.size).toBe(24)
  })

  it('de domeinoverschrijdende cross-knopen dekken OVZ/MIJN/BEZIT/TOEK', () => {
    const crossZones = new Set(
      WILL_FLOW.nodes
        .filter((n) => n.kind === 'cross')
        .map((n) => n.crossZone)
        .filter((z): z is UatZone => Boolean(z)),
    )
    for (const z of ['OVZ', 'MIJN', 'BEZIT', 'TOEK'] as const) {
      expect(crossZones.has(z), `cross naar ${z} moet aanwezig zijn`).toBe(true)
    }
  })
})

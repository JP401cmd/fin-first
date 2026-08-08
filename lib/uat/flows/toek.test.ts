import { describe, expect, it } from 'vitest'
import { TOEK_FLOW } from './toek'
import { UAT_SCENARIOS, UAT_ZONES, type UatZone } from '../catalog'

const SCENARIO_BY_ID = new Map(UAT_SCENARIOS.map((s) => [s.id, s]))
const VALID_ZONES = new Set<UatZone>(UAT_ZONES.map((z) => z.zone))
const NODE_IDS = new Set(TOEK_FLOW.nodes.map((n) => n.id))

describe('TOEK_FLOW — curatie-integriteit', () => {
  it('is de TOEK-zone', () => {
    expect(TOEK_FLOW.zone).toBe('TOEK')
  })

  it('heeft unieke knoop-ids', () => {
    expect(NODE_IDS.size).toBe(TOEK_FLOW.nodes.length)
  })

  it('elke scenarioId (indien aanwezig) bestaat en heeft zone TOEK', () => {
    for (const node of TOEK_FLOW.nodes) {
      if (!node.scenarioId) continue
      const scenario = SCENARIO_BY_ID.get(node.scenarioId)
      expect(scenario, `scenario ${node.scenarioId} (knoop ${node.id}) moet bestaan`).toBeDefined()
      expect(scenario!.zone, `scenario ${node.scenarioId} moet zone TOEK hebben`).toBe('TOEK')
    }
  })

  it('elke edge.from/edge.to verwijst naar een bestaande node-id', () => {
    for (const edge of TOEK_FLOW.edges) {
      expect(NODE_IDS.has(edge.from), `edge.from ${edge.from} moet bestaan`).toBe(true)
      expect(NODE_IDS.has(edge.to), `edge.to ${edge.to} moet bestaan`).toBe(true)
    }
  })

  it('elke subOf verwijst naar een bestaande node-id (en niet naar zichzelf)', () => {
    for (const node of TOEK_FLOW.nodes) {
      if (!node.subOf) continue
      expect(NODE_IDS.has(node.subOf), `subOf ${node.subOf} (knoop ${node.id}) moet bestaan`).toBe(true)
      expect(node.subOf).not.toBe(node.id)
    }
  })

  it('crossZone is alleen gezet op kind=cross en verwijst naar een geldige UatZone', () => {
    for (const node of TOEK_FLOW.nodes) {
      if (node.crossZone === undefined) continue
      expect(node.kind, `knoop ${node.id} met crossZone moet kind=cross zijn`).toBe('cross')
      expect(VALID_ZONES.has(node.crossZone), `crossZone ${node.crossZone} moet geldig zijn`).toBe(true)
    }
  })

  it('dekt de verwachte statusdragende WF-TOEK-scenario\'s (01..26,28,29,30,32,33,34)', () => {
    const covered = new Set(
      TOEK_FLOW.nodes.map((n) => n.scenarioId).filter((id): id is string => Boolean(id)),
    )
    // 27 (uitgave-na-pensioen → REKEN) en 31 (huishoudperspectief → NAV) zijn
    // verwijsregels en hebben bewust geen eigen TOEK-scenario/knoop.
    const expected = [
      ...Array.from({ length: 26 }, (_, i) => i + 1), // 1..26
      28, 29, 30, 32, 33, 34,
    ].map((n) => `UAT-TOEK-${String(n).padStart(2, '0')}`)
    for (const id of expected) {
      expect(covered.has(id), `${id} moet als flow-knoop voorkomen`).toBe(true)
    }
  })

  it('de domeinoverschrijdende cross-knopen dekken Bezit/OVZ/BELAST/REKEN', () => {
    const crossZones = new Set(
      TOEK_FLOW.nodes
        .filter((n) => n.kind === 'cross')
        .map((n) => n.crossZone)
        .filter((z): z is UatZone => Boolean(z)),
    )
    for (const z of ['BEZIT', 'OVZ', 'BELAST', 'REKEN'] as const) {
      expect(crossZones.has(z), `cross naar ${z} moet aanwezig zijn`).toBe(true)
    }
  })
})

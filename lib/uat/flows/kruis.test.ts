import { describe, expect, it } from 'vitest'
import { KRUIS_FLOW } from './kruis'
import { UAT_SCENARIOS, UAT_ZONES, type UatZone } from '../catalog'

const SCENARIO_BY_ID = new Map(UAT_SCENARIOS.map((s) => [s.id, s]))
const VALID_ZONES = new Set<UatZone>(UAT_ZONES.map((z) => z.zone))
const NODE_IDS = new Set(KRUIS_FLOW.nodes.map((n) => n.id))

describe('KRUIS_FLOW — curatie-integriteit', () => {
  it('is de KRUIS-zone', () => {
    expect(KRUIS_FLOW.zone).toBe('KRUIS')
  })

  it('heeft unieke knoop-ids', () => {
    expect(NODE_IDS.size).toBe(KRUIS_FLOW.nodes.length)
  })

  it('elke scenarioId (indien aanwezig) bestaat en heeft zone KRUIS', () => {
    for (const node of KRUIS_FLOW.nodes) {
      if (!node.scenarioId) continue
      const scenario = SCENARIO_BY_ID.get(node.scenarioId)
      expect(scenario, `scenario ${node.scenarioId} (knoop ${node.id}) moet bestaan`).toBeDefined()
      expect(scenario!.zone, `scenario ${node.scenarioId} moet zone KRUIS hebben`).toBe('KRUIS')
    }
  })

  it('elke edge.from/edge.to verwijst naar een bestaande node-id', () => {
    for (const edge of KRUIS_FLOW.edges) {
      expect(NODE_IDS.has(edge.from), `edge.from ${edge.from} moet bestaan`).toBe(true)
      expect(NODE_IDS.has(edge.to), `edge.to ${edge.to} moet bestaan`).toBe(true)
    }
  })

  it('elke subOf verwijst naar een bestaande node-id (en niet naar zichzelf)', () => {
    for (const node of KRUIS_FLOW.nodes) {
      if (!node.subOf) continue
      expect(NODE_IDS.has(node.subOf), `subOf ${node.subOf} (knoop ${node.id}) moet bestaan`).toBe(true)
      expect(node.subOf).not.toBe(node.id)
    }
  })

  it('crossZone is alleen gezet op kind=cross en verwijst naar een geldige UatZone', () => {
    for (const node of KRUIS_FLOW.nodes) {
      if (node.crossZone === undefined) continue
      expect(node.kind, `knoop ${node.id} met crossZone moet kind=cross zijn`).toBe('cross')
      expect(VALID_ZONES.has(node.crossZone), `crossZone ${node.crossZone} moet geldig zijn`).toBe(true)
    }
  })

  it('dekt alle 27 statusdragende UAT-KRUIS-scenario\'s (01..27) als flow-knoop', () => {
    const covered = new Set(
      KRUIS_FLOW.nodes.map((n) => n.scenarioId).filter((id): id is string => Boolean(id)),
    )
    const expected = Array.from({ length: 27 }, (_, i) => `UAT-KRUIS-${String(i + 1).padStart(2, '0')}`)
    for (const id of expected) {
      expect(covered.has(id), `${id} moet als flow-knoop voorkomen`).toBe(true)
    }
    // Precies deze 27, geen dubbele scenario-knopen.
    expect(covered.size).toBe(27)
  })

  it('bevat cross-knopen naar de belangrijkste kruisZones', () => {
    const crossZones = new Set(
      KRUIS_FLOW.nodes.filter((n) => n.kind === 'cross').map((n) => n.crossZone),
    )
    for (const zone of ['BEZIT', 'SCHULD', 'CASH', 'BELAST', 'TOEK', 'OVZ', 'RAPP', 'WILL', 'MIJN'] as UatZone[]) {
      expect(crossZones.has(zone), `cross naar ${zone} verwacht`).toBe(true)
    }
  })
})

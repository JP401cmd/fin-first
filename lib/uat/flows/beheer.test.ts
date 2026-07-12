import { describe, expect, it } from 'vitest'
import { BEHEER_FLOW } from './beheer'
import { UAT_SCENARIOS, UAT_ZONES, type UatZone } from '../catalog'

const SCENARIO_BY_ID = new Map(UAT_SCENARIOS.map((s) => [s.id, s]))
const VALID_ZONES = new Set<UatZone>(UAT_ZONES.map((z) => z.zone))
const NODE_IDS = new Set(BEHEER_FLOW.nodes.map((n) => n.id))

describe('BEHEER_FLOW — curatie-integriteit', () => {
  it('is de BEHEER-zone', () => {
    expect(BEHEER_FLOW.zone).toBe('BEHEER')
  })

  it('heeft unieke knoop-ids', () => {
    expect(NODE_IDS.size).toBe(BEHEER_FLOW.nodes.length)
  })

  it('elke scenarioId (indien aanwezig) bestaat en heeft zone BEHEER', () => {
    for (const node of BEHEER_FLOW.nodes) {
      if (!node.scenarioId) continue
      const scenario = SCENARIO_BY_ID.get(node.scenarioId)
      expect(scenario, `scenario ${node.scenarioId} (knoop ${node.id}) moet bestaan`).toBeDefined()
      expect(scenario!.zone, `scenario ${node.scenarioId} moet zone BEHEER hebben`).toBe('BEHEER')
    }
  })

  it('elke edge.from/edge.to verwijst naar een bestaande node-id', () => {
    for (const edge of BEHEER_FLOW.edges) {
      expect(NODE_IDS.has(edge.from), `edge.from ${edge.from} moet bestaan`).toBe(true)
      expect(NODE_IDS.has(edge.to), `edge.to ${edge.to} moet bestaan`).toBe(true)
    }
  })

  it('elke subOf verwijst naar een bestaande node-id (en niet naar zichzelf)', () => {
    for (const node of BEHEER_FLOW.nodes) {
      if (!node.subOf) continue
      expect(NODE_IDS.has(node.subOf), `subOf ${node.subOf} (knoop ${node.id}) moet bestaan`).toBe(true)
      expect(node.subOf).not.toBe(node.id)
    }
  })

  it('crossZone is alleen gezet op kind=cross en verwijst naar een geldige UatZone', () => {
    for (const node of BEHEER_FLOW.nodes) {
      if (node.crossZone === undefined) continue
      expect(node.kind, `knoop ${node.id} met crossZone moet kind=cross zijn`).toBe('cross')
      expect(VALID_ZONES.has(node.crossZone), `crossZone ${node.crossZone} moet geldig zijn`).toBe(true)
    }
  })

  it('heeft bewust GEEN cross-knopen (BEHEER = overlay, geen domein-doorwerking)', () => {
    const crossNodes = BEHEER_FLOW.nodes.filter((n) => n.kind === 'cross')
    expect(crossNodes.length).toBe(0)
  })

  it("dekt alle 33 BEHEER-scenario's (01..33, contiguous — geen verwijsregels)", () => {
    const covered = new Set(
      BEHEER_FLOW.nodes.map((n) => n.scenarioId).filter((id): id is string => Boolean(id)),
    )
    const expected = Array.from({ length: 33 }, (_, i) => `UAT-BEHEER-${String(i + 1).padStart(2, '0')}`)
    for (const id of expected) {
      expect(covered.has(id), `${id} moet als flow-knoop voorkomen`).toBe(true)
    }
    expect(covered.size).toBe(33)
  })
})

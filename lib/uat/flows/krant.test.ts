import { describe, expect, it } from 'vitest'
import { KRANT_FLOW } from './krant'
import { UAT_SCENARIOS, UAT_ZONES, type UatZone } from '../catalog'

const SCENARIO_BY_ID = new Map(UAT_SCENARIOS.map((s) => [s.id, s]))
const VALID_ZONES = new Set<UatZone>(UAT_ZONES.map((z) => z.zone))
const NODE_IDS = new Set(KRANT_FLOW.nodes.map((n) => n.id))

describe('KRANT_FLOW — curatie-integriteit', () => {
  it('is de KRANT-zone', () => {
    expect(KRANT_FLOW.zone).toBe('KRANT')
  })

  it('heeft unieke knoop-ids', () => {
    expect(NODE_IDS.size).toBe(KRANT_FLOW.nodes.length)
  })

  it('elke scenarioId (indien aanwezig) bestaat en heeft zone KRANT', () => {
    for (const node of KRANT_FLOW.nodes) {
      if (!node.scenarioId) continue
      const scenario = SCENARIO_BY_ID.get(node.scenarioId)
      expect(scenario, `scenario ${node.scenarioId} (knoop ${node.id}) moet bestaan`).toBeDefined()
      expect(scenario!.zone, `scenario ${node.scenarioId} moet zone KRANT hebben`).toBe('KRANT')
    }
  })

  it('elke edge.from/edge.to verwijst naar een bestaande node-id', () => {
    for (const edge of KRANT_FLOW.edges) {
      expect(NODE_IDS.has(edge.from), `edge.from ${edge.from} moet bestaan`).toBe(true)
      expect(NODE_IDS.has(edge.to), `edge.to ${edge.to} moet bestaan`).toBe(true)
    }
  })

  it('crossZone is alleen gezet op kind=cross en verwijst naar een geldige andere UatZone', () => {
    for (const node of KRANT_FLOW.nodes) {
      if (node.crossZone === undefined) continue
      expect(node.kind, `knoop ${node.id} met crossZone moet kind=cross zijn`).toBe('cross')
      expect(VALID_ZONES.has(node.crossZone), `crossZone ${node.crossZone} moet geldig zijn`).toBe(true)
      expect(node.crossZone).not.toBe('KRANT')
    }
  })

  it("dekt alle 12 KRANT-scenario's (01..12), elk precies één keer", () => {
    const covered = KRANT_FLOW.nodes.map((n) => n.scenarioId).filter((id): id is string => Boolean(id))
    const expected = UAT_SCENARIOS.filter((s) => s.zone === 'KRANT').map((s) => s.id).sort()
    expect([...covered].sort()).toEqual(expected)
    expect(expected.length).toBe(12)
  })
})

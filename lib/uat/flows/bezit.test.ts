import { describe, expect, it } from 'vitest'
import { BEZIT_FLOW } from './bezit'
import { UAT_SCENARIOS, UAT_ZONES, type UatZone } from '../catalog'

const SCENARIO_BY_ID = new Map(UAT_SCENARIOS.map((s) => [s.id, s]))
const VALID_ZONES = new Set<UatZone>(UAT_ZONES.map((z) => z.zone))
const NODE_IDS = new Set(BEZIT_FLOW.nodes.map((n) => n.id))

describe('BEZIT_FLOW — curatie-integriteit', () => {
  it('is de BEZIT-zone', () => {
    expect(BEZIT_FLOW.zone).toBe('BEZIT')
  })

  it('heeft unieke knoop-ids', () => {
    expect(NODE_IDS.size).toBe(BEZIT_FLOW.nodes.length)
  })

  it('elke scenarioId (indien aanwezig) bestaat en heeft zone BEZIT', () => {
    for (const node of BEZIT_FLOW.nodes) {
      if (!node.scenarioId) continue
      const scenario = SCENARIO_BY_ID.get(node.scenarioId)
      expect(scenario, `scenario ${node.scenarioId} (knoop ${node.id}) moet bestaan`).toBeDefined()
      expect(scenario!.zone, `scenario ${node.scenarioId} moet zone BEZIT hebben`).toBe('BEZIT')
    }
  })

  it('elke edge.from/edge.to verwijst naar een bestaande node-id', () => {
    for (const edge of BEZIT_FLOW.edges) {
      expect(NODE_IDS.has(edge.from), `edge.from ${edge.from} moet bestaan`).toBe(true)
      expect(NODE_IDS.has(edge.to), `edge.to ${edge.to} moet bestaan`).toBe(true)
    }
  })

  it('elke subOf verwijst naar een bestaande node-id (en niet naar zichzelf)', () => {
    for (const node of BEZIT_FLOW.nodes) {
      if (!node.subOf) continue
      expect(NODE_IDS.has(node.subOf), `subOf ${node.subOf} (knoop ${node.id}) moet bestaan`).toBe(true)
      expect(node.subOf).not.toBe(node.id)
    }
  })

  it('crossZone is alleen gezet op kind=cross en verwijst naar een geldige UatZone', () => {
    for (const node of BEZIT_FLOW.nodes) {
      if (node.crossZone === undefined) continue
      expect(node.kind, `knoop ${node.id} met crossZone moet kind=cross zijn`).toBe('cross')
      expect(VALID_ZONES.has(node.crossZone), `crossZone ${node.crossZone} moet geldig zijn`).toBe(true)
    }
  })

  it('dekt de verwachte statusdragende WF-BEZIT-scenario\'s', () => {
    const covered = new Set(
      BEZIT_FLOW.nodes.map((n) => n.scenarioId).filter((id): id is string => Boolean(id)),
    )
    // WF-BEZIT-19 en -20 hebben bewust geen eigen scenario (cross naar MIJN).
    const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25].map(
      (n) => `UAT-BEZIT-${String(n).padStart(2, '0')}`,
    )
    for (const id of expected) {
      expect(covered.has(id), `${id} moet als flow-knoop voorkomen`).toBe(true)
    }
  })

  it('WF-BEZIT-19/20 zijn cross-knopen naar MIJN zonder scenarioId', () => {
    for (const id of ['broker', 'koppeling']) {
      const node = BEZIT_FLOW.nodes.find((n) => n.id === id)
      expect(node).toBeDefined()
      expect(node!.kind).toBe('cross')
      expect(node!.crossZone).toBe('MIJN')
      expect(node!.scenarioId).toBeUndefined()
    }
  })
})

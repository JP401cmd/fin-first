import { describe, expect, it } from 'vitest'
import { MIJN_FLOW } from './mijn'
import { UAT_SCENARIOS, UAT_ZONES, type UatZone } from '../catalog'

const SCENARIO_BY_ID = new Map(UAT_SCENARIOS.map((s) => [s.id, s]))
const VALID_ZONES = new Set<UatZone>(UAT_ZONES.map((z) => z.zone))
const NODE_IDS = new Set(MIJN_FLOW.nodes.map((n) => n.id))

describe('MIJN_FLOW — curatie-integriteit', () => {
  it('is de MIJN-zone', () => {
    expect(MIJN_FLOW.zone).toBe('MIJN')
  })

  it('heeft unieke knoop-ids', () => {
    expect(NODE_IDS.size).toBe(MIJN_FLOW.nodes.length)
  })

  it('elke scenarioId (indien aanwezig) bestaat en heeft zone MIJN', () => {
    for (const node of MIJN_FLOW.nodes) {
      if (!node.scenarioId) continue
      const scenario = SCENARIO_BY_ID.get(node.scenarioId)
      expect(scenario, `scenario ${node.scenarioId} (knoop ${node.id}) moet bestaan`).toBeDefined()
      expect(scenario!.zone, `scenario ${node.scenarioId} moet zone MIJN hebben`).toBe('MIJN')
    }
  })

  it('elke edge.from/edge.to verwijst naar een bestaande node-id', () => {
    for (const edge of MIJN_FLOW.edges) {
      expect(NODE_IDS.has(edge.from), `edge.from ${edge.from} moet bestaan`).toBe(true)
      expect(NODE_IDS.has(edge.to), `edge.to ${edge.to} moet bestaan`).toBe(true)
    }
  })

  it('elke subOf verwijst naar een bestaande node-id (en niet naar zichzelf)', () => {
    for (const node of MIJN_FLOW.nodes) {
      if (!node.subOf) continue
      expect(NODE_IDS.has(node.subOf), `subOf ${node.subOf} (knoop ${node.id}) moet bestaan`).toBe(true)
      expect(node.subOf).not.toBe(node.id)
    }
  })

  it('crossZone is alleen gezet op kind=cross en verwijst naar een geldige UatZone', () => {
    for (const node of MIJN_FLOW.nodes) {
      if (node.crossZone === undefined) continue
      expect(node.kind, `knoop ${node.id} met crossZone moet kind=cross zijn`).toBe('cross')
      expect(VALID_ZONES.has(node.crossZone), `crossZone ${node.crossZone} moet geldig zijn`).toBe(true)
    }
  })

  it("dekt alle 27 statusdragende MIJN-scenario's (01..09, 11..16, 18..22, 24..30)", () => {
    const covered = new Set(
      MIJN_FLOW.nodes.map((n) => n.scenarioId).filter((id): id is string => Boolean(id)),
    )
    // Verwijsregels UAT-MIJN-10/17/23 (→ UAT-NAV-19/11/10) hebben bewust geen knoop.
    const expected = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29, 30].map(
      (n) => `UAT-MIJN-${String(n).padStart(2, '0')}`,
    )
    for (const id of expected) {
      expect(covered.has(id), `${id} moet als flow-knoop voorkomen`).toBe(true)
    }
    expect(covered.size).toBe(27)
  })

  it('bevat NIET de verwijsregel-scenario-knopen 10/17/23', () => {
    const covered = new Set(MIJN_FLOW.nodes.map((n) => n.scenarioId))
    for (const n of [10, 17, 23]) {
      expect(covered.has(`UAT-MIJN-${String(n).padStart(2, '0')}`)).toBe(false)
    }
  })

  it('de cross-knopen dekken de huishoud-doorwerking (BUDGET/BEZIT/SCHULD/OVZ)', () => {
    const crossZones = new Set(
      MIJN_FLOW.nodes
        .filter((n) => n.kind === 'cross')
        .map((n) => n.crossZone)
        .filter((z): z is UatZone => Boolean(z)),
    )
    for (const z of ['BUDGET', 'BEZIT', 'SCHULD', 'OVZ'] as const) {
      expect(crossZones.has(z), `cross naar ${z} moet aanwezig zijn`).toBe(true)
    }
  })
})

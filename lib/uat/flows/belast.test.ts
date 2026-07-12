import { describe, expect, it } from 'vitest'
import { BELAST_FLOW } from './belast'
import { UAT_SCENARIOS, UAT_ZONES, type UatZone } from '../catalog'

const SCENARIO_BY_ID = new Map(UAT_SCENARIOS.map((s) => [s.id, s]))
const VALID_ZONES = new Set<UatZone>(UAT_ZONES.map((z) => z.zone))
const NODE_IDS = new Set(BELAST_FLOW.nodes.map((n) => n.id))

describe('BELAST_FLOW — curatie-integriteit', () => {
  it('is de BELAST-zone', () => {
    expect(BELAST_FLOW.zone).toBe('BELAST')
  })

  it('heeft unieke knoop-ids', () => {
    expect(NODE_IDS.size).toBe(BELAST_FLOW.nodes.length)
  })

  it('elke scenarioId (indien aanwezig) bestaat en heeft zone BELAST', () => {
    for (const node of BELAST_FLOW.nodes) {
      if (!node.scenarioId) continue
      const scenario = SCENARIO_BY_ID.get(node.scenarioId)
      expect(scenario, `scenario ${node.scenarioId} (knoop ${node.id}) moet bestaan`).toBeDefined()
      expect(scenario!.zone, `scenario ${node.scenarioId} moet zone BELAST hebben`).toBe('BELAST')
    }
  })

  it('elke edge.from/edge.to verwijst naar een bestaande node-id', () => {
    for (const edge of BELAST_FLOW.edges) {
      expect(NODE_IDS.has(edge.from), `edge.from ${edge.from} moet bestaan`).toBe(true)
      expect(NODE_IDS.has(edge.to), `edge.to ${edge.to} moet bestaan`).toBe(true)
    }
  })

  it('elke subOf verwijst naar een bestaande node-id (en niet naar zichzelf)', () => {
    for (const node of BELAST_FLOW.nodes) {
      if (!node.subOf) continue
      expect(NODE_IDS.has(node.subOf), `subOf ${node.subOf} (knoop ${node.id}) moet bestaan`).toBe(true)
      expect(node.subOf).not.toBe(node.id)
    }
  })

  it('crossZone is alleen gezet op kind=cross en verwijst naar een geldige UatZone', () => {
    for (const node of BELAST_FLOW.nodes) {
      if (node.crossZone === undefined) continue
      expect(node.kind, `knoop ${node.id} met crossZone moet kind=cross zijn`).toBe('cross')
      expect(VALID_ZONES.has(node.crossZone), `crossZone ${node.crossZone} moet geldig zijn`).toBe(true)
    }
  })

  it("dekt de verwachte statusdragende WF-BELAST-scenario's (01..19, 21)", () => {
    const covered = new Set(
      BELAST_FLOW.nodes.map((n) => n.scenarioId).filter((id): id is string => Boolean(id)),
    )
    // WF-BELAST-20 (perspectief → UAT-NAV-19) en WF-BELAST-22 (pagina-uitleg (i)/
    // statuspunt → UAT-OVZ-12) zijn verwijsregels en hebben bewust geen eigen
    // BELAST-scenario/knoop.
    const expected = [
      ...Array.from({ length: 19 }, (_, i) => i + 1), // 1..19
      21,
    ].map((n) => `UAT-BELAST-${String(n).padStart(2, '0')}`)
    for (const id of expected) {
      expect(covered.has(id), `${id} moet als flow-knoop voorkomen`).toBe(true)
    }
  })

  it("WF-BELAST-20/22 zijn verwijsregels zonder eigen BELAST-knoop", () => {
    const covered = new Set(
      BELAST_FLOW.nodes.map((n) => n.scenarioId).filter((id): id is string => Boolean(id)),
    )
    // Deze scenario's bestaan bewust niet in de catalogus (afbakening §1.4);
    // ze mogen dus ook niet als flow-knoop opduiken.
    expect(covered.has('UAT-BELAST-20')).toBe(false)
    expect(covered.has('UAT-BELAST-22')).toBe(false)
  })

  it('de domeinoverschrijdende cross-knopen dekken Schuld/Bezit/TOEK/OVZ/MIJN', () => {
    const crossZones = new Set(
      BELAST_FLOW.nodes
        .filter((n) => n.kind === 'cross')
        .map((n) => n.crossZone)
        .filter((z): z is UatZone => Boolean(z)),
    )
    for (const z of ['SCHULD', 'BEZIT', 'TOEK', 'OVZ', 'MIJN'] as const) {
      expect(crossZones.has(z), `cross naar ${z} moet aanwezig zijn`).toBe(true)
    }
  })
})

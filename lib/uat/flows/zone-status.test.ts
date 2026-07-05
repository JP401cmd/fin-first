import { describe, expect, it } from 'vitest'
import { explainZoneStatus } from './zone-status'
import { BEZIT_FLOW } from './bezit'
import type { UatResultRow } from '../status'

function row(scenario_id: string, sub: string, platform: string, status: string): UatResultRow {
  return { scenario_id, sub, platform, status }
}

// Aantal statusdragende (scenarioId) knopen in de BEZIT-flow.
const STATUS_NODE_COUNT = BEZIT_FLOW.nodes.filter((n) => n.scenarioId).length

describe('explainZoneStatus(BEZIT_FLOW)', () => {
  it('lege ronde → grijs, geen veroorzakers, alle knopen grijs', () => {
    const e = explainZoneStatus(BEZIT_FLOW, [])
    expect(e.zoneStatus).toBe('grijs')
    expect(e.causeCount).toBe(0)
    expect(e.causeNodeIds.size).toBe(0)
    expect(e.statusByNodeId.size).toBe(STATUS_NODE_COUNT)
    for (const status of e.statusByNodeId.values()) expect(status).toBe('grijs')
  })

  it('sluit cross-knopen zonder scenarioId (broker/koppeling) uit de statusmap', () => {
    const e = explainZoneStatus(BEZIT_FLOW, [])
    expect(e.statusByNodeId.has('broker')).toBe(false)
    expect(e.statusByNodeId.has('koppeling')).toBe(false)
    // structurele knopen ook niet
    expect(e.statusByNodeId.has('netto')).toBe(false)
    expect(e.statusByNodeId.has('huisbeslis')).toBe(false)
  })

  it('één gefaald resultaat → rood, alleen die knoop is veroorzaker', () => {
    const e = explainZoneStatus(BEZIT_FLOW, [row('UAT-BEZIT-10', 'a', 'webapp', 'gefaald')])
    expect(e.zoneStatus).toBe('rood')
    expect([...e.causeNodeIds]).toEqual(['verwijderen'])
    expect(e.causeCount).toBe(1)
    // een niet-geraakte knoop staat op grijs en is geen veroorzaker
    expect(e.statusByNodeId.get('add')).toBe('grijs')
    expect(e.causeNodeIds.has('add')).toBe(false)
  })

  it('één geblokkeerd resultaat → oranje, die knoop is veroorzaker', () => {
    const e = explainZoneStatus(BEZIT_FLOW, [row('UAT-BEZIT-11', 'a', 'webapp', 'geblokkeerd')])
    expect(e.zoneStatus).toBe('oranje')
    expect(e.causeNodeIds.has('categorie')).toBe(true)
    expect(e.causeCount).toBe(1)
  })

  it('rood wint van oranje: alleen de rode knoop is veroorzaker', () => {
    const e = explainZoneStatus(BEZIT_FLOW, [
      row('UAT-BEZIT-10', 'a', 'webapp', 'gefaald'),
      row('UAT-BEZIT-11', 'a', 'webapp', 'geblokkeerd'),
    ])
    expect(e.zoneStatus).toBe('rood')
    expect(e.causeNodeIds.has('verwijderen')).toBe(true)
    expect(e.causeNodeIds.has('categorie')).toBe(false) // oranje ≠ rood
  })

  it('alleen groene resultaten → groen, de groene knoop is veroorzaker', () => {
    const e = explainZoneStatus(BEZIT_FLOW, [row('UAT-BEZIT-05', 'a', 'webapp', 'geslaagd')])
    expect(e.zoneStatus).toBe('groen')
    expect(e.incompleet).toBe(true) // niet alles uitgevoerd
    expect(e.causeNodeIds.has('add')).toBe(true)
  })

  it('een scenario dat op twee flow-knopen zit (UAT-BEZIT-22) markeert beide', () => {
    const e = explainZoneStatus(BEZIT_FLOW, [row('UAT-BEZIT-22', 'a', 'webapp', 'gefaald')])
    expect(e.zoneStatus).toBe('rood')
    expect(e.causeNodeIds.has('typed-inv')).toBe(true)
    expect(e.causeNodeIds.has('typed-crypto')).toBe(true)
  })
})

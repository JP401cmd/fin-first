/**
 * Bewaakt de UAT-scenariocatalogus (lib/uat/catalog.ts) — de single source of
 * truth voor WELKE UAT-scenario's bestaan (docs/uat/uat-plan.md Deel 2/3 §3.4).
 * Resultaten leven in Supabase; deze catalogus is versiebeheerd in de repo.
 */
import { describe, it, expect } from 'vitest'
import {
  UAT_SCENARIOS,
  UAT_ZONES,
  UAT_BANDEN,
  UAT_ROOKTEST_IDS,
  totalSubscenarioCount,
} from './catalog'

describe('UAT_SCENARIOS — unieke ID’s', () => {
  it('heeft geen dubbele scenario-ID’s', () => {
    const ids = UAT_SCENARIOS.map((s) => s.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })
})

describe('UAT_SCENARIOS — geldige zone en band', () => {
  const zoneIds = new Set(UAT_ZONES.map((z) => z.zone))
  const bandIds = new Set(UAT_BANDEN.map((b) => b.id))

  it('elke scenario-zone bestaat in UAT_ZONES', () => {
    for (const scenario of UAT_SCENARIOS) {
      expect(zoneIds.has(scenario.zone), `${scenario.id}: onbekende zone '${scenario.zone}'`).toBe(true)
    }
  })

  it('elke scenario-band bestaat in UAT_BANDEN', () => {
    for (const scenario of UAT_SCENARIOS) {
      expect(bandIds.has(scenario.band), `${scenario.id}: onbekende band '${scenario.band}'`).toBe(true)
    }
  })

  it('de band van elk scenario komt overeen met de band van zijn zone in UAT_ZONES', () => {
    const zoneToBand = new Map(UAT_ZONES.map((z) => [z.zone, z.band]))
    for (const scenario of UAT_SCENARIOS) {
      expect(zoneToBand.get(scenario.zone), `${scenario.id}: band-mismatch voor zone '${scenario.zone}'`).toBe(
        scenario.band,
      )
    }
  })
})

describe('UAT_SCENARIOS — kruisZones verwijst naar bestaande zones', () => {
  const zoneIds = new Set(UAT_ZONES.map((z) => z.zone))

  it('elke kruisZones-vermelding (indien aanwezig) verwijst naar een bestaande zone', () => {
    for (const scenario of UAT_SCENARIOS) {
      if (!scenario.kruisZones) continue
      for (const zone of scenario.kruisZones) {
        expect(zoneIds.has(zone), `${scenario.id}: onbekende kruisZone '${zone}'`).toBe(true)
      }
    }
  })
})

describe('Rooktest — precies 14 scenario’s, UAT_ROOKTEST_IDS consistent', () => {
  it('heeft exact 14 scenario’s met rooktest=true', () => {
    const rooktestScenarios = UAT_SCENARIOS.filter((s) => s.rooktest)
    expect(rooktestScenarios.length).toBe(14)
  })

  it('UAT_ROOKTEST_IDS bevat precies de scenario-ID’s met rooktest=true', () => {
    const expectedIds = UAT_SCENARIOS.filter((s) => s.rooktest).map((s) => s.id).sort()
    expect([...UAT_ROOKTEST_IDS].sort()).toEqual(expectedIds)
  })
})

describe('totalSubscenarioCount en niet-lege subscenarios/platforms', () => {
  it('totalSubscenarioCount() is groter dan 0', () => {
    expect(totalSubscenarioCount()).toBeGreaterThan(0)
  })

  it('elk scenario heeft minstens één subscenario', () => {
    for (const scenario of UAT_SCENARIOS) {
      expect(scenario.subscenarios.length, `${scenario.id}: subscenarios is leeg`).toBeGreaterThan(0)
    }
  })

  it('elk scenario heeft minstens één platform', () => {
    for (const scenario of UAT_SCENARIOS) {
      expect(scenario.platforms.length, `${scenario.id}: platforms is leeg`).toBeGreaterThan(0)
    }
  })
})

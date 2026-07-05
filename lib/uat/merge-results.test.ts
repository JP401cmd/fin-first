import { describe, expect, it } from 'vitest'
import type { UatScenario } from './catalog'
import { mergeResult } from './merge-results'
import { computeCoverage, deriveZoneStatus, buildResultLookup, type UatResultRow } from './status'

function scenario(id: string): UatScenario {
  return {
    id,
    wf: null,
    zone: 'BELAST',
    band: 'vooruitkijken',
    naam: `test ${id}`,
    kriticiteit: 'KERN',
    rooktest: false,
    platforms: ['webapp'],
    subscenarios: ['a', 'b'],
    volgorde: 1,
    duurMin: 5,
  }
}

function row(id: string, sub: string, status: string): UatResultRow {
  return { scenario_id: id, sub, platform: 'webapp', status, tested_at: '2026-07-05T10:00:00Z' }
}

describe('mergeResult', () => {
  it('voegt een nieuwe registratie toe wanneer de sleutel nog niet bestaat', () => {
    const next = mergeResult([], row('UAT-BELAST-01', 'a', 'geslaagd'))
    expect(next).toHaveLength(1)
    expect(next[0].status).toBe('geslaagd')
  })

  it('vervangt de bestaande registratie op dezelfde sleutel (laatste wint)', () => {
    const prev = [row('UAT-BELAST-01', 'a', 'gefaald')]
    const next = mergeResult(prev, row('UAT-BELAST-01', 'a', 'geslaagd'))
    expect(next).toHaveLength(1)
    expect(next[0].status).toBe('geslaagd')
  })

  it('muteert de vorige lijst niet (immutabel)', () => {
    const prev = [row('UAT-BELAST-01', 'a', 'gefaald')]
    mergeResult(prev, row('UAT-BELAST-01', 'a', 'geslaagd'))
    expect(prev[0].status).toBe('gefaald')
  })

  it('laat de plaat direct verkleuren: na merge zien coverage én zone-status de nieuwe status', () => {
    const scenarios = [scenario('UAT-BELAST-01')]
    // Start: één registratie gefaald → zone ROOD, succesrate 0%.
    let results: UatResultRow[] = [row('UAT-BELAST-01', 'a', 'gefaald')]
    let zone = deriveZoneStatus(scenarios, buildResultLookup(results))
    let cov = computeCoverage(scenarios, results)
    expect(zone.status).toBe('rood')
    expect(cov.geslaagd).toBe(0)

    // Invoer: registratie omzetten naar geslaagd + tweede sub geslaagd.
    results = mergeResult(results, row('UAT-BELAST-01', 'a', 'geslaagd'))
    results = mergeResult(results, row('UAT-BELAST-01', 'b', 'geslaagd'))

    zone = deriveZoneStatus(scenarios, buildResultLookup(results))
    cov = computeCoverage(scenarios, results)
    expect(zone.status).toBe('groen')
    expect(cov.executed).toBe(2)
    expect(cov.geslaagd).toBe(2)
    expect(cov.successRate).toBe(1)
  })
})

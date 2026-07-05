import { describe, expect, it } from 'vitest'
import { UAT_SCENARIOS } from './catalog'
import { computeGoNoGo } from './go-no-go'
import { resultKey, type UatResultRow } from './status'

/** Bouwt een 'geslaagd'-registratie voor élke sub×platform-instantie van de catalogus. */
function buildAllGreenResults(): UatResultRow[] {
  const rows: UatResultRow[] = []
  for (const s of UAT_SCENARIOS) {
    for (const sub of s.subscenarios) {
      for (const platform of s.platforms) {
        rows.push({ scenario_id: s.id, sub, platform, status: 'geslaagd' })
      }
    }
  }
  return rows
}

function setStatus(
  rows: UatResultRow[],
  scenarioId: string,
  sub: string,
  platform: string,
  status: UatResultRow['status'],
  severity?: string,
): UatResultRow[] {
  const key = resultKey(scenarioId, sub, platform)
  return rows.map((r) =>
    resultKey(r.scenario_id, r.sub, r.platform) === key ? { ...r, status, severity: severity ?? null } : r,
  )
}

describe('computeGoNoGo', () => {
  it('is NO-GO wanneer er nog niets is uitgevoerd (dekking 0, KERN niet uitgevoerd)', () => {
    const result = computeGoNoGo(UAT_SCENARIOS, [])
    expect(result.go).toBe(false)
    const kern = result.criteria.find((c) => c.id === 'kern')
    const dekking = result.criteria.find((c) => c.id === 'dekking')
    const rooktest = result.criteria.find((c) => c.id === 'rooktest')
    expect(kern?.gehaald).toBe(false)
    expect(dekking?.gehaald).toBe(false)
    expect(rooktest?.gehaald).toBe(false)
  })

  it('is GO wanneer alles is geregistreerd en geslaagd', () => {
    const rows = buildAllGreenResults()
    const result = computeGoNoGo(UAT_SCENARIOS, rows)
    expect(result.go).toBe(true)
    expect(result.criteria.every((c) => c.gehaald)).toBe(true)
  })

  it('is NO-GO op criterium b (en c bij S0/S1) wanneer één KERN-instantie faalt', () => {
    const rows = buildAllGreenResults()
    const kernScenario = UAT_SCENARIOS.find((s) => s.kriticiteit === 'KERN')
    expect(kernScenario).toBeDefined()
    const sub = kernScenario!.subscenarios[0]
    const platform = kernScenario!.platforms[0]
    const flipped = setStatus(rows, kernScenario!.id, sub, platform, 'gefaald', 'S1')

    const result = computeGoNoGo(UAT_SCENARIOS, flipped)
    expect(result.go).toBe(false)
    const kern = result.criteria.find((c) => c.id === 'kern')
    const s0s1 = result.criteria.find((c) => c.id === 's0s1')
    expect(kern?.gehaald).toBe(false)
    expect(s0s1?.gehaald).toBe(false)
  })

  it('is NO-GO op criterium b (KERN niet 100% geslaagd) bij een S2-fail, ook al blijven rooktest en dekking ok', () => {
    const rows = buildAllGreenResults()
    // Kies een KERN-scenario dat GEEN rooktest is, zodat criterium a niet meelift.
    const kernScenario = UAT_SCENARIOS.find((s) => s.kriticiteit === 'KERN' && !s.rooktest)
    expect(kernScenario).toBeDefined()
    const sub = kernScenario!.subscenarios[0]
    const platform = kernScenario!.platforms[0]
    const flipped = setStatus(rows, kernScenario!.id, sub, platform, 'gefaald', 'S2')

    const result = computeGoNoGo(UAT_SCENARIOS, flipped)
    expect(result.go).toBe(false)
    const kern = result.criteria.find((c) => c.id === 'kern')
    const s0s1 = result.criteria.find((c) => c.id === 's0s1')
    const rooktest = result.criteria.find((c) => c.id === 'rooktest')
    const dekking = result.criteria.find((c) => c.id === 'dekking')
    expect(kern?.gehaald).toBe(false)
    // S2 is geen S0/S1, dus dat criterium blijft ok; dekking blijft 100%.
    expect(s0s1?.gehaald).toBe(true)
    expect(dekking?.gehaald).toBe(true)
    expect(rooktest?.gehaald).toBe(true)
  })

  it('mobiel KERN-fail blokkeert GO niet (mobiel is apart, niet meegeteld in het webapp-criterium)', () => {
    const rows = buildAllGreenResults()
    const kernScenario = UAT_SCENARIOS.find(
      (s) => s.kriticiteit === 'KERN' && !s.rooktest && s.platforms.includes('mobiel'),
    )
    expect(kernScenario).toBeDefined()
    const sub = kernScenario!.subscenarios[0]
    const flipped = setStatus(rows, kernScenario!.id, sub, 'mobiel', 'gefaald', 'S2')

    const result = computeGoNoGo(UAT_SCENARIOS, flipped)
    const kern = result.criteria.find((c) => c.id === 'kern')
    expect(kern?.gehaald).toBe(true)
    expect(result.go).toBe(true)
  })

  it('webapp KERN-fail blokkeert GO wél, ook als mobiel voor datzelfde scenario groen blijft', () => {
    const rows = buildAllGreenResults()
    const kernScenario = UAT_SCENARIOS.find(
      (s) => s.kriticiteit === 'KERN' && !s.rooktest && s.platforms.includes('mobiel'),
    )
    expect(kernScenario).toBeDefined()
    const sub = kernScenario!.subscenarios[0]
    const flipped = setStatus(rows, kernScenario!.id, sub, 'webapp', 'gefaald', 'S2')

    const result = computeGoNoGo(UAT_SCENARIOS, flipped)
    const kern = result.criteria.find((c) => c.id === 'kern')
    expect(kern?.gehaald).toBe(false)
    expect(result.go).toBe(false)
  })

  it('is NO-GO op criterium a wanneer een rooktest-scenario geblokkeerd is', () => {
    const rows = buildAllGreenResults()
    const rooktestScenario = UAT_SCENARIOS.find((s) => s.rooktest)
    expect(rooktestScenario).toBeDefined()
    const sub = rooktestScenario!.subscenarios[0]
    const platform = rooktestScenario!.platforms[0]
    const flipped = setStatus(rows, rooktestScenario!.id, sub, platform, 'geblokkeerd')

    const result = computeGoNoGo(UAT_SCENARIOS, flipped)
    expect(result.go).toBe(false)
    const rooktest = result.criteria.find((c) => c.id === 'rooktest')
    expect(rooktest?.gehaald).toBe(false)
  })

  it('is NO-GO op dekking wanneer < 95% is uitgevoerd, ook als het uitgevoerde deel groen is', () => {
    const rows = buildAllGreenResults()
    // Verwijder ruim 5% van de registraties zodat dekking onder de 95%-grens zakt.
    const dropCount = Math.ceil(rows.length * 0.1)
    const partial = rows.slice(dropCount)

    const result = computeGoNoGo(UAT_SCENARIOS, partial)
    const dekking = result.criteria.find((c) => c.id === 'dekking')
    expect(dekking?.gehaald).toBe(false)
    expect(result.go).toBe(false)
  })
})

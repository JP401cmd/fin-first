import { describe, expect, it } from 'vitest'
import type { UatScenario } from './catalog'
import { buildResultLookup, type UatResultRow } from './status'
import {
  computeVisibleScenarioIds,
  hasActiveFilter,
  matchesFilters,
  UAT_FILTERS_NONE,
  type UatFilterState,
} from './filters'

function scenario(overrides: Partial<UatScenario> & Pick<UatScenario, 'id'>): UatScenario {
  return {
    wf: null,
    zone: 'BELAST',
    band: 'vooruitkijken',
    naam: `test ${overrides.id}`,
    kriticiteit: 'KERN',
    rooktest: false,
    platforms: ['webapp'],
    subscenarios: ['a'],
    volgorde: 1,
    duurMin: 5,
    ...overrides,
  }
}

function row(scenarioId: string, sub: string, platform: string, status: string): UatResultRow {
  return { scenario_id: scenarioId, sub, platform, status }
}

describe('hasActiveFilter', () => {
  it('is false voor UAT_FILTERS_NONE ("Alles")', () => {
    expect(hasActiveFilter(UAT_FILTERS_NONE)).toBe(false)
  })

  it('is true zodra één chip afwijkt', () => {
    expect(hasActiveFilter({ ...UAT_FILTERS_NONE, rooktestOnly: true })).toBe(true)
    expect(hasActiveFilter({ ...UAT_FILTERS_NONE, statusFilter: 'rood_oranje' })).toBe(true)
    expect(hasActiveFilter({ ...UAT_FILTERS_NONE, grijsOnly: true })).toBe(true)
    expect(hasActiveFilter({ ...UAT_FILTERS_NONE, platform: 'mobiel' })).toBe(true)
  })
})

describe('matchesFilters', () => {
  const rooktestMobiel = scenario({ id: 'UAT-X-01', rooktest: true, platforms: ['webapp', 'mobiel'] })
  const gewoonWebapp = scenario({ id: 'UAT-X-02', rooktest: false, platforms: ['webapp'] })

  it('"Alles" laat alles door, ongeacht status', () => {
    expect(matchesFilters(rooktestMobiel, 'rood', UAT_FILTERS_NONE)).toBe(true)
    expect(matchesFilters(gewoonWebapp, 'grijs', UAT_FILTERS_NONE)).toBe(true)
  })

  it('rood_oranje laat alleen rood/oranje door', () => {
    const f: UatFilterState = { ...UAT_FILTERS_NONE, statusFilter: 'rood_oranje' }
    expect(matchesFilters(gewoonWebapp, 'rood', f)).toBe(true)
    expect(matchesFilters(gewoonWebapp, 'oranje', f)).toBe(true)
    expect(matchesFilters(gewoonWebapp, 'groen', f)).toBe(false)
    expect(matchesFilters(gewoonWebapp, 'grijs', f)).toBe(false)
  })

  it('rooktestOnly laat alleen scenario.rooktest=true door', () => {
    const f: UatFilterState = { ...UAT_FILTERS_NONE, rooktestOnly: true }
    expect(matchesFilters(rooktestMobiel, 'groen', f)).toBe(true)
    expect(matchesFilters(gewoonWebapp, 'groen', f)).toBe(false)
  })

  it('grijsOnly laat alleen status grijs door', () => {
    const f: UatFilterState = { ...UAT_FILTERS_NONE, grijsOnly: true }
    expect(matchesFilters(gewoonWebapp, 'grijs', f)).toBe(true)
    expect(matchesFilters(gewoonWebapp, 'groen', f)).toBe(false)
  })

  it('platform laat alleen scenario\'s met dat platformdoel door', () => {
    const f: UatFilterState = { ...UAT_FILTERS_NONE, platform: 'mobiel' }
    expect(matchesFilters(rooktestMobiel, 'groen', f)).toBe(true)
    expect(matchesFilters(gewoonWebapp, 'groen', f)).toBe(false)
  })

  it('combineert met AND-semantiek (rooktest + mobiel)', () => {
    const f: UatFilterState = { ...UAT_FILTERS_NONE, rooktestOnly: true, platform: 'mobiel' }
    expect(matchesFilters(rooktestMobiel, 'groen', f)).toBe(true) // rooktest + heeft mobiel
    const rooktestWebappOnly = scenario({ id: 'UAT-X-03', rooktest: true, platforms: ['webapp'] })
    expect(matchesFilters(rooktestWebappOnly, 'groen', f)).toBe(false) // rooktest maar geen mobiel-doel
  })
})

describe('computeVisibleScenarioIds', () => {
  const s1 = scenario({ id: 'UAT-X-01', rooktest: true })
  const s2 = scenario({ id: 'UAT-X-02', rooktest: false })
  const scenarios = [s1, s2]
  const lookup = buildResultLookup([row('UAT-X-01', 'a', 'webapp', 'gefaald'), row('UAT-X-02', 'a', 'webapp', 'geslaagd')])

  it('geeft null terug voor "Alles" (geen dimming)', () => {
    expect(computeVisibleScenarioIds(scenarios, lookup, UAT_FILTERS_NONE)).toBeNull()
  })

  it('geeft de matchende ID-set terug bij een actief filter — niet de hele set', () => {
    const visible = computeVisibleScenarioIds(scenarios, lookup, { ...UAT_FILTERS_NONE, statusFilter: 'rood_oranje' })
    expect(visible).not.toBeNull()
    expect(visible?.has('UAT-X-01')).toBe(true) // gefaald → rood
    expect(visible?.has('UAT-X-02')).toBe(false) // geslaagd → groen, valt weg
  })

  it('rooktest-filter isoleert het rooktest-scenario', () => {
    const visible = computeVisibleScenarioIds(scenarios, lookup, { ...UAT_FILTERS_NONE, rooktestOnly: true })
    expect(visible).toEqual(new Set(['UAT-X-01']))
  })
})

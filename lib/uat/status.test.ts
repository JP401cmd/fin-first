import { describe, expect, it } from 'vitest'
import type { UatScenario } from './catalog'
import {
  buildResultLookup,
  computeCoverage,
  deriveBandStatus,
  deriveScenarioStatus,
  deriveSubStatus,
  deriveZoneStatus,
  resultKey,
  UAT_STATUS_VISUAL,
  type UatResultRow,
} from './status'

// ── Test-fixtures ─────────────────────────────────────────────────────────────

function scenario(id: string, subs: UatScenario['subscenarios'], platforms: UatScenario['platforms']): UatScenario {
  return {
    id,
    wf: null,
    zone: 'BELAST',
    band: 'vooruitkijken',
    naam: `test ${id}`,
    kriticiteit: 'KERN',
    rooktest: false,
    platforms,
    subscenarios: subs,
    volgorde: 1,
    duurMin: 5,
  }
}

function row(scenarioId: string, sub: string, platform: string, status: string): UatResultRow {
  return { scenario_id: scenarioId, sub, platform, status }
}

// ── deriveSubStatus ───────────────────────────────────────────────────────────

describe('deriveSubStatus', () => {
  it('mapt de vier registratie-uitkomsten', () => {
    expect(deriveSubStatus('geslaagd')).toBe('groen')
    expect(deriveSubStatus('geblokkeerd')).toBe('oranje')
    expect(deriveSubStatus('gefaald')).toBe('rood')
    expect(deriveSubStatus(undefined)).toBe('grijs')
    expect(deriveSubStatus(null)).toBe('grijs')
    expect(deriveSubStatus('onzin')).toBe('grijs')
  })
})

// ── leeg = alles grijs ────────────────────────────────────────────────────────

describe('lege ronde', () => {
  const s = scenario('UAT-X-01', ['a', 'b'], ['webapp', 'mobiel'])
  const lookup = buildResultLookup([])

  it('scenario is grijs, niets uitgevoerd, niet incompleet', () => {
    const agg = deriveScenarioStatus(s, lookup)
    expect(agg.status).toBe('grijs')
    expect(agg.incompleet).toBe(false)
    expect(agg.total).toBe(4) // 2 subs × 2 platforms
    expect(agg.done).toBe(0)
  })

  it('zone en band zijn grijs', () => {
    expect(deriveZoneStatus([s], lookup).status).toBe('grijs')
    expect(deriveBandStatus([s], lookup).status).toBe('grijs')
  })
})

// ── één rood → scenario + zone + band rood ────────────────────────────────────

describe('één gefaald subscenario', () => {
  const s1 = scenario('UAT-X-01', ['a', 'b'], ['webapp'])
  const s2 = scenario('UAT-X-02', ['a'], ['webapp'])
  const lookup = buildResultLookup([
    row('UAT-X-01', 'a', 'webapp', 'geslaagd'),
    row('UAT-X-01', 'b', 'webapp', 'gefaald'),
    row('UAT-X-02', 'a', 'webapp', 'geslaagd'),
  ])

  it('maakt het scenario rood ondanks een geslaagde sub', () => {
    expect(deriveScenarioStatus(s1, lookup).status).toBe('rood')
  })

  it('maakt de zone en band rood (worst-of-children)', () => {
    expect(deriveZoneStatus([s1, s2], lookup).status).toBe('rood')
    expect(deriveBandStatus([s1, s2], lookup).status).toBe('rood')
  })
})

// ── alles geslaagd → groen ────────────────────────────────────────────────────

describe('alles geslaagd', () => {
  const s = scenario('UAT-X-01', ['a', 'b'], ['webapp', 'mobiel'])
  const lookup = buildResultLookup([
    row('UAT-X-01', 'a', 'webapp', 'geslaagd'),
    row('UAT-X-01', 'a', 'mobiel', 'geslaagd'),
    row('UAT-X-01', 'b', 'webapp', 'geslaagd'),
    row('UAT-X-01', 'b', 'mobiel', 'geslaagd'),
  ])

  it('is groen en volledig (niet incompleet)', () => {
    const agg = deriveScenarioStatus(s, lookup)
    expect(agg.status).toBe('groen')
    expect(agg.incompleet).toBe(false)
    expect(agg.done).toBe(4)
    expect(agg.total).toBe(4)
  })

  it('zone en band zijn groen', () => {
    expect(deriveZoneStatus([s], lookup).status).toBe('groen')
    expect(deriveBandStatus([s], lookup).status).toBe('groen')
  })
})

// ── gemengd geslaagd + grijs → groen + incompleet ────────────────────────────

describe('gemengd geslaagd + grijs', () => {
  const s = scenario('UAT-X-01', ['a', 'b'], ['webapp'])
  const lookup = buildResultLookup([row('UAT-X-01', 'a', 'webapp', 'geslaagd')])

  it('scenario is groen mét incompleet-vlag', () => {
    const agg = deriveScenarioStatus(s, lookup)
    expect(agg.status).toBe('groen')
    expect(agg.incompleet).toBe(true)
    expect(agg.done).toBe(1)
    expect(agg.total).toBe(2)
  })

  it('zone: wat grijs + rest groen = groen mét incompleet', () => {
    const groen = scenario('UAT-X-02', ['a'], ['webapp'])
    const grijs = scenario('UAT-X-03', ['a'], ['webapp'])
    const l = buildResultLookup([row('UAT-X-02', 'a', 'webapp', 'geslaagd')])
    const agg = deriveZoneStatus([groen, grijs], l)
    expect(agg.status).toBe('groen')
    expect(agg.incompleet).toBe(true)
    expect(agg.done).toBe(1)
    expect(agg.total).toBe(2)
  })
})

// ── geblokkeerd zonder rood → oranje ─────────────────────────────────────────

describe('geblokkeerd zonder gefaald', () => {
  const s = scenario('UAT-X-01', ['a', 'b'], ['webapp'])
  const lookup = buildResultLookup([
    row('UAT-X-01', 'a', 'webapp', 'geslaagd'),
    row('UAT-X-01', 'b', 'webapp', 'geblokkeerd'),
  ])

  it('is oranje (geblokkeerd wint van geslaagd, maar niet van rood)', () => {
    expect(deriveScenarioStatus(s, lookup).status).toBe('oranje')
  })

  it('een rood elders overstemt oranje op zoneniveau', () => {
    const rood = scenario('UAT-X-02', ['a'], ['webapp'])
    const l = buildResultLookup([
      row('UAT-X-01', 'a', 'webapp', 'geblokkeerd'),
      row('UAT-X-02', 'a', 'webapp', 'gefaald'),
    ])
    expect(deriveZoneStatus([s, rood], l).status).toBe('rood')
  })
})

// ── succesrate-rekenvoorbeeld ─────────────────────────────────────────────────

describe('computeCoverage', () => {
  const s1 = scenario('UAT-X-01', ['a', 'b'], ['webapp']) // 2 instanties
  const s2 = scenario('UAT-X-02', ['a', 'b'], ['webapp']) // 2 instanties → totaal 4

  it('rekent dekking en succesrate correct', () => {
    // 3 uitgevoerd, waarvan 2 geslaagd → succesrate 2/3
    const cov = computeCoverage(
      [s1, s2],
      [
        row('UAT-X-01', 'a', 'webapp', 'geslaagd'),
        row('UAT-X-01', 'b', 'webapp', 'gefaald'),
        row('UAT-X-02', 'a', 'webapp', 'geslaagd'),
        // UAT-X-02 b niet uitgevoerd → grijs
      ],
    )
    expect(cov.total).toBe(4)
    expect(cov.executed).toBe(3)
    expect(cov.geslaagd).toBe(2)
    expect(cov.grijs).toBe(1)
    expect(cov.successRate).toBeCloseTo(2 / 3, 6)
  })

  it('succesrate is 0 als niets is uitgevoerd', () => {
    const cov = computeCoverage([s1], [])
    expect(cov.executed).toBe(0)
    expect(cov.successRate).toBe(0)
  })
})

// ── sleutel + visuele codering ────────────────────────────────────────────────

describe('resultKey + visuele codering', () => {
  it('bouwt een deterministische sleutel', () => {
    expect(resultKey('UAT-X-01', 'a', 'webapp')).toBe('UAT-X-01|a|webapp')
  })

  it('elke status heeft een eigen vorm (kleur nooit alleen)', () => {
    const shapes = new Set(Object.values(UAT_STATUS_VISUAL).map((v) => v.shape))
    expect(shapes.size).toBe(4)
    expect(UAT_STATUS_VISUAL.grijs.fill).toBe('none')
    expect(UAT_STATUS_VISUAL.groen.glyph).toBe('✓')
  })
})

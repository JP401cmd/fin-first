import { describe, it, expect } from 'vitest'
import { HEALTH_SCORE_VERSION } from '@/lib/financial-health'
import {
  deriveHealthVerloop,
  detectEngineBronTransition,
  detectScoreVersionTransition,
  formatTransitionDate,
  healthScoreSinceLastMonth,
  withLiveCurrentMonth,
  type HealthVerloopPunt,
} from './health-verloop'

const NOW = new Date(2026, 8, 26, 12, 0, 0) // 26 sep 2026, lokale tijd

function punt(snapshot_date: string, resilience_score: number | null, score_version: number | null = HEALTH_SCORE_VERSION): HealthVerloopPunt {
  return { snapshot_date, resilience_score, score_version, fire_age: null, engine_bron: null }
}

describe('deriveHealthVerloop', () => {
  it('Given rauwe maandstanden met numeric-strings, When afgeleid, Then getallen of null en geen bedragen', () => {
    const [p] = deriveHealthVerloop([
      { snapshot_date: '2026-08-31', resilience_score: '61', score_version: 2, fire_age: '52.4', engine_bron: 'kernel' },
    ])
    expect(p).toEqual({ snapshot_date: '2026-08-31', resilience_score: 61, score_version: 2, fire_age: 52.4, engine_bron: 'kernel' })
    expect(p).not.toHaveProperty('net_worth')
  })

  it('Given ontbrekende kolommen, When afgeleid, Then null', () => {
    expect(deriveHealthVerloop([{ snapshot_date: '2026-08-31' }])[0]).toEqual({
      snapshot_date: '2026-08-31', resilience_score: null, score_version: null, fire_age: null, engine_bron: null,
    })
  })
})

describe('healthScoreSinceLastMonth — "sinds vorige maand" alleen binnen dezelfde score_version', () => {
  it('Given een stand van vorige maand met dezelfde versie, When vergeleken, Then het verschil in hele punten', () => {
    const verloop = [punt('2026-07-31', 55), punt('2026-08-29', 61), punt('2026-09-26', 70)]
    expect(healthScoreSinceLastMonth({ currentTotal: 64.4, verloop, now: NOW })).toBe(3)
  })

  it('Given een daling, When vergeleken, Then een negatief verschil', () => {
    expect(healthScoreSinceLastMonth({ currentTotal: 58, verloop: [punt('2026-08-29', 61)], now: NOW })).toBe(-3)
  })

  it('Given een stand van vorige maand uit een andere score_version, When vergeleken, Then geen vergelijking', () => {
    const verloop = [punt('2026-08-29', 61, 1)]
    expect(healthScoreSinceLastMonth({ currentTotal: 64, verloop, now: NOW })).toBeNull()
  })

  it('Given een stand zonder bekende versie, When vergeleken, Then geen vergelijking', () => {
    expect(healthScoreSinceLastMonth({ currentTotal: 64, verloop: [punt('2026-08-29', 61, null)], now: NOW })).toBeNull()
  })

  it('Given geen stand in de vorige kalendermaand (wel eerder en deze maand), When vergeleken, Then geen vergelijking', () => {
    const verloop = [punt('2026-07-31', 55), punt('2026-09-02', 70)]
    expect(healthScoreSinceLastMonth({ currentTotal: 64, verloop, now: NOW })).toBeNull()
  })

  it('Given een stand van vorige maand zonder score, When vergeleken, Then geen vergelijking', () => {
    expect(healthScoreSinceLastMonth({ currentTotal: 64, verloop: [punt('2026-08-29', null)], now: NOW })).toBeNull()
  })

  it('Given een lege reeks, When vergeleken, Then geen vergelijking', () => {
    expect(healthScoreSinceLastMonth({ currentTotal: 64, verloop: [], now: NOW })).toBeNull()
  })

  it('Given januari, When vergeleken, Then is december van het vorige jaar de vorige maand', () => {
    const jan = new Date(2027, 0, 10, 12, 0, 0)
    expect(healthScoreSinceLastMonth({ currentTotal: 64, verloop: [punt('2026-12-30', 60)], now: jan })).toBe(4)
  })

  it('Given dezelfde score, When vergeleken, Then nul', () => {
    expect(healthScoreSinceLastMonth({ currentTotal: 61, verloop: [punt('2026-08-29', 61)], now: NOW })).toBe(0)
  })
})

describe('detectScoreVersionTransition', () => {
  it('Given één versie, Then null', () => {
    expect(detectScoreVersionTransition([punt('2026-05-31', 50), punt('2026-06-30', 52)])).toBeNull()
  })

  it('Given een wisseling 1 → 2, Then de datum van het eerste punt in de nieuwe versie', () => {
    expect(
      detectScoreVersionTransition([punt('2026-05-31', 50, 1), punt('2026-06-30', 58, 2), punt('2026-07-31', 59, 2)]),
    ).toBe('2026-06-30')
  })

  it('Given punten zonder score of versie tussendoor, Then die tellen niet mee', () => {
    expect(
      detectScoreVersionTransition([punt('2026-05-31', 50, 1), punt('2026-06-30', null, 2), punt('2026-07-31', 59, null), punt('2026-08-31', 60, 1)]),
    ).toBeNull()
  })

  it('Given een reeks zonder versies (oudere select), Then null', () => {
    expect(detectScoreVersionTransition([punt('2026-05-31', 50, null), punt('2026-06-30', 58, null)])).toBeNull()
  })
})

describe('detectEngineBronTransition (V15)', () => {
  const snap = (snapshot_date: string, engine_bron: string | null) => ({ snapshot_date, engine_bron })

  it('geen overgang (één rekenwijze) → null', () => {
    expect(detectEngineBronTransition([snap('2026-05-01', 'v2'), snap('2026-06-01', 'v2')])).toBeNull()
    expect(detectEngineBronTransition([snap('2026-05-01', 'kernel'), snap('2026-06-01', 'kernel')])).toBeNull()
  })

  it('null → kernel = overgang → de datum van het kernel-punt (null telt als v2)', () => {
    expect(detectEngineBronTransition([snap('2026-05-01', null), snap('2026-06-01', 'kernel')])).toBe('2026-06-01')
  })

  it('kernel → v2 = ook een overgang → de datum van het v2-punt', () => {
    expect(detectEngineBronTransition([snap('2026-05-01', 'kernel'), snap('2026-06-01', 'v2')])).toBe('2026-06-01')
  })

  it('alles-null (allemaal v2) → null', () => {
    expect(
      detectEngineBronTransition([snap('2026-05-01', null), snap('2026-06-01', null), snap('2026-07-01', null)]),
    ).toBeNull()
  })
})

describe('formatTransitionDate', () => {
  it('maakt van een YYYY-MM-DD een korte NL-maand met jaar, zonder tijdzone', () => {
    expect(formatTransitionDate('2026-07-01')).toBe('jul 2026')
    expect(formatTransitionDate('2026-01-31')).toBe('jan 2026')
  })

  it('laat een onleesbare datum ongemoeid', () => {
    expect(formatTransitionDate('onbekend')).toBe('onbekend')
  })
})

describe('withLiveCurrentMonth — de lopende maand is de live stand', () => {
  it('Given een opgeslagen stand deze maand die afwijkt van live, When het verloop wordt samengesteld, Then draagt de lopende maand het live getal en de huidige versie, en blijft de FIRE-historie staan', () => {
    const verloop: HealthVerloopPunt[] = [
      punt('2026-08-29', 56),
      { snapshot_date: '2026-09-03', resilience_score: 69, score_version: 1, fire_age: 51.9, engine_bron: 'v2' },
    ]
    const uit = withLiveCurrentMonth(verloop, { liveTotal: 56.4, now: NOW })
    expect(uit).toHaveLength(2)
    expect(uit[1]).toEqual({
      snapshot_date: '2026-09-03',
      resilience_score: 56,
      score_version: HEALTH_SCORE_VERSION,
      fire_age: 51.9,
      engine_bron: 'v2',
      live: true,
    })
    // De invoer blijft onaangeroerd.
    expect(verloop[1].resilience_score).toBe(69)
  })

  it('Given geen stand deze maand, When het verloop wordt samengesteld, Then komt er een punt van vandaag bij met de live stand en zonder vrijheidsleeftijd', () => {
    const uit = withLiveCurrentMonth([punt('2026-08-29', 56)], { liveTotal: 61, now: NOW })
    expect(uit.map((p) => p.snapshot_date)).toEqual(['2026-08-29', '2026-09-26'])
    expect(uit[1]).toEqual({
      snapshot_date: '2026-09-26',
      resilience_score: 61,
      score_version: HEALTH_SCORE_VERSION,
      fire_age: null,
      engine_bron: null,
      live: true,
    })
  })

  it('Given een lege reeks, When het verloop wordt samengesteld, Then één live punt', () => {
    expect(withLiveCurrentMonth([], { liveTotal: 61, now: NOW })).toHaveLength(1)
  })

  it('Given het live verloop, When "sinds vorige maand" en de grafiek hetzelfde lezen, Then zeggen ze per constructie hetzelfde', () => {
    const uit = withLiveCurrentMonth([punt('2026-08-29', 56), punt('2026-09-03', 69)], { liveTotal: 56, now: NOW })
    const delta = healthScoreSinceLastMonth({ currentTotal: 56, verloop: uit, now: NOW })
    const [aug, sep] = uit.slice(-2)
    expect(delta).toBe(0)
    expect((sep.resilience_score ?? 0) - (aug.resilience_score ?? 0)).toBe(delta)
  })
})

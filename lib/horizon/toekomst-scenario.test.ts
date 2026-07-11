import { describe, it, expect } from 'vitest'
import type { Asset, AssetType } from '@/lib/asset-data'
import type { WhatIfEvent } from '@/components/app/horizon/whatif-events'
import {
  parseToekomstScenarioPrefs,
  expandCategorieReturnDeltas,
  buildCategorieReturnGroups,
  scenarioMonthlySpendDelta,
  type ToekomstScenarioPrefs,
} from './toekomst-scenario'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAsset(over: Partial<Asset> & { asset_type: AssetType }): Asset {
  return {
    id: `asset-${over.asset_type}-${Math.random()}`,
    name: over.name ?? over.asset_type,
    current_value: 100_000,
    expected_return: 7,
    is_active: true,
    net_worth_inclusion_pct: 100,
    ...over,
  } as unknown as Asset
}

function makeSliderEvent(over: Partial<WhatIfEvent>): WhatIfEvent {
  return {
    id: 'ev',
    name: 'Event',
    event_type: 'lifestyle_adjustment',
    target_age: 42,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 0,
    duration_months: 0,
    icon: 'PiggyBank',
    is_active: true,
    sort_order: 0,
    is_indexed: true,
    metadata: {},
    is_scenario_only: true,
    ...over,
  } as WhatIfEvent
}

// ── parseToekomstScenarioPrefs ───────────────────────────────────────────────

describe('parseToekomstScenarioPrefs', () => {
  it('geldige roundtrip — behoudt bekende velden', () => {
    const input: ToekomstScenarioPrefs = {
      v: 1,
      sliders: { income: 4000, workdays: 4, savings: 30, extraInleg: 500 },
      returnDeltaByCategorie: { Beleggingen: 0.02, Spaargeld: -0.01 },
      stopAge: 55,
      stopKoppel: true,
      stopMarge: 1.5,
      showScenarioLine: false,
    }
    expect(parseToekomstScenarioPrefs(input)).toEqual(input)
  })

  it('clampt stopMarge op ±30 en negeert niet-eindige/afwezige waarden', () => {
    expect(parseToekomstScenarioPrefs({ v: 1, stopMarge: 2.5 })?.stopMarge).toBe(2.5)
    expect(parseToekomstScenarioPrefs({ v: 1, stopMarge: -80 })?.stopMarge).toBe(-30)
    expect(parseToekomstScenarioPrefs({ v: 1, stopMarge: 80 })?.stopMarge).toBe(30)
    expect(parseToekomstScenarioPrefs({ v: 1, stopMarge: 'veel' })?.stopMarge).toBeUndefined()
    expect(parseToekomstScenarioPrefs({ v: 1, stopMarge: null })?.stopMarge).toBeUndefined()
    expect(parseToekomstScenarioPrefs({ v: 1 })?.stopMarge).toBeUndefined()
  })

  it('niet-object of verkeerde versie → null', () => {
    expect(parseToekomstScenarioPrefs(null)).toBeNull()
    expect(parseToekomstScenarioPrefs(undefined)).toBeNull()
    expect(parseToekomstScenarioPrefs(42)).toBeNull()
    expect(parseToekomstScenarioPrefs('scenario')).toBeNull()
    expect(parseToekomstScenarioPrefs([])).toBeNull()
    expect(parseToekomstScenarioPrefs({})).toBeNull() // v ontbreekt
    expect(parseToekomstScenarioPrefs({ v: 2, sliders: {} })).toBeNull()
    expect(parseToekomstScenarioPrefs({ v: '1' })).toBeNull()
  })

  it('minimale geldige pref (alleen v) → { v: 1 }', () => {
    expect(parseToekomstScenarioPrefs({ v: 1 })).toEqual({ v: 1 })
  })

  it('clampt sliderwaarden op de echte ranges', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 1,
      sliders: { income: 99_999, workdays: 9, savings: 200, extraInleg: -100 },
    })
    expect(parsed?.sliders).toEqual({
      income: 15_000, // max
      workdays: 5, // max
      savings: 80, // max
      extraInleg: 0, // min
    })
  })

  it('gooit onbekende slider-keys en niet-eindige waarden weg', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 1,
      sliders: { income: 3000, bogus: 5, workdays: Number.NaN, savings: 'x' },
    })
    expect(parsed?.sliders).toEqual({ income: 3000 })
    expect((parsed?.sliders as Record<string, unknown>).bogus).toBeUndefined()
  })

  it('whitelist categorie-keys en clamp rendement-delta op ±0,05', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 1,
      returnDeltaByCategorie: {
        Beleggingen: 0.9, // → +0,05
        Spaargeld: -0.9, // → −0,05
        Pensioen: 0.01,
        Onzin: 0.03, // geen geldige categorie → weg
      },
    })
    expect(parsed?.returnDeltaByCategorie).toEqual({
      Beleggingen: 0.05,
      Spaargeld: -0.05,
      Pensioen: 0.01,
    })
  })

  it('bewaart stopAge=null expliciet en clampt anders naar integer 18–100', () => {
    expect(parseToekomstScenarioPrefs({ v: 1, stopAge: null })?.stopAge).toBeNull()
    expect(parseToekomstScenarioPrefs({ v: 1, stopAge: 10 })?.stopAge).toBe(18)
    expect(parseToekomstScenarioPrefs({ v: 1, stopAge: 250 })?.stopAge).toBe(100)
    expect(parseToekomstScenarioPrefs({ v: 1, stopAge: 55.7 })?.stopAge).toBe(56)
  })

  it('parseert stopKoppel + showScenarioLine alleen als boolean', () => {
    expect(parseToekomstScenarioPrefs({ v: 1, stopKoppel: true })?.stopKoppel).toBe(true)
    expect(parseToekomstScenarioPrefs({ v: 1, stopKoppel: 'yes' })?.stopKoppel).toBeUndefined()
    expect(parseToekomstScenarioPrefs({ v: 1, showScenarioLine: false })?.showScenarioLine).toBe(false)
    expect(parseToekomstScenarioPrefs({ v: 1, showScenarioLine: 1 })?.showScenarioLine).toBeUndefined()
  })

  it('slaat een nul-delta over (legacy `{Spaargeld: 0}` → veld ontbreekt)', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 1,
      returnDeltaByCategorie: { Spaargeld: 0, Beleggingen: 0.02 },
    })
    // De 0-delta verdwijnt; alleen de effectieve delta blijft over.
    expect(parsed?.returnDeltaByCategorie).toEqual({ Beleggingen: 0.02 })
    // Enkel een 0-delta → hele sub-object valt weg (geen lege key-set).
    expect(parseToekomstScenarioPrefs({ v: 1, returnDeltaByCategorie: { Spaargeld: 0 } })).toEqual({
      v: 1,
    })
  })

  it('laat lege sub-objecten weg (geen lege sliders/returnDeltaByCategorie)', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 1,
      sliders: { bogus: 1 },
      returnDeltaByCategorie: { Onzin: 0.02 },
    })
    expect(parsed).toEqual({ v: 1 })
  })
})

// ── expandCategorieReturnDeltas ──────────────────────────────────────────────

describe('expandCategorieReturnDeltas', () => {
  it('lege/ontbrekende delta → {}', () => {
    const assets = [makeAsset({ asset_type: 'investment' })]
    expect(expandCategorieReturnDeltas(undefined, assets)).toEqual({})
    expect(expandCategorieReturnDeltas({}, assets)).toEqual({})
  })

  it('expandeert alleen naar bezeten asset_types', () => {
    const assets = [
      makeAsset({ asset_type: 'investment' }), // → Beleggingen
      makeAsset({ asset_type: 'cash' }), // → Spaargeld
    ]
    // Vastgoed-delta is niet bezeten → verschijnt niet.
    const out = expandCategorieReturnDeltas(
      { Beleggingen: 0.02, Vastgoed: 0.03 },
      assets,
    )
    expect(out).toEqual({ investment: 0.02 })
  })

  it('meerdere asset_types op dezelfde categorie krijgen dezelfde delta', () => {
    const assets = [
      makeAsset({ asset_type: 'cash' }), // → Spaargeld
      makeAsset({ asset_type: 'savings' }), // → Spaargeld
    ]
    const out = expandCategorieReturnDeltas({ Spaargeld: -0.015 }, assets)
    expect(out).toEqual({ cash: -0.015, savings: -0.015 })
  })

  it("onbekend asset_type valt op 'Overig' terug", () => {
    const assets = [makeAsset({ asset_type: 'brandnew' as AssetType })]
    const out = expandCategorieReturnDeltas({ Overig: 0.01 }, assets)
    expect(out).toEqual({ brandnew: 0.01 })
  })

  it('nul-delta wordt overgeslagen', () => {
    const assets = [makeAsset({ asset_type: 'investment' })]
    expect(expandCategorieReturnDeltas({ Beleggingen: 0 }, assets)).toEqual({})
  })

  it('crypto valt onder Beleggingen (kern-categorie, niet display-overig)', () => {
    const assets = [makeAsset({ asset_type: 'crypto' })]
    expect(expandCategorieReturnDeltas({ Beleggingen: 0.04 }, assets)).toEqual({ crypto: 0.04 })
  })
})

// ── buildCategorieReturnGroups ───────────────────────────────────────────────

describe('buildCategorieReturnGroups', () => {
  it('gewogen rendement per bezeten categorie, in canonieke volgorde', () => {
    const assets = [
      makeAsset({ asset_type: 'cash', current_value: 50_000, expected_return: 1 }), // Spaargeld
      makeAsset({ asset_type: 'investment', current_value: 100_000, expected_return: 7 }), // Beleggingen
      makeAsset({ asset_type: 'crypto', current_value: 100_000, expected_return: 15 }), // Beleggingen
    ]
    const groups = buildCategorieReturnGroups(assets)
    // Canonieke volgorde: Spaargeld vóór Beleggingen.
    expect(groups.map((g) => g.assetType)).toEqual(['Spaargeld', 'Beleggingen'])
    const spaar = groups.find((g) => g.assetType === 'Spaargeld')!
    expect(spaar.label).toBe('Spaargeld')
    expect(spaar.weightedReturn).toBeCloseTo(0.01, 6)
    // Beleggingen: (100k×0,07 + 100k×0,15) / 200k = 0,11
    const bel = groups.find((g) => g.assetType === 'Beleggingen')!
    expect(bel.weightedReturn).toBeCloseTo(0.11, 6)
  })

  it('nul-basis: 0%-asset drukt het gewogen rendement (geen grossReturn-fallback)', () => {
    const assets = [
      makeAsset({ asset_type: 'investment', current_value: 100_000, expected_return: 8 }),
      makeAsset({ asset_type: 'crypto', current_value: 100_000, expected_return: 0 }),
    ]
    const bel = buildCategorieReturnGroups(assets).find((g) => g.assetType === 'Beleggingen')!
    // (100k×0,08 + 100k×0) / 200k = 0,04 — nul-basis telt echt mee als 0.
    expect(bel.weightedReturn).toBeCloseTo(0.04, 6)
  })

  it('weegt met inclusion_pct en negeert inactieve / waardeloze assets', () => {
    const assets = [
      makeAsset({ asset_type: 'investment', current_value: 100_000, expected_return: 6, net_worth_inclusion_pct: 50 }),
      makeAsset({ asset_type: 'investment', current_value: 0, expected_return: 20 }), // waarde 0 → weg
      makeAsset({ asset_type: 'investment', current_value: 999_999, expected_return: 99, is_active: false }), // inactief → weg
    ]
    const groups = buildCategorieReturnGroups(assets)
    expect(groups).toHaveLength(1)
    // Alleen de eerste telt: gewogen waarde 50k, rendement 6%.
    expect(groups[0].weightedReturn).toBeCloseTo(0.06, 6)
  })

  it('geen assets → lege lijst', () => {
    expect(buildCategorieReturnGroups([])).toEqual([])
  })
})

// ── scenarioMonthlySpendDelta ────────────────────────────────────────────────

describe('scenarioMonthlySpendDelta', () => {
  it('sommeert monthly_cost_change over actieve events', () => {
    const events = [
      makeSliderEvent({ monthly_cost_change: -200 }), // spaarquote hoger → minder besteden
      makeSliderEvent({ monthly_cost_change: 150 }),
      makeSliderEvent({ monthly_income_change: 500, monthly_cost_change: 0 }), // inkomen-event, geen bestedingsdelta
    ]
    expect(scenarioMonthlySpendDelta(events)).toBe(-50)
  })

  it('negeert uitgezette / inactieve events', () => {
    const events = [
      makeSliderEvent({ monthly_cost_change: -300 }),
      makeSliderEvent({ monthly_cost_change: 999, whatIfDisabled: true }),
      makeSliderEvent({ monthly_cost_change: 888, is_active: false }),
    ]
    expect(scenarioMonthlySpendDelta(events)).toBe(-300)
  })

  it('lege lijst → 0', () => {
    expect(scenarioMonthlySpendDelta([])).toBe(0)
  })
})

import { describe, it, expect } from 'vitest'
import type { Asset, AssetType } from '@/lib/asset-data'
import type { WhatIfEvent } from '@/lib/types/horizon-whatif'
import {
  parseToekomstScenarioPrefs,
  isDoelConceptGewijzigd,
  expandCategorieReturnDeltas,
  buildCategorieReturnGroups,
  scenarioMonthlySpendDelta,
  type ToekomstScenarioStand,
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
  it('v1-input normaliseert naar v2 — behoudt alle bekende velden, voegt geen doel toe', () => {
    // v1-fixture (de oude opgeslagen shape). De parser normaliseert ALTIJD naar v:2 met
    // identieke veldwaarden en zonder doel-blok (v1 kende geen doel).
    const v1input = {
      v: 1,
      sliders: { income: 4000, workdays: 4, savings: 30, extraInleg: 500 },
      returnDeltaByCategorie: { Beleggingen: 0.02, Spaargeld: -0.01 },
      stopAge: 55,
      stopKoppel: true,
      stopMarge: 1.5,
      showScenarioLine: false,
    }
    expect(parseToekomstScenarioPrefs(v1input)).toEqual({ ...v1input, v: 2 })
  })

  it('v2-roundtrip mét doel — behoudt stand/parameters/gezetOp/goalIds', () => {
    const v2input = {
      v: 2,
      sliders: { income: 4000, savings: 35 },
      returnDeltaByCategorie: { Beleggingen: 0.02 },
      stopAge: 55,
      stopKoppel: false,
      showScenarioLine: true,
      doel: {
        gezetOp: '2026-07-11T10:00:00.000Z',
        parameters: { spaarquote: true, fire: true },
        stand: {
          sliders: { income: 4000, savings: 35 },
          returnDeltaByCategorie: { Beleggingen: 0.02 },
          stopAge: 55,
          stopKoppel: false,
        },
        goalIds: { spaarquote: 'goal-abc', fire: 'goal-xyz' },
      },
    }
    expect(parseToekomstScenarioPrefs(v2input)).toEqual(v2input)
  })

  it('clampt stopMarge op ±30 en negeert niet-eindige/afwezige waarden', () => {
    expect(parseToekomstScenarioPrefs({ v: 1, stopMarge: 2.5 })?.stopMarge).toBe(2.5)
    expect(parseToekomstScenarioPrefs({ v: 1, stopMarge: -80 })?.stopMarge).toBe(-30)
    expect(parseToekomstScenarioPrefs({ v: 1, stopMarge: 80 })?.stopMarge).toBe(30)
    expect(parseToekomstScenarioPrefs({ v: 1, stopMarge: 'veel' })?.stopMarge).toBeUndefined()
    expect(parseToekomstScenarioPrefs({ v: 1, stopMarge: null })?.stopMarge).toBeUndefined()
    expect(parseToekomstScenarioPrefs({ v: 1 })?.stopMarge).toBeUndefined()
  })

  it('niet-object of onbekende versie → null', () => {
    expect(parseToekomstScenarioPrefs(null)).toBeNull()
    expect(parseToekomstScenarioPrefs(undefined)).toBeNull()
    expect(parseToekomstScenarioPrefs(42)).toBeNull()
    expect(parseToekomstScenarioPrefs('scenario')).toBeNull()
    expect(parseToekomstScenarioPrefs([])).toBeNull()
    expect(parseToekomstScenarioPrefs({})).toBeNull() // v ontbreekt
    // v:2 is nu een GELDIGE versie (was voorheen null) — onbekende versies blijven null.
    expect(parseToekomstScenarioPrefs({ v: 3, sliders: {} })).toBeNull()
    expect(parseToekomstScenarioPrefs({ v: 0 })).toBeNull()
    expect(parseToekomstScenarioPrefs({ v: '1' })).toBeNull()
    expect(parseToekomstScenarioPrefs({ v: '2' })).toBeNull()
  })

  it('minimale geldige pref → { v: 2 } (v1 én v2 normaliseren gelijk)', () => {
    expect(parseToekomstScenarioPrefs({ v: 1 })).toEqual({ v: 2 })
    expect(parseToekomstScenarioPrefs({ v: 2 })).toEqual({ v: 2 })
    // v:2 met leeg sliders-object → sliders vallen weg (was voorheen null bij v:2).
    expect(parseToekomstScenarioPrefs({ v: 2, sliders: {} })).toEqual({ v: 2 })
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
    // Enkel een 0-delta → hele sub-object valt weg (geen lege key-set). Genormaliseerd naar v:2.
    expect(parseToekomstScenarioPrefs({ v: 1, returnDeltaByCategorie: { Spaargeld: 0 } })).toEqual({
      v: 2,
    })
  })

  it('laat lege sub-objecten weg (geen lege sliders/returnDeltaByCategorie)', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 1,
      sliders: { bogus: 1 },
      returnDeltaByCategorie: { Onzin: 0.02 },
    })
    expect(parsed).toEqual({ v: 2 }) // genormaliseerd naar v:2
  })
})

// ── parseToekomstScenarioPrefs — doel-blok (v2) ──────────────────────────────

describe('parseToekomstScenarioPrefs — doel-blok', () => {
  const GEZET_OP = '2026-07-11T10:00:00.000Z'

  it('v1-input negeert een meegegeven doel (v1 draagt geen doel)', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 1,
      sliders: { income: 4000 },
      doel: { gezetOp: GEZET_OP, parameters: { fire: true }, stand: { stopAge: 55 } },
    })
    expect(parsed).toEqual({ v: 2, sliders: { income: 4000 } })
    expect(parsed?.doel).toBeUndefined()
  })

  it('parameters: alleen bekende keys met waarde `true`', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 2,
      doel: {
        gezetOp: GEZET_OP,
        parameters: { spaarquote: true, salaris: 'yes', fire: 1, rendement: true, onzin: true },
        stand: { stopAge: 55, stopKoppel: false },
      },
    })
    expect(parsed?.doel?.parameters).toEqual({ spaarquote: true, rendement: true })
  })

  it('goalIds: cache met alleen bekende keys en niet-lege strings', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 2,
      doel: {
        gezetOp: GEZET_OP,
        parameters: { fire: true },
        stand: { stopAge: 55, stopKoppel: false },
        goalIds: { fire: 'goal-1', spaarquote: '', salaris: 42, onzin: 'x' },
      },
    })
    expect(parsed?.doel?.goalIds).toEqual({ fire: 'goal-1' })
  })

  it('clampt de stand-velden met exact dezelfde clamps als de hoofdvelden', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 2,
      doel: {
        gezetOp: GEZET_OP,
        parameters: { spaarquote: true },
        stand: {
          sliders: { income: 99999, savings: 200, extraInleg: -100 },
          returnDeltaByCategorie: { Beleggingen: 0.9, Onzin: 0.03 },
          stopAge: 250,
          stopMarge: 80,
        },
      },
    })
    expect(parsed?.doel?.stand).toEqual({
      sliders: { income: 15000, savings: 80, extraInleg: 0 },
      returnDeltaByCategorie: { Beleggingen: 0.05 },
      stopAge: 100,
      stopMarge: 30,
    })
  })

  it('vervuild doel-blok laat ALLEEN het doel vallen — ongeldige gezetOp', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 2,
      sliders: { income: 4000 },
      showScenarioLine: true,
      doel: { gezetOp: 'niet-een-datum', parameters: { fire: true }, stand: { stopAge: 55 } },
    })
    // Doel weg, rest van de pref blijft ongemoeid.
    expect(parsed).toEqual({ v: 2, sliders: { income: 4000 }, showScenarioLine: true })
  })

  it('vervuild doel-blok — gezetOp geen string → doel weg', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 2,
      stopAge: 60,
      doel: { gezetOp: 12345, parameters: { fire: true }, stand: { stopAge: 55 } },
    })
    expect(parsed).toEqual({ v: 2, stopAge: 60 })
  })

  it('vervuild doel-blok — leeg/onbekend parameters-object → doel weg', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 2,
      stopAge: 60,
      doel: {
        gezetOp: GEZET_OP,
        parameters: { onzin: true, spaarquote: false }, // geen enkele geldige `true`
        stand: { stopAge: 55 },
      },
    })
    expect(parsed).toEqual({ v: 2, stopAge: 60 })
  })

  it('vervuild doel-blok — rommel-stand (parset naar leeg) → doel weg', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 2,
      showScenarioLine: false,
      doel: {
        gezetOp: GEZET_OP,
        parameters: { fire: true },
        stand: { bogus: 1, junk: 'x' }, // strippt naar {} → betekenisloos
      },
    })
    expect(parsed).toEqual({ v: 2, showScenarioLine: false })
  })

  it('vervuild doel-blok — ontbrekende/niet-object stand → doel weg', () => {
    expect(
      parseToekomstScenarioPrefs({
        v: 2,
        doel: { gezetOp: GEZET_OP, parameters: { fire: true } }, // geen stand
      }),
    ).toEqual({ v: 2 })
    expect(
      parseToekomstScenarioPrefs({
        v: 2,
        doel: { gezetOp: GEZET_OP, parameters: { fire: true }, stand: 'rommel' },
      }),
    ).toEqual({ v: 2 })
  })

  it('geldig doel zonder goalIds — goalIds blijft afwezig', () => {
    const parsed = parseToekomstScenarioPrefs({
      v: 2,
      doel: {
        gezetOp: GEZET_OP,
        parameters: { fire: true },
        stand: { stopAge: 55, stopKoppel: false },
      },
    })
    expect(parsed?.doel).toEqual({
      gezetOp: GEZET_OP,
      parameters: { fire: true },
      stand: { stopAge: 55, stopKoppel: false },
    })
    expect(parsed?.doel && 'goalIds' in parsed.doel).toBe(false)
  })
})

// ── isDoelConceptGewijzigd ───────────────────────────────────────────────────

describe('isDoelConceptGewijzigd', () => {
  const stand: ToekomstScenarioStand = {
    sliders: { income: 4000, workdays: 4, savings: 30, extraInleg: 500 },
    returnDeltaByCategorie: { Beleggingen: 0.02 },
    stopAge: 55,
    stopKoppel: false,
  }

  it('identieke stand → niet gewijzigd', () => {
    expect(isDoelConceptGewijzigd({ ...stand }, stand)).toBe(false)
  })

  it('sub-euro income/savings-verschil rondt weg → niet gewijzigd (spiegelt persist Math.round)', () => {
    const live: ToekomstScenarioStand = {
      ...stand,
      sliders: { income: 4000.4, workdays: 4, savings: 30.3, extraInleg: 500 },
    }
    expect(isDoelConceptGewijzigd(live, stand)).toBe(false)
  })

  it('income ≥ €1 verschil (andere afronding) → gewijzigd', () => {
    const live = { ...stand, sliders: { ...stand.sliders!, income: 4001 } }
    expect(isDoelConceptGewijzigd(live, stand)).toBe(true)
  })

  it('savings ≥ 1 verschil → gewijzigd', () => {
    const live = { ...stand, sliders: { ...stand.sliders!, savings: 32 } }
    expect(isDoelConceptGewijzigd(live, stand)).toBe(true)
  })

  it('workdays exact vergeleken → elk verschil gewijzigd', () => {
    const live = { ...stand, sliders: { ...stand.sliders!, workdays: 3 } }
    expect(isDoelConceptGewijzigd(live, stand)).toBe(true)
  })

  it('extraInleg exact vergeleken → elk verschil gewijzigd', () => {
    const live = { ...stand, sliders: { ...stand.sliders!, extraInleg: 501 } }
    expect(isDoelConceptGewijzigd(live, stand)).toBe(true)
  })

  it('rendement-delta echt verschil → gewijzigd', () => {
    const live = { ...stand, returnDeltaByCategorie: { Beleggingen: 0.03 } }
    expect(isDoelConceptGewijzigd(live, stand)).toBe(true)
  })

  it('rendement-delta afwezig-vs-aanwezig → gewijzigd', () => {
    const live = { ...stand, returnDeltaByCategorie: undefined }
    expect(isDoelConceptGewijzigd(live, stand)).toBe(true)
  })

  it('rendement-delta binnen 1e-9 → niet gewijzigd', () => {
    const live = { ...stand, returnDeltaByCategorie: { Beleggingen: 0.02 + 1e-12 } }
    expect(isDoelConceptGewijzigd(live, stand)).toBe(false)
  })

  it('stopAge-verschil bij koppel uit → gewijzigd', () => {
    const live = { ...stand, stopAge: 58 }
    expect(isDoelConceptGewijzigd(live, stand)).toBe(true)
  })

  it('stopAge undefined ≡ null (beide "geen stop") → niet gewijzigd', () => {
    const s: ToekomstScenarioStand = { stopKoppel: false, stopAge: null }
    const live: ToekomstScenarioStand = { stopKoppel: false } // stopAge afwezig
    expect(isDoelConceptGewijzigd(live, s)).toBe(false)
  })

  it('stopKoppel-verschil → gewijzigd', () => {
    const live = { ...stand, stopKoppel: true, stopMarge: 1 }
    expect(isDoelConceptGewijzigd(live, stand)).toBe(true)
  })

  it('koppel aan in beide: marge is de waarheid — margeverschil → gewijzigd', () => {
    const s: ToekomstScenarioStand = { stopKoppel: true, stopAge: 55, stopMarge: 2 }
    const live: ToekomstScenarioStand = { stopKoppel: true, stopAge: 55, stopMarge: 3 }
    expect(isDoelConceptGewijzigd(live, s)).toBe(true)
  })

  it('koppel aan: afgeleide stopAge schuift maar marge gelijk → niet gewijzigd', () => {
    // Bij koppel is de stopAge afgeleid (verwacht + marge) en schuift met de sim;
    // gelijke marge = hetzelfde doel, ongeacht de absolute stopAge.
    const s: ToekomstScenarioStand = { stopKoppel: true, stopAge: 55, stopMarge: 2 }
    const live: ToekomstScenarioStand = { stopKoppel: true, stopAge: 53, stopMarge: 2 }
    expect(isDoelConceptGewijzigd(live, s)).toBe(false)
  })

  it('ontbrekende stand (geen doel) → niet gewijzigd', () => {
    expect(isDoelConceptGewijzigd(stand, null)).toBe(false)
    expect(isDoelConceptGewijzigd(stand, undefined)).toBe(false)
  })

  it('lege live-stand vs stand mét velden → gewijzigd', () => {
    expect(isDoelConceptGewijzigd({}, stand)).toBe(true)
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

  // ── Slider-werk-gate (29-jul): één grondslag met de motor ──────────────────
  it('negeert de spaarquote-slider (slider:savings) — die loopt via het FIRE-gegate salaris-kanaal', () => {
    const events = [
      makeSliderEvent({ monthly_cost_change: -400, scenario_origin: 'slider:savings' }),
      makeSliderEvent({ monthly_cost_change: -100 }), // écht lifestyle-event (geen origin) → telt wél
    ]
    expect(scenarioMonthlySpendDelta(events)).toBe(-100)
  })

  it('preset-events (preset:*) tellen wél mee — die blijven in de motor een permanente Geb-rij', () => {
    const events = [makeSliderEvent({ monthly_cost_change: -250, scenario_origin: 'preset:frugal' })]
    expect(scenarioMonthlySpendDelta(events)).toBe(-250)
  })
})

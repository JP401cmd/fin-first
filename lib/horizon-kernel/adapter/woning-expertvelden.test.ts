/**
 * TPR-03 — woning-expertvelden bereiken de kern (13 sep 2026).
 *
 * `housing_strategy_config.newMonthlyHousingCost` (€/mnd, geld van vandaag) en
 * `saleValuationBasis` ('market' | 'woz') stuurden de modal-preview wél maar de
 * kernel niet: `buildWoning` mapte ze niet (huur bleef 4% WOZ/jr, Excel P!B63) en de
 * barrel bouwde het huis-pot altijd op `current_value`. Grafiek ≠ preview.
 *
 * Contract na de fix:
 *  - `WoningStrategieParams.huurNaVerkoopPerMaand` (optioneel, inert-by-default): gezet →
 *    de kern boekt in de verkoopmaand dit bedrag × inflatie-index (geld van vandaag →
 *    nominaal, zoals élk P-blok-€-bedrag) en indexeert daarna maandelijks door — exact
 *    de `indexed: true`-cashflow van de preview. `null`/weggelaten → het %-WOZ-pad
 *    (fixture-pad zet het veld nooit → oracle-parity byte-identiek). Een bewuste 0 is
 *    "geen woonlast na verkoop" (de preview boekt dan óók geen huur).
 *  - `saleValuationBasis === 'woz'` → de barrel substitueert `current_value` van het
 *    eigen huis door `woz_value` via de ENE bron `applyDownsizeValuationBasis`
 *    (lib/housing-strategy.ts, ADR 0031) — dezelfde functie die preview en
 *    `buildHorizonInput` al gebruikten.
 */

import { describe, it, expect } from 'vitest'
import type { Asset, AssetType } from '@/lib/asset-data'
import { runKernelProjection, type KernelProjection } from '../engine'
import { EXCEL_WONING_DEFAULTS } from './defaults'

/** Bez-rij binnen de horizon (type-narrowing op de `BezRow`-unie). */
function bezRij(proj: KernelProjection, m: number) {
  const r = proj.bez[m]
  if (r === undefined || r.beyondHorizon) throw new Error(`bez[${m}] ontbreekt of ligt voorbij de horizon`)
  return r
}
import { buildKernelInputFromApp, buildWoning, type KernelAdapterProfile } from './index'

function makeAsset(p: Partial<Asset> & { id: string; asset_type: AssetType; current_value: number }): Asset {
  return {
    user_id: 'u',
    name: p.asset_type,
    purchase_value: 0,
    purchase_date: null,
    expected_return: 2,
    monthly_contribution: 0,
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    net_worth_inclusion_pct: 100,
    ...p,
  } as Asset
}

function profile(over: Partial<KernelAdapterProfile> = {}): KernelAdapterProfile {
  const dob = `${new Date().getFullYear() - 45}-01-01`
  return {
    date_of_birth: dob,
    net_monthly_income: 4000,
    estimated_monthly_expenses: 2500,
    expected_return: 0.07,
    inflation_rate: 0.02,
    box3_method: 'forfaitair',
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    ...over,
  }
}

const DOWNSIZE_FIXED = {
  mode: 'downsize' as const,
  trigger: 'fixed_age' as const,
  triggerAge: 47,
  depletionThresholdYears: 0,
  salePricePct: 1,
  salesCostsPct: 0.04,
  newMonthlyHousingCost: null as number | null,
  saleValuationBasis: 'market' as 'market' | 'woz',
}

const HUIS = makeAsset({ id: 'huis', asset_type: 'eigen_huis', current_value: 500_000, woz_value: 420_000 })
const SPAAR = makeAsset({ id: 'spaar', asset_type: 'savings', current_value: 100_000 })

// ── buildWoning: mapping van de expertvelden ─────────────────────────────────────

describe('TPR-03 — buildWoning mapt newMonthlyHousingCost', () => {
  it('€/mnd ingevuld → huurNaVerkoopPerMaand = dat bedrag; %-WOZ-default blijft staan als terugval', () => {
    const w = buildWoning({ ...DOWNSIZE_FIXED, newMonthlyHousingCost: 2000 })
    expect(w.huurNaVerkoopPerMaand).toBe(2000)
    expect(w.huurNaVerkoopPctWozPerJaar).toBe(EXCEL_WONING_DEFAULTS.huurNaVerkoopPctWozPerJaar)
  })

  it('null (auto-schatting) → veld weggelaten/null → de kern rekent het %-WOZ-pad', () => {
    const w = buildWoning({ ...DOWNSIZE_FIXED, newMonthlyHousingCost: null })
    expect(w.huurNaVerkoopPerMaand ?? null).toBeNull()
  })

  it('bewuste 0 → 0 (geen woonlast na verkoop; spiegelt de preview die dan geen huur boekt)', () => {
    const w = buildWoning({ ...DOWNSIZE_FIXED, newMonthlyHousingCost: 0 })
    expect(w.huurNaVerkoopPerMaand).toBe(0)
  })

  it('niet-downsize-modi dragen het veld niet (Meerekenen/Uitsluiten/Opeet)', () => {
    expect(buildWoning({ mode: 'include_full' }).huurNaVerkoopPerMaand ?? null).toBeNull()
    expect(buildWoning({ mode: 'exclude_from_fire' }).huurNaVerkoopPerMaand ?? null).toBeNull()
  })
})

// ── Barrel: waarderingsgrondslag → startwaarde van het huis-pot ──────────────────

describe('TPR-03 — saleValuationBasis bereikt het huis-pot', () => {
  function huisPotStartwaarde(basis: 'market' | 'woz', huis: Asset = HUIS): number {
    const input = buildKernelInputFromApp({
      profile: profile({ housing_strategy_config: { ...DOWNSIZE_FIXED, saleValuationBasis: basis } }),
      assets: [huis, SPAAR],
      debts: [],
    })
    return input.assetPotten.find((p) => p.rol === 'eigenHuis')!.startwaarde
  }

  it("'market' → current_value (ongewijzigd gedrag)", () => {
    expect(huisPotStartwaarde('market')).toBe(500_000)
  })

  it("'woz' → woz_value (dezelfde substitutie als preview/buildHorizonInput, ADR 0031)", () => {
    expect(huisPotStartwaarde('woz')).toBe(420_000)
  })

  it("'woz' zonder woz_value → current_value (keuze forceert nooit een huis naar 0)", () => {
    expect(huisPotStartwaarde('woz', makeAsset({ id: 'huis', asset_type: 'eigen_huis', current_value: 500_000, woz_value: null }))).toBe(500_000)
  })

  it("'woz' raakt niet-huis-potten en de invoerlijst niet (non-muterend)", () => {
    const assets = [HUIS, SPAAR]
    const input = buildKernelInputFromApp({
      profile: profile({ housing_strategy_config: { ...DOWNSIZE_FIXED, saleValuationBasis: 'woz' } }),
      assets,
      debts: [],
    })
    expect(input.assetPotten.find((p) => p.naam === 'savings')!.startwaarde).toBe(100_000)
    expect(HUIS.current_value).toBe(500_000)
  })
})

// ── Engine: de €-woonlast landt in het woningblok (BA) ─────────────────────────

describe('TPR-03 — kern boekt de nieuwe woonlast in € (geïndexeerd) i.p.v. 4% WOZ', () => {
  function runMet(newMonthlyHousingCost: number | null) {
    const input = buildKernelInputFromApp({
      profile: profile({ housing_strategy_config: { ...DOWNSIZE_FIXED, newMonthlyHousingCost } }),
      assets: [HUIS, SPAAR],
      debts: [],
    })
    // Vaste FIRE-leeftijd ver ná de verkoop: de trigger is 'Vaste leeftijd', dus FIRE is hier irrelevant.
    const proj = runKernelProjection(input, { fireAge: input.startLeeftijd + 20 })
    const verkoopmaand = proj.bez.findIndex((r) => !r.beyondHorizon && r.woning.verkocht === 1)
    return { input, proj, verkoopmaand }
  }

  it('verkoopmaand: huur = €-bedrag × inflatie-index (geld van vandaag → nominaal); daarna maandelijks geïndexeerd', () => {
    const { input, proj, verkoopmaand } = runMet(2000)
    expect(verkoopmaand).toBeGreaterThan(0)
    const idx = Math.pow(1 + input.inflatie, verkoopmaand / 12)
    // Absolute tolerantie (€1e-6) past bij een bedrag van ~€2.000: dit is een exacte formule, geen schatting.
    expect(bezRij(proj, verkoopmaand).woning.huurPerMaand).toBeCloseTo(2000 * idx, 6)
    expect(bezRij(proj, verkoopmaand + 1).woning.huurPerMaand).toBeCloseTo(
      2000 * idx * Math.pow(1 + input.inflatie, 1 / 12),
      6,
    )
  })

  it('null → het bestaande %-WOZ-pad (huiswaarde(m−1) × 4% / 12) — byte-identiek aan vóór TPR-03', () => {
    const { input, proj, verkoopmaand } = runMet(null)
    const huisWaardeVorig = bezRij(proj, verkoopmaand - 1).totaalEigenHuis
    expect(huisWaardeVorig).toBeGreaterThan(0)
    expect(bezRij(proj, verkoopmaand).woning.huurPerMaand).toBeCloseTo(
      (huisWaardeVorig * input.woning.huurNaVerkoopPctWozPerJaar) / 12,
      6,
    )
  })

  it('bewuste 0 → geen huur na verkoop', () => {
    const { proj, verkoopmaand } = runMet(0)
    expect(bezRij(proj, verkoopmaand).woning.huurPerMaand).toBe(0)
    expect(bezRij(proj, verkoopmaand + 6).woning.huurPerMaand).toBe(0)
  })
})

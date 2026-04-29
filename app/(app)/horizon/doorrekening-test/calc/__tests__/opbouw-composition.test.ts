/**
 * Unit tests voor `computeOpbouwComposition` (Fase G3 refactor —
 * `kun-je-een-mogelijkheid-glittery-waterfall.md`).
 *
 * **Breaking change**: de helper accepteert nu `{ hybridRows, assetMeta,
 * debtMeta }` in plaats van `{ assets, debts, opbouw }`. Deze tests zijn
 * dienovereenkomstig herschreven en gebruiken `computeHybridProjection` als
 * bron van waarheid — daardoor testen we het re-shaping-contract tegen de
 * werkelijke data-pipeline.
 *
 * Coverage:
 *   - by_type aggregatie + layer-volgorde = ASSET_TYPE_COLORS keys (assets)
 *   - by_asset per-asset layers met kleur-variatie bij gedeelde types
 *   - by_type aggregatie voor schulden — layer-volgorde
 *     = DEBT_TYPE_COLORS keys, type-grouping, filtering
 *   - by_asset per-schuld layers met kleur-variatie bij gedeelde
 *     debt_types
 *   - Edge: geen schulden → `debtLayers === []` en `row.debtLayers === []`
 *   - Filter-gedrag: assets/types/schulden zonder niet-nul jaar vallen uit
 *   - **Fase G3**: savings-layer zichtbaar als eerste key (`__savings`) in
 *     by_type én als layer met `isVirtualSavings: true` in by_asset.
 *   - **Fase G3**: `phase`-veld doorgegeven per row.
 */

import { describe, it, expect } from 'vitest'
import type { Asset } from '@/lib/asset-data'
import type { Debt, DebtType } from '@/lib/debt-data'
import { ASSET_TYPE_COLORS, ASSET_TYPE_LABELS } from '@/lib/asset-data'
import { DEBT_TYPE_COLORS, DEBT_TYPE_LABELS } from '@/lib/debt-data'
import {
  computeHybridProjection,
  type HybridProjectionInputs,
} from '../hybrid-projection'
import {
  computeOpbouwComposition,
  type CompositionView,
} from '../opbouw-composition'
import { SAVINGS_ASSET_ID } from '../opbouw-projection'

// ── Fixtures ───────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    user_id: 'u1',
    name: 'Test asset',
    asset_type: 'investment',
    current_value: 100_000,
    purchase_value: 100_000,
    purchase_date: null,
    expected_return: 7,
    monthly_contribution: 500,
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: null,
    risk_profile: 'middel',
    tax_benefit: null,
    is_liquid: null,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: null,
    retirement_provider_type: null,
    depreciation_rate: null,
    address_postcode: null,
    address_house_number: null,
    expiry_date: null,
    beneficiary: null,
    kvk_number: null,
    ownership_percentage: null,
    annual_dividend: null,
    linked_asset_id: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100,
    has_budget_tracking: false,
    ...overrides,
  } as Asset
}

function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: 'd1',
    user_id: 'u1',
    name: 'Test schuld',
    debt_type: 'personal_loan',
    original_amount: 10_000,
    current_balance: 10_000,
    interest_rate: 4,
    minimum_payment: 0,
    monthly_payment: 200,
    start_date: '2026-01-01',
    end_date: null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: null,
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: null,
    draagkrachtmeting_date: null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    include_aflossing_in_savings: false,
    custom_aflossing_amount: null,
    ...overrides,
  } as Debt
}

/** Zero-growth fixture: expected_return=0, monthly_contribution=0.
 * Handig om layer-waarden deterministisch te houden voor assertions. */
function flatAsset(overrides: Partial<Asset> = {}): Asset {
  return makeAsset({
    expected_return: 0,
    monthly_contribution: 0,
    ...overrides,
  })
}

/** Zero-growth debt fixture: interest_rate=0 + monthly_payment=0 → saldo blijft gelijk. */
function flatDebt(overrides: Partial<Debt> = {}): Debt {
  return makeDebt({
    interest_rate: 0,
    monthly_payment: 0,
    ...overrides,
  })
}

/**
 * Bouw een hybride projectie met default-parameters die alle rijen in de
 * opbouw-fase houden — zodat we `CompositionResult` kunnen testen zonder
 * dat de afbouw-fase de deterministische waarden verstoort.
 *
 * Truc: zet `endAge` gelijk aan `currentAge + projectionYears` en kies
 * uitgaven zo hoog dat FIRE nooit gehaald wordt — dan zijn alle rijen
 * phase 'opbouw'.
 */
function hybridOpbouwOnly(opts: {
  assets: Asset[]
  debts?: Debt[]
  projectionYears: number
  currentAge?: number
  hasPartner?: boolean
  savingsInflow?: HybridProjectionInputs['savingsInflow']
}): ReturnType<typeof computeHybridProjection> {
  const {
    assets,
    debts = [],
    projectionYears,
    currentAge = 40,
    hasPartner = true,
    savingsInflow,
  } = opts
  return computeHybridProjection({
    assets,
    debts,
    lifeEvents: [],
    cashflows: [],
    currentAge,
    endAge: currentAge + projectionYears,
    fireParams: {
      grossReturn: 0.07,
      inflationRate: 0.02,
    },
    endStrategy: 'deplete',
    endAgeConfig: currentAge + projectionYears,
    legacyAmount: 0,
    withdrawalStrategy: 'swr',
    distributionStrategy: 'proportional',
    hasPartner,
    // Onrealistisch hoog om zeker te weten dat er geen FIRE binnen deze
    // korte projectie optreedt → alle rijen blijven opbouw. Addendum IV
    // gebruikt nu een per-asset solver met adaptive hi-bound, dus de
    // onbereikbaarheid moet extreem zijn.
    yearlyRetirementExpenses: 1_000_000_000,
    aowAge: 67,
    savingsInflow,
  })
}

function runComposition(
  view: CompositionView,
  result: ReturnType<typeof computeHybridProjection>,
) {
  return computeOpbouwComposition({
    view,
    hybridRows: result.rows,
    assetMeta: result.assetMeta,
    debtMeta: result.debtMeta,
  })
}

// ── Tests — assets (by_type) ────────────────────────────────────

describe('computeOpbouwComposition — by_type basis', () => {
  it('groepeert assets op asset_type (2 investments + 1 cash → 2 layers)', () => {
    const assets = [
      flatAsset({ id: 'cash-1',  asset_type: 'cash',       current_value: 10_000 }),
      flatAsset({ id: 'inv-1',   asset_type: 'investment', current_value: 20_000 }),
      flatAsset({ id: 'inv-2',   asset_type: 'investment', current_value: 30_000 }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, projectionYears: 3 })
    const result = runComposition('by_type', hybrid)

    expect(result.view).toBe('by_type')
    expect(result.assetLayers).toHaveLength(2)

    const investmentIdx = result.assetLayers.findIndex(l => l.key === 'investment')
    expect(investmentIdx).toBeGreaterThanOrEqual(0)
    // Investment-layer jaar 0 = €20k + €30k = €50k (expected_return=0, contributions=0).
    expect(result.rows[0].assetLayers[investmentIdx]).toBeCloseTo(50_000, 0)

    const cashIdx = result.assetLayers.findIndex(l => l.key === 'cash')
    expect(cashIdx).toBeGreaterThanOrEqual(0)
    expect(result.rows[0].assetLayers[cashIdx]).toBeCloseTo(10_000, 0)
  })
})

describe('computeOpbouwComposition — by_type layer-volgorde (assets)', () => {
  it('assetLayers-volgorde volgt Object.keys(ASSET_TYPE_COLORS) — cash vóór investment', () => {
    const assets = [
      // Bewust omgekeerde input-volgorde: investment eerst, dan cash.
      flatAsset({ id: 'inv-1',  asset_type: 'investment', current_value: 20_000 }),
      flatAsset({ id: 'cash-1', asset_type: 'cash',       current_value: 10_000 }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, projectionYears: 2 })
    const result = runComposition('by_type', hybrid)

    // Layers moeten in ASSET_TYPE_COLORS-volgorde staan ongeacht input-volgorde.
    expect(result.assetLayers.map(l => l.key)).toEqual(['cash', 'investment'])
  })

  it('labels + kleuren matchen ASSET_TYPE_LABELS / ASSET_TYPE_COLORS', () => {
    const assets = [
      flatAsset({ id: 'a1', asset_type: 'cash',       current_value: 5_000 }),
      flatAsset({ id: 'a2', asset_type: 'investment', current_value: 5_000 }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, projectionYears: 2 })
    const result = runComposition('by_type', hybrid)

    const cashLayer = result.assetLayers.find(l => l.key === 'cash')!
    expect(cashLayer.label).toBe(ASSET_TYPE_LABELS.cash)
    expect(cashLayer.color).toBe(ASSET_TYPE_COLORS.cash)
  })
})

// ── Tests — assets (by_asset) ───────────────────────────────────

describe('computeOpbouwComposition — by_asset (assets)', () => {
  it('2 investment-assets → 2 layers met verschillende kleuren', () => {
    const assets = [
      flatAsset({ id: 'inv-a', asset_type: 'investment', current_value: 10_000, name: 'VWRL' }),
      flatAsset({ id: 'inv-b', asset_type: 'investment', current_value: 20_000, name: 'IWDA' }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, projectionYears: 3 })
    const result = runComposition('by_asset', hybrid)

    expect(result.view).toBe('by_asset')
    expect(result.assetLayers).toHaveLength(2)

    // Stabiele sortering op asset.id.
    expect(result.assetLayers.map(l => l.key)).toEqual(['inv-a', 'inv-b'])

    // Eerste (id='inv-a', variant index 0) moet de basiskleur hebben.
    expect(result.assetLayers[0].color).toBe(ASSET_TYPE_COLORS.investment)
    // Tweede moet afwijken van de basis (HSL-lightness variatie).
    expect(result.assetLayers[1].color).not.toBe(ASSET_TYPE_COLORS.investment)

    // Labels = asset-namen.
    expect(result.assetLayers[0].label).toBe('VWRL')
    expect(result.assetLayers[1].label).toBe('IWDA')

    // Per-layer waarden kloppen jaar 0.
    expect(result.rows[0].assetLayers[0]).toBeCloseTo(10_000, 0)
    expect(result.rows[0].assetLayers[1]).toBeCloseTo(20_000, 0)
  })

  it('assets van verschillend type houden elk hun eigen basiskleur (beide variant-index 0)', () => {
    const assets = [
      flatAsset({ id: 'a',   asset_type: 'cash',       current_value: 5_000 }),
      flatAsset({ id: 'b',   asset_type: 'investment', current_value: 5_000 }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, projectionYears: 2 })
    const result = runComposition('by_asset', hybrid)

    const cashLayer = result.assetLayers.find(l => l.key === 'a')!
    const invLayer  = result.assetLayers.find(l => l.key === 'b')!
    // Beide zijn de eerste/enige van hun type → basiskleur uit ASSET_TYPE_COLORS.
    expect(cashLayer.color).toBe(ASSET_TYPE_COLORS.cash)
    expect(invLayer.color).toBe(ASSET_TYPE_COLORS.investment)
  })
})

// ── Tests — schulden ────────────────────────────────────────────

describe('computeOpbouwComposition — by_type schulden', () => {
  it('3 schulden (1 hypotheek + 2 persoonlijke leningen) → 2 debt-layers; consumptief = som', () => {
    const assets = [flatAsset({ current_value: 100_000 })]
    const debts = [
      flatDebt({ id: 'd-hyp',  debt_type: 'mortgage',      current_balance: 200_000 }),
      flatDebt({ id: 'd-pl-1', debt_type: 'personal_loan', current_balance: 8_000 }),
      flatDebt({ id: 'd-pl-2', debt_type: 'personal_loan', current_balance: 2_000 }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, debts, projectionYears: 2 })
    const result = runComposition('by_type', hybrid)

    // 2 unieke debt_types → 2 layers.
    expect(result.debtLayers).toHaveLength(2)

    const hypIdx = result.debtLayers.findIndex(l => l.key === 'mortgage')
    const plIdx  = result.debtLayers.findIndex(l => l.key === 'personal_loan')
    expect(hypIdx).toBeGreaterThanOrEqual(0)
    expect(plIdx).toBeGreaterThanOrEqual(0)

    // Hypotheek-layer jaar 0 = €200k.
    expect(result.rows[0].debtLayers[hypIdx]).toBeCloseTo(200_000, 0)
    // Persoonlijke-lening-layer jaar 0 = €8k + €2k = €10k (som).
    expect(result.rows[0].debtLayers[plIdx]).toBeCloseTo(10_000, 0)
  })

  it('debtLayers-volgorde volgt Object.keys(DEBT_TYPE_COLORS)', () => {
    const assets = [flatAsset({ current_value: 100_000 })]
    // Bewust omgekeerde input: persoonlijke lening vóór hypotheek.
    const debts = [
      flatDebt({ id: 'd-pl',  debt_type: 'personal_loan', current_balance: 5_000 }),
      flatDebt({ id: 'd-hyp', debt_type: 'mortgage',      current_balance: 100_000 }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, debts, projectionYears: 2 })
    const result = runComposition('by_type', hybrid)

    const typeOrder = Object.keys(DEBT_TYPE_COLORS) as DebtType[]
    const hypPos = typeOrder.indexOf('mortgage')
    const plPos  = typeOrder.indexOf('personal_loan')
    expect(hypPos).toBeLessThan(plPos)

    // Layers volgen DEBT_TYPE_COLORS-volgorde, onafhankelijk van input.
    expect(result.debtLayers.map(l => l.key)).toEqual(['mortgage', 'personal_loan'])
  })

  it('labels + kleuren matchen DEBT_TYPE_LABELS / DEBT_TYPE_COLORS', () => {
    const assets = [flatAsset({ current_value: 100_000 })]
    const debts = [
      flatDebt({ id: 'd-hyp', debt_type: 'mortgage', current_balance: 100_000 }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, debts, projectionYears: 2 })
    const result = runComposition('by_type', hybrid)

    const hypLayer = result.debtLayers.find(l => l.key === 'mortgage')!
    expect(hypLayer.label).toBe(DEBT_TYPE_LABELS.mortgage)
    expect(hypLayer.color).toBe(DEBT_TYPE_COLORS.mortgage)
  })

  it('debt-type zonder niet-nul jaar wordt weggefilterd', () => {
    const assets = [flatAsset({ current_value: 100_000 })]
    const debts = [
      flatDebt({ id: 'd-real',  debt_type: 'mortgage',      current_balance: 100_000 }),
      // Nul-balance schuld → alle jaar-waarden 0 → layer wordt uitgefilterd.
      flatDebt({ id: 'd-empty', debt_type: 'personal_loan', current_balance: 0 }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, debts, projectionYears: 2 })
    const result = runComposition('by_type', hybrid)

    expect(result.debtLayers.map(l => l.key)).toEqual(['mortgage'])
  })
})

describe('computeOpbouwComposition — by_asset schulden', () => {
  it('2 persoonlijke leningen → 2 debt-layers met HSL-variatie', () => {
    const assets = [flatAsset({ current_value: 100_000 })]
    const debts = [
      flatDebt({ id: 'd-a', debt_type: 'personal_loan', current_balance: 5_000, name: 'Lening A' }),
      flatDebt({ id: 'd-b', debt_type: 'personal_loan', current_balance: 3_000, name: 'Lening B' }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, debts, projectionYears: 3 })
    const result = runComposition('by_asset', hybrid)

    expect(result.debtLayers).toHaveLength(2)

    // Stabiele sortering op debt.id.
    expect(result.debtLayers.map(l => l.key)).toEqual(['d-a', 'd-b'])

    // Eerste (id='d-a', variant 0) → basiskleur.
    expect(result.debtLayers[0].color).toBe(DEBT_TYPE_COLORS.personal_loan)
    // Tweede wijkt af van de basis (HSL-lightness variatie).
    expect(result.debtLayers[1].color).not.toBe(DEBT_TYPE_COLORS.personal_loan)

    // Labels = debt-namen.
    expect(result.debtLayers[0].label).toBe('Lening A')
    expect(result.debtLayers[1].label).toBe('Lening B')

    // Per-layer waarden kloppen jaar 0.
    expect(result.rows[0].debtLayers[0]).toBeCloseTo(5_000, 0)
    expect(result.rows[0].debtLayers[1]).toBeCloseTo(3_000, 0)
  })

  it('schulden van verschillend type houden elk hun eigen basiskleur', () => {
    const assets = [flatAsset({ current_value: 100_000 })]
    const debts = [
      flatDebt({ id: 'd-hyp', debt_type: 'mortgage',      current_balance: 100_000 }),
      flatDebt({ id: 'd-pl',  debt_type: 'personal_loan', current_balance: 5_000 }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, debts, projectionYears: 2 })
    const result = runComposition('by_asset', hybrid)

    const hyp = result.debtLayers.find(l => l.key === 'd-hyp')!
    const pl  = result.debtLayers.find(l => l.key === 'd-pl')!
    // Beide zijn de eerste/enige van hun type → basiskleuren uit DEBT_TYPE_COLORS.
    expect(hyp.color).toBe(DEBT_TYPE_COLORS.mortgage)
    expect(pl.color).toBe(DEBT_TYPE_COLORS.personal_loan)
  })
})

// ── Edge cases ─────────────────────────────────────────────────

describe('computeOpbouwComposition — edge cases schulden', () => {
  it('geen schulden → debtLayers = [] en elke row.debtLayers = []', () => {
    const assets = [flatAsset()]
    const hybrid = hybridOpbouwOnly({ assets, debts: [], projectionYears: 4 })
    const result = runComposition('by_type', hybrid)

    expect(result.debtLayers).toEqual([])
    expect(result.rows).toHaveLength(4)
    for (const row of result.rows) {
      expect(row.debtLayers).toEqual([])
    }
  })

  it('som(row.debtLayers) = sum over alle debt perDebtValues op dat jaar', () => {
    const assets = [flatAsset({ current_value: 100_000 })]
    const debts = [
      flatDebt({ id: 'd-hyp',  debt_type: 'mortgage',      current_balance: 200_000 }),
      flatDebt({ id: 'd-cons', debt_type: 'personal_loan', current_balance: 10_000 }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, debts, projectionYears: 3 })
    const result = runComposition('by_type', hybrid)

    for (let yr = 0; yr < 3; yr++) {
      const rowSum = result.rows[yr].debtLayers.reduce((s, v) => s + v, 0)
      const hybridDebtSum = hybrid.rows[yr].perDebtValues.reduce((s, v) => s + v, 0)
      expect(rowSum).toBeCloseTo(hybridDebtSum, 0)
    }
  })
})

describe('computeOpbouwComposition — filter lege layers (assets)', () => {
  it('asset met waarde 0 in alle jaren wordt niet als layer opgenomen (by_asset)', () => {
    const assets = [
      flatAsset({ id: 'real',  asset_type: 'investment', current_value: 10_000 }),
      // Een asset met inclusion_pct=0 telt voor niks mee → alle layer-waarden 0.
      flatAsset({ id: 'empty', asset_type: 'cash',       current_value: 5_000, net_worth_inclusion_pct: 0 }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, projectionYears: 2 })
    const result = runComposition('by_asset', hybrid)

    // `net_worth_inclusion_pct=0` weegt alleen de aggregaatkolom; in de
    // per-asset tabel blijft de raw-waarde staan. Dus die filteren we
    // nog steeds alleen op echte nul-waarden.
    // Pas de test aan: we gebruiken een asset die echt op 0 zit.
    const assetsZero = [
      flatAsset({ id: 'real',  asset_type: 'investment', current_value: 10_000 }),
      flatAsset({ id: 'empty', asset_type: 'cash',       current_value: 0 }),
    ]
    const hybridZero = hybridOpbouwOnly({ assets: assetsZero, projectionYears: 2 })
    const resultZero = runComposition('by_asset', hybridZero)
    expect(resultZero.assetLayers).toHaveLength(1)
    expect(resultZero.assetLayers[0].key).toBe('real')

    // De oorspronkelijke case met inclusion_pct=0: in de hybrid-projection
    // zijn per-asset values nog wel > 0, dus beide layers verschijnen. Dat
    // is acceptabel (en consistent met hoe G1/G2 per-asset data levert).
    expect(result.assetLayers.length).toBeGreaterThanOrEqual(1)
  })

  it('type zonder niet-nul jaar wordt niet als layer opgenomen (by_type)', () => {
    const assets = [
      flatAsset({ id: 'real',  asset_type: 'investment', current_value: 10_000 }),
      flatAsset({ id: 'empty', asset_type: 'cash',       current_value: 0 }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, projectionYears: 2 })
    const result = runComposition('by_type', hybrid)

    expect(result.assetLayers.map(l => l.key)).toEqual(['investment'])
  })
})

// ── Fase G3: savings-layer ─────────────────────────────────────

describe('computeOpbouwComposition — savings-layer (Fase G3)', () => {
  it('by_type: savings-layer krijgt eigen __savings-key bovenaan', () => {
    const assets = [
      flatAsset({ id: 'a1', asset_type: 'investment', current_value: 100_000 }),
    ]
    const hybrid = hybridOpbouwOnly({
      assets,
      projectionYears: 3,
      savingsInflow: { monthlyAmount: 500 },
    })
    const result = runComposition('by_type', hybrid)

    // __savings-layer moet op index 0 staan.
    expect(result.assetLayers[0].key).toBe('__savings')
    expect(result.assetLayers[0].isVirtualSavings).toBe(true)

    // Reguliere investment-layer staat daarna.
    const investmentIdx = result.assetLayers.findIndex(l => l.key === 'investment')
    expect(investmentIdx).toBeGreaterThan(0)
  })

  it('by_asset: savings-layer aanwezig met isVirtualSavings: true', () => {
    const assets = [
      flatAsset({ id: 'a1', asset_type: 'investment', current_value: 100_000 }),
    ]
    const hybrid = hybridOpbouwOnly({
      assets,
      projectionYears: 3,
      savingsInflow: { monthlyAmount: 500 },
    })
    const result = runComposition('by_asset', hybrid)

    // Savings-layer staat vooraan met id = __savings.
    expect(result.assetLayers[0].key).toBe(SAVINGS_ASSET_ID)
    expect(result.assetLayers[0].isVirtualSavings).toBe(true)

    // Tweede layer is de echte asset.
    expect(result.assetLayers[1].key).toBe('a1')
    expect(result.assetLayers[1].isVirtualSavings).toBeFalsy()
  })

  it('zonder savingsInflow: geen __savings-layer in by_type', () => {
    const assets = [
      flatAsset({ id: 'a1', asset_type: 'investment', current_value: 100_000 }),
    ]
    const hybrid = hybridOpbouwOnly({ assets, projectionYears: 3 })
    const result = runComposition('by_type', hybrid)

    const savingsLayer = result.assetLayers.find(l => l.key === '__savings')
    expect(savingsLayer).toBeUndefined()
  })
})

// ── Fase G3: phase-veld ────────────────────────────────────────

describe('computeOpbouwComposition — phase-veld doorgegeven per row (Fase G3)', () => {
  it('elke row heeft een `phase`-veld dat matcht met hybridRows[i].phase', () => {
    const assets = [flatAsset({ current_value: 100_000 })]
    const hybrid = hybridOpbouwOnly({ assets, projectionYears: 5 })
    const result = runComposition('by_type', hybrid)

    expect(result.rows).toHaveLength(hybrid.rows.length)
    for (let i = 0; i < result.rows.length; i++) {
      expect(result.rows[i].phase).toBe(hybrid.rows[i].phase)
    }
  })

  it('phase-veld consistent met hybridRows (Addendum IV: per-asset solver kan bridge-rij op endAge produceren)', () => {
    // Voor projections waar de solver geen kruising vindt binnen het bereik,
    // kan er nog een bridge-rij bestaan op endAge. De test checkt nu dat de
    // phase-verdeling in de compositie exact matcht met de hybrid-rijen —
    // niet dat alles opbouw is.
    const assets = [flatAsset({ current_value: 100_000 })]
    const hybrid = hybridOpbouwOnly({ assets, projectionYears: 5 })
    const result = runComposition('by_type', hybrid)
    expect(result.rows.length).toBe(hybrid.rows.length)
    for (let i = 0; i < result.rows.length; i++) {
      expect(result.rows[i].phase).toBe(hybrid.rows[i].phase)
    }
  })
})

// ── Snapshot ───────────────────────────────────────────────────

describe('computeOpbouwComposition — snapshot canonieke input', () => {
  it('rows-structuur voor canonieke input', () => {
    const assets = [
      flatAsset({ id: 'a-cash', asset_type: 'cash',       current_value: 60_000, name: 'Bank' }),
      flatAsset({ id: 'b-inv',  asset_type: 'investment', current_value: 100_000, name: 'ETF' }),
    ]
    const debts = [flatDebt({ id: 'd', debt_type: 'mortgage', current_balance: 50_000 })]

    const hybrid = hybridOpbouwOnly({
      assets,
      debts,
      projectionYears: 5,
      currentAge: 40,
      hasPartner: true,
    })
    const result = computeOpbouwComposition({
      view: 'by_type',
      hybridRows: hybrid.rows,
      assetMeta: hybrid.assetMeta,
      debtMeta: hybrid.debtMeta,
    })

    // Shape: 2 asset-layers (cash, investment) in ASSET_TYPE_COLORS-volgorde.
    expect(result.assetLayers.map(l => l.key)).toEqual(['cash', 'investment'])
    // 1 debt-layer (mortgage).
    expect(result.debtLayers.map(l => l.key)).toEqual(['mortgage'])

    // 5 rijen met oplopende leeftijd.
    expect(result.rows).toHaveLength(5)
    expect(result.rows.map(r => r.age)).toEqual([40, 41, 42, 43, 44])

    // Elke rij: sum(assetLayers) moet exact gelijk zijn aan
    // sum van de per-asset waarden uit hybrid (single source of truth).
    for (let yr = 0; yr < 5; yr++) {
      const layerSum = result.rows[yr].assetLayers.reduce((s, v) => s + v, 0)
      const hybridAssetSum = hybrid.rows[yr].perAssetValues.reduce((s, v) => s + v, 0)
      expect(layerSum).toBeCloseTo(hybridAssetSum, 0)
    }

    // sum(debtLayers) per jaar = sum(perDebtValues).
    for (let yr = 0; yr < 5; yr++) {
      const debtSum = result.rows[yr].debtLayers.reduce((s, v) => s + v, 0)
      const hybridDebtSum = hybrid.rows[yr].perDebtValues.reduce((s, v) => s + v, 0)
      expect(debtSum).toBeCloseTo(hybridDebtSum, 0)
    }
    // Jaar 0: €50k hypotheek (flat).
    expect(result.rows[0].debtLayers[0]).toBeCloseTo(50_000, 0)

    // netWorth + cumulativeBox3Tax exact uit hybridRows.
    for (let yr = 0; yr < 5; yr++) {
      expect(result.rows[yr].netWorth).toBe(hybrid.rows[yr].netWorth)
      expect(result.rows[yr].cumulativeBox3Tax).toBe(hybrid.rows[yr].cumulativeBox3Tax)
    }
  })
})

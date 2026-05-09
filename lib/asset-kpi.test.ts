/**
 * Unit tests voor `lib/asset-kpi.ts` en `lib/debt-kpi.ts` + de
 * categorie-aggregaten in `lib/category-kpi.ts`.
 *
 * Doel: bevestigen dat de pure KPI-functies de juiste KpiValue-paren
 * teruggeven voor representatieve types (cash, investment met holdings,
 * real_estate, eigen_huis), én dat lege of incomplete data niet crasht
 * maar netjes met `undefined`-slots wordt afgehandeld.
 */

import { describe, it, expect } from 'vitest'
import { computeAssetKpi } from './asset-kpi'
import { computeDebtKpi } from './debt-kpi'
import {
  computeAssetCategoryKpis,
  computeDebtCategoryKpis,
} from './category-kpi'
import type { Asset } from './asset-data'
import type { Debt } from './debt-data'

// ── Test-fixture builders ─────────────────────────────────────

function makeAsset(overrides: Partial<Asset>): Asset {
  // Minimal valid Asset shape — ongebruikte velden vullen we met defaults
  // zodat de test alleen de KPI-relevante velden hoeft te declareren.
  return {
    id: 'a-1',
    user_id: 'u-1',
    name: 'Test Asset',
    asset_type: 'cash',
    current_value: 0,
    purchase_value: 0,
    purchase_date: null,
    expected_return: 0,
    monthly_contribution: 0,
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    subtype: null,
    risk_profile: null,
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
    has_woonbalans_tracking: false,
    has_rental_tracking: false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
    vacancy_log: [],
    ...overrides,
  }
}

function makeDebt(overrides: Partial<Debt>): Debt {
  return {
    id: 'd-1',
    user_id: 'u-1',
    name: 'Test Debt',
    debt_type: 'personal_loan',
    original_amount: 10000,
    current_balance: 5000,
    interest_rate: 0,
    minimum_payment: 0,
    monthly_payment: 0,
    start_date: '2024-01-01',
    end_date: null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
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
    has_hypotheekplanner_tracking: false,
    ...overrides,
  }
}

// ── Asset KPI ──────────────────────────────────────────────────

describe('computeAssetKpi', () => {
  it('cash zonder bank-koppeling: rente-fallback', () => {
    const asset = makeAsset({ asset_type: 'cash', expected_return: 1.8 })
    const result = computeAssetKpi(asset)
    expect(result.primary?.value).toBe('1,8%')
    expect(result.primary?.label).toBe('rente')
    expect(result.secondary).toBeUndefined()
  })

  it('cash (transaction): laatste tx + maandmutatie', () => {
    const asset = makeAsset({ id: 'cash-1', asset_type: 'cash', expected_return: 0 })
    const cashStats = new Map<string, import('./kpi-context').CashAssetStats>([
      [
        'cash-1',
        {
          kind: 'transaction',
          lastDate: '2026-04-28',
          monthlyChangeEur: 1500,
          biggestExpenseEur: 200,
          biggestExpenseLabel: 'Albert Heijn',
        },
      ],
    ])
    const result = computeAssetKpi(asset, {
      cashStatsByAssetId: cashStats,
      now: new Date('2026-05-02'),
    })
    expect(result.primary?.value).toBe('4 dgn')
    expect(result.primary?.label).toBe('geleden')
    expect(result.secondary?.value).toContain('+')
    expect(result.secondary?.label).toBe('deze maand')
    expect(result.secondary?.tone).toBe('pos')
  })

  it('cash (revaluation): laatste herwaardering + maandmutatie', () => {
    const asset = makeAsset({ id: 'cash-r', asset_type: 'cash' })
    const cashStats = new Map<string, import('./kpi-context').CashAssetStats>([
      [
        'cash-r',
        {
          kind: 'revaluation',
          lastDate: '2026-04-25',
          monthlyChangeEur: 250,
        },
      ],
    ])
    const result = computeAssetKpi(asset, {
      cashStatsByAssetId: cashStats,
      now: new Date('2026-05-02'),
    })
    expect(result.primary?.value).toBe('7 dgn')
    expect(result.primary?.label).toBe('herwaardeerd')
    expect(result.secondary?.value).toContain('+')
    expect(result.secondary?.label).toBe('deze maand')
  })

  it('cash met negatieve maandmutatie: secondary tone is neg', () => {
    const asset = makeAsset({ id: 'cash-2', asset_type: 'cash' })
    const cashStats = new Map<string, import('./kpi-context').CashAssetStats>([
      [
        'cash-2',
        {
          kind: 'transaction',
          lastDate: '2026-05-01',
          monthlyChangeEur: -250,
          biggestExpenseEur: 250,
        },
      ],
    ])
    const result = computeAssetKpi(asset, {
      cashStatsByAssetId: cashStats,
      now: new Date('2026-05-02'),
    })
    expect(result.primary?.value).toBe('1 dag')
    expect(result.secondary?.tone).toBe('neg')
  })

  it('cash transaction inactief (>14 dagen): primary tone is neg', () => {
    const asset = makeAsset({ id: 'cash-3', asset_type: 'cash' })
    const cashStats = new Map<string, import('./kpi-context').CashAssetStats>([
      [
        'cash-3',
        {
          kind: 'transaction',
          lastDate: '2026-04-01',
          monthlyChangeEur: 0,
          biggestExpenseEur: 0,
        },
      ],
    ])
    const result = computeAssetKpi(asset, {
      cashStatsByAssetId: cashStats,
      now: new Date('2026-05-02'),
    })
    expect(result.primary?.tone).toBe('neg') // 31 dagen geleden
  })

  it('cash revaluation 30 dagen oud: primary tone is nog neutraal', () => {
    const asset = makeAsset({ id: 'cash-rev', asset_type: 'cash' })
    const cashStats = new Map<string, import('./kpi-context').CashAssetStats>([
      [
        'cash-rev',
        {
          kind: 'revaluation',
          lastDate: '2026-04-02',
          monthlyChangeEur: 0,
        },
      ],
    ])
    const result = computeAssetKpi(asset, {
      cashStatsByAssetId: cashStats,
      now: new Date('2026-05-02'),
    })
    expect(result.primary?.tone).toBe('neutral') // 30 dgn binnen revaluation drempel
  })

  it('investment met holdings: dagverandering + total return', () => {
    const asset = makeAsset({
      id: 'inv-1',
      asset_type: 'investment',
      current_value: 11000,
      purchase_value: 10000,
    })
    const holdings = [
      {
        asset_id: 'inv-1',
        units: 100,
        current_price: 110,
        avg_purchase_price: 100,
        daily_change_percent: 1,
      },
    ]
    const result = computeAssetKpi(asset, {
      holdingsByAssetId: new Map([['inv-1', holdings]]),
    })
    expect(result.primary?.label).toBe('vandaag')
    expect(result.primary?.tone).toBe('pos')
    expect(result.secondary?.label).toBe('totaal')
    expect(result.secondary?.value).toBe('+10,0%')
  })

  it('investment zonder holdings: fallback op purchase vs current', () => {
    const asset = makeAsset({
      asset_type: 'investment',
      current_value: 12000,
      purchase_value: 10000,
      expected_return: 7,
    })
    const result = computeAssetKpi(asset)
    expect(result.primary?.value).toBe('+20,0%')
    expect(result.primary?.tone).toBe('pos')
    expect(result.secondary?.value).toBe('7,0%')
  })

  it('real_estate: bruto huurrendement + bezetting', () => {
    const asset = makeAsset({
      asset_type: 'real_estate',
      current_value: 300000,
      rental_income: 1500, // €1500/mnd → €18000/jr → 6%
      vacancy_log: [
        { month: '2025-01', occupied: true },
        { month: '2025-02', occupied: true },
        { month: '2025-03', occupied: false },
        { month: '2025-04', occupied: true },
      ],
    })
    const result = computeAssetKpi(asset)
    expect(result.primary?.value).toBe('6,0%')
    expect(result.primary?.label).toBe('rendement')
    expect(result.secondary?.value).toBe('75%')
    expect(result.secondary?.label).toBe('bezet')
  })

  it('eigen_huis met gekoppelde hypotheek: WOZ-Δ + overwaarde', () => {
    const asset = makeAsset({
      id: 'huis-1',
      asset_type: 'eigen_huis',
      current_value: 450000,
      woz_value: 400000,
    })
    const result = computeAssetKpi(asset, {
      linkedDebtBalanceByAssetId: new Map([['huis-1', 200000]]),
    })
    expect(result.primary?.value).toBe('+13%')
    expect(result.primary?.label).toBe('boven WOZ')
    expect(result.secondary?.label).toBe('overwaarde')
  })

  it('eigen_huis zonder hypotheek: alleen WOZ-Δ', () => {
    const asset = makeAsset({
      asset_type: 'eigen_huis',
      current_value: 450000,
      woz_value: 400000,
    })
    const result = computeAssetKpi(asset)
    expect(result.primary).toBeDefined()
    expect(result.secondary).toBeUndefined()
  })

  it('vehicle: jaarlijks waardeverlies + restwaarde', () => {
    const asset = makeAsset({
      asset_type: 'vehicle',
      current_value: 15000,
      purchase_value: 30000,
      depreciation_rate: 10,
    })
    const result = computeAssetKpi(asset)
    expect(result.primary?.value).toContain('€')
    expect(result.primary?.tone).toBe('neg')
    expect(result.secondary?.value).toBe('50%')
  })

  it('other type: lege KpiPair', () => {
    const asset = makeAsset({ asset_type: 'other' })
    const result = computeAssetKpi(asset)
    expect(result.primary).toBeUndefined()
    expect(result.secondary).toBeUndefined()
  })
})

// ── Debt KPI ───────────────────────────────────────────────────

describe('computeDebtKpi', () => {
  it('mortgage met linked asset: LTV + resterende looptijd', () => {
    const debt = makeDebt({
      id: 'm-1',
      debt_type: 'mortgage',
      current_balance: 200000,
      interest_rate: 3.5,
      monthly_payment: 1000,
      end_date: '2050-01-01',
    })
    const result = computeDebtKpi(debt, {
      linkedAssetValueByDebtId: new Map([['m-1', 400000]]),
      now: new Date('2026-05-01'),
    })
    expect(result.primary?.value).toBe('50%')
    expect(result.primary?.label).toBe('LTV')
    expect(result.secondary?.label).toBe('resterend')
  })

  it('mortgage zonder linked asset: alleen looptijd', () => {
    const debt = makeDebt({
      debt_type: 'mortgage',
      current_balance: 200000,
      end_date: '2050-01-01',
    })
    const result = computeDebtKpi(debt, { now: new Date('2026-05-01') })
    expect(result.primary).toBeUndefined()
    expect(result.secondary?.label).toBe('resterend')
  })

  it('credit_card: utilization tone reageert op drempels', () => {
    const debt = makeDebt({
      debt_type: 'credit_card',
      current_balance: 200,
      credit_limit: 1000,
      interest_rate: 14.9,
    })
    const result = computeDebtKpi(debt)
    expect(result.primary?.value).toBe('20%')
    expect(result.primary?.tone).toBe('pos') // <30%
    expect(result.secondary?.value).toBe('14,9%')
  })

  it('credit_card hoge utilization: tone wordt neg', () => {
    const debt = makeDebt({
      debt_type: 'credit_card',
      current_balance: 800,
      credit_limit: 1000,
    })
    const result = computeDebtKpi(debt)
    expect(result.primary?.tone).toBe('neg') // >70%
  })

  it('belastingschuld: jaar + regeling-status', () => {
    const debt = makeDebt({
      debt_type: 'belastingschuld',
      tax_year: 2025,
      has_payment_plan: true,
    })
    const result = computeDebtKpi(debt)
    expect(result.primary?.value).toBe('2025')
    expect(result.secondary?.value).toBe('Regeling')
    expect(result.secondary?.tone).toBe('pos')
  })

  it('familielening zonder rente: alleen schriftelijk-status', () => {
    const debt = makeDebt({
      debt_type: 'familielening',
      has_written_agreement: true,
      interest_rate: 0,
    })
    const result = computeDebtKpi(debt)
    expect(result.primary?.value).toBe('Schriftelijk')
    expect(result.primary?.tone).toBe('pos')
    expect(result.secondary).toBeUndefined()
  })
})

// ── Categorie-aggregaten ───────────────────────────────────────

describe('computeAssetCategoryKpis', () => {
  it('cash zonder cashStats: gewogen gemiddelde rente fallback', () => {
    const a1 = makeAsset({ id: '1', asset_type: 'cash', current_value: 1000, expected_return: 0 })
    const a2 = makeAsset({ id: '2', asset_type: 'cash', current_value: 9000, expected_return: 3 })
    // Gewogen gemiddelde: (0*1000 + 3*9000) / 10000 = 2.7
    const result = computeAssetCategoryKpis([a1, a2], 'cash')
    expect(result.primary?.value).toBe('2,7%')
  })

  it('cash met cashStats: totaal mutatie + hoogste uitgave', () => {
    const a1 = makeAsset({ id: 'c1', asset_type: 'cash' })
    const a2 = makeAsset({ id: 'c2', asset_type: 'cash' })
    const cashStats = new Map<string, import('./kpi-context').CashAssetStats>([
      ['c1', { kind: 'transaction', lastDate: '2026-05-01', monthlyChangeEur: 1200, biggestExpenseEur: 150 }],
      ['c2', { kind: 'transaction', lastDate: '2026-05-01', monthlyChangeEur: -300, biggestExpenseEur: 425, biggestExpenseLabel: 'Coolblue' }],
    ])
    const result = computeAssetCategoryKpis([a1, a2], 'cash', { cashStatsByAssetId: cashStats })
    // Totaal: 1200 + -300 = 900 → positief
    expect(result.primary?.tone).toBe('pos')
    expect(result.primary?.label).toBe('deze maand')
    // Hoogste uitgave: 425 (Coolblue) > 150
    expect(result.secondary?.tone).toBe('neg')
    expect(result.secondary?.label).toContain('Coolblue')
  })

  it('cash mix transaction+revaluation: maandtotaal sommeert beide, biggestExpense alleen uit transactie', () => {
    const a1 = makeAsset({ id: 'mix-1', asset_type: 'cash' })
    const a2 = makeAsset({ id: 'mix-2', asset_type: 'cash' })
    const cashStats = new Map<string, import('./kpi-context').CashAssetStats>([
      ['mix-1', { kind: 'transaction', lastDate: '2026-05-01', monthlyChangeEur: 500, biggestExpenseEur: 100, biggestExpenseLabel: 'AH' }],
      ['mix-2', { kind: 'revaluation', lastDate: '2026-05-01', monthlyChangeEur: 200 }],
    ])
    const result = computeAssetCategoryKpis([a1, a2], 'cash', { cashStatsByAssetId: cashStats })
    // 500 + 200 = 700 (beide types tellen mee in totaal)
    expect(result.primary?.tone).toBe('pos')
    // Hoogste uitgave: alleen 'AH' (revaluation heeft geen biggestExpense)
    expect(result.secondary?.label).toContain('AH')
  })

  it('eigen_huis: som overwaarde over twee huizen', () => {
    const a1 = makeAsset({ id: 'h1', asset_type: 'eigen_huis', current_value: 400000, woz_value: 350000 })
    const a2 = makeAsset({ id: 'h2', asset_type: 'eigen_huis', current_value: 200000, woz_value: 200000 })
    const result = computeAssetCategoryKpis([a1, a2], 'eigen_huis', {
      linkedDebtBalanceByAssetId: new Map([
        ['h1', 200000],
        ['h2', 100000],
      ]),
    })
    // Som overwaarde: (400000-200000) + (200000-100000) = 300000
    expect(result.secondary?.label).toBe('overwaarde')
    expect(result.secondary?.value).toContain('300')
  })

  it('lege array: lege KpiPair', () => {
    const result = computeAssetCategoryKpis([], 'cash')
    expect(result.primary).toBeUndefined()
    expect(result.secondary).toBeUndefined()
  })
})

describe('computeDebtCategoryKpis', () => {
  it('mortgage: gewogen gemiddelde LTV', () => {
    const d1 = makeDebt({
      id: 'm1',
      debt_type: 'mortgage',
      current_balance: 100000,
      end_date: '2050-01-01',
    })
    const d2 = makeDebt({
      id: 'm2',
      debt_type: 'mortgage',
      current_balance: 200000,
      end_date: '2050-01-01',
    })
    const result = computeDebtCategoryKpis([d1, d2], 'mortgage', {
      linkedAssetValueByDebtId: new Map([
        ['m1', 200000], // LTV 50%
        ['m2', 250000], // LTV 80%
      ]),
      now: new Date('2026-05-01'),
    })
    // Gewogen LTV op balance: (50*100000 + 80*200000) / 300000 = 70%
    expect(result.primary?.value).toBe('70%')
    expect(result.primary?.label).toBe('LTV')
  })

  it('credit_card: gewogen gemiddelde benutting', () => {
    const d1 = makeDebt({ debt_type: 'credit_card', current_balance: 100, credit_limit: 1000 })
    const d2 = makeDebt({ debt_type: 'credit_card', current_balance: 500, credit_limit: 1000 })
    const result = computeDebtCategoryKpis([d1, d2], 'credit_card')
    // Gewogen op limit: (10*1000 + 50*1000) / 2000 = 30%
    expect(result.primary?.value).toBe('30%')
  })

  it('belastingschuld: count + ratio met regelingen', () => {
    const debts = [
      makeDebt({ debt_type: 'belastingschuld', has_payment_plan: true }),
      makeDebt({ debt_type: 'belastingschuld', has_payment_plan: false }),
      makeDebt({ debt_type: 'belastingschuld', has_payment_plan: false }),
    ]
    const result = computeDebtCategoryKpis(debts, 'belastingschuld')
    expect(result.primary?.value).toBe('3')
    expect(result.primary?.label).toBe('aanslagen')
    expect(result.secondary?.value).toContain('1 met regeling')
  })
})

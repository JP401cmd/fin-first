/**
 * Unit-tests voor lib/housing-strategy.ts.
 *
 * Dekt: parseHousingStrategy (fallback-paden), deriveHousingContext,
 * resolveTriggerAge (beide trigger-modes), applyHousingStrategy (vier
 * modes), estimators en getFireEligibleNetWorth.
 */
import { describe, it, expect } from 'vitest'
import {
  parseHousingStrategy,
  deriveHousingContext,
  applyHousingStrategy,
  resolveTriggerAge,
  estimateMonthlyHousingCostAfterSale,
  estimateReverseMortgagePayout,
  getFireEligibleNetWorth,
  filterAssetsForFire,
  DEFAULT_HOUSING_STRATEGY,
  type HousingContext,
} from '@/lib/housing-strategy'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

// ── Fixtures ─────────────────────────────────────────────────

function makeEigenHuis(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-eigen-huis-1',
    user_id: 'user-1',
    name: 'Eigen woning',
    asset_type: 'eigen_huis',
    current_value: 500_000,
    purchase_value: 350_000,
    purchase_date: '2015-01-01',
    expected_return: 2.5,
    monthly_contribution: 0,
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: null,
    risk_profile: null,
    tax_benefit: null,
    is_liquid: false,
    lock_end_date: null,
    ticker_symbol: null,
    rental_income: null,
    woz_value: 480_000,
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
  } as Asset
}

function makeMortgage(linkedAssetId: string, overrides: Partial<Debt> = {}): Debt {
  return {
    id: 'debt-mortgage-1',
    user_id: 'user-1',
    name: 'Hypotheek',
    debt_type: 'mortgage',
    original_amount: 300_000,
    current_balance: 250_000,
    interest_rate: 3.5,
    minimum_payment: 1200,
    monthly_payment: 1500,
    start_date: '2015-01-01',
    end_date: '2045-01-01',
    creditor: 'ING',
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    subtype: 'annuiteit',
    is_tax_deductible: true,
    fixed_rate_end_date: null,
    nhg: false,
    linked_asset_id: linkedAssetId,
    credit_limit: null,
    repayment_type: 'annuiteit',
    draagkrachtmeting_date: null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    include_aflossing_in_savings: true,
    custom_aflossing_amount: null,
    has_hypotheekplanner_tracking: false,
    ...overrides,
  } as Debt
}

// ── parseHousingStrategy ─────────────────────────────────────

describe('parseHousingStrategy', () => {
  it('valt terug op include_full bij null/undefined/non-object', () => {
    expect(parseHousingStrategy(null)).toEqual(DEFAULT_HOUSING_STRATEGY)
    expect(parseHousingStrategy(undefined)).toEqual(DEFAULT_HOUSING_STRATEGY)
    expect(parseHousingStrategy('garbage')).toEqual(DEFAULT_HOUSING_STRATEGY)
    expect(parseHousingStrategy(42)).toEqual(DEFAULT_HOUSING_STRATEGY)
  })

  it('valt terug op include_full bij onbekende mode', () => {
    expect(parseHousingStrategy({ mode: 'unknown_strategy' })).toEqual(DEFAULT_HOUSING_STRATEGY)
  })

  it('parseert include_full + exclude_from_fire correct', () => {
    expect(parseHousingStrategy({ mode: 'include_full' })).toEqual({ mode: 'include_full' })
    expect(parseHousingStrategy({ mode: 'exclude_from_fire' })).toEqual({
      mode: 'exclude_from_fire',
    })
  })

  it('parseert downsize met defaults voor ontbrekende velden', () => {
    const result = parseHousingStrategy({ mode: 'downsize' })
    expect(result).toMatchObject({
      mode: 'downsize',
      trigger: 'fixed_age',
      triggerAge: 67,
      salePricePct: 1.0,
      salesCostsPct: 0.04,
      newMonthlyHousingCost: null,
    })
  })

  it('parseert downsize met expliciete waarden', () => {
    const result = parseHousingStrategy({
      mode: 'downsize',
      trigger: 'on_depletion',
      triggerAge: 75,
      depletionThresholdYears: 3,
      salePricePct: 0.95,
      salesCostsPct: 0.05,
      newMonthlyHousingCost: 1800,
    })
    expect(result).toEqual({
      mode: 'downsize',
      trigger: 'on_depletion',
      triggerAge: 75,
      depletionThresholdYears: 3,
      salePricePct: 0.95,
      salesCostsPct: 0.05,
      newMonthlyHousingCost: 1800,
    })
  })

  it('parseert reverse_mortgage met defaults', () => {
    const result = parseHousingStrategy({ mode: 'reverse_mortgage' })
    expect(result).toMatchObject({
      mode: 'reverse_mortgage',
      trigger: 'fixed_age',
      triggerAge: 67,
      maxLoanPct: 0.5,
      interestRate: 0.055,
      monthlyPayout: null,
    })
  })

  it('ongeldige trigger valt terug op fixed_age', () => {
    const r = parseHousingStrategy({ mode: 'downsize', trigger: 'random' })
    expect(r.mode === 'downsize' && r.trigger).toBe('fixed_age')
  })
})

// ── deriveHousingContext ─────────────────────────────────────

describe('deriveHousingContext', () => {
  it('retourneert hasEigenHuis=false bij ontbrekende eigen woning', () => {
    const ctx = deriveHousingContext([], [])
    expect(ctx).toEqual({
      eigenHuisValue: 0,
      wozValue: 0,
      mortgageBalance: 0,
      mortgageMonthlyPayment: 0,
      hasEigenHuis: false,
    })
  })

  it('aggregeert eigen_huis + linked mortgage correct', () => {
    const huis = makeEigenHuis()
    const hypotheek = makeMortgage(huis.id)
    const ctx = deriveHousingContext([huis], [hypotheek])
    expect(ctx.hasEigenHuis).toBe(true)
    expect(ctx.eigenHuisValue).toBe(500_000)
    expect(ctx.wozValue).toBe(480_000)
    expect(ctx.mortgageBalance).toBe(250_000)
    expect(ctx.mortgageMonthlyPayment).toBe(1500)
  })

  it('past net_worth_inclusion_pct toe', () => {
    const huis = makeEigenHuis({ net_worth_inclusion_pct: 50 })
    const ctx = deriveHousingContext([huis], [])
    expect(ctx.eigenHuisValue).toBe(250_000)
  })

  it('valt terug op current_value als woz_value ontbreekt', () => {
    const huis = makeEigenHuis({ woz_value: null })
    const ctx = deriveHousingContext([huis], [])
    expect(ctx.wozValue).toBe(500_000)
  })

  it('negeert non-mortgage debts en mortgages zonder linked_asset_id', () => {
    const huis = makeEigenHuis()
    const niet_linked = makeMortgage(null as unknown as string, { current_balance: 100_000 })
    const auto_loan = makeMortgage(huis.id, { id: 'd-2', debt_type: 'car_loan', current_balance: 20_000 })
    const ctx = deriveHousingContext([huis], [niet_linked, auto_loan])
    expect(ctx.mortgageBalance).toBe(0)
  })
})

// ── resolveTriggerAge ────────────────────────────────────────

describe('resolveTriggerAge', () => {
  it('fixed_age retourneert direct triggerAge (geclamped naar currentAge)', () => {
    expect(resolveTriggerAge('fixed_age', 67, 2, 45, 30_000, 200_000)).toBe(67)
    expect(resolveTriggerAge('fixed_age', 40, 2, 50, 30_000, 200_000)).toBe(50)
  })

  it('on_depletion: trigger op currentAge bij liquide reeds onder threshold', () => {
    expect(resolveTriggerAge('on_depletion', 80, 2, 45, 30_000, 40_000)).toBe(45)
  })

  it('on_depletion: berekent jaren tot threshold lineair', () => {
    // liquide 250K, threshold 2 × 30K = 60K → 190K boven threshold → 6.33 jaar
    // currentAge + 6 = 51
    expect(resolveTriggerAge('on_depletion', 80, 2, 45, 30_000, 250_000)).toBe(51)
  })

  it('on_depletion respecteert fallback triggerAge als bovengrens', () => {
    // Veel liquide → naive berekening zegt trigger pas op 100, maar fallback 75
    expect(resolveTriggerAge('on_depletion', 75, 2, 45, 30_000, 5_000_000)).toBe(75)
  })

  it('on_depletion valt terug op fixed_age bij yearlyExpenses ≤ 0', () => {
    expect(resolveTriggerAge('on_depletion', 70, 2, 45, 0, 100_000)).toBe(70)
  })
})

// ── estimators ───────────────────────────────────────────────

describe('estimateMonthlyHousingCostAfterSale', () => {
  it('400K WOZ levert ongeveer 1333 €/mnd', () => {
    expect(estimateMonthlyHousingCostAfterSale(400_000)).toBe(1333)
  })

  it('retourneert 0 bij ongeldige input', () => {
    expect(estimateMonthlyHousingCostAfterSale(0)).toBe(0)
    expect(estimateMonthlyHousingCostAfterSale(-1)).toBe(0)
    expect(estimateMonthlyHousingCostAfterSale(Number.NaN)).toBe(0)
  })
})

describe('estimateReverseMortgagePayout', () => {
  it('lineaire verdeling van max-leensom over jaren', () => {
    // 300K equity × 50% / 20 jaar / 12 = 625 €/mnd
    expect(estimateReverseMortgagePayout(300_000, 0.5, 20)).toBe(625)
  })

  it('retourneert 0 bij geen equity', () => {
    expect(estimateReverseMortgagePayout(0, 0.5, 20)).toBe(0)
  })

  it('clamp remainingYears naar minimaal 1', () => {
    expect(estimateReverseMortgagePayout(120_000, 0.5, 0)).toBeGreaterThan(0)
  })
})

// ── applyHousingStrategy ─────────────────────────────────────

const standardContext: HousingContext = {
  eigenHuisValue: 500_000,
  wozValue: 480_000,
  mortgageBalance: 250_000,
  mortgageMonthlyPayment: 1500,
  hasEigenHuis: true,
}

const baseInput = {
  currentAge: 45,
  endAge: 90,
  yearlyExpenses: 30_000,
  currentLiquidPortfolio: 200_000,
}

describe('applyHousingStrategy', () => {
  it('no-op bij gebruikers zonder eigen woning', () => {
    const r = applyHousingStrategy({
      ...baseInput,
      config: { mode: 'exclude_from_fire' },
      context: { ...standardContext, hasEigenHuis: false, eigenHuisValue: 0 },
    })
    expect(r.initialPortfolioDelta).toBe(0)
    expect(r.cashflows).toHaveLength(0)
  })

  it('include_full: geen wijziging', () => {
    const r = applyHousingStrategy({
      ...baseInput,
      config: { mode: 'include_full' },
      context: standardContext,
    })
    expect(r).toEqual({
      initialPortfolioDelta: 0,
      cashflows: [],
      resolvedTriggerAge: null,
      shadowDebtAtEndAge: 0,
    })
  })

  it('exclude_from_fire: verwijder equity (= 250K) uit FIRE-pot', () => {
    const r = applyHousingStrategy({
      ...baseInput,
      config: { mode: 'exclude_from_fire' },
      context: standardContext,
    })
    expect(r.initialPortfolioDelta).toBe(-250_000)
    expect(r.cashflows).toHaveLength(0)
    expect(r.resolvedTriggerAge).toBeNull()
  })

  it('downsize fixed_age: verkoopopbrengst + bespaarde mortgage + nieuwe huur', () => {
    const r = applyHousingStrategy({
      ...baseInput,
      config: {
        mode: 'downsize',
        trigger: 'fixed_age',
        triggerAge: 65,
        depletionThresholdYears: 2,
        salePricePct: 1.0,
        salesCostsPct: 0.04,
        newMonthlyHousingCost: null,
      },
      context: standardContext,
    })
    expect(r.initialPortfolioDelta).toBe(-250_000) // -equity
    expect(r.resolvedTriggerAge).toBe(65)
    expect(r.cashflows).toHaveLength(3)

    const sale = r.cashflows.find((c) => c.id === 'housing-strategy-downsize-sale')!
    // 480K × 1.0 × 0.96 - 250K = 210_800
    expect(sale.type).toBe('one_time')
    expect(sale.direction).toBe('income')
    expect(sale.amount).toBeCloseTo(210_800)
    expect(sale.fromAge).toBe(65)

    const saved = r.cashflows.find((c) => c.id === 'housing-strategy-downsize-mortgage-saved')!
    expect(saved.type).toBe('recurring')
    expect(saved.direction).toBe('income')
    expect(saved.amount).toBe(1500)
    expect(saved.fromAge).toBe(65)

    const rent = r.cashflows.find((c) => c.id === 'housing-strategy-downsize-new-rent')!
    expect(rent.type).toBe('recurring')
    expect(rent.direction).toBe('expense')
    expect(rent.amount).toBe(1600) // 480K × 4% / 12
    expect(rent.indexed).toBe(true)
  })

  it('downsize honoreert custom newMonthlyHousingCost', () => {
    const r = applyHousingStrategy({
      ...baseInput,
      config: {
        mode: 'downsize',
        trigger: 'fixed_age',
        triggerAge: 65,
        depletionThresholdYears: 2,
        salePricePct: 1.0,
        salesCostsPct: 0.04,
        newMonthlyHousingCost: 2000,
      },
      context: standardContext,
    })
    const rent = r.cashflows.find((c) => c.id === 'housing-strategy-downsize-new-rent')!
    expect(rent.amount).toBe(2000)
  })

  it('reverse_mortgage: enkel recurring uitkering + schaduw-schuld bij endAge', () => {
    const r = applyHousingStrategy({
      ...baseInput,
      config: {
        mode: 'reverse_mortgage',
        trigger: 'fixed_age',
        triggerAge: 67,
        depletionThresholdYears: 2,
        maxLoanPct: 0.5,
        interestRate: 0.055,
        monthlyPayout: null,
      },
      context: standardContext,
    })
    expect(r.initialPortfolioDelta).toBe(0)
    expect(r.resolvedTriggerAge).toBe(67)
    expect(r.cashflows).toHaveLength(1)
    const payout = r.cashflows[0]
    expect(payout.id).toBe('housing-strategy-reverse-mortgage-payout')
    expect(payout.type).toBe('recurring')
    expect(payout.direction).toBe('income')
    expect(payout.fromAge).toBe(67)
    expect(payout.toAge).toBe(90)
    // equity = 250K, maxLoanPct = 0.5, remainingYears = 23 → 250K×0.5/23/12 ≈ 453
    expect(payout.amount).toBeGreaterThan(400)
    expect(payout.amount).toBeLessThan(500)

    // Schaduw-schuld > 0 want rente stapelt
    expect(r.shadowDebtAtEndAge).toBeGreaterThan(0)
  })
})

// ── filterAssetsForFire ──────────────────────────────────────

describe('filterAssetsForFire', () => {
  const huis = makeEigenHuis()
  const hypotheek = makeMortgage(huis.id)
  const beleggingen = makeEigenHuis({
    id: 'asset-investment-1',
    asset_type: 'investment',
    current_value: 200_000,
    woz_value: null,
  })
  const autoLening = makeMortgage('other-asset', {
    id: 'debt-car-1',
    debt_type: 'car_loan',
    linked_asset_id: null,
  })

  it('include_full / reverse_mortgage: geen filter', () => {
    const r1 = filterAssetsForFire({ mode: 'include_full' }, [huis, beleggingen], [hypotheek, autoLening])
    expect(r1.assets).toHaveLength(2)
    expect(r1.debts).toHaveLength(2)

    const r2 = filterAssetsForFire(
      {
        mode: 'reverse_mortgage',
        trigger: 'fixed_age',
        triggerAge: 67,
        depletionThresholdYears: 2,
        maxLoanPct: 0.5,
        interestRate: 0.055,
        monthlyPayout: null,
      },
      [huis, beleggingen],
      [hypotheek, autoLening],
    )
    expect(r2.assets).toHaveLength(2)
    expect(r2.debts).toHaveLength(2)
  })

  it('exclude_from_fire: filtert eigen_huis + linked mortgage, behoudt overige', () => {
    const r = filterAssetsForFire(
      { mode: 'exclude_from_fire' },
      [huis, beleggingen],
      [hypotheek, autoLening],
    )
    expect(r.assets.map((a) => a.id)).toEqual([beleggingen.id])
    expect(r.debts.map((d) => d.id)).toEqual([autoLening.id])
  })

  it('downsize: identiek filter als exclude_from_fire', () => {
    const r = filterAssetsForFire(
      {
        mode: 'downsize',
        trigger: 'fixed_age',
        triggerAge: 65,
        depletionThresholdYears: 2,
        salePricePct: 1.0,
        salesCostsPct: 0.04,
        newMonthlyHousingCost: null,
      },
      [huis, beleggingen],
      [hypotheek, autoLening],
    )
    expect(r.assets.map((a) => a.id)).toEqual([beleggingen.id])
    expect(r.debts.map((d) => d.id)).toEqual([autoLening.id])
  })

  it('geen eigen_huis aanwezig: ongewijzigd', () => {
    const r = filterAssetsForFire({ mode: 'exclude_from_fire' }, [beleggingen], [autoLening])
    expect(r.assets).toEqual([beleggingen])
    expect(r.debts).toEqual([autoLening])
  })
})

// ── getFireEligibleNetWorth ──────────────────────────────────

describe('getFireEligibleNetWorth', () => {
  it('include_full + reverse_mortgage geven volledig vermogen', () => {
    expect(getFireEligibleNetWorth(400_000, standardContext, { mode: 'include_full' })).toBe(400_000)
    expect(
      getFireEligibleNetWorth(400_000, standardContext, {
        mode: 'reverse_mortgage',
        trigger: 'fixed_age',
        triggerAge: 67,
        depletionThresholdYears: 2,
        maxLoanPct: 0.5,
        interestRate: 0.055,
        monthlyPayout: null,
      }),
    ).toBe(400_000)
  })

  it('exclude_from_fire + downsize halen equity (250K) van vermogen af', () => {
    expect(
      getFireEligibleNetWorth(400_000, standardContext, { mode: 'exclude_from_fire' }),
    ).toBe(150_000)
  })

  it('geen eigen woning → ongewijzigd', () => {
    const ctx: HousingContext = {
      eigenHuisValue: 0,
      wozValue: 0,
      mortgageBalance: 0,
      mortgageMonthlyPayment: 0,
      hasEigenHuis: false,
    }
    expect(getFireEligibleNetWorth(400_000, ctx, { mode: 'exclude_from_fire' })).toBe(400_000)
  })
})

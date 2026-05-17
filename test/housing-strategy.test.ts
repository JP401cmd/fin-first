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
  getHousingLifeEvents,
  resolveTriggerAge,
  estimateMonthlyHousingCostAfterSale,
  estimateReverseMortgagePayout,
  getFireEligibleNetWorth,
  filterAssetsForFire,
  isHousingStrategyEvent,
  projectMortgageStateAt,
  HOUSING_STRATEGY_EVENT_ID_PREFIX,
  HOUSING_STRATEGY_EVENT_SOURCE,
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
      eigenHuisMortgages: [],
      // fix #1: `eigenHuisAssets` exposes assets voor downstream WOZ-groei-projectie.
      eigenHuisAssets: [],
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

// ── Test-helpers voor mortgage-projectie ─────────────────────

/**
 * Annuïteit-mortgage van 30 jr die NA 19 jaar volledig is afgelost:
 * 250K saldo, 3.5%, €1500/mnd → schedule.length ≈ 228 mnd ≈ 19 jaar.
 * Bij trigger op 65 (20 jaar in toekomst) is balance = 0.
 */
const annuityMortgage: Debt = makeMortgage('asset-eigen-huis-1', {
  current_balance: 250_000,
  monthly_payment: 1500,
  interest_rate: 3.5,
  repayment_type: 'annuiteit',
  end_date: '2045-01-01',
})

/**
 * Aflossingsvrij: saldo blijft 250K (geen aflossing). Maandlast 1500 in
 * deze tests om eerdere assertions over "bespaarde 1500/mnd" te behouden;
 * in werkelijkheid is een aflossingsvrije maandlast alleen-rente
 * (~729 bij 3.5% op 250K). De test-getallen zijn abstract, niet realistisch.
 */
const aflossingsvrijMortgage: Debt = makeMortgage('asset-eigen-huis-1', {
  current_balance: 250_000,
  monthly_payment: 1500,
  interest_rate: 3.5,
  repayment_type: 'aflossingsvrij',
  end_date: '2055-01-01',
})

/**
 * Stabiel test-huis met `expected_return: 0` zodat de WOZ-projectie (fix #1)
 * dezelfde waarden retourneert als de huidige WOZ. Hierdoor blijven alle
 * bestaande assertions (saleProceeds, equity, etc.) numeriek geldig. Voor
 * specifieke tests die WOZ-groei demonstreren wordt expliciet een asset met
 * `expected_return > 0` opgevoerd.
 */
const stableEigenHuis: Asset = makeEigenHuis({
  id: 'asset-eigen-huis-1',
  expected_return: 0,
  current_value: 500_000,
  woz_value: 480_000,
})

// ── applyHousingStrategy ─────────────────────────────────────

// standardContext gebruikt een aflossingsvrije hypotheek zodat het saldo
// bij trigger nog steeds 250K is. Hierdoor blijven verkoop- en mortgage-end-
// bedragen voorspelbaar (210_800 / 1500) over het project-window. Voor
// projectie-specifieke scenarios is `annuityMortgage` beschikbaar.
// `eigenHuisAssets` met expected_return=0 zodat fix #1 (WOZ-groei) deze
// fixture niet beïnvloedt — gewenst voor regressie-stabiliteit.
const standardContext: HousingContext = {
  eigenHuisValue: 500_000,
  wozValue: 480_000,
  mortgageBalance: 250_000,
  mortgageMonthlyPayment: 1500,
  hasEigenHuis: true,
  eigenHuisMortgages: [aflossingsvrijMortgage],
  eigenHuisAssets: [stableEigenHuis],
}

const baseInput = {
  currentAge: 45,
  endAge: 90,
  yearlyExpenses: 30_000,
  currentLiquidPortfolio: 200_000,
}

describe('applyHousingStrategy', () => {
  // Sinds de tijdlijn-integratie genereert applyHousingStrategy géén
  // SimCashflows meer — die komen via getHousingLifeEvents →
  // lifeEventsToCashflows. applyHousingStrategy levert nog wel
  // initialPortfolioDelta (voor exclude/downsize) + trigger-leeftijd
  // + shadow-debt voor reverse_mortgage.

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

  it('downsize: equity uit pot + trigger-leeftijd geresolved, geen cashflows', () => {
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
    expect(r.initialPortfolioDelta).toBe(-250_000)
    expect(r.resolvedTriggerAge).toBe(65)
    expect(r.cashflows).toHaveLength(0)
    expect(r.shadowDebtAtEndAge).toBe(0)
  })

  it('reverse_mortgage: geen portfolio-delta, wel shadow-debt en trigger', () => {
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
    expect(r.cashflows).toHaveLength(0)
    expect(r.shadowDebtAtEndAge).toBeGreaterThan(0)
  })
})

// ── getHousingLifeEvents (vervangt vroegere SimCashflow-output) ──

describe('getHousingLifeEvents', () => {
  it('include_full / exclude_from_fire produceren geen events', () => {
    expect(
      getHousingLifeEvents({ ...baseInput, config: { mode: 'include_full' }, context: standardContext }),
    ).toEqual([])
    expect(
      getHousingLifeEvents({ ...baseInput, config: { mode: 'exclude_from_fire' }, context: standardContext }),
    ).toEqual([])
  })

  it('no-op zonder eigen woning', () => {
    expect(
      getHousingLifeEvents({
        ...baseInput,
        config: { mode: 'exclude_from_fire' },
        context: { ...standardContext, hasEigenHuis: false, eigenHuisValue: 0 },
      }),
    ).toEqual([])
  })

  it('downsize: 1 event op trigger-leeftijd met 3 sub-cashflows (sale, mortgage-end, new-rent)', () => {
    const events = getHousingLifeEvents({
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
    expect(events).toHaveLength(1)
    const ev = events[0]
    expect(ev.target_age).toBe(65)
    expect(ev.event_type).toBe('verkoop_eigen_woning')
    expect(ev.metadata?.source).toBe(HOUSING_STRATEGY_EVENT_SOURCE)
    expect(isHousingStrategyEvent(ev)).toBe(true)
    expect(ev.one_time_cost).toBe(0) // alle impacts in metadata.cashflows
    expect(ev.monthly_cost_change).toBe(0)

    const meta = ev.metadata as { formula: string; cashflows: Array<{ id: string; type: string; direction: string; amount: number; indexed: boolean }> }
    expect(meta.formula).toBe('downsize')
    expect(meta.cashflows).toHaveLength(3)

    const sale = meta.cashflows.find((c) => c.id === 'sale')!
    expect(sale.type).toBe('one_time')
    expect(sale.direction).toBe('income')
    expect(sale.amount).toBeCloseTo(210_800) // 480K × 0.96 - 250K

    const mortgageEnd = meta.cashflows.find((c) => c.id.startsWith('mortgage-end-'))!
    expect(mortgageEnd.type).toBe('recurring')
    expect(mortgageEnd.direction).toBe('income')
    expect(mortgageEnd.amount).toBe(1500)

    const rent = meta.cashflows.find((c) => c.id === 'new-rent')!
    expect(rent.type).toBe('recurring')
    expect(rent.direction).toBe('expense')
    expect(rent.amount).toBe(1600)
    expect(rent.indexed).toBe(true)
  })

  it('downsize honoreert custom newMonthlyHousingCost', () => {
    const events = getHousingLifeEvents({
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
    const meta = events[0].metadata as { cashflows: Array<{ id: string; amount: number }> }
    const rent = meta.cashflows.find((c) => c.id === 'new-rent')!
    expect(rent.amount).toBe(2000)
  })

  it('reverse_mortgage: 1 event met maandelijkse uitkering', () => {
    const events = getHousingLifeEvents({
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
    expect(events).toHaveLength(1)
    const payout = events[0]
    expect(payout.event_type).toBe('opeethypotheek')
    expect(payout.target_age).toBe(67)
    expect(payout.monthly_income_change).toBeGreaterThan(400)
    expect(payout.monthly_income_change).toBeLessThan(500)
    expect(payout.metadata?.source).toBe(HOUSING_STRATEGY_EVENT_SOURCE)
  })

  it('alle events hebben de housing-strategy ID-prefix', () => {
    const events = getHousingLifeEvents({
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
    for (const ev of events) {
      expect(ev.id.startsWith(HOUSING_STRATEGY_EVENT_ID_PREFIX)).toBe(true)
    }
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
      eigenHuisMortgages: [],
      eigenHuisAssets: [],
    }
    expect(getFireEligibleNetWorth(400_000, ctx, { mode: 'exclude_from_fire' })).toBe(400_000)
  })
})

// ── isHousingStrategyEvent ───────────────────────────────────

describe('isHousingStrategyEvent', () => {
  it('herkent housing-strategy events op ID-prefix', () => {
    expect(isHousingStrategyEvent({ id: 'housing-strategy:downsize-sale' })).toBe(true)
    expect(isHousingStrategyEvent({ id: 'housing-strategy:reverse-mortgage-payout' })).toBe(true)
  })

  it('herkent echte life_events events NIET als housing-strategy', () => {
    expect(isHousingStrategyEvent({ id: 'abc-123-uuid' })).toBe(false)
    expect(isHousingStrategyEvent({ id: 'le-cost-xyz' })).toBe(false)
    expect(isHousingStrategyEvent({ id: '' })).toBe(false)
  })
})

// ── Test-matrix: 4 modes × 2 triggers × custom-vs-auto overrides ──

describe('Strategy matrix — alle 4 modes × triggers × overrides', () => {
  // Scenario: 45-jarige met €500K huis (WOZ €480K), €250K aflossingsvrije
  // hypotheek (€1500/mnd, balance blijft 250K). €200K liquide beleggingen,
  // €30K/jaar uitgaven. Aflossingsvrij gekozen zodat het saldo na 20 jaar
  // nog steeds 250K is — tests blijven voorspelbaar. Annuïteit-projectie
  // wordt in een aparte describe-block getest.
  // fix #1: `eigenHuisAssets` met expected_return=0 zodat WOZ-groei deze
  // matrix-tests niet stiekem verschuift; aparte tests valideren groei.
  const ctxWithHouse: HousingContext = {
    eigenHuisValue: 500_000,
    wozValue: 480_000,
    mortgageBalance: 250_000,
    mortgageMonthlyPayment: 1500,
    hasEigenHuis: true,
    eigenHuisMortgages: [aflossingsvrijMortgage],
    eigenHuisAssets: [stableEigenHuis],
  }
  // fix #2: lineaire on_depletion-trigger preserveren (geen rendement) zodat
  // bestaande crossover-assertions (52, 53, 55, 65 etc.) blijven kloppen.
  // Aparte tests valideren het rendement-pad expliciet.
  const sharedInput = {
    context: ctxWithHouse,
    currentAge: 45,
    endAge: 90,
    yearlyExpenses: 30_000,
    currentLiquidPortfolio: 200_000,
    grossReturn: 0,
    inflationRate: 0,
  }

  // ── include_full ──────────────────────────────────────────
  describe('include_full', () => {
    const config: { mode: 'include_full' } = { mode: 'include_full' }

    it('produceert geen LifeEvents', () => {
      expect(getHousingLifeEvents({ ...sharedInput, config })).toEqual([])
    })

    it('filterAssetsForFire laat assets/debts ongemoeid', () => {
      const huis = makeEigenHuis()
      const mort = makeMortgage(huis.id)
      const r = filterAssetsForFire(config, [huis], [mort])
      expect(r.assets).toHaveLength(1)
      expect(r.debts).toHaveLength(1)
    })

    it('FIRE-eligible net worth = totaal net worth', () => {
      expect(getFireEligibleNetWorth(400_000, ctxWithHouse, config)).toBe(400_000)
    })
  })

  // ── exclude_from_fire ─────────────────────────────────────
  describe('exclude_from_fire', () => {
    const config: { mode: 'exclude_from_fire' } = { mode: 'exclude_from_fire' }

    it('produceert geen LifeEvents (alleen statische uitsluiting)', () => {
      expect(getHousingLifeEvents({ ...sharedInput, config })).toEqual([])
    })

    it('filterAssetsForFire haalt eigen_huis + linked mortgage weg', () => {
      const huis = makeEigenHuis()
      const mort = makeMortgage(huis.id)
      const losseInvestment = makeEigenHuis({
        id: 'inv-1',
        asset_type: 'investment',
        current_value: 100_000,
      })
      const r = filterAssetsForFire(config, [huis, losseInvestment], [mort])
      expect(r.assets.map((a) => a.id)).toEqual([losseInvestment.id])
      expect(r.debts).toHaveLength(0)
    })

    it('applyHousingStrategy retourneert -equity initial delta, geen trigger', () => {
      const r = applyHousingStrategy({ ...sharedInput, config })
      expect(r.initialPortfolioDelta).toBe(-250_000) // 500K - 250K
      expect(r.resolvedTriggerAge).toBeNull()
      expect(r.cashflows).toEqual([])
    })

    it('FIRE-eligible = totaal − equity', () => {
      expect(getFireEligibleNetWorth(400_000, ctxWithHouse, config)).toBe(150_000)
    })
  })

  // ── downsize × fixed_age ──────────────────────────────────
  describe('downsize × fixed_age', () => {
    const baseDownsizeFixed = {
      mode: 'downsize' as const,
      trigger: 'fixed_age' as const,
      triggerAge: 65,
      depletionThresholdYears: 2,
      salePricePct: 1.0,
      salesCostsPct: 0.04,
    }

    it('genereert 1 event met formula="downsize" en 3 sub-cashflows', () => {
      const events = getHousingLifeEvents({
        ...sharedInput,
        config: { ...baseDownsizeFixed, newMonthlyHousingCost: null },
      })
      expect(events).toHaveLength(1)
      const meta = events[0].metadata as {
        formula: string
        cashflows: Array<{ id: string }>
        saleProceeds: number
        wozValue: number
        salePricePct: number
        salesCostsPct: number
        mortgageBalance: number
      }
      expect(meta.formula).toBe('downsize')
      expect(meta.cashflows.map((c) => c.id)).toEqual([
        'sale',
        `mortgage-end-${aflossingsvrijMortgage.id}`,
        'new-rent',
      ])
      // Breakdown-velden voor display
      expect(meta.saleProceeds).toBeCloseTo(210_800)
      expect(meta.wozValue).toBe(480_000)
      expect(meta.salePricePct).toBe(1.0)
      expect(meta.salesCostsPct).toBe(0.04)
      expect(meta.mortgageBalance).toBe(250_000)
    })

    it('honoreert custom salePricePct = 0.9 (krappe markt)', () => {
      const events = getHousingLifeEvents({
        ...sharedInput,
        config: { ...baseDownsizeFixed, salePricePct: 0.9, newMonthlyHousingCost: null },
      })
      // 480K × 0.9 × 0.96 - 250K = 164_720
      const meta = events[0].metadata as { cashflows: Array<{ id: string; amount: number }> }
      const sale = meta.cashflows.find((c) => c.id === 'sale')!
      expect(sale.amount).toBeCloseTo(164_720)
    })

    it('honoreert custom salesCostsPct = 0.07 (hoge transactiekosten)', () => {
      const events = getHousingLifeEvents({
        ...sharedInput,
        config: { ...baseDownsizeFixed, salesCostsPct: 0.07, newMonthlyHousingCost: null },
      })
      // 480K × 1.0 × 0.93 - 250K = 196_400
      const meta = events[0].metadata as { cashflows: Array<{ id: string; amount: number }> }
      const sale = meta.cashflows.find((c) => c.id === 'sale')!
      expect(sale.amount).toBeCloseTo(196_400)
    })

    it('honoreert custom newMonthlyHousingCost en markeert als handmatig', () => {
      const events = getHousingLifeEvents({
        ...sharedInput,
        config: { ...baseDownsizeFixed, newMonthlyHousingCost: 1850 },
      })
      const meta = events[0].metadata as { cashflows: Array<{ id: string; amount: number }>; newMonthly: number; isAutoEstimate: boolean }
      const rent = meta.cashflows.find((c) => c.id === 'new-rent')!
      expect(rent.amount).toBe(1850)
      expect(meta.newMonthly).toBe(1850)
      expect(meta.isAutoEstimate).toBe(false)
    })

    it('zonder override is rent auto-estimate (WOZ × 4% / 12 = 1600)', () => {
      const events = getHousingLifeEvents({
        ...sharedInput,
        config: { ...baseDownsizeFixed, newMonthlyHousingCost: null },
      })
      const meta = events[0].metadata as { cashflows: Array<{ id: string; amount: number }>; isAutoEstimate: boolean }
      const rent = meta.cashflows.find((c) => c.id === 'new-rent')!
      expect(rent.amount).toBe(1600)
      expect(meta.isAutoEstimate).toBe(true)
    })

    it('zonder hypotheek: cashflows bevat alleen sale + rent (geen mortgage-end)', () => {
      const ctxGeenHypotheek: HousingContext = {
        ...ctxWithHouse,
        mortgageBalance: 0,
        mortgageMonthlyPayment: 0,
        eigenHuisMortgages: [],
      }
      const events = getHousingLifeEvents({
        ...sharedInput,
        context: ctxGeenHypotheek,
        config: { ...baseDownsizeFixed, newMonthlyHousingCost: null },
      })
      expect(events).toHaveLength(1)
      const meta = events[0].metadata as { cashflows: Array<{ id: string }> }
      expect(meta.cashflows.map((c) => c.id)).toEqual(['sale', 'new-rent'])
    })
  })

  // ── downsize × on_depletion ───────────────────────────────
  //
  // Trigger-definitie: het huis is "nodig" zodra het totale vermogen
  // daalt tot het niveau van het eigen-huis-vermogen — algebraïsch
  // betekent dat: liquide raakt op (liquide < 0). Trigger op de leeftijd
  // waarop het liquide saldo nul bereikt onder lineair declining model.

  describe('downsize × on_depletion (liquide raakt op)', () => {
    it('crossover-trigger: liquide raakt op na yearsToZero jaar', () => {
      // Standaard fixture: liquide 200K, expenses 30K, savings 0.
      // yearsToZero = ceil(200K / 30K) = 7 → trigger op 45 + 7 = 52.
      const config = {
        mode: 'downsize' as const,
        trigger: 'on_depletion' as const,
        triggerAge: 90,
        depletionThresholdYears: 2,
        salePricePct: 1.0,
        salesCostsPct: 0.04,
        newMonthlyHousingCost: null,
      }
      const events = getHousingLifeEvents({ ...sharedInput, config })
      const meta = events[0].metadata as { depletion: { reason: string; triggerAge: number; liquidAtTrigger: number } }
      expect(events[0].target_age).toBe(52)
      expect(meta.depletion.reason).toBe('crossover')
      expect(meta.depletion.triggerAge).toBe(52)
      expect(meta.depletion.liquidAtTrigger).toBe(0)
    })

    it('immediate-trigger: liquide reeds 0 (of negatief) → verkoop nu', () => {
      // Met liquide = 0 én in afbouw zit liquide al op nul → direct.
      const events = getHousingLifeEvents({
        ...sharedInput,
        currentLiquidPortfolio: 0,
        config: {
          mode: 'downsize',
          trigger: 'on_depletion',
          triggerAge: 80,
          depletionThresholdYears: 2,
          salePricePct: 1.0,
          salesCostsPct: 0.04,
          newMonthlyHousingCost: null,
        },
      })
      const meta = events[0].metadata as { depletion: { reason: string } }
      expect(events[0].target_age).toBe(45) // currentAge
      expect(meta.depletion.reason).toBe('immediate')
    })

    it('fallback-trigger: geen crossover binnen window → uiterste leeftijd', () => {
      const ctxBigLiquid: HousingContext = {
        ...ctxWithHouse,
        mortgageBalance: 400_000,
        eigenHuisMortgages: [
          makeMortgage('asset-eigen-huis-1', {
            current_balance: 400_000,
            monthly_payment: 1500,
            repayment_type: 'aflossingsvrij',
            end_date: '2080-01-01',
          }),
        ],
      }
      const events = getHousingLifeEvents({
        ...sharedInput,
        context: ctxBigLiquid,
        currentLiquidPortfolio: 10_000_000, // duurt eeuwig
        config: {
          mode: 'downsize',
          trigger: 'on_depletion',
          triggerAge: 75,
          depletionThresholdYears: 2,
          salePricePct: 1.0,
          salesCostsPct: 0.04,
          newMonthlyHousingCost: null,
        },
      })
      const meta = events[0].metadata as { depletion: { reason: string } }
      expect(events[0].target_age).toBe(75)
      expect(meta.depletion.reason).toBe('fallback')
    })

    it('phase-gate: opbouw-fase (annualSavings ≥ expenses) → still_accumulating', () => {
      // Gebruiker spaart €36K/jr terwijl uitgaven €30K — netto positief.
      // Verkoop is niet nodig; trigger valt op fallback-leeftijd.
      const events = getHousingLifeEvents({
        ...sharedInput,
        annualSavings: 36_000, // > yearlyExpenses 30_000
        config: {
          mode: 'downsize',
          trigger: 'on_depletion',
          triggerAge: 80,
          depletionThresholdYears: 2,
          salePricePct: 1.0,
          salesCostsPct: 0.04,
          newMonthlyHousingCost: null,
        },
      })
      const meta = events[0].metadata as {
        depletion: { reason: string; phase: string; triggerAge: number }
      }
      expect(meta.depletion.phase).toBe('accumulation')
      expect(meta.depletion.reason).toBe('still_accumulating')
      expect(meta.depletion.triggerAge).toBe(80) // fallback
      expect(events[0].target_age).toBe(80)
    })

    it('phase-gate: break-even (savings = expenses) → ook opbouw-fase (geen netto interen)', () => {
      const events = getHousingLifeEvents({
        ...sharedInput,
        annualSavings: 30_000, // == yearlyExpenses
        config: {
          mode: 'downsize',
          trigger: 'on_depletion',
          triggerAge: 80,
          depletionThresholdYears: 2,
          salePricePct: 1.0,
          salesCostsPct: 0.04,
          newMonthlyHousingCost: null,
        },
      })
      const meta = events[0].metadata as { depletion: { phase: string; reason: string } }
      expect(meta.depletion.phase).toBe('accumulation')
      expect(meta.depletion.reason).toBe('still_accumulating')
    })

    it('phase-gate: tussen-fase (savings < expenses) → crossover bij yearsToZero', () => {
      // Gebruiker spaart €5K/jr maar geeft €30K uit → netto -25K/jr.
      // Liquide 200K → yearsToZero = ceil(200/25) = 8 → trigger op 45+8 = 53.
      const events = getHousingLifeEvents({
        ...sharedInput,
        annualSavings: 5_000,
        config: {
          mode: 'downsize',
          trigger: 'on_depletion',
          triggerAge: 80,
          depletionThresholdYears: 2,
          salePricePct: 1.0,
          salesCostsPct: 0.04,
          newMonthlyHousingCost: null,
        },
      })
      const meta = events[0].metadata as {
        depletion: { phase: string; reason: string; netDeclinePerYear: number; triggerAge: number }
      }
      expect(meta.depletion.phase).toBe('decumulation')
      expect(meta.depletion.reason).toBe('crossover')
      expect(meta.depletion.netDeclinePerYear).toBe(25_000)
      expect(meta.depletion.triggerAge).toBe(53)
    })

    it('crossover gebruikt netto-decline (savings drukken decline)', () => {
      // Liquide 200K, expenses 30K, savings 10K → netto -20K/jr.
      // yearsToZero = ceil(200/20) = 10 → trigger op 45+10 = 55.
      const events = getHousingLifeEvents({
        ...sharedInput,
        annualSavings: 10_000,
        config: {
          mode: 'downsize',
          trigger: 'on_depletion',
          triggerAge: 90,
          depletionThresholdYears: 2,
          salePricePct: 1.0,
          salesCostsPct: 0.04,
          newMonthlyHousingCost: null,
        },
      })
      const meta = events[0].metadata as {
        depletion: { reason: string; triggerAge: number; netDeclinePerYear: number }
      }
      expect(meta.depletion.netDeclinePerYear).toBe(20_000)
      expect(meta.depletion.reason).toBe('crossover')
      expect(meta.depletion.triggerAge).toBe(55)
    })

    it('cashflow-detectie: opbouw door income > expenses, ook bij annualSavings=0', () => {
      // Scenario: gebruiker spaart NIET via asset.monthly_contribution (annualSavings=0),
      // maar verdient WEL meer dan z'n uitgaven (positieve bank-cashflow).
      // De phase-gate moet dit als opbouw herkennen via currentNetCashflowYearly.
      const events = getHousingLifeEvents({
        ...sharedInput,
        annualSavings: 0, // geen asset-tracking
        currentNetCashflowYearly: 15_000, // wel netto sparen via bankrekening
        config: {
          mode: 'downsize',
          trigger: 'on_depletion',
          triggerAge: 80,
          depletionThresholdYears: 2,
          salePricePct: 1.0,
          salesCostsPct: 0.04,
          newMonthlyHousingCost: null,
        },
      })
      const meta = events[0].metadata as {
        depletion: { phase: string; reason: string }
        currentNetCashflowYearly: number
      }
      expect(meta.depletion.phase).toBe('accumulation')
      expect(meta.depletion.reason).toBe('still_accumulating')
      expect(meta.currentNetCashflowYearly).toBe(15_000)
    })

    it('cashflow-detectie: afbouw via negatieve cashflow (income < expenses)', () => {
      // Gebruiker met pensioen 20K/jr maar uitgaven 30K/jr → cashflow -10K/jr.
      // Liquide 200K daalt met 10K/jr → yearsToZero = 20 → trigger op leeftijd 65.
      const events = getHousingLifeEvents({
        ...sharedInput,
        annualSavings: 0,
        currentNetCashflowYearly: -10_000,
        config: {
          mode: 'downsize',
          trigger: 'on_depletion',
          triggerAge: 90,
          depletionThresholdYears: 2,
          salePricePct: 1.0,
          salesCostsPct: 0.04,
          newMonthlyHousingCost: null,
        },
      })
      const meta = events[0].metadata as {
        depletion: { phase: string; reason: string; triggerAge: number; netDeclinePerYear: number }
      }
      expect(meta.depletion.phase).toBe('decumulation')
      expect(meta.depletion.reason).toBe('crossover')
      expect(meta.depletion.netDeclinePerYear).toBe(10_000)
      expect(meta.depletion.triggerAge).toBe(65) // 45 + ceil(200/10) = 45 + 20
    })

    it('cashflow neemt voorrang op legacy annualSavings (override-gedrag)', () => {
      // annualSavings zegt "opbouw" (savings > expenses), cashflow zegt "afbouw"
      // (income < expenses). Cashflow wint.
      const events = getHousingLifeEvents({
        ...sharedInput,
        annualSavings: 50_000, // zou opbouw aangeven via legacy-pad
        currentNetCashflowYearly: -5_000, // maar werkelijk netto-uitgave
        config: {
          mode: 'downsize',
          trigger: 'on_depletion',
          triggerAge: 90,
          depletionThresholdYears: 2,
          salePricePct: 1.0,
          salesCostsPct: 0.04,
          newMonthlyHousingCost: null,
        },
      })
      const meta = events[0].metadata as { depletion: { phase: string } }
      expect(meta.depletion.phase).toBe('decumulation')
    })

    it('exposed metadata bevat liquide/overwaarde/uitleg voor breakdown-UI', () => {
      const events = getHousingLifeEvents({
        ...sharedInput,
        config: {
          mode: 'downsize',
          trigger: 'on_depletion',
          triggerAge: 80,
          depletionThresholdYears: 2,
          salePricePct: 1.0,
          salesCostsPct: 0.04,
          newMonthlyHousingCost: null,
        },
      })
      const meta = events[0].metadata as {
        triggerMode: string
        depletion: { reason: string; liquidAtTrigger: number; equityAtTrigger: number }
        currentLiquidPortfolio: number
        yearlyExpenses: number
      }
      expect(meta.triggerMode).toBe('on_depletion')
      expect(meta.depletion.liquidAtTrigger).toBeDefined()
      expect(meta.depletion.equityAtTrigger).toBeDefined()
      expect(meta.currentLiquidPortfolio).toBe(200_000)
      expect(meta.yearlyExpenses).toBe(30_000)
    })
  })

  // ── reverse_mortgage × fixed_age ──────────────────────────
  describe('reverse_mortgage × fixed_age', () => {
    const baseRmFixed = {
      mode: 'reverse_mortgage' as const,
      trigger: 'fixed_age' as const,
      triggerAge: 67,
      depletionThresholdYears: 2,
      maxLoanPct: 0.5,
      interestRate: 0.055,
    }

    it('genereert 1 event met juiste metadata', () => {
      const events = getHousingLifeEvents({
        ...sharedInput,
        config: { ...baseRmFixed, monthlyPayout: null },
      })
      expect(events).toHaveLength(1)
      const ev = events[0]
      expect(ev.event_type).toBe('opeethypotheek')
      expect(ev.target_age).toBe(67)
      const meta = ev.metadata as { formula: string; equity: number; maxLoanPct: number; remainingYears: number; eigenHuisValue: number; mortgageBalance: number; interestRate: number }
      expect(meta.formula).toBe('reverse-payout')
      expect(meta.equity).toBe(250_000) // 500K - 250K
      expect(meta.maxLoanPct).toBe(0.5)
      expect(meta.remainingYears).toBe(23) // 90 - 67
      expect(meta.eigenHuisValue).toBe(500_000)
      expect(meta.mortgageBalance).toBe(250_000)
      expect(meta.interestRate).toBe(0.055)
    })

    it('auto-berekening: equity × maxLoanPct / years / 12', () => {
      const events = getHousingLifeEvents({
        ...sharedInput,
        config: { ...baseRmFixed, monthlyPayout: null },
      })
      // 250K × 0.5 / 23 / 12 ≈ 453
      expect(events[0].monthly_income_change).toBe(453)
      const meta = events[0].metadata as { isAutoEstimate: boolean }
      expect(meta.isAutoEstimate).toBe(true)
    })

    it('honoreert custom monthlyPayout', () => {
      const events = getHousingLifeEvents({
        ...sharedInput,
        config: { ...baseRmFixed, monthlyPayout: 800 },
      })
      expect(events[0].monthly_income_change).toBe(800)
      const meta = events[0].metadata as { isAutoEstimate: boolean }
      expect(meta.isAutoEstimate).toBe(false)
    })

    it('honoreert hogere maxLoanPct (65%, NL-marktbovengrens)', () => {
      const events = getHousingLifeEvents({
        ...sharedInput,
        config: { ...baseRmFixed, maxLoanPct: 0.65, monthlyPayout: null },
      })
      // 250K × 0.65 / 23 / 12 ≈ 589
      expect(events[0].monthly_income_change).toBe(589)
    })

    it('shadow-debt groeit met rente over de uitkering', () => {
      const r = applyHousingStrategy({
        ...sharedInput,
        config: { ...baseRmFixed, monthlyPayout: 500 },
      })
      // principal = 500 × 12 × 23 = 138_000
      // (1.055)^23 ≈ 3.426 → shadow = 138_000 × 3.426 - 138_000 ≈ 334_800
      expect(r.shadowDebtAtEndAge).toBeGreaterThan(300_000)
      expect(r.shadowDebtAtEndAge).toBeLessThan(360_000)
    })

    it('zonder overwaarde (negatieve equity) geen events', () => {
      const onderwaterMortgage = makeMortgage('asset-eigen-huis-1', {
        current_balance: 600_000, // > eigenHuisValue
        monthly_payment: 1500,
        repayment_type: 'aflossingsvrij',
        end_date: '2080-01-01', // end-date ná trigger zodat saldo bij trigger nog 600K is
      })
      const ctxOnderwater: HousingContext = {
        ...ctxWithHouse,
        mortgageBalance: 600_000,
        eigenHuisMortgages: [onderwaterMortgage],
      }
      const events = getHousingLifeEvents({
        ...sharedInput,
        context: ctxOnderwater,
        config: { ...baseRmFixed, monthlyPayout: null },
      })
      expect(events).toEqual([])
    })
  })

  // ── reverse_mortgage × on_depletion ───────────────────────
  describe('reverse_mortgage × on_depletion', () => {
    it('event triggert op depletion-leeftijd, niet op fallback', () => {
      const events = getHousingLifeEvents({
        ...sharedInput,
        config: {
          mode: 'reverse_mortgage',
          trigger: 'on_depletion',
          triggerAge: 80,
          depletionThresholdYears: 2,
          maxLoanPct: 0.5,
          interestRate: 0.055,
          monthlyPayout: null,
        },
      })
      // Same lineaire schatting: 200K - 60K = 140K boven threshold → 4.67 jaar → leeftijd 49
      expect(events[0].target_age).toBe(49)
    })
  })

  // ── edge cases ────────────────────────────────────────────
  describe('edge cases', () => {
    it('zonder eigen woning: alle modes produceren geen events + initial delta = 0', () => {
      const noHouseCtx: HousingContext = {
        eigenHuisValue: 0,
        wozValue: 0,
        mortgageBalance: 0,
        mortgageMonthlyPayment: 0,
        eigenHuisMortgages: [],
        hasEigenHuis: false,
        eigenHuisAssets: [],
      }
      const modes = [
        { mode: 'include_full' as const },
        { mode: 'exclude_from_fire' as const },
        {
          mode: 'downsize' as const,
          trigger: 'fixed_age' as const,
          triggerAge: 65,
          depletionThresholdYears: 2,
          salePricePct: 1.0,
          salesCostsPct: 0.04,
          newMonthlyHousingCost: null,
        },
        {
          mode: 'reverse_mortgage' as const,
          trigger: 'fixed_age' as const,
          triggerAge: 67,
          depletionThresholdYears: 2,
          maxLoanPct: 0.5,
          interestRate: 0.055,
          monthlyPayout: null,
        },
      ]
      for (const config of modes) {
        expect(getHousingLifeEvents({ ...sharedInput, context: noHouseCtx, config })).toEqual([])
        const r = applyHousingStrategy({ ...sharedInput, context: noHouseCtx, config })
        expect(r.initialPortfolioDelta).toBe(0)
        expect(r.cashflows).toEqual([])
      }
    })

    it('downsize: zonder WOZ-waarde (WOZ=0) cashflows = [sale (expense), mortgage-end]', () => {
      // fix #1: zonder eigen-huis-assets én wozValue=0 valt de lib terug op
      // `context.wozValue` (= 0). Met assets erin zou `projectEigenHuisValuesAt`
      // de WOZ uit `stableEigenHuis.woz_value` (480K) overrulen — een ander
      // scenario. Hier testen we juist de "geen waardering"-fallback.
      const ctxNoWoz: HousingContext = { ...ctxWithHouse, wozValue: 0, eigenHuisAssets: [] }
      const events = getHousingLifeEvents({
        ...sharedInput,
        context: ctxNoWoz,
        config: {
          mode: 'downsize',
          trigger: 'fixed_age',
          triggerAge: 65,
          depletionThresholdYears: 2,
          salePricePct: 1.0,
          salesCostsPct: 0.04,
          newMonthlyHousingCost: null,
        },
      })
      // saleProceeds = 0 - 250K = -250K (negatief, dus 'expense' direction)
      // mortgage-end blijft (recurring income)
      // rent: auto-estimate van WOZ=0 = 0 → geen rent-cashflow
      expect(events).toHaveLength(1)
      const meta = events[0].metadata as { cashflows: Array<{ id: string; direction: string }> }
      expect(meta.cashflows.map((c) => c.id)).toEqual([
        'sale',
        `mortgage-end-${aflossingsvrijMortgage.id}`,
      ])
      expect(meta.cashflows.find((c) => c.id === 'sale')?.direction).toBe('expense')
    })

    it('downsize: triggerAge < currentAge wordt geclamped naar currentAge', () => {
      const events = getHousingLifeEvents({
        ...sharedInput,
        config: {
          mode: 'downsize',
          trigger: 'fixed_age',
          triggerAge: 30, // < currentAge 45
          depletionThresholdYears: 2,
          salePricePct: 1.0,
          salesCostsPct: 0.04,
          newMonthlyHousingCost: null,
        },
      })
      expect(events.every((e) => e.target_age === 45)).toBe(true)
    })
  })
})

// ── End-to-end: events → SimCashflows via lifeEventsToCashflows ──

describe('Integratie: virtuele events → SimCashflows', () => {
  // fix #1: `eigenHuisAssets` met expected_return=0 zodat de geprojecteerde
  // WOZ-waarde gelijk blijft aan de huidige (bestaande assertions blijven geldig).
  const ctxWithHouse: HousingContext = {
    eigenHuisValue: 500_000,
    wozValue: 480_000,
    mortgageBalance: 250_000,
    mortgageMonthlyPayment: 1500,
    hasEigenHuis: true,
    eigenHuisMortgages: [aflossingsvrijMortgage],
    eigenHuisAssets: [stableEigenHuis],
  }
  // fix #2: lineair model (rendement=0) zodat trigger-leeftijden onveranderd zijn.
  const sharedInput = {
    context: ctxWithHouse,
    currentAge: 45,
    endAge: 90,
    yearlyExpenses: 30_000,
    currentLiquidPortfolio: 200_000,
    grossReturn: 0,
    inflationRate: 0,
  }

  it('downsize: 1 event met metadata.cashflows → 3 SimCashflows met juiste shape', async () => {
    const { lifeEventsToCashflows } = await import('@/lib/fire-simulation')
    const events = getHousingLifeEvents({
      ...sharedInput,
      config: {
        mode: 'downsize',
        trigger: 'fixed_age',
        triggerAge: 65,
        depletionThresholdYears: 2,
        salePricePct: 1.0,
        salesCostsPct: 0.04,
        newMonthlyHousingCost: null,
      },
    })
    expect(events).toHaveLength(1)
    const cashflows = lifeEventsToCashflows(events)
    expect(cashflows).toHaveLength(3)

    // lifeEventsToCashflows gebruikt het 'custom cashflows'-pad voor events
    // met metadata.cashflows; namen worden uit cf.name overgenomen.

    const sale = cashflows.find((c) => c.name === 'Verkoopopbrengst')!
    expect(sale.type).toBe('one_time')
    expect(sale.direction).toBe('income')
    expect(sale.amount).toBeCloseTo(210_800)
    expect(sale.fromAge).toBe(65)

    const mortgageEnd = cashflows.find((c) => c.name === 'Bespaarde hypotheekbetaling')!
    expect(mortgageEnd.type).toBe('recurring')
    expect(mortgageEnd.direction).toBe('income')
    expect(mortgageEnd.amount).toBe(1500)
    expect(mortgageEnd.fromAge).toBe(65)
    // Cashflow loopt tot oorspronkelijke einddatum van de hypotheek (2055).
    // currentAge 45 + monthsToTrigger 240 + remaining ~103 = trigger+8.6 → ~74.
    expect(mortgageEnd.toAge).toBeGreaterThan(73)
    expect(mortgageEnd.toAge).toBeLessThan(76)

    const rent = cashflows.find((c) => c.name === 'Nieuwe woonkosten (huur)')!
    expect(rent.type).toBe('recurring')
    expect(rent.direction).toBe('expense')
    expect(rent.amount).toBe(1600)
    expect(rent.indexed).toBe(true)
  })

  it('reverse_mortgage: 1 event → 1 cashflow met recurring income', async () => {
    const { lifeEventsToCashflows } = await import('@/lib/fire-simulation')
    const events = getHousingLifeEvents({
      ...sharedInput,
      config: {
        mode: 'reverse_mortgage',
        trigger: 'fixed_age',
        triggerAge: 67,
        depletionThresholdYears: 2,
        maxLoanPct: 0.5,
        interestRate: 0.055,
        monthlyPayout: null,
      },
    })
    const cashflows = lifeEventsToCashflows(events)
    expect(cashflows).toHaveLength(1)
    const payout = cashflows[0]
    expect(payout.name).toBe('Opeethypotheek-uitkering')
    expect(payout.type).toBe('recurring')
    expect(payout.direction).toBe('income')
    expect(payout.amount).toBeGreaterThan(400)
    expect(payout.amount).toBeLessThan(500)
    expect(payout.fromAge).toBe(67)
    expect(payout.indexed).toBe(false)
  })

  it('exclude_from_fire: events = [] → cashflows = []', async () => {
    const { lifeEventsToCashflows } = await import('@/lib/fire-simulation')
    const events = getHousingLifeEvents({
      ...sharedInput,
      config: { mode: 'exclude_from_fire' },
    })
    expect(lifeEventsToCashflows(events)).toEqual([])
  })

  it('include_full: events = [] → cashflows = []', async () => {
    const { lifeEventsToCashflows } = await import('@/lib/fire-simulation')
    const events = getHousingLifeEvents({ ...sharedInput, config: { mode: 'include_full' } })
    expect(lifeEventsToCashflows(events)).toEqual([])
  })
})

// ── Asset-filter × strategy interactie ───────────────────────

describe('filterAssetsForFire × strategy interactie', () => {
  const huis = makeEigenHuis()
  const mortgage = makeMortgage(huis.id)
  const beleggingen = makeEigenHuis({
    id: 'inv-1',
    asset_type: 'investment',
    current_value: 200_000,
    woz_value: null,
  })
  const studieschuld = makeMortgage('other-asset-id', {
    id: 'd-studie',
    debt_type: 'student_loan',
    linked_asset_id: null,
    current_balance: 15_000,
  })

  it('include_full + reverse_mortgage behouden alles (huis blijft in pot)', () => {
    for (const config of [
      { mode: 'include_full' as const },
      {
        mode: 'reverse_mortgage' as const,
        trigger: 'fixed_age' as const,
        triggerAge: 67,
        depletionThresholdYears: 2,
        maxLoanPct: 0.5,
        interestRate: 0.055,
        monthlyPayout: null,
      },
    ]) {
      const r = filterAssetsForFire(config, [huis, beleggingen], [mortgage, studieschuld])
      expect(r.assets.map((a) => a.id).sort()).toEqual([beleggingen.id, huis.id].sort())
      expect(r.debts.map((d) => d.id).sort()).toEqual([mortgage.id, studieschuld.id].sort())
    }
  })

  it('exclude_from_fire + downsize verwijderen huis + linked mortgage, behouden overige', () => {
    for (const config of [
      { mode: 'exclude_from_fire' as const },
      {
        mode: 'downsize' as const,
        trigger: 'fixed_age' as const,
        triggerAge: 65,
        depletionThresholdYears: 2,
        salePricePct: 1.0,
        salesCostsPct: 0.04,
        newMonthlyHousingCost: null,
      },
    ]) {
      const r = filterAssetsForFire(config, [huis, beleggingen], [mortgage, studieschuld])
      expect(r.assets.map((a) => a.id)).toEqual([beleggingen.id])
      expect(r.debts.map((d) => d.id)).toEqual([studieschuld.id])
    }
  })

  it('downsize: tweede mortgage zonder linked_asset_id blijft (auto-lening case)', () => {
    const autoLening = makeMortgage(null as unknown as string, {
      id: 'd-auto',
      debt_type: 'car_loan',
      linked_asset_id: null,
      current_balance: 8_000,
    })
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
      [huis],
      [mortgage, autoLening],
    )
    expect(r.debts.map((d) => d.id)).toEqual([autoLening.id])
  })
})

// ── Mortgage-projectie naar trigger-moment ────────────────────

describe('projectMortgageStateAt — amortisatie naar toekomst', () => {
  it('monthsForward = 0: retourneert huidige saldo + maandlast', () => {
    const m = makeMortgage('a-1', {
      current_balance: 200_000,
      monthly_payment: 1200,
      interest_rate: 3.0,
      repayment_type: 'annuiteit',
    })
    const r = projectMortgageStateAt([m], 0)
    expect(r.balance).toBe(200_000)
    expect(r.monthlyPayment).toBe(1200)
  })

  it('on_depletion trigger die direct vuurt (monthsForward = 0) crasht niet', () => {
    // Regressie: schedule[monthsForward - 1] zou schedule[-1] = undefined
    // worden bij monthsForward=0, wat een TypeError veroorzaakte. Nu
    // korte-pad-fix via early-return.
    const m = makeMortgage('a-1', {
      current_balance: 250_000,
      monthly_payment: 1500,
      interest_rate: 3.5,
      repayment_type: 'annuiteit',
      end_date: '2045-01-01',
    })
    expect(() => {
      const events = getHousingLifeEvents({
        context: {
          eigenHuisValue: 500_000,
          wozValue: 480_000,
          mortgageBalance: 250_000,
          mortgageMonthlyPayment: 1500,
          hasEigenHuis: true,
          eigenHuisMortgages: [m],
          // fix #1: leeg array houdt huidige WOZ (geen groei) — saleProceeds-fallback in lib.
          eigenHuisAssets: [],
        },
        currentAge: 65,
        endAge: 90,
        yearlyExpenses: 30_000,
        currentLiquidPortfolio: 0, // liquide nu al op → trigger direct
        config: {
          mode: 'downsize',
          trigger: 'on_depletion',
          triggerAge: 80,
          depletionThresholdYears: 2,
          salePricePct: 1.0,
          salesCostsPct: 0.04,
          newMonthlyHousingCost: null,
        },
      })
      expect(events).toHaveLength(1)
      expect(events[0].target_age).toBe(65) // = currentAge
    }).not.toThrow()
  })

  it('aflossingsvrij: saldo blijft gelijk bij projectie (mits end_date voldoende ver)', () => {
    const m = makeMortgage('a-1', {
      current_balance: 250_000,
      monthly_payment: 700,
      interest_rate: 3.5,
      repayment_type: 'aflossingsvrij',
      end_date: '2060-01-01', // ver in toekomst
    })
    const r = projectMortgageStateAt([m], 240) // 20 jaar vooruit
    expect(r.balance).toBe(250_000)
    expect(r.monthlyPayment).toBe(700)
  })

  it('aflossingsvrij met end_date vóór trigger: saldo → 0', () => {
    const m = makeMortgage('a-1', {
      current_balance: 250_000,
      monthly_payment: 700,
      repayment_type: 'aflossingsvrij',
      end_date: '2035-01-01', // ~9 jaar in toekomst
    })
    const r = projectMortgageStateAt([m], 240) // 20 jaar vooruit → ná end_date
    expect(r.balance).toBe(0)
    expect(r.monthlyPayment).toBe(0)
  })

  it('annuïteit: saldo daalt over tijd (250K → ~140K na 120 mnd)', () => {
    const m = makeMortgage('a-1', {
      current_balance: 250_000,
      monthly_payment: 1500,
      interest_rate: 3.5,
      repayment_type: 'annuiteit',
    })
    const r = projectMortgageStateAt([m], 120) // 10 jaar
    expect(r.balance).toBeGreaterThan(120_000)
    expect(r.balance).toBeLessThan(160_000)
    expect(r.monthlyPayment).toBe(1500)
  })

  it('annuïteit afgelost vóór trigger: balance = 0, monthlyPayment = 0', () => {
    // 250K bij 3.5% en 1500/mnd lost af in ~228 mnd ≈ 19 jr
    const m = makeMortgage('a-1', {
      current_balance: 250_000,
      monthly_payment: 1500,
      interest_rate: 3.5,
      repayment_type: 'annuiteit',
    })
    const r = projectMortgageStateAt([m], 240) // 20 jaar — voorbij aflos-moment
    expect(r.balance).toBe(0)
    expect(r.monthlyPayment).toBe(0)
  })

  it('meerdere hypotheken worden gesommeerd', () => {
    const m1 = makeMortgage('a-1', {
      id: 'm-1',
      current_balance: 150_000,
      monthly_payment: 800,
      repayment_type: 'aflossingsvrij',
      end_date: '2060-01-01',
    })
    const m2 = makeMortgage('a-1', {
      id: 'm-2',
      current_balance: 100_000,
      monthly_payment: 600,
      repayment_type: 'aflossingsvrij',
      end_date: '2060-01-01',
    })
    const r = projectMortgageStateAt([m1, m2], 240)
    expect(r.balance).toBe(250_000)
    expect(r.monthlyPayment).toBe(1400)
  })

  it('respecteert net_worth_inclusion_pct bij saldo-aggregatie', () => {
    const m = makeMortgage('a-1', {
      current_balance: 250_000,
      monthly_payment: 1500,
      repayment_type: 'aflossingsvrij',
      end_date: '2060-01-01',
      net_worth_inclusion_pct: 50, // 50% gedeeld met partner
    })
    const r = projectMortgageStateAt([m], 240)
    expect(r.balance).toBe(125_000) // 250K × 50%
  })
})

// ── Downsize met annuïteit-projectie: realistisch scenario ────

describe('downsize × annuiteit-projectie (realistische scenarios)', () => {
  // fix #1: stableEigenHuis (expected_return=0) → WOZ-projectie blijft 480K
  // bij elke trigger; bestaande saleProceeds-assertions (460_800 etc.) blijven kloppen.
  const ctxAnnuity: HousingContext = {
    eigenHuisValue: 500_000,
    wozValue: 480_000,
    mortgageBalance: 250_000,
    mortgageMonthlyPayment: 1500,
    hasEigenHuis: true,
    eigenHuisMortgages: [
      makeMortgage('asset-eigen-huis-1', {
        current_balance: 250_000,
        monthly_payment: 1500,
        interest_rate: 3.5,
        repayment_type: 'annuiteit',
      }),
    ],
    eigenHuisAssets: [stableEigenHuis],
  }
  const baseDownsize = {
    mode: 'downsize' as const,
    trigger: 'fixed_age' as const,
    depletionThresholdYears: 2,
    salePricePct: 1.0,
    salesCostsPct: 0.04,
    newMonthlyHousingCost: null,
  }

  it('trigger 65 (mortgage afgelost): saleProceeds ≈ €460.800, geen mortgage-end-cashflow', () => {
    const events = getHousingLifeEvents({
      context: ctxAnnuity,
      currentAge: 45,
      endAge: 90,
      yearlyExpenses: 30_000,
      currentLiquidPortfolio: 200_000,
      config: { ...baseDownsize, triggerAge: 65 },
    })
    expect(events).toHaveLength(1)
    const meta = events[0].metadata as {
      cashflows: Array<{ id: string; amount: number }>
      saleProceeds: number
      mortgageBalanceAtTrigger: number
      mortgagePaymentAtTrigger: number
    }
    expect(meta.mortgageBalanceAtTrigger).toBe(0)
    expect(meta.mortgagePaymentAtTrigger).toBe(0)
    expect(meta.saleProceeds).toBeCloseTo(460_800) // 480K × 0.96 - 0
    expect(meta.cashflows.map((c) => c.id)).toEqual(['sale', 'new-rent'])
  })

  it('trigger 55 (mortgage nog actief): mortgage-end-cashflow + projected balance ~140K', () => {
    const events = getHousingLifeEvents({
      context: ctxAnnuity,
      currentAge: 45,
      endAge: 90,
      yearlyExpenses: 30_000,
      currentLiquidPortfolio: 200_000,
      config: { ...baseDownsize, triggerAge: 55 },
    })
    const meta = events[0].metadata as {
      cashflows: Array<{ id: string; amount: number }>
      saleProceeds: number
      mortgageBalanceAtTrigger: number
      mortgagePaymentAtTrigger: number
    }
    expect(meta.mortgageBalanceAtTrigger).toBeGreaterThan(120_000)
    expect(meta.mortgageBalanceAtTrigger).toBeLessThan(160_000)
    expect(meta.mortgagePaymentAtTrigger).toBe(1500)
    // saleProceeds = 480K × 0.96 - ~140K = ~320K
    expect(meta.saleProceeds).toBeGreaterThan(290_000)
    expect(meta.saleProceeds).toBeLessThan(340_000)
    // Drie cashflows: sale + mortgage-end-{debtId} + new-rent
    expect(meta.cashflows).toHaveLength(3)
    expect(meta.cashflows[0].id).toBe('sale')
    expect(meta.cashflows[1].id.startsWith('mortgage-end-')).toBe(true)
    expect(meta.cashflows[2].id).toBe('new-rent')
  })

  it('mortgage-end-cashflow loopt door tot oorspronkelijke einddatum hypotheek', () => {
    // Aflossingsvrije hypotheek met end_date 2055 (≈ 28 jaar van nu).
    // Trigger op leeftijd 55 (10 jaar van nu) → resterende looptijd
    // hypotheek ná trigger ≈ 18 jaar = 216 maanden.
    const ctxAflVrijLang: HousingContext = {
      eigenHuisValue: 500_000,
      wozValue: 480_000,
      mortgageBalance: 250_000,
      mortgageMonthlyPayment: 1500,
      hasEigenHuis: true,
      eigenHuisMortgages: [
        makeMortgage('asset-eigen-huis-1', {
          current_balance: 250_000,
          monthly_payment: 1500,
          repayment_type: 'aflossingsvrij',
          end_date: '2055-01-01',
        }),
      ],
      eigenHuisAssets: [stableEigenHuis],
    }
    const events = getHousingLifeEvents({
      context: ctxAflVrijLang,
      currentAge: 45,
      endAge: 90,
      yearlyExpenses: 30_000,
      currentLiquidPortfolio: 200_000,
      config: {
        mode: 'downsize',
        trigger: 'fixed_age',
        triggerAge: 55,
        depletionThresholdYears: 2,
        salePricePct: 1.0,
        salesCostsPct: 0.04,
        newMonthlyHousingCost: null,
      },
    })
    const meta = events[0].metadata as {
      cashflows: Array<{ id: string; durationMonths: number; type: string; indexed: boolean }>
      mortgageRemainingMonthsAtTrigger: number
    }
    const mortgageEnd = meta.cashflows.find((c) => c.id.startsWith('mortgage-end-'))!
    // remainingMonths van trigger (10 jr) tot end_date (28 jr) ≈ 18 jr
    expect(mortgageEnd.durationMonths).toBeGreaterThan(200)
    expect(mortgageEnd.durationMonths).toBeLessThan(230)

    // Nieuwe woonkosten blijven blijvend doorlopen (geïndexeerd)
    const rent = meta.cashflows.find((c) => c.id === 'new-rent')!
    expect(rent.durationMonths).toBe(0)
    expect(rent.indexed).toBe(true)

    // Metadata exposed remaining months voor UI breakdown
    expect(meta.mortgageRemainingMonthsAtTrigger).toBeGreaterThan(200)
  })

  it('reverse_mortgage trigger 67 (annuïteit afgelost): overwaarde = volledige woningwaarde', () => {
    const events = getHousingLifeEvents({
      context: ctxAnnuity,
      currentAge: 45,
      endAge: 90,
      yearlyExpenses: 30_000,
      currentLiquidPortfolio: 200_000,
      config: {
        mode: 'reverse_mortgage',
        trigger: 'fixed_age',
        triggerAge: 67,
        depletionThresholdYears: 2,
        maxLoanPct: 0.5,
        interestRate: 0.055,
        monthlyPayout: null,
      },
    })
    const meta = events[0].metadata as { equity: number; mortgageBalanceAtTrigger: number }
    expect(meta.mortgageBalanceAtTrigger).toBe(0)
    expect(meta.equity).toBe(500_000) // volledige woningwaarde want hypotheek weg
  })
})

// ── fix #1: WOZ groeit mee met expected_return ────────────────
//
// Demonstreert dat de geprojecteerde verkoopopbrengst en de geprojecteerde
// reverse-mortgage equity meegroeien met de eigen-woning-rendement-aanname.
// Vóór fix #1 werd `context.wozValue` direct gebruikt — over 20 jaar dezelfde
// €480K — wat verkoopopbrengsten en opeethypotheek-equity onrealistisch laag
// liet uitvallen.

describe('fix #1: WOZ-groei via expected_return', () => {
  // Huis met 2.5% jaarlijkse waardestijging (NL-marktconforme schatting).
  const groeiendHuis: Asset = makeEigenHuis({
    id: 'asset-eigen-huis-1',
    expected_return: 2.5,
    current_value: 500_000,
    woz_value: 480_000,
  })

  const ctxMetGroei: HousingContext = {
    eigenHuisValue: 500_000,
    wozValue: 480_000,
    mortgageBalance: 250_000,
    mortgageMonthlyPayment: 1500,
    hasEigenHuis: true,
    eigenHuisMortgages: [aflossingsvrijMortgage],
    eigenHuisAssets: [groeiendHuis],
  }

  it('downsize sale_proceeds groeit mee met expected_return (trigger 65)', () => {
    // 20 jaar groei: WOZ 480K × 1.025^20 ≈ 786_466
    // sale = 786_466 × 1.00 × 0.96 − 250_000 ≈ 505_007
    const events = getHousingLifeEvents({
      context: ctxMetGroei,
      currentAge: 45,
      endAge: 90,
      yearlyExpenses: 30_000,
      currentLiquidPortfolio: 200_000,
      config: {
        mode: 'downsize',
        trigger: 'fixed_age',
        triggerAge: 65,
        depletionThresholdYears: 2,
        salePricePct: 1.0,
        salesCostsPct: 0.04,
        newMonthlyHousingCost: null,
      },
    })
    const meta = events[0].metadata as {
      saleProceeds: number
      wozValue: number
      wozValueAtTrigger: number
    }
    // Huidige WOZ blijft 480K (display-veld); geprojecteerd is hoger.
    expect(meta.wozValue).toBe(480_000)
    // 480K × 1.025^20 ≈ 786K (±5K marge voor floating-point afronding).
    expect(meta.wozValueAtTrigger).toBeGreaterThan(780_000)
    expect(meta.wozValueAtTrigger).toBeLessThan(792_000)
    // saleProceeds ≈ 786K × 0.96 − 250_000 ≈ 505K
    expect(meta.saleProceeds).toBeGreaterThan(500_000)
    expect(meta.saleProceeds).toBeLessThan(510_000)
  })

  it('reverse_mortgage equity groeit mee met expected_return (trigger 67, aflossingsvrij)', () => {
    // 22 jaar groei op current_value 500K: 500K × 1.025^22 ≈ 859_138
    // equity = 859_138 − 250_000 = 609_138
    const events = getHousingLifeEvents({
      context: ctxMetGroei,
      currentAge: 45,
      endAge: 90,
      yearlyExpenses: 30_000,
      currentLiquidPortfolio: 200_000,
      config: {
        mode: 'reverse_mortgage',
        trigger: 'fixed_age',
        triggerAge: 67,
        depletionThresholdYears: 2,
        maxLoanPct: 0.5,
        interestRate: 0.055,
        monthlyPayout: null,
      },
    })
    const meta = events[0].metadata as {
      equity: number
      eigenHuisValue: number
      eigenHuisValueAtTrigger: number
    }
    expect(meta.eigenHuisValue).toBe(500_000)
    // 500K × 1.025^22 ≈ 859K (±5K marge voor floating-point afronding).
    expect(meta.eigenHuisValueAtTrigger).toBeGreaterThan(852_000)
    expect(meta.eigenHuisValueAtTrigger).toBeLessThan(866_000)
    // equity > de oude 250K omdat de woning gegroeid is (~609K).
    expect(meta.equity).toBeGreaterThan(600_000)
    expect(meta.equity).toBeLessThan(620_000)
  })

  it('zonder rendement (expected_return=0) blijft de oude waarde', () => {
    // Regressie: met stableEigenHuis (return=0) is sale = 480K × 0.96 − 250K = 210_800.
    const ctxStatic: HousingContext = {
      ...ctxMetGroei,
      eigenHuisAssets: [stableEigenHuis],
    }
    const events = getHousingLifeEvents({
      context: ctxStatic,
      currentAge: 45,
      endAge: 90,
      yearlyExpenses: 30_000,
      currentLiquidPortfolio: 200_000,
      config: {
        mode: 'downsize',
        trigger: 'fixed_age',
        triggerAge: 65,
        depletionThresholdYears: 2,
        salePricePct: 1.0,
        salesCostsPct: 0.04,
        newMonthlyHousingCost: null,
      },
    })
    const meta = events[0].metadata as { saleProceeds: number; wozValueAtTrigger: number }
    expect(meta.wozValueAtTrigger).toBe(480_000) // exact, want return=0
    expect(meta.saleProceeds).toBeCloseTo(210_800, 0)
  })
})

// ── fix #2: on_depletion trigger met portfolio-rendement ──────
//
// Demonstreert dat een positief reëel rendement op het liquide vermogen de
// crossover-leeftijd verlaat ten opzichte van het lineaire model.

describe('fix #2: on_depletion trigger met portfolio-rendement', () => {
  // Default fixture: 45-jarige, 200K liquide, 30K expenses, geen savings →
  // lineair valt liquide op nul na ceil(200/30) = 7 jaar → trigger op 52.
  // Met 5% gross / 2% inflatie ≈ 2.94% reëel rendement schuift de crossover
  // significant op (rendement compenseert deels de drawdown).
  const ctxRet: HousingContext = {
    eigenHuisValue: 500_000,
    wozValue: 480_000,
    mortgageBalance: 250_000,
    mortgageMonthlyPayment: 1500,
    hasEigenHuis: true,
    eigenHuisMortgages: [aflossingsvrijMortgage],
    eigenHuisAssets: [stableEigenHuis],
  }
  const baseInput = {
    context: ctxRet,
    currentAge: 45,
    endAge: 90,
    yearlyExpenses: 30_000,
    currentLiquidPortfolio: 200_000,
    config: {
      mode: 'downsize' as const,
      trigger: 'on_depletion' as const,
      triggerAge: 90,
      depletionThresholdYears: 2,
      salePricePct: 1.0,
      salesCostsPct: 0.04,
      newMonthlyHousingCost: null,
    },
  }

  it('crossover met realistische return valt later dan zonder return', () => {
    const eventsZonderReturn = getHousingLifeEvents({
      ...baseInput,
      grossReturn: 0,
      inflationRate: 0,
    })
    const eventsMetReturn = getHousingLifeEvents({
      ...baseInput,
      grossReturn: 0.05,
      inflationRate: 0.02,
    })
    const ageZonder = eventsZonderReturn[0].target_age
    const ageMet = eventsMetReturn[0].target_age
    // Lineair: 52. Met reëel rendement ~3%: trigger schuift door.
    expect(ageZonder).toBe(52)
    expect(ageMet).toBeGreaterThan(52)
  })

  it('zero return (grossReturn=0, inflationRate=0) levert het oude lineaire pad', () => {
    const events = getHousingLifeEvents({
      ...baseInput,
      grossReturn: 0,
      inflationRate: 0,
    })
    expect(events[0].target_age).toBe(52)
  })

  it('parameters niet gegeven → realReturn=0 → identiek aan zero return', () => {
    // Backwards compat: oude callers zonder rendement-parameters krijgen
    // hetzelfde resultaat als expliciet 0.
    const events = getHousingLifeEvents({
      context: ctxRet,
      currentAge: 45,
      endAge: 90,
      yearlyExpenses: 30_000,
      currentLiquidPortfolio: 200_000,
      config: baseInput.config,
    })
    expect(events[0].target_age).toBe(52)
  })
})

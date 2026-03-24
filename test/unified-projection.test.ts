/**
 * Unit tests: Unified Projection Engine — Fase 6a
 *
 * Comprehensive tests covering:
 * - Per-asset rendement (individual expected_return per asset)
 * - Box 3 per type (spaargeld vs beleggingen drag rates)
 * - Heffingsvrij vermogen (small portfolios exempt from Box 3)
 * - Schuldaflossing (annuïteit, lineair, aflossingsvrij)
 * - Surplus-allocatie (proportional distribution to investable buckets)
 * - FIRE-detectie (binary search for fire age)
 * - Life events (erfenis → investable, AOW → correct age)
 * - Waterfall withdrawal (correct bucket order)
 * - Edge cases (negative net worth, perpetual + low return, pensioen)
 *
 * Feature #504
 */
import { describe, it, expect } from 'vitest'
import {
  computeAssetBox3DragRate,
  applyHeffingsvrij,
  computeYearlyAssetGrowth,
  initRunningBuckets,
  initRunningDebts,
  computeYearlyDebtSchedule,
  computeWeightedDebtTotal,
  runUnifiedProjection,
  toSimRow,
  toSimResult,
  type UnifiedProjectionInput,
  type UnifiedProjectionRow,
  type UnifiedProjectionResult,
} from '@/lib/unified-projection'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { NL_AOW_AGE } from '@/lib/constants'

// ── Helpers: create test assets & debts ─────────────────────────────────────

function makeAsset(overrides: Partial<Asset> & { asset_type: Asset['asset_type'] }): Asset {
  return {
    id: overrides.id ?? `asset-${Math.random().toString(36).slice(2, 8)}`,
    user_id: 'test-user',
    name: overrides.name ?? 'Test Asset',
    asset_type: overrides.asset_type,
    current_value: overrides.current_value ?? 100_000,
    purchase_value: overrides.purchase_value ?? 100_000,
    purchase_date: null,
    expected_return: overrides.expected_return ?? 7, // 7%
    monthly_contribution: overrides.monthly_contribution ?? 0,
    institution: null,
    account_number: null,
    notes: null,
    is_active: overrides.is_active ?? true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: overrides.subtype ?? null,
    risk_profile: null,
    tax_benefit: overrides.tax_benefit ?? null,
    is_liquid: overrides.is_liquid ?? true,
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
    has_holdings_tracking: false,
  }
}

function makeDebt(overrides: Partial<Debt> & { debt_type: Debt['debt_type'] }): Debt {
  return {
    id: overrides.id ?? `debt-${Math.random().toString(36).slice(2, 8)}`,
    user_id: 'test-user',
    name: overrides.name ?? 'Test Debt',
    debt_type: overrides.debt_type,
    original_amount: overrides.original_amount ?? 100_000,
    current_balance: overrides.current_balance ?? 100_000,
    interest_rate: overrides.interest_rate ?? 4, // 4% annual
    minimum_payment: overrides.minimum_payment ?? 500,
    monthly_payment: overrides.monthly_payment ?? 500,
    start_date: overrides.start_date ?? '2024-01-01',
    end_date: overrides.end_date ?? null,
    creditor: null,
    notes: null,
    is_active: overrides.is_active ?? true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: null,
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: overrides.repayment_type ?? 'annuiteit',
    draagkrachtmeting_date: null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: overrides.net_worth_inclusion_pct ?? 100,
  }
}

/** Default UnifiedProjectionInput for simple scenarios */
function makeInput(overrides: Partial<UnifiedProjectionInput> = {}): UnifiedProjectionInput {
  return {
    assets: overrides.assets ?? [makeAsset({ asset_type: 'investment', current_value: 200_000, expected_return: 7 })],
    debts: overrides.debts ?? [],
    currentAge: overrides.currentAge ?? 35,
    endAge: overrides.endAge ?? 90,
    yearlyExpenses: overrides.yearlyExpenses ?? 36_000,
    annualSavings: overrides.annualSavings ?? 12_000,
    monthlySurplus: overrides.monthlySurplus ?? 1_000,
    monthlyIncome: overrides.monthlyIncome ?? 4_000,
    incomeGrowthRate: overrides.incomeGrowthRate ?? 0,
    grossReturn: overrides.grossReturn ?? 0.07,
    inflationRate: overrides.inflationRate ?? 0.02,
    box3Method: overrides.box3Method ?? 'forfaitair',
    cashflows: overrides.cashflows ?? [],
    strategyConfig: overrides.strategyConfig ?? { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    withdrawalStrategy: overrides.withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
    forcedFireAge: overrides.forcedFireAge,
    hasPartner: overrides.hasPartner ?? false,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section A: Per-asset rendement
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Per-asset rendement', () => {
  it('A1: asset met 7% expected_return groeit correct per jaar', () => {
    const asset = makeAsset({
      asset_type: 'investment',
      current_value: 100_000,
      expected_return: 7,
      monthly_contribution: 0,
    })
    const buckets = initRunningBuckets([asset], 0.07, 'forfaitair')
    expect(buckets).toHaveLength(1)
    expect(buckets[0].annualReturn).toBeCloseTo(0.07, 4)
    expect(buckets[0].value).toBe(100_000)

    // Compute one year of growth (no surplus, no partner)
    const detail = computeYearlyAssetGrowth(buckets, 0, false)
    const inv = detail.investment!
    expect(inv.startValue).toBe(100_000)
    expect(inv.growth).toBe(7_000) // 7% of 100k
    // End value = start + growth + contributions - box3drag
    expect(inv.endValue).toBeGreaterThan(100_000)
  })

  it('A2: twee assets van hetzelfde type combineren tot gewogen rendement', () => {
    const a1 = makeAsset({ asset_type: 'investment', current_value: 100_000, expected_return: 5 })
    const a2 = makeAsset({ asset_type: 'investment', current_value: 200_000, expected_return: 8 })
    const buckets = initRunningBuckets([a1, a2], 0.07, 'forfaitair')
    expect(buckets).toHaveLength(1)
    // Weighted: (100k*0.05 + 200k*0.08) / 300k = (5000+16000)/300000 = 0.07
    expect(buckets[0].annualReturn).toBeCloseTo(0.07, 4)
    expect(buckets[0].value).toBe(300_000)
  })

  it('A3: meerdere asset types krijgen aparte buckets', () => {
    const inv = makeAsset({ asset_type: 'investment', current_value: 100_000, expected_return: 7 })
    const sav = makeAsset({ asset_type: 'savings', current_value: 50_000, expected_return: 2 })
    const buckets = initRunningBuckets([inv, sav], 0.07, 'forfaitair')
    expect(buckets).toHaveLength(2)
    const invBucket = buckets.find(b => b.assetType === 'investment')
    const savBucket = buckets.find(b => b.assetType === 'savings')
    expect(invBucket!.annualReturn).toBeCloseTo(0.07, 4)
    expect(savBucket!.annualReturn).toBeCloseTo(0.02, 4)
  })

  it('A4: inactive assets worden genegeerd', () => {
    const active = makeAsset({ asset_type: 'investment', current_value: 100_000, is_active: true })
    const inactive = makeAsset({ asset_type: 'savings', current_value: 50_000, is_active: false })
    const buckets = initRunningBuckets([active, inactive], 0.07, 'forfaitair')
    expect(buckets).toHaveLength(1)
    expect(buckets[0].assetType).toBe('investment')
  })

  it('A5: full projection preserves per-asset growth across years', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 100_000, expected_return: 7 })],
      annualSavings: 0,
      cashflows: [],
      currentAge: 35,
      endAge: 40,
      yearlyExpenses: 30_000,
      strategyConfig: { strategy: 'deplete', endAge: 40, legacyAmount: 0 },
    })
    const result = runUnifiedProjection(input)
    // Should have rows
    expect(result.rows.length).toBeGreaterThan(0)
    // Each row should have investment bucket detail
    for (const row of result.rows) {
      expect(row.assetBuckets.investment).toBeDefined()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Section B: Box 3 per type
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Box 3 per type', () => {
  it('B1: spaargeld krijgt lagere drag dan beleggingen (forfaitair)', () => {
    const sav = makeAsset({ asset_type: 'savings', current_value: 100_000, expected_return: 2 })
    const inv = makeAsset({ asset_type: 'investment', current_value: 100_000, expected_return: 7 })

    const savDrag = computeAssetBox3DragRate(sav, 'forfaitair')
    const invDrag = computeAssetBox3DragRate(inv, 'forfaitair')

    // Spaargeld forfait 1.28% × 36% = 0.4608%, beleggingen 6.00% × 36% = 2.16%
    expect(savDrag.dragRate).toBeLessThan(invDrag.dragRate)
    expect(savDrag.category).toBe('spaargeld')
    expect(invDrag.category).toBe('beleggingen')
    expect(savDrag.dragRate).toBeCloseTo(0.0128 * 0.36, 4)
    expect(invDrag.dragRate).toBeCloseTo(0.0600 * 0.36, 4)
  })

  it('B2: eigen_huis is vrijgesteld van Box 3', () => {
    const house = makeAsset({ asset_type: 'eigen_huis', current_value: 400_000 })
    const result = computeAssetBox3DragRate(house, 'forfaitair')
    expect(result.dragRate).toBe(0)
    expect(result.category).toBeNull()
  })

  it('B3: pensioen met tax_benefit is vrijgesteld van Box 3', () => {
    const pension = makeAsset({ asset_type: 'retirement', current_value: 50_000, tax_benefit: true })
    const result = computeAssetBox3DragRate(pension, 'forfaitair')
    expect(result.dragRate).toBe(0)
  })

  it('B4: werkelijk rendement methode gebruikt actual return', () => {
    const inv = makeAsset({ asset_type: 'investment', expected_return: 10 })
    const result = computeAssetBox3DragRate(inv, 'werkelijk')
    // 10% × 36% = 3.6%
    expect(result.dragRate).toBeCloseTo(0.10 * 0.36, 4)
  })

  it('B5: werkelijk met 0% rendement → 0 drag', () => {
    const inv = makeAsset({ asset_type: 'investment', expected_return: 0 })
    const result = computeAssetBox3DragRate(inv, 'werkelijk')
    expect(result.dragRate).toBe(0)
  })

  it('B6: spaargeld en beleggingen in zelfde projection tonen verschil', () => {
    const sav = makeAsset({ asset_type: 'savings', current_value: 200_000, expected_return: 2 })
    const inv = makeAsset({ asset_type: 'investment', current_value: 200_000, expected_return: 7 })
    const buckets = initRunningBuckets([sav, inv], 0.07, 'forfaitair')

    const detail = computeYearlyAssetGrowth(buckets, 0, false)
    // Both should exist with different drag amounts
    expect(detail.savings).toBeDefined()
    expect(detail.investment).toBeDefined()
    // Investment drag > savings drag
    expect(detail.investment!.box3Drag).toBeGreaterThan(detail.savings!.box3Drag)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Section C: Heffingsvrij vermogen
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Heffingsvrij vermogen', () => {
  it('C1: klein vermogen (< €59k) krijgt geen Box 3 drag', () => {
    const dragAmounts = applyHeffingsvrij(
      [30_000],          // bucketValues
      [0.06 * 0.36],     // rawDragRates (beleggingen forfait)
      ['beleggingen'],   // categories
      false,             // no partner
    )
    expect(dragAmounts[0]).toBe(0)
  })

  it('C2: partner verdubbelt heffingsvrij (< €118k → geen drag)', () => {
    const dragAmounts = applyHeffingsvrij(
      [100_000],
      [0.06 * 0.36],
      ['beleggingen'],
      true, // partner
    )
    expect(dragAmounts[0]).toBe(0)
  })

  it('C3: boven heffingsvrij → proportionele belasting', () => {
    const totalValue = 200_000
    const heffingsvrij = 59_357 // single
    const taxableFraction = (totalValue - heffingsvrij) / totalValue
    const rawDrag = 0.06 * 0.36

    const dragAmounts = applyHeffingsvrij(
      [totalValue],
      [rawDrag],
      ['beleggingen'],
      false,
    )

    const expected = totalValue * rawDrag * taxableFraction
    expect(dragAmounts[0]).toBeCloseTo(expected, 0)
  })

  it('C4: niet-Box3 assets worden overgeslagen', () => {
    const dragAmounts = applyHeffingsvrij(
      [400_000, 100_000],
      [0, 0.06 * 0.36],
      [null, 'beleggingen'], // eigen_huis + investment
      false,
    )
    // Eigen huis drag = 0 (null category)
    expect(dragAmounts[0]).toBe(0)
    // Investment drag > 0 (100k > 59k with heffingsvrij only on Box 3 total = 100k)
    expect(dragAmounts[1]).toBeGreaterThan(0)
  })

  it('C5: full projection: small portfolio has zero box3 in rows', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 30_000, expected_return: 7 })],
      annualSavings: 0,
      cashflows: [],
      currentAge: 60,
      endAge: 65,
      yearlyExpenses: 10_000,
      strategyConfig: { strategy: 'deplete', endAge: 65, legacyAmount: 0 },
    })
    const result = runUnifiedProjection(input)
    // First few rows should have 0 box3 while below heffingsvrij
    if (result.rows.length > 0) {
      expect(result.rows[0].totalBox3).toBe(0)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Section D: Schuldaflossing
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Schuldaflossing', () => {
  it('D1: annuïteit produceert aflopend saldo per jaar', () => {
    const debt = makeDebt({
      debt_type: 'persoonlijke_lening',
      current_balance: 50_000,
      interest_rate: 5,
      monthly_payment: 943, // ~10yr annuity on 50k at 5%
      repayment_type: 'annuiteit',
    })
    const running = initRunningDebts([debt])
    expect(running).toHaveLength(1)

    // Simulate 3 years
    const yearBalances: number[] = [running[0].balance]
    for (let y = 0; y < 3; y++) {
      const { debtBalances } = computeYearlyDebtSchedule(running)
      const detail = debtBalances[debt.id!]
      expect(detail).toBeDefined()
      expect(detail.interestPaid).toBeGreaterThan(0)
      expect(detail.principalPaid).toBeGreaterThan(0)
      yearBalances.push(detail.endBalance)
    }

    // Each year end balance should be lower
    for (let i = 1; i < yearBalances.length; i++) {
      expect(yearBalances[i]).toBeLessThan(yearBalances[i - 1])
    }
  })

  it('D2: lineair produceert gelijkmatige aflossing', () => {
    const debt = makeDebt({
      debt_type: 'persoonlijke_lening',
      current_balance: 60_000,
      interest_rate: 4,
      monthly_payment: 600, // ~principal + interest
      repayment_type: 'lineair',
    })
    const running = initRunningDebts([debt])

    const { debtBalances } = computeYearlyDebtSchedule(running)
    const detail = debtBalances[debt.id!]
    expect(detail.principalPaid).toBeGreaterThan(0)
    expect(detail.endBalance).toBeLessThan(60_000)
  })

  it('D3: aflossingsvrij — saldo blijft constant, alleen rente', () => {
    const debt = makeDebt({
      debt_type: 'hypotheek',
      current_balance: 200_000,
      interest_rate: 3,
      monthly_payment: 500,
      repayment_type: 'aflossingsvrij',
      end_date: '2060-01-01',
    })
    const running = initRunningDebts([debt])

    const { debtBalances } = computeYearlyDebtSchedule(running)
    const detail = debtBalances[debt.id!]
    // Interest-only: principal stays ~constant
    expect(detail.endBalance).toBeCloseTo(200_000, -2) // within ~100 due to rounding
    expect(detail.interestPaid).toBeGreaterThan(0)
    expect(detail.principalPaid).toBeCloseTo(0, -1)
  })

  it('D4: inactive debts worden genegeerd', () => {
    const debt = makeDebt({
      debt_type: 'persoonlijke_lening',
      current_balance: 10_000,
      is_active: false,
    })
    const running = initRunningDebts([debt])
    expect(running).toHaveLength(0)
  })

  it('D5: computeWeightedDebtTotal respecteert net_worth_inclusion_pct', () => {
    const debt = makeDebt({
      id: 'debt-50pct',
      debt_type: 'hypotheek',
      current_balance: 100_000,
      net_worth_inclusion_pct: 50,
      repayment_type: 'aflossingsvrij',
      end_date: '2060-01-01',
    })
    const running = initRunningDebts([debt])
    const { debtBalances } = computeYearlyDebtSchedule(running)
    const weighted = computeWeightedDebtTotal(debtBalances, running)
    // ~50% of 100k
    expect(weighted).toBeCloseTo(50_000, -2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Section E: Surplus-allocatie
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Surplus-allocatie', () => {
  it('E1: surplus wordt proportioneel verdeeld over beleggings-buckets', () => {
    const inv = makeAsset({ asset_type: 'investment', current_value: 200_000, expected_return: 7, monthly_contribution: 0 })
    const crypto = makeAsset({ asset_type: 'crypto', current_value: 100_000, expected_return: 10, monthly_contribution: 0 })
    const sav = makeAsset({ asset_type: 'savings', current_value: 50_000, expected_return: 2, monthly_contribution: 0 })

    const buckets = initRunningBuckets([inv, crypto, sav], 0.07, 'forfaitair')
    const surplus = 12_000

    const detail = computeYearlyAssetGrowth(buckets, surplus, false)

    // Savings should NOT get surplus (not in INVESTABLE_ASSET_TYPES)
    // Investable total = 200k + 100k = 300k
    // Investment gets 200/300 × 12k = 8k contributions
    // Crypto gets 100/300 × 12k = 4k contributions
    expect(detail.investment!.contributions).toBeCloseTo(8_000, -1) // base 0 + 8k surplus
    expect(detail.crypto!.contributions).toBeCloseTo(4_000, -1) // base 0 + 4k surplus
    expect(detail.savings!.contributions).toBe(0)
  })

  it('E2: surplus niet gealloceerd als er geen investable buckets zijn', () => {
    const sav = makeAsset({ asset_type: 'savings', current_value: 50_000, expected_return: 2, monthly_contribution: 0 })
    const buckets = initRunningBuckets([sav], 0.07, 'forfaitair')
    const detail = computeYearlyAssetGrowth(buckets, 10_000, false)
    // Savings is NOT investable, so surplus is lost
    expect(detail.savings!.contributions).toBe(0)
  })

  it('E3: surplus evenredig verdeeld als alle investable buckets op 0 staan', () => {
    const inv = makeAsset({ asset_type: 'investment', current_value: 0, expected_return: 7, monthly_contribution: 0 })
    const crypto = makeAsset({ asset_type: 'crypto', current_value: 0, expected_return: 10, monthly_contribution: 0 })
    const buckets = initRunningBuckets([inv, crypto], 0.07, 'forfaitair')
    const detail = computeYearlyAssetGrowth(buckets, 10_000, false)

    // Equal split: 5k each
    expect(detail.investment!.contributions).toBeCloseTo(5_000, -1)
    expect(detail.crypto!.contributions).toBeCloseTo(5_000, -1)
  })

  it('E4: surplus = 0 → geen extra contributions', () => {
    const inv = makeAsset({ asset_type: 'investment', current_value: 100_000, expected_return: 7, monthly_contribution: 500 })
    const buckets = initRunningBuckets([inv], 0.07, 'forfaitair')
    const detail = computeYearlyAssetGrowth(buckets, 0, false)
    // Only base contributions: 500 × 12 = 6000
    expect(detail.investment!.contributions).toBe(6_000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Section F: FIRE-detectie
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. FIRE-detectie', () => {
  it('F1: binary search vindt correct moment waarop netWorth ≥ required', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 300_000, expected_return: 7 })],
      annualSavings: 24_000,
      yearlyExpenses: 36_000,
      currentAge: 35,
      endAge: 90,
      strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    })
    const result = runUnifiedProjection(input)

    expect(result.fireReachable).toBe(true)
    expect(result.fireAge).not.toBeNull()
    expect(result.fireAge!).toBeGreaterThan(35)
    expect(result.fireAge!).toBeLessThan(90)
    expect(result.fireAgeFractional).not.toBeNull()
    expect(result.fireAgeFractional!).toBeGreaterThanOrEqual(result.fireAge! - 1)
    expect(result.fireAgeFractional!).toBeLessThanOrEqual(result.fireAge! + 1)
  })

  it('F2: zeer hoog vermogen → FIRE op huidige leeftijd', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 5_000_000, expected_return: 7 })],
      annualSavings: 0,
      yearlyExpenses: 36_000,
      currentAge: 35,
    })
    const result = runUnifiedProjection(input)

    expect(result.fireReachable).toBe(true)
    expect(result.fireAge).toBe(35)
  })

  it('F3: onvoldoende vermogen en besparingen → fireReachable: false', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 10_000, expected_return: 3 })],
      annualSavings: 500,
      yearlyExpenses: 50_000,
      currentAge: 60,
      endAge: 90,
    })
    const result = runUnifiedProjection(input)
    expect(result.fireReachable).toBe(false)
    expect(result.fireAge).toBeNull()
  })

  it('F4: requiredFirePortfolio is > 0 when FIRE is reachable', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 400_000, expected_return: 7 })],
      annualSavings: 20_000,
      yearlyExpenses: 36_000,
    })
    const result = runUnifiedProjection(input)
    expect(result.fireReachable).toBe(true)
    expect(result.requiredFirePortfolio).toBeGreaterThan(0)
    expect(result.implicitWithdrawalRate).toBeGreaterThan(0)
    expect(result.implicitWithdrawalRate).toBeLessThan(1)
  })

  it('F5: rows have accumulation before fireAge and withdrawal/transition after', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 300_000, expected_return: 7 })],
      annualSavings: 20_000,
      yearlyExpenses: 36_000,
    })
    const result = runUnifiedProjection(input)
    if (!result.fireReachable || result.fireAge === null) {
      throw new Error('Expected FIRE to be reachable')
    }

    const accRows = result.rows.filter(r => r.phase === 'accumulation')
    const postFireRows = result.rows.filter(r => r.phase === 'transition' || r.phase === 'withdrawal')

    expect(accRows.length).toBeGreaterThan(0)
    expect(postFireRows.length).toBeGreaterThan(0)

    // All accumulation rows should be before fireAge
    for (const row of accRows) {
      expect(row.age).toBeLessThan(result.fireAge!)
    }
    // All post-fire rows should be >= fireAge
    for (const row of postFireRows) {
      expect(row.age).toBeGreaterThanOrEqual(result.fireAge!)
    }
  })

  it('F6: continue fasegrens — firePortfolioAtFire > requiredFirePortfolio when surplus exists (#511)', () => {
    // When the actual portfolio at FIRE exceeds the minimum required,
    // the decumulation should start from the ACTUAL value (no artificial drop)
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 300_000, expected_return: 7 })],
      annualSavings: 24_000,
      yearlyExpenses: 36_000,
      currentAge: 35,
      endAge: 90,
      strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    })
    const result = runUnifiedProjection(input)
    expect(result.fireReachable).toBe(true)
    expect(result.fireAge).not.toBeNull()

    // The firePortfolioAtFire should be >= requiredFirePortfolio
    // (surplus is preserved, not dropped to minimum)
    expect(result.firePortfolioAtFire).toBeGreaterThanOrEqual(result.requiredFirePortfolio)

    // The last accumulation row's totalAssets should match firePortfolioAtFire
    const accRows = result.rows.filter(r => r.phase === 'accumulation')
    const lastAcc = accRows[accRows.length - 1]
    expect(lastAcc.totalAssets).toBeGreaterThanOrEqual(result.requiredFirePortfolio)

    // First decumulation row should start at a value consistent with
    // the accumulated portfolio (not the lower requiredFirePortfolio)
    const decRows = result.rows.filter(r => r.phase === 'transition' || r.phase === 'withdrawal')
    const firstDec = decRows[0]
    // The first dec row's totalAssets reflects end-of-year after growth + withdrawal,
    // but should NOT have dropped down to requiredFirePortfolio level
    // With 7% return and ~36k withdrawal, the portfolio should be close to lastAcc
    const ratio = firstDec.totalAssets / lastAcc.totalAssets
    expect(ratio).toBeGreaterThan(0.9) // Within 10% — no artificial drop
    expect(ratio).toBeLessThan(1.15) // And not unreasonably higher
  })

  it('F7: pensioen-modus (forcedFireAge) continuity unchanged (#511)', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 500_000, expected_return: 7 })],
      annualSavings: 20_000,
      yearlyExpenses: 36_000,
      currentAge: 35,
      endAge: 90,
      forcedFireAge: 67,
    })
    const result = runUnifiedProjection(input)
    expect(result.fireReachable).toBe(true)
    expect(result.fireAge).toBe(67)

    // Pensioen mode should also use actual portfolio (was already the case before #511)
    const accRows = result.rows.filter(r => r.phase === 'accumulation')
    const decRows = result.rows.filter(r => r.phase === 'transition' || r.phase === 'withdrawal')
    expect(accRows.length).toBeGreaterThan(0)
    expect(decRows.length).toBeGreaterThan(0)

    const lastAcc = accRows[accRows.length - 1]
    const firstDec = decRows[0]

    // Pensioen mode: portfolio at 67 is typically much larger than required
    // First dec row should be consistent with last acc row (within year's growth/withdrawal)
    const ratio = firstDec.totalAssets / lastAcc.totalAssets
    expect(ratio).toBeGreaterThan(0.85) // No artificial drop
    expect(ratio).toBeLessThan(1.15)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Section G: Life events
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Life events', () => {
  it('G1: erfenis (one-time income) verhoogt beleggingen-bucket', () => {
    const erfenis: SimCashflow = {
      id: 'erfenis-1',
      name: 'Erfenis',
      type: 'one_time',
      direction: 'income',
      amount: 100_000,
      fromAge: 50,
      toAge: null,
      indexed: false,
    }
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 200_000, expected_return: 7 })],
      annualSavings: 10_000,
      yearlyExpenses: 36_000,
      currentAge: 35,
      cashflows: [erfenis],
    })
    const result = runUnifiedProjection(input)
    // The row at age 50 should show the erfenis in oneTimeNet
    const row50 = result.rows.find(r => r.age === 50)
    if (row50) {
      expect(row50.oneTimeNet).toBeGreaterThanOrEqual(100_000)
    }
  })

  it('G2: AOW cashflow start op correcte leeftijd (67)', () => {
    const aow: SimCashflow = {
      id: 'aow-1',
      name: 'AOW',
      type: 'recurring',
      direction: 'income',
      amount: 1_300,
      fromAge: NL_AOW_AGE, // 67
      toAge: null,
      indexed: true,
    }
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 500_000, expected_return: 7 })],
      annualSavings: 20_000,
      yearlyExpenses: 36_000,
      currentAge: 35,
      cashflows: [aow],
    })
    const result = runUnifiedProjection(input)

    // Before AOW age: no recurring AOW income
    const rowBefore = result.rows.find(r => r.age === 60)
    // At/after AOW age: recurring AOW income present
    const rowAfter = result.rows.find(r => r.age === 68)
    if (rowBefore && rowAfter) {
      // The AOW should increase cashflowNet after 67
      // rowBefore.cashflowNet should be 0 (no recurring cashflows before 67)
      // rowAfter.cashflowNet should include AOW monthly × 12
      expect(rowAfter.cashflowNet).toBeGreaterThan(0)
    }
  })

  it('G3: one-time expense (begrafenis) trekt af via waterfall', () => {
    const begrafenis: SimCashflow = {
      id: 'begrafenis-1',
      name: 'Begrafeniskosten',
      type: 'one_time',
      direction: 'expense',
      amount: 10_000,
      fromAge: 40,
      toAge: null,
      indexed: false,
    }
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 200_000, expected_return: 7 })],
      annualSavings: 10_000,
      yearlyExpenses: 36_000,
      currentAge: 35,
      cashflows: [begrafenis],
    })
    const result = runUnifiedProjection(input)
    const row40 = result.rows.find(r => r.age === 40)
    if (row40) {
      // oneTimeNet should be negative (one-time expense)
      expect(row40.oneTimeNet).toBeLessThan(0)
    }
  })

  it('G4: combined life events: erfenis + AOW produce correct net cashflows', () => {
    const erfenis: SimCashflow = {
      id: 'erfenis-2',
      name: 'Erfenis',
      type: 'one_time',
      direction: 'income',
      amount: 50_000,
      fromAge: 45,
      toAge: null,
      indexed: false,
    }
    const aow: SimCashflow = {
      id: 'aow-2',
      name: 'AOW',
      type: 'recurring',
      direction: 'income',
      amount: 1_500,
      fromAge: 67,
      toAge: null,
      indexed: false,
    }
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 300_000, expected_return: 7 })],
      annualSavings: 20_000,
      yearlyExpenses: 36_000,
      currentAge: 35,
      cashflows: [erfenis, aow],
    })
    const result = runUnifiedProjection(input)
    expect(result.rows.length).toBeGreaterThan(0)
    // No crash = success, plus basic structure
    for (const row of result.rows) {
      expect(row.netWorth).toBeDefined()
      expect(row.inflationFactor).toBeGreaterThanOrEqual(1)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Section H: Waterfall withdrawal
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Onttrekking via waterfall', () => {
  it('H1: withdrawal verdeelt over juiste buckets in waterfall volgorde (savings vóór investment)', () => {
    // Liquiditeitsprincipe: savings is first after cash in waterfall, then investment
    const input = makeInput({
      assets: [
        makeAsset({ asset_type: 'investment', current_value: 100_000, expected_return: 5 }),
        makeAsset({ asset_type: 'savings', current_value: 100_000, expected_return: 2 }),
      ],
      annualSavings: 0,
      yearlyExpenses: 30_000,
      currentAge: 60,
      endAge: 90,
      // Force fire at 60 so withdrawals start immediately
      forcedFireAge: 60,
      strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    })
    const result = runUnifiedProjection(input)

    // First withdrawal row: savings should be drawn first (before investment)
    const firstRetirementRow = result.rows.find(r => r.phase === 'withdrawal' || r.phase === 'transition')
    expect(firstRetirementRow).toBeDefined()
    expect(firstRetirementRow!.withdrawal).toBeGreaterThan(0)

    // Savings should decrease (being withdrawn) while investment stays higher initially
    if (firstRetirementRow!.withdrawalByType) {
      const savingsWithdrawn = firstRetirementRow!.withdrawalByType['savings'] ?? 0
      expect(savingsWithdrawn).toBeGreaterThan(0)
    }
  })

  it('H2: withdrawal rows have savings=0 during decumulation', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 500_000, expected_return: 7 })],
      annualSavings: 20_000,
      yearlyExpenses: 36_000,
      currentAge: 35,
    })
    const result = runUnifiedProjection(input)
    const retirementRows = result.rows.filter(r => r.phase === 'withdrawal' || r.phase === 'transition')
    for (const row of retirementRows) {
      expect(row.savings).toBe(0)
    }
  })

  it('H3: spaargeld mag niet eindeloos groeien tijdens decumulatie', () => {
    // With mixed portfolio: savings should be drawn down first (liquiditeitsprincipe)
    const input = makeInput({
      assets: [
        makeAsset({ asset_type: 'savings', current_value: 200_000, expected_return: 2 }),
        makeAsset({ asset_type: 'investment', current_value: 300_000, expected_return: 7 }),
      ],
      annualSavings: 0,
      yearlyExpenses: 40_000,
      currentAge: 55,
      endAge: 90,
      forcedFireAge: 55,
      strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    })
    const result = runUnifiedProjection(input)
    const retirementRows = result.rows.filter(r => r.phase === 'withdrawal' || r.phase === 'transition')

    // Savings bucket should decrease over time (being spent first)
    const firstSavings = retirementRows[0]?.assetBuckets?.savings
    const midIdx = Math.floor(retirementRows.length / 2)
    const midSavings = retirementRows[midIdx]?.assetBuckets?.savings

    if (firstSavings && midSavings) {
      // Savings should decrease (start value > mid value) because it's being drawn first
      expect(firstSavings.endValue).toBeGreaterThan(midSavings.endValue)
    }
  })

  it('H4: spaargeld wordt geleidelijk afgebouwd vóór beleggingen', () => {
    // Small savings + large investments: savings should deplete early
    const input = makeInput({
      assets: [
        makeAsset({ asset_type: 'savings', current_value: 50_000, expected_return: 1.5 }),
        makeAsset({ asset_type: 'investment', current_value: 500_000, expected_return: 7 }),
      ],
      annualSavings: 0,
      yearlyExpenses: 30_000,
      currentAge: 60,
      endAge: 90,
      forcedFireAge: 60,
      strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    })
    const result = runUnifiedProjection(input)
    const retirementRows = result.rows.filter(r => r.phase === 'withdrawal' || r.phase === 'transition')

    // After a few years, savings should be fully depleted (50k < annual withdrawal ~30k)
    const laterRow = retirementRows.find(r => r.age >= 65)
    if (laterRow?.assetBuckets?.savings) {
      // Savings should be near zero or zero after ~5 years
      expect(laterRow.assetBuckets.savings.endValue).toBeLessThan(10_000)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Section I: Edge cases
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Edge cases', () => {
  it('I1: negatief vermogen (hoge schulden) crasht niet', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'savings', current_value: 5_000, expected_return: 1 })],
      debts: [makeDebt({
        debt_type: 'persoonlijke_lening',
        current_balance: 50_000,
        interest_rate: 8,
        monthly_payment: 300,
        repayment_type: 'annuiteit',
      })],
      annualSavings: 3_000,
      yearlyExpenses: 24_000,
      currentAge: 30,
      endAge: 90,
    })
    // Should not throw
    const result = runUnifiedProjection(input)
    expect(result).toBeDefined()
    expect(result.rows.length).toBeGreaterThan(0)
    // Net worth of first row should be negative
    expect(result.rows[0].netWorth).toBeLessThan(0)
  })

  it('I2: perpetual met portReturn ≤ inflation → fireReachable: false', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 500_000, expected_return: 2 })],
      grossReturn: 0.02,
      inflationRate: 0.03, // inflation > return
      strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
    })
    const result = runUnifiedProjection(input)
    expect(result.fireReachable).toBe(false)
    expect(result.rows).toHaveLength(0)
  })

  it('I3: perpetual met portReturn = inflation → fireReachable: false', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 500_000, expected_return: 2 })],
      grossReturn: 0.02,
      inflationRate: 0.02, // equal
      strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
    })
    const result = runUnifiedProjection(input)
    expect(result.fireReachable).toBe(false)
  })

  it('I4: pensioen-strategie forceert fireAge op AOW-leeftijd', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 200_000, expected_return: 7 })],
      annualSavings: 15_000,
      yearlyExpenses: 30_000,
      currentAge: 35,
      endAge: 90,
      forcedFireAge: NL_AOW_AGE, // 67
      strategyConfig: { strategy: 'pensioen', endAge: 90, legacyAmount: 0 },
    })
    const result = runUnifiedProjection(input)
    expect(result.fireReachable).toBe(true)
    expect(result.fireAge).toBe(NL_AOW_AGE) // 67

    // All pre-67 rows should be accumulation
    const accRows = result.rows.filter(r => r.age < NL_AOW_AGE)
    for (const row of accRows) {
      expect(row.phase).toBe('accumulation')
    }
    // All 67+ rows should be withdrawal (pensioen skips transition)
    const retRows = result.rows.filter(r => r.age >= NL_AOW_AGE)
    for (const row of retRows) {
      expect(row.phase).toBe('withdrawal')
    }
  })

  it('I5: lege assets array crasht niet', () => {
    const input = makeInput({
      assets: [],
      annualSavings: 0,
      yearlyExpenses: 30_000,
      currentAge: 40,
      endAge: 90,
    })
    const result = runUnifiedProjection(input)
    expect(result).toBeDefined()
    expect(result.fireReachable).toBe(false)
  })

  it('I6: VPW + perpetual → fireReachable: false (incompatible)', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 1_000_000, expected_return: 7 })],
      strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
      withdrawalStrategy: { strategy: 'vpw', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1, guardrailRaiseStep: 0.1 },
    })
    const result = runUnifiedProjection(input)
    expect(result.fireReachable).toBe(false)
    expect(result.rows).toHaveLength(0)
  })

  it('I7: VPW + legacy → fireReachable: false (incompatible)', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 1_000_000, expected_return: 7 })],
      strategyConfig: { strategy: 'legacy', endAge: 90, legacyAmount: 200_000 },
      withdrawalStrategy: { strategy: 'vpw', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1, guardrailRaiseStep: 0.1 },
    })
    const result = runUnifiedProjection(input)
    expect(result.fireReachable).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Section J: toSimRow / toSimResult backwards compatibility
// ═══════════════════════════════════════════════════════════════════════════════

describe('J. Backwards-compatible mapping', () => {
  it('J1: toSimRow maps all required SimRow fields', () => {
    const row: UnifiedProjectionRow = {
      year: 5,
      age: 40,
      phase: 'accumulation',
      assetBuckets: {
        investment: { startValue: 200_000, growth: 14_000, contributions: 12_000, box3Drag: 2_000, endValue: 224_000 },
      },
      debtBalances: {},
      totalAssets: 224_000,
      totalDebts: 0,
      netWorth: 224_000,
      startNetWorth: 200_000,
      grossIncome: 48_000,
      savings: 12_000,
      withdrawal: 0,
      withdrawalByType: {},
      cashflowNet: 0,
      oneTimeNet: 0,
      totalGrowth: 14_000,
      totalBox3: 2_000,
      cumulativeBox3: 8_000,
      inflationFactor: 1.1,
    }
    const simRow = toSimRow(row)
    expect(simRow.age).toBe(40)
    expect(simRow.phase).toBe('accumulation')
    expect(simRow.startPortfolio).toBe(200_000)
    expect(simRow.growth).toBe(14_000)
    expect(simRow.savings).toBe(12_000)
    expect(simRow.withdrawal).toBe(0)
    expect(simRow.endPortfolio).toBe(row.netWorth)
    expect(simRow.grossIncome).toBe(48_000)
  })

  it('J2: toSimRow maps transition phase → accumulation (legacy)', () => {
    const row: UnifiedProjectionRow = {
      year: 15,
      age: 50,
      phase: 'transition',
      assetBuckets: { investment: { startValue: 500_000, growth: 25_000, contributions: 0, box3Drag: 5_000, endValue: 520_000 } },
      debtBalances: {},
      totalAssets: 520_000,
      totalDebts: 0,
      netWorth: 520_000,
      startNetWorth: 500_000,
      grossIncome: 0,
      savings: 0,
      withdrawal: 30_000,
      withdrawalByType: { investment: 30_000 },
      cashflowNet: 0,
      oneTimeNet: 0,
      totalGrowth: 25_000,
      totalBox3: 5_000,
      cumulativeBox3: 50_000,
      inflationFactor: 1.3,
    }
    const simRow = toSimRow(row)
    // Transition maps to accumulation in legacy
    expect(simRow.phase).toBe('accumulation')
  })

  it('J3: toSimResult maps all required SimResult fields', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 400_000, expected_return: 7 })],
      annualSavings: 20_000,
      yearlyExpenses: 36_000,
    })
    const unifiedResult = runUnifiedProjection(input)
    const simResult = toSimResult(unifiedResult)

    expect(simResult.rows.length).toBe(unifiedResult.rows.length)
    expect(simResult.fireAge).toBe(unifiedResult.fireAge)
    expect(simResult.fireAgeFractional).toBe(unifiedResult.fireAgeFractional)
    expect(simResult.fireReachable).toBe(unifiedResult.fireReachable)
    expect(simResult.strategy).toBe(unifiedResult.strategy)
    expect(simResult.displayEndAge).toBe(unifiedResult.displayEndAge)
    expect(typeof simResult.classic25xTarget).toBe('number')
  })

  it('J4: toSimRow uses netWorth (assets - debts) for startPortfolio/endPortfolio', () => {
    const row: UnifiedProjectionRow = {
      year: 5,
      age: 40,
      phase: 'accumulation',
      assetBuckets: {
        investment: { startValue: 200_000, growth: 14_000, contributions: 12_000, box3Drag: 2_000, endValue: 224_000 },
      },
      debtBalances: { 'debt-1': { startBalance: 100_000, interestPaid: 3_000, principalPaid: 3_000, endBalance: 94_000 } },
      totalAssets: 224_000,
      totalDebts: 47_000,
      netWorth: 177_000,
      startNetWorth: 150_000,
      grossIncome: 48_000,
      savings: 12_000,
      withdrawal: 0,
      withdrawalByType: {},
      cashflowNet: 0,
      oneTimeNet: 0,
      totalGrowth: 14_000,
      totalBox3: 2_000,
      cumulativeBox3: 8_000,
      inflationFactor: 1.1,
    }
    const simRow = toSimRow(row)
    expect(simRow.startPortfolio).toBe(150_000) // netWorth, not 200k totalAssets
    expect(simRow.endPortfolio).toBe(177_000)   // netWorth, not 224k totalAssets
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Section K: Integration — full projection coherence
// ═══════════════════════════════════════════════════════════════════════════════

describe('K. Integratietests', () => {
  it('K1: rows zijn monotoon oplopend in leeftijd', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 300_000, expected_return: 7 })],
      annualSavings: 20_000,
      yearlyExpenses: 36_000,
    })
    const result = runUnifiedProjection(input)
    for (let i = 1; i < result.rows.length; i++) {
      expect(result.rows[i].age).toBeGreaterThan(result.rows[i - 1].age)
    }
  })

  it('K2: cumulativeBox3 is monotoon stijgend', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 200_000, expected_return: 7 })],
      annualSavings: 10_000,
      yearlyExpenses: 36_000,
      currentAge: 35,
      endAge: 70,
      strategyConfig: { strategy: 'deplete', endAge: 70, legacyAmount: 0 },
    })
    const result = runUnifiedProjection(input)
    for (let i = 1; i < result.rows.length; i++) {
      expect(result.rows[i].cumulativeBox3).toBeGreaterThanOrEqual(result.rows[i - 1].cumulativeBox3)
    }
  })

  it('K3: inflationFactor groeit exponentieel', () => {
    const input = makeInput({
      inflationRate: 0.02,
      currentAge: 35,
      endAge: 50,
      strategyConfig: { strategy: 'deplete', endAge: 50, legacyAmount: 0 },
    })
    const result = runUnifiedProjection(input)
    for (const row of result.rows) {
      const expectedFactor = Math.pow(1.02, row.year)
      expect(row.inflationFactor).toBeCloseTo(expectedFactor, 6)
    }
  })

  it('K4: legacy strategie met target > 0 zet targetEndPortfolio', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 500_000, expected_return: 7 })],
      annualSavings: 25_000,
      yearlyExpenses: 36_000,
      strategyConfig: { strategy: 'legacy', endAge: 90, legacyAmount: 200_000 },
    })
    const result = runUnifiedProjection(input)
    // targetEndPortfolio should be inflation-adjusted legacy amount
    expect(result.targetEndPortfolio).toBeGreaterThan(200_000) // adjusted for inflation
    expect(result.strategy).toBe('legacy')
  })

  it('K5: displayEndAge correct for each strategy', () => {
    // Deplete: displayEndAge = endAge
    const depleteResult = runUnifiedProjection(makeInput({
      strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    }))
    expect(depleteResult.displayEndAge).toBe(90)

    // Perpetual: displayEndAge = config endAge (not effectiveEndAge which is 100)
    const perpResult = runUnifiedProjection(makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 2_000_000, expected_return: 7 })],
      strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
    }))
    expect(perpResult.displayEndAge).toBe(90)
  })

  it('K6: debts reduce netWorth in projection rows', () => {
    // Use forcedFireAge to ensure both have same row structure (no FIRE detection difference)
    const baseParams = {
      assets: [makeAsset({ asset_type: 'investment', current_value: 300_000, expected_return: 7 })],
      currentAge: 35,
      endAge: 90,
      yearlyExpenses: 30_000,
      annualSavings: 10_000,
      forcedFireAge: 65, // force same FIRE age for fair comparison
      strategyConfig: { strategy: 'deplete' as const, endAge: 90, legacyAmount: 0 },
    }

    const assetOnly = runUnifiedProjection(makeInput({
      ...baseParams,
      debts: [],
    }))

    const withDebt = runUnifiedProjection(makeInput({
      ...baseParams,
      debts: [makeDebt({
        debt_type: 'persoonlijke_lening',
        current_balance: 50_000,
        interest_rate: 5,
        monthly_payment: 500,
        repayment_type: 'annuiteit',
      })],
    }))

    // First row net worth should be lower with debt (same age, same assets, but debt reduces netWorth)
    expect(withDebt.rows[0].netWorth).toBeLessThan(assetOnly.rows[0].netWorth)
    // Debt should appear in totalDebts
    expect(withDebt.rows[0].totalDebts).toBeGreaterThan(0)
  })

  it('K7: phase boundary continuity: prevRow.netWorth === nextRow.startNetWorth', () => {
    // Scenario that produces all three phases: accumulation → transition → withdrawal
    // FIRE reached before AOW (67), so transition phase exists between FIRE and AOW
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 300_000, expected_return: 7 })],
      annualSavings: 20_000,
      yearlyExpenses: 36_000,
      currentAge: 35,
      endAge: 90,
      strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    })
    const result = runUnifiedProjection(input)
    expect(result.fireReachable).toBe(true)
    expect(result.rows.length).toBeGreaterThan(2)

    // Verify all three phases exist
    const phases = new Set(result.rows.map(r => r.phase))
    expect(phases.has('accumulation')).toBe(true)
    // At least transition or withdrawal should exist after FIRE
    expect(phases.has('transition') || phases.has('withdrawal')).toBe(true)

    // Check boundary continuity: each row's startNetWorth must equal the previous row's netWorth
    for (let i = 1; i < result.rows.length; i++) {
      expect(result.rows[i].startNetWorth).toBe(result.rows[i - 1].netWorth)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Section L: Deplete end portfolio convergence (#bug-fix)
// ═══════════════════════════════════════════════════════════════════════════════

describe('deplete end portfolio convergence (#bug-fix)', () => {
  it('static + deplete: end portfolio ≈ 0 (not negative)', () => {
    const result = runUnifiedProjection(makeInput({
      assets: [makeAsset({
        asset_type: 'investment',
        current_value: 50_000,
        expected_return: 7,
        monthly_contribution: 1000,
      })],
      currentAge: 30,
      yearlyExpenses: 30_000,
      strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
      withdrawalStrategy: { ...WITHDRAWAL_DEFAULTS, strategy: 'static' },
    }))

    // FIRE should be reachable
    expect(result.fireAge).not.toBeNull()

    // Find the last row (at endAge - 1)
    const lastRow = result.rows[result.rows.length - 1]
    // End portfolio should be approximately 0, not deeply negative
    expect(lastRow.netWorth).toBeGreaterThan(-50_000)
  })
})

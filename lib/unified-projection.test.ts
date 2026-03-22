/**
 * Unit tests voor unified-projection.ts — Fase 1a
 *
 * Test per-asset rendement & Box 3 berekening per jaar:
 * - Beleggingen: netto ~4.84% na Box 3 (7% - 6%×36%)
 * - Spaargeld: lagere drag (~1.28%×36% = 0.46%)
 * - Heffingsvrij vermogen reduceert drag correct
 * - Compound doorwerking van drag
 * - Surplus-cash allocatie naar beleggingsbuckets
 * - toSimRow / toSimResult backwards compatibility
 */

import { describe, it, expect } from 'vitest'
import {
  computeYearlyAssetGrowth,
  computeAssetBox3DragRate,
  applyHeffingsvrij,
  toSimRow,
  toSimResult,
  runUnifiedProjection,
  type UnifiedProjectionRow,
  type UnifiedProjectionResult,
  type UnifiedProjectionInput,
  type AssetBucketDetail,
  initRunningBuckets,
  initRunningDebts,
  computeYearlyDebtSchedule,
  computeWeightedDebtTotal,
  type DebtBalanceDetail,
} from '@/lib/unified-projection'
import { runSimulation, lifeEventsToCashflows, type SimCashflow } from '@/lib/fire-simulation'
import { WITHDRAWAL_DEFAULTS, type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { DEFAULT_FIRE_STRATEGY, type FireStrategyConfig } from '@/lib/fire-strategy'
import { NL_AOW_AGE } from '@/lib/constants'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { amortizationSchedule } from '@/lib/debt-data'

// ── Test helpers ────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> & { asset_type: string; current_value: number }): Asset {
  return {
    id: 'test-' + Math.random().toString(36).slice(2, 8),
    user_id: 'test-user',
    name: 'Test Asset',
    asset_type: overrides.asset_type as Asset['asset_type'],
    current_value: overrides.current_value,
    purchase_value: overrides.current_value,
    purchase_date: null,
    expected_return: overrides.expected_return ?? 7,
    monthly_contribution: overrides.monthly_contribution ?? 0,
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: null,
    risk_profile: null,
    tax_benefit: overrides.tax_benefit ?? null,
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
    has_holdings_tracking: false,
    ...overrides,
  } as Asset
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Unified Projection — Fase 1a: Per-asset rendement & Box 3', () => {

  describe('computeAssetBox3DragRate', () => {
    it('beleggingen: ~2.16% drag (6.00% × 36%)', () => {
      const asset = makeAsset({ asset_type: 'investment', current_value: 100_000, expected_return: 7 })
      const { dragRate, category } = computeAssetBox3DragRate(asset, 'forfaitair')
      expect(category).toBe('beleggingen')
      // 6.00% × 36% = 2.16%
      expect(dragRate).toBeCloseTo(0.06 * 0.36, 4)
    })

    it('spaargeld: ~0.46% drag (1.28% × 36%)', () => {
      const asset = makeAsset({ asset_type: 'savings', current_value: 50_000, expected_return: 2 })
      const { dragRate, category } = computeAssetBox3DragRate(asset, 'forfaitair')
      expect(category).toBe('spaargeld')
      // 1.28% × 36% = 0.4608%
      expect(dragRate).toBeCloseTo(0.0128 * 0.36, 4)
    })

    it('eigen_huis: geen Box 3 (Box 1)', () => {
      const asset = makeAsset({ asset_type: 'eigen_huis', current_value: 400_000 })
      const { dragRate, category } = computeAssetBox3DragRate(asset, 'forfaitair')
      expect(dragRate).toBe(0)
      expect(category).toBeNull()
    })

    it('pensioen met fiscaal voordeel: geen Box 3', () => {
      const asset = makeAsset({ asset_type: 'retirement', current_value: 200_000, tax_benefit: true })
      const { dragRate, category } = computeAssetBox3DragRate(asset, 'forfaitair')
      expect(dragRate).toBe(0)
      expect(category).toBeNull()
    })

    it('werkelijk rendement methode: belasting op werkelijk rendement', () => {
      const asset = makeAsset({ asset_type: 'investment', current_value: 100_000, expected_return: 10 })
      const { dragRate } = computeAssetBox3DragRate(asset, 'werkelijk')
      // 10% × 36% = 3.6%
      expect(dragRate).toBeCloseTo(0.10 * 0.36, 4)
    })
  })

  describe('applyHeffingsvrij', () => {
    it('klein vermogen onder heffingsvrij: geen drag', () => {
      // €50.000 < €59.357 heffingsvrij
      const values = [50_000]
      const rates = [0.06 * 0.36]
      const categories: ('beleggingen')[] = ['beleggingen']
      const result = applyHeffingsvrij(values, rates, categories, false)
      expect(result[0]).toBe(0)
    })

    it('groot vermogen boven heffingsvrij: proportionele drag', () => {
      // €200.000 beleggingen, single heffingsvrij €59.357
      // Belastbaar: (200.000 - 59.357) / 200.000 = 70.32%
      const values = [200_000]
      const rates = [0.06 * 0.36] // 2.16%
      const categories: ('beleggingen')[] = ['beleggingen']
      const result = applyHeffingsvrij(values, rates, categories, false)

      const expectedTaxableFraction = (200_000 - 59_357) / 200_000
      const expectedDrag = 200_000 * 0.06 * 0.36 * expectedTaxableFraction
      expect(result[0]).toBeCloseTo(expectedDrag, 0)
    })

    it('partner verdubbelt heffingsvrij', () => {
      // €100.000 < €118.714 partner heffingsvrij → geen drag
      const values = [100_000]
      const rates = [0.06 * 0.36]
      const categories: ('beleggingen')[] = ['beleggingen']
      const result = applyHeffingsvrij(values, rates, categories, true)
      expect(result[0]).toBe(0)
    })

    it('mixed assets: drag proportioneel verdeeld', () => {
      // €30.000 spaargeld + €70.000 beleggingen = €100.000 totaal
      // Heffingsvrij single: €59.357 → belastbaar: 40.643 / 100.000 = 40.64%
      const values = [30_000, 70_000]
      const rates = [0.0128 * 0.36, 0.06 * 0.36]
      const categories: ('spaargeld' | 'beleggingen')[] = ['spaargeld', 'beleggingen']
      const result = applyHeffingsvrij(values, rates, categories, false)

      const taxableFraction = (100_000 - 59_357) / 100_000
      expect(result[0]).toBeCloseTo(30_000 * 0.0128 * 0.36 * taxableFraction, 0)
      expect(result[1]).toBeCloseTo(70_000 * 0.06 * 0.36 * taxableFraction, 0)
    })
  })

  describe('computeYearlyAssetGrowth', () => {
    it('beleggingen netto rendement ~4.84% na Box 3 (7% - 6%×36%)', () => {
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 100_000, expected_return: 7, monthly_contribution: 0 }),
      ]
      const buckets = initRunningBuckets(assets, 0.07, 'forfaitair')

      // Groot vermogen → heffingsvrij effect is klein
      // Use large amount to minimize heffingsvrij effect
      buckets[0].value = 1_000_000

      const result = computeYearlyAssetGrowth(buckets, 0, false)
      const detail = result['investment']!

      // Bruto groei: 7% × €1M = €70.000
      expect(detail.growth).toBe(70_000)

      // Box 3 drag: ~2.16% × (1M - 59.357) / 1M × 1M ≈ €20.317
      // Netto: 70.000 - drag ≈ ~49.683 → ~4.97% netto
      const netReturn = (detail.endValue - detail.startValue) / detail.startValue
      expect(netReturn).toBeGreaterThan(0.045)
      expect(netReturn).toBeLessThan(0.055)
    })

    it('spaargeld lagere drag dan beleggingen', () => {
      const savingsAssets = [
        makeAsset({ asset_type: 'savings', current_value: 200_000, expected_return: 3, monthly_contribution: 0 }),
      ]
      const investAssets = [
        makeAsset({ asset_type: 'investment', current_value: 200_000, expected_return: 7, monthly_contribution: 0 }),
      ]

      const savingsBuckets = initRunningBuckets(savingsAssets, 0.07, 'forfaitair')
      const investBuckets = initRunningBuckets(investAssets, 0.07, 'forfaitair')

      const savingsResult = computeYearlyAssetGrowth(savingsBuckets, 0, false)
      const investResult = computeYearlyAssetGrowth(investBuckets, 0, false)

      const savingsDrag = savingsResult['savings']!.box3Drag
      const investDrag = investResult['investment']!.box3Drag

      // Spaargeld drag << beleggingen drag (beide €200K)
      expect(savingsDrag).toBeLessThan(investDrag)
      // Spaargeld forfait (1.28%) vs beleggingen (6.00%) → ~4.7x verschil
      expect(investDrag / savingsDrag).toBeGreaterThan(3)
    })

    it('heffingsvrij vermogen reduceert drag bij klein vermogen', () => {
      const smallAssets = [
        makeAsset({ asset_type: 'investment', current_value: 50_000, expected_return: 7 }),
      ]
      const largeAssets = [
        makeAsset({ asset_type: 'investment', current_value: 500_000, expected_return: 7 }),
      ]

      const smallBuckets = initRunningBuckets(smallAssets, 0.07, 'forfaitair')
      const largeBuckets = initRunningBuckets(largeAssets, 0.07, 'forfaitair')

      const smallResult = computeYearlyAssetGrowth(smallBuckets, 0, false)
      const largeResult = computeYearlyAssetGrowth(largeBuckets, 0, false)

      // €50K < €59.357 heffingsvrij → GEEN drag
      expect(smallResult['investment']!.box3Drag).toBe(0)

      // €500K >> heffingsvrij → WEL drag
      expect(largeResult['investment']!.box3Drag).toBeGreaterThan(0)
    })

    it('compound doorwerking: drag vermindert running value voor volgend jaar', () => {
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 200_000, expected_return: 7, monthly_contribution: 0 }),
      ]
      const buckets = initRunningBuckets(assets, 0.07, 'forfaitair')

      // Jaar 1
      const year1 = computeYearlyAssetGrowth(buckets, 0, false)
      const endYear1 = year1['investment']!.endValue

      // Jaar 2: startValue moet gelijk zijn aan endValue van jaar 1
      const year2 = computeYearlyAssetGrowth(buckets, 0, false)
      expect(year2['investment']!.startValue).toBe(endYear1)

      // De growth in jaar 2 is gebaseerd op de verminderde running value
      // Growth = startValue × return, en startValue is na drag
      expect(year2['investment']!.growth).toBe(Math.round(endYear1 * 0.07))
    })

    it('surplus wordt proportioneel verdeeld over beleggingsbuckets', () => {
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 100_000, expected_return: 7, monthly_contribution: 0 }),
        makeAsset({ asset_type: 'crypto', current_value: 50_000, expected_return: 10, monthly_contribution: 0 }),
        makeAsset({ asset_type: 'savings', current_value: 30_000, expected_return: 2, monthly_contribution: 0 }),
      ]
      const buckets = initRunningBuckets(assets, 0.07, 'forfaitair')

      const surplus = 12_000
      const result = computeYearlyAssetGrowth(buckets, surplus, false)

      // Surplus gaat naar investment + crypto (investable), NIET naar savings
      const investContrib = result['investment']!.contributions
      const cryptoContrib = result['crypto']!.contributions
      const savingsContrib = result['savings']!.contributions

      // Savings krijgt alleen eigen monthly_contribution (0)
      expect(savingsContrib).toBe(0)

      // Investment + crypto krijgen surplus proportioneel
      // Investment: 100K / 150K × 12K = 8K; Crypto: 50K / 150K × 12K = 4K
      expect(investContrib).toBeCloseTo(8_000, -2) // within €100
      expect(cryptoContrib).toBeCloseTo(4_000, -2)
    })
  })

  describe('toSimRow — backwards compatibility', () => {
    it('mapt alle SimRow velden correct', () => {
      const row: UnifiedProjectionRow = {
        year: 5,
        age: 40,
        phase: 'accumulation',
        assetBuckets: {
          investment: { startValue: 100_000, growth: 7_000, contributions: 12_000, box3Drag: 1_500, endValue: 117_500 },
          savings: { startValue: 30_000, growth: 600, contributions: 0, box3Drag: 0, endValue: 30_600 },
        },
        debtBalances: {},
        totalAssets: 148_100,
        totalDebts: 0,
        netWorth: 148_100,
        grossIncome: 60_000,
        savings: 12_000,
        withdrawal: 0,
        cashflowNet: 0,
        totalGrowth: 7_600,
        totalBox3: 1_500,
        cumulativeBox3: 7_500,
        inflationFactor: 1.1041,
      }

      const simRow = toSimRow(row)
      expect(simRow.age).toBe(40)
      expect(simRow.phase).toBe('accumulation')
      expect(simRow.startPortfolio).toBe(130_000) // 100K + 30K
      expect(simRow.growth).toBe(7_600)
      expect(simRow.savings).toBe(12_000)
      expect(simRow.withdrawal).toBe(0)
      expect(simRow.cashflowNet).toBe(0)
      expect(simRow.endPortfolio).toBe(148_100) // 117.5K + 30.6K
      expect(simRow.grossIncome).toBe(60_000)
    })

    it('transition phase mapt naar accumulation', () => {
      const row: UnifiedProjectionRow = {
        year: 10, age: 55, phase: 'transition',
        assetBuckets: { investment: { startValue: 500_000, growth: 35_000, contributions: 0, box3Drag: 8_000, endValue: 527_000 } },
        debtBalances: {},
        totalAssets: 527_000, totalDebts: 0, netWorth: 527_000,
        grossIncome: 0, savings: 0, withdrawal: 0, cashflowNet: 0,
        totalGrowth: 35_000, totalBox3: 8_000, cumulativeBox3: 50_000,
        inflationFactor: 1.22,
      }
      expect(toSimRow(row).phase).toBe('accumulation')
    })

    it('withdrawal phase mapt naar retirement', () => {
      const row: UnifiedProjectionRow = {
        year: 20, age: 65, phase: 'withdrawal',
        assetBuckets: { investment: { startValue: 800_000, growth: 56_000, contributions: 0, box3Drag: 12_000, endValue: 812_000 } },
        debtBalances: {},
        totalAssets: 812_000, totalDebts: 0, netWorth: 812_000,
        grossIncome: 20_000, savings: 0, withdrawal: 32_000, cashflowNet: 0,
        totalGrowth: 56_000, totalBox3: 12_000, cumulativeBox3: 150_000,
        inflationFactor: 1.49,
      }
      expect(toSimRow(row).phase).toBe('retirement')
    })
  })

  describe('toSimResult — backwards compatibility', () => {
    it('converteert UnifiedProjectionResult naar SimResult', () => {
      const result: UnifiedProjectionResult = {
        rows: [],
        fireAge: 52,
        fireAgeFractional: 52.3,
        fireReachable: true,
        firePortfolioAtFire: 750_000,
        requiredFirePortfolio: 700_000,
        implicitWithdrawalRate: 0.04,
        strategy: 'deplete',
        targetEndPortfolio: 0,
        displayEndAge: 90,
      }

      const simResult = toSimResult(result)
      expect(simResult.fireAge).toBe(52)
      expect(simResult.fireAgeFractional).toBe(52.3)
      expect(simResult.fireReachable).toBe(true)
      expect(simResult.firePortfolioAtFire).toBe(750_000)
      expect(simResult.strategy).toBe('deplete')
      expect(simResult.displayEndAge).toBe(90)
      // classic25xTarget = yearlyExpenses × 25 = (700K × 0.04) × 25 = 700K
      expect(simResult.classic25xTarget).toBe(700_000)
    })
  })
})

// ── Fase 1b: Schuldaflossing per schuld per jaar ────────────────────────────

function makeDebt(overrides: Partial<Debt> & { current_balance: number; interest_rate: number }): Debt {
  return {
    id: 'debt-' + Math.random().toString(36).slice(2, 8),
    user_id: 'test-user',
    name: 'Test Schuld',
    debt_type: 'mortgage',
    original_amount: overrides.original_amount ?? overrides.current_balance,
    current_balance: overrides.current_balance,
    interest_rate: overrides.interest_rate,
    minimum_payment: overrides.minimum_payment ?? 0,
    monthly_payment: overrides.monthly_payment ?? 1500,
    start_date: overrides.start_date ?? '2026-01-01',
    end_date: overrides.end_date ?? null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: overrides.subtype ?? null,
    is_tax_deductible: overrides.is_tax_deductible ?? null,
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
    ...overrides,
  } as Debt
}

describe('Unified Projection — Fase 1b: Schuldaflossing per schuld per jaar', () => {

  describe('initRunningDebts', () => {
    it('initialiseert running debts vanuit actieve schulden', () => {
      const debts = [
        makeDebt({ current_balance: 300_000, interest_rate: 4, monthly_payment: 1500 }),
        makeDebt({ current_balance: 0, interest_rate: 3, monthly_payment: 500, is_active: false }),
      ]
      const running = initRunningDebts(debts)
      // Alleen actieve schuld meegenomen
      expect(running).toHaveLength(1)
      expect(running[0].balance).toBe(300_000)
      expect(running[0].paidOff).toBe(false)
    })

    it('genereert maandelijks schema per schuld', () => {
      const debts = [
        makeDebt({ current_balance: 300_000, interest_rate: 4, monthly_payment: 1500, repayment_type: 'annuiteit' }),
      ]
      const running = initRunningDebts(debts)
      // Schema moet maandelijkse rijen bevatten
      expect(running[0].monthlySchedule.length).toBeGreaterThan(0)
      // Eerste maand: rente op €300K @ 4% = €1000/maand
      expect(running[0].monthlySchedule[0].interest).toBeCloseTo(1000, 0)
    })
  })

  describe('computeYearlyDebtSchedule — annuïteit', () => {
    it('annuïteit hypotheek €300k, 4%, 30 jaar — eindsaldo na 10 jaar klopt met amortizationSchedule()', () => {
      // Annuïteitshypotheek: €300.000, 4%, maandlast ~€1.432,25
      const balance = 300_000
      const rate = 4
      const monthlyPayment = 1432.25
      const debt = makeDebt({
        current_balance: balance,
        interest_rate: rate,
        monthly_payment: monthlyPayment,
        repayment_type: 'annuiteit',
      })

      const running = initRunningDebts([debt])

      // Referentie: directe amortizationSchedule berekening
      const refSchedule = amortizationSchedule(balance, rate, monthlyPayment)

      // Bereken 10 jaar
      let totalInterest = 0
      let totalPrincipal = 0
      for (let year = 0; year < 10; year++) {
        const { debtBalances } = computeYearlyDebtSchedule(running)
        const detail = debtBalances[debt.id]
        totalInterest += detail.interestPaid
        totalPrincipal += detail.principalPaid
      }

      // Vergelijk eindsaldo na 10 jaar (120 maanden) met referentie
      const refBalanceAfter120 = refSchedule[119]?.balance ?? 0
      expect(running[0].balance).toBeCloseTo(refBalanceAfter120, 0)

      // Totale rente na 10 jaar moet kloppen
      const refInterest10y = refSchedule.slice(0, 120).reduce((s, r) => s + r.interest, 0)
      expect(totalInterest).toBeCloseTo(refInterest10y, 0)

      // Totale aflossing na 10 jaar moet kloppen
      const refPrincipal10y = refSchedule.slice(0, 120).reduce((s, r) => s + r.principal, 0)
      expect(totalPrincipal).toBeCloseTo(refPrincipal10y, 0)
    })

    it('annuïteit: startBalance jaar 2 === endBalance jaar 1', () => {
      const debt = makeDebt({
        current_balance: 200_000,
        interest_rate: 5,
        monthly_payment: 1200,
        repayment_type: 'annuiteit',
      })
      const running = initRunningDebts([debt])

      const { debtBalances: year1 } = computeYearlyDebtSchedule(running)
      const endBalanceYear1 = year1[debt.id].endBalance

      const { debtBalances: year2 } = computeYearlyDebtSchedule(running)
      const startBalanceYear2 = year2[debt.id].startBalance

      expect(startBalanceYear2).toBeCloseTo(endBalanceYear1, 2)
    })
  })

  describe('computeYearlyDebtSchedule — aflossingsvrij', () => {
    it('aflossingsvrij hypotheek: saldo blijft constant tot end_date', () => {
      const balance = 250_000
      const rate = 3.5
      const debt = makeDebt({
        current_balance: balance,
        interest_rate: rate,
        monthly_payment: balance * (rate / 100) / 12, // alleen rente
        repayment_type: 'aflossingsvrij',
        end_date: '2056-01-01', // 30 jaar
      })

      const running = initRunningDebts([debt])

      // Check 5 jaar
      for (let year = 0; year < 5; year++) {
        const { debtBalances } = computeYearlyDebtSchedule(running)
        const detail = debtBalances[debt.id]

        // Saldo blijft constant
        expect(detail.startBalance).toBeCloseTo(balance, 0)
        expect(detail.endBalance).toBeCloseTo(balance, 0)

        // Geen aflossing
        expect(detail.principalPaid).toBe(0)

        // Rente = saldo × rente% per jaar
        const expectedInterest = balance * (rate / 100)
        expect(detail.interestPaid).toBeCloseTo(expectedInterest, 0)
      }
    })
  })

  describe('computeYearlyDebtSchedule — lineair', () => {
    it('lineaire schuld: saldo daalt lineair', () => {
      const balance = 120_000
      const rate = 3
      const termMonths = 240 // 20 jaar
      const monthlyPrincipal = balance / termMonths // €500/mnd
      const firstMonthInterest = balance * (rate / 100) / 12
      const debt = makeDebt({
        current_balance: balance,
        interest_rate: rate,
        monthly_payment: monthlyPrincipal + firstMonthInterest, // approximation
        repayment_type: 'lineair',
      })

      const running = initRunningDebts([debt])

      const balances: number[] = [balance]
      for (let year = 0; year < 5; year++) {
        const { debtBalances } = computeYearlyDebtSchedule(running)
        const detail = debtBalances[debt.id]
        balances.push(detail.endBalance)

        // Aflossing per jaar: lineair = vast bedrag per maand
        // Exacte waarde hangt af van hoe linearAmortization de termMonths berekent
        // Bij €120K en ~20 jaar: ~€500-650/mnd × 12 = ~€6000-7800/jaar
        expect(detail.principalPaid).toBeGreaterThan(5_000)
        expect(detail.principalPaid).toBeLessThan(8_500)
      }

      // Saldo daalt monotoon
      for (let i = 1; i < balances.length; i++) {
        expect(balances[i]).toBeLessThan(balances[i - 1])
      }

      // Na 5 jaar: ~€30.000 afgelost van €120.000, resteert ~€90.000
      expect(balances[5]).toBeGreaterThan(80_000)
      expect(balances[5]).toBeLessThan(100_000)
    })
  })

  describe('computeYearlyDebtSchedule — payoff & surplus', () => {
    it('schuld die aflopen (balance → 0): markeer payoff-jaar, vrijgevallen maandlasten worden surplus', () => {
      // Kleine lening die snel aflost
      const debt = makeDebt({
        current_balance: 5_000,
        interest_rate: 5,
        monthly_payment: 500,
        repayment_type: 'annuiteit',
      })
      const running = initRunningDebts([debt])

      // Jaar 1: schuld zou na ~10-11 maanden afgelost moeten zijn
      const { debtBalances: year1, freedSurplus: surplus1 } = computeYearlyDebtSchedule(running)

      // Schuld is afgelost in jaar 1
      expect(year1[debt.id].endBalance).toBeCloseTo(0, 0)
      expect(running[0].paidOff).toBe(true)

      // Surplus in jaar 1 is 0 (betalingen zijn nog gedaan dit jaar)
      expect(surplus1).toBe(0)

      // Jaar 2: paidOff → rapporteert 0-rij en geeft surplus
      const { debtBalances: year2, freedSurplus: surplus2 } = computeYearlyDebtSchedule(running)
      expect(year2[debt.id].endBalance).toBe(0)
      expect(year2[debt.id].interestPaid).toBe(0)
      expect(year2[debt.id].principalPaid).toBe(0)
      // Surplus: €500/mnd × 12 = €6000/jaar
      expect(surplus2).toBe(500 * 12)
    })
  })

  describe('computeWeightedDebtTotal — net_worth_inclusion_pct', () => {
    it('respecteert net_worth_inclusion_pct per schuld', () => {
      const debt100 = makeDebt({
        current_balance: 200_000,
        interest_rate: 4,
        monthly_payment: 1000,
        net_worth_inclusion_pct: 100,
      })
      const debt50 = makeDebt({
        current_balance: 100_000,
        interest_rate: 3,
        monthly_payment: 500,
        net_worth_inclusion_pct: 50,
      })

      const running = initRunningDebts([debt100, debt50])
      const { debtBalances } = computeYearlyDebtSchedule(running)

      const weightedTotal = computeWeightedDebtTotal(debtBalances, running)

      // debt100 endBalance × 100% + debt50 endBalance × 50%
      const expected = debtBalances[debt100.id].endBalance * 1.0
        + debtBalances[debt50.id].endBalance * 0.5
      expect(weightedTotal).toBeCloseTo(expected, 0)

      // Should be less than simply summing both end balances
      const unweightedTotal = debtBalances[debt100.id].endBalance + debtBalances[debt50.id].endBalance
      expect(weightedTotal).toBeLessThan(unweightedTotal)
    })
  })

  describe('meerdere schulden tegelijk', () => {
    it('verwerkt meerdere schulden parallel correct', () => {
      const hypotheek = makeDebt({
        id: 'hypotheek-1',
        current_balance: 300_000,
        interest_rate: 4,
        monthly_payment: 1500,
        repayment_type: 'annuiteit',
        net_worth_inclusion_pct: 100,
      })
      const studielening = makeDebt({
        id: 'studie-1',
        current_balance: 20_000,
        interest_rate: 0.46,
        monthly_payment: 200,
        repayment_type: 'lineair',
        debt_type: 'student_loan',
        net_worth_inclusion_pct: 100,
      })
      const aflossingsvrij = makeDebt({
        id: 'aflvrij-1',
        current_balance: 150_000,
        interest_rate: 3,
        monthly_payment: 375, // alleen rente
        repayment_type: 'aflossingsvrij',
        end_date: '2056-01-01',
        net_worth_inclusion_pct: 50,
      })

      const running = initRunningDebts([hypotheek, studielening, aflossingsvrij])
      expect(running).toHaveLength(3)

      // Jaar 1
      const { debtBalances } = computeYearlyDebtSchedule(running)

      // Hypotheek: annuïteit, saldo daalt
      expect(debtBalances['hypotheek-1'].endBalance).toBeLessThan(300_000)
      expect(debtBalances['hypotheek-1'].interestPaid).toBeGreaterThan(0)

      // Studielening: lineair, saldo daalt
      expect(debtBalances['studie-1'].endBalance).toBeLessThan(20_000)

      // Aflossingsvrij: saldo constant
      expect(debtBalances['aflvrij-1'].endBalance).toBeCloseTo(150_000, 0)
      expect(debtBalances['aflvrij-1'].principalPaid).toBe(0)

      // Gewogen totaal: hypotheek 100% + studie 100% + aflossingsvrij 50%
      const weighted = computeWeightedDebtTotal(debtBalances, running)
      const expected =
        debtBalances['hypotheek-1'].endBalance * 1.0 +
        debtBalances['studie-1'].endBalance * 1.0 +
        debtBalances['aflvrij-1'].endBalance * 0.5
      expect(weighted).toBeCloseTo(expected, 0)
    })
  })
})

// ── Fase 1c: FIRE-detectie & onttrekkingsstrategieën in unified engine ──────

/**
 * Helper: build a minimal UnifiedProjectionInput for testing.
 * Uses Rashid-like persona defaults.
 */
function makeInput(overrides: Partial<UnifiedProjectionInput> = {}): UnifiedProjectionInput {
  return {
    assets: [
      makeAsset({ asset_type: 'investment', current_value: 170_000, expected_return: 7, monthly_contribution: 800 }),
    ],
    debts: [],
    currentAge: 42,
    endAge: 90,
    yearlyExpenses: 50_400, // €4200/mnd
    annualSavings: 15_600,  // €1300/mnd
    monthlySurplus: 1300,
    monthlyIncome: 5500,
    incomeGrowthRate: 0.02,
    grossReturn: 0.07,
    inflationRate: 0.02,
    box3Method: 'forfaitair' as const,
    cashflows: [],
    strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    withdrawalStrategy: WITHDRAWAL_DEFAULTS,
    hasPartner: false,
    ...overrides,
  }
}

/**
 * Helper: build a Lisa-like input (mortgage + higher expenses)
 */
function makeLisaInput(overrides: Partial<UnifiedProjectionInput> = {}): UnifiedProjectionInput {
  return makeInput({
    assets: [
      makeAsset({ asset_type: 'investment', current_value: 42_000, expected_return: 7, monthly_contribution: 400 }),
      makeAsset({ asset_type: 'investment', current_value: 8_000, expected_return: 7, monthly_contribution: 0, name: 'Kinderbelegging' }),
    ],
    debts: [
      makeDebt({
        current_balance: 350_000,
        interest_rate: 2.9,
        monthly_payment: 1100,
        repayment_type: 'annuiteit',
      }),
    ],
    currentAge: 44,
    endAge: 90,
    yearlyExpenses: 48_000, // €4000/mnd
    annualSavings: 14_400,  // €1200/mnd
    monthlySurplus: 1200,
    monthlyIncome: 5200,
    strategyConfig: { strategy: 'legacy', endAge: 90, legacyAmount: 100_000 },
    withdrawalStrategy: { strategy: 'bucket', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1, guardrailRaiseStep: 0.1 },
    hasPartner: true,
    ...overrides,
  })
}

describe('Unified Projection — Fase 1c: FIRE-detectie & onttrekkingsstrategieën', () => {

  describe('runUnifiedProjection — basiswerking', () => {
    it('produceert rijen van currentAge tot displayEndAge', () => {
      const input = makeInput()
      const result = runUnifiedProjection(input)

      expect(result.rows.length).toBeGreaterThan(0)
      expect(result.rows[0].age).toBe(42)
      // Last row should be displayEndAge - 1
      const lastRow = result.rows[result.rows.length - 1]
      expect(lastRow.age).toBeLessThanOrEqual(89) // endAge=90, last row at age 89
    })

    it('alle rijen hebben monotoon stijgende leeftijden', () => {
      const result = runUnifiedProjection(makeInput())
      for (let i = 1; i < result.rows.length; i++) {
        expect(result.rows[i].age).toBe(result.rows[i - 1].age + 1)
      }
    })

    it('accumulatiefase heeft savings > 0, withdrawal = 0', () => {
      const result = runUnifiedProjection(makeInput())
      const accRow = result.rows.find(r => r.phase === 'accumulation')
      if (accRow) {
        expect(accRow.savings).toBeGreaterThan(0)
        expect(accRow.withdrawal).toBe(0)
      }
    })

    it('onttrekkingsfase heeft withdrawal > 0, savings = 0', () => {
      const result = runUnifiedProjection(makeInput())
      const decRow = result.rows.find(r => r.phase === 'withdrawal' || r.phase === 'transition')
      if (decRow) {
        expect(decRow.savings).toBe(0)
        expect(decRow.withdrawal).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('FIRE-detectie — binary search', () => {
    it('Rashid-achtig profiel: FIRE bereikbaar, leeftijd tussen 50-65', () => {
      const result = runUnifiedProjection(makeInput())
      expect(result.fireReachable).toBe(true)
      expect(result.fireAge).not.toBeNull()
      expect(result.fireAge!).toBeGreaterThanOrEqual(50)
      expect(result.fireAge!).toBeLessThanOrEqual(65)
    })

    it('FIRE-leeftijd wijzigt niet significant t.o.v. oude engine voor Rashid-achtig profiel', () => {
      const input = makeInput()
      const unifiedResult = runUnifiedProjection(input)

      // Run old engine with same parameters for comparison
      const totalAssets = 170_000
      const oldResult = runSimulation(
        42, 90, totalAssets, 50_400, 15_600,
        0.07, 'nl_box3', 0.02, [],
        { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
        WITHDRAWAL_DEFAULTS,
      )

      expect(unifiedResult.fireReachable).toBe(true)
      expect(oldResult.fireReachable).toBe(true)
      // FIRE ages should be within 3 years of each other (Box 3 per-type vs flat drag differs)
      const diff = Math.abs((unifiedResult.fireAge ?? 0) - (oldResult.fireAge ?? 0))
      expect(diff).toBeLessThanOrEqual(3)
    })

    it('Lisa-achtig profiel: FIRE bereikbaar ondanks hypotheek', () => {
      const result = runUnifiedProjection(makeLisaInput())
      // Lisa has high mortgage but also investments — FIRE should be reachable
      expect(result.fireReachable).toBe(true)
      expect(result.fireAge).not.toBeNull()
    })

    it('FIRE-leeftijd wijzigt niet significant voor Lisa-achtig profiel', () => {
      const lisaInput = makeLisaInput()
      const unifiedResult = runUnifiedProjection(lisaInput)

      // Old engine: just total assets - no per-debt tracking
      const totalAssets = 42_000 + 8_000 // investments only
      const oldResult = runSimulation(
        44, 90, totalAssets, 48_000, 14_400,
        0.07, 'nl_box3', 0.02, [],
        { strategy: 'legacy', endAge: 90, legacyAmount: 100_000 },
        { strategy: 'bucket', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1, guardrailRaiseStep: 0.1 },
      )

      if (unifiedResult.fireReachable && oldResult.fireReachable) {
        // With debt tracking, FIRE might be different but not radically
        const diff = Math.abs((unifiedResult.fireAge ?? 0) - (oldResult.fireAge ?? 0))
        expect(diff).toBeLessThanOrEqual(5)
      }
    })

    it('fractionele FIRE-leeftijd is valid (tussen fireAge-1 en fireAge)', () => {
      const result = runUnifiedProjection(makeInput())
      if (result.fireReachable && result.fireAge !== null && result.fireAgeFractional !== null) {
        expect(result.fireAgeFractional).toBeGreaterThanOrEqual(result.fireAge - 1)
        expect(result.fireAgeFractional).toBeLessThanOrEqual(result.fireAge)
      }
    })
  })

  describe('pensioen-strategie — forcedFireAge', () => {
    it('pensioen forceert fireAge op AOW-leeftijd', () => {
      const result = runUnifiedProjection(makeInput({
        strategyConfig: { strategy: 'pensioen', endAge: 90, legacyAmount: 0 },
        forcedFireAge: NL_AOW_AGE,
      }))

      expect(result.fireReachable).toBe(true)
      expect(result.fireAge).toBe(NL_AOW_AGE)
    })

    it('pensioen produceert withdrawal-fase rijen na AOW', () => {
      const result = runUnifiedProjection(makeInput({
        strategyConfig: { strategy: 'pensioen', endAge: 90, legacyAmount: 0 },
        forcedFireAge: NL_AOW_AGE,
      }))

      // All decumulation rows should be 'withdrawal' (no transition in pensioen mode)
      const decRows = result.rows.filter(r => r.age >= NL_AOW_AGE)
      for (const row of decRows) {
        expect(row.phase).toBe('withdrawal')
      }
    })

    it('pensioen: accumulatie rijen tot AOW', () => {
      const result = runUnifiedProjection(makeInput({
        strategyConfig: { strategy: 'pensioen', endAge: 90, legacyAmount: 0 },
        forcedFireAge: NL_AOW_AGE,
      }))

      const accRows = result.rows.filter(r => r.phase === 'accumulation')
      expect(accRows.length).toBe(NL_AOW_AGE - 42) // currentAge=42, accumulate to 67
      expect(accRows[accRows.length - 1].age).toBe(NL_AOW_AGE - 1) // last accumulation row
    })
  })

  describe('perpetual-strategie', () => {
    it('perpetual met portReturn ≤ inflation → fireReachable: false', () => {
      const result = runUnifiedProjection(makeInput({
        strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
        grossReturn: 0.02, // = inflationRate
      }))

      expect(result.fireReachable).toBe(false)
      expect(result.fireAge).toBeNull()
      expect(result.rows).toHaveLength(0)
    })

    it('perpetual met goed rendement: simuleert voorbij 100 jaar', () => {
      const result = runUnifiedProjection(makeInput({
        strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
      }))

      // Perpetual should still reach FIRE if returns are good
      if (result.fireReachable) {
        expect(result.displayEndAge).toBe(90)
      }
    })
  })

  describe('VPW incompatibiliteit', () => {
    it('VPW + perpetual → fireReachable: false', () => {
      const result = runUnifiedProjection(makeInput({
        strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
        withdrawalStrategy: { strategy: 'vpw', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1, guardrailRaiseStep: 0.1 },
      }))

      expect(result.fireReachable).toBe(false)
      expect(result.rows).toHaveLength(0)
    })

    it('VPW + legacy → fireReachable: false', () => {
      const result = runUnifiedProjection(makeInput({
        strategyConfig: { strategy: 'legacy', endAge: 90, legacyAmount: 50_000 },
        withdrawalStrategy: { strategy: 'vpw', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1, guardrailRaiseStep: 0.1 },
      }))

      expect(result.fireReachable).toBe(false)
    })

    it('VPW + deplete → werkt normaal', () => {
      const result = runUnifiedProjection(makeInput({
        strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
        withdrawalStrategy: { strategy: 'vpw', guardrailFloor: 0.8, guardrailCeiling: 1.2, guardrailCutStep: 0.1, guardrailRaiseStep: 0.1 },
      }))

      expect(result.rows.length).toBeGreaterThan(0)
      // VPW + deplete should work fine
    })
  })

  describe('fase-toewijzing', () => {
    it('transition fase: fireAge ≤ age < aowAge', () => {
      const result = runUnifiedProjection(makeInput())
      if (result.fireReachable && result.fireAge !== null && result.fireAge < NL_AOW_AGE) {
        const transitionRows = result.rows.filter(r => r.phase === 'transition')
        expect(transitionRows.length).toBeGreaterThan(0)
        // All transition rows should be between fireAge and aowAge
        for (const row of transitionRows) {
          expect(row.age).toBeGreaterThanOrEqual(result.fireAge)
          expect(row.age).toBeLessThan(NL_AOW_AGE)
        }
      }
    })

    it('withdrawal fase begint bij aowAge', () => {
      const result = runUnifiedProjection(makeInput())
      if (result.fireReachable) {
        const withdrawalRows = result.rows.filter(r => r.phase === 'withdrawal')
        if (withdrawalRows.length > 0) {
          expect(withdrawalRows[0].age).toBeGreaterThanOrEqual(NL_AOW_AGE)
        }
      }
    })

    it('pensioen mode: geen transition fase', () => {
      const result = runUnifiedProjection(makeInput({
        strategyConfig: { strategy: 'pensioen', endAge: 90, legacyAmount: 0 },
        forcedFireAge: NL_AOW_AGE,
      }))

      const transitionRows = result.rows.filter(r => r.phase === 'transition')
      expect(transitionRows).toHaveLength(0)
    })
  })

  describe('per-asset-type detail in rijen', () => {
    it('accumulatierij bevat assetBuckets met correcte asset types', () => {
      const result = runUnifiedProjection(makeInput())
      const firstRow = result.rows[0]
      expect(firstRow.assetBuckets).toBeDefined()
      expect(firstRow.assetBuckets['investment']).toBeDefined()
      expect(firstRow.assetBuckets['investment']!.startValue).toBeGreaterThan(0)
    })

    it('schuldaflossing tracked in debtBalances per rij', () => {
      const result = runUnifiedProjection(makeLisaInput())
      const firstRow = result.rows[0]
      expect(Object.keys(firstRow.debtBalances).length).toBeGreaterThan(0)
      // Debt should have declining balance
      const debtIds = Object.keys(firstRow.debtBalances)
      const detail = firstRow.debtBalances[debtIds[0]]
      expect(detail.startBalance).toBeGreaterThan(0)
      expect(detail.interestPaid).toBeGreaterThan(0)
    })

    it('netWorth = totalAssets - totalDebts', () => {
      const result = runUnifiedProjection(makeLisaInput())
      for (const row of result.rows.slice(0, 5)) {
        expect(row.netWorth).toBeCloseTo(row.totalAssets - row.totalDebts, -1) // within €10
      }
    })
  })

  describe('backwards compatibility via toSimResult', () => {
    it('toSimResult converteert UnifiedProjectionResult correct', () => {
      const input = makeInput()
      const unified = runUnifiedProjection(input)
      const simResult = toSimResult(unified)

      expect(simResult.fireAge).toBe(unified.fireAge)
      expect(simResult.fireReachable).toBe(unified.fireReachable)
      expect(simResult.strategy).toBe(unified.strategy)
      expect(simResult.displayEndAge).toBe(unified.displayEndAge)
      expect(simResult.rows.length).toBe(unified.rows.length)

      // SimRows should have valid structure
      if (simResult.rows.length > 0) {
        const firstRow = simResult.rows[0]
        expect(firstRow.age).toBe(42)
        expect(firstRow.phase).toBe('accumulation')
        expect(firstRow.startPortfolio).toBeGreaterThan(0)
      }
    })
  })

  describe('cashflows integratie', () => {
    it('AOW cashflow wordt correct verwerkt', () => {
      const aowCashflow: SimCashflow = {
        id: 'test-aow',
        name: 'AOW',
        type: 'recurring',
        direction: 'income',
        amount: 1350,
        fromAge: 67,
        toAge: null,
        indexed: true,
      }

      const result = runUnifiedProjection(makeInput({
        cashflows: [aowCashflow],
      }))

      expect(result.rows.length).toBeGreaterThan(0)
      // Rows after 67 should have positive cashflowNet
      const postAow = result.rows.filter(r => r.age >= 67)
      if (postAow.length > 0) {
        expect(postAow[0].cashflowNet).toBeGreaterThan(0)
      }
    })
  })

  describe('Box 3 cumulatief', () => {
    it('cumulativeBox3 stijgt monotoon', () => {
      const result = runUnifiedProjection(makeInput({
        assets: [
          makeAsset({ asset_type: 'investment', current_value: 200_000, expected_return: 7, monthly_contribution: 800 }),
        ],
      }))

      let prevCumBox3 = 0
      for (const row of result.rows) {
        expect(row.cumulativeBox3).toBeGreaterThanOrEqual(prevCumBox3)
        prevCumBox3 = row.cumulativeBox3
      }
    })
  })

  describe('inflationFactor', () => {
    it('inflationFactor groeit met (1 + inflationRate)^year', () => {
      const result = runUnifiedProjection(makeInput())
      for (const row of result.rows.slice(0, 10)) {
        const year = row.age - 42
        const expected = Math.pow(1.02, year)
        expect(row.inflationFactor).toBeCloseTo(expected, 4)
      }
    })
  })
})

// ── Fase 1d: Life events integratie in unified engine ────────────────────────

describe('Unified Projection — Fase 1d: Life events integratie', () => {

  describe('lifeEventsToCashflows hergebruik', () => {
    it('lifeEventsToCashflows produceert geldige SimCashflow[]', () => {
      // Verify the function from fire-simulation.ts is directly usable
      const events = [
        {
          id: 'ev-1', user_id: 'test', name: 'AOW', event_type: 'aow',
          target_age: 67, target_date: '2060-01-01', one_time_cost: 0,
          monthly_cost_change: 0, monthly_income_change: 1350, duration_months: 0,
          icon: 'Landmark', is_active: true, sort_order: 0, is_indexed: true,
          metadata: { leefsituatie: 'alleenstaand' },
          created_at: '', updated_at: '',
        },
      ] as any[]
      const flows = lifeEventsToCashflows(events)
      expect(flows.length).toBeGreaterThan(0)
      expect(flows[0].type).toBe('recurring')
      expect(flows[0].direction).toBe('income')
    })
  })

  describe('sabbatical effect (Lisa op leeftijd 50)', () => {
    it('sabbatical op leeftijd 50 produceert zichtbaar cashflow-effect', () => {
      // Lisa-achtig: sabbatical at 50 = -€5500/mnd income for 6 months + €5000 one-time cost
      const sabbaticalCashflows: SimCashflow[] = [
        {
          id: 'sabbatical-income-loss',
          name: 'Sabbatical (inkomensverlies)',
          type: 'recurring',
          direction: 'expense',
          amount: 5500, // monthly lost income
          fromAge: 50,
          toAge: 51, // 1 year (roughly 6 months → rounded up to nearest year)
          indexed: false,
        },
        {
          id: 'sabbatical-extra-cost',
          name: 'Sabbatical (extra kosten)',
          type: 'one_time',
          direction: 'expense',
          amount: 5000,
          fromAge: 50,
          toAge: 50,
          indexed: false,
        },
      ]

      const resultWithSabbatical = runUnifiedProjection(makeLisaInput({
        currentAge: 44,
        cashflows: sabbaticalCashflows,
      }))
      const resultWithout = runUnifiedProjection(makeLisaInput({
        currentAge: 44,
        cashflows: [],
      }))

      // Row at age 50 should show negative cashflowNet
      const sabbaticalRow = resultWithSabbatical.rows.find(r => r.age === 50)
      expect(sabbaticalRow).toBeDefined()
      expect(sabbaticalRow!.cashflowNet).toBeLessThan(0)

      // Net worth at 50 should be lower with sabbatical
      const nwWith = resultWithSabbatical.rows.find(r => r.age === 50)!.netWorth
      const nwWithout = resultWithout.rows.find(r => r.age === 50)!.netWorth
      expect(nwWith).toBeLessThan(nwWithout)

      // The difference should be significant (>€15k from lost income + costs)
      // €5500×12 + €5000 = €71K gross, but reduced by different FIRE timing effects
      expect(nwWithout - nwWith).toBeGreaterThan(15_000)
    })

    it('sabbatical effect is tijdelijk — na sabbatical herstelt cashflowNet', () => {
      const sabbaticalCashflows: SimCashflow[] = [
        {
          id: 'sabbatical-cost',
          name: 'Sabbatical',
          type: 'recurring',
          direction: 'expense',
          amount: 5500,
          fromAge: 50,
          toAge: 51,
          indexed: false,
        },
      ]

      const result = runUnifiedProjection(makeInput({
        cashflows: sabbaticalCashflows,
      }))

      // At age 50: negative cashflowNet
      const at50 = result.rows.find(r => r.age === 50)
      expect(at50).toBeDefined()
      expect(at50!.cashflowNet).toBeLessThan(0)

      // At age 52: cashflowNet should be 0 (no more sabbatical)
      const at52 = result.rows.find(r => r.age === 52)
      if (at52) {
        expect(at52.cashflowNet).toBe(0)
      }
    })
  })

  describe('AOW cashflow — leeftijd en bedrag', () => {
    it('AOW alleenstaand start op correcte leeftijd met correct maandbedrag', () => {
      // NL_AOW_MONTHLY (alleenstaand) ≈ €1350/mnd (from horizon-data.ts)
      const aowCashflow: SimCashflow = {
        id: 'aow-alleen',
        name: 'AOW',
        type: 'recurring',
        direction: 'income',
        amount: 1350, // alleenstaand
        fromAge: 67,
        toAge: null,
        indexed: true,
      }

      const result = runUnifiedProjection(makeInput({
        cashflows: [aowCashflow],
      }))

      // Before age 67: no AOW cashflow
      const at65 = result.rows.find(r => r.age === 65)
      if (at65) {
        expect(at65.cashflowNet).toBe(0)
      }

      // At age 67: AOW starts — €1350 × 12 = €16.200/jaar
      const at67 = result.rows.find(r => r.age === 67)
      if (at67) {
        // cashflowNet should be approximately €16.200 (indexed slightly)
        expect(at67.cashflowNet).toBeGreaterThan(15_000)
        expect(at67.cashflowNet).toBeLessThan(20_000)
      }

      // At age 70: AOW still active, slightly indexed
      const at70 = result.rows.find(r => r.age === 70)
      if (at70) {
        expect(at70.cashflowNet).toBeGreaterThan(15_000)
      }
    })

    it('AOW samenwonend heeft lager bedrag dan alleenstaand', () => {
      const aowAlleen: SimCashflow = {
        id: 'aow-alleen',
        name: 'AOW alleenstaand',
        type: 'recurring',
        direction: 'income',
        amount: 1350,
        fromAge: 67,
        toAge: null,
        indexed: true,
      }
      const aowSamen: SimCashflow = {
        id: 'aow-samen',
        name: 'AOW samenwonend',
        type: 'recurring',
        direction: 'income',
        amount: 940, // samenwonend
        fromAge: 67,
        toAge: null,
        indexed: true,
      }

      const resultAlleen = runUnifiedProjection(makeInput({ cashflows: [aowAlleen] }))
      const resultSamen = runUnifiedProjection(makeInput({ cashflows: [aowSamen] }))

      const cfAlleen = resultAlleen.rows.find(r => r.age === 67)?.cashflowNet ?? 0
      const cfSamen = resultSamen.rows.find(r => r.age === 67)?.cashflowNet ?? 0

      expect(cfAlleen).toBeGreaterThan(cfSamen)
    })

    it('AOW cashflow in fase 3 (withdrawal) wordt meegenomen in grossIncome', () => {
      const aowCashflow: SimCashflow = {
        id: 'aow-test',
        name: 'AOW',
        type: 'recurring',
        direction: 'income',
        amount: 1350,
        fromAge: 67,
        toAge: null,
        indexed: true,
      }

      const result = runUnifiedProjection(makeInput({
        cashflows: [aowCashflow],
      }))

      // Find withdrawal phase rows after AOW age
      const withdrawalRows = result.rows.filter(r => r.phase === 'withdrawal' && r.age >= 67)
      if (withdrawalRows.length > 0) {
        // grossIncome should include the AOW amount
        expect(withdrawalRows[0].grossIncome).toBeGreaterThan(0)
      }
    })

    it('indexed cashflows groeien met inflatie', () => {
      const indexedCf: SimCashflow = {
        id: 'indexed-income',
        name: 'Pensioen',
        type: 'recurring',
        direction: 'income',
        amount: 1000, // €1000/mnd starting
        fromAge: 42, // start immediately
        toAge: null,
        indexed: true,
      }

      const result = runUnifiedProjection(makeInput({
        cashflows: [indexedCf],
      }))

      // Year 0 (age 42): €1000 × 12 = €12.000
      const year0 = result.rows.find(r => r.age === 42)
      expect(year0).toBeDefined()
      expect(year0!.cashflowNet).toBeCloseTo(12_000, -2) // within €100

      // Year 10 (age 52): €1000 × (1.02^10) × 12 ≈ €14.570
      const year10 = result.rows.find(r => r.age === 52)
      if (year10) {
        const expectedMonthly = 1000 * Math.pow(1.02, 10)
        expect(year10.cashflowNet).toBeCloseTo(expectedMonthly * 12, -2)
      }
    })
  })

  describe('erfenis — toevoeging aan beleggingen-bucket', () => {
    it('erfenis na erfbelasting wordt correct toegevoegd aan beleggingen-bucket', () => {
      // Simulate a €100.000 inheritance at age 55 (post-tax amount)
      const erfenisCashflow: SimCashflow = {
        id: 'erfenis-1',
        name: 'Erfenis oma',
        type: 'one_time',
        direction: 'income',
        amount: 80_000, // netto na erfbelasting
        fromAge: 55,
        toAge: 55,
        indexed: false,
      }

      const resultWithErf = runUnifiedProjection(makeInput({
        cashflows: [erfenisCashflow],
      }))
      const resultWithout = runUnifiedProjection(makeInput({
        cashflows: [],
      }))

      // At age 55, the inheritance should boost netWorth
      const nwWith = resultWithErf.rows.find(r => r.age === 55)!.netWorth
      const nwWithout = resultWithout.rows.find(r => r.age === 55)!.netWorth
      expect(nwWith).toBeGreaterThan(nwWithout)

      // Difference should be approximately €80K (plus some growth)
      const diff = nwWith - nwWithout
      expect(diff).toBeGreaterThan(70_000) // At least €70K after drag
      expect(diff).toBeLessThan(100_000)   // Not more than inheritance + 1 year growth

      // The cashflowNet at age 55 should include the inheritance
      const row55 = resultWithErf.rows.find(r => r.age === 55)!
      expect(row55.cashflowNet).toBeGreaterThan(70_000)

      // Investment bucket should have grown (erfenis goes to investable)
      const investBucket55 = row55.assetBuckets['investment']
      const investBucket55Without = resultWithout.rows.find(r => r.age === 55)!.assetBuckets['investment']
      if (investBucket55 && investBucket55Without) {
        expect(investBucket55.endValue).toBeGreaterThan(investBucket55Without.endValue)
      }
    })

    it('begrafeniskosten (expense) worden correct afgetrokken via waterfall', () => {
      // Use pensioen mode with forcedFireAge to ensure identical phase structure
      const begrafenisCashflow: SimCashflow = {
        id: 'begrafenis-1',
        name: 'Begrafeniskosten',
        type: 'one_time',
        direction: 'expense',
        amount: 12_000,
        fromAge: 50,
        toAge: 50,
        indexed: false,
      }

      const baseInput = {
        strategyConfig: { strategy: 'pensioen' as const, endAge: 90, legacyAmount: 0 },
        forcedFireAge: NL_AOW_AGE,
      }

      const resultWith = runUnifiedProjection(makeInput({
        ...baseInput,
        cashflows: [begrafenisCashflow],
      }))
      const resultWithout = runUnifiedProjection(makeInput({
        ...baseInput,
        cashflows: [],
      }))

      // At age 50: expense should reduce netWorth by ~€12K
      const nwWith = resultWith.rows.find(r => r.age === 50)!.netWorth
      const nwWithout = resultWithout.rows.find(r => r.age === 50)!.netWorth
      expect(nwWithout - nwWith).toBeGreaterThan(10_000)
      expect(nwWithout - nwWith).toBeLessThan(15_000)

      // cashflowNet at 50 should be negative
      const row50 = resultWith.rows.find(r => r.age === 50)!
      expect(row50.cashflowNet).toBeLessThan(0)
    })
  })

  describe('meerdere life events gecombineerd', () => {
    it('AOW + erfenis + sabbatical gecombineerd werkt correct', () => {
      const cashflows: SimCashflow[] = [
        // AOW from 67
        {
          id: 'aow', name: 'AOW', type: 'recurring', direction: 'income',
          amount: 1350, fromAge: 67, toAge: null, indexed: true,
        },
        // Erfenis at 55
        {
          id: 'erfenis', name: 'Erfenis', type: 'one_time', direction: 'income',
          amount: 50_000, fromAge: 55, toAge: 55, indexed: false,
        },
        // Sabbatical cost at 48
        {
          id: 'sabbatical', name: 'Sabbatical', type: 'recurring', direction: 'expense',
          amount: 3000, fromAge: 48, toAge: 49, indexed: false,
        },
      ]

      const result = runUnifiedProjection(makeInput({ cashflows }))

      // At 48: sabbatical effect — negative cashflowNet
      const at48 = result.rows.find(r => r.age === 48)
      expect(at48).toBeDefined()
      expect(at48!.cashflowNet).toBeLessThan(0)

      // At 55: erfenis — positive cashflowNet
      const at55 = result.rows.find(r => r.age === 55)
      expect(at55).toBeDefined()
      expect(at55!.cashflowNet).toBeGreaterThan(40_000)

      // At 67: AOW — positive cashflowNet
      const at67 = result.rows.find(r => r.age === 67)
      if (at67) {
        expect(at67.cashflowNet).toBeGreaterThan(0)
      }

      // At 50: no more sabbatical — cashflowNet = 0
      const at50 = result.rows.find(r => r.age === 50)
      if (at50) {
        expect(at50.cashflowNet).toBe(0)
      }
    })
  })
})

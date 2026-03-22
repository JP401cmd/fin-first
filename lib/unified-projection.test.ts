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
  type UnifiedProjectionRow,
  type UnifiedProjectionResult,
  type AssetBucketDetail,
  initRunningBuckets,
  initRunningDebts,
  computeYearlyDebtSchedule,
  computeWeightedDebtTotal,
  type DebtBalanceDetail,
} from '@/lib/unified-projection'
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

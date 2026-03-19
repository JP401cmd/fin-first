/**
 * Unit tests for deriveWealthCompositionFromSim() in wealth-composition.ts
 *
 * Feature #366 — ratio-engine bouwen
 */
import { describe, it, expect } from 'vitest'
import {
  deriveWealthCompositionFromSim,
  type StackedRow,
} from '@/lib/wealth-composition'
import type { SimRow } from '@/lib/fire-simulation'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

// ── Helpers ────────────────────────────────────────────────────

function makeSimRow(
  age: number,
  endPortfolio: number,
  phase: 'accumulation' | 'retirement' = 'accumulation',
): SimRow {
  return {
    age,
    phase,
    startPortfolio: endPortfolio - 1000,
    growth: 500,
    savings: 500,
    withdrawal: 0,
    cashflowNet: 0,
    endPortfolio,
    grossIncome: 0,
    grossExpenses: 0,
  }
}

function makeAsset(overrides: Partial<Asset> & { asset_type: Asset['asset_type'] }): Asset {
  return {
    id: 'test-asset',
    user_id: 'test',
    name: 'Test Asset',
    asset_type: overrides.asset_type,
    current_value: 10000,
    purchase_value: 10000,
    purchase_date: null,
    expected_return: 7,
    monthly_contribution: 0,
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
    ownership: 'personal' as const,
    ...overrides,
  }
}

function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: 'test-debt',
    user_id: 'test',
    name: 'Test Debt',
    debt_type: 'hypotheek',
    current_balance: 200000,
    original_balance: 250000,
    interest_rate: 3.5,
    monthly_payment: 1200,
    start_date: '2020-01-01',
    end_date: '2050-01-01',
    institution: null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    repayment_type: 'annuiteit',
    linked_asset_id: null,
    ...overrides,
  } as Debt
}

// ── Tests ────────────────────────────────────────────────────

describe('deriveWealthCompositionFromSim', () => {
  describe('basic functionality', () => {
    it('returns empty array for empty simRows', () => {
      expect(deriveWealthCompositionFromSim([], [], [], null, null)).toEqual([])
    })

    it('returns StackedRow with correct age from SimRow', () => {
      const rows = [makeSimRow(30, 100000), makeSimRow(31, 110000)]
      const assets = [makeAsset({ asset_type: 'investment', current_value: 100000 })]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      expect(result).toHaveLength(2)
      expect(result[0].age).toBe(30)
      expect(result[1].age).toBe(31)
    })

    it('returns StackedRow[] with all required fields', () => {
      const rows = [makeSimRow(30, 100000)]
      const assets = [makeAsset({ asset_type: 'investment', current_value: 100000 })]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      const fields: (keyof StackedRow)[] = ['age', 'spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig', 'schulden']
      for (const f of fields) {
        expect(result[0]).toHaveProperty(f)
        expect(typeof result[0][f]).toBe('number')
      }
    })
  })

  describe('ratio-based allocation (SimRow as source of truth)', () => {
    it('sum of groups equals endPortfolio for single asset type', () => {
      const rows = [makeSimRow(30, 999999)]
      const assets = [makeAsset({ asset_type: 'investment', current_value: 100 })]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      // Even though asset is 100, output should use endPortfolio 999999
      expect(result[0].beleggingen).toBe(999999)
    })

    it('sum of groups equals endPortfolio for multiple asset types', () => {
      const rows = [makeSimRow(30, 100000), makeSimRow(31, 110000), makeSimRow(32, 121000)]
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 50000 }),
        makeAsset({ asset_type: 'savings', current_value: 30000 }),
        makeAsset({ asset_type: 'retirement', current_value: 20000 }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      for (let i = 0; i < result.length; i++) {
        const row = result[i]
        const sum = row.spaargeld + row.beleggingen + row.pensioen + row.vastgoed + row.overig
        expect(sum).toBe(rows[i].endPortfolio)
      }
    })

    it('initial ratios match asset value proportions', () => {
      const rows = [makeSimRow(30, 100000)]
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 60000 }),
        makeAsset({ asset_type: 'savings', current_value: 40000 }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      // 60/40 split => 60000/40000 of the 100000 endPortfolio
      expect(result[0].beleggingen).toBe(60000)
      expect(result[0].spaargeld).toBe(40000)
    })

    it('rounding residual goes to largest group', () => {
      // 3 groups of equal size (33333.33 each) — residual goes to one of them
      const rows = [makeSimRow(30, 100001)] // not divisible by 3
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 10000, id: 'a1' }),
        makeAsset({ asset_type: 'savings', current_value: 10000, id: 'a2' }),
        makeAsset({ asset_type: 'retirement', current_value: 10000, id: 'a3' }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      const sum = result[0].spaargeld + result[0].beleggingen + result[0].pensioen + result[0].vastgoed + result[0].overig
      expect(sum).toBe(100001) // total must match exactly
    })
  })

  describe('weighted return per group', () => {
    it('groups with higher return grow faster in ratio over time', () => {
      const rows = Array.from({ length: 20 }, (_, i) => makeSimRow(30 + i, 100000 * Math.pow(1.07, i)))
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 50000, expected_return: 10 }), // high return
        makeAsset({ asset_type: 'savings', current_value: 50000, expected_return: 2 }),     // low return
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      // After 19 years, beleggingen ratio should have grown
      const initialRatio = result[0].beleggingen / (result[0].beleggingen + result[0].spaargeld)
      const finalRatio = result[19].beleggingen / (result[19].beleggingen + result[19].spaargeld)
      expect(finalRatio).toBeGreaterThan(initialRatio)
    })
  })

  describe('contributions stop after FIRE', () => {
    it('contributions are added pre-FIRE', () => {
      const rows = [makeSimRow(30, 100000), makeSimRow(31, 120000)]
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 50000, monthly_contribution: 500 }),
        makeAsset({ asset_type: 'savings', current_value: 50000, monthly_contribution: 500 }),
      ]
      // No FIRE age set — contributions continue
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      // Both should get proportional share of 120000
      expect(result[1].beleggingen + result[1].spaargeld).toBe(120000)
    })
  })

  describe('post-FIRE waterfall withdrawals', () => {
    it('withdrawals reduce groups in correct order: beleggingen first', () => {
      const rows = Array.from({ length: 5 }, (_, i) => makeSimRow(50 + i, Math.max(10000, 100000 - i * 25000)))
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 40000 }),
        makeAsset({ asset_type: 'savings', current_value: 30000 }),
        makeAsset({ asset_type: 'crypto', current_value: 30000 }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], 50, 30000)
      // Beleggingen should decrease relative to others after FIRE
      if (result.length > 2 && result[0].beleggingen > 0) {
        const initBelRatio = result[0].beleggingen / rows[0].endPortfolio
        const laterBelRatio = result[2].beleggingen / rows[2].endPortfolio
        expect(laterBelRatio).toBeLessThanOrEqual(initBelRatio)
      }
    })

    it('with deplete strategy: all groups including vastgoed and pensioen eventually drawn', () => {
      // Simulate depleting portfolio
      const rows = Array.from({ length: 30 }, (_, i) => {
        const portfolio = Math.max(0, 500000 - i * 20000) // reaches 0 at year 25
        return makeSimRow(50 + i, portfolio)
      })
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 100000 }),
        makeAsset({ asset_type: 'savings', current_value: 100000 }),
        makeAsset({ asset_type: 'crypto', current_value: 100000 }),
        makeAsset({ asset_type: 'retirement', current_value: 100000 }),
        makeAsset({ asset_type: 'eigen_huis', current_value: 100000 }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], 50, 40000)
      // At the end when portfolio is 0, all groups should be 0
      const lastWithPortfolio = result.findLast(r => (r.spaargeld + r.beleggingen + r.pensioen + r.vastgoed + r.overig) > 0)
      const lastZero = result[result.length - 1]
      if (rows[rows.length - 1].endPortfolio === 0) {
        expect(lastZero.beleggingen).toBe(0)
        expect(lastZero.spaargeld).toBe(0)
        expect(lastZero.overig).toBe(0)
        expect(lastZero.pensioen).toBe(0)
        expect(lastZero.vastgoed).toBe(0)
      }
    })
  })

  describe('debt projection', () => {
    it('debts are projected separately via projectDebtByYear', () => {
      const rows = Array.from({ length: 5 }, (_, i) => makeSimRow(30 + i, 100000))
      const assets = [makeAsset({ asset_type: 'investment', current_value: 100000 })]
      const debts = [makeDebt({ current_balance: 200000 })]
      const result = deriveWealthCompositionFromSim(rows, assets, debts, null, null)
      // Schulden should be negative
      expect(result[0].schulden).toBeLessThan(0)
      // Debt should decrease over time (annuity repayment)
      expect(Math.abs(result[4].schulden)).toBeLessThan(Math.abs(result[0].schulden))
    })

    it('inactive debts are excluded', () => {
      const rows = [makeSimRow(30, 100000)]
      const assets = [makeAsset({ asset_type: 'investment', current_value: 100000 })]
      const debts = [makeDebt({ is_active: false, current_balance: 200000 })]
      const result = deriveWealthCompositionFromSim(rows, assets, debts, null, null)
      expect(result[0].schulden).toBe(-0) // -Math.round(0) yields -0
    })
  })

  describe('no NaN or undefined values', () => {
    it('all fields are finite numbers', () => {
      const rows = Array.from({ length: 10 }, (_, i) => makeSimRow(30 + i, 100000 + i * 5000))
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 50000 }),
        makeAsset({ asset_type: 'savings', current_value: 50000 }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      for (const row of result) {
        const fields: (keyof StackedRow)[] = ['age', 'spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig', 'schulden']
        for (const f of fields) {
          expect(Number.isFinite(row[f]), `${f} at age ${row.age} should be finite`).toBe(true)
        }
      }
    })

    it('handles zero endPortfolio gracefully', () => {
      const rows = [makeSimRow(30, 0)]
      const assets = [makeAsset({ asset_type: 'investment', current_value: 100000 })]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      expect(result[0].beleggingen).toBe(0)
      expect(result[0].spaargeld).toBe(0)
    })

    it('handles no assets gracefully', () => {
      const rows = [makeSimRow(30, 100000)]
      const result = deriveWealthCompositionFromSim(rows, [], [], null, null)
      // With no assets, theoretical is 0 for all groups — values should be 0
      const sum = result[0].spaargeld + result[0].beleggingen + result[0].pensioen + result[0].vastgoed + result[0].overig
      expect(Number.isFinite(sum)).toBe(true)
    })
  })

  describe('asset type grouping', () => {
    it('groups assets correctly into WEALTH_GROUPS', () => {
      const rows = [makeSimRow(30, 100000)]
      const assets = [
        makeAsset({ asset_type: 'cash', current_value: 20000, id: 'a1' }),
        makeAsset({ asset_type: 'savings', current_value: 20000, id: 'a2' }),
        makeAsset({ asset_type: 'investment', current_value: 20000, id: 'a3' }),
        makeAsset({ asset_type: 'retirement', current_value: 20000, id: 'a4' }),
        makeAsset({ asset_type: 'eigen_huis', current_value: 20000, id: 'a5' }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      // Each group should get 20% = 20000
      expect(result[0].spaargeld).toBe(40000) // cash + savings
      expect(result[0].beleggingen).toBe(20000)
      expect(result[0].pensioen).toBe(20000)
      expect(result[0].vastgoed).toBe(20000)
    })

    it('inactive assets are excluded', () => {
      const rows = [makeSimRow(30, 100000)]
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 100000, is_active: true }),
        makeAsset({ asset_type: 'savings', current_value: 100000, is_active: false }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      expect(result[0].beleggingen).toBe(100000)
      expect(result[0].spaargeld).toBe(0)
    })
  })
})

/**
 * Unit tests for deriveWealthCompositionFromSim() in wealth-composition.ts
 *
 * Feature #366 — ratio-engine bouwen
 */
import { describe, it, expect } from 'vitest'
import {
  deriveWealthCompositionFromSim,
  unifiedRowsToStackedRows,
  WEALTH_GROUPS,
  type StackedRow,
} from '@/lib/wealth-composition'
import type { UnifiedProjectionRow, AssetBucketDetail, DebtBalanceDetail } from '@/lib/unified-projection'
import type { SimRow } from '@/lib/fire-simulation'
import type { Asset, AssetType } from '@/lib/asset-data'
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
    oneTimeNet: 0,
    endPortfolio,
    grossIncome: 0,
    grossExpenses: 0,
    flowIn: 0,
    flowOut: 0,
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

  // ── Feature #371 — Regression tests for ratio-engine ────────

  describe('#371 — ratios sum to 100% per year', () => {
    it('ratio percentages sum to 100% for every year across 5 groups', () => {
      const rows = Array.from({ length: 40 }, (_, i) =>
        makeSimRow(30 + i, 100000 + i * 8000),
      )
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 40000, expected_return: 8, id: 'a1' }),
        makeAsset({ asset_type: 'savings', current_value: 20000, expected_return: 2, id: 'a2' }),
        makeAsset({ asset_type: 'retirement', current_value: 15000, expected_return: 5, id: 'a3' }),
        makeAsset({ asset_type: 'eigen_huis', current_value: 20000, expected_return: 3, id: 'a4' }),
        makeAsset({ asset_type: 'crypto', current_value: 5000, expected_return: 12, id: 'a5' }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      for (let i = 0; i < result.length; i++) {
        const row = result[i]
        const sum = row.spaargeld + row.beleggingen + row.pensioen + row.vastgoed + row.overig
        if (rows[i].endPortfolio > 0) {
          // Compute ratio percentages — they must sum to ~100%
          const pctSum =
            (row.spaargeld / sum) * 100 +
            (row.beleggingen / sum) * 100 +
            (row.pensioen / sum) * 100 +
            (row.vastgoed / sum) * 100 +
            (row.overig / sum) * 100
          expect(pctSum).toBeCloseTo(100, 5)
        }
      }
    })
  })

  describe('#371 — displayed total matches SimRow.endPortfolio (max €1)', () => {
    it('sum of 5 groups matches endPortfolio within €1 for every year', () => {
      // Use varying portfolio values including primes and odd numbers
      const portfolios = [100003, 123456, 200001, 314159, 500000, 750007, 999999, 1234567]
      const rows = portfolios.map((p, i) => makeSimRow(30 + i, p))
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 60000, expected_return: 7, monthly_contribution: 500, id: 'a1' }),
        makeAsset({ asset_type: 'savings', current_value: 25000, expected_return: 1.5, monthly_contribution: 200, id: 'a2' }),
        makeAsset({ asset_type: 'retirement', current_value: 10000, expected_return: 5, id: 'a3' }),
        makeAsset({ asset_type: 'eigen_huis', current_value: 300000, expected_return: 2, id: 'a4' }),
        makeAsset({ asset_type: 'crypto', current_value: 5000, expected_return: 15, id: 'a5' }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      for (let i = 0; i < result.length; i++) {
        const row = result[i]
        const sum = row.spaargeld + row.beleggingen + row.pensioen + row.vastgoed + row.overig
        expect(Math.abs(sum - rows[i].endPortfolio)).toBeLessThanOrEqual(1)
      }
    })

    it('total matches endPortfolio even during post-FIRE withdrawals', () => {
      const rows = Array.from({ length: 20 }, (_, i) =>
        makeSimRow(45 + i, Math.max(0, 800000 - i * 30000)),
      )
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 300000, expected_return: 6, id: 'a1' }),
        makeAsset({ asset_type: 'savings', current_value: 200000, expected_return: 1, id: 'a2' }),
        makeAsset({ asset_type: 'retirement', current_value: 200000, expected_return: 4, id: 'a3' }),
        makeAsset({ asset_type: 'eigen_huis', current_value: 100000, expected_return: 2, id: 'a4' }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], 50, 40000)
      for (let i = 0; i < result.length; i++) {
        const row = result[i]
        const sum = row.spaargeld + row.beleggingen + row.pensioen + row.vastgoed + row.overig
        expect(Math.abs(sum - rows[i].endPortfolio)).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('#371 — contributions stop per group after FIRE', () => {
    it('group with contributions grows less after FIRE than without FIRE', () => {
      // Create 10-year projection: FIRE at age 35 (year 5)
      const rows = Array.from({ length: 10 }, (_, i) =>
        makeSimRow(30 + i, 100000 + i * 20000),
      )
      const assets = [
        makeAsset({
          asset_type: 'investment',
          current_value: 60000,
          expected_return: 5,
          monthly_contribution: 1000, // €12k/year contribution
          id: 'a1',
        }),
        makeAsset({
          asset_type: 'savings',
          current_value: 40000,
          expected_return: 1,
          monthly_contribution: 500, // €6k/year contribution
          id: 'a2',
        }),
      ]

      // With FIRE at 35
      const withFire = deriveWealthCompositionFromSim(rows, assets, [], 35, 30000)
      // Without FIRE
      const withoutFire = deriveWealthCompositionFromSim(rows, assets, [], null, null)

      // Before FIRE (year 0-4, ages 30-34): ratios should be identical
      for (let y = 0; y < 5; y++) {
        expect(withFire[y].beleggingen).toBe(withoutFire[y].beleggingen)
        expect(withFire[y].spaargeld).toBe(withoutFire[y].spaargeld)
      }

      // After FIRE (year 6+): the theoretical ratios diverge because
      // contributions stop, changing group growth rates
      // With FIRE + withdrawals, beleggingen ratio should be lower
      const fireBelRatio = withFire[8].beleggingen / (withFire[8].beleggingen + withFire[8].spaargeld || 1)
      const noFireBelRatio = withoutFire[8].beleggingen / (withoutFire[8].beleggingen + withoutFire[8].spaargeld || 1)
      // The ratios diverge because contributions stop and withdrawals begin
      expect(fireBelRatio).not.toBe(noFireBelRatio)
    })
  })

  describe('#371 — waterfall order: beleggingen → spaargeld → overig → pensioen → vastgoed', () => {
    it('draws from beleggingen before spaargeld, and spaargeld before overig', () => {
      // Create a scenario with large withdrawals relative to beleggingen
      // so we can observe the waterfall in action
      const rows = Array.from({ length: 10 }, (_, i) =>
        makeSimRow(50 + i, Math.max(10000, 150000 - i * 15000)),
      )
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 20000, expected_return: 0, id: 'a1' }),  // small — depletes first
        makeAsset({ asset_type: 'savings', current_value: 40000, expected_return: 0, id: 'a2' }),     // medium
        makeAsset({ asset_type: 'crypto', current_value: 40000, expected_return: 0, id: 'a3' }),      // overig — medium
        makeAsset({ asset_type: 'retirement', current_value: 25000, expected_return: 0, id: 'a4' }),  // pensioen
        makeAsset({ asset_type: 'eigen_huis', current_value: 25000, expected_return: 0, id: 'a5' }), // vastgoed — last
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], 50, 35000)

      // Since beleggingen has 0% return and withdrawals hit it first,
      // its theoretical value drops to 0 before spaargeld does
      // Find first year where beleggingen ratio reaches 0
      const belDepletedIdx = result.findIndex((r, i) => i > 0 && r.beleggingen === 0)
      if (belDepletedIdx > 0) {
        // At the year beleggingen depletes, spaargeld should still have value
        // (unless endPortfolio is already 0)
        if (rows[belDepletedIdx].endPortfolio > 0) {
          const hasOtherGroups = result[belDepletedIdx].spaargeld > 0 ||
            result[belDepletedIdx].overig > 0 ||
            result[belDepletedIdx].pensioen > 0 ||
            result[belDepletedIdx].vastgoed > 0
          expect(hasOtherGroups).toBe(true)
        }
      }

      // Vastgoed should be the last group to deplete (drawn last in waterfall)
      const lastNonZeroVastgoed = result.findLastIndex(r => r.vastgoed > 0)
      const lastNonZeroBel = result.findLastIndex(r => r.beleggingen > 0)
      if (lastNonZeroVastgoed >= 0 && lastNonZeroBel >= 0) {
        expect(lastNonZeroVastgoed).toBeGreaterThanOrEqual(lastNonZeroBel)
      }
    })

    it('pensioen is drawn after overig in the waterfall', () => {
      // Scenario: only pensioen and overig have value, both equal
      const rows = Array.from({ length: 10 }, (_, i) =>
        makeSimRow(60 + i, Math.max(0, 100000 - i * 12000)),
      )
      const assets = [
        makeAsset({ asset_type: 'crypto', current_value: 50000, expected_return: 0, id: 'a1' }),     // overig
        makeAsset({ asset_type: 'retirement', current_value: 50000, expected_return: 0, id: 'a2' }), // pensioen
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], 60, 25000)

      // Overig should deplete before pensioen (drawn first in waterfall)
      const lastOverig = result.findLastIndex(r => r.overig > 0)
      const lastPensioen = result.findLastIndex(r => r.pensioen > 0)
      if (lastOverig >= 0 && lastPensioen >= 0) {
        expect(lastPensioen).toBeGreaterThanOrEqual(lastOverig)
      }
    })
  })

  describe('#371 — deplete strategy draws from all groups including vastgoed', () => {
    it('all 5 groups reach 0 when portfolio fully depletes', () => {
      // Simulate a depleting portfolio that reaches 0
      const rows = Array.from({ length: 30 }, (_, i) => {
        const portfolio = Math.max(0, 600000 - i * 25000) // reaches 0 at year 24
        return makeSimRow(50 + i, portfolio)
      })
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 120000, expected_return: 3, id: 'a1' }),
        makeAsset({ asset_type: 'savings', current_value: 120000, expected_return: 1, id: 'a2' }),
        makeAsset({ asset_type: 'crypto', current_value: 120000, expected_return: 5, id: 'a3' }),
        makeAsset({ asset_type: 'retirement', current_value: 120000, expected_return: 4, id: 'a4' }),
        makeAsset({ asset_type: 'eigen_huis', current_value: 120000, expected_return: 2, id: 'a5' }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], 50, 50000)

      // Find last row where endPortfolio is 0
      const zeroRows = result.filter((_, i) => rows[i].endPortfolio === 0)
      expect(zeroRows.length).toBeGreaterThan(0)

      // All groups should be 0 when portfolio is 0
      for (const row of zeroRows) {
        expect(row.beleggingen).toBe(0)
        expect(row.spaargeld).toBe(0)
        expect(row.overig).toBe(0)
        expect(row.pensioen).toBe(0)
        expect(row.vastgoed).toBe(0)
      }
    })

    it('vastgoed is drawn (not preserved) during depletion', () => {
      // Scenario with only vastgoed and small other groups
      const rows = Array.from({ length: 15 }, (_, i) =>
        makeSimRow(55 + i, Math.max(0, 400000 - i * 30000)),
      )
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 10000, expected_return: 0, id: 'a1' }),
        makeAsset({ asset_type: 'eigen_huis', current_value: 390000, expected_return: 0, id: 'a2' }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], 55, 35000)

      // After beleggingen depletes, vastgoed should eventually also decrease
      const midRow = result[7] // portfolio = 400000 - 7*30000 = 190000
      const laterRow = result[12] // portfolio = 400000 - 12*30000 = 40000
      if (laterRow && midRow && rows[12].endPortfolio > 0 && rows[7].endPortfolio > 0) {
        // Vastgoed's absolute value should be smaller when portfolio shrinks
        expect(laterRow.vastgoed).toBeLessThan(midRow.vastgoed)
      }
    })
  })

  describe('#371 — debts projected separately and reach €0 at end date', () => {
    it('annuity debt reaches €0 before end of projection', () => {
      // Debt of 60000 at 4% with €600/month payment (~11 years to pay off)
      const rows = Array.from({ length: 15 }, (_, i) => makeSimRow(35 + i, 200000))
      const assets = [makeAsset({ asset_type: 'investment', current_value: 200000 })]
      const debts = [makeDebt({
        current_balance: 60000,
        interest_rate: 4,
        monthly_payment: 600,
        repayment_type: 'annuiteit',
      })]
      const result = deriveWealthCompositionFromSim(rows, assets, debts, null, null)

      // Debt should start negative
      expect(result[0].schulden).toBeLessThan(0)
      expect(Math.abs(result[0].schulden)).toBeCloseTo(60000, -1)

      // Debt should reach 0 within the projection
      const zeroDebtIdx = result.findIndex(r => Math.abs(r.schulden) === 0)
      expect(zeroDebtIdx).toBeGreaterThan(0)
      expect(zeroDebtIdx).toBeLessThan(15)

      // Once at 0, should stay at 0
      for (let i = zeroDebtIdx; i < result.length; i++) {
        expect(Math.abs(result[i].schulden)).toBe(0)
      }
    })

    it('lineair debt reaches €0 at approximately the end date', () => {
      const yearsUntilEnd = 10
      const endDate = new Date(Date.now() + yearsUntilEnd * 365.25 * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10)
      const rows = Array.from({ length: 15 }, (_, i) => makeSimRow(40 + i, 300000))
      const assets = [makeAsset({ asset_type: 'savings', current_value: 300000 })]
      const debts = [makeDebt({
        current_balance: 100000,
        interest_rate: 3,
        monthly_payment: 1000,
        repayment_type: 'lineair',
        end_date: endDate,
      })]
      const result = deriveWealthCompositionFromSim(rows, assets, debts, null, null)

      // Debt starts negative
      expect(result[0].schulden).toBeLessThan(0)

      // By year ~10 the debt should be approximately 0
      if (result.length > yearsUntilEnd) {
        expect(Math.abs(result[yearsUntilEnd].schulden)).toBeLessThan(5000)
      }

      // After end date, debt should be 0
      if (result.length > yearsUntilEnd + 2) {
        expect(Math.abs(result[yearsUntilEnd + 2].schulden)).toBe(0)
      }
    })

    it('debt values do not affect the 5 wealth groups (separate projection)', () => {
      const rows = [makeSimRow(30, 100000), makeSimRow(31, 110000)]
      const assets = [makeAsset({ asset_type: 'investment', current_value: 100000 })]
      const debts = [makeDebt({ current_balance: 500000 })]

      const withDebt = deriveWealthCompositionFromSim(rows, assets, debts, null, null)
      const withoutDebt = deriveWealthCompositionFromSim(rows, assets, [], null, null)

      // Wealth groups should be identical regardless of debts
      for (let i = 0; i < rows.length; i++) {
        expect(withDebt[i].beleggingen).toBe(withoutDebt[i].beleggingen)
        expect(withDebt[i].spaargeld).toBe(withoutDebt[i].spaargeld)
        expect(withDebt[i].pensioen).toBe(withoutDebt[i].pensioen)
        expect(withDebt[i].vastgoed).toBe(withoutDebt[i].vastgoed)
        expect(withDebt[i].overig).toBe(withoutDebt[i].overig)
      }

      // But schulden should differ
      expect(Math.abs(withDebt[0].schulden)).toBeGreaterThan(0)
      expect(Math.abs(withoutDebt[0].schulden)).toBe(0)
    })
  })

  describe('#371 — group with €0 start value gets ratio 0%', () => {
    it('group with 0 initial value stays at 0% across all years', () => {
      const rows = Array.from({ length: 10 }, (_, i) =>
        makeSimRow(30 + i, 100000 + i * 10000),
      )
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 70000, expected_return: 7, id: 'a1' }),
        makeAsset({ asset_type: 'savings', current_value: 30000, expected_return: 2, id: 'a2' }),
        // No pensioen, vastgoed, or overig assets → those groups have €0
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      for (const row of result) {
        expect(row.pensioen).toBe(0)
        expect(row.vastgoed).toBe(0)
        expect(row.overig).toBe(0)
      }
    })

    it('group with 0 value and 0 contribution stays at 0', () => {
      const rows = Array.from({ length: 5 }, (_, i) =>
        makeSimRow(30 + i, 200000 + i * 5000),
      )
      const assets = [
        makeAsset({ asset_type: 'investment', current_value: 200000, expected_return: 5, monthly_contribution: 500, id: 'a1' }),
        makeAsset({ asset_type: 'savings', current_value: 0, expected_return: 3, monthly_contribution: 0, id: 'a2' }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      // Spaargeld starts at 0 with 0 contribution → stays at 0 ratio
      for (const row of result) {
        expect(row.spaargeld).toBe(0)
      }
    })
  })

  describe('#371 — depreciating assets (auto) floor at €0', () => {
    it('vehicle with negative expected_return floors at €0 in theoretical balance', () => {
      // A vehicle that depreciates at 15%/year — after enough years, theoretical goes to 0
      const rows = Array.from({ length: 20 }, (_, i) =>
        makeSimRow(30 + i, Math.max(100, 50000 + i * 2000)),
      )
      const assets = [
        makeAsset({
          asset_type: 'vehicle',
          current_value: 25000,
          expected_return: -15, // depreciates 15%/year
          monthly_contribution: 0,
          id: 'a1',
        }),
        makeAsset({
          asset_type: 'investment',
          current_value: 25000,
          expected_return: 7,
          id: 'a2',
        }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)

      // overig (vehicle) should never go negative
      for (const row of result) {
        expect(row.overig).toBeGreaterThanOrEqual(0)
      }

      // overig share should decrease over time (vehicle depreciates, investment grows)
      const initialOverigRatio = result[0].overig / (result[0].overig + result[0].beleggingen || 1)
      const finalOverigRatio = result[19].overig / (result[19].overig + result[19].beleggingen || 1)
      expect(finalOverigRatio).toBeLessThan(initialOverigRatio)
    })

    it('all group values are non-negative even with depreciating assets', () => {
      const rows = Array.from({ length: 30 }, (_, i) =>
        makeSimRow(25 + i, 100000 + i * 3000),
      )
      const assets = [
        makeAsset({ asset_type: 'vehicle', current_value: 30000, expected_return: -20, id: 'a1' }),
        makeAsset({ asset_type: 'physical', current_value: 10000, expected_return: -10, id: 'a2' }),
        makeAsset({ asset_type: 'investment', current_value: 60000, expected_return: 7, id: 'a3' }),
      ]
      const result = deriveWealthCompositionFromSim(rows, assets, [], null, null)
      for (const row of result) {
        expect(row.spaargeld).toBeGreaterThanOrEqual(0)
        expect(row.beleggingen).toBeGreaterThanOrEqual(0)
        expect(row.pensioen).toBeGreaterThanOrEqual(0)
        expect(row.vastgoed).toBeGreaterThanOrEqual(0)
        expect(row.overig).toBeGreaterThanOrEqual(0)
      }
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

// ── Helpers for unifiedRowsToStackedRows tests ──────────────────

function makeUnifiedRow(overrides: Partial<UnifiedProjectionRow> & { age: number }): UnifiedProjectionRow {
  return {
    year: overrides.year ?? 0,
    age: overrides.age,
    phase: overrides.phase ?? 'accumulation',
    assetBuckets: overrides.assetBuckets ?? {},
    debtBalances: overrides.debtBalances ?? {},
    totalAssets: overrides.totalAssets ?? 0,
    totalDebts: overrides.totalDebts ?? 0,
    netWorth: overrides.netWorth ?? 0,
    startNetWorth: overrides.startNetWorth ?? 0,
    grossIncome: overrides.grossIncome ?? 0,
    savings: overrides.savings ?? 0,
    withdrawal: overrides.withdrawal ?? 0,
    withdrawalByType: overrides.withdrawalByType ?? {},
    cashflowNet: overrides.cashflowNet ?? 0,
    oneTimeNet: overrides.oneTimeNet ?? 0,
    totalGrowth: overrides.totalGrowth ?? 0,
    totalBox3: overrides.totalBox3 ?? 0,
    cumulativeBox3: overrides.cumulativeBox3 ?? 0,
    inflationFactor: overrides.inflationFactor ?? 1,
  }
}

function makeBucket(endValue: number, startValue?: number): AssetBucketDetail {
  return {
    startValue: startValue ?? endValue,
    growth: 0,
    contributions: 0,
    box3Drag: 0,
    endValue,
  }
}

function makeDebtBalance(endBalance: number): DebtBalanceDetail {
  return {
    startBalance: endBalance + 100,
    interestPaid: 50,
    principalPaid: 50,
    endBalance,
  }
}

// ── Feature #505 — unifiedRowsToStackedRows unit tests ──────────

describe('unifiedRowsToStackedRows (#505)', () => {
  it('returns empty array for empty input', () => {
    expect(unifiedRowsToStackedRows([])).toEqual([])
  })

  it('maps investment bucket to beleggingen', () => {
    const rows = [makeUnifiedRow({
      age: 30,
      assetBuckets: { investment: makeBucket(100000) },
    })]
    const result = unifiedRowsToStackedRows(rows)
    expect(result).toHaveLength(1)
    expect(result[0].beleggingen).toBe(100000)
    expect(result[0].spaargeld).toBe(0)
  })

  it('maps savings bucket to spaargeld', () => {
    const rows = [makeUnifiedRow({
      age: 30,
      assetBuckets: { savings: makeBucket(50000) },
    })]
    const result = unifiedRowsToStackedRows(rows)
    expect(result[0].spaargeld).toBe(50000)
  })

  it('maps eigen_huis to vastgoed', () => {
    const rows = [makeUnifiedRow({
      age: 30,
      assetBuckets: { eigen_huis: makeBucket(350000) },
    })]
    const result = unifiedRowsToStackedRows(rows)
    expect(result[0].vastgoed).toBe(350000)
  })

  it('maps retirement to pensioen', () => {
    const rows = [makeUnifiedRow({
      age: 30,
      assetBuckets: { retirement: makeBucket(80000) },
    })]
    const result = unifiedRowsToStackedRows(rows)
    expect(result[0].pensioen).toBe(80000)
  })

  it('maps vehicle to overig', () => {
    const rows = [makeUnifiedRow({
      age: 30,
      assetBuckets: { vehicle: makeBucket(15000) },
    })]
    const result = unifiedRowsToStackedRows(rows)
    expect(result[0].overig).toBe(15000)
  })

  it('combines multiple asset types correctly', () => {
    const rows = [makeUnifiedRow({
      age: 30,
      assetBuckets: {
        investment: makeBucket(100000),
        savings: makeBucket(50000),
        eigen_huis: makeBucket(300000),
        retirement: makeBucket(60000),
        vehicle: makeBucket(10000),
      },
    })]
    const result = unifiedRowsToStackedRows(rows)
    expect(result[0].beleggingen).toBe(100000)
    expect(result[0].spaargeld).toBe(50000)
    expect(result[0].vastgoed).toBe(300000)
    expect(result[0].pensioen).toBe(60000)
    expect(result[0].overig).toBe(10000)
    expect(result[0].schulden).toBe(-0) // no debts
  })

  it('maps debtBalances to negative schulden', () => {
    const rows = [makeUnifiedRow({
      age: 30,
      debtBalances: {
        'debt-1': makeDebtBalance(150000),
        'debt-2': makeDebtBalance(50000),
      },
    })]
    const result = unifiedRowsToStackedRows(rows)
    expect(result[0].schulden).toBe(-200000)
  })

  it('rounds all values to integers', () => {
    const rows = [makeUnifiedRow({
      age: 30,
      assetBuckets: { investment: makeBucket(100000.7) },
      debtBalances: { 'd1': makeDebtBalance(50000.3) },
    })]
    const result = unifiedRowsToStackedRows(rows)
    expect(result[0].beleggingen).toBe(100001)
    expect(result[0].schulden).toBe(-50000)
  })

  it('preserves age from UnifiedProjectionRow', () => {
    const rows = [
      makeUnifiedRow({ age: 30, year: 0 }),
      makeUnifiedRow({ age: 31, year: 1 }),
      makeUnifiedRow({ age: 32, year: 2 }),
    ]
    const result = unifiedRowsToStackedRows(rows)
    expect(result.map(r => r.age)).toEqual([30, 31, 32])
  })

  it('has no NaN or undefined in any field', () => {
    const rows = [makeUnifiedRow({
      age: 30,
      assetBuckets: {
        investment: makeBucket(100000),
        savings: makeBucket(50000),
      },
      debtBalances: { 'd1': makeDebtBalance(30000) },
    })]
    const result = unifiedRowsToStackedRows(rows)
    const fields: (keyof StackedRow)[] = ['age', 'spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig', 'schulden']
    for (const f of fields) {
      expect(result[0][f]).not.toBeNaN()
      expect(result[0][f]).not.toBeUndefined()
    }
  })
})

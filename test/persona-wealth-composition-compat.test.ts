/**
 * Regression test: Persona seed data × Wealth Composition compatibility
 *
 * Verifies that projectWealthComposition() produces valid stacked chart data
 * for every persona. Checks:
 * - All personas have at least 1 asset (non-empty chart)
 * - Asset types correctly map to WEALTH_GROUPS
 * - Personas with debts (Lisa, Rashid) produce a negative schulden layer
 * - Marijke (retired, high age) gives valid projection despite short horizon
 * - No NaN or undefined values in any projection
 *
 * Feature #364
 */
import { describe, it, expect } from 'vitest'
import { PERSONAS, type PersonaKey, PERSONA_KEYS } from '@/lib/test-personas'
import {
  projectWealthComposition,
  WEALTH_GROUPS,
  type StackedRow,
  type WealthGroup,
} from '@/lib/wealth-composition'
import { ageAtDate } from '@/lib/horizon-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

// ── Helpers ────────────────────────────────────────────────────

/** Convert persona assets to full Asset objects (add missing fields) */
function toAssets(personaAssets: typeof PERSONAS['roos']['assets']): Asset[] {
  return personaAssets.map((a, i) => ({
    id: `test-asset-${i}`,
    user_id: 'test-user',
    name: a.name,
    asset_type: a.asset_type as Asset['asset_type'],
    current_value: a.current_value,
    purchase_value: a.purchase_value,
    purchase_date: a.purchase_date,
    expected_return: a.expected_return,
    monthly_contribution: a.monthly_contribution,
    institution: a.institution || null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: i,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: a.subtype ?? null,
    risk_profile: (a.risk_profile as Asset['risk_profile']) ?? null,
    tax_benefit: a.tax_benefit ?? null,
    is_liquid: a.is_liquid ?? null,
    lock_end_date: a.lock_end_date ?? null,
    ticker_symbol: a.ticker_symbol ?? null,
    rental_income: a.rental_income ?? null,
    woz_value: a.woz_value ?? null,
    retirement_provider_type: (a.retirement_provider_type as Asset['retirement_provider_type']) ?? null,
    depreciation_rate: a.depreciation_rate ?? null,
    address_postcode: a.address_postcode ?? null,
    address_house_number: a.address_house_number ?? null,
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
  }))
}

/** Convert persona debts to full Debt objects */
function toDebts(personaDebts: typeof PERSONAS['roos']['debts']): Debt[] {
  return personaDebts.map((d, i) => ({
    id: `test-debt-${i}`,
    user_id: 'test-user',
    name: d.name,
    debt_type: d.debt_type as Debt['debt_type'],
    original_amount: d.original_amount,
    current_balance: d.current_balance,
    interest_rate: d.interest_rate,
    minimum_payment: d.minimum_payment,
    monthly_payment: d.monthly_payment,
    start_date: d.start_date,
    end_date: null,
    creditor: d.creditor || null,
    notes: null,
    is_active: true,
    sort_order: i,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: d.subtype ?? null,
    is_tax_deductible: d.is_tax_deductible ?? null,
    fixed_rate_end_date: d.fixed_rate_end_date ?? null,
    nhg: d.nhg ?? null,
    linked_asset_id: null,
    credit_limit: d.credit_limit ?? null,
    repayment_type: (d.repayment_type as Debt['repayment_type']) ?? null,
    draagkrachtmeting_date: d.draagkrachtmeting_date ?? null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
  }))
}

/** Check that a StackedRow has no NaN or undefined values */
function assertRowValid(row: StackedRow, label: string) {
  const fields: (keyof StackedRow)[] = [
    'age', 'spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig', 'schulden',
  ]
  for (const field of fields) {
    expect(row[field], `${label}.${field} should not be NaN`).not.toBeNaN()
    expect(row[field], `${label}.${field} should not be undefined`).not.toBeUndefined()
  }
}

// ── Tests ──────────────────────────────────────────────────────

describe('Persona seed data × Wealth Composition compatibility', () => {

  // Step 1: Check asset_types per persona
  describe('Each persona has assets with valid asset_types', () => {
    for (const key of PERSONA_KEYS) {
      it(`${key}: has at least 1 asset`, () => {
        const p = PERSONAS[key]
        expect(p.assets.length).toBeGreaterThanOrEqual(1)
      })

      it(`${key}: all asset_types are in WEALTH_GROUPS`, () => {
        const p = PERSONAS[key]
        for (const a of p.assets) {
          expect(
            a.asset_type in WEALTH_GROUPS,
            `${key}: asset "${a.name}" has type "${a.asset_type}" not in WEALTH_GROUPS`,
          ).toBe(true)
        }
      })
    }
  })

  // Step 2: Verify each persona has at least 1 active asset for the stacked chart
  describe('Each persona produces a non-empty stacked chart', () => {
    for (const key of PERSONA_KEYS) {
      it(`${key}: projectWealthComposition returns rows`, () => {
        const p = PERSONAS[key]
        const currentAge = ageAtDate(p.profile.date_of_birth)
        const endAge = p.profile.fire_end_age ?? 90

        const rows = projectWealthComposition({
          assets: toAssets(p.assets),
          debts: toDebts(p.debts),
          currentAge,
          endAge,
          inflation: p.profile.inflation_rate ?? 0.02,
        })

        expect(rows.length).toBeGreaterThan(0)

        // At least one group should have a non-zero value in year 0
        const firstRow = rows[0]
        const groupSum =
          firstRow.spaargeld +
          firstRow.beleggingen +
          firstRow.pensioen +
          firstRow.vastgoed +
          firstRow.overig
        expect(groupSum, `${key}: should have non-zero assets in year 0`).toBeGreaterThan(0)
      })
    }
  })

  // Step 3: Personas with mortgage should show a debt layer
  describe('Personas with debts produce a schulden layer', () => {
    const personasWithDebts: PersonaKey[] = ['roos', 'daan', 'lisa', 'rashid']

    for (const key of personasWithDebts) {
      it(`${key}: has negative schulden values`, () => {
        const p = PERSONAS[key]
        const currentAge = ageAtDate(p.profile.date_of_birth)
        const endAge = p.profile.fire_end_age ?? 90

        const rows = projectWealthComposition({
          assets: toAssets(p.assets),
          debts: toDebts(p.debts),
          currentAge,
          endAge,
          inflation: p.profile.inflation_rate ?? 0.02,
        })

        // First row should have negative schulden
        expect(rows[0].schulden, `${key}: schulden should be negative`).toBeLessThan(0)
      })
    }

    // Personas with mortgages specifically (Lisa & Rashid)
    for (const key of ['lisa', 'rashid'] as PersonaKey[]) {
      it(`${key}: mortgage produces significant debt layer`, () => {
        const p = PERSONAS[key]
        const currentAge = ageAtDate(p.profile.date_of_birth)
        const endAge = p.profile.fire_end_age ?? 90

        const rows = projectWealthComposition({
          assets: toAssets(p.assets),
          debts: toDebts(p.debts),
          currentAge,
          endAge,
          inflation: p.profile.inflation_rate ?? 0.02,
        })

        // Mortgage should be large (>100K)
        expect(Math.abs(rows[0].schulden)).toBeGreaterThan(100_000)
      })
    }
  })

  // Step 4: Marijke (retired) should give a valid projection despite high age
  describe('Marijke (retired, age ~68) gives valid projection', () => {
    it('produces rows despite short remaining horizon', () => {
      const p = PERSONAS.marijke
      const currentAge = ageAtDate(p.profile.date_of_birth)
      const endAge = p.profile.fire_end_age ?? 90

      expect(currentAge).toBeGreaterThanOrEqual(65) // She's retired

      const rows = projectWealthComposition({
        assets: toAssets(p.assets),
        debts: toDebts(p.debts),
        currentAge,
        endAge,
        inflation: p.profile.inflation_rate ?? 0.02,
      })

      // Should still produce rows (endAge > currentAge)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows[0].age).toBe(currentAge)
      expect(rows[rows.length - 1].age).toBe(endAge)
    })

    it('has no debts (hypotheekvrij)', () => {
      const p = PERSONAS.marijke
      expect(p.debts.length).toBe(0)
    })

    it('schulden layer is 0 throughout', () => {
      const p = PERSONAS.marijke
      const currentAge = ageAtDate(p.profile.date_of_birth)
      const endAge = p.profile.fire_end_age ?? 90

      const rows = projectWealthComposition({
        assets: toAssets(p.assets),
        debts: toDebts(p.debts),
        currentAge,
        endAge,
        inflation: p.profile.inflation_rate ?? 0.02,
      })

      for (const row of rows) {
        // -0 is acceptable (from -Math.round(0) when no debts)
        expect(Math.abs(row.schulden)).toBe(0)
      }
    })
  })

  // Step 5: No NaN or undefined in any projection
  describe('No NaN or undefined values in any projection', () => {
    for (const key of PERSONA_KEYS) {
      it(`${key}: all rows have valid numeric values`, () => {
        const p = PERSONAS[key]
        const currentAge = ageAtDate(p.profile.date_of_birth)
        const endAge = p.profile.fire_end_age ?? 90

        const rows = projectWealthComposition({
          assets: toAssets(p.assets),
          debts: toDebts(p.debts),
          currentAge,
          endAge,
          inflation: p.profile.inflation_rate ?? 0.02,
        })

        for (let i = 0; i < rows.length; i++) {
          assertRowValid(rows[i], `${key}[${i}]`)
        }
      })
    }
  })

  // Step 6: Document asset type grouping per persona
  describe('Asset type grouping correctness', () => {
    it('roos: physical + vehicle → overig group', () => {
      const assets = PERSONAS.roos.assets
      const groups = assets.map(a => WEALTH_GROUPS[a.asset_type as keyof typeof WEALTH_GROUPS])
      expect(groups).toContain('overig')
    })

    it('daan: investment → beleggingen group', () => {
      const assets = PERSONAS.daan.assets
      const groups = assets.map(a => WEALTH_GROUPS[a.asset_type as keyof typeof WEALTH_GROUPS])
      expect(groups).toContain('beleggingen')
    })

    it('lisa: investment + eigen_huis + vehicle → beleggingen + vastgoed + overig', () => {
      const assets = PERSONAS.lisa.assets
      const groups = new Set(assets.map(a => WEALTH_GROUPS[a.asset_type as keyof typeof WEALTH_GROUPS]))
      expect(groups.has('beleggingen')).toBe(true)
      expect(groups.has('vastgoed')).toBe(true)
      expect(groups.has('overig')).toBe(true)
    })

    it('willem: investment + retirement + eigen_huis + real_estate + vehicle', () => {
      const assets = PERSONAS.willem.assets
      const groups = new Set(assets.map(a => WEALTH_GROUPS[a.asset_type as keyof typeof WEALTH_GROUPS]))
      expect(groups.has('beleggingen')).toBe(true)
      expect(groups.has('pensioen')).toBe(true)
      expect(groups.has('vastgoed')).toBe(true)
      expect(groups.has('overig')).toBe(true)
    })

    it('marijke: investment + eigen_huis + physical → beleggingen + vastgoed + overig', () => {
      const assets = PERSONAS.marijke.assets
      const groups = new Set(assets.map(a => WEALTH_GROUPS[a.asset_type as keyof typeof WEALTH_GROUPS]))
      expect(groups.has('beleggingen')).toBe(true)
      expect(groups.has('vastgoed')).toBe(true)
      expect(groups.has('overig')).toBe(true)
    })
  })
})

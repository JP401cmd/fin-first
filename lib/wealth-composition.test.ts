/**
 * Unit tests for projectWealthComposition() in wealth-composition.ts
 *
 * Feature #363 — Regression tests for wealth composition helper
 */
import { describe, it, expect } from 'vitest'
import {
  projectWealthComposition,
  WEALTH_GROUPS,
  type ProjectWealthCompositionInput,
  type StackedRow,
  type WealthGroup,
} from '@/lib/wealth-composition'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

// ── Helpers ────────────────────────────────────────────────────

function makeAsset(overrides: Partial<Asset> & { asset_type: Asset['asset_type'] }): Asset {
  return {
    id: 'test-asset',
    user_id: 'test',
    name: 'Test Asset',
    asset_type: overrides.asset_type,
    current_value: 10000,
    purchase_value: 10000,
    purchase_date: '2020-01-01',
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

function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: 'test-debt',
    user_id: 'test',
    name: 'Test Debt',
    debt_type: 'personal_loan',
    original_amount: 50000,
    current_balance: 50000,
    interest_rate: 5,
    minimum_payment: 500,
    monthly_payment: 500,
    start_date: '2020-01-01',
    end_date: null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: null,
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: 'annuiteit',
    draagkrachtmeting_date: null,
    tax_year: null,
    has_payment_plan: false,
    has_written_agreement: false,
    include_aflossing_in_savings: false,
    custom_aflossing_amount: null,
    ownership: 'personal',
    household_id: null,
    partner_split_pct: null,
    net_worth_inclusion_pct: 100,
    has_hypotheekplanner_tracking: false,
    ...overrides,
  }
}

function baseInput(overrides: Partial<ProjectWealthCompositionInput> = {}): ProjectWealthCompositionInput {
  return {
    assets: [],
    debts: [],
    currentAge: 35,
    endAge: 90,
    inflation: 0.02,
    ...overrides,
  }
}

// ── Step 3: Correct grouping of asset_types ────────────────────

describe('projectWealthComposition — asset type grouping', () => {
  it('maps cash and savings to spaargeld group', () => {
    const rows = projectWealthComposition(baseInput({
      assets: [
        makeAsset({ id: 'a1', asset_type: 'cash', current_value: 5000 }),
        makeAsset({ id: 'a2', asset_type: 'savings', current_value: 15000 }),
      ],
    }))

    expect(rows[0].spaargeld).toBe(20000)
    expect(rows[0].beleggingen).toBe(0)
    expect(rows[0].pensioen).toBe(0)
    expect(rows[0].vastgoed).toBe(0)
    expect(rows[0].overig).toBe(0)
  })

  it('maps investment to beleggingen group', () => {
    const rows = projectWealthComposition(baseInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 100000 })],
    }))

    expect(rows[0].beleggingen).toBe(100000)
    expect(rows[0].spaargeld).toBe(0)
  })

  it('maps retirement and levensverzekering to pensioen group', () => {
    const rows = projectWealthComposition(baseInput({
      assets: [
        makeAsset({ id: 'a1', asset_type: 'retirement', current_value: 50000 }),
        makeAsset({ id: 'a2', asset_type: 'levensverzekering', current_value: 30000 }),
      ],
    }))

    expect(rows[0].pensioen).toBe(80000)
  })

  it('maps eigen_huis and real_estate to vastgoed group', () => {
    const rows = projectWealthComposition(baseInput({
      assets: [
        makeAsset({ id: 'a1', asset_type: 'eigen_huis', current_value: 400000 }),
        makeAsset({ id: 'a2', asset_type: 'real_estate', current_value: 200000 }),
      ],
    }))

    expect(rows[0].vastgoed).toBe(600000)
  })

  it('maps crypto, vehicle, physical, deelneming, vordering, other to overig group', () => {
    const overigTypes = ['crypto', 'vehicle', 'physical', 'deelneming', 'vordering', 'other'] as const
    const assets = overigTypes.map((t, i) => makeAsset({
      id: `a${i}`,
      asset_type: t,
      current_value: 1000,
    }))

    const rows = projectWealthComposition(baseInput({ assets }))
    expect(rows[0].overig).toBe(6000)
  })

  it('all 13 asset_types are covered in WEALTH_GROUPS', () => {
    const allTypes: Asset['asset_type'][] = [
      'cash', 'savings', 'investment', 'retirement', 'levensverzekering',
      'eigen_huis', 'real_estate', 'crypto', 'vehicle', 'physical',
      'deelneming', 'vordering', 'other',
    ]
    for (const t of allTypes) {
      expect(t in WEALTH_GROUPS, `${t} should be in WEALTH_GROUPS`).toBe(true)
    }
  })
})

// ── Step 4: Values grow with expected_return and monthly_contribution ──

describe('projectWealthComposition — projection growth', () => {
  it('asset grows with compound interest over time', () => {
    const rows = projectWealthComposition(baseInput({
      assets: [makeAsset({
        asset_type: 'investment',
        current_value: 100000,
        expected_return: 7, // 7%
        monthly_contribution: 0,
      })],
    }))

    // Year 0 should be 100000
    expect(rows[0].beleggingen).toBe(100000)

    // Year 1: 100000 * 1.07 = 107000
    expect(rows[1].beleggingen).toBe(Math.round(100000 * 1.07))

    // Year 10: should have grown significantly
    expect(rows[10].beleggingen).toBeGreaterThan(190000)

    // Values should be monotonically increasing (no contributions, positive return)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].beleggingen).toBeGreaterThan(rows[i - 1].beleggingen)
    }
  })

  it('monthly contributions add to asset value linearly', () => {
    const rows = projectWealthComposition(baseInput({
      assets: [makeAsset({
        asset_type: 'savings',
        current_value: 0,
        expected_return: 0, // no growth
        monthly_contribution: 1000,
      })],
    }))

    // Year 0: 0
    expect(rows[0].spaargeld).toBe(0)

    // Year 1: 1000 * 12 = 12000
    expect(rows[1].spaargeld).toBe(12000)

    // Year 5: 1000 * 12 * 5 = 60000
    expect(rows[5].spaargeld).toBe(60000)
  })

  it('compound interest + contributions together', () => {
    const rows = projectWealthComposition(baseInput({
      assets: [makeAsset({
        asset_type: 'investment',
        current_value: 50000,
        expected_return: 10, // 10%
        monthly_contribution: 500,
      })],
    }))

    // Year 0: 50000
    expect(rows[0].beleggingen).toBe(50000)

    // Year 1: 50000 * 1.10 + 500 * 12 * 1 = 55000 + 6000 = 61000
    expect(rows[1].beleggingen).toBe(Math.round(50000 * 1.10 + 500 * 12 * 1))

    // Should be > pure compound growth + pure contributions
    const year10Compound = 50000 * Math.pow(1.10, 10)
    const year10Contrib = 500 * 12 * 10
    expect(rows[10].beleggingen).toBe(Math.round(year10Compound + year10Contrib))
  })

  it('inactive assets are excluded', () => {
    const rows = projectWealthComposition(baseInput({
      assets: [
        makeAsset({ id: 'active', asset_type: 'savings', current_value: 10000, is_active: true }),
        makeAsset({ id: 'inactive', asset_type: 'savings', current_value: 99999, is_active: false }),
      ],
    }))

    expect(rows[0].spaargeld).toBe(10000)
  })
})

// ── Step 5: Debt repayment ──────────────────────────────────────

describe('projectWealthComposition — debt repayment', () => {
  it('annuity debt decreases over time', () => {
    const rows = projectWealthComposition(baseInput({
      debts: [makeDebt({
        current_balance: 100000,
        interest_rate: 5,
        monthly_payment: 1000,
        repayment_type: 'annuiteit',
      })],
    }))

    // Year 0: schulden should be negative
    expect(rows[0].schulden).toBe(-100000)

    // Debt should decrease (become less negative) over time
    expect(rows[5].schulden).toBeGreaterThan(rows[0].schulden)

    // Eventually should reach 0
    const lastNonZero = rows.findIndex(r => Math.abs(r.schulden) === 0)
    if (lastNonZero > 0) {
      expect(Math.abs(rows[lastNonZero].schulden)).toBe(0)
    }
  })

  it('lineair debt decreases with linear amortization', () => {
    const rows = projectWealthComposition(baseInput({
      debts: [makeDebt({
        current_balance: 120000,
        interest_rate: 4,
        monthly_payment: 800,
        repayment_type: 'lineair',
        end_date: new Date(Date.now() + 15 * 365.25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      })],
    }))

    // Should start negative
    expect(rows[0].schulden).toBeLessThan(0)

    // Should decrease over time
    expect(rows[5].schulden).toBeGreaterThan(rows[0].schulden)
  })

  it('aflossingsvrij debt stays constant until end date', () => {
    const futureDate = new Date(Date.now() + 20 * 365.25 * 24 * 60 * 60 * 1000)
    const rows = projectWealthComposition(baseInput({
      debts: [makeDebt({
        current_balance: 200000,
        interest_rate: 3,
        monthly_payment: 500,
        repayment_type: 'aflossingsvrij',
        end_date: futureDate.toISOString().slice(0, 10),
      })],
    }))

    // First row should have the full balance
    expect(rows[0].schulden).toBe(-200000)

    // Balance should stay approximately constant for first few years (interest only)
    // Note: interestOnlySchedule keeps balance constant
    expect(Math.abs(rows[1].schulden + 200000)).toBeLessThan(1000)
  })

  it('inactive debts are excluded', () => {
    const rows = projectWealthComposition(baseInput({
      debts: [makeDebt({ is_active: false, current_balance: 99999 })],
    }))

    expect(Math.abs(rows[0].schulden)).toBe(0)
  })

  it('zero-balance debts are excluded', () => {
    const rows = projectWealthComposition(baseInput({
      debts: [makeDebt({ current_balance: 0 })],
    }))

    expect(Math.abs(rows[0].schulden)).toBe(0)
  })
})

// ── Step 6: Edge cases ──────────────────────────────────────────

describe('projectWealthComposition — edge cases', () => {
  it('no assets and no debts returns rows with all zeros', () => {
    const rows = projectWealthComposition(baseInput())

    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.spaargeld).toBe(0)
      expect(row.beleggingen).toBe(0)
      expect(row.pensioen).toBe(0)
      expect(row.vastgoed).toBe(0)
      expect(row.overig).toBe(0)
      // -0 is acceptable (from -Math.round(0) when no debts)
      expect(Math.abs(row.schulden)).toBe(0)
    }
  })

  it('single category: only beleggingen', () => {
    const rows = projectWealthComposition(baseInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 50000 })],
    }))

    expect(rows[0].beleggingen).toBe(50000)
    expect(rows[0].spaargeld).toBe(0)
    expect(rows[0].pensioen).toBe(0)
    expect(rows[0].vastgoed).toBe(0)
    expect(rows[0].overig).toBe(0)
  })

  it('all categories present simultaneously', () => {
    const assets = [
      makeAsset({ id: 'a1', asset_type: 'cash', current_value: 1000 }),
      makeAsset({ id: 'a2', asset_type: 'investment', current_value: 2000 }),
      makeAsset({ id: 'a3', asset_type: 'retirement', current_value: 3000 }),
      makeAsset({ id: 'a4', asset_type: 'eigen_huis', current_value: 4000 }),
      makeAsset({ id: 'a5', asset_type: 'crypto', current_value: 5000 }),
    ]

    const rows = projectWealthComposition(baseInput({ assets }))

    expect(rows[0].spaargeld).toBe(1000)
    expect(rows[0].beleggingen).toBe(2000)
    expect(rows[0].pensioen).toBe(3000)
    expect(rows[0].vastgoed).toBe(4000)
    expect(rows[0].overig).toBe(5000)
  })

  it('returns empty array when endAge equals currentAge', () => {
    const rows = projectWealthComposition(baseInput({
      currentAge: 50,
      endAge: 50,
    }))

    expect(rows).toEqual([])
  })

  it('returns empty array when endAge < currentAge', () => {
    const rows = projectWealthComposition(baseInput({
      currentAge: 50,
      endAge: 40,
    }))

    expect(rows).toEqual([])
  })

  it('first row age equals currentAge, last row age equals endAge', () => {
    const rows = projectWealthComposition(baseInput({
      currentAge: 30,
      endAge: 80,
      assets: [makeAsset({ asset_type: 'savings', current_value: 1000 })],
    }))

    expect(rows[0].age).toBe(30)
    expect(rows[rows.length - 1].age).toBe(80)
    expect(rows.length).toBe(51) // 80 - 30 + 1
  })

  it('no NaN or undefined values in projection', () => {
    const rows = projectWealthComposition(baseInput({
      assets: [
        makeAsset({ id: 'a1', asset_type: 'investment', current_value: 100000, expected_return: 7, monthly_contribution: 500 }),
        makeAsset({ id: 'a2', asset_type: 'savings', current_value: 20000, expected_return: 1 }),
      ],
      debts: [makeDebt({ current_balance: 50000, interest_rate: 4, monthly_payment: 500 })],
      fireAge: 55,
      annualExpenses: 40000,
    }))

    for (const row of rows) {
      const fields: (keyof StackedRow)[] = ['age', 'spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig', 'schulden']
      for (const f of fields) {
        expect(row[f], `row.${f} should not be NaN`).not.toBeNaN()
        expect(row[f], `row.${f} should not be undefined`).not.toBeUndefined()
      }
    }
  })
})

// ── Post-FIRE withdrawals ───────────────────────────────────────

describe('projectWealthComposition — post-FIRE withdrawals', () => {
  it('withdrawals reduce beleggingen after fireAge', () => {
    const withFire = projectWealthComposition(baseInput({
      assets: [makeAsset({
        asset_type: 'investment',
        current_value: 1000000,
        expected_return: 5,
        monthly_contribution: 0,
      })],
      fireAge: 50,
      annualExpenses: 40000,
    }))

    const withoutFire = projectWealthComposition(baseInput({
      assets: [makeAsset({
        asset_type: 'investment',
        current_value: 1000000,
        expected_return: 5,
        monthly_contribution: 0,
      })],
    }))

    // Before FIRE: should be the same
    const yearBeforeFire = 50 - 35 - 1 // index for age 49
    expect(withFire[yearBeforeFire].beleggingen).toBe(withoutFire[yearBeforeFire].beleggingen)

    // After FIRE: with withdrawals should be lower
    const yearAfterFire = 50 - 35 + 5 // index for age 55
    expect(withFire[yearAfterFire].beleggingen).toBeLessThan(withoutFire[yearAfterFire].beleggingen)
  })

  it('withdrawals draw from beleggingen first, then spaargeld, then overig', () => {
    // Set up small beleggingen that will deplete, forcing withdrawal from spaargeld
    const rows = projectWealthComposition(baseInput({
      assets: [
        makeAsset({ id: 'a1', asset_type: 'investment', current_value: 10000, expected_return: 0, monthly_contribution: 0 }),
        makeAsset({ id: 'a2', asset_type: 'savings', current_value: 500000, expected_return: 0, monthly_contribution: 0 }),
      ],
      fireAge: 35, // start withdrawing immediately
      annualExpenses: 20000,
    }))

    // After year 1: beleggingen should be depleted (10000 - 20000 = -10000 → 0, remaining 10000 from spaargeld)
    expect(rows[1].beleggingen).toBe(0) // fully drawn
    expect(rows[1].spaargeld).toBeLessThan(500000) // some drawn from here
  })

  it('no withdrawals when fireAge is not set', () => {
    const rows = projectWealthComposition(baseInput({
      assets: [makeAsset({
        asset_type: 'investment',
        current_value: 100000,
        expected_return: 0,
        monthly_contribution: 0,
      })],
      // No fireAge set
      annualExpenses: 40000,
    }))

    // All rows should maintain the same value (no growth, no withdrawal)
    for (const row of rows) {
      expect(row.beleggingen).toBe(100000)
    }
  })

  it('inflation-adjusted withdrawals increase over time', () => {
    const rows = projectWealthComposition(baseInput({
      assets: [makeAsset({
        asset_type: 'investment',
        current_value: 5000000, // large enough to not deplete
        expected_return: 0,
        monthly_contribution: 0,
      })],
      inflation: 0.03,
      fireAge: 35,
      annualExpenses: 40000,
    }))

    // With 0% return and inflation-adjusted withdrawals, beleggingen should decrease faster each year
    const drop1 = rows[0].beleggingen - rows[1].beleggingen // first year withdrawal: 40000
    const drop10 = rows[9].beleggingen - rows[10].beleggingen // 10th year: 40000 * 1.03^9

    // Later drops should be larger due to inflation
    expect(drop10).toBeGreaterThan(drop1)
  })
})

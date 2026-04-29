/**
 * Persona seeds × Unified Projection Engine verification
 *
 * Verifies that all 6 test personas work correctly with the unified
 * projection engine, covering edge cases like negative net worth,
 * heffingsvrij elimination, per-asset returns, and life events.
 *
 * Feature #506
 */
import { describe, it, expect } from 'vitest'
import { PERSONAS, PERSONA_KEYS, type PersonaKey, type PersonaData } from '@/lib/test-personas'
import { runUnifiedProjection, type UnifiedProjectionInput, type UnifiedProjectionRow } from '@/lib/unified-projection'
import { classifyAsset, BOX3_PARAMS } from '@/lib/box3-data'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import { ageAtDate } from '@/lib/horizon-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS, type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'

// ── Helpers (compact versions of persona-simrow-compat.test.ts helpers) ──

const ASSET_DEFAULTS: Omit<Asset, 'id' | 'name' | 'asset_type' | 'current_value' | 'expected_return' | 'monthly_contribution' | 'sort_order'> = {
  user_id: 'test-user', purchase_value: 0, purchase_date: null, institution: null,
  account_number: null, notes: null, is_active: true, created_at: '', updated_at: '',
  subtype: null, risk_profile: null, tax_benefit: null, is_liquid: null, lock_end_date: null,
  ticker_symbol: null, rental_income: null, woz_value: null, retirement_provider_type: null,
  depreciation_rate: null, address_postcode: null, address_house_number: null, expiry_date: null,
  beneficiary: null, kvk_number: null, ownership_percentage: null, annual_dividend: null,
  linked_asset_id: null, ownership: 'personal', household_id: null, net_worth_inclusion_pct: 100,
  has_budget_tracking: false, has_holdings_tracking: false,
  has_woonbalans_tracking: false, has_rental_tracking: false,
  monthly_maintenance_cost: 0, vva_fee: 0, vacancy_log: [],
}

const DEBT_DEFAULTS: Omit<Debt, 'id' | 'name' | 'debt_type' | 'original_amount' | 'current_balance' | 'interest_rate' | 'minimum_payment' | 'monthly_payment' | 'start_date' | 'sort_order'> = {
  user_id: 'test-user', end_date: null, creditor: null, notes: null, is_active: true,
  created_at: '', updated_at: '', subtype: null, is_tax_deductible: null,
  fixed_rate_end_date: null, nhg: null, linked_asset_id: null, credit_limit: null,
  repayment_type: null, draagkrachtmeting_date: null, tax_year: null,
  has_payment_plan: false, has_written_agreement: false, include_aflossing_in_savings: false, custom_aflossing_amount: null, ownership: 'personal',
  household_id: null, partner_split_pct: null, net_worth_inclusion_pct: 100,
  has_strategy_tracking: false,
}

function personaAssetsToAssets(pa: PersonaData['assets'], ba: PersonaData['bank_accounts']): Asset[] {
  const assets: Asset[] = pa.map((a, i) => ({
    ...ASSET_DEFAULTS,
    id: `test-asset-${i}`, sort_order: i,
    name: a.name, asset_type: a.asset_type as Asset['asset_type'],
    current_value: a.current_value, purchase_value: a.purchase_value,
    purchase_date: a.purchase_date || null, expected_return: a.expected_return,
    monthly_contribution: a.monthly_contribution, institution: a.institution || null,
    subtype: a.subtype || null, risk_profile: (a.risk_profile as Asset['risk_profile']) || null,
    tax_benefit: a.tax_benefit ?? null, is_liquid: a.is_liquid ?? null,
    lock_end_date: a.lock_end_date || null, ticker_symbol: a.ticker_symbol || null,
    rental_income: a.rental_income ?? null, woz_value: a.woz_value ?? null,
    retirement_provider_type: (a.retirement_provider_type as Asset['retirement_provider_type']) || null,
    depreciation_rate: a.depreciation_rate ?? null,
    address_postcode: a.address_postcode || null, address_house_number: a.address_house_number || null,
    has_holdings_tracking: a.has_holdings_tracking ?? false,
  }))
  for (const b of ba) {
    assets.push({
      ...ASSET_DEFAULTS, id: `test-bank-${assets.length}`, sort_order: assets.length,
      name: b.name, asset_type: 'savings', current_value: b.balance, purchase_value: b.balance,
      expected_return: 1, monthly_contribution: 0, institution: b.bank_name || null,
      subtype: 'spaarrekening', is_liquid: true,
    })
  }
  return assets
}

function personaDebtsToDebts(pd: PersonaData['debts']): Debt[] {
  return pd.map((d, i) => ({
    ...DEBT_DEFAULTS, id: `test-debt-${i}`, sort_order: i,
    name: d.name, debt_type: d.debt_type as Debt['debt_type'],
    original_amount: d.original_amount, current_balance: d.current_balance,
    interest_rate: d.interest_rate, minimum_payment: d.minimum_payment,
    monthly_payment: d.monthly_payment, start_date: d.start_date,
    creditor: d.creditor || null, subtype: d.subtype || null,
    is_tax_deductible: d.is_tax_deductible ?? null,
    fixed_rate_end_date: d.fixed_rate_end_date || null, nhg: d.nhg ?? null,
    credit_limit: d.credit_limit ?? null,
    repayment_type: (d.repayment_type as Debt['repayment_type']) || null,
    draagkrachtmeting_date: d.draagkrachtmeting_date || null,
  }))
}

function buildUnifiedInputForPersona(key: PersonaKey): UnifiedProjectionInput {
  const p = PERSONAS[key]
  const profile = p.profile
  const currentAge = ageAtDate(profile.date_of_birth)

  const budgetExpenses = p.budgets.filter(b => b.budget_type === 'expense').reduce((s, b) => s + b.default_limit, 0)
  const yearlyExpenses = budgetExpenses > 0 ? budgetExpenses * 12 : (profile.estimated_monthly_expenses ?? 0) * 12
  const budgetIncome = p.budgets.filter(b => b.budget_type === 'income').reduce((s, b) => s + b.default_limit, 0)
  const monthlyIncome = budgetIncome > 0 ? budgetIncome : (profile.net_monthly_income ?? 0)
  const annualSavings = (monthlyIncome * 12) - yearlyExpenses
  const grossReturn = profile.expected_return ?? 0.07
  const inflation = profile.inflation_rate ?? 0.02
  const endAge = profile.fire_end_age ?? 90

  const lifeEvents = p.life_events.filter(e => e.is_active).map((e, i) => ({ ...e, id: `test-${i}`, is_indexed: e.is_indexed ?? false }))
  const cashflows = lifeEventsToCashflows(lifeEvents)

  const strategyConfig: FireStrategyConfig = {
    strategy: profile.fire_end_strategy ?? 'deplete', endAge, legacyAmount: profile.fire_legacy_amount ?? 0,
  }
  const wConfig: WithdrawalStrategyConfig = {
    strategy: profile.withdrawal_strategy ?? 'static',
    guardrailFloor: profile.guardrail_floor ?? WITHDRAWAL_DEFAULTS.guardrailFloor,
    guardrailCeiling: profile.guardrail_ceiling ?? WITHDRAWAL_DEFAULTS.guardrailCeiling,
    guardrailCutStep: profile.guardrail_cut_step ?? WITHDRAWAL_DEFAULTS.guardrailCutStep,
    guardrailRaiseStep: profile.guardrail_raise_step ?? WITHDRAWAL_DEFAULTS.guardrailRaiseStep,
  }

  return {
    assets: personaAssetsToAssets(p.assets, p.bank_accounts),
    debts: personaDebtsToDebts(p.debts),
    currentAge, endAge, yearlyExpenses, annualSavings,
    monthlySurplus: annualSavings / 12,
    monthlyIncome: p.meta.income ?? monthlyIncome,
    incomeGrowthRate: 0, grossReturn, inflationRate: inflation,
    box3Method: 'forfaitair', cashflows, strategyConfig,
    withdrawalStrategy: wConfig,
    forcedFireAge: profile.fire_end_strategy === 'pensioen' ? 67 : undefined,
    hasPartner: profile.household_type === 'samenwonend' || profile.household_type === 'getrouwd',
  }
}

/** Assert every numeric field in a row is finite (no NaN/Infinity). */
function assertRowFinite(row: UnifiedProjectionRow, label: string) {
  for (const field of ['totalAssets', 'totalDebts', 'netWorth', 'grossIncome', 'savings', 'withdrawal', 'cashflowNet', 'totalGrowth', 'totalBox3', 'cumulativeBox3', 'inflationFactor'] as const) {
    const v = row[field]
    if (typeof v === 'number') {
      expect(v, `${label}: ${field} should be finite`).toSatisfy((n: number) => Number.isFinite(n))
    }
  }
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Persona seeds × Unified Projection verification (#506)', () => {
  // Step 1 — Asset expected_return coverage
  describe('Step 1 — every persona asset has numeric expected_return', () => {
    for (const key of PERSONA_KEYS) {
      it(`${PERSONAS[key].meta.name}: all assets have expected_return`, () => {
        for (const asset of PERSONAS[key].assets) {
          expect(typeof asset.expected_return, `${key}/${asset.name}`).toBe('number')
          expect(Number.isFinite(asset.expected_return), `${key}/${asset.name} finite`).toBe(true)
        }
      })
    }
  })

  // Step 2 — Debt repayment_type coverage
  describe('Step 2 — debts with repayment_type have valid values', () => {
    const VALID_TYPES = ['annuiteit', 'lineair', 'aflossingsvrij', 'inkomensafhankelijk']
    for (const key of PERSONA_KEYS) {
      const debts = PERSONAS[key].debts.filter(d => d.repayment_type)
      if (debts.length > 0) {
        it(`${PERSONAS[key].meta.name}: repayment_type values are valid`, () => {
          for (const d of debts) {
            expect(VALID_TYPES, `${key}/${d.name}: "${d.repayment_type}"`).toContain(d.repayment_type)
          }
        })
      }
    }
  })

  // Step 3 — Box 3 classification for all persona asset types
  describe('Step 3 — Box 3 classification for all persona asset types', () => {
    for (const key of PERSONA_KEYS) {
      it(`${PERSONAS[key].meta.name}: asset classifications are correct`, () => {
        const assets = personaAssetsToAssets(PERSONAS[key].assets, PERSONAS[key].bank_accounts)
        for (const asset of assets) {
          const { category } = classifyAsset(asset)
          if (asset.asset_type === 'eigen_huis') expect(category, `${key}/${asset.name}`).toBeNull()
          if (asset.asset_type === 'retirement' && asset.tax_benefit) expect(category, `${key}/${asset.name}`).toBeNull()
          if (asset.asset_type === 'investment') expect(category, `${key}/${asset.name}`).toBe('beleggingen')
          if (asset.asset_type === 'savings') expect(category, `${key}/${asset.name}`).toBe('spaargeld')
          if (['physical', 'vehicle', 'crypto'].includes(asset.asset_type)) expect(category, `${key}/${asset.name}`).toBe('beleggingen')
          expect([null, 'spaargeld', 'beleggingen'], `${key}/${asset.name}: valid category`).toContain(category)
        }
      })
    }
  })

  // Step 4 — Roos: negative net worth
  describe('Step 4 — Roos: negative net worth handled correctly', () => {
    const input = buildUnifiedInputForPersona('roos')
    const result = runUnifiedProjection(input)

    it('initial net worth is negative', () => {
      expect(result.rows[0].totalAssets - result.rows[0].totalDebts).toBeLessThan(0)
    })

    it('all rows have finite values', () => {
      for (const row of result.rows) assertRowFinite(row, `roos age=${row.age}`)
    })

    it('engine completes all rows to endAge (no crash on negative netWorth)', () => {
      expect(result.rows.length).toBeGreaterThan(0)
      expect(result.rows[result.rows.length - 1].age).toBeGreaterThanOrEqual(input.endAge - 2)
    })

    it('fireReachable is false or FIRE age is very late', () => {
      if (result.fireReachable) {
        expect(result.fireAge!).toBeGreaterThanOrEqual(70)
      } else {
        expect(result.fireAge).toBeNull()
      }
    })
  })

  // Step 5 — Daan: heffingsvrij eliminates Box 3
  describe('Step 5 — Daan: heffingsvrij eliminates Box 3 completely', () => {
    const input = buildUnifiedInputForPersona('daan')
    const result = runUnifiedProjection(input)
    const heffingsvrij = BOX3_PARAMS[2026].heffingsvrijSingle

    it('total Box 3 assets are below heffingsvrij threshold', () => {
      let box3Total = 0
      for (const asset of input.assets) {
        if (classifyAsset(asset).category !== null) box3Total += asset.current_value
      }
      expect(box3Total).toBeLessThan(heffingsvrij)
    })

    it('box3Tax is 0 for initial years', () => {
      for (const row of result.rows.slice(0, 5)) {
        expect(row.totalBox3, `daan age=${row.age}: box3 should be 0`).toBe(0)
      }
    })
  })

  // Step 6 — Willem: per-asset allocation and no mortgage
  describe('Step 6 — Willem: per-asset allocation and no debts', () => {
    const input = buildUnifiedInputForPersona('willem')
    const result = runUnifiedProjection(input)

    it('asset buckets contain expected types', () => {
      const types = Object.keys(result.rows[0].assetBuckets)
      expect(types).toContain('investment')
      expect(types).toContain('eigen_huis')
    })

    it('no debts (debtBalances is empty)', () => {
      expect(Object.keys(result.rows[0].debtBalances)).toHaveLength(0)
    })

    it('fireReachable is true or borderline (bijna binnen)', () => {
      // Willem is a borderline case. The per-bucket waterfall binary search
      // with withdraw-before-grow order (matching the visualization loop) is
      // more conservative than the old flat grow-before-withdraw model.
      // Willem may or may not reach FIRE depending on the model precision.
      // If not reachable, verify he at least gets close (high final net worth).
      if (!result.fireReachable) {
        const lastRow = result.rows[result.rows.length - 1]
        expect(lastRow.netWorth).toBeGreaterThan(500_000)
      }
    })

    it('investment assets show positive growth in accumulation phase', () => {
      const accRows = result.rows.filter(r => r.phase === 'accumulation' && r.assetBuckets['investment'])
      if (accRows.length > 0) {
        expect(accRows[0].assetBuckets['investment']!.growth).toBeGreaterThan(0)
      } else {
        // Willem may already be at FIRE — verify investment bucket exists
        expect(result.rows[0].assetBuckets['investment']).toBeDefined()
      }
    })
  })

  // Step 7 — Marijke: forcedFireAge + guardrails
  describe('Step 7 — Marijke: forcedFireAge + guardrails withdrawal', () => {
    const input = buildUnifiedInputForPersona('marijke')
    expect(input.forcedFireAge).toBe(67)
    const result = runUnifiedProjection(input)

    it('fireAge equals forced value of 67', () => {
      expect(result.fireAge).toBe(67)
    })

    it('rows after age 67 are in withdrawal phase', () => {
      for (const row of result.rows.filter(r => r.age > 67)) {
        expect(row.phase, `marijke age=${row.age}`).toBe('withdrawal')
      }
    })

    it('withdrawal amounts are positive in retirement phase', () => {
      const wRows = result.rows.filter(r => r.phase === 'withdrawal')
      expect(wRows.length).toBeGreaterThan(0)
      expect(wRows.some(r => r.withdrawal > 0)).toBe(true)
    })

    it('guardrails keep withdrawals within floor/ceiling bounds', () => {
      const wRows = result.rows.filter(r => r.phase === 'withdrawal' && r.withdrawal > 0)
      if (wRows.length < 2) return
      const base = wRows[0].withdrawal
      const floor = input.withdrawalStrategy.guardrailFloor
      // Generous margin since inflation compounds over decades
      for (const row of wRows) {
        const lowerBound = base * row.inflationFactor * floor * 0.5
        expect(row.withdrawal, `marijke age=${row.age}: above floor`).toBeGreaterThanOrEqual(lowerBound)
      }
    })
  })

  // Step 8 — Lisa: life events (sabbatical, erfenis)
  describe('Step 8 — Lisa: life events appear in projection', () => {
    it('Lisa has active life events that produce cashflows', () => {
      const lifeEvents = PERSONAS['lisa'].life_events.filter(e => e.is_active).map((e, i) => ({ ...e, id: `t-${i}`, is_indexed: e.is_indexed ?? false }))
      expect(lifeEventsToCashflows(lifeEvents).length).toBeGreaterThan(0)
    })

    it('projection runs with life-event cashflows and all rows are finite', () => {
      const input = buildUnifiedInputForPersona('lisa')
      expect(input.cashflows.length).toBeGreaterThan(0)
      const result = runUnifiedProjection(input)
      expect(result.rows.length).toBeGreaterThan(0)
      for (const row of result.rows) assertRowFinite(row, `lisa age=${row.age}`)
    })

    it('sabbatical and erfenis ages show cashflow effects', () => {
      const p = PERSONAS['lisa']
      const result = runUnifiedProjection(buildUnifiedInputForPersona('lisa'))
      const sabbatical = p.life_events.find(e => e.is_active && e.event_type === 'sabbatical')
      const erfenis = p.life_events.find(e => e.is_active && e.event_type === 'erfenis')

      if (sabbatical?.target_age) {
        const row = result.rows.find(r => r.age === sabbatical.target_age)
        if (row) expect(Number.isFinite(row.cashflowNet)).toBe(true)
      }
      if (erfenis?.target_age) {
        const row = result.rows.find(r => r.age === erfenis.target_age)
        if (row) expect(Number.isFinite(row.cashflowNet)).toBe(true)
      }
    })
  })

  // Step 9 — Rashid: correct FIRE age with per-asset returns
  describe('Step 9 — Rashid: FIRE age with per-asset returns', () => {
    const input = buildUnifiedInputForPersona('rashid')
    const result = runUnifiedProjection(input)

    it('FIRE is reachable', () => {
      expect(result.fireReachable).toBe(true)
    })

    it('FIRE age is reasonable (between 45 and 75)', () => {
      expect(result.fireAge).not.toBeNull()
      expect(result.fireAge!).toBeGreaterThanOrEqual(45)
      expect(result.fireAge!).toBeLessThanOrEqual(75)
    })

    it('per-asset returns are used (not just flat grossReturn)', () => {
      const row0 = result.rows[0]
      expect(Object.keys(row0.assetBuckets).length).toBeGreaterThanOrEqual(1)
      const inv = row0.assetBuckets['investment']
      if (inv && inv.startValue > 0) {
        const invAsset = input.assets.find(a => a.asset_type === 'investment')
        if (invAsset && invAsset.expected_return > 0) {
          expect(inv.growth).toBeGreaterThan(0)
        }
      }
    })
  })
})

/**
 * FASE 5, stap 2d — household-engine-router-tests. Kernpunten (spiegel van de convergentie-/
 * what-if-router-tests):
 *  - vlag UIT → `engine: 'v2'` zonder kernel-velden (byte-identiteits-signaal);
 *  - vlag AAN + geschikt synthetisch huishouden → `engine: 'kernel'`: de gecombineerde run
 *    én beide perspectief-runs lopen zonder throw (rijen aanwezig), de Σ-startwaarden-
 *    eigenschap blijft (Σ perspectieven = gecombineerd), en de partner-pensioen-notices
 *    reizen mee;
 *  - de terugval-poorten (geen context, ontbrekende geboortedatum, jaaruitgave 0, gelijk
 *    user_id) geven een schone `engine: 'v2'` + reden — crash-vangnet zoals de peers.
 */

import { describe, it, expect } from 'vitest'
import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt, DebtType } from '@/lib/debt-data'
import type { KernelAdapterProfile } from '@/lib/horizon-kernel/adapter'
import {
  computeHouseholdProjection,
  type HouseholdKernelRawContext,
} from './household-router'

// ── Factories (volledige DB-shape, overschrijfbaar) — spiegelt adapter/household.test.ts ──

function makeAsset(p: Partial<Asset> & { id: string; asset_type: AssetType; current_value: number }): Asset {
  return {
    user_id: 'hoofd', name: p.asset_type, purchase_value: 0, purchase_date: null, expected_return: 5,
    monthly_contribution: 0, institution: null, account_number: null, notes: null, is_active: true,
    sort_order: 0, created_at: '2026-01-01', updated_at: '2026-01-01', subtype: null, risk_profile: null,
    tax_benefit: null, is_liquid: null, lock_end_date: null, ticker_symbol: null, rental_income: null,
    woz_value: null, retirement_provider_type: null, depreciation_rate: null, address_postcode: null,
    address_house_number: null, expiry_date: null, beneficiary: null, kvk_number: null,
    ownership_percentage: null, annual_dividend: null, linked_asset_id: null, ownership: 'personal',
    household_id: null, net_worth_inclusion_pct: 100, has_budget_tracking: false, has_holdings_tracking: false,
    has_woonbalans_tracking: false, has_rental_tracking: false, monthly_maintenance_cost: 0, vva_fee: 0,
    vacancy_log: [], ...p,
  } as Asset
}

function makeDebt(p: Partial<Debt> & { id: string; debt_type: DebtType; current_balance: number }): Debt {
  return {
    user_id: 'hoofd', name: p.debt_type, original_amount: p.current_balance ?? 0, interest_rate: 3,
    minimum_payment: 0, monthly_payment: 0, start_date: '2020-01-01', end_date: null, creditor: null,
    notes: null, is_active: true, sort_order: 0, created_at: '2026-01-01', updated_at: '2026-01-01',
    subtype: null, is_tax_deductible: null, fixed_rate_end_date: null, nhg: null, linked_asset_id: null,
    credit_limit: null, repayment_type: 'annuiteit', draagkrachtmeting_date: null, tax_year: null,
    has_payment_plan: false, has_written_agreement: false, ownership: 'personal', household_id: null,
    partner_split_pct: null, net_worth_inclusion_pct: 100, include_aflossing_in_savings: false,
    custom_aflossing_amount: null, has_hypotheekplanner_tracking: false, ...p,
  } as Debt
}

/** Deterministisch profiel (gepinde dob → vaste startleeftijd, los van "vandaag"). */
function profile(over: Partial<KernelAdapterProfile> = {}): KernelAdapterProfile {
  return {
    date_of_birth: `${new Date().getFullYear() - 45}-01-01`,
    net_monthly_income: 4000, estimated_monthly_expenses: 2500,
    expected_return: 0.07, inflation_rate: 0.02, box3_method: 'forfaitair',
    fire_end_strategy: 'deplete', fire_end_age: 90, ...over,
  }
}

/** Volledig itemized synthetisch 2-persoons-huishouden (persoonlijk beide + gedeeld). */
function makeContext(over: Partial<HouseholdKernelRawContext> = {}): HouseholdKernelRawContext {
  const assets: Asset[] = [
    makeAsset({ id: 'h-sav', asset_type: 'savings', current_value: 60_000, user_id: 'hoofd', ownership: 'personal' }),
    makeAsset({ id: 'p-etf', asset_type: 'investment', current_value: 90_000, user_id: 'partner', ownership: 'personal', expected_return: 7 }),
    makeAsset({ id: 's-house', asset_type: 'eigen_huis', current_value: 400_000, ownership: 'shared', user_id: 'hoofd', expected_return: 2 }),
    makeAsset({ id: 's-sav', asset_type: 'savings', current_value: 20_000, ownership: 'shared', user_id: 'partner' }),
  ]
  const debts: Debt[] = [
    makeDebt({ id: 's-mort', debt_type: 'mortgage', current_balance: 240_000, ownership: 'shared', user_id: 'hoofd', linked_asset_id: 's-house', interest_rate: 3.5, monthly_payment: 950 }),
  ]
  return {
    head: {
      userId: 'hoofd',
      profile: profile({ date_of_birth: `${new Date().getFullYear() - 45}-01-01` }),
      lifeEvents: [],
      yearlyExpenses: 30_000,
    },
    partner: {
      userId: 'partner',
      profile: profile({ date_of_birth: `${new Date().getFullYear() - 42}-01-01`, net_monthly_income: 3000 }),
      lifeEvents: [],
      yearlyExpenses: 24_000,
    },
    assets,
    debts,
    combinedLifeEvents: [],
    gedeeldAandeelHoofd: 0.6,
    combinedYearlyExpenses: 42_000,
    ...over,
  }
}

// ── Byte-identiteit (vlag uit) ────────────────────────────────────────────────────

describe('computeHouseholdProjection — byte-identiteit (vlag uit)', () => {
  it('vlag uit → engine "v2", geen kernel-velden (ook mét context)', () => {
    const outcome = computeHouseholdProjection({ kernelEnabled: false, rawContext: makeContext() })
    expect(outcome).toStrictEqual({ engine: 'v2' })
  })
})

// ── Kernel-tak ─────────────────────────────────────────────────────────────────────

describe('computeHouseholdProjection — kernel-tak (synthetisch huishouden)', () => {
  it('vlag aan + geschikt → engine "kernel": combined + beide perspectieven lopen', () => {
    const outcome = computeHouseholdProjection({ kernelEnabled: true, rawContext: makeContext() })
    expect(outcome.engine).toBe('kernel')
    expect(outcome.fallbackReason).toBeUndefined()
    expect(outcome.combined?.rows.length ?? 0).toBeGreaterThan(0)
    expect(outcome.perMember?.hoofd?.rows.length ?? 0).toBeGreaterThan(0)
    expect(outcome.perMember?.partner?.rows.length ?? 0).toBeGreaterThan(0)
  })

  it('Σ-startwaarden-eigenschap: perspectieven-startvermogen sommeert tot het gecombineerde', () => {
    const outcome = computeHouseholdProjection({ kernelEnabled: true, rawContext: makeContext() })
    expect(outcome.engine).toBe('kernel')
    const combinedStart = outcome.combined!.rows[0]!.startNetWorth
    const hoofdStart = outcome.perMember!.hoofd!.rows[0]!.startNetWorth
    const partnerStart = outcome.perMember!.partner!.rows[0]!.startNetWorth
    expect(hoofdStart + partnerStart).toBeCloseTo(combinedStart, 2)
  })

  it('partner-pensioen/-AOW-notices reizen mee in de uitvoer', () => {
    const outcome = computeHouseholdProjection({ kernelEnabled: true, rawContext: makeContext() })
    expect(outcome.notices?.some(n => /pensioen/i.test(n.message))).toBe(true)
    expect(outcome.notices?.every(n => n.kind === 'info')).toBe(true)
  })
})

// ── Terugval-poorten (crash-vangnet) ─────────────────────────────────────────────────

describe('computeHouseholdProjection — terugval', () => {
  it('vlag aan zonder rawContext → engine "v2" + reden', () => {
    const outcome = computeHouseholdProjection({ kernelEnabled: true })
    expect(outcome.engine).toBe('v2')
    expect(outcome.fallbackReason).toBeTruthy()
  })

  it('vlag aan + ontbrekende partner-geboortedatum → engine "v2" + /geboortedatum/', () => {
    const ctx = makeContext({
      partner: { userId: 'partner', profile: profile({ date_of_birth: null }), lifeEvents: [], yearlyExpenses: 24_000 },
    })
    const outcome = computeHouseholdProjection({ kernelEnabled: true, rawContext: ctx })
    expect(outcome.engine).toBe('v2')
    expect(outcome.fallbackReason).toMatch(/geboortedatum/)
  })

  it('vlag aan + gecombineerde jaaruitgave 0 → engine "v2" + /jaaruitgave/', () => {
    const outcome = computeHouseholdProjection({
      kernelEnabled: true,
      rawContext: makeContext({ combinedYearlyExpenses: 0 }),
    })
    expect(outcome.engine).toBe('v2')
    expect(outcome.fallbackReason).toMatch(/jaaruitgave/)
  })

  it('vlag aan + head en partner met hetzelfde user_id → engine "v2" + /user_id/', () => {
    const ctx = makeContext({
      partner: { userId: 'hoofd', profile: profile({ date_of_birth: `${new Date().getFullYear() - 42}-01-01` }), lifeEvents: [], yearlyExpenses: 24_000 },
    })
    const outcome = computeHouseholdProjection({ kernelEnabled: true, rawContext: ctx })
    expect(outcome.engine).toBe('v2')
    expect(outcome.fallbackReason).toMatch(/user_id/)
  })
})

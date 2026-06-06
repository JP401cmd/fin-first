/**
 * Model-validatie voor de WhatIf-beslishulp (B1).
 *
 * Bewijst dat de drie bestemmingen voor extra maandgeld zich gedragen zoals de
 * UI-kaarten beweren — nu met een EIGEN, rente-gedreven model voor Aflossen:
 *
 *   1. BELEGGEN  — extra_inleg-cashflow in de ECHTE motor → compoundt op het
 *                  VERWACHTE rendement → grootste FIRE-versnelling (delta < 0).
 *   2. AFLOSSEN  — €X/mnd compoundt op het GEGARANDEERDE saldo-gewogen
 *                  schuldrente-tarief (r_debt) bovenop het basispad
 *                  (`aflossenFireAgeAtRate`). Bij r_debt < verwacht rendement
 *                  ligt de versnelling TUSSEN beleggen en noodfonds in. Bij
 *                  r_debt ≥ verwacht rendement mag aflossen beleggen evenaren
 *                  of verslaan (een hoog gegarandeerd tarief verslaat de
 *                  onzekere markt).
 *   3. NOODFONDS — geen FIRE-versnelling → vrijheidsdatum gelijk aan baseline
 *                  (een ~0%-buffer koopt veiligheid, geen snelheid).
 *
 * De Beleggen-tak gebruikt exact wat `whatif-beslishulp.tsx` doet (extra_inleg-
 * event in de motor). De Aflossen-tak importeert dezelfde pure helper als de
 * component (`aflossenFireAgeAtRate`), zodat dit een echte rooktest van het
 * UI-model is — niet een parallelle herimplementatie.
 */

import { describe, it, expect } from 'vitest'
import {
  runUnifiedProjection,
  toSimResult,
  type UnifiedProjectionInput,
} from '@/lib/unified-projection'
import { lifeEventsToCashflows, type SimResult } from '@/lib/fire-simulation'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { WhatIfEvent } from '@/components/app/horizon/whatif-events'
import {
  weightedDebtRate,
  aflossenFireAgeAtRate,
} from '@/components/app/horizon/whatif-beslishulp.model'

function makeAsset(o: Partial<Asset> & { asset_type: string; current_value: number }): Asset {
  return {
    id: 'a-' + Math.random().toString(36).slice(2, 8),
    user_id: 'u',
    name: 'Asset',
    purchase_value: o.current_value,
    purchase_date: null,
    expected_return: o.expected_return ?? 7,
    monthly_contribution: o.monthly_contribution ?? 0,
    institution: null, account_number: null, notes: null,
    is_active: true, sort_order: 0,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    subtype: null, risk_profile: null, tax_benefit: o.tax_benefit ?? null,
    is_liquid: null, lock_end_date: null, ticker_symbol: null,
    rental_income: null, woz_value: null, retirement_provider_type: null,
    depreciation_rate: null, address_postcode: null, address_house_number: null,
    expiry_date: null, beneficiary: null, kvk_number: null,
    ownership_percentage: null, annual_dividend: null, linked_asset_id: null,
    ownership: 'personal', household_id: null, net_worth_inclusion_pct: 100,
    has_budget_tracking: false, has_holdings_tracking: false,
    ...o,
  } as Asset
}

function makeDebt(o: Partial<Debt> & { current_balance: number; interest_rate: number }): Debt {
  // NB: current_balance/interest_rate worden door de `...o`-spread geleverd
  // (ze staan in de param-type), dus ze NIET vóór de spread herhalen — anders
  // TS2783 "specified more than once". Afgeleide defaults baseren we op `o`.
  return {
    id: 'd-' + Math.random().toString(36).slice(2, 8),
    user_id: 'u',
    name: 'Schuld',
    debt_type: 'personal_loan',
    original_amount: o.current_balance,
    minimum_payment: o.monthly_payment ?? 200,
    monthly_payment: o.monthly_payment ?? 200,
    start_date: new Date().toISOString(),
    end_date: null,
    creditor: null, notes: null,
    is_active: true, sort_order: 0,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    subtype: null, is_tax_deductible: null, fixed_rate_end_date: null, nhg: null,
    linked_asset_id: null, credit_limit: null, repayment_type: 'annuiteit',
    draagkrachtmeting_date: null, tax_year: null, has_payment_plan: false,
    has_written_agreement: false, ownership: 'personal', household_id: null,
    partner_split_pct: null, net_worth_inclusion_pct: 100,
    include_aflossing_in_savings: false, custom_aflossing_amount: null,
    has_hypotheekplanner_tracking: false,
    ...o,
  } as Debt
}

function makeInput(overrides: Partial<UnifiedProjectionInput> = {}): UnifiedProjectionInput {
  return {
    assets: [makeAsset({ asset_type: 'investment', current_value: 170_000, expected_return: 7, monthly_contribution: 800 })],
    debts: [],
    currentAge: 42,
    endAge: 90,
    yearlyExpenses: 50_400,
    annualSavings: 15_600,
    monthlySurplus: 1300,
    monthlyIncome: 5500,
    incomeGrowthRate: 0.02,
    grossReturn: 0.07,
    inflationRate: 0.02,
    box3Method: 'forfaitair',
    cashflows: [],
    strategyConfig: { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    withdrawalStrategy: WITHDRAWAL_DEFAULTS,
    hasPartner: false,
    ...overrides,
  }
}

/** Spiegel van buildContributionEvent in de component (beleggen-tak). */
function contributionEvent(monthly: number, age: number): WhatIfEvent {
  return {
    id: 'whatif-beslishulp-test',
    name: 'Extra',
    event_type: 'extra_inleg',
    target_age: age,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: Math.round(monthly),
    duration_months: 0,
    icon: 'TrendingUp',
    is_active: true,
    sort_order: 999,
    is_indexed: true,
    metadata: {},
    is_scenario_only: true,
    scenario_origin: 'beslishulp:test',
  }
}

function simOf(input: UnifiedProjectionInput): SimResult {
  return toSimResult(runUnifiedProjection(input))
}
function fireAge(input: UnifiedProjectionInput): number | null {
  return simOf(input).fireAgeFractional
}

describe('WhatIf-beslishulp — rente-gedreven model', () => {
  // ── weightedDebtRate ──────────────────────────────────────────────────────
  describe('weightedDebtRate', () => {
    it('geeft null zonder actieve schuld (no-debt edge → kaart verborgen)', () => {
      expect(weightedDebtRate([])).toBeNull()
      expect(weightedDebtRate([makeDebt({ current_balance: 0, interest_rate: 5 })])).toBeNull()
      expect(weightedDebtRate([makeDebt({ current_balance: 10_000, interest_rate: 5, is_active: false })])).toBeNull()
    })

    it('saldo-weegt rentes en geeft een DECIMAAL terug (procent/100)', () => {
      // €30k @ 3% + €10k @ 9% ⇒ gewogen = (30·3 + 10·9)/40 = 4,5% ⇒ 0,045 decimaal.
      const r = weightedDebtRate([
        makeDebt({ current_balance: 30_000, interest_rate: 3 }),
        makeDebt({ current_balance: 10_000, interest_rate: 9 }),
      ])
      expect(r).not.toBeNull()
      expect(r!).toBeCloseTo(0.045, 6)
    })
  })

  // ── Ordering: r_debt duidelijk < verwacht rendement ───────────────────────
  describe('ordering bij r_debt duidelijk < verwacht rendement (1,5% schuld vs 7% markt)', () => {
    // Eén lage-rente schuld @ 1,5%. De schuld zit óók in de input zodat het
    // basispad de aflossing/rente al meeneemt.
    //
    // ⚠️ Waarom géén 4%-schuld hier: beleggen wordt in de motor BELAST via Box 3
    // (forfaitair ~6% × 36% ≈ 2,2% drag), terwijl aflossen Box-3-VRIJ is
    // (schuld terugbetalen wordt niet belast). Het effectieve marginale
    // beleggen-rendement is dus ~7% − 2,2% ≈ 4,8% — bij een 4%-schuld vallen
    // beleggen en aflossen daardoor vrijwel samen (correct, maar broos voor een
    // strikte ordening). Met 1,5% is de marge ondubbelzinnig: beleggen wint.
    const debt = makeDebt({ current_balance: 25_000, interest_rate: 1.5, monthly_payment: 250 })
    const input = makeInput({ debts: [debt] })
    const base = simOf(input)
    const baseAge = base.fireAgeFractional
    const rDebt = weightedDebtRate([debt])! // 0.015
    const AMOUNT = 300

    it('baseline FIRE-leeftijd is bereikbaar (fixture sanity)', () => {
      expect(baseAge).not.toBeNull()
      expect(baseAge!).toBeGreaterThan(42)
      expect(baseAge!).toBeLessThan(90)
      expect(rDebt).toBeCloseTo(0.015, 6)
    })

    it('BELEGGEN — extra inleg vervroegt de vrijheidsdatum (delta < 0)', () => {
      const beleggen = fireAge({ ...input, cashflows: lifeEventsToCashflows([contributionEvent(AMOUNT, input.currentAge)]) })
      expect(beleggen).not.toBeNull()
      expect(beleggen!).toBeLessThan(baseAge!)
    })

    it('AFLOSSEN — vervroegt de vrijheidsdatum, maar minder dan beleggen', () => {
      const aflossen = aflossenFireAgeAtRate(base, input.currentAge, AMOUNT, rDebt)
      expect(aflossen).not.toBeNull()
      // Sneller dan baseline (noodfonds): het pot-geld zet wél aan het werk.
      expect(aflossen!).toBeLessThan(baseAge!)
    })

    it('NOODFONDS — geen versnelling ⇒ vrijheidsdatum gelijk aan baseline', () => {
      const noodfonds = fireAge({ ...input, cashflows: [] })
      expect(noodfonds).toEqual(baseAge)
    })

    it('ORDENING — beleggen ≤ aflossen < noodfonds (=baseline)', () => {
      const beleggen = fireAge({ ...input, cashflows: lifeEventsToCashflows([contributionEvent(AMOUNT, input.currentAge)]) })!
      const aflossen = aflossenFireAgeAtRate(base, input.currentAge, AMOUNT, rDebt)!
      const noodfonds = baseAge! // geen cashflow

      // Beleggen is het snelst (laagste FIRE-leeftijd), aflossen ertussen,
      // noodfonds vlak. Gebruik ≤ tussen beleggen en aflossen (niet-broos:
      // bij kleine bedragen kunnen ze elkaar fractioneel raken).
      expect(beleggen).toBeLessThanOrEqual(aflossen + 1e-6)
      expect(aflossen).toBeLessThan(noodfonds)
    })

    it('AFLOSSEN — meer inleg = niet later vrij (monotoon, niet-broos)', () => {
      const small = aflossenFireAgeAtRate(base, input.currentAge, 100, rDebt)!
      const big = aflossenFireAgeAtRate(base, input.currentAge, 600, rDebt)!
      expect(big).toBeLessThanOrEqual(small + 1e-6)
    })
  })

  // ── Edge: r_debt ≥ verwacht rendement ─────────────────────────────────────
  describe('edge bij r_debt ≥ verwacht rendement (12% schuld vs 7% markt)', () => {
    // Een dure schuld (12%). Aflossen op 12% gegarandeerd verslaat — of evenaart
    // minstens — beleggen op 7% onzeker. We forceren GEEN strikte ongelijkheid
    // de verkeerde kant op; we laten de wiskunde spreken.
    const debt = makeDebt({ current_balance: 18_000, interest_rate: 12, monthly_payment: 300 })
    const input = makeInput({ debts: [debt] })
    const base = simOf(input)
    const baseAge = base.fireAgeFractional!
    const rDebt = weightedDebtRate([debt])! // 0.12
    const AMOUNT = 400

    it('aflossen verslaat of evenaart beleggen (hoog gegarandeerd > onzeker)', () => {
      const beleggen = fireAge({ ...input, cashflows: lifeEventsToCashflows([contributionEvent(AMOUNT, input.currentAge)]) })!
      const aflossen = aflossenFireAgeAtRate(base, input.currentAge, AMOUNT, rDebt)!
      // Aflossen niet later vrij dan beleggen (≤). Geen harde strikte assertie
      // die zou breken als ze fractioneel gelijk uitkomen.
      expect(aflossen).toBeLessThanOrEqual(beleggen + 1e-6)
      // En beide brengen vrijheid dichterbij dan niets doen.
      expect(aflossen).toBeLessThan(baseAge)
    })
  })
})

/**
 * Model-validatie voor de WhatIf-beslishulp (B1).
 *
 * Bewijst dat de drie bestemmingen voor extra maandgeld zich gedragen zoals de
 * UI-kaarten beweren — met EÉN motor voor zowel Beleggen als Aflossen:
 *
 *   1. BELEGGEN  — extra_inleg-cashflow in de ECHTE motor → compoundt op het
 *                  VERWACHTE rendement (mét Box 3-drag). FIRE via `fireAgeFromSim`
 *                  op die motor-run.
 *   2. AFLOSSEN  — €X/mnd compoundt op het GEGARANDEERDE saldo-gewogen
 *                  schuldrente-tarief (r_debt), BOX-3-VRIJ, bovenop het motor-
 *                  basispad (`aflossenFireAge`). Bij €0 extra identiek aan
 *                  `fireAgeFromSim(base)` → zelfde grondslag als beleggen.
 *   3. NOODFONDS — geen FIRE-versnelling → vrijheidsdatum gelijk aan baseline.
 *
 * ── Wat de vorige opzet maskeerde (de bug) ──────────────────────────────────
 * De oude `aflossenFireAgeAtRate` liep NIET door de motor: een zijpot op de rauwe
 * schuldrente, vergeleken tegen een FIRE-jaar-geïnflateerd doel terwijl het pad
 * per-jaar-geïnflateerd was (gemengde inflatie-epoches). Hij kon het motor-
 * basispad niet eens reproduceren (65,7 vs motor 68 bij €0 extra) en liet aflossen
 * op ÉLK rentetarief "winnen" (zelfs 1,5% vs 7% markt) — actief verkeerd advies.
 * De test was daarop versoepeld tot "beide verslaan baseline". Nu meten beide
 * opties via dezelfde motor en geldt de juiste ordening: bij een lage schuldrente
 * wint beleggen; aflossen wint pas wanneer de gegarandeerde rente hoog genoeg is.
 *
 * Beide takken importeren de pure helpers die de component óók gebruikt
 * (`fireAgeFromSim`, `aflossenFireAge`), zodat dit een echte rooktest van het
 * UI-model is — geen parallelle herimplementatie.
 */

import { describe, it, expect } from 'vitest'
import {
  toSimResult,
  type UnifiedProjectionInput,
} from '@/lib/unified-projection'
import { type SimResult } from '@/lib/fire-simulation'
import { buildKernelInputFromApp, deriveEigenHuisIds, type KernelAdapterInput } from '@/lib/horizon-kernel/adapter'
import { solveFire } from '@/lib/horizon-kernel/solver'
import { kernelToUnifiedResult, buildKernelSlotMeta } from '@/lib/horizon-kernel/bridge'
import type { LifeEvent } from '@/lib/horizon-data'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { WhatIfEvent } from '@/components/app/horizon/whatif-events'
import {
  weightedDebtRate,
  fireAgeFromSim,
  aflossenFireAge,
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
    // 'perpetual' (kapitaalinstandhouding) geeft een POSITIEF FIRE-doel
    // (`requiredFirePortfolio` = uitgaven/SWR), wat het aflossen-pot-model nodig heeft.
    // De kernel geeft 'deplete' bewust doel = 0 (B93-quirk) → aflossenFireAge zou dan
    // null geven; de beleggen/aflossen-crossover die deze suite toetst is strategie-
    // onafhankelijk, dus perpetual is de juiste, goed-gedefinieerde grondslag.
    strategyConfig: { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
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

/**
 * Bouw een SimResult uit een test-UnifiedProjectionInput via de horizon-kernel (de
 * enige motor): synthetische adapter-invoer → solveFire → bridge. De extra inleg
 * reist als life-event mee; de kernel-adapter routeert 'm als Geb-post.
 */
function simOf(input: UnifiedProjectionInput, events: LifeEvent[] = []): SimResult {
  const dob = `${new Date().getFullYear() - input.currentAge}-01-01`
  const adapterInput: KernelAdapterInput = {
    profile: {
      date_of_birth: dob,
      net_monthly_income: input.monthlyIncome,
      estimated_monthly_expenses: input.yearlyExpenses / 12,
      yearly_essential_expenses: input.yearlyExpenses,
      retirement_expense_method: 'essential_budgets',
      expected_return: input.grossReturn,
      inflation_rate: input.inflationRate,
      box3_method: input.box3Method,
      fire_end_strategy: input.strategyConfig.strategy,
      fire_end_age: input.strategyConfig.endAge,
      fire_legacy_amount: input.strategyConfig.legacyAmount ?? 0,
      withdrawal_strategy: input.withdrawalStrategy.strategy,
      feature_preferences: null,
    },
    assets: input.assets,
    debts: input.debts,
    lifeEvents: events,
    aowRows: [],
  }
  const kernelInput = buildKernelInputFromApp(adapterInput)
  const solve = solveFire(kernelInput)
  const { assetSlotMeta, debtSlotMeta } = buildKernelSlotMeta(
    input.assets,
    input.debts,
    deriveEigenHuisIds(input.assets),
  )
  return toSimResult(
    kernelToUnifiedResult(solve, {
      input: kernelInput,
      yearlyExpenses: input.yearlyExpenses,
      assetSlotMeta,
      debtSlotMeta,
    }),
  )
}
/** Beleggen-FIRE: motor-run (basis + extra inleg) → fractioneel kruispunt. */
function beleggenAge(input: UnifiedProjectionInput, amount: number): number | null {
  return fireAgeFromSim(simOf(input, [contributionEvent(amount, input.currentAge)]))
}

describe('WhatIf-beslishulp — één-motor-model', () => {
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

  // ── Beide opties reproduceren de motor-baseline bij €0 extra ───────────────
  describe('baseline-reproductie (€0 extra)', () => {
    const debt = makeDebt({ current_balance: 25_000, interest_rate: 1.5, monthly_payment: 250 })
    const input = makeInput({ debts: [debt] })
    const base = simOf(input)
    const baseFrac = fireAgeFromSim(base)
    const rDebt = weightedDebtRate([debt])! // 0.015

    it('fireAgeFromSim levert een bereikbare fractionele leeftijd (fixture sanity)', () => {
      expect(baseFrac).not.toBeNull()
      expect(baseFrac!).toBeGreaterThan(42)
      expect(baseFrac!).toBeLessThan(90)
      expect(rDebt).toBeCloseTo(0.015, 6)
    })

    it('aflossen bij €0 extra == de motor-baseline (geen drift)', () => {
      const afl0 = aflossenFireAge(base, input.currentAge, 0, rDebt)
      expect(afl0).not.toBeNull()
      expect(afl0!).toBeCloseTo(baseFrac!, 6)
    })

    it('beleggen bij €0 extra == de motor-baseline (geen drift)', () => {
      const bel0 = beleggenAge(input, 0)
      expect(bel0).not.toBeNull()
      expect(bel0!).toBeCloseTo(baseFrac!, 6)
    })
  })

  // ── Lage schuldrente (1,5%) → BELEGGEN wint ───────────────────────────────
  describe('lage schuldrente (1,5% schuld vs 7% markt) → beleggen ≤ aflossen', () => {
    const debt = makeDebt({ current_balance: 25_000, interest_rate: 1.5, monthly_payment: 250 })
    const input = makeInput({ debts: [debt] })
    const base = simOf(input)
    const baseFrac = fireAgeFromSim(base)!
    const rDebt = weightedDebtRate([debt])! // 0.015
    const AMOUNT = 300

    it('BELEGGEN vervroegt de vrijheidsdatum (delta < 0)', () => {
      expect(beleggenAge(input, AMOUNT)!).toBeLessThan(baseFrac)
    })

    it('AFLOSSEN vervroegt de vrijheidsdatum, maar minder dan beleggen', () => {
      const aflossen = aflossenFireAge(base, input.currentAge, AMOUNT, rDebt)!
      const beleggen = beleggenAge(input, AMOUNT)!
      expect(aflossen).toBeLessThan(baseFrac)
      // De kern van de fix: bij een lage gegarandeerde rente verslaat de
      // (Box-3-belaste) markt het aflossen. Beleggen wint (≤ aflossen).
      expect(beleggen).toBeLessThanOrEqual(aflossen + 1e-9)
      // En strikt: niet langer "aflossen wint" zoals de bug deed.
      expect(aflossen).toBeGreaterThan(beleggen - 1e-9)
    })

    it('AFLOSSEN — meer inleg = niet later vrij (monotoon)', () => {
      const small = aflossenFireAge(base, input.currentAge, 100, rDebt)!
      const big = aflossenFireAge(base, input.currentAge, 600, rDebt)!
      expect(big).toBeLessThanOrEqual(small + 1e-6)
    })

    it('NOODFONDS — geen versnelling ⇒ vrijheidsdatum gelijk aan baseline', () => {
      // De component voedt noodfonds NIET als cashflow → identiek aan baseline.
      const noodfonds = fireAgeFromSim(simOf(input))!
      expect(noodfonds).toBeCloseTo(baseFrac, 9)
    })
  })

  // ── Hoge schuldrente → AFLOSSEN wint ──────────────────────────────────────
  describe('hoge schuldrente (12% schuld) → aflossen wint', () => {
    // Een dure schuld (12%): aflossen levert 12% gegarandeerd-en-onbelast, wat het
    // (Box-3-belaste) ~7%-beleggingspad verslaat. Aflossen vervroegt FIRE meer.
    const debt = makeDebt({ current_balance: 25_000, interest_rate: 12, monthly_payment: 250 })
    const input = makeInput({ debts: [debt] })
    const base = simOf(input)
    const baseFrac = fireAgeFromSim(base)!
    const rDebt = weightedDebtRate([debt])! // 0.12
    const AMOUNT = 300

    it('aflossen verslaat beleggen (hoog gegarandeerd-en-onbelast > onzeker-belast)', () => {
      const beleggen = beleggenAge(input, AMOUNT)!
      const aflossen = aflossenFireAge(base, input.currentAge, AMOUNT, rDebt)!
      expect(aflossen).toBeLessThan(beleggen - 1e-9)
      // Beide brengen vrijheid dichterbij dan niets doen.
      expect(aflossen).toBeLessThan(baseFrac)
      expect(beleggen).toBeLessThan(baseFrac)
    })
  })

  // ── De crossover ligt tussen laag en hoog (sanity op de richting) ──────────
  describe('crossover: aflossen wint pas boven een drempel-rente', () => {
    const AMOUNT = 300
    const mk = (ratePct: number) => {
      const debt = makeDebt({ current_balance: 25_000, interest_rate: ratePct, monthly_payment: 250 })
      const input = makeInput({ debts: [debt] })
      const base = simOf(input)
      const beleggen = beleggenAge(input, AMOUNT)!
      const aflossen = aflossenFireAge(base, input.currentAge, AMOUNT, ratePct / 100)!
      return { beleggen, aflossen, aflossenWint: aflossen < beleggen - 1e-9 }
    }

    it('1,5% → beleggen wint; 12% → aflossen wint (monotone richting)', () => {
      expect(mk(1.5).aflossenWint).toBe(false)
      expect(mk(12).aflossenWint).toBe(true)
    })
  })
})

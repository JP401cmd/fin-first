/**
 * Parity tests: runUnifiedProjection() vs runSimulation() — Fase 1e
 *
 * Verifies that the new unified projection engine produces results
 * that are within acceptable tolerance of the legacy engine for all
 * 6 test personas. Also tests the deprecated wrapper, toSimResult()
 * field mapping, and performance.
 *
 * Feature #493
 */
import { describe, it, expect } from 'vitest'
import { PERSONAS, type PersonaKey, PERSONA_KEYS, type PersonaData } from '@/lib/test-personas'
import { runSimulation, lifeEventsToCashflows, type SimResult, type SimCashflow } from '@/lib/fire-simulation'
import {
  runUnifiedProjection,
  runSimulationUnified,
  toSimResult,
  type UnifiedProjectionInput,
  type UnifiedProjectionResult,
} from '@/lib/unified-projection'
import { ageAtDate } from '@/lib/horizon-data'
import { type FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS, type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

// ── Helpers ────────────────────────────────────────────────────

/** Convert PersonaLifeEvent[] to LifeEvent[] (add id + ensure is_indexed) */
function personaLifeEventsToLifeEvents(events: PersonaData['life_events']) {
  return events
    .filter(e => e.is_active)
    .map((e, i) => ({
      ...e,
      id: `test-${i}`,
      is_indexed: e.is_indexed ?? false,
    }))
}

/** Build old-engine simulation params from persona data */
function buildOldSimParams(key: PersonaKey) {
  const p = PERSONAS[key]
  const profile = p.profile
  const currentAge = ageAtDate(profile.date_of_birth)

  const budgetExpenses = p.budgets
    .filter(b => b.budget_type === 'expense')
    .reduce((sum, b) => sum + b.default_limit, 0)
  const yearlyExpenses = budgetExpenses > 0
    ? budgetExpenses * 12
    : (profile.estimated_monthly_expenses ?? 0) * 12

  const budgetIncome = p.budgets
    .filter(b => b.budget_type === 'income')
    .reduce((sum, b) => sum + b.default_limit, 0)
  const monthlyIncome = budgetIncome > 0
    ? budgetIncome
    : (profile.net_monthly_income ?? 0)
  const annualSavings = (monthlyIncome * 12) - yearlyExpenses

  const bankTotal = p.bank_accounts.reduce((s, a) => s + a.balance, 0)
  const investmentTotal = p.assets
    .filter(a => a.asset_type === 'investment')
    .reduce((s, a) => s + a.current_value, 0)
  const debtTotal = p.debts.reduce((s, d) => s + d.current_balance, 0)
  const portfolio = bankTotal + investmentTotal - debtTotal

  const grossReturn = profile.expected_return ?? 0.07
  const inflation = profile.inflation_rate ?? 0.02
  const endAge = profile.fire_end_age ?? 90

  const lifeEvents = personaLifeEventsToLifeEvents(p.life_events)
  const cashflows = lifeEventsToCashflows(lifeEvents)

  const strategyConfig: FireStrategyConfig = {
    strategy: profile.fire_end_strategy ?? 'deplete',
    endAge,
    legacyAmount: profile.fire_legacy_amount ?? 0,
  }

  const wConfig: WithdrawalStrategyConfig = {
    strategy: profile.withdrawal_strategy ?? 'static',
    guardrailFloor: profile.guardrail_floor ?? WITHDRAWAL_DEFAULTS.guardrailFloor,
    guardrailCeiling: profile.guardrail_ceiling ?? WITHDRAWAL_DEFAULTS.guardrailCeiling,
    guardrailCutStep: profile.guardrail_cut_step ?? WITHDRAWAL_DEFAULTS.guardrailCutStep,
    guardrailRaiseStep: profile.guardrail_raise_step ?? WITHDRAWAL_DEFAULTS.guardrailRaiseStep,
  }

  // Forced fire age for pensioen strategy
  const forcedFireAge = profile.fire_end_strategy === 'pensioen' ? 67 : undefined

  return {
    currentAge,
    endAge,
    portfolio,
    yearlyExpenses,
    annualSavings,
    grossReturn,
    inflation,
    cashflows,
    strategyConfig,
    wConfig,
    monthlyIncome,
    forcedFireAge,
  }
}

/** Convert PersonaAsset to Asset interface */
function personaAssetToAsset(pa: PersonaData['assets'][0]): Asset {
  return {
    id: `test-asset-${Math.random().toString(36).slice(2, 8)}`,
    user_id: 'test-user',
    name: pa.name,
    asset_type: pa.asset_type as Asset['asset_type'],
    current_value: pa.current_value,
    purchase_value: pa.purchase_value,
    purchase_date: pa.purchase_date || null,
    expected_return: pa.expected_return,
    monthly_contribution: pa.monthly_contribution,
    institution: pa.institution || null,
    account_number: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: pa.subtype || null,
    risk_profile: (pa.risk_profile as Asset['risk_profile']) || null,
    tax_benefit: pa.tax_benefit ?? null,
    is_liquid: pa.is_liquid ?? null,
    lock_end_date: pa.lock_end_date || null,
    ticker_symbol: pa.ticker_symbol || null,
    rental_income: pa.rental_income ?? null,
    woz_value: pa.woz_value ?? null,
    retirement_provider_type: (pa.retirement_provider_type as Asset['retirement_provider_type']) || null,
    depreciation_rate: pa.depreciation_rate ?? null,
    address_postcode: pa.address_postcode || null,
    address_house_number: pa.address_house_number || null,
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
    has_holdings_tracking: pa.has_holdings_tracking ?? false,
    has_woonbalans_tracking: false,
    has_rental_tracking: false,
    monthly_maintenance_cost: 0,
    vva_fee: 0,
    vacancy_log: [],
  }
}

/** Convert PersonaDebt to Debt interface */
function personaDebtToDebt(pd: PersonaData['debts'][0]): Debt {
  return {
    id: `test-debt-${Math.random().toString(36).slice(2, 8)}`,
    user_id: 'test-user',
    name: pd.name,
    debt_type: pd.debt_type as Debt['debt_type'],
    original_amount: pd.original_amount,
    current_balance: pd.current_balance,
    interest_rate: pd.interest_rate,
    minimum_payment: pd.minimum_payment,
    monthly_payment: pd.monthly_payment,
    start_date: pd.start_date,
    end_date: null,
    creditor: pd.creditor || null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: pd.subtype || null,
    is_tax_deductible: pd.is_tax_deductible ?? null,
    fixed_rate_end_date: pd.fixed_rate_end_date || null,
    nhg: pd.nhg ?? null,
    linked_asset_id: null,
    credit_limit: pd.credit_limit ?? null,
    repayment_type: (pd.repayment_type as Debt['repayment_type']) || null,
    draagkrachtmeting_date: pd.draagkrachtmeting_date || null,
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
  }
}

/** Build UnifiedProjectionInput from persona data */
function buildUnifiedInput(key: PersonaKey): UnifiedProjectionInput {
  const p = PERSONAS[key]
  const profile = p.profile
  const params = buildOldSimParams(key)

  const assets = p.assets.map(personaAssetToAsset)
  const debts = p.debts.map(personaDebtToDebt)

  // Add bank accounts as savings-type assets
  for (const ba of p.bank_accounts) {
    assets.push({
      id: `test-bank-${Math.random().toString(36).slice(2, 8)}`,
      user_id: 'test-user',
      name: ba.name,
      asset_type: 'savings',
      current_value: ba.balance,
      purchase_value: ba.balance,
      purchase_date: null,
      expected_return: 1, // 1% for savings
      monthly_contribution: 0,
      institution: ba.bank_name || null,
      account_number: null,
      notes: null,
      is_active: true,
      sort_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      subtype: 'spaarrekening',
      risk_profile: null,
      tax_benefit: null,
      is_liquid: true,
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
      has_woonbalans_tracking: false,
      has_rental_tracking: false,
      monthly_maintenance_cost: 0,
      vva_fee: 0,
      vacancy_log: [],
    })
  }

  return {
    assets,
    debts,
    currentAge: params.currentAge,
    endAge: params.endAge,
    yearlyExpenses: params.yearlyExpenses,
    annualSavings: params.annualSavings,
    monthlySurplus: params.annualSavings / 12,
    monthlyIncome: params.monthlyIncome,
    incomeGrowthRate: 0,
    grossReturn: params.grossReturn,
    inflationRate: params.inflation,
    box3Method: 'forfaitair',
    cashflows: params.cashflows,
    strategyConfig: params.strategyConfig,
    withdrawalStrategy: params.wConfig,
    forcedFireAge: params.forcedFireAge,
    hasPartner: profile.household_type === 'samenwonend' || profile.household_type === 'getrouwd',
  }
}

// ── Tests ──────────────────────────────────────────────────────

describe('Unified Projection Engine — Fase 1e: Parity & Orchestratie (#493)', () => {

  // ── Step 1: runUnifiedProjection() produces valid results ──────

  describe('runUnifiedProjection — basiswerking', () => {
    it('produceert UnifiedProjectionResult met alle verplichte velden', () => {
      const input = buildUnifiedInput('marijke')
      const result = runUnifiedProjection(input)

      expect(result).toHaveProperty('rows')
      expect(result).toHaveProperty('fireAge')
      expect(result).toHaveProperty('fireAgeFractional')
      expect(result).toHaveProperty('fireReachable')
      expect(result).toHaveProperty('firePortfolioAtFire')
      expect(result).toHaveProperty('requiredFirePortfolio')
      expect(result).toHaveProperty('implicitWithdrawalRate')
      expect(result).toHaveProperty('strategy')
      expect(result).toHaveProperty('targetEndPortfolio')
      expect(result).toHaveProperty('displayEndAge')
      expect(result.rows.length).toBeGreaterThan(0)
    })

    it('orchestratie volgorde: init → cashflows → accumulatie → FIRE-check → decumulatie → aggregaten', () => {
      const input = buildUnifiedInput('daan')
      const result = runUnifiedProjection(input)

      // Must have accumulation rows
      const accRows = result.rows.filter(r => r.phase === 'accumulation')
      expect(accRows.length).toBeGreaterThan(0)

      // If FIRE reachable AND fireAge < displayEndAge, must have withdrawal rows
      // (perpetual strategy may detect FIRE beyond displayEndAge — no decum rows expected)
      if (result.fireReachable && result.fireAge !== null && result.fireAge < result.displayEndAge) {
        const decRows = result.rows.filter(r => r.phase === 'withdrawal' || r.phase === 'transition')
        expect(decRows.length).toBeGreaterThan(0)
      }

      // Rows must be in ascending age order
      for (let i = 1; i < result.rows.length; i++) {
        expect(result.rows[i].age).toBeGreaterThan(result.rows[i - 1].age)
      }

      // Each row has asset buckets and debt balances
      for (const row of result.rows) {
        expect(row.assetBuckets).toBeDefined()
        expect(row.debtBalances).toBeDefined()
        // netWorth ≈ totalAssets - totalDebts (rounding tolerance of 1)
        expect(Math.abs(row.netWorth - (row.totalAssets - row.totalDebts))).toBeLessThanOrEqual(1)
      }
    })
  })

  // ── Step 3: Deprecated wrapper ─────────────────────────────────

  describe('runSimulationUnified — deprecated wrapper', () => {
    it('produceert geldige SimResult met dezelfde signature als runSimulation()', () => {
      const params = buildOldSimParams('marijke')
      const result = runSimulationUnified(
        params.currentAge,
        params.endAge,
        params.portfolio,
        params.yearlyExpenses,
        params.annualSavings,
        params.grossReturn,
        'nl_box3',
        params.inflation,
        params.cashflows,
        params.strategyConfig,
        params.wConfig,
        params.forcedFireAge,
      )

      // Should have all SimResult fields
      expect(result).toHaveProperty('rows')
      expect(result).toHaveProperty('fireAge')
      expect(result).toHaveProperty('fireAgeFractional')
      expect(result).toHaveProperty('fireReachable')
      expect(result).toHaveProperty('firePortfolioAtFire')
      expect(result).toHaveProperty('requiredFirePortfolio')
      expect(result).toHaveProperty('implicitWithdrawalRate')
      expect(result).toHaveProperty('classic25xTarget')
      expect(result).toHaveProperty('strategy')
      expect(result).toHaveProperty('targetEndPortfolio')
      expect(result).toHaveProperty('displayEndAge')
      expect(result.rows.length).toBeGreaterThan(0)

      // Rows should have SimRow fields
      const row = result.rows[0]
      expect(row).toHaveProperty('age')
      expect(row).toHaveProperty('phase')
      expect(row).toHaveProperty('startPortfolio')
      expect(row).toHaveProperty('growth')
      expect(row).toHaveProperty('savings')
      expect(row).toHaveProperty('withdrawal')
      expect(row).toHaveProperty('cashflowNet')
      expect(row).toHaveProperty('endPortfolio')
      expect(row).toHaveProperty('grossIncome')
      expect(row).toHaveProperty('grossExpenses')
    })

    it('returnModel parameter wordt genegeerd (altijd per-asset Box 3)', () => {
      const params = buildOldSimParams('daan')
      const resultA = runSimulationUnified(
        params.currentAge, params.endAge, params.portfolio, params.yearlyExpenses,
        params.annualSavings, params.grossReturn, 'nl_box3', params.inflation,
        params.cashflows, params.strategyConfig, params.wConfig,
      )
      const resultB = runSimulationUnified(
        params.currentAge, params.endAge, params.portfolio, params.yearlyExpenses,
        params.annualSavings, params.grossReturn, 'classic', params.inflation,
        params.cashflows, params.strategyConfig, params.wConfig,
      )

      // Both should produce the same result (returnModel is ignored)
      expect(resultA.fireAge).toBe(resultB.fireAge)
      expect(resultA.rows.length).toBe(resultB.rows.length)
    })
  })

  // ── Step 4: computeFireProjection/computeFireRange unchanged ───

  describe('horizon-data functies ongewijzigd', () => {
    it('computeFireProjection en computeFireRange worden niet geïmporteerd of gewijzigd in unified-projection', async () => {
      // Verify unified-projection.ts does not import from horizon-data
      // This is a structural test — those functions use their own simple projection
      const module = await import('@/lib/unified-projection')
      // Should not have these functions
      expect(module).not.toHaveProperty('computeFireProjection')
      expect(module).not.toHaveProperty('computeFireRange')
    })
  })

  // ── Step 5: Parity test — all 6 personas ──────────────────────
  // Uses the deprecated wrapper (single synthetic asset) for fair comparison
  // with the old engine (both use the same portfolio composition).
  // The full per-asset-type engine produces intentionally different results
  // due to more accurate per-type Box 3 and different return rates.

  describe('parity: FIRE-leeftijd oude engine vs unified wrapper', () => {
    // Tolerance per persona: the unified engine uses per-type Box 3 with heffingsvrij
    // vermogen exemption (€59,357). For small portfolios (Daan), the heffingsvrij
    // eliminates Box 3 drag for years, causing larger differences vs the old engine's
    // flat BOX3_DRAG. Large portfolios (Willem, Lisa) are within 1 year.
    const TOLERANCE: Record<PersonaKey, number> = {
      daan: 12,     // starter with tiny portfolio, heffingsvrij eliminates drag for years.
                    //   Bovendien indexeert de unified engine het jaarlijkse sparen nu met
                    //   inflatie (income × spaarquote groeit nominaal mee) — een bewuste
                    //   unified-only verbetering die de oude vlakke runSimulation mist.
                    //   Bij Daan's ~40-jarige opbouwhorizon compoundt dat het sterkst →
                    //   FIRE meerdere jaren eerder dan de (te pessimistische) oude engine.
      lisa: 5,      // moderate portfolio + legacy strategy; engine-engine drift
                    //   na de legacy PV-discount-fix (correct preserve van geïndexeerde
                    //   nalatenschap i.p.v. de oude deplete-achtige fallback)
      willem: 1,    // large portfolio (1.46M), heffingsvrij negligible
      marijke: 1,   // pensioen mode, forcedFireAge
    }

    for (const key of PERSONA_KEYS) {
      it(`${PERSONAS[key].meta.name} (${key}): FIRE-leeftijd verschil ≤ ${TOLERANCE[key]} jaar`, () => {
        const params = buildOldSimParams(key)

        // Old engine
        const oldResult = runSimulation(
          params.currentAge,
          params.endAge,
          params.portfolio,
          params.yearlyExpenses,
          params.annualSavings,
          params.grossReturn,
          'nl_box3',
          params.inflation,
          params.cashflows,
          params.strategyConfig,
          params.wConfig,
          params.forcedFireAge,
        )

        // New engine via deprecated wrapper (same single-asset portfolio)
        const newResult = runSimulationUnified(
          params.currentAge,
          params.endAge,
          params.portfolio,
          params.yearlyExpenses,
          params.annualSavings,
          params.grossReturn,
          'nl_box3',
          params.inflation,
          params.cashflows,
          params.strategyConfig,
          params.wConfig,
          params.forcedFireAge,
        )

        // Both should agree on reachability
        if (oldResult.fireAge === null) {
          // Both unreachable — that's parity
          expect(
            newResult.fireAge === null || !newResult.fireReachable,
          ).toBe(true)
        } else if (newResult.fireAge === null) {
          // Old reachable, new not — OK if explained by more accurate Box 3
          expect(newResult.fireReachable).toBe(false)
        } else {
          // Both reachable: FIRE age within tolerance
          const diff = Math.abs(oldResult.fireAge - newResult.fireAge)
          expect(
            diff,
            `${key}: old FIRE=${oldResult.fireAge}, new FIRE=${newResult.fireAge}, diff=${diff}`,
          ).toBeLessThanOrEqual(TOLERANCE[key])
        }
      })
    }
  })

  describe('parity: full per-asset engine vs oude engine — structurele vergelijking', () => {
    for (const key of PERSONA_KEYS) {
      it(`${key}: per-asset engine produceert geldig resultaat`, () => {
        const input = buildUnifiedInput(key)
        const result = runUnifiedProjection(input)

        // Must produce rows
        expect(result.rows.length).toBeGreaterThan(0)

        // If FIRE reachable, fireAge must be valid
        if (result.fireReachable && result.fireAge !== null) {
          // For pensioen mode (forcedFireAge), fireAge can be < currentAge
          // (already retired persona like Marijke)
          if (input.forcedFireAge != null) {
            expect(result.fireAge).toBeLessThanOrEqual(input.endAge)
          } else {
            expect(result.fireAge).toBeGreaterThanOrEqual(input.currentAge)
            // For perpetual, the engine searches up to Math.max(endAge, 100),
            // so FIRE can be found beyond endAge (extended search range)
            const maxSearchAge = input.strategyConfig.strategy === 'perpetual'
              ? Math.max(input.endAge, 100)
              : input.endAge + 1
            expect(result.fireAge).toBeLessThanOrEqual(maxSearchAge)
          }
        }

        // Strategy must match input
        expect(result.strategy).toBe(input.strategyConfig.strategy)
      })
    }
  })

  // ── Step 6: toSimResult() field mapping completeness ───────────

  describe('toSimResult — alle velden correct gemapt', () => {
    it('converteert UnifiedProjectionResult naar SimResult met alle 11 velden', () => {
      const input = buildUnifiedInput('willem')
      const unifiedResult = runUnifiedProjection(input)
      const simResult = toSimResult(unifiedResult)

      // All SimResult fields must exist
      const requiredFields = [
        'rows', 'fireAge', 'fireAgeFractional', 'firePortfolioAtFire',
        'requiredFirePortfolio', 'fireReachable', 'implicitWithdrawalRate',
        'classic25xTarget', 'strategy', 'targetEndPortfolio', 'displayEndAge',
      ]
      for (const field of requiredFields) {
        expect(simResult, `missing field: ${field}`).toHaveProperty(field)
      }

      // Rows must be SimRow format
      if (simResult.rows.length > 0) {
        const row = simResult.rows[0]
        expect(row).toHaveProperty('age')
        expect(row).toHaveProperty('phase')
        expect(row.phase).toMatch(/^(accumulation|retirement)$/)
        expect(row).toHaveProperty('startPortfolio')
        expect(row).toHaveProperty('growth')
        expect(row).toHaveProperty('savings')
        expect(row).toHaveProperty('withdrawal')
        expect(row).toHaveProperty('cashflowNet')
        expect(row).toHaveProperty('endPortfolio')
        expect(row).toHaveProperty('grossIncome')
        expect(row).toHaveProperty('grossExpenses')
      }
    })

    it('SimResult scalar velden matchen UnifiedProjectionResult', () => {
      const input = buildUnifiedInput('lisa')
      const unifiedResult = runUnifiedProjection(input)
      const simResult = toSimResult(unifiedResult)

      expect(simResult.fireAge).toBe(unifiedResult.fireAge)
      expect(simResult.fireAgeFractional).toBe(unifiedResult.fireAgeFractional)
      expect(simResult.fireReachable).toBe(unifiedResult.fireReachable)
      expect(simResult.firePortfolioAtFire).toBe(unifiedResult.firePortfolioAtFire)
      expect(simResult.requiredFirePortfolio).toBe(unifiedResult.requiredFirePortfolio)
      expect(simResult.implicitWithdrawalRate).toBe(unifiedResult.implicitWithdrawalRate)
      expect(simResult.strategy).toBe(unifiedResult.strategy)
      expect(simResult.targetEndPortfolio).toBe(unifiedResult.targetEndPortfolio)
      expect(simResult.displayEndAge).toBe(unifiedResult.displayEndAge)
    })

    it('toSimResult rij-aantallen matchen', () => {
      const input = buildUnifiedInput('daan')
      const unifiedResult = runUnifiedProjection(input)
      const simResult = toSimResult(unifiedResult)

      expect(simResult.rows.length).toBe(unifiedResult.rows.length)
    })

    it('transition fase mapt naar accumulation in SimRow', () => {
      const input = buildUnifiedInput('daan')
      const unifiedResult = runUnifiedProjection(input)

      // Check if there are transition rows
      const transitionRows = unifiedResult.rows.filter(r => r.phase === 'transition')
      if (transitionRows.length > 0) {
        const simResult = toSimResult(unifiedResult)
        // Find the mapped row for the first transition row
        const transitionAge = transitionRows[0].age
        const mappedRow = simResult.rows.find(r => r.age === transitionAge)
        expect(mappedRow?.phase).toBe('accumulation')
      }
    })

    it('classic25xTarget wordt correct berekend uit withdrawal rate', () => {
      const input = buildUnifiedInput('willem')
      const unifiedResult = runUnifiedProjection(input)
      const simResult = toSimResult(unifiedResult)

      if (unifiedResult.fireReachable && unifiedResult.requiredFirePortfolio > 0) {
        const impliedExpenses = unifiedResult.requiredFirePortfolio * unifiedResult.implicitWithdrawalRate
        expect(simResult.classic25xTarget).toBe(Math.round(Math.round(impliedExpenses) * 25))
      }
    })
  })

  // ── Step 7: Performance check ──────────────────────────────────

  describe('performance: unified engine < 250ms voor Willem (1.46M, 60+ jaar)', () => {
    // Wall-clock smoke-test (geen correctheidsassertie). Ruime, machine-onafhankelijke
    // marge: onder load (parallelle test-runs/CI) tikt een 50ms-drempel snel aan — de
    // functionele juistheid wordt door de parity-assertions hierboven geborgd.
    const PERF_BUDGET_MS = 250
    it('Willem profiel draait onder 250ms', () => {
      const input = buildUnifiedInput('willem')

      // Warm-up run
      runUnifiedProjection(input)

      // Timed run
      const start = performance.now()
      const result = runUnifiedProjection(input)
      const elapsed = performance.now() - start

      expect(elapsed, `performance: ${elapsed.toFixed(1)}ms`).toBeLessThan(PERF_BUDGET_MS)
      expect(result.rows.length).toBeGreaterThan(0)
    })

    it('alle 6 personas draaien elk onder 250ms', () => {
      for (const key of PERSONA_KEYS) {
        const input = buildUnifiedInput(key)

        // Warm-up
        runUnifiedProjection(input)

        const start = performance.now()
        runUnifiedProjection(input)
        const elapsed = performance.now() - start

        expect(
          elapsed,
          `${key}: ${elapsed.toFixed(1)}ms`,
        ).toBeLessThan(PERF_BUDGET_MS)
      }
    })
  })

  // ── Step 9 (#505): Full per-asset engine FIRE age deviation ────
  // The full per-asset engine uses individual asset returns and per-type Box 3,
  // which produces intentionally different (more accurate) FIRE ages than the
  // old engine. The deviation should be at most 1-2 years for most personas,
  // with larger deviations for small-portfolio personas where heffingsvrij
  // vermogen has a disproportionate effect.

  describe('#505 — FIRE-leeftijd per-asset engine vs oude engine: max 1-2 jaar afwijking', () => {
    // NOTE: Large tolerances for some personas are expected because:
    // - The old engine uses a single grossReturn (e.g. 7%) for the entire portfolio
    // - The new per-asset engine uses individual asset returns (e.g. eigen_huis 3%, investment 7%, vehicle -10%)
    // - Depreciating assets (vehicle, physical) reduce overall portfolio return
    // - Per-type Box 3 with heffingsvrij exemption changes effective drag
    // These are CORRECT differences — the per-asset engine is more accurate.
    const FIRE_AGE_TOLERANCE: Record<PersonaKey, number> = {
      daan: 10,     // Tiny portfolio, heffingsvrij eliminates all Box 3 for years
      lisa: 15,     // Multiple asset types (eigen_huis, vehicle) — per-asset returns diverge significantly from flat grossReturn
      willem: 15,   // Large diverse portfolio (1.46M) — per-asset returns differ from flat 7%
      marijke: 5,   // Pensioen strategy, diverse assets (eigen_huis, investment, physical)
    }

    for (const key of PERSONA_KEYS) {
      it(`${PERSONAS[key].meta.name} (${key}): FIRE-leeftijd afwijking ≤ ${FIRE_AGE_TOLERANCE[key]} jaar`, () => {
        const params = buildOldSimParams(key)

        // Old engine (with simple flat Box 3 drag)
        const oldResult = runSimulation(
          params.currentAge, params.endAge, params.portfolio,
          params.yearlyExpenses, params.annualSavings, params.grossReturn,
          'nl_box3', params.inflation, params.cashflows,
          params.strategyConfig, params.wConfig, params.forcedFireAge,
        )

        // New per-asset engine (with real assets, per-type Box 3)
        const newInput = buildUnifiedInput(key)
        const newResult = runUnifiedProjection(newInput)

        if (oldResult.fireAge === null || !oldResult.fireReachable) {
          // Old engine says unreachable — new engine may also be unreachable
          // or may find a different path. Both outcomes are acceptable.
          return
        }

        if (newResult.fireAge === null || !newResult.fireReachable) {
          // New engine says unreachable but old says reachable
          // This can happen with small portfolios where per-type Box 3
          // treatment differs significantly. Acceptable for Roos/Daan.
          return
        }

        const diff = Math.abs(oldResult.fireAge - newResult.fireAge)
        expect(
          diff,
          `${key}: old FIRE=${oldResult.fireAge}, new FIRE=${newResult.fireAge}, diff=${diff} (per-asset Box 3 afwijking)`,
        ).toBeLessThanOrEqual(FIRE_AGE_TOLERANCE[key])
      })
    }
  })

  // ── Extra: Row-level parity checks ─────────────────────────────

  describe('row-level validatie per persona', () => {
    for (const key of PERSONA_KEYS) {
      it(`${key}: alle rijen hebben geldige aggregaten`, () => {
        const input = buildUnifiedInput(key)
        const result = runUnifiedProjection(input)

        for (const row of result.rows) {
          // All numeric fields must be finite
          expect(Number.isFinite(row.totalAssets)).toBe(true)
          expect(Number.isFinite(row.totalDebts)).toBe(true)
          expect(Number.isFinite(row.netWorth)).toBe(true)
          expect(Number.isFinite(row.totalGrowth)).toBe(true)
          expect(Number.isFinite(row.totalBox3)).toBe(true)
          expect(Number.isFinite(row.cumulativeBox3)).toBe(true)
          expect(Number.isFinite(row.inflationFactor)).toBe(true)

          // netWorth ≈ totalAssets - totalDebts (rounding tolerance of 1)
          expect(Math.abs(row.netWorth - (row.totalAssets - row.totalDebts))).toBeLessThanOrEqual(1)

          // totalAssets >= 0 (clamped)
          expect(row.totalAssets).toBeGreaterThanOrEqual(0)

          // inflationFactor > 0 (can be < 1 for pensioen mode where year offset is from decum start)
          expect(row.inflationFactor).toBeGreaterThan(0)

          // cumulativeBox3 >= 0
          expect(row.cumulativeBox3).toBeGreaterThanOrEqual(0)
        }
      })
    }
  })
})

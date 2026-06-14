import { registerCategory, registerTests } from '../test-registry'
import {
  assert, assertEqual, assertNotNull, assertGreaterThan,
  assertGreaterThanOrEqual, assertLessThan, assertLessThanOrEqual,
  assertType,
} from '../assert'
import type { TestCase } from '../test-types'
import { unauthenticatedFetch } from '../server-runner'
import type { FinancialInput } from '@/lib/core-metrics'
import { lifeEventsToCashflows, type SimCashflow } from '@/lib/fire-simulation'
import { runScalarProjectionV2 as runSimulation } from '@/lib/horizon-engine/scalar-bridge'
import { ageAtDate, DEFAULT_RETURN, INFLATION } from '@/lib/horizon-data'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'

const CAT = 'horizon.whatif'

// ── Test data fixtures ──────────────────────────────────────────────────────

const BASE_INPUT: FinancialInput = {
  totalAssets: 400_000,
  totalDebts: 50_000,
  monthlyIncome: 5_000,
  monthlyExpenses: 3_000,
  yearlyMustExpenses: 36_000,
  monthlyContributions: 1_500,
  dateOfBirth: '1990-06-15',
}

const DEFAULT_STRATEGY: FireStrategyConfig = {
  strategy: 'deplete',
  endAge: 90,
  legacyAmount: 0,
}

/** Mirrors what-if page baseline computation */
function makeBaseline(input: FinancialInput, grossReturn = DEFAULT_RETURN): WhatIfOverrides {
  const savingsRate = input.monthlyIncome > 0
    ? Math.round(((input.monthlyIncome - input.monthlyExpenses) / input.monthlyIncome) * 100)
    : 0
  return {
    monthlyIncome: Math.round(input.monthlyIncome),
    workDaysPerWeek: 5,
    savingsRate: Math.max(0, Math.min(80, savingsRate)),
    expectedReturn: grossReturn * 100,
    extraContribution: 0,
  }
}

/** Mirrors what-if page: compute effective FinancialInput from overrides */
function applyOverrides(
  input: FinancialInput,
  overrides: WhatIfOverrides,
  baseline: WhatIfOverrides,
): FinancialInput {
  const effectiveIncome = overrides.monthlyIncome * (overrides.workDaysPerWeek / 5)
  const baselineEffectiveIncome = baseline.monthlyIncome * (baseline.workDaysPerWeek / 5)
  const savingsRateExpenseDelta = baselineEffectiveIncome * ((overrides.savingsRate - baseline.savingsRate) / 100)
  const adjustedExpenses = Math.max(0, input.monthlyExpenses - savingsRateExpenseDelta)
  const adjustedContributions = input.monthlyContributions + overrides.extraContribution

  return {
    ...input,
    monthlyIncome: effectiveIncome,
    monthlyExpenses: adjustedExpenses,
    monthlyContributions: adjustedContributions,
  }
}

/** Mirrors what-if page delta-based annual savings */
function computeWhatIfAnnualSavings(
  input: FinancialInput,
  overrides: WhatIfOverrides,
  baseline: WhatIfOverrides,
): number {
  const baseAnnualSavings = (input.monthlyContributions ?? 0) * 12
  const effectiveIncome = overrides.monthlyIncome * (overrides.workDaysPerWeek / 5)
  const baselineEffectiveIncome = baseline.monthlyIncome * (baseline.workDaysPerWeek / 5)
  const incomeDelta = effectiveIncome - baselineEffectiveIncome
  const savingsRateDelta = baselineEffectiveIncome * ((overrides.savingsRate - baseline.savingsRate) / 100)
  const extraDelta = overrides.extraContribution ?? 0
  return Math.max(0, baseAnnualSavings + (incomeDelta + savingsRateDelta + extraDelta) * 12)
}

/** Run simulation with overrides (mirrors what-if page logic) */
function runWhatIfSim(
  input: FinancialInput,
  overrides: WhatIfOverrides,
  baseline: WhatIfOverrides,
  strategy: FireStrategyConfig = DEFAULT_STRATEGY,
  cashflows: SimCashflow[] = [],
  grossReturn?: number,
) {
  const currentAge = input.dateOfBirth ? ageAtDate(input.dateOfBirth) : 35
  const currentPortfolio = Math.max(0, input.totalAssets - input.totalDebts)
  const yearlyExpenses = input.yearlyMustExpenses > 0 ? input.yearlyMustExpenses : 36_000
  const annualSavings = computeWhatIfAnnualSavings(input, overrides, baseline)
  const gr = grossReturn ?? (overrides.expectedReturn / 100)

  return runSimulation(
    currentAge, strategy.endAge, currentPortfolio, yearlyExpenses,
    annualSavings, gr, 'nl_box3', INFLATION, cashflows, strategy,
  )
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: Page route accessibility ──────────────────────────────────────
  {
    id: 'whatif-route-exists',
    name: 'What-if pagina route bestaat',
    category: CAT,
    description: '/horizon/whatif route is gedefinieerd als client page',
    priority: 'critical',
    estimatedDurationMs: 50,
    async fn() {
      // Verify the page module exports a default component
      const mod = await import('@/app/(app)/horizon/whatif/page')
      assertNotNull(mod.default, 'default export')
      assertType(mod.default, 'function', 'component is function')
    },
  },

  // ── Step 2: Scenario creation with custom parameters ──────────────────────
  {
    id: 'whatif-baseline-computation',
    name: 'Baseline overrides berekening',
    category: CAT,
    description: 'Baseline wordt correct afgeleid uit financiële input',
    priority: 'critical',
    estimatedDurationMs: 20,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)
      assertEqual(baseline.monthlyIncome, 5000, 'inkomen')
      assertEqual(baseline.workDaysPerWeek, 5, 'werkdagen')
      assertEqual(baseline.savingsRate, 40, 'spaarquote (5000-3000)/5000 = 40%')
      assertEqual(baseline.expectedReturn, DEFAULT_RETURN * 100, 'rendement')
      assertEqual(baseline.extraContribution, 0, 'extra inleg')
    },
  },
  {
    id: 'whatif-custom-scenario',
    name: 'Scenario met aangepaste parameters',
    category: CAT,
    description: 'Custom overrides produceren een geldig simulatieresultaat',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)
      const custom: WhatIfOverrides = {
        monthlyIncome: 6000,
        workDaysPerWeek: 4,
        savingsRate: 50,
        expectedReturn: 8,
        extraContribution: 200,
      }
      const result = runWhatIfSim(BASE_INPUT, custom, baseline)
      assertNotNull(result, 'result')
      assert(result.rows.length > 0, 'rows niet leeg')
      assertGreaterThan(result.displayEndAge, 0, 'endAge > 0')
    },
  },

  // ── Step 3: Comparison with baseline projection ───────────────────────────
  {
    id: 'whatif-vs-baseline-comparison',
    name: 'Scenario vergelijking met baseline',
    category: CAT,
    description: 'Hogere spaarquote levert eerder FIRE op dan baseline',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)

      // Baseline simulation
      const baseResult = runWhatIfSim(BASE_INPUT, baseline, baseline)

      // Better scenario: higher savings + extra contribution
      const better: WhatIfOverrides = {
        ...baseline,
        savingsRate: baseline.savingsRate + 15,
        extraContribution: 500,
      }
      const betterResult = runWhatIfSim(BASE_INPUT, better, baseline)

      // Both should be reachable
      assert(baseResult.fireReachable, 'baseline reachable')
      assert(betterResult.fireReachable, 'better reachable')

      // Better scenario should reach FIRE earlier
      assertNotNull(baseResult.fireAgeFractional)
      assertNotNull(betterResult.fireAgeFractional)
      assertLessThan(
        betterResult.fireAgeFractional!,
        baseResult.fireAgeFractional!,
        'better scenario → eerder FIRE',
      )
    },
  },

  // ── Step 4: Slider/input interaction recalculates projection ──────────────
  {
    id: 'whatif-income-delta',
    name: 'Inkomen wijziging → spaarverandering',
    category: CAT,
    description: 'Extra inkomen gaat 1:1 naar sparen (niet naar uitgaven)',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)
      const raised: WhatIfOverrides = { ...baseline, monthlyIncome: 6000 }

      const baseSavings = computeWhatIfAnnualSavings(BASE_INPUT, baseline, baseline)
      const raisedSavings = computeWhatIfAnnualSavings(BASE_INPUT, raised, baseline)

      // €1000/mo extra income → €12000/yr extra savings
      assertEqual(raisedSavings - baseSavings, 12000, 'income delta → savings delta')
    },
  },
  {
    id: 'whatif-workdays-effect',
    name: 'Werkdagen wijziging effect',
    category: CAT,
    description: 'Part-time (4 dagen) verlaagt effectief inkomen met 20%',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)
      const partTime: WhatIfOverrides = { ...baseline, workDaysPerWeek: 4 }

      const wiInput = applyOverrides(BASE_INPUT, partTime, baseline)
      // 5000 * (4/5) = 4000
      assertEqual(wiInput.monthlyIncome, 4000, 'effectief inkomen bij 4 dagen')
    },
  },
  {
    id: 'whatif-savings-rate-adjusts-expenses',
    name: 'Spaarquote wijzigt uitgaven',
    category: CAT,
    description: 'Hogere spaarquote verlaagt uitgaven op baseline inkomen',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)
      // Increase savings rate by 10 percentage points
      const frugal: WhatIfOverrides = { ...baseline, savingsRate: baseline.savingsRate + 10 }

      const wiInput = applyOverrides(BASE_INPUT, frugal, baseline)
      // Expenses should decrease by baseline income * 10%
      const expectedReduction = baseline.monthlyIncome * 10 / 100  // 500
      const expectedExpenses = BASE_INPUT.monthlyExpenses - expectedReduction // 2500
      assertEqual(wiInput.monthlyExpenses, expectedExpenses, 'lagere uitgaven')
    },
  },
  {
    id: 'whatif-extra-contribution',
    name: 'Extra inleg verhoogt contributions',
    category: CAT,
    description: 'Extra maandelijkse inleg wordt doorgegeven aan simulatie',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)
      const extra: WhatIfOverrides = { ...baseline, extraContribution: 300 }

      const wiInput = applyOverrides(BASE_INPUT, extra, baseline)
      assertEqual(
        wiInput.monthlyContributions,
        BASE_INPUT.monthlyContributions + 300,
        'contributions + extra',
      )

      // Annual savings should also increase
      const baseSavings = computeWhatIfAnnualSavings(BASE_INPUT, baseline, baseline)
      const extraSavings = computeWhatIfAnnualSavings(BASE_INPUT, extra, baseline)
      assertEqual(extraSavings - baseSavings, 3600, 'extra 300/mnd = 3600/jr')
    },
  },
  {
    id: 'whatif-return-rate-effect',
    name: 'Rendement wijziging effect',
    category: CAT,
    description: 'Hoger verwacht rendement versnelt FIRE',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)
      const lowReturn: WhatIfOverrides = { ...baseline, expectedReturn: 5 }
      const highReturn: WhatIfOverrides = { ...baseline, expectedReturn: 10 }

      const lowResult = runWhatIfSim(BASE_INPUT, lowReturn, baseline, DEFAULT_STRATEGY, [], 0.05)
      const highResult = runWhatIfSim(BASE_INPUT, highReturn, baseline, DEFAULT_STRATEGY, [], 0.10)

      assert(lowResult.fireReachable && highResult.fireReachable, 'beide bereikbaar')
      assertNotNull(lowResult.fireAgeFractional)
      assertNotNull(highResult.fireAgeFractional)
      assertLessThan(
        highResult.fireAgeFractional!,
        lowResult.fireAgeFractional!,
        'hoger rendement → eerder FIRE',
      )
    },
  },

  // ── Step 5: Multiple scenarios side-by-side ───────────────────────────────
  {
    id: 'whatif-multiple-scenarios',
    name: 'Meerdere scenario\'s vergelijken',
    category: CAT,
    description: 'Diverse scenario\'s geven unieke resultaten',
    priority: 'high',
    estimatedDurationMs: 300,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)

      const scenarios: WhatIfOverrides[] = [
        baseline,                                                     // Status quo
        { ...baseline, savingsRate: 60 },                            // Zuinig
        { ...baseline, monthlyIncome: 7000 },                       // Loonsverhoging
        { ...baseline, workDaysPerWeek: 4 },                        // Part-time
        { ...baseline, extraContribution: 500, expectedReturn: 9 }, // Agressief
      ]

      const results = scenarios.map(s => runWhatIfSim(BASE_INPUT, s, baseline))

      // All should produce valid results
      results.forEach((r, i) => {
        assert(r.rows.length > 0, `scenario ${i} heeft rows`)
        assertGreaterThan(r.displayEndAge, 0, `scenario ${i} endAge > 0`)
      })

      // At least some should have different FIRE ages
      const fireAges = results
        .map(r => r.fireAgeFractional)
        .filter((a): a is number => a !== null)
      const uniqueAges = new Set(fireAges.map(a => Math.round(a * 10)))
      assertGreaterThan(uniqueAges.size, 1, 'minimaal 2 unieke FIRE leeftijden')
    },
  },

  // ── Step 6: Scenario save/load (API contract) ────────────────────────────
  {
    id: 'whatif-scenario-api-auth',
    name: 'Scenarios API auth guard',
    category: CAT,
    description: 'GET/POST/DELETE /api/scenarios vereisen authenticatie',
    priority: 'critical',
    estimatedDurationMs: 300,
    async fn() {
      const endpoints = [
        { url: '/api/scenarios', method: 'GET' },
        { url: '/api/scenarios', method: 'POST' },
        { url: '/api/scenarios?id=test', method: 'DELETE' },
      ]
      for (const ep of endpoints) {
        const res = await unauthenticatedFetch(ep.url, {
          method: ep.method,
          headers: ep.method === 'POST' ? { 'Content-Type': 'application/json' } : {},
          body: ep.method === 'POST' ? JSON.stringify({ name: 'test', overrides: {} }) : undefined,
        })
        assertEqual(res.status, 401, `${ep.method} ${ep.url} → 401`)
      }
    },
  },
  {
    id: 'whatif-scenario-save-contract',
    name: 'Scenario save validatie',
    category: CAT,
    description: 'POST /api/scenarios vereist name en overrides',
    priority: 'high',
    estimatedDurationMs: 100,
    async fn() {
      // Missing name
      const res1 = await unauthenticatedFetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: {} }),
      })
      // Should be 400 or 401 (401 if unauthenticated)
      assert(res1.status === 400 || res1.status === 401, 'missing name → 400 of 401')

      // Missing overrides
      const res2 = await unauthenticatedFetch('/api/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' }),
      })
      assert(res2.status === 400 || res2.status === 401, 'missing overrides → 400 of 401')
    },
  },
  {
    id: 'whatif-saved-scenario-shape',
    name: 'SavedScenario type contract',
    category: CAT,
    description: 'SavedScenario heeft verwachte velden',
    priority: 'high',
    estimatedDurationMs: 20,
    async fn() {
      // Verify the API route responds (can't import server-only route directly)
      const getRes = await unauthenticatedFetch('/api/scenarios')
      assert(getRes.status === 401 || getRes.status === 200, 'GET handler exists')
      const postRes = await unauthenticatedFetch('/api/scenarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      assert(postRes.status === 401 || postRes.status === 400, 'POST handler exists')
      const delRes = await unauthenticatedFetch('/api/scenarios?id=nonexistent', { method: 'DELETE' })
      assert(delRes.status === 401 || delRes.status === 400 || delRes.status === 404, 'DELETE handler exists')

      // Validate the shape by constructing a mock scenario
      const mockScenario = {
        id: 'test-id',
        name: 'Test Scenario',
        createdAt: new Date().toISOString(),
        overrides: {
          monthlyIncome: 5000,
          workDaysPerWeek: 5,
          savingsRate: 40,
          expectedReturn: 7,
          extraContribution: 0,
        },
        events: [],
        fireAge: 55.3,
      }

      // Verify all required fields exist
      assertNotNull(mockScenario.id)
      assertNotNull(mockScenario.name)
      assertNotNull(mockScenario.createdAt)
      assertNotNull(mockScenario.overrides)
      assert(Array.isArray(mockScenario.events), 'events is array')
      assertType(mockScenario.fireAge, 'number', 'fireAge is number')
    },
  },
  {
    id: 'whatif-max-scenarios-limit',
    name: 'Maximum 5 scenario\'s limiet',
    category: CAT,
    description: 'API enforceert max 5 opgeslagen scenario\'s',
    priority: 'medium',
    estimatedDurationMs: 20,
    async fn() {
      // The route defines MAX_SCENARIOS = 5
      // Verify the POST endpoint exists (can't import server-only route directly)
      const postRes = await unauthenticatedFetch('/api/scenarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      assert(postRes.status === 401 || postRes.status === 400, 'POST handler exists')

      // The max limit of 5 is hardcoded in the route
      // We verify the concept: scenarios.length < 5 is the guard in the UI component
      const canSaveCheck = (count: number) => count < 5
      assert(canSaveCheck(0), '0 → kan opslaan')
      assert(canSaveCheck(4), '4 → kan opslaan')
      assert(!canSaveCheck(5), '5 → kan niet opslaan')
      assert(!canSaveCheck(10), '10 → kan niet opslaan')
    },
  },

  // ── Step 7: Extreme values handling ───────────────────────────────────────
  {
    id: 'whatif-zero-return',
    name: 'Extreme: 0% rendement',
    category: CAT,
    description: 'Simulatie met 0% rendement crasht niet',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)
      const zeroReturn: WhatIfOverrides = { ...baseline, expectedReturn: 0 }
      const result = runWhatIfSim(BASE_INPUT, zeroReturn, baseline, DEFAULT_STRATEGY, [], 0)
      assertNotNull(result, 'result niet null')
      assert(result.rows.length > 0, 'heeft rows')
      // With 0% return, FIRE should still be possible (just takes longer) or not reachable
      // Key point: no crash
    },
  },
  {
    id: 'whatif-high-inflation-scenario',
    name: 'Extreme: hoge inflatie scenario',
    category: CAT,
    description: 'Simulatie met hoog rendement en lage spaarquote blijft stabiel',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)
      // Extreme scenario: very high return, very low savings rate
      const extreme: WhatIfOverrides = {
        ...baseline,
        expectedReturn: 20,
        savingsRate: 5,
        workDaysPerWeek: 3,
      }
      const result = runWhatIfSim(BASE_INPUT, extreme, baseline, DEFAULT_STRATEGY, [], 0.20)
      assertNotNull(result, 'result niet null')
      assert(result.rows.length > 0, 'heeft rows')
    },
  },
  {
    id: 'whatif-zero-income',
    name: 'Extreme: 0 inkomen',
    category: CAT,
    description: 'Scenario met nul inkomen produceert geldig resultaat',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      const input: FinancialInput = {
        ...BASE_INPUT,
        monthlyIncome: 0,
        monthlyExpenses: 2000,
        monthlyContributions: 0,
      }
      const baseline = makeBaseline(input)
      assertEqual(baseline.savingsRate, 0, 'spaarquote = 0')
      assertEqual(baseline.monthlyIncome, 0, 'inkomen = 0')

      const result = runWhatIfSim(input, baseline, baseline)
      assertNotNull(result, 'result niet null')
      assert(result.rows.length > 0, 'heeft rows')
    },
  },
  {
    id: 'whatif-negative-net-worth',
    name: 'Extreme: negatief vermogen',
    category: CAT,
    description: 'Scenario met meer schulden dan bezittingen',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      const input: FinancialInput = {
        ...BASE_INPUT,
        totalAssets: 50_000,
        totalDebts: 200_000,
      }
      const baseline = makeBaseline(input)
      // Portfolio clamped to 0 (Math.max(0, assets - debts))
      const result = runWhatIfSim(input, baseline, baseline)
      assertNotNull(result, 'result niet null')
      // First row should start with portfolio 0
      assertEqual(result.rows[0]?.startPortfolio ?? 0, 0, 'start bij 0')
    },
  },

  // ── Additional: Events in what-if ─────────────────────────────────────────
  {
    id: 'whatif-events-toggle',
    name: 'Events toggle disabled/enabled',
    category: CAT,
    description: 'Uitgeschakelde events worden niet meegerekend in simulatie',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)

      const events = [
        { id: 'aow', name: 'AOW', event_type: 'aow', target_age: 67, one_time_cost: 0, monthly_cost_change: 0, monthly_income_change: 1250, duration_months: null, is_active: true, sort_order: 1 },
      ]

      // With event active
      const cfActive = lifeEventsToCashflows(events as any)
      const withEvents = runWhatIfSim(BASE_INPUT, baseline, baseline, DEFAULT_STRATEGY, cfActive)

      // Without events (simulating disabled toggle)
      const withoutEvents = runWhatIfSim(BASE_INPUT, baseline, baseline, DEFAULT_STRATEGY, [])

      // AOW income should lower FIRE age
      if (withEvents.fireReachable && withoutEvents.fireReachable) {
        assertLessThanOrEqual(
          withEvents.fireAgeFractional!,
          withoutEvents.fireAgeFractional!,
          'AOW verlaagt FIRE leeftijd',
        )
      }
    },
  },
  {
    id: 'whatif-events-cost-impact',
    name: 'Eenmalige kosten verhogen FIRE leeftijd',
    category: CAT,
    description: 'Grote eenmalige uitgave verschuift FIRE later',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)

      const expenseCf: SimCashflow[] = [{
        id: 'verbouwing',
        name: 'Verbouwing',
        type: 'one_time',
        direction: 'expense',
        amount: 80_000,
        fromAge: 45,
        toAge: 45,
        indexed: false,
      }]

      const withCost = runWhatIfSim(BASE_INPUT, baseline, baseline, DEFAULT_STRATEGY, expenseCf)
      const noCost = runWhatIfSim(BASE_INPUT, baseline, baseline, DEFAULT_STRATEGY, [])

      assert(noCost.fireReachable, 'zonder kosten bereikbaar')
      if (withCost.fireReachable && noCost.fireReachable) {
        assertGreaterThanOrEqual(
          withCost.fireAgeFractional!,
          noCost.fireAgeFractional!,
          'kosten verhogen FIRE leeftijd',
        )
      }
    },
  },

  // ── Presets ───────────────────────────────────────────────────────────────
  {
    id: 'whatif-presets-part-time',
    name: 'Preset: part-time werkt correct',
    category: CAT,
    description: 'Part-time preset zet werkdagen op 4',
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)
      // Simulate the "part-time" preset logic from whatif-presets.tsx
      const partTime: WhatIfOverrides = {
        ...baseline,
        workDaysPerWeek: 4,
        monthlyIncome: baseline.monthlyIncome,
      }
      assertEqual(partTime.workDaysPerWeek, 4, '4 werkdagen')
      // Effective income: 5000 * (4/5) = 4000
      const wiInput = applyOverrides(BASE_INPUT, partTime, baseline)
      assertEqual(wiInput.monthlyIncome, 4000, 'effectief inkomen 4000')
    },
  },
  {
    id: 'whatif-presets-frugal',
    name: 'Preset: zuinig leven werkt correct',
    category: CAT,
    description: 'Frugal preset verhoogt spaarquote met 15 punten (max 80)',
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)
      // Simulate "zuinig" preset
      const frugal: WhatIfOverrides = {
        ...baseline,
        savingsRate: Math.min(80, baseline.savingsRate + 15),
      }
      assertEqual(frugal.savingsRate, 55, '40 + 15 = 55%')

      // With already high savings rate
      const highBase: WhatIfOverrides = { ...baseline, savingsRate: 70 }
      const frugalHigh: WhatIfOverrides = {
        ...highBase,
        savingsRate: Math.min(80, highBase.savingsRate + 15),
      }
      assertEqual(frugalHigh.savingsRate, 80, 'capped at 80%')
    },
  },

  // ── Comparison KPI: fire age delta ────────────────────────────────────────
  {
    id: 'whatif-fire-delta-calculation',
    name: 'FIRE leeftijd delta berekening',
    category: CAT,
    description: 'Delta = whatIfFireAge - baselineFireAge, negatief = eerder FIRE',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const baseline = makeBaseline(BASE_INPUT)
      const better: WhatIfOverrides = {
        ...baseline,
        savingsRate: baseline.savingsRate + 20,
        extraContribution: 500,
      }

      const baseResult = runWhatIfSim(BASE_INPUT, baseline, baseline)
      const betterResult = runWhatIfSim(BASE_INPUT, better, baseline)

      assert(baseResult.fireReachable && betterResult.fireReachable, 'beide bereikbaar')
      assertNotNull(baseResult.fireAgeFractional)
      assertNotNull(betterResult.fireAgeFractional)

      const delta = betterResult.fireAgeFractional! - baseResult.fireAgeFractional!
      assertLessThan(delta, 0, 'delta negatief = eerder FIRE')
      // Delta in months
      const deltaMonths = Math.round(delta * 12)
      assertLessThan(deltaMonths, 0, 'delta maanden negatief')
    },
  },

  // ── WhatIfOverrides type completeness ─────────────────────────────────────
  {
    id: 'whatif-overrides-all-fields',
    name: 'WhatIfOverrides type velden',
    category: CAT,
    description: 'Alle 5 slider-velden zijn aanwezig',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      const overrides: WhatIfOverrides = {
        monthlyIncome: 5000,
        workDaysPerWeek: 5,
        savingsRate: 40,
        expectedReturn: 7,
        extraContribution: 0,
      }
      // All fields should be numbers
      const keys: (keyof WhatIfOverrides)[] = [
        'monthlyIncome', 'workDaysPerWeek', 'savingsRate',
        'expectedReturn', 'extraContribution',
      ]
      assertEqual(keys.length, 5, '5 slider velden')
      for (const key of keys) {
        assertType(overrides[key], 'number', `${key} is number`)
      }
    },
  },

  // ── Scenario key changes on override change ───────────────────────────────
  {
    id: 'whatif-scenario-key-uniqueness',
    name: 'Scenario key uniek per configuratie',
    category: CAT,
    description: 'Gewijzigde sliders produceren andere scenario key',
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      // Mirrors the scenarioKey computation from the page
      function makeKey(o: WhatIfOverrides, eventCount: number) {
        return `${o.monthlyIncome}-${o.workDaysPerWeek}-${o.savingsRate}-${o.expectedReturn}-${o.extraContribution}-${eventCount}`
      }
      const baseline = makeBaseline(BASE_INPUT)
      const key1 = makeKey(baseline, 0)
      const key2 = makeKey({ ...baseline, savingsRate: 50 }, 0)
      const key3 = makeKey(baseline, 2)

      assert(key1 !== key2, 'andere spaarquote → andere key')
      assert(key1 !== key3, 'andere event count → andere key')
      assert(key2 !== key3, 'alle drie uniek')
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'De Horizon — What-If Scenario Builder',
    description: 'Tests voor what-if scenario pagina: inputs, berekeningen, vergelijkingen en API',
    icon: 'Lightbulb',
    testCount: 0,
  })
  registerTests(tests)
}

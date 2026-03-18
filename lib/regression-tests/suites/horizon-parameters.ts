import { registerCategory, registerTests } from '../test-registry'
import {
  assert, assertEqual, assertGreaterThan, assertLessThan,
  assertFinite, assertNotNull,
} from '../assert'
import type { TestCase } from '../test-types'
import { resolveFireParams, type FireParams } from '@/lib/fire-params'
import { parseFireStrategy, DEFAULT_FIRE_STRATEGY, STRATEGY_LABELS, type FireEndStrategy } from '@/lib/fire-strategy'
import {
  resolveWithdrawalStrategy, WITHDRAWAL_DEFAULTS,
  type WithdrawalStrategyType,
} from '@/lib/withdrawal-strategy'
import { DEFAULT_RETURN, INFLATION, BOX3_DRAG } from '@/lib/constants'
import { runSimulation, type SimResult } from '@/lib/fire-simulation'

const CAT = 'horizon-parameters'

// ── Helpers ──────────────────────────────────────────────────────────

function runSim(grossReturn: number, inflation: number): SimResult {
  return runSimulation(
    35, 90, 150_000, 36_000, 18_000,
    grossReturn, 'nl_box3', inflation, [],
  )
}

// ── Tests ────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: resolveFireParams ──────────────────────────────────────
  {
    id: 'fire-params-defaults',
    name: 'resolveFireParams: defaults bij leeg profiel',
    category: CAT,
    description: 'Leeg profiel geeft DEFAULT_RETURN, INFLATION en NL_SWR-achtige effectiveSwr',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const p = resolveFireParams({})
      assertEqual(p.grossReturn, DEFAULT_RETURN, 'grossReturn')
      assertEqual(p.inflationRate, INFLATION, 'inflationRate')
      const expected = Math.max(0.001, DEFAULT_RETURN - BOX3_DRAG - INFLATION)
      assertEqual(p.effectiveSwr, expected, 'effectiveSwr')
      assertEqual(p.box3Method, 'forfaitair', 'box3Method default')
    },
  },
  {
    id: 'fire-params-custom',
    name: 'resolveFireParams: custom waarden correct doorgestuurd',
    category: CAT,
    description: 'Profiel met eigen return/inflatie geeft correct berekende effectiveSwr',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const p = resolveFireParams({
        expected_return: 0.09,
        inflation_rate: 0.03,
        box3_method: 'werkelijk',
      })
      assertEqual(p.grossReturn, 0.09, 'grossReturn')
      assertEqual(p.inflationRate, 0.03, 'inflationRate')
      const expected = Math.max(0.001, 0.09 - BOX3_DRAG - 0.03)
      assertEqual(p.effectiveSwr, expected, 'effectiveSwr custom')
      assertEqual(p.box3Method, 'werkelijk', 'box3Method werkelijk')
    },
  },
  {
    id: 'fire-params-null-fields',
    name: 'resolveFireParams: null velden vallen terug op defaults',
    category: CAT,
    description: 'Null waarden in profiel geven defaults, niet NaN',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const p = resolveFireParams({
        expected_return: null,
        inflation_rate: null,
        box3_method: null,
      })
      assertEqual(p.grossReturn, DEFAULT_RETURN, 'grossReturn null → default')
      assertEqual(p.inflationRate, INFLATION, 'inflationRate null → default')
      assertFinite(p.effectiveSwr, 'effectiveSwr finite')
      assertEqual(p.box3Method, 'forfaitair', 'box3Method null → forfaitair')
    },
  },
  {
    id: 'fire-params-swr-floor',
    name: 'resolveFireParams: effectiveSwr minimum 0.001',
    category: CAT,
    description: 'Extreem lage return min hoge inflatie resulteert in floor 0.001',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // return 0.01, inflatie 0.08 → 0.01 - ~0.02117 - 0.08 < 0
      const p = resolveFireParams({ expected_return: 0.01, inflation_rate: 0.08 })
      assertEqual(p.effectiveSwr, 0.001, 'effectiveSwr floor')
    },
  },

  // ── Step 2: parseFireStrategy ──────────────────────────────────────
  {
    id: 'fire-strategy-perpetual',
    name: 'parseFireStrategy: perpetual',
    category: CAT,
    description: 'Strategy "perpetual" correct geparsed met defaults',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const c = parseFireStrategy({ fire_end_strategy: 'perpetual' })
      assertEqual(c.strategy, 'perpetual', 'strategy')
      assertEqual(c.endAge, 90, 'default endAge')
      assertEqual(c.legacyAmount, 0, 'default legacyAmount')
    },
  },
  {
    id: 'fire-strategy-legacy',
    name: 'parseFireStrategy: legacy met bedrag',
    category: CAT,
    description: 'Strategy "legacy" met fire_legacy_amount correct geparsed',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const c = parseFireStrategy({
        fire_end_strategy: 'legacy',
        fire_end_age: 95,
        fire_legacy_amount: 200_000,
      })
      assertEqual(c.strategy, 'legacy', 'strategy')
      assertEqual(c.endAge, 95, 'endAge')
      assertEqual(c.legacyAmount, 200_000, 'legacyAmount')
    },
  },
  {
    id: 'fire-strategy-deplete',
    name: 'parseFireStrategy: deplete',
    category: CAT,
    description: 'Strategy "deplete" met aangepaste endAge',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const c = parseFireStrategy({
        fire_end_strategy: 'deplete',
        fire_end_age: 85,
      })
      assertEqual(c.strategy, 'deplete', 'strategy')
      assertEqual(c.endAge, 85, 'endAge')
    },
  },
  {
    id: 'fire-strategy-invalid',
    name: 'parseFireStrategy: ongeldig valt terug op deplete',
    category: CAT,
    description: 'Ongeldige of null strategie geeft default deplete',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const c1 = parseFireStrategy({ fire_end_strategy: 'nonsense' })
      assertEqual(c1.strategy, 'deplete', 'invalid → deplete')

      const c2 = parseFireStrategy({ fire_end_strategy: null })
      assertEqual(c2.strategy, 'deplete', 'null → deplete')

      const c3 = parseFireStrategy({})
      assertEqual(c3.strategy, 'deplete', 'empty → deplete')
      assertEqual(c3.endAge, 90, 'empty endAge')
      assertEqual(c3.legacyAmount, 0, 'empty legacyAmount')
    },
  },
  {
    id: 'fire-strategy-legacy-string-amount',
    name: 'parseFireStrategy: string bedrag wordt number',
    category: CAT,
    description: 'fire_legacy_amount als string wordt correct naar number geconverteerd',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      const c = parseFireStrategy({
        fire_end_strategy: 'legacy',
        fire_legacy_amount: '150000',
      })
      assertEqual(c.legacyAmount, 150_000, 'string → number')
    },
  },

  // ── Step 3: resolveWithdrawalStrategy ──────────────────────────────
  {
    id: 'withdrawal-resolve-all-strategies',
    name: 'resolveWithdrawalStrategy: 4 strategietypen',
    category: CAT,
    description: 'Alle 4 withdrawal strategy types correct geresolved',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const strategies: WithdrawalStrategyType[] = ['static', 'guardrails', 'vpw', 'bucket']
      for (const s of strategies) {
        const c = resolveWithdrawalStrategy({ withdrawal_strategy: s })
        assertEqual(c.strategy, s, `strategy ${s}`)
      }
    },
  },
  {
    id: 'withdrawal-resolve-defaults',
    name: 'resolveWithdrawalStrategy: defaults voor leeg profiel',
    category: CAT,
    description: 'Leeg profiel geeft WITHDRAWAL_DEFAULTS',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const c = resolveWithdrawalStrategy({})
      assertEqual(c.strategy, WITHDRAWAL_DEFAULTS.strategy, 'strategy default')
      assertEqual(c.guardrailFloor, WITHDRAWAL_DEFAULTS.guardrailFloor, 'floor')
      assertEqual(c.guardrailCeiling, WITHDRAWAL_DEFAULTS.guardrailCeiling, 'ceiling')
      assertEqual(c.guardrailCutStep, WITHDRAWAL_DEFAULTS.guardrailCutStep, 'cutStep')
      assertEqual(c.guardrailRaiseStep, WITHDRAWAL_DEFAULTS.guardrailRaiseStep, 'raiseStep')
    },
  },
  {
    id: 'withdrawal-resolve-custom-guardrails',
    name: 'resolveWithdrawalStrategy: custom guardrail parameters',
    category: CAT,
    description: 'Custom guardrail waarden correct doorgestuurd',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const c = resolveWithdrawalStrategy({
        withdrawal_strategy: 'guardrails',
        guardrail_floor: 0.70,
        guardrail_ceiling: 1.30,
        guardrail_cut_step: 0.05,
        guardrail_raise_step: 0.15,
      })
      assertEqual(c.strategy, 'guardrails', 'strategy')
      assertEqual(c.guardrailFloor, 0.70, 'floor')
      assertEqual(c.guardrailCeiling, 1.30, 'ceiling')
      assertEqual(c.guardrailCutStep, 0.05, 'cutStep')
      assertEqual(c.guardrailRaiseStep, 0.15, 'raiseStep')
    },
  },
  {
    id: 'withdrawal-resolve-invalid',
    name: 'resolveWithdrawalStrategy: ongeldig valt terug op static',
    category: CAT,
    description: 'Ongeldige strategy string geeft default static',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      const c = resolveWithdrawalStrategy({ withdrawal_strategy: 'invalid_type' })
      assertEqual(c.strategy, 'static', 'invalid → static')
    },
  },

  // ── Step 4: API /api/parameters contract ──────────────────────────
  {
    id: 'api-parameters-validation',
    name: 'API parameters: validatie grenzen',
    category: CAT,
    description: 'Controleert dat parameter-grenzen consistent zijn met API route',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // These are the validation bounds from app/api/parameters/route.ts
      // expected_return: 0.01 - 0.15
      // inflation_rate: 0 - 0.08
      // box3_method: 'forfaitair' | 'werkelijk'
      const validReturn = [0.01, 0.07, 0.15]
      for (const r of validReturn) {
        assert(!isNaN(r) && r >= 0.01 && r <= 0.15, `return ${r} within bounds`)
      }
      const validInflation = [0, 0.02, 0.08]
      for (const i of validInflation) {
        assert(!isNaN(i) && i >= 0 && i <= 0.08, `inflation ${i} within bounds`)
      }
      const validMethods = ['forfaitair', 'werkelijk']
      assert(validMethods.includes('forfaitair'), 'forfaitair valid')
      assert(validMethods.includes('werkelijk'), 'werkelijk valid')
      // resolveFireParams should handle all valid ranges
      const p1 = resolveFireParams({ expected_return: 0.01, inflation_rate: 0 })
      assertFinite(p1.effectiveSwr, 'min params finite')
      const p2 = resolveFireParams({ expected_return: 0.15, inflation_rate: 0.08 })
      assertFinite(p2.effectiveSwr, 'max params finite')
    },
  },

  // ── Step 5: API /api/withdrawal-strategy contract ─────────────────
  {
    id: 'api-withdrawal-strategy-contract',
    name: 'API withdrawal-strategy: contract validatie',
    category: CAT,
    description: 'Controleert dat alle 4 strategie-types en guardrail bounds geldig zijn',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // Valid strategies per API route
      const valid: WithdrawalStrategyType[] = ['static', 'guardrails', 'vpw', 'bucket']
      for (const s of valid) {
        const c = resolveWithdrawalStrategy({ withdrawal_strategy: s })
        assertEqual(c.strategy, s, `resolve ${s}`)
      }
      // Guardrail bounds from API: floor/ceiling 0.50-2.00, cutStep/raiseStep 0.01-0.50
      const minFloor = 0.50, maxFloor = 2.00
      const minStep = 0.01, maxStep = 0.50
      assert(WITHDRAWAL_DEFAULTS.guardrailFloor >= minFloor && WITHDRAWAL_DEFAULTS.guardrailFloor <= maxFloor,
        'default floor within API bounds')
      assert(WITHDRAWAL_DEFAULTS.guardrailCeiling >= minFloor && WITHDRAWAL_DEFAULTS.guardrailCeiling <= maxFloor,
        'default ceiling within API bounds')
      assert(WITHDRAWAL_DEFAULTS.guardrailCutStep >= minStep && WITHDRAWAL_DEFAULTS.guardrailCutStep <= maxStep,
        'default cutStep within API bounds')
      assert(WITHDRAWAL_DEFAULTS.guardrailRaiseStep >= minStep && WITHDRAWAL_DEFAULTS.guardrailRaiseStep <= maxStep,
        'default raiseStep within API bounds')
      // floor < ceiling invariant
      assert(WITHDRAWAL_DEFAULTS.guardrailFloor < WITHDRAWAL_DEFAULTS.guardrailCeiling,
        'floor < ceiling')
    },
  },

  // ── Step 6: Parameters effect op simulatie ─────────────────────────
  {
    id: 'params-affect-simulation-return',
    name: 'Hoger rendement → lagere FIRE leeftijd',
    category: CAT,
    description: 'Simulatie met hoger rendement geeft eerder FIRE dan lager rendement',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const lowReturn = runSim(0.04, 0.02)
      const highReturn = runSim(0.10, 0.02)
      assertNotNull(lowReturn.fireAge, 'lowReturn fireAge')
      assertNotNull(highReturn.fireAge, 'highReturn fireAge')
      assertLessThan(highReturn.fireAge!, lowReturn.fireAge!, 'hoger rendement → eerder FIRE')
    },
  },
  {
    id: 'params-affect-simulation-inflation',
    name: 'Hogere inflatie → hogere FIRE leeftijd',
    category: CAT,
    description: 'Simulatie met hogere inflatie geeft later FIRE door hogere reële uitgaven',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const lowInflation = runSim(0.07, 0.01)
      const highInflation = runSim(0.07, 0.05)
      assertNotNull(lowInflation.fireAge, 'lowInflation fireAge')
      assertNotNull(highInflation.fireAge, 'highInflation fireAge')
      assertGreaterThan(highInflation.fireAge!, lowInflation.fireAge!, 'hogere inflatie → later FIRE')
    },
  },
  {
    id: 'params-affect-simulation-consistency',
    name: 'resolveFireParams waarden consistent met simulatie input',
    category: CAT,
    description: 'Parameters uit resolveFireParams direct bruikbaar als simulatie input',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const profile = { expected_return: 0.08, inflation_rate: 0.025 }
      const params = resolveFireParams(profile)

      // Run simulation with resolved params
      const result = runSim(params.grossReturn, params.inflationRate)
      assertNotNull(result.fireAge, 'simulatie met resolved params heeft fireAge')
      assertFinite(result.fireAge!, 'fireAge is finite')
      assertFinite(result.requiredFirePortfolio, 'requiredFirePortfolio finite')
      assertGreaterThan(result.requiredFirePortfolio, 0, 'requiredFirePortfolio > 0')
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'De Horizon — Parameters',
    description: 'FIRE parameters, strategie-resolutie en effect op simulatie',
    icon: 'SlidersHorizontal',
    testCount: 0,
  })
  registerTests(tests)
}

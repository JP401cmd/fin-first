import { registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull, assertGreaterThan, assertLessThan, assertLessThanOrEqual, assertGreaterThanOrEqual, assertFinite } from '../assert'
import type { TestCase } from '../test-types'
import {
  applyWithdrawalStrategy, resolveWithdrawalStrategy, WITHDRAWAL_DEFAULTS,
  type WithdrawalStrategyConfig, type WithdrawalContext,
} from '@/lib/withdrawal-strategy'
import { type SimCashflow } from '@/lib/fire-simulation'
import { runScalarProjectionV2 as runSimulation } from '@/lib/horizon-engine/scalar-bridge'
import type { FireStrategyConfig } from '@/lib/fire-strategy'

const CAT = 'horizon.onttrekkingsstrategie'

function makeConfig(o?: Partial<WithdrawalStrategyConfig>): WithdrawalStrategyConfig {
  return { ...WITHDRAWAL_DEFAULTS, ...o }
}
function makeCtx(o?: Partial<WithdrawalContext>): WithdrawalContext {
  return {
    baseExpenses: 40_000, recurringIncome: 0, currentPortfolio: 1_000_000,
    startPortfolio: 1_000_000, previousWithdrawal: 40_000, yearReturn: 0.07,
    yearsIntoRetirement: 5, currentAge: 55, endAge: 90, ...o,
  }
}

const tests: TestCase[] = [
  {
    id: 'withdrawal-defaults', name: 'Standaard configuratie', category: CAT,
    description: 'resolveWithdrawalStrategy retourneert defaults voor leeg profiel',
    priority: 'critical', estimatedDurationMs: 10,
    fn() {
      const c = resolveWithdrawalStrategy({})
      assertEqual(c.strategy, 'static', 'strategy')
      assertEqual(c.guardrailFloor, 0.80, 'floor')
      assertEqual(c.guardrailCeiling, 1.20, 'ceiling')
    },
  },
  {
    id: 'withdrawal-static', name: 'Static strategie', category: CAT,
    description: 'Static onttrekking = baseExpenses - recurringIncome',
    priority: 'critical', estimatedDurationMs: 10,
    fn() {
      const w = applyWithdrawalStrategy(makeConfig({ strategy: 'static' }), makeCtx())
      assertEqual(w, 40_000, 'static withdrawal')
    },
  },
  {
    id: 'withdrawal-static-income', name: 'Static met inkomen', category: CAT,
    description: 'Recurring income verlaagt onttrekking',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const w = applyWithdrawalStrategy(makeConfig({ strategy: 'static' }), makeCtx({ recurringIncome: 15_000 }))
      assertEqual(w, 25_000, 'verminderd met inkomen')
    },
  },
  {
    id: 'withdrawal-guardrails-normal', name: 'Guardrails normaal', category: CAT,
    description: 'Binnen corridor = vorige onttrekking',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const w = applyWithdrawalStrategy(makeConfig({ strategy: 'guardrails' }), makeCtx())
      assertEqual(w, 40_000, 'unchanged within corridor')
    },
  },
  {
    id: 'withdrawal-guardrails-cut', name: 'Guardrails floor cut', category: CAT,
    description: 'Portfolio daling → onttrekking verlaagd met cutStep',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      // Portfolio dropped to 400K, so 40K/400K = 10% > ceiling 1.20 * initial rate
      const w = applyWithdrawalStrategy(
        makeConfig({ strategy: 'guardrails' }),
        makeCtx({ currentPortfolio: 400_000 }),
      )
      assertLessThan(w, 40_000, 'onttrekking verlaagd')
    },
  },
  {
    id: 'withdrawal-vpw', name: 'VPW strategie', category: CAT,
    description: 'VPW past aan op basis van portfolio en resterende jaren',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const w = applyWithdrawalStrategy(makeConfig({ strategy: 'vpw' }), makeCtx())
      assertGreaterThan(w, 0, 'positief')
      // VPW should vary with portfolio
      const w2 = applyWithdrawalStrategy(makeConfig({ strategy: 'vpw' }), makeCtx({ currentPortfolio: 2_000_000 }))
      assertGreaterThan(w2, w, 'hoger portfolio = hogere onttrekking')
    },
  },
  {
    id: 'withdrawal-bucket', name: 'Bucket strategie', category: CAT,
    description: 'Bucket combineert korte/lange termijn allocaties',
    priority: 'medium', estimatedDurationMs: 10,
    fn() {
      const w = applyWithdrawalStrategy(makeConfig({ strategy: 'bucket' }), makeCtx())
      assertGreaterThan(w, 0, 'positief')
    },
  },
  {
    id: 'withdrawal-floor-zero', name: 'Onttrekking niet negatief', category: CAT,
    description: 'Bij hoog recurring income wordt onttrekking 0, niet negatief',
    priority: 'medium', estimatedDurationMs: 10,
    fn() {
      const w = applyWithdrawalStrategy(makeConfig({ strategy: 'static' }), makeCtx({ recurringIncome: 50_000 }))
      assertGreaterThanOrEqual(w, 0, 'niet negatief')
    },
  },
  // ── FIRE-leeftijd verschil per onttrekkingsstrategie ──────────────────────
  {
    id: 'withdrawal-fire-age-differs', name: 'FIRE-leeftijd verschilt per strategie', category: CAT,
    description: 'Guardrails levert lagere vereiste portfolio op dan static → potentieel eerder FIRE',
    priority: 'critical', estimatedDurationMs: 300,
    fn() {
      const deplete: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }
      const rStatic = runSimulation(35, 90, 150_000, 36_000, 18_000, 0.07, 'nl_box3', 0.02, [], deplete, { ...WITHDRAWAL_DEFAULTS, strategy: 'static' })
      const rGuardrails = runSimulation(35, 90, 150_000, 36_000, 18_000, 0.07, 'nl_box3', 0.02, [], deplete, { ...WITHDRAWAL_DEFAULTS, strategy: 'guardrails' })

      assert(rStatic.fireReachable, 'static bereikbaar')
      assert(rGuardrails.fireReachable, 'guardrails bereikbaar')
      // Guardrails should need less or equal portfolio (flexible withdrawal)
      assertLessThanOrEqual(rGuardrails.requiredFirePortfolio, rStatic.requiredFirePortfolio, 'guardrails ≤ static portfolio')
      assertLessThanOrEqual(rGuardrails.fireAge!, rStatic.fireAge!, 'guardrails fireAge ≤ static')
    },
  },
  {
    id: 'withdrawal-fire-age-vpw-valid', name: 'VPW FIRE-leeftijd geldig', category: CAT,
    description: 'VPW+deplete convergeert en levert geldige resultaten',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      const deplete: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }
      const r = runSimulation(35, 90, 150_000, 36_000, 18_000, 0.07, 'nl_box3', 0.02, [], deplete, { ...WITHDRAWAL_DEFAULTS, strategy: 'vpw' })
      assert(r.fireReachable, 'VPW+deplete bereikbaar')
      assertNotNull(r.fireAge, 'fireAge niet null')
      for (const row of r.rows) {
        assertFinite(row.withdrawal, `row ${row.age} withdrawal`)
        assertFinite(row.endPortfolio, `row ${row.age} endPortfolio`)
      }
    },
  },
  {
    id: 'withdrawal-fire-age-all-strategies', name: 'Alle strategieën convergeren', category: CAT,
    description: 'static/guardrails/vpw/bucket × deplete leveren allemaal een geldig resultaat',
    priority: 'high', estimatedDurationMs: 400,
    fn() {
      const deplete: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }
      const strategies: WithdrawalStrategyConfig[] = [
        { ...WITHDRAWAL_DEFAULTS, strategy: 'static' },
        { ...WITHDRAWAL_DEFAULTS, strategy: 'guardrails' },
        { ...WITHDRAWAL_DEFAULTS, strategy: 'vpw' },
        { ...WITHDRAWAL_DEFAULTS, strategy: 'bucket' },
      ]
      for (const ws of strategies) {
        const r = runSimulation(35, 90, 150_000, 36_000, 18_000, 0.07, 'nl_box3', 0.02, [], deplete, ws)
        assert(r.fireReachable, `${ws.strategy} bereikbaar`)
        assertNotNull(r.fireAge, `${ws.strategy} fireAge`)
        assertGreaterThan(r.requiredFirePortfolio, 0, `${ws.strategy} required > 0`)
      }
    },
  },
]

export function register(): void {
  registerTests(tests)
}

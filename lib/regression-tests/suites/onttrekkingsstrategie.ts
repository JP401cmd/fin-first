import { registerTests } from '../test-registry'
import { assert, assertEqual, assertGreaterThan, assertLessThan, assertLessThanOrEqual, assertGreaterThanOrEqual } from '../assert'
import type { TestCase } from '../test-types'
import {
  applyWithdrawalStrategy, resolveWithdrawalStrategy, WITHDRAWAL_DEFAULTS,
  type WithdrawalStrategyConfig, type WithdrawalContext,
} from '@/lib/withdrawal-strategy'

const CAT = 'onttrekkingsstrategie'

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
]

export function register(): void {
  registerTests(tests)
}

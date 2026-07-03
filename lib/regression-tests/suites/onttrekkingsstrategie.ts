import { registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull, assertGreaterThan, assertLessThan, assertLessThanOrEqual, assertGreaterThanOrEqual, assertFinite } from '../assert'
import type { TestCase } from '../test-types'
import {
  applyWithdrawalStrategy, resolveWithdrawalStrategy, WITHDRAWAL_DEFAULTS,
  type WithdrawalStrategyConfig, type WithdrawalContext,
} from '@/lib/withdrawal-strategy'
import { type SimCashflow } from '@/lib/fire-simulation'
import { runScalarProjectionV2 as runSimulation } from './_kernel-sim'
import type { FireStrategyConfig } from '@/lib/fire-strategy'

const CAT = 'horizon.onttrekkingsstrategie'

function makeConfig(o?: Partial<WithdrawalStrategyConfig>): WithdrawalStrategyConfig {
  return { ...WITHDRAWAL_DEFAULTS, ...o }
}

/**
 * 'vpw'/'bucket' bestaan niet meer in `WithdrawalStrategyType` (remote-migratie
 * 20260703115225 voegde ze samen tot 'static') — beide functies vallen voor een
 * onbekende strategie-string terug op static-gedrag (`applyWithdrawalStrategy`'s
 * `default`-tak resp. `resolveWithdrawalStrategy`'s validStrategies-guard). Deze
 * cast simuleert een STALE profiel/config-waarde van vóór die migratie zodat de
 * fallback-regressie gedekt blijft (geen crash, gedraagt zich als static).
 */
function legacyConfig(strategy: string, o?: Partial<WithdrawalStrategyConfig>): WithdrawalStrategyConfig {
  return { ...WITHDRAWAL_DEFAULTS, ...o, strategy: strategy as WithdrawalStrategyConfig['strategy'] }
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
    id: 'withdrawal-vpw', name: 'VPW strategie (legacy-string valt terug op static)', category: CAT,
    description: 'Stale profiel-waarde "vpw" (vóór de static/guardrails-migratie) crasht niet en gedraagt zich als static: portfolio-onafhankelijk zonder endStrategy',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const w = applyWithdrawalStrategy(legacyConfig('vpw'), makeCtx())
      assertGreaterThan(w, 0, 'positief')
      // 'vpw' bestaat niet meer → default-tak van applyWithdrawalStrategy = applyStatic;
      // zonder ctx.endStrategy is dat netBaseExpenses, dus portfolio-ONAFHANKELIJK
      // (was vóór de migratie portfolio-afhankelijk — dat gedrag is verdwenen).
      const w2 = applyWithdrawalStrategy(legacyConfig('vpw'), makeCtx({ currentPortfolio: 2_000_000 }))
      assertEqual(w2, w, 'legacy "vpw" is nu portfolio-onafhankelijk (= static-gedrag)')
    },
  },
  {
    id: 'withdrawal-bucket', name: 'Bucket strategie (legacy-string valt terug op static)', category: CAT,
    description: 'Stale profiel-waarde "bucket" crasht niet en levert een positieve, static-gelijke onttrekking',
    priority: 'medium', estimatedDurationMs: 10,
    fn() {
      const w = applyWithdrawalStrategy(legacyConfig('bucket'), makeCtx())
      assertGreaterThan(w, 0, 'positief')
      assertEqual(w, applyWithdrawalStrategy(makeConfig({ strategy: 'static' }), makeCtx()), 'legacy "bucket" == static')
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
    id: 'withdrawal-fire-age-vpw-valid', name: 'Legacy "vpw"-string FIRE-leeftijd geldig', category: CAT,
    description: 'Stale profiel-waarde "vpw"+deplete valt terug op static-onttrekking en convergeert alsnog naar een geldig resultaat',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      const deplete: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }
      const r = runSimulation(35, 90, 150_000, 36_000, 18_000, 0.07, 'nl_box3', 0.02, [], deplete, legacyConfig('vpw'))
      assert(r.fireReachable, 'legacy "vpw"+deplete bereikbaar')
      assertNotNull(r.fireAge, 'fireAge niet null')
      for (const row of r.rows) {
        assertFinite(row.withdrawal, `row ${row.age} withdrawal`)
        assertFinite(row.endPortfolio, `row ${row.age} endPortfolio`)
      }
    },
  },
  {
    id: 'withdrawal-fire-age-all-strategies', name: 'Alle strategieën (+ legacy vpw/bucket-strings) convergeren', category: CAT,
    description: 'static/guardrails × deplete leveren een geldig resultaat; stale "vpw"/"bucket"-strings vallen terug op static en convergeren evengoed',
    priority: 'high', estimatedDurationMs: 400,
    fn() {
      const deplete: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }
      const strategies: WithdrawalStrategyConfig[] = [
        { ...WITHDRAWAL_DEFAULTS, strategy: 'static' },
        { ...WITHDRAWAL_DEFAULTS, strategy: 'guardrails' },
        legacyConfig('vpw'),
        legacyConfig('bucket'),
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

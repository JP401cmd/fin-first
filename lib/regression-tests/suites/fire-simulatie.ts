import { registerTests } from '../test-registry'
import {
  assert, assertEqual, assertNotNull, assertGreaterThan,
  assertGreaterThanOrEqual, assertLessThan, assertLessThanOrEqual,
  assertFinite, assertType,
} from '../assert'
import type { TestCase } from '../test-types'
import {
  runSimulation,
  lifeEventsToCashflows,
  type SimCashflow,
  type SimResult,
} from '@/lib/fire-simulation'
import { type FireStrategyConfig } from '@/lib/fire-strategy'
import { NL_AOW_MONTHLY } from '@/lib/constants'
import { NIBUD_CHILDREN_MONTHLY_COST, type LifeEvent } from '@/lib/horizon-data'

const CAT = 'fire-simulatie'

const STANDARD = {
  currentAge: 35, endAge: 90, currentPortfolio: 150_000,
  yearlyExpenses: 36_000, annualSavings: 18_000, grossReturn: 0.07,
  returnModel: 'nl_box3' as const, inflation: 0.02,
}

function runStd(
  overrides: Partial<typeof STANDARD> = {},
  cashflows: SimCashflow[] = [],
  strategy?: FireStrategyConfig,
): SimResult {
  const s = { ...STANDARD, ...overrides }
  return runSimulation(s.currentAge, s.endAge, s.currentPortfolio, s.yearlyExpenses, s.annualSavings, s.grossReturn, s.returnModel, s.inflation, cashflows, strategy)
}

function makeEvent(partial: Partial<LifeEvent>): LifeEvent {
  return {
    id: 'test-1', name: 'Test event', event_type: 'custom',
    target_age: null, target_date: null, one_time_cost: 0,
    monthly_cost_change: 0, monthly_income_change: 0, duration_months: 0,
    icon: '📋', is_active: true, sort_order: 0, is_indexed: true,
    ...partial,
  }
}

const tests: TestCase[] = [
  {
    id: 'fire-sim-setup', name: 'SimResult velden validatie', category: CAT,
    description: 'Controleert of runSimulation alle vereiste velden retourneert',
    priority: 'critical', estimatedDurationMs: 50,
    fn() {
      const r = runStd()
      assertType(r.rows, 'object', 'rows is array')
      assert(Array.isArray(r.rows), 'rows is array')
      assertGreaterThan(r.rows.length, 0, 'rows count')
      for (const row of r.rows) {
        assert(row.phase === 'accumulation' || row.phase === 'retirement', `phase: ${row.phase}`)
      }
    },
  },
  {
    id: 'fire-sim-deplete', name: 'Deplete strategie', category: CAT,
    description: 'Deplete eindigt portfolio bij ~€0',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const r = runStd({}, [], { strategy: 'deplete', endAge: 90, legacyAmount: 0 })
      assert(r.fireReachable, 'FIRE bereikbaar')
      const last = r.rows[r.rows.length - 1]
      assertLessThanOrEqual(Math.abs(last.endPortfolio), 500, 'endPortfolio ~0')
    },
  },
  {
    id: 'fire-sim-legacy', name: 'Legacy strategie', category: CAT,
    description: 'Legacy behoudt geïndexeerd bedrag op einddatum',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const legacy = 200_000
      const r = runStd({}, [], { strategy: 'legacy', endAge: 90, legacyAmount: legacy })
      assert(r.fireReachable, 'FIRE bereikbaar')
      const indexed = legacy * Math.pow(1 + STANDARD.inflation, STANDARD.endAge - STANDARD.currentAge)
      const last = r.rows[r.rows.length - 1]
      assertLessThanOrEqual(Math.abs(last.endPortfolio - Math.round(indexed)), 1000, 'legacy bedrag')
      const dep = runStd({}, [], { strategy: 'deplete', endAge: 90, legacyAmount: 0 })
      assertGreaterThan(r.requiredFirePortfolio, dep.requiredFirePortfolio, 'legacy > deplete portfolio')
    },
  },
  {
    id: 'fire-sim-perpetual', name: 'Perpetual strategie', category: CAT,
    description: 'Perpetual overleeft onbeperkt',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const r = runStd({}, [], { strategy: 'perpetual', endAge: 90, legacyAmount: 0 })
      assert(r.fireReachable, 'FIRE bereikbaar')
      const last = r.rows[r.rows.length - 1]
      assertGreaterThan(last.endPortfolio, 0, 'portfolio positief')
      assertEqual(r.displayEndAge, 90, 'displayEndAge')
    },
  },
  {
    id: 'fire-sim-ordering', name: 'Strategie volgorde', category: CAT,
    description: 'deplete < legacy < perpetual portfolio vereiste',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      const dep = runStd({}, [], { strategy: 'deplete', endAge: 90, legacyAmount: 0 })
      const leg = runStd({}, [], { strategy: 'legacy', endAge: 90, legacyAmount: 200_000 })
      const perp = runStd({}, [], { strategy: 'perpetual', endAge: 90, legacyAmount: 0 })
      assertLessThan(dep.requiredFirePortfolio, leg.requiredFirePortfolio, 'dep < leg')
      assertLessThan(leg.requiredFirePortfolio, perp.requiredFirePortfolio, 'leg < perp')
    },
  },
  {
    id: 'fire-sim-fireage', name: 'FIRE leeftijd basis', category: CAT,
    description: 'fireAge en fireAgeFractional correct berekend',
    priority: 'critical', estimatedDurationMs: 50,
    fn() {
      const r = runStd()
      assert(r.fireReachable, 'FIRE bereikbaar')
      assertNotNull(r.fireAge)
      assertNotNull(r.fireAgeFractional)
      assertGreaterThanOrEqual(r.fireAge, STANDARD.currentAge, 'fireAge >= currentAge')
      assertLessThan(r.fireAge, STANDARD.endAge, 'fireAge < endAge')
    },
  },
  {
    id: 'fire-sim-unreachable', name: 'FIRE onbereikbaar', category: CAT,
    description: 'Geen portfolio en geen savings = onbereikbaar',
    priority: 'high', estimatedDurationMs: 50,
    fn() {
      const r = runStd({ currentPortfolio: 0, annualSavings: 0, yearlyExpenses: 60_000 })
      assert(!r.fireReachable, 'FIRE onbereikbaar')
      assertEqual(r.fireAge, null, 'fireAge null')
    },
  },
  {
    id: 'fire-sim-sensitivity', name: 'Parameter gevoeligheid', category: CAT,
    description: 'Hoger rendement/sparen → lagere FIRE leeftijd, hogere uitgaven → hogere',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      const base = runStd().fireAge!
      assertLessThan(runStd({ grossReturn: 0.09 }).fireAge!, base, 'hoger rendement')
      assertGreaterThan(runStd({ yearlyExpenses: 48_000 }).fireAge!, base, 'hogere uitgaven')
      assertLessThan(runStd({ annualSavings: 30_000 }).fireAge!, base, 'meer sparen')
    },
  },
  {
    id: 'fire-sim-metrics', name: 'Portfolio metrics', category: CAT,
    description: 'implicitWithdrawalRate en classic25xTarget consistent',
    priority: 'medium', estimatedDurationMs: 50,
    fn() {
      const r = runStd()
      assertEqual(r.classic25xTarget, STANDARD.yearlyExpenses * 25, '25x target')
      const expectedRate = STANDARD.yearlyExpenses / r.requiredFirePortfolio
      assertLessThan(Math.abs(r.implicitWithdrawalRate - expectedRate), 0.001, 'withdrawal rate')
    },
  },
  {
    id: 'fire-sim-aow', name: 'AOW cashflow', category: CAT,
    description: 'AOW verlaagt onttrekking na 67',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const cf: SimCashflow = { id: 'aow', name: 'AOW', type: 'recurring', direction: 'income', amount: NL_AOW_MONTHLY, fromAge: 67, toAge: null, indexed: true }
      const r = runStd({}, [cf])
      assert(r.fireReachable, 'bereikbaar')
      const retRows = r.rows.filter(row => row.phase === 'retirement')
      const post = retRows.filter(row => row.age >= 67)
      if (post.length > 0) assertGreaterThan(post[0].cashflowNet, 0, 'cashflow na AOW')
    },
  },
  {
    id: 'fire-sim-children', name: 'NIBUD kinderfases', category: CAT,
    description: 'Kindevent genereert 3 NIBUD fases',
    priority: 'medium', estimatedDurationMs: 50,
    fn() {
      const ev = makeEvent({ id: 'child-1', name: 'Kind', event_type: 'children', target_age: 35, metadata: { aantalKinderen: 1, kinderbijslag: false, kinderopvangDagen: 0 } })
      const cfs = lifeEventsToCashflows([ev])
      const baby = cfs.find(c => c.name.includes('baby'))
      const basis = cfs.find(c => c.name.includes('basisschool'))
      const tiener = cfs.find(c => c.name.includes('tiener'))
      assertNotNull(baby, 'baby fase')
      assertNotNull(basis, 'basisschool fase')
      assertNotNull(tiener, 'tiener fase')
      const base = NIBUD_CHILDREN_MONTHLY_COST[1]!
      assertEqual(baby.amount, Math.round(base * 1.2), 'baby bedrag')
      assertEqual(basis.amount, Math.round(base * 1.0), 'basisschool bedrag')
      assertEqual(tiener.amount, Math.round(base * 1.3), 'tiener bedrag')
    },
  },
  {
    id: 'fire-sim-combined', name: 'Gecombineerde cashflows', category: CAT,
    description: 'Meerdere events produceren valide resultaten zonder NaN/Infinity',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      const cfs: SimCashflow[] = [
        { id: 'aow', name: 'AOW', type: 'recurring', direction: 'income', amount: NL_AOW_MONTHLY, fromAge: 67, toAge: null, indexed: true },
        { id: 'pension', name: 'Pensioen', type: 'recurring', direction: 'income', amount: 800, fromAge: 65, toAge: null, indexed: true },
        { id: 'child', name: 'Kind', type: 'recurring', direction: 'expense', amount: 500, fromAge: 37, toAge: 55, indexed: true },
        { id: 'erfenis', name: 'Erfenis', type: 'one_time', direction: 'income', amount: 100_000, fromAge: 50, toAge: 50, indexed: false },
      ]
      const r = runStd({}, cfs)
      assert(r.fireReachable, 'bereikbaar')
      for (const row of r.rows) {
        assertFinite(row.startPortfolio, `row ${row.age} start`)
        assertFinite(row.endPortfolio, `row ${row.age} end`)
        assertFinite(row.cashflowNet, `row ${row.age} cf`)
      }
    },
  },
  {
    id: 'fire-sim-empty-cf', name: 'Lege cashflows', category: CAT,
    description: 'Lege cashflows = zelfde resultaat als baseline',
    priority: 'low', estimatedDurationMs: 100,
    fn() {
      const withEmpty = runStd({}, [])
      const base = runStd()
      assertEqual(withEmpty.fireAge, base.fireAge, 'fireAge')
      assertEqual(withEmpty.rows.length, base.rows.length, 'rows length')
    },
  },
  {
    id: 'fire-sim-order', name: 'Cashflow volgorde-onafhankelijk', category: CAT,
    description: 'Cashflow volgorde beïnvloedt resultaat niet',
    priority: 'medium', estimatedDurationMs: 200,
    fn() {
      const cfs: SimCashflow[] = [
        { id: 'aow', name: 'AOW', type: 'recurring', direction: 'income', amount: NL_AOW_MONTHLY, fromAge: 67, toAge: null, indexed: true },
        { id: 'pension', name: 'Pensioen', type: 'recurring', direction: 'income', amount: 1200, fromAge: 65, toAge: null, indexed: true },
        { id: 'erfenis', name: 'Erfenis', type: 'one_time', direction: 'income', amount: 50_000, fromAge: 52, toAge: 52, indexed: false },
      ]
      const fwd = runStd({}, cfs)
      const rev = runStd({}, [...cfs].reverse())
      assertEqual(fwd.fireAge, rev.fireAge, 'fireAge')
      assertEqual(fwd.rows.length, rev.rows.length, 'rows')
    },
  },
]

export function register(): void {
  registerTests(tests)
}

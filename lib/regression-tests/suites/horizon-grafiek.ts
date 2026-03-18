import { registerTests } from '../test-registry'
import {
  assert, assertEqual, assertNotNull, assertGreaterThan,
  assertGreaterThanOrEqual, assertLessThan, assertLessThanOrEqual,
  assertType,
} from '../assert'
import type { TestCase } from '../test-types'
import {
  computeFireProjection, computeFireRange, ageAtDate,
} from '@/lib/horizon-data'
import type { FinancialInput } from '@/lib/core-metrics'
import { runSimulation, type SimCashflow } from '@/lib/fire-simulation'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { resolveFireParams } from '@/lib/fire-params'
import { BOX3_DRAG } from '@/lib/constants'

const CAT = 'horizon-grafiek'

const INPUT: FinancialInput = {
  totalAssets: 500_000, totalDebts: 0, monthlyIncome: 5_000,
  monthlyExpenses: 3_333, yearlyMustExpenses: 0, monthlyContributions: 1_667,
  dateOfBirth: '1991-03-18',
}

const SIM = {
  currentAge: 35, endAge: 90, currentPortfolio: 500_000,
  yearlyExpenses: 40_000, annualSavings: 20_000, grossReturn: 0.07,
  returnModel: 'nl_box3' as const, inflation: 0.02,
}

function runSim(o: Partial<typeof SIM> = {}, cf: SimCashflow[] = [], st?: FireStrategyConfig) {
  const s = { ...SIM, ...o }
  return runSimulation(s.currentAge, s.endAge, s.currentPortfolio, s.yearlyExpenses, s.annualSavings, s.grossReturn, s.returnModel, s.inflation, cf, st)
}

const tests: TestCase[] = [
  {
    id: 'horizon-fire-age', name: 'FIRE leeftijd basis', category: CAT,
    description: 'computeFireProjection berekent fireAge met fireTarget ≥ 25x',
    priority: 'critical', estimatedDurationMs: 50,
    fn() {
      const r = computeFireProjection(INPUT)
      assertNotNull(r.fireAge)
      assertType(r.fireAge, 'number')
      assertGreaterThanOrEqual(r.fireTarget, INPUT.monthlyExpenses * 12 * 25, 'target ≥ 25x')
    },
  },
  {
    id: 'horizon-range', name: 'FIRE range volgorde', category: CAT,
    description: 'optimistic < expected < pessimistic',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const range = computeFireRange(INPUT)
      assertNotNull(range.optimistic.fireAge)
      assertNotNull(range.expected.fireAge)
      assertNotNull(range.pessimistic.fireAge)
      assertLessThan(range.optimistic.fireAge!, range.expected.fireAge!, 'opt < exp')
      assertLessThan(range.expected.fireAge!, range.pessimistic.fireAge!, 'exp < pess')
    },
  },
  {
    id: 'horizon-deplete', name: 'Deplete eindigt bij ~€0', category: CAT,
    description: 'Deplete strategie in runSimulation',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runSim({}, [], { strategy: 'deplete', endAge: 90, legacyAmount: 0 })
      assert(r.fireReachable, 'bereikbaar')
      const last = r.rows[r.rows.length - 1]
      assertLessThanOrEqual(Math.abs(last.endPortfolio), 5_000, 'near zero')
    },
  },
  {
    id: 'horizon-perpetual', name: 'Perpetual overleeft', category: CAT,
    description: 'Portfolio blijft positief',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const r = runSim({}, [], { strategy: 'perpetual', endAge: 90, legacyAmount: 0 })
      assert(r.fireReachable, 'bereikbaar')
      assertGreaterThan(r.rows[r.rows.length - 1].endPortfolio, 0, 'positief')
    },
  },
  {
    id: 'horizon-legacy', name: 'Legacy behoudt ≥€200K', category: CAT,
    description: 'Legacy strategie behoudt geïndexeerd nalatenschap',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      const r = runSim({}, [], { strategy: 'legacy', endAge: 90, legacyAmount: 200_000 })
      assert(r.fireReachable, 'bereikbaar')
      assertGreaterThanOrEqual(r.rows[r.rows.length - 1].endPortfolio, 200_000, 'legacy behouden')
    },
  },
  {
    id: 'horizon-life-events', name: 'AOW + pensioen verlaagt FIRE', category: CAT,
    description: 'Inkomsten events verlagen FIRE leeftijd',
    priority: 'high', estimatedDurationMs: 200,
    fn() {
      const cfs: SimCashflow[] = [
        { id: 'aow', name: 'AOW', type: 'recurring', direction: 'income', amount: 1250, fromAge: 67, toAge: null, indexed: true },
        { id: 'pension', name: 'Pensioen', type: 'recurring', direction: 'income', amount: 1667, fromAge: 68, toAge: null, indexed: true },
      ]
      const with_ = runSim({}, cfs)
      const base = runSim()
      assert(with_.fireReachable && base.fireReachable, 'beide bereikbaar')
      assertLessThanOrEqual(with_.fireAge!, base.fireAge!, 'lager met events')
    },
  },
  {
    id: 'horizon-expense-event', name: 'Eenmalige kosten verhoogt FIRE', category: CAT,
    description: 'Verbouwingskosten verhogen FIRE leeftijd',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      const cfs: SimCashflow[] = [
        { id: 'verbouwing', name: 'Verbouwing', type: 'one_time', direction: 'expense', amount: 50_000, fromAge: 50, toAge: 50, indexed: false },
      ]
      const r = runSim({}, cfs)
      const base = runSim()
      assertGreaterThanOrEqual(r.fireAge!, base.fireAge!, 'hogere FIRE leeftijd')
      const row50 = r.rows.find(row => row.age === 50)
      assertNotNull(row50)
      assertLessThan(row50.cashflowNet, 0, 'negatieve cashflow at 50')
    },
  },
  {
    id: 'horizon-portfolio-consistency', name: 'Portfolio consistentie', category: CAT,
    description: 'firePortfolioAtFire ≥ requiredFirePortfolio',
    priority: 'critical', estimatedDurationMs: 50,
    fn() {
      const r = runSim()
      assert(r.fireReachable, 'bereikbaar')
      assertGreaterThanOrEqual(r.firePortfolioAtFire, r.requiredFirePortfolio, 'portfolio ≥ vereist')
    },
  },
  {
    id: 'horizon-params', name: 'FIRE parameters doorwerking', category: CAT,
    description: 'resolveFireParams + hoger rendement → lager fireAge',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const p = resolveFireParams({ expected_return: 0.08, inflation_rate: 0.03 })
      assertEqual(p.grossReturn, 0.08, 'grossReturn')
      assertEqual(p.inflationRate, 0.03, 'inflationRate')
      const expectedSwr = 0.08 - BOX3_DRAG - 0.03
      assertLessThan(Math.abs(p.effectiveSwr - expectedSwr), 0.0001, 'SWR')
      const high = computeFireProjection(INPUT, 0.10)
      const low = computeFireProjection(INPUT, 0.05)
      assertNotNull(high.fireAge)
      assertNotNull(low.fireAge)
      assertLessThan(high.fireAge!, low.fireAge!, 'hoger rendement = lager age')
    },
  },
  {
    id: 'horizon-unreachable', name: 'FIRE onbereikbaar', category: CAT,
    description: 'Negatieve spaarquote → null fireAge',
    priority: 'medium', estimatedDurationMs: 50,
    fn() {
      const r = computeFireProjection({ ...INPUT, totalAssets: 0, monthlyContributions: 0, monthlyExpenses: 3_000, monthlyIncome: 2_000 })
      assertEqual(r.fireAge, null, 'fireAge null')
    },
  },
  {
    id: 'horizon-already-fire', name: 'Al FIRE bereikt', category: CAT,
    description: '€2M vermogen → fireDate "Bereikt!"',
    priority: 'medium', estimatedDurationMs: 50,
    fn() {
      const r = computeFireProjection({ ...INPUT, totalAssets: 2_000_000 })
      assertEqual(r.fireDate, 'Bereikt!', 'fireDate')
      assertNotNull(r.fireAge)
      const age = ageAtDate('1991-03-18')
      assertEqual(r.fireAge, age, 'fireAge = huidige leeftijd')
    },
  },
]

export function register(): void {
  registerTests(tests)
}

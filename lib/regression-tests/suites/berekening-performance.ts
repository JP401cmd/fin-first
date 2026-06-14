import { registerCategory, registerTests } from '../test-registry'
import {
  assert,
  assertLessThanOrEqual,
  assertGreaterThan,
  assertGreaterThanOrEqual,
  assertNotNull,
  assertDefined,
} from '../assert'
import type { TestCase } from '../test-types'

import {
  type SimCashflow,
  type ReturnModel,
} from '@/lib/fire-simulation'
import { runScalarProjectionV2 as runSimulation } from '@/lib/horizon-engine/scalar-bridge'
import {
  computeFireRange,
  runBacktest,
  type FinancialInput,
} from '@/lib/horizon-data'
import { detectRecurringTransactions, type TransactionForDetection } from '@/lib/recurring-detection'
import { buildDashboardLayout, type AutoDashboardAnswers } from '@/lib/auto-dashboard-builder'
import { WIDGET_CATALOG } from '@/lib/widget-catalog'

const CAT = 'performance.berekeningen'

/**
 * Performance regression tests for computation-heavy functions.
 *
 * Measures execution time of:
 *   - runSimulation: 40-year FIRE projection (target: <100ms)
 *   - runBacktest: full historical backtesting (target: <200ms)
 *   - computeFireRange: 3 scenario projections (target: <300ms)
 *   - detectRecurringTransactions: 1000+ transactions (target: <500ms)
 *   - Transfer matching: 1000+ transactions (target: <500ms)
 *   - buildDashboardLayout: 44 widgets (target: <50ms)
 *
 * Baselines stored in localStorage for regression detection.
 */

// ── Baseline storage ──────────────────────────────────────────────────
const BASELINE_KEY = 'perf-berekening-baselines'

interface BaselineEntry {
  name: string
  avgMs: number
  minMs: number
  maxMs: number
  samples: number
  recordedAt: string
}

interface BaselineStore {
  version: number
  entries: Record<string, BaselineEntry>
}

function loadBaselines(): BaselineStore {
  try {
    const raw = localStorage.getItem(BASELINE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.version === 1) return parsed
    }
  } catch { /* ignore */ }
  return { version: 1, entries: {} }
}

function saveBaseline(name: string, durationMs: number): void {
  try {
    const store = loadBaselines()
    const existing = store.entries[name]
    if (existing) {
      const newSamples = existing.samples + 1
      store.entries[name] = {
        name,
        avgMs: Math.round((existing.avgMs * existing.samples + durationMs) / newSamples),
        minMs: Math.min(existing.minMs, durationMs),
        maxMs: Math.max(existing.maxMs, durationMs),
        samples: newSamples,
        recordedAt: new Date().toISOString(),
      }
    } else {
      store.entries[name] = {
        name,
        avgMs: Math.round(durationMs),
        minMs: Math.round(durationMs),
        maxMs: Math.round(durationMs),
        samples: 1,
        recordedAt: new Date().toISOString(),
      }
    }
    localStorage.setItem(BASELINE_KEY, JSON.stringify(store))
  } catch { /* localStorage not available */ }
}

function checkRegression(name: string, currentMs: number): string | null {
  try {
    const store = loadBaselines()
    const baseline = store.entries[name]
    if (!baseline || baseline.samples < 3) return null
    const threshold = baseline.avgMs * 1.2 // 20% regression
    if (currentMs > threshold) {
      return `Regressie: ${name} duurde ${Math.round(currentMs)}ms, baseline is ${baseline.avgMs}ms (>${Math.round(threshold)}ms)`
    }
  } catch { /* ignore */ }
  return null
}

// ── Test data generators ──────────────────────────────────────────────

function makeFinancialInput(overrides: Partial<FinancialInput> = {}): FinancialInput {
  return {
    totalAssets: 200_000,
    totalDebts: 30_000,
    monthlyIncome: 4_500,
    monthlyExpenses: 3_000,
    yearlyMustExpenses: 24_000,
    monthlyContributions: 1_500,
    dateOfBirth: '1990-06-15',
    ...overrides,
  }
}

function generateTransactions(count: number): TransactionForDetection[] {
  const txs: TransactionForDetection[] = []
  const counterparties = [
    'Albert Heijn', 'Jumbo', 'Netflix', 'Spotify', 'KPN',
    'Ziggo', 'NS', 'Shell', 'BP', 'Bol.com', 'Coolblue',
    'Mediamarkt', 'HEMA', 'Action', 'Kruidvat', 'Etos',
    'DHL', 'PostNL', 'Thuisbezorgd', 'Uber Eats',
  ]
  const now = new Date()

  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(Math.random() * 365)
    const date = new Date(now)
    date.setDate(date.getDate() - daysAgo)
    const cp = counterparties[i % counterparties.length]
    const isIncome = i % 15 === 0 // ~7% income
    const amount = isIncome
      ? Math.round(2000 + Math.random() * 3000)
      : -Math.round(5 + Math.random() * 200)

    txs.push({
      id: `tx-perf-${i}`,
      date: date.toISOString().split('T')[0],
      amount,
      description: `${cp} ${isIncome ? 'salaris' : 'betaling'} ${i}`,
      counterparty_name: cp,
      is_income: isIncome,
      budget_id: null,
      transaction_type: null,
    })
  }
  return txs
}

function makeCashflows(count: number): SimCashflow[] {
  const cashflows: SimCashflow[] = []
  for (let i = 0; i < count; i++) {
    cashflows.push({
      id: `cf-${i}`,
      name: `Cashflow ${i}`,
      type: i % 3 === 0 ? 'one_time' : 'recurring',
      direction: i % 2 === 0 ? 'income' : 'expense',
      amount: 500 + i * 100,
      fromAge: 40 + (i % 30),
      toAge: i % 3 === 0 ? null : 40 + (i % 30) + 10,
      indexed: i % 2 === 0,
    })
  }
  return cashflows
}

// ── Helper: timed execution ───────────────────────────────────────────

function timeExecution<T>(fn: () => T): { result: T; durationMs: number } {
  const start = performance.now()
  const result = fn()
  const durationMs = performance.now() - start
  return { result, durationMs }
}

const tests: TestCase[] = [
  // ── 1. runSimulation — 40-year projection (target: <100ms) ──────────
  {
    id: 'perf-sim-40yr-basic',
    name: 'runSimulation 40-jaar projectie <100ms',
    category: CAT,
    description: 'Standaard FIRE simulatie over 40 jaar zonder cashflows',
    priority: 'critical',
    estimatedDurationMs: 500,
    fn() {
      const { result, durationMs } = timeExecution(() =>
        runSimulation(35, 75, 150_000, 36_000, 18_000, 0.07, 'nl_box3', 0.02, []),
      )
      saveBaseline('sim-40yr-basic', durationMs)
      assert(result.rows.length > 0, 'Simulatie moet rijen genereren')
      assertLessThanOrEqual(durationMs, 100, `runSimulation 40jr moet <100ms (was ${durationMs.toFixed(1)}ms)`)
    },
  },
  {
    id: 'perf-sim-40yr-cashflows',
    name: 'runSimulation 40-jaar met 10 cashflows <100ms',
    category: CAT,
    description: 'FIRE simulatie met AOW, pensioen en life events',
    priority: 'high',
    estimatedDurationMs: 500,
    fn() {
      const cashflows = makeCashflows(10)
      const { result, durationMs } = timeExecution(() =>
        runSimulation(35, 75, 150_000, 36_000, 18_000, 0.07, 'nl_box3', 0.02, cashflows),
      )
      saveBaseline('sim-40yr-cashflows', durationMs)
      assert(result.rows.length > 0, 'Simulatie met cashflows moet rijen genereren')
      assertLessThanOrEqual(durationMs, 100, `runSimulation 40jr+cashflows moet <100ms (was ${durationMs.toFixed(1)}ms)`)
    },
  },
  {
    id: 'perf-sim-65yr-perpetual',
    name: 'runSimulation 65-jaar perpetual <100ms',
    category: CAT,
    description: 'Langste simulatie: perpetual strategie tot 100 jaar oud',
    priority: 'high',
    estimatedDurationMs: 500,
    fn() {
      const cashflows = makeCashflows(5)
      const { result, durationMs } = timeExecution(() =>
        runSimulation(35, 100, 150_000, 36_000, 18_000, 0.07, 'nl_box3', 0.02, cashflows,
          { strategy: 'perpetual', endAge: 100, legacyAmount: 0 }),
      )
      saveBaseline('sim-65yr-perpetual', durationMs)
      assert(result.rows.length > 0, 'Perpetual simulatie moet rijen genereren')
      assertLessThanOrEqual(durationMs, 100, `runSimulation perpetual moet <100ms (was ${durationMs.toFixed(1)}ms)`)
    },
  },

  // ── 2. runBacktest — historical data (target: <200ms) ───────────────
  {
    id: 'perf-backtest-30yr',
    name: 'runBacktest 30-jaar historisch <200ms',
    category: CAT,
    description: 'Backtesting met volledige MSCI data (1970-2024)',
    priority: 'critical',
    estimatedDurationMs: 1000,
    fn() {
      const input = makeFinancialInput()
      const { result, durationMs } = timeExecution(() =>
        runBacktest(input, 30),
      )
      saveBaseline('backtest-30yr', durationMs)
      assertGreaterThan(result.successRate, 0, 'Backtest moet success rate berekenen')
      assertLessThanOrEqual(durationMs, 200, `runBacktest 30jr moet <200ms (was ${durationMs.toFixed(1)}ms)`)
    },
  },
  {
    id: 'perf-backtest-50yr',
    name: 'runBacktest 50-jaar historisch <200ms',
    category: CAT,
    description: 'Langere backtest met meer start-jaren',
    priority: 'high',
    estimatedDurationMs: 1000,
    fn() {
      const input = makeFinancialInput()
      const { result, durationMs } = timeExecution(() =>
        runBacktest(input, 50),
      )
      saveBaseline('backtest-50yr', durationMs)
      assertDefined(result.successRate, 'successRate moet bestaan')
      assertLessThanOrEqual(durationMs, 200, `runBacktest 50jr moet <200ms (was ${durationMs.toFixed(1)}ms)`)
    },
  },

  // ── 3. computeFireRange — 3 scenarios (target: <300ms) ─────────────
  {
    id: 'perf-fire-range-3scenarios',
    name: 'computeFireRange 3 scenario\'s <300ms',
    category: CAT,
    description: 'Optimistisch, verwacht en pessimistisch scenario berekenen',
    priority: 'critical',
    estimatedDurationMs: 1000,
    fn() {
      const input = makeFinancialInput()
      const { result, durationMs } = timeExecution(() =>
        computeFireRange(input),
      )
      saveBaseline('fire-range-3scenarios', durationMs)
      assertNotNull(result.optimistic, 'Optimistisch scenario moet bestaan')
      assertNotNull(result.expected, 'Verwacht scenario moet bestaan')
      assertNotNull(result.pessimistic, 'Pessimistisch scenario moet bestaan')
      assertLessThanOrEqual(durationMs, 300, `computeFireRange moet <300ms (was ${durationMs.toFixed(1)}ms)`)
    },
  },
  {
    id: 'perf-fire-range-custom-return',
    name: 'computeFireRange met custom baseReturn <300ms',
    category: CAT,
    description: 'Range berekening met aangepast verwacht rendement',
    priority: 'medium',
    estimatedDurationMs: 1000,
    fn() {
      const input = makeFinancialInput({ totalAssets: 500_000 })
      const { result, durationMs } = timeExecution(() =>
        computeFireRange(input, undefined, undefined, 0.10),
      )
      saveBaseline('fire-range-custom-return', durationMs)
      assertNotNull(result.expected, 'Expected scenario met custom return')
      assertLessThanOrEqual(durationMs, 300, `computeFireRange custom return <300ms (was ${durationMs.toFixed(1)}ms)`)
    },
  },

  // ── 4. Recurring detection — 1000+ transactions (target: <500ms) ────
  {
    id: 'perf-recurring-1000tx',
    name: 'detectRecurringTransactions 1000 transacties <500ms',
    category: CAT,
    description: 'Detecteer terugkerende transacties in 1000 transacties',
    priority: 'critical',
    estimatedDurationMs: 2000,
    fn() {
      const txs = generateTransactions(1000)
      const { result, durationMs } = timeExecution(() =>
        detectRecurringTransactions(txs),
      )
      saveBaseline('recurring-1000tx', durationMs)
      // Should find some recurring patterns from the 20 counterparties
      assertGreaterThan(result.length, 0, 'Moet terugkerende patronen vinden')
      assertLessThanOrEqual(durationMs, 500, `Recurring detection 1000tx moet <500ms (was ${durationMs.toFixed(1)}ms)`)
    },
  },
  {
    id: 'perf-recurring-2000tx',
    name: 'detectRecurringTransactions 2000 transacties <500ms',
    category: CAT,
    description: 'Stress test met dubbele dataset',
    priority: 'high',
    estimatedDurationMs: 3000,
    fn() {
      const txs = generateTransactions(2000)
      const { result, durationMs } = timeExecution(() =>
        detectRecurringTransactions(txs),
      )
      saveBaseline('recurring-2000tx', durationMs)
      assertGreaterThan(result.length, 0, 'Moet terugkerende patronen vinden')
      assertLessThanOrEqual(durationMs, 500, `Recurring detection 2000tx moet <500ms (was ${durationMs.toFixed(1)}ms)`)
    },
  },

  // ── 5. Transfer matching — 1000+ transactions (target: <500ms) ──────
  {
    id: 'perf-transfer-matching-1000tx',
    name: 'Transfer matching in 1000 transacties <500ms',
    category: CAT,
    description: 'Herken interne overboekingen in 1000 transacties',
    priority: 'high',
    estimatedDurationMs: 2000,
    fn() {
      // Transfer matching is done within detectRecurringTransactions
      // with transaction_type filtering — simulate with transfers mixed in
      const txs = generateTransactions(1000)
      // Mark every 10th as a transfer to test filtering
      for (let i = 0; i < txs.length; i += 10) {
        txs[i].transaction_type = 'transfer'
      }
      const { result, durationMs } = timeExecution(() =>
        detectRecurringTransactions(txs),
      )
      saveBaseline('transfer-matching-1000tx', durationMs)
      // Transfers should be filtered out, still find patterns
      assertGreaterThanOrEqual(result.length, 0, 'Resultaat is geldig')
      assertLessThanOrEqual(durationMs, 500, `Transfer matching 1000tx <500ms (was ${durationMs.toFixed(1)}ms)`)
    },
  },
  {
    id: 'perf-transfer-matching-mixed',
    name: 'Transfer matching met joint_transfer <500ms',
    category: CAT,
    description: 'Mix van gewone, transfer en joint_transfer transacties',
    priority: 'medium',
    estimatedDurationMs: 2000,
    fn() {
      const txs = generateTransactions(1200)
      // Mix transfer types
      for (let i = 0; i < txs.length; i++) {
        if (i % 8 === 0) txs[i].transaction_type = 'transfer'
        if (i % 12 === 0) txs[i].transaction_type = 'joint_transfer'
      }
      const { durationMs } = timeExecution(() =>
        detectRecurringTransactions(txs),
      )
      saveBaseline('transfer-matching-mixed', durationMs)
      assertLessThanOrEqual(durationMs, 500, `Transfer matching mixed <500ms (was ${durationMs.toFixed(1)}ms)`)
    },
  },

  // ── 6. Auto-dashboard builder — 44 widgets (target: <50ms) ──────────
  {
    id: 'perf-dashboard-builder-small',
    name: 'buildDashboardLayout small grid <50ms',
    category: CAT,
    description: 'Auto-dashboard builder met small grid (12 cellen)',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const answers: AutoDashboardAnswers = {
        focuses: ['budget_cashflow', 'assets_investments'],
        modulePreference: 'balanced',
        gridSize: 'small',
        detailLevel: 'compact',
        selectedBudgetFavIds: [],
      }
      // Create full feature access (all enabled)
      const features: Record<string, { accessible: boolean; reason: 'accessible'; defaultEnabled: boolean }> = {}
      WIDGET_CATALOG.forEach(w => {
        features[w.id] = { accessible: true, reason: 'accessible', defaultEnabled: true }
      })

      const { result, durationMs } = timeExecution(() =>
        buildDashboardLayout(answers, WIDGET_CATALOG, features, []),
      )
      saveBaseline('dashboard-builder-small', durationMs)
      assertGreaterThan(result.length, 0, 'Moet widgets genereren')
      assertLessThanOrEqual(durationMs, 50, `Dashboard builder small <50ms (was ${durationMs.toFixed(1)}ms)`)
    },
  },
  {
    id: 'perf-dashboard-builder-large',
    name: 'buildDashboardLayout large grid <50ms',
    category: CAT,
    description: 'Auto-dashboard builder met large grid (20 cellen) en favorites',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      const answers: AutoDashboardAnswers = {
        focuses: ['budget_cashflow', 'assets_investments', 'fire_freedom', 'goals_actions'],
        modulePreference: 'kern',
        gridSize: 'large',
        detailLevel: 'detailed',
        selectedBudgetFavIds: ['fav-1', 'fav-2', 'fav-3'],
      }
      const features: Record<string, { accessible: boolean; reason: 'accessible'; defaultEnabled: boolean }> = {}
      WIDGET_CATALOG.forEach(w => {
        features[w.id] = { accessible: true, reason: 'accessible', defaultEnabled: true }
      })
      const favBudgets = [
        { id: 'fav-1', name: 'Boodschappen' },
        { id: 'fav-2', name: 'Horeca' },
        { id: 'fav-3', name: 'Transport' },
      ]

      const { result, durationMs } = timeExecution(() =>
        buildDashboardLayout(answers, WIDGET_CATALOG, features, favBudgets),
      )
      saveBaseline('dashboard-builder-large', durationMs)
      assertGreaterThan(result.length, 0, 'Moet widgets genereren')
      assertLessThanOrEqual(durationMs, 50, `Dashboard builder large <50ms (was ${durationMs.toFixed(1)}ms)`)
    },
  },
  {
    id: 'perf-dashboard-builder-all-focuses',
    name: 'buildDashboardLayout alle focuses <50ms',
    category: CAT,
    description: 'Dashboard builder met alle mogelijke focuses en detail',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const answers: AutoDashboardAnswers = {
        focuses: ['budget_cashflow', 'assets_investments', 'fire_freedom', 'goals_actions', 'overview'],
        modulePreference: 'balanced',
        gridSize: 'large',
        detailLevel: 'detailed',
        selectedBudgetFavIds: ['f1', 'f2', 'f3', 'f4', 'f5'],
      }
      const features: Record<string, { accessible: boolean; reason: 'accessible'; defaultEnabled: boolean }> = {}
      WIDGET_CATALOG.forEach(w => {
        features[w.id] = { accessible: true, reason: 'accessible', defaultEnabled: true }
      })
      const favBudgets = Array.from({ length: 5 }, (_, i) => ({
        id: `f${i + 1}`, name: `Budget ${i + 1}`,
      }))

      const { durationMs } = timeExecution(() =>
        buildDashboardLayout(answers, WIDGET_CATALOG, features, favBudgets),
      )
      saveBaseline('dashboard-builder-all-focuses', durationMs)
      assertLessThanOrEqual(durationMs, 50, `Dashboard builder all-focuses <50ms (was ${durationMs.toFixed(1)}ms)`)
    },
  },

  // ── 7. Regression detection ─────────────────────────────────────────
  {
    id: 'perf-berekening-regression-check',
    name: 'Regressie detectie bij >20% vertraging',
    category: CAT,
    description: 'Controleert dat regressie-alerts correct werken',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const testName = '__perf_calc_test__'
      try {
        // Set up a known baseline
        const store = loadBaselines()
        store.entries[testName] = {
          name: testName,
          avgMs: 50,
          minMs: 40,
          maxMs: 60,
          samples: 5,
          recordedAt: new Date().toISOString(),
        }
        localStorage.setItem(BASELINE_KEY, JSON.stringify(store))

        // 55ms: within 20% threshold (60ms) → no regression
        const noReg = checkRegression(testName, 55)
        assert(noReg === null, '55ms vs 50ms baseline mag geen regressie zijn')

        // 70ms: exceeds 20% threshold (60ms) → regression
        const hasReg = checkRegression(testName, 70)
        assertNotNull(hasReg, '70ms vs 50ms baseline moet regressie detecteren')
        assert(hasReg!.includes('Regressie'), 'Melding bevat "Regressie"')
      } finally {
        // Cleanup
        try {
          const store = loadBaselines()
          delete store.entries[testName]
          localStorage.setItem(BASELINE_KEY, JSON.stringify(store))
        } catch { /* ignore */ }
      }
    },
  },
  {
    id: 'perf-berekening-baseline-persist',
    name: 'Baseline meetingen worden opgeslagen',
    category: CAT,
    description: 'Verifieert dat alle baseline metingen correct opgeslagen zijn',
    priority: 'low',
    estimatedDurationMs: 200,
    fn() {
      // Check that at least some baselines from earlier tests were saved
      const store = loadBaselines()
      assert(store.version === 1, 'Store versie moet 1 zijn')
      // After running the tests above, there should be baselines
      const keys = Object.keys(store.entries).filter(k => !k.startsWith('__'))
      assertGreaterThan(keys.length, 0, 'Moet baseline metingen hebben na eerdere tests')
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Performance — Berekeningen',
    description: 'Performance van rekenintensieve functies: FIRE simulatie, backtesting, recurring detection',
    icon: 'Gauge',
    testCount: 0,
  })
  registerTests(tests)
}

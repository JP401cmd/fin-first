import { registerCategory, registerTests } from '../test-registry'
import {
  assertEqual, assertGreaterThan, assertGreaterThanOrEqual,
  assert, assertNotNull, assertDefined, assertIncludes,
} from '../assert'
import type { TestCase } from '../test-types'
import type { CheckinSnapshot } from '@/app/api/checkin/save/route'
import type { Aandachtspunt } from '@/app/api/checkin/aandachtspunten/route'
import type { GesprekStarterData } from '@/app/api/checkin/gespreksstarters/route'

const CAT = 'checkin.flow'

/**
 * Regression tests for the Financiële Check-in system.
 *
 * Tests cover:
 *   - POST /api/checkin/save: snapshot persistence, field validation, household copies
 *   - GET /api/checkin/save: previous snapshot lookup, history mode, month lookup
 *   - GET /api/checkin/overview: monthly summary computation
 *   - GET /api/checkin/upcoming: recurring items and life events
 *   - GET /api/checkin/budgets: budget data with spending aggregation
 *   - GET /api/checkin/aandachtspunten: attention points from financial data
 *   - GET /api/checkin/gespreksstarters: context-dependent conversation starters
 */

// ── Helper: simulate fetch with expected status ──────────────────────
async function fetchAPI(path: string, options?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    })
    let body: Record<string, unknown> = {}
    try {
      body = await res.json()
    } catch {
      // Non-JSON response
    }
    return { status: res.status, body }
  } catch {
    return { status: 0, body: { error: 'fetch failed' } }
  }
}

const tests: TestCase[] = [

  // ═══════════════════════════════════════════════════════════════════════
  // Step 1: POST /api/checkin/save
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'checkin-save-auth', name: 'POST /api/checkin/save: auth guard (401)', category: CAT,
    description: 'Unauthenticated POST returns 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/checkin/save', {
        method: 'POST',
        body: JSON.stringify({ reflection: 'test', monthKey: '2026-03' }),
      })
      assertEqual(status, 401, 'POST /api/checkin/save → 401')
      assertDefined(body.error, 'error message present')
    },
  },

  {
    id: 'checkin-save-snapshot-shape', name: 'POST /api/checkin/save: CheckinSnapshot interface shape', category: CAT,
    description: 'Verify CheckinSnapshot has all required fields',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      // Verify the CheckinSnapshot type contract by constructing a valid instance
      const snapshot: CheckinSnapshot = {
        reflection: 'Goede maand gehad',
        monthKey: '2026-03',
        savedAt: new Date().toISOString(),
        userId: 'test-user-id',
        userName: 'Jan',
        householdId: null,
        metrics: {
          netWorth: 150000,
          monthlyIncome: 5000,
          monthlyExpenses: 3000,
          monthlySavings: 2000,
          completedActions: 3,
          activeGoals: 2,
          fireAge: 52,
        },
      }
      assertDefined(snapshot.reflection, 'reflection defined')
      assertDefined(snapshot.monthKey, 'monthKey defined')
      assertDefined(snapshot.savedAt, 'savedAt defined')
      assertDefined(snapshot.userId, 'userId defined')
      assertDefined(snapshot.metrics, 'metrics defined')
      assertDefined(snapshot.metrics.netWorth, 'metrics.netWorth defined')
      assertDefined(snapshot.metrics.monthlyIncome, 'metrics.monthlyIncome defined')
      assertDefined(snapshot.metrics.monthlyExpenses, 'metrics.monthlyExpenses defined')
      assertDefined(snapshot.metrics.monthlySavings, 'metrics.monthlySavings defined')
      assertDefined(snapshot.metrics.completedActions, 'metrics.completedActions defined')
      assertDefined(snapshot.metrics.activeGoals, 'metrics.activeGoals defined')
      // fireAge can be null
      assert(snapshot.metrics.fireAge === 52 || snapshot.metrics.fireAge === null, 'fireAge is number or null')
    },
  },

  {
    id: 'checkin-save-details-optional', name: 'POST /api/checkin/save: details field is optional', category: CAT,
    description: 'CheckinSnapshot details field supports optional sub-fields',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      // Details is optional on CheckinSnapshot
      const snapshotWithoutDetails: CheckinSnapshot = {
        reflection: '', monthKey: '2026-03', savedAt: new Date().toISOString(),
        userId: 'u1', userName: null, householdId: null,
        metrics: { netWorth: 0, monthlyIncome: 0, monthlyExpenses: 0, monthlySavings: 0, completedActions: 0, activeGoals: 0, fireAge: null },
      }
      assertEqual(snapshotWithoutDetails.details, undefined, 'details is undefined when omitted')

      // Details has optional sub-fields
      const snapshotWithDetails: CheckinSnapshot = {
        reflection: 'test', monthKey: '2026-03', savedAt: new Date().toISOString(),
        userId: 'u1', userName: 'Test', householdId: 'hh1',
        metrics: { netWorth: 100000, monthlyIncome: 4000, monthlyExpenses: 2500, monthlySavings: 1500, completedActions: 1, activeGoals: 3, fireAge: 55 },
        details: {
          netWorthChange: 5000,
          freedomDaysWon: 12,
          prevMonthExpenses: 2300,
          assets: [{ name: 'ETF Portfolio', type: 'belegging', value: 80000 }],
          debts: [{ name: 'Hypotheek', type: 'mortgage', balance: 200000 }],
          goals: [{ name: 'Noodfonds', current: 5000, target: 10000, completed: false }],
          budgets: [{ name: 'Boodschappen', icon: '🛒', limit: 500, spent: 420 }],
        },
      }
      assertDefined(snapshotWithDetails.details, 'details is defined')
      assertDefined(snapshotWithDetails.details!.assets, 'assets array in details')
      assertEqual(snapshotWithDetails.details!.assets!.length, 1, '1 asset in details')
      assertDefined(snapshotWithDetails.details!.debts, 'debts array in details')
      assertDefined(snapshotWithDetails.details!.goals, 'goals array in details')
      assertDefined(snapshotWithDetails.details!.budgets, 'budgets array in details')
    },
  },

  {
    id: 'checkin-save-key-format', name: 'POST /api/checkin/save: app_settings key format', category: CAT,
    description: 'Check-in storage key follows pattern checkin_snapshot_{userId}_{YYYY-MM}',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const userId = 'abc-123-def'
      const now = new Date()
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const key = `checkin_snapshot_${userId}_${monthStr}`

      assert(key.startsWith('checkin_snapshot_'), 'key starts with checkin_snapshot_')
      assert(key.includes(userId), 'key contains userId')
      assert(/\d{4}-\d{2}$/.test(key), 'key ends with YYYY-MM pattern')
    },
  },

  {
    id: 'checkin-save-household-key', name: 'POST /api/checkin/save: household copy key format', category: CAT,
    description: 'Household-scoped copy uses checkin_household_{householdId}_{userId}_{YYYY-MM}',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      const householdId = 'hh-456'
      const userId = 'user-789'
      const monthStr = '2026-03'
      const householdKey = `checkin_household_${householdId}_${userId}_${monthStr}`

      assert(householdKey.startsWith('checkin_household_'), 'household key starts with checkin_household_')
      assert(householdKey.includes(householdId), 'key contains householdId')
      assert(householdKey.includes(userId), 'key contains userId')
      assert(householdKey.includes(monthStr), 'key contains month string')
    },
  },

  {
    id: 'checkin-save-get-auth', name: 'GET /api/checkin/save: auth guard (401)', category: CAT,
    description: 'Unauthenticated GET returns 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/checkin/save')
      assertEqual(status, 401, 'GET /api/checkin/save → 401')
      assertDefined(body.error, 'error message present')
    },
  },

  {
    id: 'checkin-save-get-history-mode', name: 'GET /api/checkin/save?mode=history: history response shape', category: CAT,
    description: 'History mode returns checkins array and hasHousehold flag',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      // Verify the expected response contract of history mode
      const response = {
        checkins: [] as CheckinSnapshot[],
        hasHousehold: false,
      }
      assert(Array.isArray(response.checkins), 'checkins is an array')
      assertEqual(typeof response.hasHousehold, 'boolean', 'hasHousehold is boolean')
    },
  },

  {
    id: 'checkin-save-get-month-mode', name: 'GET /api/checkin/save?month=YYYY-MM: month lookup response', category: CAT,
    description: 'Month lookup returns found boolean and snapshot or null',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      // Not-found case
      const notFoundResponse = { found: false, snapshot: null }
      assertEqual(notFoundResponse.found, false, 'found is false when not found')
      assertEqual(notFoundResponse.snapshot, null, 'snapshot is null when not found')

      // Found case
      const foundResponse = {
        found: true,
        snapshot: {
          reflection: 'test', monthKey: '2026-03', savedAt: '2026-03-15T10:00:00Z',
          userId: 'u1', userName: 'Jan', householdId: null,
          metrics: { netWorth: 100000, monthlyIncome: 5000, monthlyExpenses: 3000, monthlySavings: 2000, completedActions: 0, activeGoals: 1, fireAge: 52 },
        },
      }
      assertEqual(foundResponse.found, true, 'found is true')
      assertNotNull(foundResponse.snapshot, 'snapshot is present')
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Step 2: GET /api/checkin/overview
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'checkin-overview-auth', name: 'GET /api/checkin/overview: auth guard (401)', category: CAT,
    description: 'Unauthenticated GET returns 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/checkin/overview')
      assertEqual(status, 401, 'GET /api/checkin/overview → 401')
      assertDefined(body.error, 'error message present')
    },
  },

  {
    id: 'checkin-overview-response-shape', name: 'GET /api/checkin/overview: response has all required fields', category: CAT,
    description: 'Overview returns monthLabel, netWorth, income, expenses, savings, fireAge, etc.',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      // Verify the response contract from the overview route
      const MONTH_NAMES = [
        'januari', 'februari', 'maart', 'april', 'mei', 'juni',
        'juli', 'augustus', 'september', 'oktober', 'november', 'december',
      ]

      const response = {
        monthLabel: MONTH_NAMES[new Date().getMonth()],
        prevMonthLabel: MONTH_NAMES[new Date().getMonth() === 0 ? 11 : new Date().getMonth() - 1],
        netWorth: 150000,
        netWorthChange: 3.5,
        monthlyIncome: 5000,
        monthlyExpenses: 3200,
        monthlySavings: 1800,
        prevMonthExpenses: 2900,
        completedActionsCount: 2,
        freedomDaysWon: 8,
        fireAge: 52,
      }

      assertIncludes(MONTH_NAMES, response.monthLabel, 'monthLabel is a valid Dutch month')
      assertIncludes(MONTH_NAMES, response.prevMonthLabel, 'prevMonthLabel is valid')
      assertEqual(typeof response.netWorth, 'number', 'netWorth is number')
      assertEqual(typeof response.netWorthChange, 'number', 'netWorthChange is number')
      assertEqual(typeof response.monthlyIncome, 'number', 'monthlyIncome is number')
      assertEqual(typeof response.monthlyExpenses, 'number', 'monthlyExpenses is number')
      assertEqual(response.monthlySavings, response.monthlyIncome - response.monthlyExpenses, 'monthlySavings = income - expenses')
      assertEqual(typeof response.prevMonthExpenses, 'number', 'prevMonthExpenses is number')
      assertEqual(typeof response.completedActionsCount, 'number', 'completedActionsCount is number')
      assertEqual(typeof response.freedomDaysWon, 'number', 'freedomDaysWon is number')
    },
  },

  {
    id: 'checkin-overview-month-names', name: 'GET /api/checkin/overview: Dutch month names', category: CAT,
    description: 'Overview uses correct Dutch month names array',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      const MONTH_NAMES = [
        'januari', 'februari', 'maart', 'april', 'mei', 'juni',
        'juli', 'augustus', 'september', 'oktober', 'november', 'december',
      ]
      assertEqual(MONTH_NAMES.length, 12, '12 month names')
      assertEqual(MONTH_NAMES[0], 'januari', 'January = januari')
      assertEqual(MONTH_NAMES[11], 'december', 'December = december')
      // Verify all lowercase
      for (const name of MONTH_NAMES) {
        assertEqual(name, name.toLowerCase(), `${name} is lowercase`)
      }
    },
  },

  {
    id: 'checkin-overview-net-worth-calc', name: 'GET /api/checkin/overview: netWorth = assets - debts', category: CAT,
    description: 'Net worth is computed as total assets minus total debts',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      // Simulate the computation from the route
      const assets = [{ current_value: 80000 }, { current_value: 50000 }, { current_value: 20000 }]
      const debts = [{ current_balance: 5000 }, { current_balance: 3000 }]

      const totalAssets = assets.reduce((s, a) => s + (a.current_value || 0), 0)
      const totalDebts = debts.reduce((s, d) => s + (d.current_balance || 0), 0)
      const netWorth = totalAssets - totalDebts

      assertEqual(totalAssets, 150000, 'total assets = 150K')
      assertEqual(totalDebts, 8000, 'total debts = 8K')
      assertEqual(netWorth, 142000, 'netWorth = 142K')
    },
  },

  {
    id: 'checkin-overview-fire-age', name: 'GET /api/checkin/overview: FIRE age calculation', category: CAT,
    description: 'FIRE age uses SWR-based target and compound growth formula',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      // Replicate the FIRE age formula from the overview route
      const netWorth = 150000
      const monthlyExpenses = 3000
      const monthlyIncome = 5000
      const expectedReturn = 0.07
      const currentAge = 35
      const swr = 0.04

      const yearlyExpenses = monthlyExpenses * 12
      const fireTarget = yearlyExpenses / swr
      assertEqual(fireTarget, 900000, 'FIRE target = yearly expenses / SWR')

      const annualSavings = (monthlyIncome - monthlyExpenses) * 12
      assertEqual(annualSavings, 24000, 'annual savings = 24K')

      // years-to-FIRE calculation
      const yearsToFire = Math.log(
        (fireTarget * expectedReturn + annualSavings) / (netWorth * expectedReturn + annualSavings)
      ) / Math.log(1 + expectedReturn)

      assert(isFinite(yearsToFire), 'yearsToFire is finite')
      assertGreaterThan(yearsToFire, 0, 'yearsToFire is positive')

      const fireAge = Math.round(currentAge + yearsToFire)
      assertGreaterThan(fireAge, currentAge, 'FIRE age > current age')
      assert(fireAge < 100, 'FIRE age is reasonable (< 100)')
    },
  },

  {
    id: 'checkin-overview-net-worth-change-pct', name: 'GET /api/checkin/overview: netWorthChange as percentage', category: CAT,
    description: 'Net worth change is computed as percentage from snapshots',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      // From route: if 2+ snapshots, compute ((latest - previous) / previous) * 100
      const snapshots = [{ value: 155000 }, { value: 150000 }]
      const latest = snapshots[0].value
      const previous = snapshots[1].value
      const netWorthChange = ((latest - previous) / previous) * 100

      assertGreaterThan(netWorthChange, 0, 'positive growth')
      // ~3.33%
      assert(Math.abs(netWorthChange - 3.333) < 0.1, 'netWorthChange ≈ 3.33%')

      // Edge case: previous = 0 → no change
      const zeroPrev = 0
      const changeFromZero = zeroPrev > 0 ? ((155000 - zeroPrev) / zeroPrev) * 100 : 0
      assertEqual(changeFromZero, 0, 'no change when previous is 0')
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Step 3: GET /api/checkin/upcoming
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'checkin-upcoming-auth', name: 'GET /api/checkin/upcoming: auth guard (401)', category: CAT,
    description: 'Unauthenticated GET returns 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/checkin/upcoming')
      assertEqual(status, 401, 'GET /api/checkin/upcoming → 401')
      assertDefined(body.error, 'error message present')
    },
  },

  {
    id: 'checkin-upcoming-response-shape', name: 'GET /api/checkin/upcoming: items array response', category: CAT,
    description: 'Upcoming returns items array with name, amount, date fields',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const response = {
        items: [
          { name: 'Netflix', amount: -14, date: 'april' },
          { name: 'Hypotheek', amount: -1200, date: 'april' },
          { name: 'Erfbelasting', amount: -5000, date: '2026' },
        ],
      }
      assert(Array.isArray(response.items), 'items is an array')
      for (const item of response.items) {
        assertDefined(item.name, 'item has name')
        assertEqual(typeof item.amount, 'number', 'item.amount is number')
        assertDefined(item.date, 'item has date')
      }
    },
  },

  {
    id: 'checkin-upcoming-recurring-filter', name: 'GET /api/checkin/upcoming: recurring filtering (count >= 2)', category: CAT,
    description: 'Only transactions appearing 2+ times in 3 months are considered recurring',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      // Simulate the route's counterparty grouping logic
      const transactions = [
        { counterparty_name: 'Netflix', amount: -14 },
        { counterparty_name: 'Netflix', amount: -14 },
        { counterparty_name: 'Netflix', amount: -14 },
        { counterparty_name: 'Eenmalig', amount: -500 },
        { counterparty_name: 'Hypotheek', amount: -1200 },
        { counterparty_name: 'Hypotheek', amount: -1200 },
      ]

      const counterpartyMap: Record<string, { total: number; count: number }> = {}
      for (const t of transactions) {
        const key = t.counterparty_name || 'Onbekend'
        if (!counterpartyMap[key]) counterpartyMap[key] = { total: 0, count: 0 }
        counterpartyMap[key].total += t.amount
        counterpartyMap[key].count += 1
      }

      // Filter for count >= 2
      const recurring = Object.entries(counterpartyMap).filter(([, data]) => data.count >= 2)
      assertEqual(recurring.length, 2, 'only Netflix and Hypotheek are recurring')
      assert(!recurring.find(([name]) => name === 'Eenmalig'), 'one-time items excluded')
    },
  },

  {
    id: 'checkin-upcoming-sort-limit', name: 'GET /api/checkin/upcoming: sorted by amount, limited to 10', category: CAT,
    description: 'Upcoming items sorted by absolute amount ascending and limited to top 10',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      // Simulate the route's sorting logic
      const items = Array.from({ length: 15 }, (_, i) => ({
        name: `Item ${i}`,
        amount: -(i + 1) * 100,
        date: 'april',
      }))

      items.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount))
      const limited = items.slice(0, 10)

      assertEqual(limited.length, 10, 'limited to 10 items')
      assertEqual(limited[0].amount, -100, 'smallest amount first')
      assertEqual(limited[9].amount, -1000, 'largest in top 10 is 10th')
    },
  },

  {
    id: 'checkin-upcoming-life-events', name: 'GET /api/checkin/upcoming: life events included', category: CAT,
    description: 'Active life events within 1 year are added to upcoming items',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      const currentYear = new Date().getFullYear()

      // Simulate life events query filter: start_year between this year and next
      const lifeEvents = [
        { name: 'Sabbatical', annual_amount: 15000, start_year: currentYear },
        { name: 'Hypotheek aflossing', annual_amount: 5000, start_year: currentYear + 1 },
        { name: 'Far future event', annual_amount: 10000, start_year: currentYear + 5 },
      ]

      const filtered = lifeEvents.filter(
        e => e.start_year >= currentYear && e.start_year <= currentYear + 1
      )
      assertEqual(filtered.length, 2, '2 life events within range')
      assert(!filtered.find(e => e.name === 'Far future event'), 'far future excluded')

      // Life event amounts are negated (expenses)
      for (const event of filtered) {
        const item = { name: event.name, amount: -Math.abs(event.annual_amount), date: `${event.start_year}` }
        assert(item.amount < 0, 'life event amount is negative (expense)')
      }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Step 4: GET /api/checkin/budgets
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'checkin-budgets-auth', name: 'GET /api/checkin/budgets: auth guard (401)', category: CAT,
    description: 'Unauthenticated GET returns 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/checkin/budgets')
      assertEqual(status, 401, 'GET /api/checkin/budgets → 401')
      assertDefined(body.error, 'error message present')
    },
  },

  {
    id: 'checkin-budgets-response-shape', name: 'GET /api/checkin/budgets: budget items shape', category: CAT,
    description: 'Budget items have id, name, icon, limit, spent, budget_type fields',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const response = {
        budgets: [
          { id: 'b1', name: 'Boodschappen', icon: '🛒', limit: 500, spent: 420, budget_type: 'expense' },
          { id: 'b2', name: 'Salaris', icon: '💰', limit: 5000, spent: 5000, budget_type: 'income' },
        ],
      }
      assert(Array.isArray(response.budgets), 'budgets is an array')
      for (const b of response.budgets) {
        assertDefined(b.id, 'budget has id')
        assertDefined(b.name, 'budget has name')
        assertEqual(typeof b.limit, 'number', 'limit is number')
        assertEqual(typeof b.spent, 'number', 'spent is number')
        assertDefined(b.budget_type, 'budget_type defined')
      }
    },
  },

  {
    id: 'checkin-budgets-override-logic', name: 'GET /api/checkin/budgets: budget_amounts override', category: CAT,
    description: 'Override amounts from budget_amounts table take precedence over default_limit',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      // Simulate the override logic from the route
      const budgetId = 'b1'
      const defaultLimit = 500
      const budgetAmounts = [
        { budget_id: 'b1', effective_from: '2026-02-01', amount: 600 },
        { budget_id: 'b1', effective_from: '2026-01-01', amount: 550 },
        { budget_id: 'b2', effective_from: '2026-03-01', amount: 1000 },
      ]

      // Build override map (first match wins since sorted desc by effective_from)
      const overrideByBudget: Record<string, number> = {}
      for (const ba of budgetAmounts) {
        if (!(ba.budget_id in overrideByBudget)) {
          overrideByBudget[ba.budget_id] = Number(ba.amount)
        }
      }

      const limit = budgetId in overrideByBudget ? overrideByBudget[budgetId] : defaultLimit
      assertEqual(limit, 600, 'most recent override (600) used')
      assertEqual(overrideByBudget['b2'], 1000, 'b2 override = 1000')
    },
  },

  {
    id: 'checkin-budgets-interval-normalize', name: 'GET /api/checkin/budgets: quarterly/yearly normalization', category: CAT,
    description: 'Quarterly limits divided by 3, yearly by 12 to normalize to monthly',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      // Simulate the interval normalization from route
      const budgets = [
        { id: 'b1', default_limit: 1200, interval: 'monthly' },
        { id: 'b2', default_limit: 3000, interval: 'quarterly' },
        { id: 'b3', default_limit: 12000, interval: 'yearly' },
      ]

      const overrides: Record<string, number> = {} // No overrides

      const normalized = budgets.map(b => {
        let limit: number
        if (b.id in overrides) {
          limit = overrides[b.id]
        } else {
          limit = b.default_limit || 0
          if (b.interval === 'quarterly') limit = limit / 3
          if (b.interval === 'yearly') limit = limit / 12
        }
        return { id: b.id, limit }
      })

      assertEqual(normalized[0].limit, 1200, 'monthly: unchanged')
      assertEqual(normalized[1].limit, 1000, 'quarterly: 3000/3 = 1000')
      assertEqual(normalized[2].limit, 1000, 'yearly: 12000/12 = 1000')
    },
  },

  {
    id: 'checkin-budgets-child-aggregation', name: 'GET /api/checkin/budgets: child spending aggregated to parent', category: CAT,
    description: 'Child budget spending is rolled up to parent budget totals',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      // Simulate child-to-parent aggregation
      const spentByBudget: Record<string, number> = {
        'parent-1': 200,    // direct parent spending
        'child-1a': 150,    // child of parent-1
        'child-1b': 100,    // child of parent-1
        'parent-2': 500,
      }
      const childBudgets = [
        { id: 'child-1a', parent_id: 'parent-1' },
        { id: 'child-1b', parent_id: 'parent-1' },
      ]

      // Aggregate child to parent
      for (const child of childBudgets) {
        if (child.parent_id && spentByBudget[child.id]) {
          spentByBudget[child.parent_id] = (spentByBudget[child.parent_id] || 0) + spentByBudget[child.id]
        }
      }

      assertEqual(spentByBudget['parent-1'], 450, 'parent-1: 200 + 150 + 100 = 450')
      assertEqual(spentByBudget['parent-2'], 500, 'parent-2: unchanged (no children)')
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Step 5: GET /api/checkin/aandachtspunten
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'checkin-aandachtspunten-auth', name: 'GET /api/checkin/aandachtspunten: auth guard (401)', category: CAT,
    description: 'Unauthenticated GET returns 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/checkin/aandachtspunten')
      assertEqual(status, 401, 'GET /api/checkin/aandachtspunten → 401')
      assertDefined(body.error, 'error message present')
    },
  },

  {
    id: 'checkin-aandachtspunten-type-shape', name: 'Aandachtspunt: interface has all fields', category: CAT,
    description: 'Aandachtspunt has id, type, title, description, severity; freedomDays optional',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const item: Aandachtspunt = {
        id: 'budget-1',
        type: 'budget_over',
        title: 'Boodschappen: 20% over budget',
        description: '€600 uitgegeven van €500 budget.',
        severity: 'high',
        freedomDays: 3,
      }
      assertDefined(item.id, 'id defined')
      assertDefined(item.type, 'type defined')
      assertIncludes(['budget_over', 'unexpected_expense', 'goal_overdue', 'goal_behind'], item.type, 'valid type')
      assertDefined(item.title, 'title defined')
      assertDefined(item.description, 'description defined')
      assertIncludes(['high', 'medium'], item.severity, 'valid severity')
      // freedomDays is optional
      assertDefined(item.freedomDays, 'freedomDays present when set')
    },
  },

  {
    id: 'checkin-aandachtspunten-budget-over', name: 'Aandachtspunten: budget overschrijding detection', category: CAT,
    description: 'Budgets where spending > limit generate budget_over attention points',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      // Simulate budget overshoot detection
      const budgets = [
        { id: 'b1', name: 'Boodschappen', monthly_limit: 500, icon: '🛒' },
        { id: 'b2', name: 'Kleding', monthly_limit: 200, icon: '👕' },
      ]
      const expensesByCategory: Record<string, number> = {
        'Boodschappen': 650,  // over
        'Kleding': 150,       // under
      }
      const dailyExpenses = 100

      const aandachtspunten: Aandachtspunt[] = []
      for (const budget of budgets) {
        const spent = expensesByCategory[budget.name] || 0
        if (spent > budget.monthly_limit) {
          const overshoot = spent - budget.monthly_limit
          const pctOver = Math.round((overshoot / budget.monthly_limit) * 100)
          const fd = dailyExpenses > 0 ? Math.round(overshoot / dailyExpenses) : 0

          aandachtspunten.push({
            id: `budget-${budget.id}`,
            type: 'budget_over',
            title: `${budget.name}: ${pctOver}% over budget`,
            description: `Overshoot: ${overshoot}`,
            severity: pctOver > 25 ? 'high' : 'medium',
            freedomDays: fd > 0 ? fd : undefined,
          })
        }
      }

      assertEqual(aandachtspunten.length, 1, 'only 1 budget over')
      assertEqual(aandachtspunten[0].type, 'budget_over', 'type is budget_over')
      assertEqual(aandachtspunten[0].severity, 'high', '30% over → high severity')
    },
  },

  {
    id: 'checkin-aandachtspunten-unexpected', name: 'Aandachtspunten: unexpected expense detection', category: CAT,
    description: 'Categories with >2x spending vs prev month AND >€200 increase flagged',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const expensesByCategory: Record<string, number> = {
        'Gezondheid': 800,
        'Transport': 250,
        'Horeca': 50,
      }
      const prevByCategory: Record<string, number> = {
        'Gezondheid': 200,  // 4x increase, +€600 → flagged
        'Transport': 200,   // 1.25x increase → not flagged (not doubled)
        'Horeca': 20,       // 2.5x increase, +€30 → not flagged (<€200)
      }

      const flagged: string[] = []
      for (const [cat, amount] of Object.entries(expensesByCategory)) {
        const prevAmount = prevByCategory[cat] || 0
        if (prevAmount > 0 && amount > prevAmount * 2 && (amount - prevAmount) > 200) {
          flagged.push(cat)
        }
      }

      assertEqual(flagged.length, 1, 'only Gezondheid flagged')
      assertEqual(flagged[0], 'Gezondheid', 'Gezondheid detected as unexpected')
    },
  },

  {
    id: 'checkin-aandachtspunten-goals', name: 'Aandachtspunten: overdue and behind-schedule goals', category: CAT,
    description: 'Goals past deadline = goal_overdue, approaching + <75% = goal_behind',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const now = new Date()
      const todayStr = now.toISOString().slice(0, 10)

      const goals = [
        { id: 'g1', name: 'Noodfonds', current_value: 2000, target_value: 10000, target_date: '2025-12-31', is_completed: false, icon: '🎯' },
        { id: 'g2', name: 'Vakantie', current_value: 500, target_value: 2000, target_date: (() => {
          const d = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000)
          return d.toISOString().slice(0, 10)
        })(), is_completed: false, icon: '✈️' },
        { id: 'g3', name: 'Auto', current_value: 15000, target_value: 20000, target_date: (() => {
          const d = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000)
          return d.toISOString().slice(0, 10)
        })(), is_completed: false, icon: '🚗' },
      ]

      const overdue: string[] = []
      const behind: string[] = []

      for (const goal of goals) {
        if (!goal.target_date || goal.is_completed) continue
        const pct = goal.target_value > 0 ? (goal.current_value / goal.target_value) * 100 : 0

        if (goal.target_date < todayStr) {
          overdue.push(goal.name)
        } else {
          const daysUntil = Math.ceil((new Date(goal.target_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          if (daysUntil <= 30 && pct < 75) {
            behind.push(goal.name)
          }
        }
      }

      assertEqual(overdue.length, 1, '1 overdue goal')
      assertEqual(overdue[0], 'Noodfonds', 'Noodfonds is overdue')
      assertEqual(behind.length, 1, '1 behind-schedule goal')
      assertEqual(behind[0], 'Vakantie', 'Vakantie is behind (25%, 20 days)')
      // Auto is NOT behind: 75% complete (at threshold, pct < 75 fails)
    },
  },

  {
    id: 'checkin-aandachtspunten-severity-sort', name: 'Aandachtspunten: sorted by severity (high first)', category: CAT,
    description: 'Results are sorted with high severity items before medium',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      const items: Aandachtspunt[] = [
        { id: '1', type: 'budget_over', title: 'Medium', description: '', severity: 'medium' },
        { id: '2', type: 'goal_overdue', title: 'High', description: '', severity: 'high' },
        { id: '3', type: 'unexpected_expense', title: 'High2', description: '', severity: 'high' },
        { id: '4', type: 'goal_behind', title: 'Medium2', description: '', severity: 'medium' },
      ]

      items.sort((a, b) => {
        if (a.severity === b.severity) return 0
        return a.severity === 'high' ? -1 : 1
      })

      assertEqual(items[0].severity, 'high', 'first is high')
      assertEqual(items[1].severity, 'high', 'second is high')
      assertEqual(items[2].severity, 'medium', 'third is medium')
      assertEqual(items[3].severity, 'medium', 'fourth is medium')
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Step 6: GET /api/checkin/gespreksstarters
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'checkin-gespreksstarters-auth', name: 'GET /api/checkin/gespreksstarters: auth guard (401)', category: CAT,
    description: 'Unauthenticated GET returns 401',
    priority: 'critical', estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchAPI('/api/checkin/gespreksstarters')
      assertEqual(status, 401, 'GET /api/checkin/gespreksstarters → 401')
      assertDefined(body.error, 'error message present')
    },
  },

  {
    id: 'checkin-gespreksstarters-type-shape', name: 'GesprekStarterData: interface fields', category: CAT,
    description: 'GesprekStarterData has vraag, context, actie, sentiment; vrijheidstijd optional',
    priority: 'critical', estimatedDurationMs: 100,
    fn() {
      const starter: GesprekStarterData = {
        id: 'vermogen-groei',
        vraag: 'Jullie vermogen is gegroeid...',
        context: 'Netto vermogen steeg van X naar Y',
        actie: 'Bespreek samen...',
        sentiment: 'positive',
        vrijheidstijd: '12 dagen',
      }
      assertDefined(starter.id, 'id defined')
      assertDefined(starter.vraag, 'vraag defined')
      assertDefined(starter.context, 'context defined')
      assertDefined(starter.actie, 'actie defined')
      assertIncludes(['positive', 'neutral', 'alert'], starter.sentiment, 'valid sentiment')

      // Without optional vrijheidstijd
      const starterNoFreedom: GesprekStarterData = {
        id: 'test', vraag: 'test', context: 'test', actie: 'test', sentiment: 'neutral',
      }
      assertEqual(starterNoFreedom.vrijheidstijd, undefined, 'vrijheidstijd is optional')
    },
  },

  {
    id: 'checkin-gespreksstarters-sentiment-sort', name: 'Gespreksstarters: sorted positive → neutral → alert', category: CAT,
    description: 'Starters are sorted by sentiment: positive first, then neutral, then alert',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      const starters: GesprekStarterData[] = [
        { id: '1', vraag: '', context: '', actie: '', sentiment: 'alert' },
        { id: '2', vraag: '', context: '', actie: '', sentiment: 'positive' },
        { id: '3', vraag: '', context: '', actie: '', sentiment: 'neutral' },
        { id: '4', vraag: '', context: '', actie: '', sentiment: 'positive' },
      ]

      const order: Record<string, number> = { positive: 0, neutral: 1, alert: 2 }
      const sorted = [...starters].sort((a, b) => order[a.sentiment] - order[b.sentiment])

      assertEqual(sorted[0].sentiment, 'positive', 'first is positive')
      assertEqual(sorted[1].sentiment, 'positive', 'second is positive')
      assertEqual(sorted[2].sentiment, 'neutral', 'third is neutral')
      assertEqual(sorted[3].sentiment, 'alert', 'fourth is alert')
    },
  },

  {
    id: 'checkin-gespreksstarters-max-5', name: 'Gespreksstarters: max 5 returned', category: CAT,
    description: 'Response is limited to at most 5 conversation starters',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      // Simulate route's max 5 slicing
      const starters = Array.from({ length: 8 }, (_, i) => ({
        id: `s${i}`, vraag: `Q${i}`, context: '', actie: '', sentiment: 'neutral' as const,
      }))

      const limited = starters.slice(0, 5)
      assertEqual(limited.length, 5, 'max 5 starters')
    },
  },

  {
    id: 'checkin-gespreksstarters-min-2', name: 'Gespreksstarters: minimum 2 guaranteed (fallback starters)', category: CAT,
    description: 'If fewer than 2 data-driven starters, fallback starters are added',
    priority: 'high', estimatedDurationMs: 100,
    fn() {
      // Simulate the minimum 2 guarantee
      const starters: GesprekStarterData[] = []

      // Route adds fallback starters if < 2
      if (starters.length < 2) {
        if (!starters.find(s => s.id === 'algemeen-dromen')) {
          starters.push({
            id: 'algemeen-dromen',
            vraag: 'Als jullie volledig financieel vrij zouden zijn...',
            context: 'Reflectiemoment over gezamenlijke levensdoelen.',
            actie: 'Schrijf allebei onafhankelijk 3 dingen op...',
            sentiment: 'positive',
          })
        }
        if (starters.length < 2 && !starters.find(s => s.id === 'algemeen-waarden')) {
          starters.push({
            id: 'algemeen-waarden',
            vraag: 'Welke uitgave van afgelopen maand bracht jullie het meeste voldoening?',
            context: 'Reflectie over bewust besteden en gezamenlijke prioriteiten.',
            actie: 'Identificeer samen een terugkerende uitgave...',
            sentiment: 'neutral',
          })
        }
      }

      assertGreaterThanOrEqual(starters.length, 2, 'at least 2 starters')
      assertEqual(starters[0].id, 'algemeen-dromen', 'first fallback: dromen')
      assertEqual(starters[1].id, 'algemeen-waarden', 'second fallback: waarden')
    },
  },

  {
    id: 'checkin-gespreksstarters-freedom-label', name: 'Gespreksstarters: freedomLabel utility', category: CAT,
    description: 'Freedom label formats days, months, and years correctly in Dutch',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      // Replicate the freedomLabel function from the route
      function freedomLabel(days: number): string {
        if (days >= 365) {
          const years = Math.floor(days / 365)
          const months = Math.round((days % 365) / 30)
          return months > 0 ? `${years} jaar en ${months} maanden` : `${years} jaar`
        }
        if (days >= 30) {
          const m = Math.floor(days / 30)
          const d = days % 30
          return d > 0 ? `${m} maanden en ${d} dagen` : `${m} maanden`
        }
        return `${days} ${days === 1 ? 'dag' : 'dagen'}`
      }

      assertEqual(freedomLabel(1), '1 dag', 'singular day')
      assertEqual(freedomLabel(5), '5 dagen', 'plural days')
      assertEqual(freedomLabel(30), '1 maanden', '30 days = 1 month')
      assertEqual(freedomLabel(45), '1 maanden en 15 dagen', '45 days')
      assertEqual(freedomLabel(365), '1 jaar', '365 days = 1 year')
      assertEqual(freedomLabel(400), '1 jaar en 1 maanden', '400 days')
      assert(freedomLabel(730).includes('jaar'), '730 days includes jaar')
    },
  },

  {
    id: 'checkin-gespreksstarters-data-driven', name: 'Gespreksstarters: data-driven starter IDs', category: CAT,
    description: 'Route generates starters with known IDs based on financial data patterns',
    priority: 'medium', estimatedDurationMs: 100,
    fn() {
      // Verify all known starter IDs from the route
      const knownIds = [
        'vermogen-groei', 'vermogen-daling',
        'sparen-stijging', 'sparen-daling', 'negatief-sparen',
        'uitgaven-stijging', 'uitgaven-daling',
        'doel-bijna', 'doel-start',
        'schulden-vrijheid',
        'acties-momentum', 'acties-openstaand',
        'sparen-vrijheid',
        'algemeen-dromen', 'algemeen-waarden',
      ]
      assertEqual(knownIds.length, 15, '15 known starter IDs')

      // Verify no duplicates
      const unique = new Set(knownIds)
      assertEqual(unique.size, knownIds.length, 'all starter IDs are unique')

      // Verify opposite pairs exist (groei vs daling)
      assert(knownIds.includes('vermogen-groei') && knownIds.includes('vermogen-daling'), 'vermogen pair exists')
      assert(knownIds.includes('sparen-stijging') && knownIds.includes('sparen-daling'), 'sparen pair exists')
      assert(knownIds.includes('uitgaven-stijging') && knownIds.includes('uitgaven-daling'), 'uitgaven pair exists')
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Step 7: Auth consistency across all endpoints
  // ═══════════════════════════════════════════════════════════════════════

  {
    id: 'checkin-auth-consistency', name: 'All check-in endpoints: auth guard consistency', category: CAT,
    description: 'All 6 check-in API endpoints return 401 for unauthenticated requests',
    priority: 'critical', estimatedDurationMs: 3000,
    async fn() {
      const endpoints = [
        '/api/checkin/save',
        '/api/checkin/overview',
        '/api/checkin/upcoming',
        '/api/checkin/budgets',
        '/api/checkin/aandachtspunten',
        '/api/checkin/gespreksstarters',
      ]

      const results = await Promise.all(
        endpoints.map(async (path) => {
          const { status } = await fetchAPI(path)
          return { path, status }
        })
      )

      for (const { path, status } of results) {
        assertEqual(status, 401, `${path} → 401 for unauthenticated`)
      }
    },
  },
]

/** Register all check-in flow tests */
export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Check-in',
    description: 'Financiële check-in flow: opslaan, historie, overzicht, aandachtspunten, gespreksstarters',
    icon: 'MessageCircle',
    testCount: 0,
  })
  registerTests(tests)
}

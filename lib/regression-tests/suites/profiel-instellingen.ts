import { registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull, assertGreaterThan, assertGreaterThanOrEqual } from '../assert'
import type { TestCase } from '../test-types'

const CAT = 'profiel-instellingen'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const body = await res.json()
  return { status: res.status, body }
}

const tests: TestCase[] = [
  // ── Step 1: GET/PUT /api/parameters ────────────────────────────────────────
  {
    id: 'profiel-parameters-get',
    name: 'GET /api/parameters retourneert FIRE parameters',
    category: CAT,
    description: 'Ophalen van berekeningsparameters (expected_return, inflation_rate, box3_method)',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchJson('/api/parameters')
      assertEqual(status, 200, 'status 200')
      assertNotNull(body.expected_return, 'expected_return aanwezig')
      assertNotNull(body.inflation_rate, 'inflation_rate aanwezig')
      assert(typeof body.expected_return === 'number', 'expected_return is number')
      assert(typeof body.inflation_rate === 'number', 'inflation_rate is number')
      assert(
        Number(body.expected_return) >= 0.01 && Number(body.expected_return) <= 0.15,
        `expected_return ${body.expected_return} in bereik [0.01, 0.15]`,
      )
      assert(
        Number(body.inflation_rate) >= 0 && Number(body.inflation_rate) <= 0.08,
        `inflation_rate ${body.inflation_rate} in bereik [0, 0.08]`,
      )
    },
  },
  {
    id: 'profiel-parameters-put',
    name: 'PUT /api/parameters slaat FIRE parameters op',
    category: CAT,
    description: 'Opslaan en terughalen van berekeningsparameters',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      // Read current values
      const { body: original } = await fetchJson('/api/parameters')

      // Save new values
      const testReturn = 0.08
      const testInflation = 0.03
      const { status: putStatus, body: putBody } = await fetchJson('/api/parameters', {
        method: 'PUT',
        body: JSON.stringify({ expected_return: testReturn, inflation_rate: testInflation }),
      })
      assertEqual(putStatus, 200, 'PUT status 200')
      assert(putBody.success === true, 'PUT success: true')

      // Verify saved values
      const { body: verify } = await fetchJson('/api/parameters')
      assertEqual(Number(verify.expected_return), testReturn, 'expected_return opgeslagen')
      assertEqual(Number(verify.inflation_rate), testInflation, 'inflation_rate opgeslagen')

      // Restore original values
      await fetchJson('/api/parameters', {
        method: 'PUT',
        body: JSON.stringify({
          expected_return: original.expected_return,
          inflation_rate: original.inflation_rate,
        }),
      })
    },
  },

  // ── Step 2: PUT /api/widgets ───────────────────────────────────────────────
  {
    id: 'profiel-widgets-put',
    name: 'PUT /api/widgets slaat widget voorkeuren op',
    category: CAT,
    description: 'Widget voorkeuren persistent opslaan via API',
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const testWidgets = [
        { id: 'netto_vermogen', enabled: true, size: 'half', order: 0 },
        { id: 'cash_flow', enabled: true, size: 'full', order: 1 },
        { id: 'spaarquote', enabled: false, size: 'half', order: 2 },
      ]
      const { status, body } = await fetchJson('/api/widgets', {
        method: 'PUT',
        body: JSON.stringify({ widgets: testWidgets }),
      })
      assertEqual(status, 200, 'PUT status 200')
      assert(body.success === true, 'success: true')
    },
  },
  {
    id: 'profiel-widgets-validation',
    name: 'PUT /api/widgets valideert payload',
    category: CAT,
    description: 'Ongeldige payload geeft 400 error',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchJson('/api/widgets', {
        method: 'PUT',
        body: JSON.stringify({ widgets: 'not_an_array' }),
      })
      assertEqual(status, 400, 'ongeldige payload → 400')
    },
  },

  // ── Step 3: GET/PUT /api/notifications ─────────────────────────────────────
  {
    id: 'profiel-notifications-get',
    name: 'GET /api/notifications retourneert meldingen',
    category: CAT,
    description: 'Ophalen van notificaties met correcte structuur',
    priority: 'high',
    estimatedDurationMs: 1000,
    async fn() {
      const { status, body } = await fetchJson('/api/notifications')
      assertEqual(status, 200, 'status 200')
      assert(Array.isArray(body.notifications), 'notifications is array')
      assert(typeof body.unreadCount === 'number', 'unreadCount is number')
      // History array should also be present
      assert(Array.isArray(body.history), 'history is array')
    },
  },
  {
    id: 'profiel-notifications-put',
    name: 'PUT /api/notifications slaat voorkeuren op',
    category: CAT,
    description: 'Notificatie-voorkeuren opslaan en bevestigen',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const prefs = {
        budget: true,
        streak: false,
        sync: true,
        recommendation: true,
        insight: false,
        badge: true,
        levelup: true,
        partner_transaction: false,
      }
      const { status, body } = await fetchJson('/api/notifications', {
        method: 'PUT',
        body: JSON.stringify({ preferences: prefs }),
      })
      assertEqual(status, 200, 'PUT status 200')
      assert(body.success === true, 'success: true')
      // Verify returned preferences match
      const returned = body.preferences as Record<string, boolean>
      assertNotNull(returned, 'preferences teruggegeven')
      assertEqual(returned.streak, false, 'streak uitgeschakeld')
      assertEqual(returned.budget, true, 'budget ingeschakeld')

      // Restore defaults
      await fetchJson('/api/notifications', {
        method: 'PUT',
        body: JSON.stringify({
          preferences: {
            budget: true, streak: true, sync: true,
            recommendation: true, insight: true, badge: true,
            levelup: true, partner_transaction: true,
          },
        }),
      })
    },
  },

  // ── Step 4: GET/PUT /api/budgeting-active ──────────────────────────────────
  {
    id: 'profiel-budgeting-active-get',
    name: 'GET /api/budgeting-active retourneert status',
    category: CAT,
    description: 'Budgettering toggle ophalen',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchJson('/api/budgeting-active')
      assertEqual(status, 200, 'status 200')
      assert(
        typeof body.budgeting_active === 'boolean',
        `budgeting_active is boolean, got ${typeof body.budgeting_active}`,
      )
    },
  },
  {
    id: 'profiel-budgeting-active-put',
    name: 'PUT /api/budgeting-active toggle werkt',
    category: CAT,
    description: 'Budgettering toggle opslaan en terughalen',
    priority: 'high',
    estimatedDurationMs: 1000,
    async fn() {
      // Read original
      const { body: original } = await fetchJson('/api/budgeting-active')
      const originalVal = original.budgeting_active

      // Toggle
      const newVal = !originalVal
      const { status: putStatus, body: putBody } = await fetchJson('/api/budgeting-active', {
        method: 'PUT',
        body: JSON.stringify({ budgeting_active: newVal }),
      })
      assertEqual(putStatus, 200, 'PUT status 200')
      assert(putBody.success === true, 'success: true')
      assertEqual(putBody.budgeting_active, newVal, 'returned value matches')

      // Verify persisted
      const { body: verify } = await fetchJson('/api/budgeting-active')
      assertEqual(verify.budgeting_active, newVal, 'waarde gepersisteerd')

      // Restore
      await fetchJson('/api/budgeting-active', {
        method: 'PUT',
        body: JSON.stringify({ budgeting_active: originalVal }),
      })
    },
  },

  // ── Step 5: GET/PUT /api/dashboard-type ────────────────────────────────────
  {
    id: 'profiel-dashboard-type-get',
    name: 'GET /api/dashboard-type retourneert voorkeur',
    category: CAT,
    description: 'Dashboard type voorkeur ophalen',
    priority: 'high',
    estimatedDurationMs: 500,
    async fn() {
      const { status, body } = await fetchJson('/api/dashboard-type')
      assertEqual(status, 200, 'status 200')
      assert(
        body.dashboard_type === 'widgets' || body.dashboard_type === 'briefing',
        `dashboard_type is widgets of briefing, got ${body.dashboard_type}`,
      )
    },
  },
  {
    id: 'profiel-dashboard-type-put',
    name: 'PUT /api/dashboard-type toggle werkt',
    category: CAT,
    description: 'Dashboard type voorkeur opslaan',
    priority: 'high',
    estimatedDurationMs: 1000,
    async fn() {
      // Read original
      const { body: original } = await fetchJson('/api/dashboard-type')
      const originalType = original.dashboard_type

      // Switch type
      const newType = originalType === 'widgets' ? 'briefing' : 'widgets'
      const { status: putStatus, body: putBody } = await fetchJson('/api/dashboard-type', {
        method: 'PUT',
        body: JSON.stringify({ dashboard_type: newType }),
      })
      assertEqual(putStatus, 200, 'PUT status 200')
      assert(putBody.success === true, 'success: true')
      assertEqual(putBody.dashboard_type, newType, 'returned type matches')

      // Verify persisted
      const { body: verify } = await fetchJson('/api/dashboard-type')
      assertEqual(verify.dashboard_type, newType, 'type gepersisteerd')

      // Restore
      await fetchJson('/api/dashboard-type', {
        method: 'PUT',
        body: JSON.stringify({ dashboard_type: originalType }),
      })
    },
  },
  {
    id: 'profiel-dashboard-type-validation',
    name: 'PUT /api/dashboard-type valideert input',
    category: CAT,
    description: 'Ongeldige dashboard_type geeft 400',
    priority: 'medium',
    estimatedDurationMs: 500,
    async fn() {
      const { status } = await fetchJson('/api/dashboard-type', {
        method: 'PUT',
        body: JSON.stringify({ dashboard_type: 'invalid_type' }),
      })
      assertEqual(status, 400, 'ongeldige type → 400')
    },
  },

  // ── Step 6: GET /api/guide-progress — tellingen ────────────────────────────
  {
    id: 'profiel-guide-progress-counts',
    name: 'GET /api/guide-progress retourneert tellingen',
    category: CAT,
    description: 'Correcte telling van assets, transacties, acties, life events, budgets, schulden',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      const { status, body } = await fetchJson('/api/guide-progress')
      assertEqual(status, 200, 'status 200')

      // Verify counts structure
      const counts = body.counts as Record<string, number>
      assertNotNull(counts, 'counts aanwezig')
      assert(typeof counts.assets === 'number', 'assets count is number')
      assert(typeof counts.transactions === 'number', 'transactions count is number')
      assert(typeof counts.completedActions === 'number', 'completedActions count is number')
      assert(typeof counts.lifeEvents === 'number', 'lifeEvents count is number')
      assert(typeof counts.budgets === 'number', 'budgets count is number')
      assert(typeof counts.debts === 'number', 'debts count is number')

      // Counts should be non-negative
      assertGreaterThanOrEqual(counts.assets, 0, 'assets >= 0')
      assertGreaterThanOrEqual(counts.transactions, 0, 'transactions >= 0')
      assertGreaterThanOrEqual(counts.completedActions, 0, 'completedActions >= 0')
      assertGreaterThanOrEqual(counts.lifeEvents, 0, 'lifeEvents >= 0')
      assertGreaterThanOrEqual(counts.budgets, 0, 'budgets >= 0')
      assertGreaterThanOrEqual(counts.debts, 0, 'debts >= 0')

      // Financial data should be present
      const financial = body.financial as Record<string, unknown>
      assertNotNull(financial, 'financial aanwezig')
      assert(typeof financial.netWorth === 'number', 'netWorth is number')
      assert(typeof financial.sovereigntyLevel === 'number', 'sovereigntyLevel is number')
    },
  },

  // ── Step 7: Guide voortgangspercentage ─────────────────────────────────────
  {
    id: 'profiel-guide-progress-steps',
    name: 'Guide voortgang: stappen correct berekend',
    category: CAT,
    description: 'Gids voortgangspercentage correct berekend op basis van ingevulde onderdelen',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      const { status, body } = await fetchJson('/api/guide-progress')
      assertEqual(status, 200, 'status 200')

      // Steps booleans
      const steps = body.steps as Record<string, boolean>
      assertNotNull(steps, 'steps aanwezig')
      assert(typeof steps.hasAssets === 'boolean', 'hasAssets is boolean')
      assert(typeof steps.hasTransactions === 'boolean', 'hasTransactions is boolean')
      assert(typeof steps.hasBudgets === 'boolean', 'hasBudgets is boolean')
      assert(typeof steps.hasCompletedActions === 'boolean', 'hasCompletedActions is boolean')
      assert(typeof steps.hasLifeEvents === 'boolean', 'hasLifeEvents is boolean')
      assert(typeof steps.hasFireData === 'boolean', 'hasFireData is boolean')
      assert(typeof steps.hasDebts === 'boolean', 'hasDebts is boolean')

      // Verify consistency: if counts.assets > 0 → steps.hasAssets = true
      const counts = body.counts as Record<string, number>
      if (counts.assets > 0) {
        assertEqual(steps.hasAssets, true, 'assets > 0 → hasAssets')
      }
      if (counts.transactions > 0) {
        assertEqual(steps.hasTransactions, true, 'transactions > 0 → hasTransactions')
      }
      if (counts.budgets > 0) {
        assertEqual(steps.hasBudgets, true, 'budgets > 0 → hasBudgets')
      }
      if (counts.lifeEvents > 0) {
        assertEqual(steps.hasLifeEvents, true, 'lifeEvents > 0 → hasLifeEvents')
      }
      if (counts.debts > 0) {
        assertEqual(steps.hasDebts, true, 'debts > 0 → hasDebts')
      }

      // calculatedAt timestamp should be present
      assertNotNull(body.calculatedAt, 'calculatedAt aanwezig')
      assert(typeof body.calculatedAt === 'string', 'calculatedAt is string')
    },
  },
]

export function register(): void {
  registerTests(tests)
}

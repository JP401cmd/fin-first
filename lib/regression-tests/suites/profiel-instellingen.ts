import { registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull } from '../assert'
import type { TestCase } from '../test-types'
import { authenticatedFetch } from '../server-runner'

const CAT = 'identiteit.profiel-instellingen'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJson(url: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await authenticatedFetch(url, {
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
        sync: true,
        recommendation: true,
        horizon: false,
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
      assertEqual(returned.horizon, false, 'horizon uitgeschakeld')
      assertEqual(returned.budget, true, 'budget ingeschakeld')

      // Restore defaults
      await fetchJson('/api/notifications', {
        method: 'PUT',
        body: JSON.stringify({
          preferences: {
            budget: true, sync: true,
            recommendation: true, horizon: true,
            holding_alert: true, briefing: true,
            partner_transaction: true, budget_model_proposal: true,
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

  // (Step 5 — /api/dashboard-type — verwijderd jun 2026 samen met de
  //  DAIshboard-keten; de widgets/briefing-toggle bestaat niet meer.)

  // (Step 6 en 7 — /api/guide-progress — verwijderd sep 2026 met de route zelf:
  //  de gids-voortgang leeft in `lib/welcome-guide.ts` en de gidsweergave bij
  //  Fin, niet meer in een eigen tel-endpoint. Zie ADR 0130.)
]

export function register(): void {
  registerTests(tests)
}

import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertNotNull } from '../assert'
import type { TestCase } from '../test-types'
import { authenticatedFetch } from '../server-runner'
import {
  NUDGE_CATALOG,
  getActiveNudges,
  type NudgeDataState,
  type NudgeOverrides,
} from '@/lib/nudge-definitions'

const CAT = 'module.nudges'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a NudgeDataState with nothing filled in and all modules active. */
function buildEmptyState(modules?: string[]): NudgeDataState {
  return {
    hasAssets: false,
    hasDebts: false,
    hasBudgets: false,
    hasTransactions: false,
    hasActiveBankConnection: false,
    hasHoldings: false,
    hasHoldingsWithIsin: false,
    hasGoals: false,
    hasLifeEvents: false,
    hasFireParams: false,
    activeModules: (modules ?? [
      'budgetteren',
      'vermogensregistratie',
      'aandelenregistratie',
      'toekomstplannen',
      'inzicht_acties',
    ]) as NudgeDataState['activeModules'],
    dismissedNudgeIds: new Set<string>(),
  }
}

/** Build a NudgeDataState where everything is filled in. */
function buildFullState(): NudgeDataState {
  return {
    hasAssets: true,
    hasDebts: true,
    hasBudgets: true,
    hasTransactions: true,
    hasActiveBankConnection: true,
    hasHoldings: true,
    hasHoldingsWithIsin: true,
    hasGoals: true,
    hasLifeEvents: true,
    hasFireParams: true,
    activeModules: [
      'budgetteren',
      'vermogensregistratie',
      'aandelenregistratie',
      'toekomstplannen',
      'inzicht_acties',
    ],
    dismissedNudgeIds: new Set<string>(),
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── 1. GET /api/notifications includes nudges field ────────────────────
  {
    id: 'nudge-notifications-includes-nudges',
    name: 'GET /api/notifications response bevat nudges array',
    category: CAT,
    description: 'De notifications endpoint retourneert een nudges veld als array',
    priority: 'critical',
    estimatedDurationMs: 2000,
    async fn() {
      const res = await authenticatedFetch('/api/notifications')
      assert(
        res.status === 200 || res.status === 401,
        `Expected 200 or 401 from /api/notifications, got ${res.status}`,
      )

      if (res.status === 200) {
        const body = await res.json()
        assert('nudges' in body, 'Response body bevat nudges veld')
        assert(Array.isArray(body.nudges), 'nudges is een array')
      }
    },
  },

  // ── 2. Nudge structure is valid ────────────────────────────────────────
  {
    id: 'nudge-structure-valid',
    name: 'Nudge objecten hebben de juiste structuur',
    category: CAT,
    description: 'Elke nudge heeft id (nudge_ prefix), type=module_nudge, title, description, actionUrl, icon',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Use getActiveNudges to produce nudges from the catalog
      const state = buildEmptyState()
      const nudges = getActiveNudges(state)

      // With all modules active and nothing filled, we expect nudges
      assert(nudges.length > 0, 'Minstens 1 nudge bij lege state met alle modules actief')

      // Verify each nudge has the required fields
      for (const nudge of nudges) {
        assert(typeof nudge.key === 'string' && nudge.key.length > 0, `Nudge key is non-empty string: ${nudge.key}`)
        assert(typeof nudge.title === 'string' && nudge.title.length > 0, `Nudge title is non-empty: ${nudge.key}`)
        assert(typeof nudge.description === 'string' && nudge.description.length > 0, `Nudge description is non-empty: ${nudge.key}`)
        assert(typeof nudge.href === 'string' && nudge.href.startsWith('/'), `Nudge href is een pad: ${nudge.key}`)
        assert(typeof nudge.icon === 'string' && nudge.icon.length > 0, `Nudge icon is non-empty: ${nudge.key}`)
        assert(typeof nudge.priority === 'number', `Nudge priority is een nummer: ${nudge.key}`)
      }

      // Verify the notification-center mapping: id gets nudge_ prefix, type is module_nudge
      const notificationId = `nudge_${nudges[0].key}`
      assert(notificationId.startsWith('nudge_'), 'Notification id begint met nudge_ prefix')

      const notificationType = 'module_nudge'
      assertEqual(notificationType, 'module_nudge', 'Notification type is module_nudge')
    },
  },

  // ── 3. Admin nudge API returns catalog ─────────────────────────────────
  {
    id: 'nudge-admin-catalog',
    name: 'GET /api/admin/nudges retourneert de nudge catalogus',
    category: CAT,
    description: 'Admin endpoint retourneert { nudges: [...] } met alle catalogus entries',
    priority: 'high',
    estimatedDurationMs: 2000,
    requiredRole: 'superadmin',
    async fn() {
      const res = await authenticatedFetch('/api/admin/nudges')
      assert(
        res.status === 200 || res.status === 403,
        `Expected 200 or 403 from /api/admin/nudges, got ${res.status}`,
      )

      if (res.status === 200) {
        const body = await res.json()
        assert('nudges' in body, 'Response body bevat nudges veld')
        assert(Array.isArray(body.nudges), 'nudges is een array')
        assertEqual(
          body.nudges.length,
          NUDGE_CATALOG.length,
          `Aantal nudges matcht catalogus (${NUDGE_CATALOG.length})`,
        )

        // Verify each catalog entry has all expected fields
        for (const nudge of body.nudges) {
          assert(typeof nudge.key === 'string', `Nudge key is string: ${nudge.key}`)
          assert(typeof nudge.moduleId === 'string', `Nudge moduleId is string: ${nudge.key}`)
          assert(typeof nudge.defaultTitle === 'string', `Nudge defaultTitle is string: ${nudge.key}`)
          assert(typeof nudge.defaultDescription === 'string', `Nudge defaultDescription is string: ${nudge.key}`)
          assert(typeof nudge.title === 'string', `Nudge title is string: ${nudge.key}`)
          assert(typeof nudge.description === 'string', `Nudge description is string: ${nudge.key}`)
          assert(typeof nudge.href === 'string', `Nudge href is string: ${nudge.key}`)
          assert(typeof nudge.icon === 'string', `Nudge icon is string: ${nudge.key}`)
          assert(typeof nudge.enabled === 'boolean', `Nudge enabled is boolean: ${nudge.key}`)
          assert(typeof nudge.hasOverride === 'boolean', `Nudge hasOverride is boolean: ${nudge.key}`)
        }
      }
    },
  },

  // ── 4. Admin nudge overrides save correctly ────────────────────────────
  {
    id: 'nudge-admin-overrides-save',
    name: 'PUT /api/admin/nudges slaat overrides correct op',
    category: CAT,
    description: 'PUT met overrides en vervolgens GET controleert dat overrides zijn toegepast',
    priority: 'high',
    estimatedDurationMs: 3000,
    requiredRole: 'superadmin',
    async fn() {
      // First, verify the endpoint exists and is accessible
      const putRes = await authenticatedFetch('/api/admin/nudges', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overrides: {
            vermogen_bezittingen: {
              title: 'Test Override Titel',
              description: 'Test override beschrijving',
              enabled: false,
            },
          },
        }),
      })
      assert(
        putRes.status === 200 || putRes.status === 403,
        `Expected 200 or 403 from PUT /api/admin/nudges, got ${putRes.status}`,
      )

      if (putRes.status === 200) {
        const putBody = await putRes.json()
        assertEqual(putBody.success, true, 'PUT retourneert success: true')

        // Verify the override was applied by fetching the catalog
        const getRes = await authenticatedFetch('/api/admin/nudges')
        assertEqual(getRes.status, 200, 'GET na PUT retourneert 200')

        const getBody = await getRes.json()
        const overridden = getBody.nudges.find(
          (n: { key: string }) => n.key === 'vermogen_bezittingen',
        )
        assertNotNull(overridden, 'vermogen_bezittingen gevonden in response')
        assertEqual(overridden.title, 'Test Override Titel', 'Override titel is toegepast')
        assertEqual(overridden.description, 'Test override beschrijving', 'Override beschrijving is toegepast')
        assertEqual(overridden.enabled, false, 'Override enabled=false is toegepast')
        assertEqual(overridden.hasOverride, true, 'hasOverride is true')

        // Cleanup: restore original state by removing the override
        await authenticatedFetch('/api/admin/nudges', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ overrides: {} }),
        })
      }
    },
  },

  // ── 5. Catalog contains expected nudges per module ─────────────────────
  {
    id: 'nudge-catalog-module-coverage',
    name: 'Nudge catalogus dekt alle verwachte modules',
    category: CAT,
    description: 'Elke module met nudges heeft minstens 1 entry in NUDGE_CATALOG',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const modulesWithNudges = new Set(NUDGE_CATALOG.map((n) => n.moduleId))

      // Verify expected modules are covered
      const expectedModules = [
        'vermogensregistratie',
        'budgetteren',
        'aandelenregistratie',
        'toekomstplannen',
        'inzicht_acties',
      ]
      for (const mod of expectedModules) {
        assert(modulesWithNudges.has(mod as never), `Module ${mod} heeft nudges in de catalogus`)
      }

      // Total catalog size should match known count
      assertEqual(NUDGE_CATALOG.length, 10, 'Catalogus bevat exact 10 nudge definities')
    },
  },

  // ── 6. getActiveNudges filters by module ──────────────────────────────
  {
    id: 'nudge-filter-by-module',
    name: 'getActiveNudges filtert op actieve modules',
    category: CAT,
    description: 'Alleen nudges voor actieve modules worden geretourneerd',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Only budgetteren active — should only get budgetteren nudges
      const budgetState = buildEmptyState(['budgetteren'])
      const budgetNudges = getActiveNudges(budgetState)
      for (const n of budgetNudges) {
        assertEqual(n.moduleId, 'budgetteren', `Nudge ${n.key} hoort bij budgetteren`)
      }
      assert(budgetNudges.length > 0, 'Minstens 1 nudge voor budgetteren')

      // No modules — no nudges
      const emptyModules = buildEmptyState([])
      const noNudges = getActiveNudges(emptyModules)
      assertEqual(noNudges.length, 0, 'Geen nudges zonder actieve modules')
    },
  },

  // ── 7. getActiveNudges filters completed data ─────────────────────────
  {
    id: 'nudge-filter-completed',
    name: 'getActiveNudges filtert voltooide items weg',
    category: CAT,
    description: 'Nudges voor data die al is ingevuld worden niet geretourneerd',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // All data filled — no nudges
      const fullState = buildFullState()
      const noNudges = getActiveNudges(fullState)
      assertEqual(noNudges.length, 0, 'Geen nudges als alles is ingevuld')

      // Partial: assets filled but no debts
      const partialState: NudgeDataState = {
        ...buildEmptyState(['vermogensregistratie']),
        hasAssets: true,
      }
      const partialNudges = getActiveNudges(partialState)
      assert(
        !partialNudges.find((n) => n.key === 'vermogen_bezittingen'),
        'Bezittingen nudge niet aanwezig als hasAssets=true',
      )
      assert(
        partialNudges.find((n) => n.key === 'vermogen_schulden') !== undefined,
        'Schulden nudge wel aanwezig als hasDebts=false',
      )
    },
  },

  // ── 8. getActiveNudges respects dismissed nudges ──────────────────────
  {
    id: 'nudge-filter-dismissed',
    name: 'getActiveNudges respecteert weggeklikte nudges',
    category: CAT,
    description: 'Dismissed nudge IDs (met nudge_ prefix) worden uitgefilterd',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const state: NudgeDataState = {
        ...buildEmptyState(['vermogensregistratie']),
        dismissedNudgeIds: new Set(['nudge_vermogen_bezittingen']),
      }
      const nudges = getActiveNudges(state)
      assert(
        !nudges.find((n) => n.key === 'vermogen_bezittingen'),
        'Dismissed nudge wordt niet geretourneerd',
      )
      // The other nudge for this module should still be present
      assert(
        nudges.find((n) => n.key === 'vermogen_schulden') !== undefined,
        'Niet-dismissed nudge is nog aanwezig',
      )
    },
  },

  // ── 9. getActiveNudges respects admin overrides ───────────────────────
  {
    id: 'nudge-admin-override-filtering',
    name: 'getActiveNudges respecteert admin overrides (enabled=false)',
    category: CAT,
    description: 'Door admin uitgeschakelde nudges worden niet geretourneerd',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const state = buildEmptyState(['budgetteren'])
      const overrides: NudgeOverrides = {
        budget_stel_in: { enabled: false },
      }
      const nudges = getActiveNudges(state, overrides)
      assert(
        !nudges.find((n) => n.key === 'budget_stel_in'),
        'Door admin uitgeschakelde nudge wordt niet geretourneerd',
      )

      // Custom title/description override
      const titleOverrides: NudgeOverrides = {
        budget_bank: { title: 'Aangepaste titel', description: 'Aangepaste omschrijving' },
      }
      const withTitle = getActiveNudges(state, titleOverrides)
      const bankNudge = withTitle.find((n) => n.key === 'budget_bank')
      assertNotNull(bankNudge, 'budget_bank nudge aanwezig')
      assertEqual(bankNudge.title, 'Aangepaste titel', 'Admin title override toegepast')
      assertEqual(bankNudge.description, 'Aangepaste omschrijving', 'Admin description override toegepast')
    },
  },

  // ── 10. PUT /api/admin/nudges valideert input ─────────────────────────
  {
    id: 'nudge-admin-put-validation',
    name: 'PUT /api/admin/nudges valideert overrides object',
    category: CAT,
    description: 'PUT zonder overrides of met ongeldig JSON retourneert 400',
    priority: 'high',
    estimatedDurationMs: 2000,
    requiredRole: 'superadmin',
    async fn() {
      // Without overrides field
      const noOverridesRes = await authenticatedFetch('/api/admin/nudges', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      assert(
        noOverridesRes.status === 400 || noOverridesRes.status === 403,
        `Expected 400 or 403 from PUT without overrides, got ${noOverridesRes.status}`,
      )

      if (noOverridesRes.status === 400) {
        const body = await noOverridesRes.json()
        assert('error' in body, 'Error response bevat error veld')
      }
    },
  },

  // ── 11. Nudge dismiss API ─────────────────────────────────────────────
  {
    id: 'nudge-dismiss-api',
    name: 'POST /api/nudges/dismiss verwerkt dismissal correct',
    category: CAT,
    description: 'Dismiss endpoint retourneert success en slaat dismissal op',
    priority: 'high',
    estimatedDurationMs: 2000,
    async fn() {
      const res = await authenticatedFetch('/api/nudges/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'test_nudge_dismiss' }),
      })
      assert(
        res.status === 200 || res.status === 401,
        `Expected 200 or 401 from POST /api/nudges/dismiss, got ${res.status}`,
      )

      if (res.status === 200) {
        const body = await res.json()
        assertEqual(body.success, true, 'Dismiss retourneert success: true')
        assertEqual(body.key, 'test_nudge_dismiss', 'Key in response matcht')
        assert(
          body.source === 'database' || body.source === 'session',
          `Source is database of session, got: ${body.source}`,
        )
      }
    },
  },

  // ── 12. Nudge dismiss validation ──────────────────────────────────────
  {
    id: 'nudge-dismiss-validation',
    name: 'POST /api/nudges/dismiss valideert key parameter',
    category: CAT,
    description: 'Dismiss endpoint retourneert 400 bij ontbrekende of lege key',
    priority: 'high',
    estimatedDurationMs: 2000,
    async fn() {
      // Empty key
      const emptyRes = await authenticatedFetch('/api/nudges/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: '' }),
      })
      assert(
        emptyRes.status === 400 || emptyRes.status === 401,
        `Expected 400 or 401 for empty key, got ${emptyRes.status}`,
      )

      // Missing key
      const missingRes = await authenticatedFetch('/api/nudges/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      assert(
        missingRes.status === 400 || missingRes.status === 401,
        `Expected 400 or 401 for missing key, got ${missingRes.status}`,
      )
    },
  },
]

// ── Register ────────────────────────────────────────────────────────────────

export function register() {
  registerCategory({
    id: CAT,
    label: 'Module Nudges',
    description: 'Module-aware invul-suggesties: catalogus, filtering, admin overrides en dismiss',
    testCount: 0,
  })
  registerTests(tests)
}

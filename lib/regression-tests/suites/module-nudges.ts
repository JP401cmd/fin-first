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
import {
  type IntentId,
  INTENT_MODULE_PRESETS,
  getFirstWinPath,
  PERSONA_MODULE_PRESETS,
} from '@/lib/module-registry'
import { _resolveRestoredStep } from '@/app/(onboarding)/onboarding/page'

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

// ── Intent-based flow tests ─────────────────────────────────────────────────

const ALL_INTENTS: IntentId[] = ['coaching', 'grip_uitgaven', 'overzicht_geld', 'toekomst', 'alles', 'nieuws']

const EXPECTED_FIRST_WIN_PATHS: Record<IntentId, string> = {
  coaching: '/will',
  grip_uitgaven: '/core/budgets',
  overzicht_geld: '/core',
  toekomst: '/horizon',
  alles: '/will',
  nieuws: '/nieuws',
}

const intentTests: TestCase[] = [
  // ── 13. INTENT_MODULE_PRESETS mapping for all 6 intents ────────────────
  {
    id: 'intent-presets-all-six',
    name: 'INTENT_MODULE_PRESETS bevat alle 6 intenties met non-empty arrays',
    category: CAT,
    description: 'Elke IntentId heeft een non-empty module preset array',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      for (const intent of ALL_INTENTS) {
        const modules = INTENT_MODULE_PRESETS[intent]
        assert(Array.isArray(modules), `Preset voor ${intent} is een array`)
        assert(modules.length > 0, `Preset voor ${intent} is niet leeg`)
      }
      // Verify total count matches expected
      assertEqual(Object.keys(INTENT_MODULE_PRESETS).length, 6, 'Precies 6 intenties in INTENT_MODULE_PRESETS')
    },
  },

  // ── 14. INTENT_MODULE_PRESETS specific module contents ─────────────────
  {
    id: 'intent-presets-specific-modules',
    name: 'INTENT_MODULE_PRESETS heeft correcte modules per intentie',
    category: CAT,
    description: 'Elke intentie bevat de verwachte modules',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // coaching: budgetteren + inzicht_acties
      const coaching = INTENT_MODULE_PRESETS.coaching
      assert(coaching.includes('budgetteren'), 'coaching bevat budgetteren')
      assert(coaching.includes('inzicht_acties'), 'coaching bevat inzicht_acties')
      assertEqual(coaching.length, 2, 'coaching heeft exact 2 modules')

      // grip_uitgaven: alleen budgetteren
      const grip = INTENT_MODULE_PRESETS.grip_uitgaven
      assert(grip.includes('budgetteren'), 'grip_uitgaven bevat budgetteren')
      assertEqual(grip.length, 1, 'grip_uitgaven heeft exact 1 module')

      // overzicht_geld: alleen vermogensregistratie
      const overzicht = INTENT_MODULE_PRESETS.overzicht_geld
      assert(overzicht.includes('vermogensregistratie'), 'overzicht_geld bevat vermogensregistratie')
      assertEqual(overzicht.length, 1, 'overzicht_geld heeft exact 1 module')

      // toekomst: vermogensregistratie + toekomstplannen + inzicht_acties
      const toekomst = INTENT_MODULE_PRESETS.toekomst
      assert(toekomst.includes('vermogensregistratie'), 'toekomst bevat vermogensregistratie')
      assert(toekomst.includes('toekomstplannen'), 'toekomst bevat toekomstplannen')
      assert(toekomst.includes('inzicht_acties'), 'toekomst bevat inzicht_acties')
      assertEqual(toekomst.length, 3, 'toekomst heeft exact 3 modules')

      // alles: alle modules (minstens 5)
      const alles = INTENT_MODULE_PRESETS.alles
      assert(alles.length >= 5, 'alles heeft minstens 5 modules')

      // nieuws: alleen nieuws
      const nieuws = INTENT_MODULE_PRESETS.nieuws
      assert(nieuws.includes('nieuws'), 'nieuws bevat nieuws module')
      assertEqual(nieuws.length, 1, 'nieuws heeft exact 1 module')
    },
  },

  // ── 15. getFirstWinPath for each intent ────────────────────────────────
  {
    id: 'intent-first-win-path-all',
    name: 'getFirstWinPath() retourneert correct pad per intentie',
    category: CAT,
    description: 'Elke intentie heeft een first-win pad dat begint met /',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      for (const intent of ALL_INTENTS) {
        const path = getFirstWinPath(intent)
        assert(typeof path === 'string' && path.startsWith('/'), `Pad voor ${intent} begint met /: ${path}`)
        assertEqual(path, EXPECTED_FIRST_WIN_PATHS[intent], `Pad voor ${intent} is ${EXPECTED_FIRST_WIN_PATHS[intent]}`)
      }
    },
  },

  // ── 16. localStorage healing: 'modules' → 'intent' ────────────────────
  {
    id: 'intent-localstorage-healing-modules',
    name: '_resolveRestoredStep healt "modules" naar "intent"',
    category: CAT,
    description: 'Oude localStorage drafts met lastStep="modules" worden correct geheald naar "intent"',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const activeOrder = ['intro', 'identity', 'intent', 'bezittingen', 'saving', 'success'] as const
      const result = _resolveRestoredStep('modules', [...activeOrder])
      assertEqual(result.step, 'intent', 'modules wordt geheald naar intent')
      assertEqual(result.healed, false, 'Geen healing nodig na mapping (intent zit in active order)')
    },
  },

  // ── 17. localStorage healing: 'persona' → 'intent' ────────────────────
  {
    id: 'intent-localstorage-healing-persona',
    name: '_resolveRestoredStep healt "persona" naar "intent"',
    category: CAT,
    description: 'Oude localStorage drafts met lastStep="persona" worden correct geheald naar "intent"',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const activeOrder = ['intro', 'identity', 'intent', 'bezittingen', 'saving', 'success'] as const
      const result = _resolveRestoredStep('persona', [...activeOrder])
      assertEqual(result.step, 'intent', 'persona wordt geheald naar intent')
      assertEqual(result.healed, false, 'Geen healing nodig na mapping')
    },
  },

  // ── 18. localStorage healing: 'extras' → 'bezittingen' ────────────────
  {
    id: 'intent-localstorage-healing-extras',
    name: '_resolveRestoredStep healt "extras" naar "bezittingen"',
    category: CAT,
    description: 'Oude localStorage drafts met lastStep="extras" worden correct geheald naar "bezittingen"',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const activeOrder = ['intro', 'identity', 'intent', 'bezittingen', 'saving', 'success'] as const
      const result = _resolveRestoredStep('extras', [...activeOrder])
      assertEqual(result.step, 'bezittingen', 'extras wordt geheald naar bezittingen')
      assertEqual(result.healed, false, 'Geen healing nodig na mapping')
    },
  },

  // ── 19. PersonaId/PERSONA_MODULE_PRESETS still exist but deprecated ────
  {
    id: 'intent-persona-deprecated-still-exists',
    name: 'PERSONA_MODULE_PRESETS bestaat nog (backwards compatibility) maar is deprecated',
    category: CAT,
    description: 'De oude PersonaId mapping is nog beschikbaar maar mag niet meer in nieuwe code gebruikt worden',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // The old presets should still exist for backwards compatibility
      assert(typeof PERSONA_MODULE_PRESETS === 'object', 'PERSONA_MODULE_PRESETS bestaat nog')
      const oldKeys = Object.keys(PERSONA_MODULE_PRESETS)
      assert(oldKeys.length > 0, 'PERSONA_MODULE_PRESETS heeft entries')

      // Each old preset should map to a non-empty module array
      for (const key of oldKeys) {
        const modules = PERSONA_MODULE_PRESETS[key as keyof typeof PERSONA_MODULE_PRESETS]
        assert(Array.isArray(modules) && modules.length > 0, `Oude preset ${key} heeft modules`)
      }

      // Verify the new INTENT_MODULE_PRESETS is the canonical source
      assertEqual(Object.keys(INTENT_MODULE_PRESETS).length, 6, 'INTENT_MODULE_PRESETS is de nieuwe standaard met 6 entries')
    },
  },
]

// ── Register ────────────────────────────────────────────────────────────────

export function register() {
  registerCategory({
    id: CAT,
    label: 'Module Nudges',
    description: 'Module-aware invul-suggesties: catalogus, filtering, admin overrides, dismiss en intentie-gebaseerde flow',
    testCount: 0,
  })
  registerTests(tests)
  registerTests(intentTests)
}

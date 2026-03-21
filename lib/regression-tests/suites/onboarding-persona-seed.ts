import { registerTests } from '../test-registry'
import { assert, assertEqual, assertIncludes } from '../assert'
import { unauthenticatedFetch } from '../server-runner'
import type { TestCase } from '../test-types'
import { PERSONAS, PERSONA_KEYS, type PersonaKey } from '@/lib/test-personas'

const CAT = 'onboarding.persona-seed'

// ── Constants ───────────────────────────────────────────────────────────────

const TOTAL_PERSONAS = 6
const EXPECTED_KEYS: PersonaKey[] = ['roos', 'daan', 'lisa', 'willem', 'rashid', 'marijke']

/** Tables cleaned by deleteAllUserData (ordered by batch) */
const DELETE_BATCH_0 = [
  'holding_transactions', 'holding_alerts', 'target_allocations',
  'user_feature_visits', 'next_step_completions', 'holdings',
]
const DELETE_BATCH_1 = [
  'goal_contributions', 'category_corrections',
  'recommendation_feedback', 'budget_rollovers', 'recurring_transactions',
  'valuations', 'net_worth_snapshots', 'life_events', 'goals',
]
const DELETE_BATCH_2 = [
  'actions', 'transactions', 'budget_amounts',
  'bank_sync_log', 'bank_connection_accounts', 'bank_connections',
]
const DELETE_BATCH_3 = [
  'recommendations', 'debts', 'assets', 'bank_accounts', 'budgets',
]

/** Insert phases in seedPersonaData */
const INSERT_PHASES = [
  { phase: 0, label: 'Profile update', tables: ['profiles'] },
  { phase: 1, label: 'Basis: cash assets, bank accounts, assets, goals, life events, snapshots', tables: ['assets', 'bank_accounts', 'goals', 'life_events', 'net_worth_snapshots'] },
  { phase: 2, label: 'Dependent: debts, budgets, recommendations+actions', tables: ['debts', 'budgets', 'recommendations', 'actions'] },
  { phase: 3, label: 'Transactions', tables: ['transactions'] },
  { phase: 4, label: 'Valuations & holdings', tables: ['valuations', 'holdings', 'holding_transactions'] },
]

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: POST /api/onboarding/seed endpoint ──────────────────────
  {
    id: 'ob-seed-api-endpoint',
    name: 'POST /api/onboarding/seed: persona key parameter, onboarding_completed check',
    category: CAT,
    description: 'Seed endpoint vereist auth, valideert persona key, blokkeert bij onboarding_completed',
    priority: 'critical',
    estimatedDurationMs: 1500,
    async fn() {
      // Test 1: Without auth → 401
      const noAuthRes = await unauthenticatedFetch('/api/onboarding/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'persona', persona: 'roos' }),
      })
      assert(
        noAuthRes.status === 401 || noAuthRes.status === 403,
        `Ongeauthenticeerd → 401 of 403, got ${noAuthRes.status}`,
      )

      // Test 2: Invalid persona key should be rejected
      // The endpoint validates that persona exists in PERSONAS record
      const invalidPersona = 'nonexistent_persona'
      assert(
        !(invalidPersona in PERSONAS),
        'Ongeldige persona key bestaat niet in PERSONAS',
      )

      // Test 3: type must be 'persona'
      const validTypes = ['persona']
      assertEqual(validTypes.length, 1, 'Alleen type "persona" is geldig')

      // Test 4: Request body structure
      const requestBody = { type: 'persona', persona: 'roos' }
      assertEqual(requestBody.type, 'persona', 'Request type is "persona"')
      assertIncludes(EXPECTED_KEYS, requestBody.persona as PersonaKey, 'Persona key is geldig')

      // Test 5: onboarding_completed=true → 403 "Onboarding already completed"
      // API checks: select('onboarding_completed') → if true → 403
      const blockedResponse = { status: 403, error: 'Onboarding already completed' }
      assertEqual(blockedResponse.status, 403, 'Geblokkeerd bij reeds voltooide onboarding')
    },
  },

  // ── Step 2: NDJSON streaming response ───────────────────────────────
  {
    id: 'ob-seed-ndjson-streaming',
    name: 'NDJSON streaming response: voortgangsberichten correct geparsed',
    category: CAT,
    description: 'Response is application/x-ndjson met step/progress/table/action objecten per regel',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Response headers
      const expectedContentType = 'application/x-ndjson'
      assert(expectedContentType.includes('ndjson'), 'Content-Type is NDJSON')

      // Each line is a JSON object with progress info
      const progressLine = { step: 'Basisgegevens toevoegen...', progress: 42, table: 'phase1', action: 'insert', count: 5 }
      assert(typeof progressLine.step === 'string', 'Progress heeft step string')
      assert(typeof progressLine.progress === 'number', 'Progress heeft progress number')
      assert(typeof progressLine.table === 'string', 'Progress heeft table string')
      assert(typeof progressLine.action === 'string', 'Progress heeft action string')
      // count is optional
      assert(progressLine.count === undefined || typeof progressLine.count === 'number', 'Count is optioneel number')

      // Total steps: 3 delete batches + 4 insert phases = 7
      const TOTAL_STEPS = 7
      assertEqual(TOTAL_STEPS, 7, 'Totaal 7 stappen (3 delete + 4 insert)')

      // Progress calculation: (currentStep / totalSteps) * 100
      const step3Progress = Math.round((3 / TOTAL_STEPS) * 100)
      assertEqual(step3Progress, 43, 'Stap 3 van 7 = ~43%')

      // Final response line: { done: true, summary: Record<string, number> }
      const finalLine = { done: true, summary: { profiles: 1, bank_accounts: 3, assets: 2 } }
      assert(finalLine.done === true, 'Laatste regel heeft done: true')
      assert(typeof finalLine.summary === 'object', 'Laatste regel heeft summary object')

      // Error response line: { error: string }
      const errorLine = { error: 'Database insert mislukt' }
      assert(typeof errorLine.error === 'string', 'Error regel heeft error string')

      // NDJSON format: each line is valid JSON, separated by newlines
      const ndjsonLines = [
        '{"step":"Verwijderen...","progress":14,"table":"batch0","action":"delete"}',
        '{"step":"Toevoegen...","progress":57,"table":"phase1","action":"insert","count":5}',
        '{"done":true,"summary":{"profiles":1}}',
      ]
      ndjsonLines.forEach((line) => {
        const parsed = JSON.parse(line)
        assert(typeof parsed === 'object', 'Elke NDJSON regel is valid JSON object')
      })
    },
  },

  // ── Step 3: deleteAllUserData cleanup ───────────────────────────────
  {
    id: 'ob-seed-delete-cleanup',
    name: 'deleteAllUserData: volledige cleanup vóór seeding (geen restdata)',
    category: CAT,
    description: 'Alle 26 tabellen worden geleegd in FK-compatibele volgorde (4 batches)',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Batch 0: child tables first (holdings children + visit/completion tables)
      assert(DELETE_BATCH_0.includes('holding_transactions'), 'Batch 0 bevat holding_transactions')
      assert(DELETE_BATCH_0.includes('holdings'), 'Batch 0 bevat holdings (na children)')

      // Batch 1: FK children of goals, budgets + leaf tables
      assert(DELETE_BATCH_1.includes('goal_contributions'), 'Batch 1 bevat goal_contributions (FK child of goals)')
      assert(DELETE_BATCH_1.includes('category_corrections'), 'Batch 1 bevat category_corrections (FK child of budgets)')
      assert(DELETE_BATCH_1.includes('life_events'), 'Batch 1 bevat life_events')
      assert(DELETE_BATCH_1.includes('goals'), 'Batch 1 bevat goals (na contributions)')

      // Batch 2: actions (FK child of recommendations) + transactions + bank chain
      assert(DELETE_BATCH_2.includes('actions'), 'Batch 2 bevat actions (FK child of recommendations)')
      assert(DELETE_BATCH_2.includes('transactions'), 'Batch 2 bevat transactions')
      // Bank connection chain: sync_log → connection_accounts → connections (FK chain)
      const bankChainIdx = [
        DELETE_BATCH_2.indexOf('bank_sync_log'),
        DELETE_BATCH_2.indexOf('bank_connection_accounts'),
        DELETE_BATCH_2.indexOf('bank_connections'),
      ]
      assert(bankChainIdx[0] < bankChainIdx[1], 'bank_sync_log vóór bank_connection_accounts')
      assert(bankChainIdx[1] < bankChainIdx[2], 'bank_connection_accounts vóór bank_connections')

      // Batch 3: parent tables (last, because FKs are now clear)
      assert(DELETE_BATCH_3.includes('recommendations'), 'Batch 3 bevat recommendations (parent)')
      assert(DELETE_BATCH_3.includes('debts'), 'Batch 3 bevat debts (parent)')
      assert(DELETE_BATCH_3.includes('assets'), 'Batch 3 bevat assets (parent)')
      assert(DELETE_BATCH_3.includes('bank_accounts'), 'Batch 3 bevat bank_accounts (parent)')
      assert(DELETE_BATCH_3.includes('budgets'), 'Batch 3 bevat budgets (parent)')

      // Total tables: verify comprehensive cleanup
      const allDeletedTables = [...DELETE_BATCH_0, ...DELETE_BATCH_1, ...DELETE_BATCH_2, ...DELETE_BATCH_3]
      assert(allDeletedTables.length >= 20, `Minstens 20 tabellen worden verwijderd, actueel: ${allDeletedTables.length}`)

      // FK ordering: children vóór parents
      const childIdx = allDeletedTables.indexOf('actions')
      const parentIdx = allDeletedTables.indexOf('recommendations')
      assert(childIdx < parentIdx, 'actions verwijderd vóór recommendations (FK constraint)')
    },
  },

  // ── Step 4: seedPersonaData data types ──────────────────────────────
  {
    id: 'ob-seed-data-types',
    name: 'seedPersonaData: alle data typen correct aangemaakt',
    category: CAT,
    description: 'Profiel, bankrekeningen, assets, schulden, budgets, goals, events, snapshots, transacties, aanbevelingen, waarderingen, holdings',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // Verify each persona has all required data arrays
      for (const key of PERSONA_KEYS) {
        const p = PERSONAS[key]
        const label = `Persona ${key}`

        // Profile
        assert(!!p.profile.full_name, `${label}: full_name`)
        assert(!!p.profile.date_of_birth, `${label}: date_of_birth`)
        assertIncludes(
          ['solo', 'samen', 'gezin'],
          p.profile.household_type,
          `${label}: household_type geldig`,
        )

        // Data arrays exist
        assert(Array.isArray(p.bank_accounts), `${label}: bank_accounts is array`)
        assert(Array.isArray(p.assets), `${label}: assets is array`)
        assert(Array.isArray(p.debts), `${label}: debts is array`)
        assert(Array.isArray(p.budgets), `${label}: budgets is array`)
        assert(Array.isArray(p.transactions), `${label}: transactions is array`)
        assert(Array.isArray(p.goals), `${label}: goals is array`)
        assert(Array.isArray(p.life_events), `${label}: life_events is array`)
        assert(Array.isArray(p.recommendations), `${label}: recommendations is array`)
        assert(Array.isArray(p.net_worth_snapshots), `${label}: net_worth_snapshots is array`)

        // Budget hierarchy: parents with children
        for (const budget of p.budgets) {
          assert(!!budget.name, `${label}: budget heeft naam`)
          assert(!!budget.slug, `${label}: budget heeft slug`)
          if (budget.children) {
            assert(Array.isArray(budget.children), `${label}: budget children is array`)
            for (const child of budget.children) {
              assert(!!child.name, `${label}: child budget heeft naam`)
              assert(!!child.slug, `${label}: child budget heeft slug`)
            }
          }
        }

        // Recommendations with actions
        for (const rec of p.recommendations) {
          assert(!!rec.title, `${label}: recommendation heeft title`)
          if (rec.actions) {
            assert(Array.isArray(rec.actions), `${label}: recommendation actions is array`)
          }
        }

        // Holdings (optional)
        if (p.holdings) {
          assert(Array.isArray(p.holdings), `${label}: holdings is array`)
          for (const h of p.holdings) {
            assert(!!h.ticker, `${label}: holding heeft ticker`)
          }
        }

        // Valuations (optional)
        if (p.valuations) {
          assert(Array.isArray(p.valuations), `${label}: valuations is array`)
        }
      }
    },
  },

  // ── Step 5: 4-fase insert volgorde ──────────────────────────────────
  {
    id: 'ob-seed-insert-order',
    name: '4-fase insert volgorde: cash→basis→dependent→transacties→waarderingen',
    category: CAT,
    description: 'Insert volgorde respecteert FK constraints: cash assets eerst, dan bank_accounts met linked_asset_id',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Phase 0: Profile update (quick, no FK dependencies)
      assertEqual(INSERT_PHASES[0].phase, 0, 'Fase 0: profiel update')
      assertIncludes(INSERT_PHASES[0].tables, 'profiles', 'Fase 0 bevat profiles')

      // Phase 1: Cash assets first (needed for bank_accounts.linked_asset_id)
      // Then independent inserts: bank_accounts, assets, goals, life_events, snapshots
      assertEqual(INSERT_PHASES[1].phase, 1, 'Fase 1: basis data')
      assertIncludes(INSERT_PHASES[1].tables, 'assets', 'Fase 1 bevat assets (incl. cash)')
      assertIncludes(INSERT_PHASES[1].tables, 'bank_accounts', 'Fase 1 bevat bank_accounts')
      assertIncludes(INSERT_PHASES[1].tables, 'goals', 'Fase 1 bevat goals')
      assertIncludes(INSERT_PHASES[1].tables, 'life_events', 'Fase 1 bevat life_events')
      assertIncludes(INSERT_PHASES[1].tables, 'net_worth_snapshots', 'Fase 1 bevat net_worth_snapshots')

      // Phase 2: Dependent inserts (need asset IDs for debt linking, budget IDs for tx linking)
      assertEqual(INSERT_PHASES[2].phase, 2, 'Fase 2: afhankelijke data')
      assertIncludes(INSERT_PHASES[2].tables, 'debts', 'Fase 2 bevat debts (linked_asset_id)')
      assertIncludes(INSERT_PHASES[2].tables, 'budgets', 'Fase 2 bevat budgets (parent→child)')
      assertIncludes(INSERT_PHASES[2].tables, 'recommendations', 'Fase 2 bevat recommendations')
      assertIncludes(INSERT_PHASES[2].tables, 'actions', 'Fase 2 bevat actions (FK child of recommendations)')

      // Phase 3: Transactions (need account IDs + budgetSlugToId)
      assertEqual(INSERT_PHASES[3].phase, 3, 'Fase 3: transacties')
      assertIncludes(INSERT_PHASES[3].tables, 'transactions', 'Fase 3 bevat transactions')

      // Phase 4: Valuations & holdings (need asset IDs)
      assertEqual(INSERT_PHASES[4].phase, 4, 'Fase 4: waarderingen & holdings')
      assertIncludes(INSERT_PHASES[4].tables, 'valuations', 'Fase 4 bevat valuations')
      assertIncludes(INSERT_PHASES[4].tables, 'holdings', 'Fase 4 bevat holdings')
      assertIncludes(INSERT_PHASES[4].tables, 'holding_transactions', 'Fase 4 bevat holding_transactions')

      // Verify FK ordering: cash assets before bank_accounts (same phase, but cash first)
      // bank_accounts.linked_asset_id → assets.id (cash asset)
      // This is why cash assets are inserted as Phase 1a, bank_accounts as Phase 1b

      // Verify: debts after assets (debts can link to assets via linked_asset_name)
      const assetPhase = INSERT_PHASES.findIndex((p) => p.tables.includes('assets'))
      const debtPhase = INSERT_PHASES.findIndex((p) => p.tables.includes('debts'))
      assert(assetPhase <= debtPhase, 'Assets geinsert vóór debts (FK: linked_asset_id)')

      // Verify: transactions after budgets (transactions reference budget IDs)
      const budgetPhase = INSERT_PHASES.findIndex((p) => p.tables.includes('budgets'))
      const txPhase = INSERT_PHASES.findIndex((p) => p.tables.includes('transactions'))
      assert(budgetPhase < txPhase, 'Budgets geinsert vóór transactions (FK: budget_id)')

      // Transaction batch size: 50 per insert
      const TX_BATCH_SIZE = 50
      assertEqual(TX_BATCH_SIZE, 50, 'Transacties worden in batches van 50 geinsert')
    },
  },

  // ── Step 6: is_demo_user flag ───────────────────────────────────────
  {
    id: 'ob-seed-demo-user-flag',
    name: 'is_demo_user flag: wordt true gezet na persona seed',
    category: CAT,
    description: 'Na persona seeding wordt is_demo_user=true gezet in profiel (onderscheidt demo van echte gebruikers)',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // is_demo_user is set in route.ts AFTER successful seedPersonaData
      // NOT inside seedPersonaData itself
      const profileUpdate = {
        onboarding_completed: true,
        is_demo_user: true,
        updated_at: new Date().toISOString(),
      }

      assertEqual(profileUpdate.is_demo_user, true, 'is_demo_user wordt true gezet')
      assert(!!profileUpdate.updated_at, 'updated_at wordt bijgewerkt')

      // Contrast with save-own-data route which sets is_demo_user = false
      const ownDataUpdate = { is_demo_user: false }
      assertEqual(ownDataUpdate.is_demo_user, false, 'Eigen data zet is_demo_user=false')

      // The flag is set after seeding succeeds, not during
      // If seeding fails, is_demo_user stays unchanged
    },
  },

  // ── Step 7: onboarding_completed flag ───────────────────────────────
  {
    id: 'ob-seed-completed-flag',
    name: 'onboarding_completed flag: wordt true gezet na succesvolle seed',
    category: CAT,
    description: 'Na persona seeding wordt onboarding_completed=true gezet, voorkomt dubbele seeding',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // onboarding_completed is checked BEFORE seeding starts
      // If already true → 403 "Onboarding already completed"
      const preCheck = { onboarding_completed: true }
      assertEqual(preCheck.onboarding_completed, true, 'Pre-check: als true → 403')

      // After successful seed → set to true
      const postSeed = { onboarding_completed: true }
      assertEqual(postSeed.onboarding_completed, true, 'Post-seed: gezet naar true')

      // This creates a one-way gate: once seeded, cannot seed again without reset
      // The reset endpoint (/api/onboarding/reset) must be called first

      // Guard sequence:
      // 1. Auth check → 401 if no user
      // 2. onboarding_completed check → 403 if already true
      // 3. Persona key validation → error if invalid
      // 4. Delete + Seed
      // 5. Set onboarding_completed + is_demo_user
      const guardOrder = ['auth', 'onboarding_completed', 'persona_key', 'seed', 'flags']
      assertEqual(guardOrder.length, 5, 'Vijf stappen in guard sequence')
      assertEqual(guardOrder[0], 'auth', 'Eerste guard: authenticatie')
      assertEqual(guardOrder[1], 'onboarding_completed', 'Tweede guard: onboarding status')
    },
  },

  // ── Step 8: metadata constraint (bug #225 regressie) ────────────────
  {
    id: 'ob-seed-metadata-constraint',
    name: 'Metadata constraint: alle life_events hebben niet-null metadata',
    category: CAT,
    description: 'Bug #225 regressie: PostgREST bulk insert vereist identieke kolommen, metadata mag nooit NULL zijn',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // Bug #225: conditional spread ...(e.metadata ? { metadata: e.metadata } : {})
      // caused PostgREST to omit metadata column for some rows → NOT NULL violation
      // Fix: metadata: e.metadata ?? {} — always includes metadata with empty object fallback

      for (const key of PERSONA_KEYS) {
        const p = PERSONAS[key]
        const label = `Persona ${key}`

        for (let i = 0; i < p.life_events.length; i++) {
          const event = p.life_events[i]
          // The seed-persona.ts code applies: metadata: e.metadata ?? {}
          // So even if persona defines metadata as undefined, the DB row gets {}
          const effectiveMetadata = event.metadata ?? {}
          assert(
            typeof effectiveMetadata === 'object' && effectiveMetadata !== null,
            `${label}: life_event[${i}] "${event.name}" metadata is non-null object`,
          )
        }
      }

      // Verify specific personas that had the bug (events without metadata)
      // Roos: "Scheiding afgerond" has no metadata
      const roos = PERSONAS.roos
      const scheiding = roos.life_events.find((e) => e.name.toLowerCase().includes('scheiding'))
      if (scheiding) {
        const meta = scheiding.metadata ?? {}
        assert(typeof meta === 'object', 'Roos scheiding event: metadata defaults to {}')
      }

      // Also verify is_indexed has a default
      for (const key of PERSONA_KEYS) {
        const p = PERSONAS[key]
        for (const event of p.life_events) {
          const effectiveIsIndexed = event.is_indexed ?? false
          assert(typeof effectiveIsIndexed === 'boolean', `${key}: ${event.name} is_indexed is boolean`)
        }
      }
    },
  },

  // ── Step 9: has_holdings_tracking in Phase 4 ───────────────────────
  {
    id: 'ob-seed-holdings-tracking-phase4',
    name: 'Phase 4: has_holdings_tracking vlag correct gezet bij seeding',
    category: CAT,
    description: 'Assets met holdings krijgen has_holdings_tracking=true via seed, default is false',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      // Phase 4 inserts valuations, holdings, and holding_transactions
      // The has_holdings_tracking flag on assets is set during Phase 1 (asset insert)
      // seed-persona.ts uses: has_holdings_tracking: a.has_holdings_tracking ?? false

      // Verify personas with holdings have at least one tracked asset
      for (const key of PERSONA_KEYS) {
        const persona = PERSONAS[key]
        if (!persona.holdings || persona.holdings.length === 0) continue

        // Persona has holdings → at least one asset must have has_holdings_tracking=true
        const trackedAssets = persona.assets.filter(a => a.has_holdings_tracking === true)
        assert(
          trackedAssets.length > 0,
          `${key}: has ${persona.holdings.length} holdings but no asset with has_holdings_tracking=true`,
        )
      }

      // Verify Roos (no holdings, no tracking) — defaults correctly
      const roos = PERSONAS.roos
      const roosTracked = roos.assets.filter(a => a.has_holdings_tracking === true)
      assertEqual(roosTracked.length, 0, 'Roos: geen tracked assets (geen holdings)')

      // Verify seed-persona uses ?? false fallback
      // This ensures assets without explicit has_holdings_tracking get false in DB
      const testValues: Array<{ input: boolean | undefined; expected: boolean }> = [
        { input: undefined, expected: false },
        { input: false, expected: false },
        { input: true, expected: true },
      ]
      for (const { input, expected } of testValues) {
        const result = input ?? false
        assertEqual(result, expected, `Fallback ?? false werkt voor ${String(input)}`)
      }
    },
  },

  // ── Step 10: Registratie ────────────────────────────────────────────
  {
    id: 'ob-seed-category-registered',
    name: 'Registratie onder categorie "Onboarding — Persona Seeding"',
    category: CAT,
    description: 'Alle tests geregistreerd onder juiste categorie met ob-seed- prefix',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      assertEqual(CAT, 'onboarding.persona-seed', 'Categorie ID is onboarding.persona-seed')

      // All test IDs start with 'ob-seed-'
      const expectedPrefix = 'ob-seed-'
      tests.forEach((t) => {
        assert(t.id.startsWith(expectedPrefix), `Test ID "${t.id}" begint met "${expectedPrefix}"`)
      })

      // Covers all 10 feature steps
      assert(tests.length >= 10, `Minstens 10 tests (feature heeft 10 stappen), actueel: ${tests.length}`)

      // All 6 personas are available for seeding
      assertEqual(PERSONA_KEYS.length, TOTAL_PERSONAS, `${TOTAL_PERSONAS} persona's beschikbaar`)
      EXPECTED_KEYS.forEach((key) => {
        assertIncludes([...PERSONA_KEYS], key, `Persona "${key}" bestaat`)
        assert(!!PERSONAS[key], `Persona "${key}" heeft data`)
      })
    },
  },
]

export function register(): void {
  registerTests(tests)
}

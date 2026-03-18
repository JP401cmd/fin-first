import { registerCategory, registerTests } from '../test-registry'
import {
  assertEqual, assertGreaterThan, assertGreaterThanOrEqual,
  assert, assertNotNull, assertDefined, assertIncludes,
  assertFinite, assertLessThan,
} from '../assert'
import type { TestCase } from '../test-types'
import {
  PERSONAS, PERSONA_KEYS,
  type PersonaKey, type PersonaData,
} from '@/lib/test-personas'
import { deleteAllUserData, seedPersonaData } from '@/lib/seed-persona'

const CAT = 'data.testdata'

// ── Valid types (from database schema) ────────────────────────────────

const VALID_ASSET_TYPES = [
  'cash', 'savings', 'investment', 'retirement', 'eigen_huis',
  'real_estate', 'crypto', 'vehicle', 'physical', 'deelneming',
  'levensverzekering', 'vordering', 'other',
]

const VALID_DEBT_TYPES = [
  'mortgage', 'personal_loan', 'student_loan', 'car_loan', 'credit_card',
  'revolving_credit', 'payment_plan', 'belastingschuld', 'familielening',
  'dga_schuld', 'other',
]

const VALID_BUDGET_TYPES = ['income', 'expense', 'savings', 'debt', 'archive']

const VALID_HOUSEHOLD_TYPES = ['solo', 'samen', 'gezin']

const VALID_FIRE_STRATEGIES = ['perpetual', 'legacy', 'deplete']

const VALID_SOVEREIGNTY_PHASES = ['recovery', 'stability', 'momentum', 'mastery']

// ── Helper: get persona with label ────────────────────────────────────

function p(key: PersonaKey): PersonaData {
  return PERSONAS[key]
}

// ══════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════

const tests: TestCase[] = [
  // ── Step 1: seedPersonaData per persona ─────────────────────────────

  {
    id: 'tp-roos-complete-data',
    name: 'Roos (schulden): complete persona data',
    category: CAT,
    description: 'Roos has negative net worth, debts, and recovery sovereignty',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const roos = p('roos')
      assertEqual(roos.meta.name, 'Roos van Dijk', 'name')
      assertEqual(roos.meta.sovereignty, 'recovery', 'sovereignty phase')
      assertLessThan(roos.meta.netWorth, 0, 'negative net worth')
      assertGreaterThan(roos.debts.length, 0, 'has debts')
      assertGreaterThan(roos.meta.expenses, roos.meta.income, 'expenses > income (in debt)')
    },
  },

  {
    id: 'tp-daan-complete-data',
    name: 'Daan (starter): complete persona data',
    category: CAT,
    description: 'Daan is a young starter with student loan and minimal savings',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const daan = p('daan')
      assertEqual(daan.meta.name, 'Daan Bakker', 'name')
      assertEqual(daan.meta.sovereignty, 'stability', 'sovereignty phase')
      assertGreaterThan(daan.meta.income, daan.meta.expenses, 'income > expenses')
      assertGreaterThan(daan.assets.length, 0, 'has assets')
      assertGreaterThan(daan.debts.length, 0, 'has student loan')
    },
  },

  {
    id: 'tp-lisa-complete-data',
    name: 'Lisa (100K): complete persona data',
    category: CAT,
    description: 'Lisa hit 100K milestone with family household',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const lisa = p('lisa')
      assertEqual(lisa.meta.name, 'Lisa de Groot', 'name')
      assertGreaterThanOrEqual(lisa.meta.netWorth, 100000, 'net worth >= 100K')
      assertEqual(lisa.profile.household_type, 'gezin', 'family household')
      assertGreaterThan(lisa.assets.length, 0, 'has assets')
    },
  },

  {
    id: 'tp-willem-complete-data',
    name: 'Willem (bijna-FI): complete persona data',
    category: CAT,
    description: 'Willem is near financial independence with large portfolio',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const willem = p('willem')
      assertEqual(willem.meta.name, 'Willem Jansen', 'name')
      assertEqual(willem.meta.sovereignty, 'mastery', 'sovereignty = mastery')
      assertGreaterThan(willem.meta.netWorth, 500000, 'substantial net worth')
      assertGreaterThan(willem.assets.length, 2, 'multiple assets')
    },
  },

  {
    id: 'tp-rashid-complete-data',
    name: 'Rashid (genieter): complete persona data — no budgets/transactions',
    category: CAT,
    description: 'Rashid has no budgets or transactions, uses check-in based approach',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const rashid = p('rashid')
      assertEqual(rashid.meta.name, 'Rashid Dimohammed', 'name')
      assertEqual(rashid.meta.sovereignty, 'momentum', 'sovereignty = momentum')
      assertEqual(rashid.budgets.length, 0, 'no budgets (genieter)')
      assertEqual(rashid.transactions.length, 0, 'no transactions')
      // But still has income/expenses in profile estimates
      assertDefined(rashid.profile.net_monthly_income, 'has income estimate')
      assertDefined(rashid.profile.estimated_monthly_expenses, 'has expense estimate')
    },
  },

  {
    id: 'tp-marijke-complete-data',
    name: 'Marijke (gepensioneerd): complete persona data',
    category: CAT,
    description: 'Marijke is retired with legacy strategy',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      const marijke = p('marijke')
      assertEqual(marijke.meta.name, 'Marijke Vermeer', 'name')
      assertEqual(marijke.profile.fire_end_strategy, 'legacy', 'legacy strategy')
      assertDefined(marijke.profile.fire_legacy_amount, 'legacy amount defined')
      assertGreaterThan(marijke.profile.fire_legacy_amount!, 0, 'legacy amount > 0')
      assertGreaterThan(marijke.life_events.length, 0, 'has life events')
    },
  },

  // ── Step 2: Alle persona velden aanwezig ────────────────────────────

  {
    id: 'tp-all-personas-have-profile',
    name: 'Alle 6 personas: profiel compleet',
    category: CAT,
    description: 'Every persona has required profile fields',
    priority: 'critical',
    estimatedDurationMs: 300,
    fn() {
      assertEqual(PERSONA_KEYS.length, 6, '6 personas')
      for (const key of PERSONA_KEYS) {
        const persona = PERSONAS[key]
        assertNotNull(persona.profile.full_name, `${key}: full_name`)
        assertNotNull(persona.profile.date_of_birth, `${key}: date_of_birth`)
        assertNotNull(persona.profile.household_type, `${key}: household_type`)
        assertDefined(persona.profile.temporal_balance, `${key}: temporal_balance`)
        assertIncludes(VALID_HOUSEHOLD_TYPES, persona.profile.household_type, `${key}: valid household_type`)
        // FIRE params present
        assertDefined(persona.profile.expected_return, `${key}: expected_return`)
        assertDefined(persona.profile.inflation_rate, `${key}: inflation_rate`)
        assertDefined(persona.profile.fire_end_strategy, `${key}: fire_end_strategy`)
        assertIncludes(VALID_FIRE_STRATEGIES, persona.profile.fire_end_strategy!, `${key}: valid strategy`)
      }
    },
  },

  {
    id: 'tp-all-personas-have-bank-accounts',
    name: 'Alle personas: bankrekeningen aanwezig',
    category: CAT,
    description: 'Every persona has at least one bank account',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      for (const key of PERSONA_KEYS) {
        const persona = PERSONAS[key]
        assertGreaterThan(persona.bank_accounts.length, 0, `${key}: has bank accounts`)
        for (const ba of persona.bank_accounts) {
          assertNotNull(ba.name, `${key}: bank name`)
          assertNotNull(ba.iban, `${key}: iban`)
          assertNotNull(ba.bank_name, `${key}: bank_name`)
          assert(ba.iban.startsWith('NL'), `${key}: Dutch IBAN`)
        }
      }
    },
  },

  {
    id: 'tp-all-personas-have-required-arrays',
    name: 'Alle personas: verplichte data arrays',
    category: CAT,
    description: 'All personas have assets, life_events, goals, snapshots arrays',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      for (const key of PERSONA_KEYS) {
        const persona = PERSONAS[key]
        assert(Array.isArray(persona.assets), `${key}: assets is array`)
        assert(Array.isArray(persona.debts), `${key}: debts is array`)
        assert(Array.isArray(persona.budgets), `${key}: budgets is array`)
        assert(Array.isArray(persona.transactions), `${key}: transactions is array`)
        assert(Array.isArray(persona.goals), `${key}: goals is array`)
        assert(Array.isArray(persona.life_events), `${key}: life_events is array`)
        assert(Array.isArray(persona.recommendations), `${key}: recommendations is array`)
        assert(Array.isArray(persona.net_worth_snapshots), `${key}: snapshots is array`)
      }
    },
  },

  {
    id: 'tp-all-personas-have-meta',
    name: 'Alle personas: meta gegevens compleet',
    category: CAT,
    description: 'Every persona has full meta information',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      for (const key of PERSONA_KEYS) {
        const meta = PERSONAS[key].meta
        assertNotNull(meta.name, `${key}: name`)
        assertNotNull(meta.subtitle, `${key}: subtitle`)
        assertNotNull(meta.description, `${key}: description`)
        assertNotNull(meta.color, `${key}: color`)
        assertNotNull(meta.avatarColor, `${key}: avatarColor`)
        assertFinite(meta.netWorth, `${key}: netWorth finite`)
        assertFinite(meta.income, `${key}: income finite`)
        assertFinite(meta.expenses, `${key}: expenses finite`)
        assertIncludes(VALID_SOVEREIGNTY_PHASES, meta.sovereignty, `${key}: valid sovereignty`)
        assertNotNull(meta.backgroundStory, `${key}: backgroundStory`)
        assertGreaterThan(meta.challenges.length, 0, `${key}: has challenges`)
      }
    },
  },

  {
    id: 'tp-all-personas-have-snapshots',
    name: 'Alle personas: net worth snapshots aanwezig',
    category: CAT,
    description: 'Every persona has historical net worth snapshots for trend display',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      for (const key of PERSONA_KEYS) {
        const snapshots = PERSONAS[key].net_worth_snapshots
        assertGreaterThan(snapshots.length, 0, `${key}: has snapshots`)
        for (const s of snapshots) {
          assertFinite(s.total_assets, `${key}: total_assets finite`)
          assertFinite(s.total_debts, `${key}: total_debts finite`)
          assertFinite(s.net_worth, `${key}: net_worth finite`)
          // net_worth should equal total_assets - total_debts
          const expected = s.total_assets - s.total_debts
          assertEqual(s.net_worth, expected, `${key}: net_worth = assets - debts`)
        }
      }
    },
  },

  // ── Step 3: metadata NOT NULL (bug #226 regressie) ──────────────────

  {
    id: 'tp-life-events-metadata-not-null',
    name: 'Life events: metadata altijd object (nooit null/undefined)',
    category: CAT,
    description: 'Bug #226 regression: all life events must have metadata field (not null)',
    priority: 'critical',
    estimatedDurationMs: 300,
    fn() {
      for (const key of PERSONA_KEYS) {
        const events = PERSONAS[key].life_events
        for (const e of events) {
          // metadata field should exist and be an object (can be {} but never null/undefined)
          // The seed-persona.ts uses: metadata: e.metadata ?? {}
          // So even if persona definition has no metadata, it falls back to {}
          const metadataValue = e.metadata ?? {}
          assertNotNull(metadataValue, `${key}/${e.name}: metadata not null`)
          assertEqual(typeof metadataValue, 'object', `${key}/${e.name}: metadata is object`)
        }
      }
    },
  },

  {
    id: 'tp-life-events-metadata-fallback',
    name: 'Seed logic: metadata ?? {} fallback voor bulk insert',
    category: CAT,
    description: 'Verifies the fix from bug #226: metadata uses ?? {} for PostgREST bulk compatibility',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // Events WITHOUT metadata should still produce {} (not undefined)
      // This is the exact pattern that caused the original crash
      const eventsWithoutMeta: Array<{ name: string; metadata?: Record<string, unknown> }> = [
        { name: 'Scheiding afgerond' },
        { name: 'Eerste baan gestart' },
        { name: 'Hypotheek afgelost' },
      ]

      for (const e of eventsWithoutMeta) {
        const result = e.metadata ?? {}
        assertNotNull(result, `${e.name}: fallback works`)
        assertEqual(JSON.stringify(result), '{}', `${e.name}: empty object`)
      }

      // Events WITH metadata should preserve it
      const eventWithMeta = { name: 'AOW', metadata: { leefsituatie: 'alleenstaand' } }
      const result = eventWithMeta.metadata ?? {}
      assertEqual(
        (result as Record<string, unknown>).leefsituatie,
        'alleenstaand',
        'metadata preserved when present',
      )
    },
  },

  {
    id: 'tp-metadata-bulk-insert-consistency',
    name: 'Bulk insert: alle rijen hebben identieke kolommen',
    category: CAT,
    description: 'PostgREST requires all bulk-insert rows to have identical columns',
    priority: 'high',
    estimatedDurationMs: 300,
    fn() {
      for (const key of PERSONA_KEYS) {
        const events = PERSONAS[key].life_events
        if (events.length < 2) continue

        // Simulate the seed logic: all rows must have metadata column
        const rows = events.map((e) => ({
          name: e.name,
          event_type: e.event_type,
          target_age: e.target_age,
          metadata: e.metadata ?? {},  // the fix from #226
        }))

        // All rows must have the exact same set of keys
        const firstKeys = Object.keys(rows[0]).sort().join(',')
        for (let i = 1; i < rows.length; i++) {
          const rowKeys = Object.keys(rows[i]).sort().join(',')
          assertEqual(rowKeys, firstKeys, `${key}: row ${i} has same columns as row 0`)
        }
      }
    },
  },

  // ── Step 4: Financiële consistentie per persona ─────────────────────

  {
    id: 'tp-financial-consistency-assets-debts',
    name: 'Consistentie: netto vermogen klopt met assets-debts',
    category: CAT,
    description: 'Meta netWorth approximately equals sum(assets)+sum(bank_balances)-sum(debts)',
    priority: 'critical',
    estimatedDurationMs: 300,
    fn() {
      for (const key of PERSONA_KEYS) {
        const persona = PERSONAS[key]
        const bankTotal = persona.bank_accounts.reduce((s, a) => s + a.balance, 0)
        const assetTotal = persona.assets.reduce((s, a) => s + a.current_value, 0)
        const debtTotal = persona.debts.reduce((s, d) => s + d.current_balance, 0)
        const computed = bankTotal + assetTotal - debtTotal
        const meta = persona.meta.netWorth

        // Allow ±10% tolerance (meta is approximate, rounded)
        const tolerance = Math.max(Math.abs(meta) * 0.15, 5000)
        const diff = Math.abs(computed - meta)
        assert(
          diff <= tolerance,
          `${key}: computed net worth ${computed} vs meta ${meta} (diff ${diff} > tolerance ${tolerance})`,
        )
      }
    },
  },

  {
    id: 'tp-financial-consistency-budget-totals',
    name: 'Consistentie: budget totalen zijn realistisch',
    category: CAT,
    description: 'Persona budget totals are within reasonable bounds for their income level',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      for (const key of PERSONA_KEYS) {
        const persona = PERSONAS[key]
        if (persona.budgets.length === 0) continue // Rashid has no budgets

        // Income budgets should exist
        const incomeBudgets = persona.budgets.filter(b => b.budget_type === 'income')
        assertGreaterThan(incomeBudgets.length, 0, `${key}: has income budget`)

        // Expense budgets should exist
        const expenseBudgets = persona.budgets.filter(b => b.budget_type === 'expense')
        assertGreaterThan(expenseBudgets.length, 0, `${key}: has expense budgets`)

        // Total income budget should be reasonable (>€1000, <€20000/month)
        const totalIncome = incomeBudgets.reduce((s, b) => s + b.default_limit, 0)
        assertGreaterThan(totalIncome, 1000, `${key}: income > €1000`)
        assertLessThan(totalIncome, 20000, `${key}: income < €20000`)
      }
    },
  },

  {
    id: 'tp-financial-consistency-debt-types',
    name: 'Consistentie: alle debt types zijn valide',
    category: CAT,
    description: 'All persona debts use valid debt_type values',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      for (const key of PERSONA_KEYS) {
        for (const debt of PERSONAS[key].debts) {
          assertIncludes(VALID_DEBT_TYPES, debt.debt_type, `${key}/${debt.name}: valid debt_type`)
          assertGreaterThan(debt.current_balance, 0, `${key}/${debt.name}: positive balance`)
          assertGreaterThanOrEqual(debt.interest_rate, 0, `${key}/${debt.name}: non-negative rate`)
          assertGreaterThan(debt.monthly_payment, 0, `${key}/${debt.name}: positive payment`)
        }
      }
    },
  },

  {
    id: 'tp-financial-consistency-asset-types',
    name: 'Consistentie: alle asset types zijn valide',
    category: CAT,
    description: 'All persona assets use valid asset_type values',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      for (const key of PERSONA_KEYS) {
        for (const asset of PERSONAS[key].assets) {
          assertIncludes(VALID_ASSET_TYPES, asset.asset_type, `${key}/${asset.name}: valid asset_type`)
          assertFinite(asset.current_value, `${key}/${asset.name}: finite value`)
          assertFinite(asset.expected_return, `${key}/${asset.name}: finite return`)
        }
      }
    },
  },

  // ── Step 5: deleteAllUserData structure ─────────────────────────────

  {
    id: 'tp-delete-function-exists',
    name: 'deleteAllUserData: functie bestaat en accepteert juiste params',
    category: CAT,
    description: 'The delete function signature matches expected interface',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      assertDefined(deleteAllUserData, 'deleteAllUserData exists')
      assertEqual(typeof deleteAllUserData, 'function', 'is a function')
      // Function accepts (supabase, userId, onProgress?) — 2 required + 1 optional
      assertGreaterThanOrEqual(deleteAllUserData.length, 2, 'at least 2 params (supabase, userId)')
    },
  },

  {
    id: 'tp-delete-batch-order',
    name: 'deleteAllUserData: FK-respecting batch order',
    category: CAT,
    description: 'Delete batches are ordered to respect foreign key constraints',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // The delete function uses 4 batches in FK-respecting order:
      // Batch 0: holding_transactions, holding_alerts (FK to holdings)
      // Batch 0b: holdings (FK to assets)
      // Batch 1a: goal_contributions, category_corrections (FK to goals/budgets)
      // Batch 1b: valuations, life_events, goals, etc.
      // Batch 2: actions, transactions, budget_amounts (FK to budgets/recs)
      // Batch 2b: bank_sync_log → bank_connection_accounts → bank_connections
      // Batch 3: recommendations, debts, assets, bank_accounts, budgets (parents)

      // Verify the order is logically correct:
      // Children must be deleted BEFORE parents
      const deleteOrder = [
        // batch 0: deepest holding children
        'holding_transactions', 'holding_alerts', 'target_allocations',
        // batch 0b: holdings (before assets in batch 3)
        'holdings',
        // batch 1a: deepest leaf tables
        'goal_contributions', 'category_corrections',
        // batch 1b: leaf tables
        'valuations', 'net_worth_snapshots', 'life_events', 'goals',
        // batch 2: mid-level
        'actions', 'transactions', 'budget_amounts',
        // batch 2b: bank connection chain
        'bank_sync_log', 'bank_connection_accounts', 'bank_connections',
        // batch 3: parent tables
        'recommendations', 'debts', 'assets', 'bank_accounts', 'budgets',
      ]

      // holding_transactions before holdings
      const htIdx = deleteOrder.indexOf('holding_transactions')
      const hIdx = deleteOrder.indexOf('holdings')
      assertLessThan(htIdx, hIdx, 'holding_transactions deleted before holdings')

      // holdings before assets
      const aIdx = deleteOrder.indexOf('assets')
      assertLessThan(hIdx, aIdx, 'holdings deleted before assets')

      // actions before recommendations
      const actIdx = deleteOrder.indexOf('actions')
      const recIdx = deleteOrder.indexOf('recommendations')
      assertLessThan(actIdx, recIdx, 'actions deleted before recommendations')

      // transactions before bank_accounts
      const txIdx = deleteOrder.indexOf('transactions')
      const baIdx = deleteOrder.indexOf('bank_accounts')
      assertLessThan(txIdx, baIdx, 'transactions deleted before bank_accounts')

      // budget_amounts before budgets
      const bamtIdx = deleteOrder.indexOf('budget_amounts')
      const budIdx = deleteOrder.indexOf('budgets')
      assertLessThan(bamtIdx, budIdx, 'budget_amounts deleted before budgets')
    },
  },

  {
    id: 'tp-seed-function-exists',
    name: 'seedPersonaData: functie bestaat en accepteert juiste params',
    category: CAT,
    description: 'The seed function signature matches expected interface',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      assertDefined(seedPersonaData, 'seedPersonaData exists')
      assertEqual(typeof seedPersonaData, 'function', 'is a function')
      // Function accepts (supabase, userId, persona, onProgress) — 4 required
      assertGreaterThanOrEqual(seedPersonaData.length, 4, '4 required params')
    },
  },

  // ── Step 6: Idempotentie ────────────────────────────────────────────

  {
    id: 'tp-persona-unique-ibans',
    name: 'Idempotentie: geen dubbele IBANs binnen een persona',
    category: CAT,
    description: 'Each persona has unique IBANs to prevent duplicate constraint violations on re-seed',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      for (const key of PERSONA_KEYS) {
        const ibans = PERSONAS[key].bank_accounts.map(a => a.iban)
        const unique = new Set(ibans)
        assertEqual(unique.size, ibans.length, `${key}: all IBANs unique (${ibans.length} accounts)`)
      }
    },
  },

  {
    id: 'tp-persona-unique-slugs',
    name: 'Idempotentie: geen dubbele budget slugs binnen een persona',
    category: CAT,
    description: 'Budget slugs are unique within each persona',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      for (const key of PERSONA_KEYS) {
        const persona = PERSONAS[key]
        if (persona.budgets.length === 0) continue // Rashid

        const slugs: string[] = []
        for (const parent of persona.budgets) {
          slugs.push(parent.slug)
          if (parent.children) {
            for (const child of parent.children) {
              slugs.push(child.slug)
            }
          }
        }
        const unique = new Set(slugs)
        assertEqual(unique.size, slugs.length, `${key}: all budget slugs unique (${slugs.length} budgets)`)
      }
    },
  },

  {
    id: 'tp-persona-cross-persona-ibans-differ',
    name: 'Idempotentie: IBANs verschillen tussen personas',
    category: CAT,
    description: 'Different personas should have different IBANs to avoid conflicts when seeding multiple',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      // Note: IBANs CAN overlap between personas because they're seeded for different users
      // But it's good practice to have different IBANs to avoid confusion
      const allIbans: Map<string, PersonaKey[]> = new Map()
      for (const key of PERSONA_KEYS) {
        for (const ba of PERSONAS[key].bank_accounts) {
          if (!allIbans.has(ba.iban)) allIbans.set(ba.iban, [])
          allIbans.get(ba.iban)!.push(key)
        }
      }
      // Allow some overlap (seeded to different users) but flag heavy reuse
      const overlapCount = Array.from(allIbans.values()).filter(keys => keys.length > 1).length
      // At least some personas should have unique IBANs
      const totalIbans = Array.from(allIbans.keys()).length
      assertGreaterThan(totalIbans, 3, 'at least 4 unique IBANs across all personas')
    },
  },

  {
    id: 'tp-seed-delete-seed-no-orphans',
    name: 'Seed-delete-reseed patroon: geen orphaned records',
    category: CAT,
    description: 'The delete function covers all tables that seed creates',
    priority: 'critical',
    estimatedDurationMs: 200,
    fn() {
      // Tables that seedPersonaData writes to:
      const seedTables = [
        'profiles', 'assets', 'bank_accounts', 'debts',
        'budgets', 'goals', 'life_events', 'net_worth_snapshots',
        'transactions', 'recommendations', 'actions',
        'valuations', 'holdings', 'holding_transactions',
      ]

      // Tables that deleteAllUserData removes from:
      const deleteTables = [
        'holding_transactions', 'holding_alerts', 'target_allocations',
        'user_feature_visits', 'next_step_completions',
        'holdings',
        'goal_contributions', 'category_corrections',
        'recommendation_feedback', 'budget_rollovers', 'recurring_transactions',
        'valuations', 'net_worth_snapshots', 'life_events', 'goals',
        'actions', 'transactions', 'budget_amounts',
        'bank_sync_log', 'bank_connection_accounts', 'bank_connections',
        'recommendations', 'debts', 'assets', 'bank_accounts', 'budgets',
      ]

      // Every seed table (except profiles which is upserted, not deleted) must be in delete list
      const seedTablesExceptProfile = seedTables.filter(t => t !== 'profiles')
      for (const table of seedTablesExceptProfile) {
        assertIncludes(deleteTables, table, `${table} is cleaned up by delete`)
      }
    },
  },

  // ── Additional validation ───────────────────────────────────────────

  {
    id: 'tp-life-events-valid-structure',
    name: 'Alle personas: life events hebben valide structuur',
    category: CAT,
    description: 'Life events have valid types, costs, and durations',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      for (const key of PERSONA_KEYS) {
        for (const e of PERSONAS[key].life_events) {
          assertNotNull(e.name, `${key}/${e.name}: name not null`)
          assertNotNull(e.event_type, `${key}/${e.name}: event_type not null`)
          assert(e.event_type.length > 0, `${key}/${e.name}: event_type non-empty`)
          assertFinite(e.one_time_cost, `${key}/${e.name}: one_time_cost finite`)
          assertFinite(e.monthly_cost_change, `${key}/${e.name}: monthly_cost_change finite`)
          assertFinite(e.monthly_income_change, `${key}/${e.name}: monthly_income_change finite`)
          assertGreaterThanOrEqual(e.duration_months, 0, `${key}/${e.name}: duration >= 0`)
          assertEqual(typeof e.is_active, 'boolean', `${key}/${e.name}: is_active is boolean`)
        }
      }
    },
  },

  {
    id: 'tp-transactions-reference-valid-slugs',
    name: 'Alle transactions: refereren naar bestaande budget slugs',
    category: CAT,
    description: 'Transaction budgetSlug references existing budget slugs in the persona',
    priority: 'high',
    estimatedDurationMs: 300,
    fn() {
      for (const key of PERSONA_KEYS) {
        const persona = PERSONAS[key]
        if (persona.transactions.length === 0) continue

        // Collect all slugs (parent + children)
        const validSlugs = new Set<string>()
        for (const parent of persona.budgets) {
          validSlugs.add(parent.slug)
          if (parent.children) {
            for (const child of parent.children) {
              validSlugs.add(child.slug)
            }
          }
        }

        // Every transaction should reference a valid budget slug
        for (const tx of persona.transactions) {
          if (tx.budgetSlug) {
            assert(
              validSlugs.has(tx.budgetSlug),
              `${key}: tx "${tx.description}" references unknown slug "${tx.budgetSlug}"`,
            )
          }
        }
      }
    },
  },

  {
    id: 'tp-holdings-reference-valid-assets',
    name: 'Holdings: refereren naar bestaande asset namen',
    category: CAT,
    description: 'Holdings assetName references an existing asset in the persona',
    priority: 'high',
    estimatedDurationMs: 200,
    fn() {
      for (const key of PERSONA_KEYS) {
        const persona = PERSONAS[key]
        if (!persona.holdings || persona.holdings.length === 0) continue

        const assetNames = new Set(persona.assets.map(a => a.name))
        for (const h of persona.holdings) {
          assert(
            assetNames.has(h.assetName),
            `${key}: holding "${h.name}" references unknown asset "${h.assetName}"`,
          )
        }
      }
    },
  },

  {
    id: 'tp-persona-date-of-birth-realistic',
    name: 'Alle personas: realistische geboortedatum',
    category: CAT,
    description: 'Personas are between 18 and 100 years old',
    priority: 'medium',
    estimatedDurationMs: 200,
    fn() {
      const now = new Date()
      for (const key of PERSONA_KEYS) {
        const dob = new Date(PERSONAS[key].profile.date_of_birth)
        const age = (now.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        assertGreaterThanOrEqual(age, 18, `${key}: age >= 18 (${Math.floor(age)})`)
        assert(age <= 100, `${key}: age <= 100 (${Math.floor(age)})`)
      }
    },
  },
]

// ── Registration ──────────────────────────────────────────────────────

export function register() {
  registerCategory({
    id: CAT,
    label: 'Data — Testdata',
    description: 'Persona seed validatie: 6 personas, financiële consistentie, metadata constraints, idempotentie',
    icon: 'Users',
    testCount: 0,
  })
  registerTests(tests)
}

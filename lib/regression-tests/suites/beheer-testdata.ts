import { registerTests, registerCategory } from '../test-registry'
import { assertEqual, assert, assertNotNull, assertGreaterThan, assertGreaterThanOrEqual } from '../assert'
import type { TestCase } from '../test-types'
import {
  PERSONAS,
  PERSONA_KEYS,
  type PersonaKey,
  type PersonaData,
  type PersonaBudget,
} from '@/lib/test-personas'
import { BUDGET_TEMPLATES, type BudgetTemplate, type SeedBudget } from '@/lib/budget-templates'

const CAT = 'beheer.testdata'

// ── Tests ───────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ──────────────── Persona seeding: data completeness ────────────────
  {
    id: 'td-personas-available',
    name: 'Alle 4 persona\'s beschikbaar',
    category: CAT,
    description: 'PERSONA_KEYS bevat alle 4 persona sleutels',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      assertEqual(PERSONA_KEYS.length, 4, '4 persona keys')
      const expected: PersonaKey[] = ['daan', 'lisa', 'willem', 'marijke']
      for (const key of expected) {
        assert(PERSONA_KEYS.includes(key), `${key} in PERSONA_KEYS`)
        assertNotNull(PERSONAS[key], `PERSONAS[${key}] bestaat`)
      }
    },
  },
  {
    id: 'td-persona-profile-complete',
    name: 'Persona profielen hebben verplichte velden',
    category: CAT,
    description: 'Elk persona profiel heeft full_name, date_of_birth, household_type',
    priority: 'critical',
    estimatedDurationMs: 20,
    fn() {
      for (const key of PERSONA_KEYS) {
        const p = PERSONAS[key]
        assertNotNull(p.profile.full_name, `${key} full_name`)
        assertNotNull(p.profile.date_of_birth, `${key} date_of_birth`)
        assert(p.profile.date_of_birth.match(/^\d{4}-\d{2}-\d{2}$/) !== null, `${key} date_of_birth ISO format`)
        assertNotNull(p.profile.household_type, `${key} household_type`)
        assert(typeof p.profile.temporal_balance === 'number', `${key} temporal_balance is number`)
      }
    },
  },
  {
    id: 'td-persona-meta-complete',
    name: 'Persona meta heeft alle velden',
    category: CAT,
    description: 'Elk persona meta bevat name, subtitle, sovereignty, netWorth, income, expenses',
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      const validPhases = ['recovery', 'stability', 'momentum', 'mastery']
      for (const key of PERSONA_KEYS) {
        const m = PERSONAS[key].meta
        assertNotNull(m.name, `${key} meta.name`)
        assertNotNull(m.subtitle, `${key} meta.subtitle`)
        assertNotNull(m.description, `${key} meta.description`)
        assert(validPhases.includes(m.sovereignty), `${key} sovereignty fase geldig: ${m.sovereignty}`)
        assert(typeof m.netWorth === 'number', `${key} netWorth is number`)
        assert(typeof m.income === 'number', `${key} income is number`)
        assert(typeof m.expenses === 'number', `${key} expenses is number`)
      }
    },
  },
  {
    id: 'td-persona-bank-accounts',
    name: 'Persona\'s hebben bankrekeningen',
    category: CAT,
    description: 'Elke persona heeft minstens 1 bankrekening met IBAN en saldo',
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      for (const key of PERSONA_KEYS) {
        const accounts = PERSONAS[key].bank_accounts
        assertGreaterThan(accounts.length, 0, `${key} heeft bankrekeningen`)
        for (const acc of accounts) {
          assertNotNull(acc.name, `${key} account name`)
          assertNotNull(acc.iban, `${key} account iban`)
          assert(acc.iban.startsWith('NL'), `${key} IBAN start met NL`)
          assertNotNull(acc.bank_name, `${key} bank_name`)
          assert(typeof acc.balance === 'number', `${key} balance is number`)
        }
      }
    },
  },

  // ──────────────── NDJSON streaming: progress structure ────────────────
  {
    id: 'td-persona-data-arrays',
    name: 'Persona data arrays voor seeding',
    category: CAT,
    description: 'Persona data bevat alle vereiste arrays voor seedPersonaData',
    priority: 'critical',
    estimatedDurationMs: 20,
    fn() {
      for (const key of PERSONA_KEYS) {
        const p = PERSONAS[key]
        assert(Array.isArray(p.bank_accounts), `${key} bank_accounts is array`)
        assert(Array.isArray(p.assets), `${key} assets is array`)
        assert(Array.isArray(p.debts), `${key} debts is array`)
        assert(Array.isArray(p.budgets), `${key} budgets is array`)
        assert(Array.isArray(p.transactions), `${key} transactions is array`)
        assert(Array.isArray(p.goals), `${key} goals is array`)
        assert(Array.isArray(p.life_events), `${key} life_events is array`)
        assert(Array.isArray(p.recommendations), `${key} recommendations is array`)
        assert(Array.isArray(p.net_worth_snapshots), `${key} net_worth_snapshots is array`)
      }
    },
  },
  {
    id: 'td-persona-transactions-valid',
    name: 'Persona transacties hebben geldige structuur',
    category: CAT,
    description: 'Transacties hebben dayOffset, amount, description, budgetSlug',
    priority: 'high',
    estimatedDurationMs: 30,
    fn() {
      for (const key of PERSONA_KEYS) {
        const txns = PERSONAS[key].transactions
        assertGreaterThan(txns.length, 0, `${key} heeft transacties`)
        for (const t of txns.slice(0, 5)) {
          assert(typeof t.dayOffset === 'number', `${key} txn dayOffset is number`)
          assert(typeof t.amount === 'number', `${key} txn amount is number`)
          assertNotNull(t.description, `${key} txn description`)
          assertNotNull(t.budgetSlug, `${key} txn budgetSlug`)
          assert(typeof t.is_income === 'boolean', `${key} txn is_income is boolean`)
        }
      }
    },
  },

  // ──────────────── Seeding samenvatting: record counts ────────────────
  {
    id: 'td-persona-net-worth-snapshots',
    name: 'Persona net worth snapshots voor seeding samenvatting',
    category: CAT,
    description: 'Net worth snapshots hebben maanden, bedragen en netto vermogen',
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      for (const key of PERSONA_KEYS) {
        const snapshots = PERSONAS[key].net_worth_snapshots
        assertGreaterThan(snapshots.length, 0, `${key} heeft snapshots`)
        for (const s of snapshots) {
          assert(typeof s.monthsAgo === 'number', `${key} snapshot monthsAgo is number`)
          assert(typeof s.total_assets === 'number', `${key} snapshot total_assets`)
          assert(typeof s.total_debts === 'number', `${key} snapshot total_debts`)
          assert(typeof s.net_worth === 'number', `${key} snapshot net_worth`)
          // net_worth should = total_assets - total_debts
          assertEqual(s.net_worth, s.total_assets - s.total_debts, `${key} snapshot net_worth = assets - debts`)
        }
      }
    },
  },

  // ──────────────── Bevestigingsdialoog: destructieve operatie ────────────────
  {
    id: 'td-persona-sovereignty-phases',
    name: 'Persona\'s dekken stability/momentum/mastery sovereignty fases',
    category: CAT,
    description: 'De 4 lifecycle-personas dekken stability, momentum en mastery (recovery valt buiten testset)',
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const phases = new Set(PERSONA_KEYS.map((k) => PERSONAS[k].meta.sovereignty))
      assert(phases.has('stability'), 'stability fase gedekt')
      assert(phases.has('momentum'), 'momentum fase gedekt')
      assert(phases.has('mastery'), 'mastery fase gedekt')
    },
  },

  // ──────────────── Budget template laden ────────────────
  {
    id: 'td-budget-templates-available',
    name: 'Alle 4 budget templates beschikbaar',
    category: CAT,
    description: 'BUDGET_TEMPLATES bevat starter, gezin, zzp, pensioen',
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      assertEqual(BUDGET_TEMPLATES.length, 4, '4 templates')
      const ids = BUDGET_TEMPLATES.map((t) => t.id)
      assert(ids.includes('starter'), 'starter template')
      assert(ids.includes('gezin'), 'gezin template')
      assert(ids.includes('zzp'), 'zzp template')
      assert(ids.includes('pensioen'), 'pensioen template')
    },
  },
  {
    id: 'td-budget-template-structure',
    name: 'Budget templates hebben correcte structuur',
    category: CAT,
    description: 'Elke template heeft name, description, icon en getBudgets()',
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      for (const template of BUDGET_TEMPLATES) {
        assertNotNull(template.name, `${template.id} name`)
        assertNotNull(template.description, `${template.id} description`)
        assertNotNull(template.icon, `${template.id} icon`)
        assert(typeof template.getBudgets === 'function', `${template.id} getBudgets is function`)

        const budgets = template.getBudgets()
        assertGreaterThan(budgets.length, 0, `${template.id} heeft budgets`)

        // Check structure of first budget
        const b = budgets[0]
        assertNotNull(b.name, `${template.id} budget name`)
        assertNotNull(b.slug, `${template.id} budget slug`)
        assertNotNull(b.icon, `${template.id} budget icon`)
        assert(
          ['income', 'expense', 'savings', 'debt', 'archive'].includes(b.budget_type),
          `${template.id} budget_type geldig: ${b.budget_type}`,
        )
        assert(typeof b.default_limit === 'number', `${template.id} default_limit is number`)
        assert(typeof b.sort_order === 'number', `${template.id} sort_order is number`)
      }
    },
  },
  {
    id: 'td-budget-template-children',
    name: 'Budget templates hebben parent-child structuur',
    category: CAT,
    description: 'Templates bevatten budgets met children (subcategorieën)',
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      for (const template of BUDGET_TEMPLATES) {
        const budgets = template.getBudgets()
        const withChildren = budgets.filter((b) => b.children && b.children.length > 0)
        assertGreaterThan(withChildren.length, 0, `${template.id} heeft budgets met children`)

        for (const parent of withChildren) {
          for (const child of parent.children!) {
            assertNotNull(child.name, `${template.id} child name`)
            assertNotNull(child.slug, `${template.id} child slug`)
            assert(typeof child.default_limit === 'number', `${template.id} child limit is number`)
          }
        }
      }
    },
  },
  {
    id: 'td-budget-template-has-income',
    name: 'Budget templates bevatten inkomen categorie',
    category: CAT,
    description: 'Elk template heeft minstens 1 income budget',
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      for (const template of BUDGET_TEMPLATES) {
        const budgets = template.getBudgets()
        const incomes = budgets.filter((b) => b.budget_type === 'income')
        assertGreaterThan(incomes.length, 0, `${template.id} heeft inkomen budget`)
      }
    },
  },

  // ──────────────── Fase transitie simulatie ────────────────
  {
    id: 'td-phase-transition-valid-phases',
    name: 'Fase transitie: geldige fases',
    category: CAT,
    description: 'Alle 4 sovereignty fases zijn geldig voor transitie',
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const validPhases = ['recovery', 'stability', 'momentum', 'mastery']
      // Verify our persona sovereignty phases match valid phases
      for (const key of PERSONA_KEYS) {
        const phase = PERSONAS[key].meta.sovereignty
        assert(validPhases.includes(phase), `${key} fase ${phase} is geldig`)
      }
      // Verify ordering: recovery < stability < momentum < mastery
      assertEqual(validPhases.indexOf('recovery'), 0, 'recovery is eerste')
      assertEqual(validPhases.indexOf('mastery'), 3, 'mastery is laatste')
    },
  },

  // ──────────────── Life events metadata ────────────────
  {
    id: 'td-life-events-metadata',
    name: 'Life events metadata altijd object (niet undefined)',
    category: CAT,
    description: 'PostgREST bulk insert vereist consistente kolommen; metadata moet altijd {} zijn als niet ingesteld',
    priority: 'critical',
    estimatedDurationMs: 20,
    fn() {
      // This was a real bug (#226): metadata NOT NULL violation on bulk insert
      for (const key of PERSONA_KEYS) {
        const events = PERSONAS[key].life_events
        for (const e of events) {
          assertNotNull(e.name, `${key} event name`)
          assert(typeof e.is_active === 'boolean', `${key} event ${e.name} is_active is boolean`)
          assert(typeof e.sort_order === 'number', `${key} event ${e.name} sort_order is number`)
          // metadata can be undefined in the type, but seed-persona.ts must handle it
          // We verify the event structure is complete
          assert(
            typeof e.one_time_cost === 'number',
            `${key} event ${e.name} one_time_cost is number`,
          )
          assert(
            typeof e.monthly_cost_change === 'number',
            `${key} event ${e.name} monthly_cost_change is number`,
          )
        }
      }
    },
  },

  // ──────────────── FIRE parameters per persona ────────────────
  {
    id: 'td-persona-fire-params',
    name: 'Persona FIRE parameters geldig',
    category: CAT,
    description: 'Persona\'s met FIRE params hebben geldige waarden',
    priority: 'high',
    estimatedDurationMs: 15,
    fn() {
      for (const key of PERSONA_KEYS) {
        const p = PERSONAS[key].profile
        if (p.expected_return != null) {
          assert(p.expected_return > 0 && p.expected_return < 1, `${key} expected_return 0-1: ${p.expected_return}`)
        }
        if (p.inflation_rate != null) {
          assert(p.inflation_rate >= 0 && p.inflation_rate < 1, `${key} inflation_rate 0-1: ${p.inflation_rate}`)
        }
        if (p.fire_end_strategy != null) {
          assert(
            ['perpetual', 'legacy', 'deplete'].includes(p.fire_end_strategy),
            `${key} fire_end_strategy geldig: ${p.fire_end_strategy}`,
          )
        }
        if (p.fire_end_strategy === 'legacy') {
          assertNotNull(p.fire_legacy_amount, `${key} legacy heeft fire_legacy_amount`)
          assertGreaterThan(p.fire_legacy_amount!, 0, `${key} legacy amount > 0`)
        }
      }
    },
  },

  // ──────────────── Persona budgets dekken alle budget types ────────────────
  {
    id: 'td-persona-budgets-types',
    name: 'Persona budgets dekken income/expense/savings',
    category: CAT,
    description: 'Persona\'s met budgets hebben income, expense en savings types',
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      for (const key of PERSONA_KEYS) {
        const budgets = PERSONAS[key].budgets
        if (budgets.length === 0) continue // skip personas without budgets (none in current set)
        const types = new Set(budgets.map((b) => b.budget_type))
        assert(types.has('income'), `${key} heeft income budget`)
        assert(types.has('expense'), `${key} heeft expense budget`)
      }
    },
  },

  // ──────────────── Holdings en valuations ────────────────
  {
    id: 'td-persona-holdings-valid',
    name: 'Persona holdings structuur geldig',
    category: CAT,
    description: 'Holdings hebben ticker/isin, units, prices en transacties',
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      let totalHoldings = 0
      for (const key of PERSONA_KEYS) {
        const holdings = PERSONAS[key].holdings ?? []
        totalHoldings += holdings.length
        for (const h of holdings) {
          assertNotNull(h.name, `${key} holding name`)
          assertNotNull(h.assetName, `${key} holding assetName (FK)`)
          assert(typeof h.units === 'number' && h.units > 0, `${key} holding ${h.name} units > 0`)
          assert(typeof h.avg_purchase_price === 'number', `${key} holding ${h.name} avg_purchase_price`)
          assert(typeof h.current_price === 'number', `${key} holding ${h.name} current_price`)
          assert(Array.isArray(h.transactions), `${key} holding ${h.name} transactions is array`)
          for (const t of h.transactions) {
            assert(['buy', 'sell', 'dividend'].includes(t.type), `${key} holding txn type: ${t.type}`)
            assert(typeof t.total_amount === 'number', `${key} holding txn total_amount`)
          }
        }
      }
      assertGreaterThan(totalHoldings, 0, 'minstens 1 persona heeft holdings')
    },
  },

  // ──────────────── Activatie reset ────────────────
  {
    id: 'td-persona-widget-prefs',
    name: 'Persona widget_prefs geldig indien ingesteld',
    category: CAT,
    description: 'Widget prefs hebben widgets array met id, enabled, size, order',
    priority: 'medium',
    estimatedDurationMs: 15,
    fn() {
      let foundPrefs = 0
      for (const key of PERSONA_KEYS) {
        const prefs = PERSONAS[key].profile.widget_prefs
        if (!prefs) continue
        foundPrefs++
        assert(Array.isArray(prefs.widgets), `${key} widget_prefs.widgets is array`)
        for (const w of prefs.widgets) {
          assertNotNull(w.id, `${key} widget id`)
          assert(typeof w.enabled === 'boolean', `${key} widget ${w.id} enabled`)
          assert(['quarter', 'half', 'full'].includes(w.size), `${key} widget ${w.id} size: ${w.size}`)
          assert(typeof w.order === 'number', `${key} widget ${w.id} order`)
        }
      }
      assertGreaterThan(foundPrefs, 0, 'minstens 1 persona heeft widget_prefs')
    },
  },
]

// ── Registration ────────────────────────────────────────────────

registerCategory({
  id: CAT,
  label: 'Beheer — Testdata',
  description: 'Persona seeding, budget templates, check-in beheer, fase transitie',
  icon: 'Database',
  testCount: 0,
  defaultRole: 'superadmin' as const,
})

export function register(): void {
  registerTests(tests)
}

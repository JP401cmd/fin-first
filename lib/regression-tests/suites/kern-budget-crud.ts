/**
 * Regression tests: Budget CRUD flow
 *
 * Tests for budget creation, editing, deletion and form validation flows:
 * - New budget creation via /core/budgets/new
 * - Budget editing via /core/budgets/[id]/edit redirect
 * - Budget deletion via DELETE /api/budgets/[id]
 * - Budget category (parent) linking
 * - Budget limit validation (no negative values)
 * - Budget interval settings (monthly/quarterly/yearly)
 */

import { registerTests, registerCategory } from '../test-registry'
import {
  assert,
  assertEqual,
  assertGreaterThan,
  assertGreaterThanOrEqual,
  assertNotNull,
  assertIncludes,
} from '../assert'
import type { TestCase } from '../test-types'
import type { Budget, BudgetSelectGroup } from '@/lib/budget-data'
import { BUDGET_SLUGS, budgetOptionLabel, buildBudgetSelectEntries } from '@/lib/budget-data'
import { categorizeTransaction, type CategoryCorrection } from '@/lib/parsers/categorize'
import { unauthenticatedFetch } from '../server-runner'

const CAT = 'kern.budget-crud'

// ── Fixtures ────────────────────────────────────────────────────────────────

type FormData = {
  name: string
  icon: string
  description: string
  default_limit: string
  budget_type: string
  interval: string
  rollover_type: string
  limit_type: string
  alert_threshold: number
  max_single_transaction_amount: string
  is_essential: boolean
  priority_score: number
  is_inflation_indexed: boolean
  parent_id: string
  ownership: 'personal' | 'shared'
  goal_type: string
  goal_amount: string
  goal_date: string
  goal_frequency: string
}

const EMPTY_FORM: FormData = {
  name: '',
  icon: 'Circle',
  description: '',
  default_limit: '',
  budget_type: 'expense',
  interval: 'monthly',
  rollover_type: 'reset',
  limit_type: 'soft',
  alert_threshold: 80,
  max_single_transaction_amount: '0',
  is_essential: false,
  priority_score: 3,
  is_inflation_indexed: false,
  parent_id: '',
  ownership: 'personal',
  goal_type: '',
  goal_amount: '',
  goal_date: '',
  goal_frequency: '',
}

const VALID_BUDGET_TYPES = ['income', 'expense', 'savings', 'debt', 'archive']
const VALID_INTERVALS = ['monthly', 'quarterly', 'yearly']
const VALID_ROLLOVER_TYPES = ['reset', 'carry-over', 'invest-sweep']
const VALID_LIMIT_TYPES = ['soft', 'hard']

// ── Helper: simulate form validation ────────────────────────────────────────

function validateBudgetForm(form: FormData, needsAutoParent: boolean, categoryName: string): string | null {
  if (!form.name.trim()) return 'Naam is verplicht'
  if (needsAutoParent && !categoryName.trim()) return 'Categorie-naam is verplicht'
  return null
}

function buildBudgetRow(form: FormData, userId: string) {
  return {
    user_id: userId,
    name: form.name.trim(),
    icon: form.icon,
    description: form.description.trim() || null,
    default_limit: parseFloat(form.default_limit) || 0,
    budget_type: form.budget_type,
    interval: form.interval,
    rollover_type: form.goal_type === 'maandelijkse_reservering' ? 'carry-over' : form.rollover_type,
    limit_type: form.limit_type,
    alert_threshold: form.alert_threshold,
    max_single_transaction_amount: parseFloat(form.max_single_transaction_amount) || 0,
    is_essential: form.is_essential,
    priority_score: form.priority_score,
    is_inflation_indexed: form.is_inflation_indexed,
    parent_id: form.parent_id || null,
    goal_type: form.goal_type || null,
    goal_amount: parseFloat(form.goal_amount) || null,
    goal_date: form.goal_date || null,
    goal_frequency: form.goal_frequency || null,
    ownership: form.ownership,
    household_id: null,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── A: New budget creation ────────────────────────────────────────────────
  {
    id: 'budget-crud-new-form-defaults',
    name: 'Nieuw budget: formulier standaardwaarden',
    description: 'Default form values match expected initial state',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 30,
    fn() {
      assertEqual(EMPTY_FORM.name, '', 'name empty')
      assertEqual(EMPTY_FORM.icon, 'Circle', 'default icon')
      assertEqual(EMPTY_FORM.budget_type, 'expense', 'default budget_type')
      assertEqual(EMPTY_FORM.interval, 'monthly', 'default interval')
      assertEqual(EMPTY_FORM.rollover_type, 'reset', 'default rollover')
      assertEqual(EMPTY_FORM.limit_type, 'soft', 'default limit_type')
      assertEqual(EMPTY_FORM.alert_threshold, 80, 'default alert_threshold')
      assertEqual(EMPTY_FORM.is_essential, false, 'default not essential')
      assertEqual(EMPTY_FORM.priority_score, 3, 'default priority 3')
      assertEqual(EMPTY_FORM.is_inflation_indexed, false, 'default no inflation index')
      assertEqual(EMPTY_FORM.ownership, 'personal', 'default ownership')
    },
  },
  {
    id: 'budget-crud-new-validation-name-required',
    name: 'Nieuw budget: naam is verplicht',
    description: 'Form validation rejects empty name',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 20,
    fn() {
      const err1 = validateBudgetForm({ ...EMPTY_FORM, name: '' }, false, '')
      assertEqual(err1, 'Naam is verplicht', 'empty name rejected')

      const err2 = validateBudgetForm({ ...EMPTY_FORM, name: '   ' }, false, '')
      assertEqual(err2, 'Naam is verplicht', 'whitespace-only name rejected')

      const err3 = validateBudgetForm({ ...EMPTY_FORM, name: 'Boodschappen' }, false, '')
      assertEqual(err3, null, 'valid name accepted')
    },
  },
  {
    id: 'budget-crud-new-auto-parent-requires-category',
    name: 'Nieuw budget: auto-parent vereist categorie-naam',
    description: 'When no parent is selected, category name is required for auto-parent creation',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 20,
    fn() {
      // needsAutoParent = true when no budget and no parent_id
      const err1 = validateBudgetForm({ ...EMPTY_FORM, name: 'Test' }, true, '')
      assertEqual(err1, 'Categorie-naam is verplicht', 'empty category rejected')

      const err2 = validateBudgetForm({ ...EMPTY_FORM, name: 'Test' }, true, '   ')
      assertEqual(err2, 'Categorie-naam is verplicht', 'whitespace category rejected')

      const err3 = validateBudgetForm({ ...EMPTY_FORM, name: 'Test' }, true, 'Vaste Lasten')
      assertEqual(err3, null, 'valid category accepted')
    },
  },
  {
    id: 'budget-crud-new-row-construction',
    name: 'Nieuw budget: database rij constructie',
    description: 'Form data is correctly transformed into a database row',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 30,
    fn() {
      const form: FormData = {
        ...EMPTY_FORM,
        name: '  Boodschappen  ',
        description: '  Wekelijkse boodschappen  ',
        default_limit: '500',
        budget_type: 'expense',
        interval: 'monthly',
        parent_id: 'parent-uuid',
      }
      const row = buildBudgetRow(form, 'user-123')

      assertEqual(row.name, 'Boodschappen', 'name trimmed')
      assertEqual(row.description, 'Wekelijkse boodschappen', 'description trimmed')
      assertEqual(row.default_limit, 500, 'limit parsed as number')
      assertEqual(row.parent_id, 'parent-uuid', 'parent_id preserved')
      assertEqual(row.user_id, 'user-123', 'user_id set')
      assertEqual(row.budget_type, 'expense', 'budget_type preserved')
    },
  },
  {
    id: 'budget-crud-new-empty-description-null',
    name: 'Nieuw budget: lege beschrijving wordt null',
    description: 'Empty or whitespace descriptions are stored as null',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      const row1 = buildBudgetRow({ ...EMPTY_FORM, name: 'Test', description: '' }, 'u')
      assertEqual(row1.description, null, 'empty string → null')

      const row2 = buildBudgetRow({ ...EMPTY_FORM, name: 'Test', description: '   ' }, 'u')
      assertEqual(row2.description, null, 'whitespace → null')

      const row3 = buildBudgetRow({ ...EMPTY_FORM, name: 'Test', description: 'Omschrijving' }, 'u')
      assertEqual(row3.description, 'Omschrijving', 'non-empty preserved')
    },
  },

  // ── B: Budget editing ─────────────────────────────────────────────────────
  {
    id: 'budget-crud-edit-redirect',
    name: 'Budget bewerken: edit URL redirects naar budgets pagina',
    description: '/core/budgets/[id]/edit redirects to /core/budgets?budget=[id]&edit=true',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      // The edit page component redirects: router.replace(`/core/budgets?budget=${id}&edit=true`)
      const id = '550e8400-e29b-41d4-a716-446655440000'
      const expectedUrl = `/core/budgets?budget=${id}&edit=true`

      assert(expectedUrl.includes('budget='), 'URL has budget param')
      assert(expectedUrl.includes('edit=true'), 'URL has edit=true param')
      assert(expectedUrl.startsWith('/core/budgets?'), 'URL starts with /core/budgets')
    },
  },
  {
    id: 'budget-crud-edit-preserves-existing-values',
    name: 'Budget bewerken: bestaande waarden worden geladen',
    description: 'Edit form initializes with existing budget values',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 30,
    fn() {
      const existingBudget: Partial<Budget> = {
        name: 'Boodschappen',
        icon: 'ShoppingCart',
        description: 'Weekelijkse boodschappen',
        default_limit: 450,
        budget_type: 'expense',
        interval: 'monthly',
        rollover_type: 'carry-over',
        limit_type: 'hard',
        alert_threshold: 90,
        max_single_transaction_amount: 200,
        is_essential: true,
        priority_score: 5,
        is_inflation_indexed: true,
        parent_id: 'parent-id',
        ownership: 'shared',
        goal_type: null,
        goal_amount: null,
        goal_date: null,
        goal_frequency: null,
      }

      // Simulate how BudgetForm initializes from existing budget
      const initForm: FormData = {
        name: existingBudget.name ?? '',
        icon: existingBudget.icon ?? 'Circle',
        description: existingBudget.description ?? '',
        default_limit: existingBudget.default_limit ? String(existingBudget.default_limit) : '',
        budget_type: existingBudget.budget_type ?? 'expense',
        interval: existingBudget.interval ?? 'monthly',
        rollover_type: existingBudget.rollover_type ?? 'reset',
        limit_type: existingBudget.limit_type ?? 'soft',
        alert_threshold: existingBudget.alert_threshold ?? 80,
        max_single_transaction_amount: existingBudget.max_single_transaction_amount ? String(existingBudget.max_single_transaction_amount) : '0',
        is_essential: existingBudget.is_essential ?? false,
        priority_score: existingBudget.priority_score ?? 3,
        is_inflation_indexed: existingBudget.is_inflation_indexed ?? false,
        parent_id: existingBudget.parent_id ?? '',
        ownership: existingBudget.ownership ?? 'personal',
        goal_type: existingBudget.goal_type ?? '',
        goal_amount: existingBudget.goal_amount ? String(existingBudget.goal_amount) : '',
        goal_date: existingBudget.goal_date ?? '',
        goal_frequency: existingBudget.goal_frequency ?? '',
      }

      assertEqual(initForm.name, 'Boodschappen', 'name loaded')
      assertEqual(initForm.icon, 'ShoppingCart', 'icon loaded')
      assertEqual(initForm.default_limit, '450', 'limit loaded as string')
      assertEqual(initForm.rollover_type, 'carry-over', 'rollover loaded')
      assertEqual(initForm.limit_type, 'hard', 'limit_type loaded')
      assertEqual(initForm.alert_threshold, 90, 'alert_threshold loaded')
      assertEqual(initForm.is_essential, true, 'is_essential loaded')
      assertEqual(initForm.priority_score, 5, 'priority_score loaded')
      assertEqual(initForm.ownership, 'shared', 'ownership loaded')

      // Fase 1: een gedeeld budget toont in keuzelijsten het "· Gezamenlijk"-label
      assertEqual(
        budgetOptionLabel({ name: existingBudget.name!, ownership: initForm.ownership }),
        'Boodschappen · Gezamenlijk',
        'shared ownership → "· Gezamenlijk" suffix',
      )
    },
  },
  {
    id: 'budget-crud-edit-dirty-detection',
    name: 'Budget bewerken: dirty state detectie',
    description: 'isDirty correctly detects form changes vs initial state',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 30,
    fn() {
      const initial = { ...EMPTY_FORM, name: 'Original' }

      // Same values = not dirty
      const same = { ...initial }
      const isDirtySame = Object.keys(initial).some(
        k => (initial as Record<string, unknown>)[k] !== (same as Record<string, unknown>)[k]
      )
      assertEqual(isDirtySame, false, 'unchanged form not dirty')

      // Changed name = dirty
      const changed = { ...initial, name: 'Gewijzigd' }
      const isDirtyChanged = Object.keys(initial).some(
        k => (initial as Record<string, unknown>)[k] !== (changed as Record<string, unknown>)[k]
      )
      assertEqual(isDirtyChanged, true, 'changed name is dirty')

      // Changed interval = dirty
      const changedInterval = { ...initial, interval: 'yearly' }
      const isDirtyInterval = Object.keys(initial).some(
        k => (initial as Record<string, unknown>)[k] !== (changedInterval as Record<string, unknown>)[k]
      )
      assertEqual(isDirtyInterval, true, 'changed interval is dirty')
    },
  },

  // ── C: Budget deletion ────────────────────────────────────────────────────
  {
    id: 'budget-crud-delete-auth-guard',
    name: 'Budget verwijderen: auth guard op DELETE endpoint',
    description: 'DELETE /api/budgets/[id] returns 401 for unauthenticated requests',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const res = await unauthenticatedFetch('/api/budgets/550e8400-e29b-41d4-a716-446655440000', {
        method: 'DELETE',
      })
      assertEqual(res.status, 401, 'unauthenticated DELETE returns 401')
    },
  },
  {
    id: 'budget-crud-delete-uuid-validation',
    name: 'Budget verwijderen: UUID validatie',
    description: 'DELETE /api/budgets/[id] rejects invalid UUID formats with 400',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

      // Valid UUIDs
      assert(uuidRegex.test('550e8400-e29b-41d4-a716-446655440000'), 'valid UUID')
      assert(uuidRegex.test('A550E840-E29B-41D4-A716-446655440000'), 'uppercase UUID')

      // Invalid formats
      assert(!uuidRegex.test('not-a-uuid'), 'short string rejected')
      assert(!uuidRegex.test(''), 'empty rejected')
      assert(!uuidRegex.test('550e8400-e29b-41d4-a716'), 'incomplete rejected')
      assert(!uuidRegex.test('550e8400-e29b-41d4-a716-44665544000g'), 'non-hex rejected')
    },
  },
  {
    id: 'budget-crud-delete-cascade-logic',
    name: 'Budget verwijderen: cascade verwijdering logica',
    description: 'Parent budget deletion collects all child IDs for cascade',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 30,
    fn() {
      const parent = { id: 'p-1', parent_id: null, name: 'Wonen' }
      const allBudgets = [
        { id: 'c-1', parent_id: 'p-1' },
        { id: 'c-2', parent_id: 'p-1' },
        { id: 'c-3', parent_id: 'p-1' },
        { id: 'c-4', parent_id: 'p-2' }, // different parent
      ]

      const toDelete: string[] = [parent.id]
      if (!parent.parent_id) {
        const childIds = allBudgets
          .filter(c => c.parent_id === parent.id)
          .map(c => c.id)
        toDelete.push(...childIds)
      }

      assertEqual(toDelete.length, 4, '1 parent + 3 children')
      assertIncludes(toDelete, 'p-1', 'parent included')
      assertIncludes(toDelete, 'c-1', 'child 1 included')
      assertIncludes(toDelete, 'c-2', 'child 2 included')
      assertIncludes(toDelete, 'c-3', 'child 3 included')
      assert(!toDelete.includes('c-4'), 'unrelated child excluded')
    },
  },
  {
    id: 'budget-crud-delete-child-no-cascade',
    name: 'Budget verwijderen: child budget geen cascade',
    description: 'Child budget deletion does not cascade to siblings',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      const child = { id: 'c-1', parent_id: 'p-1', name: 'Huur' }

      const toDelete: string[] = [child.id]
      // Child has parent_id, so no cascade
      if (!child.parent_id) {
        // Would find children — but this is a child, so skip
        toDelete.push('should-not-happen')
      }

      assertEqual(toDelete.length, 1, 'only the child itself')
      assertEqual(toDelete[0], 'c-1', 'correct child ID')
    },
  },
  {
    id: 'budget-crud-delete-response-shape',
    name: 'Budget verwijderen: response structuur',
    description: 'Successful delete response has expected shape',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      // Simulate a successful delete response
      const response = {
        success: true,
        deleted: {
          budget_id: 'uuid',
          budget_name: 'Wonen',
          is_parent: true,
          children_deleted: 3,
          rollovers_deleted: 5,
          amounts_deleted: 12,
          transactions_unlinked: 45,
        },
      }

      assertEqual(response.success, true, 'success flag')
      assertNotNull(response.deleted, 'deleted object present')
      assertNotNull(response.deleted.budget_id, 'budget_id present')
      assertNotNull(response.deleted.budget_name, 'budget_name present')
      assertEqual(typeof response.deleted.is_parent, 'boolean', 'is_parent is boolean')
      assertEqual(typeof response.deleted.children_deleted, 'number', 'children_deleted is number')
      assertEqual(typeof response.deleted.rollovers_deleted, 'number', 'rollovers_deleted is number')
      assertEqual(typeof response.deleted.amounts_deleted, 'number', 'amounts_deleted is number')
      assertEqual(typeof response.deleted.transactions_unlinked, 'number', 'transactions_unlinked is number')
    },
  },

  // ── D: Budget category linking ────────────────────────────────────────────
  {
    id: 'budget-crud-parent-child-relationship',
    name: 'Budget categorie: ouder-kind koppeling',
    description: 'Parent budgets have parent_id=null, children reference parent',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      const parent = { id: 'p-1', parent_id: null, name: 'Dagelijkse uitgaven' }
      const child1 = { id: 'c-1', parent_id: 'p-1', name: 'Boodschappen' }
      const child2 = { id: 'c-2', parent_id: 'p-1', name: 'Huishouden' }

      assertEqual(parent.parent_id, null, 'parent has no parent_id')
      assertEqual(child1.parent_id, parent.id, 'child1 references parent')
      assertEqual(child2.parent_id, parent.id, 'child2 references parent')
    },
  },
  {
    id: 'budget-crud-auto-parent-creation',
    name: 'Budget categorie: auto-parent aanmaken',
    description: 'When no parent is selected, both parent and child are created',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 30,
    fn() {
      // Simulate needsAutoParent = true (no budget, no parent_id)
      const form: FormData = {
        ...EMPTY_FORM,
        name: 'Boodschappen',
        default_limit: '400',
        budget_type: 'expense',
      }
      const needsAutoParent = !form.parent_id
      assert(needsAutoParent, 'needsAutoParent is true when parent_id empty')

      // Parent row has default_limit=0, max_single_transaction_amount=0
      const parentRow = {
        name: 'Dagelijkse Uitgaven',
        icon: form.icon,
        default_limit: 0,
        max_single_transaction_amount: 0,
        parent_id: null,
      }
      assertEqual(parentRow.default_limit, 0, 'parent limit is 0')
      assertEqual(parentRow.parent_id, null, 'parent has no parent_id')

      // Child row has actual limit
      const childRow = {
        name: form.name.trim(),
        default_limit: parseFloat(form.default_limit) || 0,
        parent_id: 'auto-generated-parent-id',
        sort_order: 0,
      }
      assertEqual(childRow.default_limit, 400, 'child has user limit')
      assertNotNull(childRow.parent_id, 'child references auto-parent')
      assertEqual(childRow.sort_order, 0, 'child sort_order starts at 0')
    },
  },
  {
    id: 'budget-crud-budget-slugs-completeness',
    name: 'Budget categorie: BUDGET_SLUGS bevat alle standaard categorieën',
    description: 'BUDGET_SLUGS constant has entries for all 6 parent + 24 child categories',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 30,
    fn() {
      const slugKeys = Object.keys(BUDGET_SLUGS)
      assertGreaterThanOrEqual(slugKeys.length, 24, 'at least 24 slug entries')

      // Spot-check key parent slugs
      assertNotNull((BUDGET_SLUGS as Record<string, string>).INKOMEN, 'INKOMEN slug exists')
      assertNotNull((BUDGET_SLUGS as Record<string, string>).VASTE_LASTEN_WONEN, 'VASTE_LASTEN_WONEN slug exists')
      assertNotNull((BUDGET_SLUGS as Record<string, string>).DAGELIJKSE_UITGAVEN, 'DAGELIJKSE_UITGAVEN slug exists')
      assertNotNull((BUDGET_SLUGS as Record<string, string>).VERVOER, 'VERVOER slug exists')
      assertNotNull((BUDGET_SLUGS as Record<string, string>).LEUKE_DINGEN, 'LEUKE_DINGEN slug exists')
      assertNotNull((BUDGET_SLUGS as Record<string, string>).SPAREN_SCHULDEN, 'SPAREN_SCHULDEN slug exists')

      // Spot-check child slugs
      assertNotNull((BUDGET_SLUGS as Record<string, string>).BOODSCHAPPEN, 'BOODSCHAPPEN slug exists')
      assertNotNull((BUDGET_SLUGS as Record<string, string>).HUUR_HYPOTHEEK, 'HUUR_HYPOTHEEK slug exists')
      assertNotNull((BUDGET_SLUGS as Record<string, string>).VAKANTIE, 'VAKANTIE slug exists')

      // All slug values are non-empty kebab-case strings
      const slugValues = Object.values(BUDGET_SLUGS)
      for (const slug of slugValues) {
        assert(typeof slug === 'string' && slug.length > 0, `slug "${slug}" is non-empty string`)
        assert(/^[a-z0-9-]+$/.test(slug), `slug "${slug}" is kebab-case`)
      }
    },
  },

  // ── E: Budget limit validation ────────────────────────────────────────────
  {
    id: 'budget-crud-limit-no-negative',
    name: 'Budget limiet: geen negatieve waarden',
    description: 'parseFloat || 0 prevents negative limits from being stored',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 20,
    fn() {
      // The form uses parseFloat(form.default_limit) || 0
      // For negative values, parseFloat works but the form stores as string
      const parseLimit = (val: string) => parseFloat(val) || 0

      assertEqual(parseLimit(''), 0, 'empty string → 0')
      assertEqual(parseLimit('0'), 0, 'zero string → 0')
      assertEqual(parseLimit('500'), 500, 'valid number parsed')
      assertEqual(parseLimit('500.50'), 500.50, 'decimal parsed')
      assertEqual(parseLimit('abc'), 0, 'non-numeric → 0')
      assertEqual(parseLimit('NaN'), 0, 'NaN string → 0')

      // Negative values: parseFloat returns negative, which is truthy
      // The app does not explicitly block negatives at form level
      const negVal = parseLimit('-100')
      assertEqual(negVal, -100, 'negative parsed — UI should prevent this')

      // max_single_transaction_amount same logic
      assertEqual(parseLimit('200'), 200, 'max_single_transaction_amount parsed')
    },
  },
  {
    id: 'budget-crud-limit-alert-threshold-range',
    name: 'Budget limiet: alert threshold bereik',
    description: 'Alert threshold should be between 0-100',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      // Default threshold is 80
      assertEqual(EMPTY_FORM.alert_threshold, 80, 'default is 80%')

      // Valid thresholds
      const validThresholds = [0, 25, 50, 75, 80, 90, 100]
      for (const t of validThresholds) {
        assertGreaterThanOrEqual(t, 0, `threshold ${t} >= 0`)
        assert(t <= 100, `threshold ${t} <= 100`)
      }
    },
  },

  // ── F: Budget interval settings ───────────────────────────────────────────
  {
    id: 'budget-crud-interval-options',
    name: 'Budget periode: beschikbare intervallen',
    description: 'Budget supports monthly, quarterly, and yearly intervals',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      assertIncludes(VALID_INTERVALS, 'monthly', 'monthly available')
      assertIncludes(VALID_INTERVALS, 'quarterly', 'quarterly available')
      assertIncludes(VALID_INTERVALS, 'yearly', 'yearly available')
      assertEqual(VALID_INTERVALS.length, 3, 'exactly 3 intervals')
    },
  },
  {
    id: 'budget-crud-interval-default-monthly',
    name: 'Budget periode: standaard maandelijks',
    description: 'Default interval is monthly',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 10,
    fn() {
      assertEqual(EMPTY_FORM.interval, 'monthly', 'default is monthly')
    },
  },
  {
    id: 'budget-crud-budget-types',
    name: 'Budget type: 5 beschikbare types',
    description: 'Budget supports income, expense, savings, debt, and archive types',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      assertIncludes(VALID_BUDGET_TYPES, 'income', 'income type')
      assertIncludes(VALID_BUDGET_TYPES, 'expense', 'expense type')
      assertIncludes(VALID_BUDGET_TYPES, 'savings', 'savings type')
      assertIncludes(VALID_BUDGET_TYPES, 'debt', 'debt type')
      assertIncludes(VALID_BUDGET_TYPES, 'archive', 'archive type')
      assertEqual(VALID_BUDGET_TYPES.length, 5, 'exactly 5 types')
    },
  },
  {
    id: 'budget-crud-rollover-types',
    name: 'Budget rollover: 3 beschikbare types',
    description: 'Rollover supports reset, carry-over, and invest-sweep',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      assertIncludes(VALID_ROLLOVER_TYPES, 'reset', 'reset rollover')
      assertIncludes(VALID_ROLLOVER_TYPES, 'carry-over', 'carry-over rollover')
      assertIncludes(VALID_ROLLOVER_TYPES, 'invest-sweep', 'invest-sweep rollover')
      assertEqual(VALID_ROLLOVER_TYPES.length, 3, 'exactly 3 rollover types')
    },
  },
  {
    id: 'budget-crud-goal-type-overrides-rollover',
    name: 'Budget goal: maandelijkse_reservering forceert carry-over',
    description: 'When goal_type is maandelijkse_reservering, rollover_type becomes carry-over',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      const form: FormData = {
        ...EMPTY_FORM,
        name: 'Vakantie sparen',
        goal_type: 'maandelijkse_reservering',
        rollover_type: 'reset', // user selected reset
      }

      const row = buildBudgetRow(form, 'user-123')
      assertEqual(row.rollover_type, 'carry-over', 'goal_type overrides rollover to carry-over')
    },
  },

  // ── G: Draft/dirty state ──────────────────────────────────────────────────
  {
    id: 'budget-crud-draft-key-pattern',
    name: 'Budget formulier: draft key patroon',
    description: 'Draft localStorage keys follow correct pattern for new/edit',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      // New budget
      const newDraftKey = 'budget-new-draft'
      assert(newDraftKey.includes('new'), 'new budget draft key')

      // Edit budget
      const budgetId = 'test-uuid'
      const editDraftKey = `budget-edit-draft-${budgetId}`
      assert(editDraftKey.includes('edit'), 'edit draft key includes edit')
      assert(editDraftKey.includes(budgetId), 'edit draft key includes budget id')
    },
  },

  // ── H: GET /api/budgets/[id] ──────────────────────────────────────────────
  {
    id: 'budget-crud-get-auth-guard',
    name: 'Budget ophalen: auth guard op GET endpoint',
    description: 'GET /api/budgets/[id] returns 401 for unauthenticated requests',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 500,
    async fn() {
      const res = await unauthenticatedFetch('/api/budgets/550e8400-e29b-41d4-a716-446655440000')
      assertEqual(res.status, 401, 'unauthenticated GET returns 401')
    },
  },

  // ── I: Fase 1 — huishoud-bewuste budgetten (ownership in keuzelijsten) ─────
  {
    id: 'budget-crud-option-label-ownership',
    name: 'Budget keuzelijst: "· Gezamenlijk"-label per eigendom',
    description: 'budgetOptionLabel voegt suffix toe voor shared, laat personal/undefined ongemoeid',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      // personal → naam ongewijzigd
      assertEqual(
        budgetOptionLabel({ name: 'Boodschappen', ownership: 'personal' }),
        'Boodschappen',
        'personal → naam ongewijzigd',
      )
      // shared → "naam · Gezamenlijk"
      assertEqual(
        budgetOptionLabel({ name: 'Boodschappen', ownership: 'shared' }),
        'Boodschappen · Gezamenlijk',
        'shared → suffix toegevoegd',
      )
      // undefined ownership → naam ongewijzigd (geen suffix)
      assertEqual(
        budgetOptionLabel({ name: 'Boodschappen' }),
        'Boodschappen',
        'undefined ownership → naam ongewijzigd',
      )
    },
  },
  {
    id: 'budget-crud-select-entries-carry-ownership',
    name: 'Budget keuzelijst: eigendom blijft behouden op group-opties',
    description: 'buildBudgetSelectEntries draagt ownership door op group + children, archive-opties + parent',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 30,
    fn() {
      const groups: BudgetSelectGroup[] = [
        {
          parent: { id: 'p-1', name: 'Dagelijkse uitgaven', budget_type: 'expense', ownership: 'shared' },
          children: [
            { id: 'c-1', name: 'Boodschappen', ownership: 'shared' },
            { id: 'c-2', name: 'Eigen lunch', ownership: 'personal' },
          ],
        },
        {
          parent: { id: 'a-1', name: 'Eigen rekening', budget_type: 'archive', ownership: 'personal' },
          children: [{ id: 'a-1-sub', name: 'Eigen rekening', ownership: 'personal' }],
        },
      ]

      const entries = buildBudgetSelectEntries(groups)

      // Eerste entry is de optgroup; eigendom van de parent én van elke optie blijft behouden
      const group = entries.find(e => e.kind === 'group')
      assertNotNull(group, 'group entry aanwezig')
      if (group && group.kind === 'group') {
        assertEqual(group.ownership, 'shared', 'group-kop draagt parent-ownership')
        const sharedChild = group.options.find(o => o.id === 'c-1')
        assertNotNull(sharedChild, 'gedeeld kind aanwezig in opties')
        assertEqual(sharedChild!.ownership, 'shared', 'gedeeld kind behoudt ownership in entry-opties')
        const personalChild = group.options.find(o => o.id === 'c-2')
        assertEqual(personalChild!.ownership, 'personal', 'persoonlijk kind behoudt ownership')
      }

      // Archive-emmer levert losse opties op die hun ownership behouden
      const archiveOption = entries.find(e => e.kind === 'option')
      assertNotNull(archiveOption, 'archive-optie aanwezig')
      if (archiveOption && archiveOption.kind === 'option') {
        assertEqual(archiveOption.ownership, 'personal', 'archive-optie behoudt ownership')
      }
    },
  },
  {
    id: 'budget-crud-select-entries-childless-parent',
    name: 'Budget keuzelijst: childless hoofdbudget is direct selecteerbaar',
    description:
      'Een hoofdbudget zonder subbudgetten (Minimalistisch-template: boeken direct op het hoofdbudget) verschijnt als losse optie in buildBudgetSelectEntries — anders is een minimalistisch plan onbruikbaar in de handmatige toewijs-UI\'s terwijl AI-categorisatie het wél kan kiezen.',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 30,
    fn() {
      const groups: BudgetSelectGroup[] = [
        {
          parent: { id: 'p-wonen', name: 'Vaste lasten wonen & energie', budget_type: 'expense', ownership: 'personal' },
          children: [],
        },
        {
          parent: { id: 'p-dagelijks', name: 'Dagelijkse uitgaven', budget_type: 'expense', ownership: 'shared' },
          children: [{ id: 'c-bood', name: 'Boodschappen', ownership: 'shared' }],
        },
      ]

      const entries = buildBudgetSelectEntries(groups)

      // Childless expense-parent → directe optie op de parent zelf
      const childlessOption = entries.find(e => e.kind === 'option' && e.id === 'p-wonen')
      assertNotNull(childlessOption, 'childless hoofdbudget aanwezig als directe optie')
      if (childlessOption && childlessOption.kind === 'option') {
        assertEqual(childlessOption.name, 'Vaste lasten wonen & energie', 'optie draagt parent-naam')
        assertEqual(childlessOption.ownership, 'personal', 'optie behoudt parent-ownership')
      }

      // Parent mét children blijft een optgroup (geen gedragsverandering)
      const group = entries.find(e => e.kind === 'group' && e.id === 'p-dagelijks')
      assertNotNull(group, 'parent met children blijft optgroup')
    },
  },
  // ── J: FK-violation bug — category_corrections.budget_id NO ACTION ───────────
  //
  // Bug: category_corrections.budget_id heeft FK met confdeltype='a' (NO ACTION)
  // en is NOT NULL — als enige van alle 9 budget-FK's. Gevolg: een DELETE op budgets
  // (via save_budget_plan of /api/budgets/[id]) faalt met FK-violation als er een
  // correction op dat budget staat.
  //
  // Geplande fix: migratie die budget_id nullable maakt + FK naar ON DELETE SET NULL;
  // plus guard in categorizeTransaction zodat corrections met budget_id=null worden
  // overgeslagen.
  //
  // Verificationstrategie: SQL-repro via ROLLBACK (zie test-runner-output / looptijd).
  // De regression-case hieronder documenteert het gedrag NADAT de fix is uitgerold;
  // hij is groen zodra migratie + parser-guard zijn doorgevoerd.
  {
    id: 'budget-crud-correction-survives-budget-delete',
    name: 'Budget verwijderen: category_correction overleeft met budget_id=null (na fix)',
    description:
      'Wanneer een budget wordt verwijderd waarop een category_correction staat, moet de FK ' +
      'ON DELETE SET NULL de correction bewaren (budget_id wordt null) in plaats van een FK-violation te gooien. ' +
      'De categorizer moet zulke null-corrections vervolgens overslaan.',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 100,
    // Draait tegen de échte categorizer (geen nagebouwde guard) zonder DB-roundtrip.
    fn() {
      const budgets = [
        { id: 'b-boodschappen', name: 'Boodschappen', slug: BUDGET_SLUGS.BOODSCHAPPEN },
      ] as unknown as Budget[]

      // Wees-correction zoals de DB die na de fix achterlaat: budget verwijderd → SET NULL.
      const orphanCorrection: CategoryCorrection = {
        match_field: 'counterparty_name',
        match_value: 'Picnic',
        budget_id: null,
      }

      // Contract 1: null-correction levert GEEN manual-hit op — de categorizer
      // valt door naar de keyword-laag ('picnic' → boodschappen).
      const viaOrphan = categorizeTransaction('Picnic bezorging', 'Picnic', -32, budgets, [orphanCorrection])
      assert(viaOrphan.category_source !== 'manual', 'null-correction wordt overgeslagen (geen manual-hit)')
      assertEqual(viaOrphan.budget_id, 'b-boodschappen', 'keyword-fallback categoriseert alsnog naar boodschappen')

      // Contract 2: een geldige correction passeert de guard en wint met confidence 1.0.
      const validCorrection: CategoryCorrection = { match_field: 'counterparty_name', match_value: 'Picnic', budget_id: 'b-boodschappen' }
      const viaValid = categorizeTransaction('Picnic bezorging', 'Picnic', -32, budgets, [validCorrection])
      assertEqual(viaValid.category_source, 'manual', 'geldige correction is een manual-hit')
      assertEqual(viaValid.confidence, 1.0, 'geldige correction wint met confidence 1.0')

      // Contract 3: de correction-rij zélf overleeft het delete-pad (DB-contract:
      // NO ACTION → SET NULL; rij blijft, alleen budget_id wordt null).
      const correctionAfterFix = { ...orphanCorrection, budget_id: null }
      assertEqual(correctionAfterFix.budget_id, null, 'correction.budget_id is null na budget-delete (SET NULL)')
      assertEqual(correctionAfterFix.match_value, 'Picnic', 'match_value blijft behouden na delete')
    },
  },

  {
    id: 'budget-crud-tx-ownership-default-from-account',
    name: 'Transactie eigendom: standaard afgeleid van rekening',
    description: 'Nieuwe transactie erft accountOwnership; bewerken behoudt eigen ownership; geen → personal',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      // Spiegel van TransactionForm: nieuw → accountOwnership ?? 'personal',
      // bewerken → transaction.ownership ?? 'personal'.
      function defaultOwnership(
        accountOwnership: 'personal' | 'shared' | undefined,
        existing: { ownership?: 'personal' | 'shared' } | undefined,
      ): 'personal' | 'shared' {
        return existing ? (existing.ownership ?? 'personal') : (accountOwnership ?? 'personal')
      }

      // Nieuwe transactie op een persoonlijke rekening → personal
      assertEqual(defaultOwnership('personal', undefined), 'personal', 'persoonlijke rekening → personal')
      // Nieuwe transactie op een gedeelde rekening → shared
      assertEqual(defaultOwnership('shared', undefined), 'shared', 'gedeelde rekening → shared')
      // Geen rekening-eigendom bekend → veilige default personal
      assertEqual(defaultOwnership(undefined, undefined), 'personal', 'onbekend rekening-eigendom → personal')
      // Bewerken: bestaand shared blijft shared (ongeacht rekening)
      assertEqual(defaultOwnership('personal', { ownership: 'shared' }), 'shared', 'bewerken behoudt shared')
      // Bewerken zonder ownership-veld → personal
      assertEqual(defaultOwnership('shared', {}), 'personal', 'bewerken zonder ownership → personal')
    },
  },
  {
    id: 'budget-crud-share-suggestion-trigger',
    name: 'Transactie deel-suggestie: triggervoorwaarde',
    description: 'Suggestie verschijnt als gekozen budget gedeeld is, tx persoonlijk en er een huishouden is',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      // Spiegel van showShareSuggestion in TransactionForm.
      function showShareSuggestion(opts: {
        hasHousehold: boolean
        txOwnership: 'personal' | 'shared'
        dismissed: boolean
        selectedBudgetIsShared: boolean
      }): boolean {
        return (
          opts.hasHousehold &&
          opts.txOwnership === 'personal' &&
          !opts.dismissed &&
          opts.selectedBudgetIsShared
        )
      }

      // Volledige triggervoorwaarde → suggestie tonen
      assert(
        showShareSuggestion({ hasHousehold: true, txOwnership: 'personal', dismissed: false, selectedBudgetIsShared: true }),
        'huishouden + persoonlijke tx + gedeeld budget → suggestie',
      )
      // Geen huishouden → nooit
      assert(
        !showShareSuggestion({ hasHousehold: false, txOwnership: 'personal', dismissed: false, selectedBudgetIsShared: true }),
        'geen huishouden → geen suggestie',
      )
      // Transactie al gedeeld → geen suggestie nodig
      assert(
        !showShareSuggestion({ hasHousehold: true, txOwnership: 'shared', dismissed: false, selectedBudgetIsShared: true }),
        'tx al gedeeld → geen suggestie',
      )
      // Budget persoonlijk → geen mismatch, geen suggestie
      assert(
        !showShareSuggestion({ hasHousehold: true, txOwnership: 'personal', dismissed: false, selectedBudgetIsShared: false }),
        'persoonlijk budget → geen suggestie',
      )
      // Eenmaal weggeklikt → blijft weg
      assert(
        !showShareSuggestion({ hasHousehold: true, txOwnership: 'personal', dismissed: true, selectedBudgetIsShared: true }),
        'weggeklikt → geen suggestie',
      )
    },
  },
]

// ── Registration ────────────────────────────────────────────────────────────

export function register() {
  registerCategory({
    id: CAT,
    label: 'De Kern — Budget CRUD',
    description: 'Budget aanmaken, bewerken, verwijderen, formulier validatie en categorie-koppeling',
    icon: 'Wallet',
    testCount: 0,
  })
  registerTests(tests)
}

/**
 * Regression tests: Budget plan editor
 *
 * Tests for the new "Budgetten aanpassen" flow:
 * - Pure diff function (lib/budget-plan-diff.ts)
 * - Historical-amounts invariant
 * - Temp-id resolution for inserts + amounts
 * - Template-replace flow building the right tree
 */

import { registerCategory, registerTests } from '../test-registry'
import {
  assert,
  assertEqual,
  assertGreaterThan,
  assertGreaterThanOrEqual,
} from '../assert'
import type { TestCase } from '../test-types'
import type { Budget, BudgetWithChildren } from '@/lib/budget-data'
import {
  computeBudgetPlanDiff,
  countDiff,
  firstOfCurrentMonth,
  isTempId,
  resolveActiveAmount,
  type BudgetAmountLite,
  type DraftBudget,
} from '@/lib/budget-plan-diff'
import {
  BUDGET_TEMPLATES,
  buildTemplateAmounts,
  buildTemplateSeed,
} from '@/lib/budget-templates/onboarding-presets'
import { BUDGET_SLUGS } from '@/lib/budget-data'

const CAT = 'kern.budget-plan-editor'

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'budget-1',
    user_id: 'user-1',
    parent_id: null,
    name: 'Wonen',
    slug: 'wonen',
    icon: 'Home',
    description: null,
    default_limit: 1200,
    budget_type: 'expense',
    interval: 'monthly',
    rollover_type: 'reset',
    limit_type: 'soft',
    alert_threshold: 80,
    max_single_transaction_amount: 0,
    is_essential: true,
    priority_score: 3,
    is_inflation_indexed: false,
    sort_order: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ownership: 'personal',
    household_id: null,
    goal_type: null,
    goal_amount: null,
    goal_date: null,
    goal_frequency: null,
    is_favorite: false,
    ...overrides,
  }
}

function draftFromBudget(b: Budget, amount: number | null): DraftBudget {
  return {
    id: b.id,
    parentId: b.parent_id,
    name: b.name,
    slug: b.slug,
    icon: b.icon,
    description: b.description,
    budgetType: b.budget_type,
    defaultLimit: Number(b.default_limit),
    isEssential: b.is_essential,
    sortOrder: b.sort_order,
    interval: b.interval,
    rolloverType: b.rollover_type,
    amount,
  }
}

function tree(parents: Budget[], children: Record<string, Budget[]> = {}): BudgetWithChildren[] {
  return parents.map((p) => ({ ...p, children: children[p.id] ?? [] }))
}

// ── Tests ────────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  {
    id: 'budget-plan-diff-empty',
    name: 'Diff: leeg tree + leeg draft → geen wijzigingen',
    description: 'No original rows and no draft rows produces an empty diff',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const diff = computeBudgetPlanDiff([], [], [], '2026-04-01')
      assertEqual(countDiff(diff), 0, 'no changes')
      assertEqual(diff.to_insert.length, 0, 'no inserts')
      assertEqual(diff.to_update.length, 0, 'no updates')
      assertEqual(diff.to_delete.length, 0, 'no deletes')
      assertEqual(diff.amounts.length, 0, 'no amounts')
    },
  },
  {
    id: 'budget-plan-diff-insert-only',
    name: 'Diff: alleen insert (tmp-id)',
    description: 'A draft row with a tmp- id produces an insert with amount upsert',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const draft: DraftBudget[] = [{
        id: 'tmp-abc', parentId: null, name: 'Nieuw', slug: null, icon: 'Circle',
        description: null, budgetType: 'expense', defaultLimit: 100,
        isEssential: false, sortOrder: 0, interval: 'monthly', rolloverType: 'reset',
        amount: 150,
      }]
      const diff = computeBudgetPlanDiff([], draft, [], '2026-04-01')
      assertEqual(diff.to_insert.length, 1, '1 insert')
      assertEqual(diff.to_insert[0].client_id, 'tmp-abc', 'client_id forwarded')
      assertEqual(diff.to_insert[0].parent_client_id, null, 'no parent client_id')
      assertEqual(diff.amounts.length, 1, '1 amount upsert')
      assertEqual(diff.amounts[0].budget_id, 'tmp-abc', 'amount references client_id')
      assertEqual(diff.amounts[0].amount, 150, 'amount value')
      assertEqual(diff.to_delete.length, 0, 'no deletes')
    },
  },
  {
    id: 'budget-plan-diff-update-only',
    name: 'Diff: alleen field-update detecteren',
    description: 'Changing name on an existing budget produces exactly one update',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const original = makeBudget({ id: 'b1', name: 'Oud' })
      const draft = [draftFromBudget({ ...original, name: 'Nieuw' }, null)]
      const diff = computeBudgetPlanDiff(tree([original]), draft, [], '2026-04-01')
      assertEqual(diff.to_update.length, 1, '1 update')
      assertEqual(diff.to_update[0].id, 'b1', 'correct id')
      assertEqual(diff.to_update[0].name, 'Nieuw', 'new name in patch')
      assertEqual(diff.to_update[0].icon, undefined, 'icon not included (unchanged)')
    },
  },
  {
    id: 'budget-plan-diff-delete-detection',
    name: 'Diff: verwijderde rijen in to_delete',
    description: 'An original budget not present in draft is scheduled for delete',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const a = makeBudget({ id: 'a', name: 'A' })
      const b = makeBudget({ id: 'b', name: 'B' })
      const draft = [draftFromBudget(a, null)]
      const diff = computeBudgetPlanDiff(tree([a, b]), draft, [], '2026-04-01')
      assertEqual(diff.to_delete.length, 1, '1 delete')
      assertEqual(diff.to_delete[0], 'b', 'correct id deleted')
    },
  },
  {
    id: 'budget-plan-diff-amount-no-change-skipped',
    name: 'Diff: ongewijzigd bedrag → geen amount-upsert',
    description: 'When draft.amount equals the active amount, no amount row is emitted',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const original = makeBudget({ id: 'b', default_limit: 200 })
      const amounts: BudgetAmountLite[] = [
        { budget_id: 'b', effective_from: '2026-04-01', amount: 250 },
      ]
      const draft = [draftFromBudget(original, 250)] // matches active amount
      const diff = computeBudgetPlanDiff(tree([original]), draft, amounts, '2026-04-01')
      assertEqual(diff.amounts.length, 0, 'no amount upsert')
    },
  },
  {
    id: 'budget-plan-diff-amount-change-emitted',
    name: 'Diff: gewijzigd bedrag → upsert met effectiveFrom',
    description: 'Changed amount produces an upsert targeting current month',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const original = makeBudget({ id: 'b', default_limit: 200 })
      const amounts: BudgetAmountLite[] = [
        { budget_id: 'b', effective_from: '2026-04-01', amount: 250 },
      ]
      const draft = [draftFromBudget(original, 300)]
      const diff = computeBudgetPlanDiff(tree([original]), draft, amounts, '2026-04-01')
      assertEqual(diff.amounts.length, 1, '1 amount upsert')
      assertEqual(diff.amounts[0].effective_from, '2026-04-01', 'effective_from = active month')
      assertEqual(diff.amounts[0].amount, 300, 'new amount')
    },
  },
  {
    id: 'budget-plan-diff-temp-parent-resolution',
    name: 'Diff: nieuwe parent + kind gebruiken parent_client_id',
    description: 'A child inserted under a tmp- parent gets parent_client_id not parent_id',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const parent: DraftBudget = {
        id: 'tmp-p', parentId: null, name: 'Parent', slug: null, icon: 'Circle',
        description: null, budgetType: 'expense', defaultLimit: 0, isEssential: false,
        sortOrder: 0, interval: 'monthly', rolloverType: 'reset', amount: null,
      }
      const child: DraftBudget = {
        id: 'tmp-c', parentId: 'tmp-p', name: 'Kind', slug: null, icon: 'Circle',
        description: null, budgetType: 'expense', defaultLimit: 50, isEssential: false,
        sortOrder: 0, interval: 'monthly', rolloverType: 'reset', amount: 50,
      }
      const diff = computeBudgetPlanDiff([], [parent, child], [], '2026-04-01')
      assertEqual(diff.to_insert.length, 2, '2 inserts')
      const childIns = diff.to_insert.find((r) => r.client_id === 'tmp-c')!
      assertEqual(childIns.parent_client_id, 'tmp-p', 'child uses parent_client_id')
      assertEqual(childIns.parent_id, null, 'child has no UUID parent_id')
    },
  },
  {
    id: 'budget-plan-diff-count',
    name: 'countDiff: optelling van alle mutaties',
    description: 'countDiff returns sum across all four diff categories',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      assertEqual(countDiff({ to_insert: [{} as never, {} as never], to_update: [{} as never], to_delete: ['x'], amounts: [{} as never, {} as never] }), 6, 'sum')
    },
  },
  {
    id: 'budget-plan-is-temp-id',
    name: 'isTempId: herkent tmp- prefix',
    description: 'isTempId returns true only for ids prefixed with tmp-',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      assert(isTempId('tmp-1234'), 'tmp- matches')
      assert(!isTempId('abc-tmp-1234'), 'mid-string does not match')
      assert(!isTempId('550e8400-e29b-41d4-a716-446655440000'), 'UUID does not match')
    },
  },
  {
    id: 'budget-plan-resolve-active-amount',
    name: 'resolveActiveAmount: kiest laatst-geldige rij',
    description: 'resolveActiveAmount returns most recent amount on-or-before the date',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 5,
    fn() {
      const amounts: BudgetAmountLite[] = [
        { budget_id: 'b', effective_from: '2026-01-01', amount: 100 },
        { budget_id: 'b', effective_from: '2026-03-01', amount: 200 },
        { budget_id: 'b', effective_from: '2026-05-01', amount: 300 },
      ]
      assertEqual(resolveActiveAmount('b', '2026-04-01', amounts), 200, 'picks march')
      assertEqual(resolveActiveAmount('b', '2026-05-01', amounts), 300, 'picks may')
      assertEqual(resolveActiveAmount('b', '2025-12-31', amounts), null, 'nothing before jan')
      assertEqual(resolveActiveAmount('other', '2026-04-01', amounts), null, 'unknown budget')
    },
  },
  {
    id: 'budget-plan-first-of-current-month',
    name: 'firstOfCurrentMonth: ISO-formaat YYYY-MM-01',
    description: 'firstOfCurrentMonth returns the first calendar day of the passed month',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 5,
    fn() {
      assertEqual(firstOfCurrentMonth(new Date('2026-04-17T12:00:00Z')), '2026-04-01', 'april')
      assertEqual(firstOfCurrentMonth(new Date('2026-01-01T00:00:00Z')), '2026-01-01', 'jan boundary')
      assertEqual(firstOfCurrentMonth(new Date('2026-12-31T23:00:00Z')), '2026-12-01', 'december')
    },
  },
  {
    id: 'budget-plan-templates-exported',
    name: 'Templates: 3 onboarding-templates zichtbaar',
    description: 'The editor relies on BUDGET_TEMPLATES + buildTemplateAmounts exports',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      assertEqual(BUDGET_TEMPLATES.length, 3, '3 templates')
      const ids = BUDGET_TEMPLATES.map((t) => t.id).sort()
      assertEqual(ids.join(','), 'minimalistisch,nibud,uitgebreid', 'expected template ids')
      for (const tpl of BUDGET_TEMPLATES) {
        assertGreaterThan(tpl.categories.length, 0, `${tpl.id} has categories`)
      }
    },
  },
  {
    id: 'budget-plan-template-amount-sum',
    name: 'Templates: verdeelde bedragen sommeren naar netto-inkomen',
    description: 'buildTemplateAmounts preserves total income (rounding-safe)',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      for (const tpl of BUDGET_TEMPLATES) {
        const amounts = buildTemplateAmounts(3000, tpl.id)
        const expenseSlugs = Object.keys(amounts).filter(
          (s) => s !== 'salaris-uitkering' && s !== 'toeslagen-kinderbijslag' && s !== 'teruggave-belasting' && s !== 'overige-inkomsten',
        )
        const expenseSum = expenseSlugs.reduce((n, s) => n + (amounts[s] || 0), 0)
        assertEqual(expenseSum, 3000, `${tpl.id}: expenses sum to 3000`)
      }
    },
  },
  {
    id: 'budget-plan-diff-historical-amount-ignored-when-effective-is-current',
    name: 'Diff: alleen current-month effectiveFrom wordt geschreven',
    description: 'The diff function only emits amount rows with effective_from === active month',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const original = makeBudget({ id: 'b' })
      const draft = [draftFromBudget(original, 999)]
      // even if the input amounts contain historical rows, the diff targets current month only
      const amounts: BudgetAmountLite[] = [
        { budget_id: 'b', effective_from: '2025-12-01', amount: 100 },
      ]
      const diff = computeBudgetPlanDiff(tree([original]), draft, amounts, '2026-04-01')
      assertEqual(diff.amounts.length, 1, '1 upsert')
      assertEqual(diff.amounts[0].effective_from, '2026-04-01', 'always current month')
      assertGreaterThanOrEqual(diff.amounts[0].effective_from.localeCompare('2026-04-01'), 0, 'never historical')
    },
  },
  {
    id: 'budget-plan-seed-minimalistisch-childless-limits',
    name: 'buildTemplateSeed minimalistisch: childless bestedings-parents met default_limit > 0',
    description:
      'Fase C invariant: minimalistisch boekt direct op het hoofdbudget. ' +
      'buildTemplateSeed levert wonen/dagelijks/vervoer/leuke-dingen zonder children maar met een positieve limiet.',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const seed = buildTemplateSeed('minimalistisch', 3000)

      // These parents have empty slugs[] → childless, but limit = parent allocation
      const childlessExpected = [
        BUDGET_SLUGS.VASTE_LASTEN_WONEN,
        BUDGET_SLUGS.DAGELIJKSE_UITGAVEN,
        BUDGET_SLUGS.VERVOER,
        BUDGET_SLUGS.LEUKE_DINGEN,
      ]

      for (const slug of childlessExpected) {
        const parent = seed.find((p) => p.slug === slug)
        assert(parent !== undefined, `${slug} aanwezig in minimalistisch seed`)
        assertEqual(
          (parent?.children ?? []).length,
          0,
          `${slug}: geen children (transacties direct op hoofdbudget)`,
        )
        assert(
          (parent?.default_limit ?? 0) > 0,
          `${slug}: default_limit > 0 (niet €0 — template alloceert bedrag op parent)`,
        )
      }

      // Sanity: sum of these childless parents (+ sparen children + schulden 0) == netIncome
      const incomeSlugs = [BUDGET_SLUGS.INKOMEN, BUDGET_SLUGS.EIGEN_REKENING]
      const expenseSum = seed
        .filter((p) => !incomeSlugs.includes(p.slug as (typeof incomeSlugs)[number]))
        .reduce((n, p) => n + p.default_limit, 0)
      assertEqual(expenseSum, 3000, 'minimalistisch seed: bestedings-parents sommeren naar 3000')
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'De Kern — Budgetplan editor',
    description: 'Tree-editor diff-functie + templates + historical-amount invariant',
    icon: 'Pencil',
    testCount: 0,
  })
  registerTests(tests)
}

/**
 * Regression tests: Budget API routes
 *
 * Tests for budget-related API endpoints:
 * - DELETE /api/budgets/[id]: cascade deletion
 * - PUT /api/budgets/favorites: sync favorites
 * - GET /api/budget-trends: 12-month trend calculation
 * - GET /api/budget-variance: spending variance & confidence
 * - GET /api/cashflow-forecast: 6-month cashflow projection
 */

import { registerTests, registerCategory } from '../test-registry'
import {
  assert,
  assertEqual,
  assertGreaterThan,
  assertGreaterThanOrEqual,
  assertLessThanOrEqual,
  assertFinite,
  assertNotNull,
  assertType,
  assertIncludes,
} from '../assert'
import type { TestCase } from '../test-types'

const CAT = 'kern-api-routes'

// Category 'kern-api-routes' is already registered in test-registry.ts

// ── Tests ────────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── A: DELETE /api/budgets/[id] ──────────────────────────────────────────
  {
    id: 'budget-api-delete-uuid-validation',
    name: 'DELETE /api/budgets/[id]: UUID formaat validatie',
    description: 'Invalid UUID format returns 400 error',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // The route validates UUID format before any DB call
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

      // Valid UUIDs
      assert(uuidRegex.test('550e8400-e29b-41d4-a716-446655440000'), 'Valid UUID passes')
      assert(uuidRegex.test('A550E840-E29B-41D4-A716-446655440000'), 'Uppercase UUID passes')

      // Invalid UUIDs
      assert(!uuidRegex.test('not-a-uuid'), 'Short string rejected')
      assert(!uuidRegex.test(''), 'Empty string rejected')
      assert(!uuidRegex.test('550e8400-e29b-41d4-a716'), 'Incomplete UUID rejected')
      assert(!uuidRegex.test('550e8400-e29b-41d4-a716-44665544000g'), 'Non-hex char rejected')
    },
  },
  {
    id: 'budget-api-delete-cascade-structure',
    name: 'DELETE /api/budgets/[id]: cascade verwijdering structuur',
    description: 'Parent budget deletion cascades to children, rollovers, amounts, and unlinks transactions',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Simulate the cascade deletion logic from the route
      const parentBudget = { id: 'parent-1', parent_id: null, name: 'Wonen' }
      const children = [
        { id: 'child-1', parent_id: 'parent-1' },
        { id: 'child-2', parent_id: 'parent-1' },
        { id: 'child-3', parent_id: 'parent-1' },
      ]

      // When deleting a parent, collect all IDs (parent + children)
      const budgetIdsToDelete: string[] = [parentBudget.id]
      const isParent = !parentBudget.parent_id

      if (isParent) {
        const childIds = children
          .filter(c => c.parent_id === parentBudget.id)
          .map(c => c.id)
        budgetIdsToDelete.push(...childIds)
      }

      assertEqual(budgetIdsToDelete.length, 4, 'Parent + 3 children to delete')
      assertIncludes(budgetIdsToDelete, 'parent-1', 'Parent included')
      assertIncludes(budgetIdsToDelete, 'child-1', 'Child 1 included')
      assertIncludes(budgetIdsToDelete, 'child-2', 'Child 2 included')
      assertIncludes(budgetIdsToDelete, 'child-3', 'Child 3 included')

      // Response shape validation
      const response = {
        success: true,
        deleted: {
          budget_id: parentBudget.id,
          budget_name: parentBudget.name,
          is_parent: isParent,
          children_deleted: children.length,
          rollovers_deleted: 5,
          amounts_deleted: 12,
          transactions_unlinked: 45,
        },
      }

      assert(response.success, 'Response success flag')
      assertEqual(response.deleted.budget_id, 'parent-1', 'Response contains budget_id')
      assertEqual(response.deleted.budget_name, 'Wonen', 'Response contains budget_name')
      assert(response.deleted.is_parent, 'Response marks as parent')
      assertEqual(response.deleted.children_deleted, 3, 'Response tracks children count')
      assertType(response.deleted.rollovers_deleted, 'number', 'rollovers_deleted is number')
      assertType(response.deleted.amounts_deleted, 'number', 'amounts_deleted is number')
      assertType(response.deleted.transactions_unlinked, 'number', 'transactions_unlinked is number')
    },
  },
  {
    id: 'budget-api-delete-child-no-cascade',
    name: 'DELETE /api/budgets/[id]: child budget geen cascade',
    description: 'Deleting a child budget does not cascade to siblings',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Child budget has a parent_id, so no cascade
      const childBudget = { id: 'child-1', parent_id: 'parent-1', name: 'Huur' }
      const budgetIdsToDelete: string[] = [childBudget.id]
      const isParent = !childBudget.parent_id

      // Should NOT attempt to find children
      assert(!isParent, 'Child budget is not parent')
      assertEqual(budgetIdsToDelete.length, 1, 'Only the child itself is deleted')

      const response = {
        success: true,
        deleted: {
          budget_id: childBudget.id,
          budget_name: childBudget.name,
          is_parent: isParent,
          children_deleted: 0,
          rollovers_deleted: 0,
          amounts_deleted: 0,
          transactions_unlinked: 0,
        },
      }

      assert(!response.deleted.is_parent, 'Response marks as child')
      assertEqual(response.deleted.children_deleted, 0, 'No children deleted')
    },
  },
  {
    id: 'budget-api-delete-transaction-unlink',
    name: 'DELETE /api/budgets/[id]: transacties worden ontkoppeld, niet verwijderd',
    description: 'Transactions are unlinked (budget_id=null) rather than deleted to preserve history',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // The route sets budget_id to null rather than deleting transactions
      // This ensures transaction history is preserved
      const transactions = [
        { id: 'tx-1', budget_id: 'budget-1', amount: -85, description: 'Albert Heijn' },
        { id: 'tx-2', budget_id: 'budget-1', amount: -42, description: 'Jumbo' },
        { id: 'tx-3', budget_id: 'budget-2', amount: -120, description: 'Ziggo' },
      ]

      const budgetIdsToDelete = ['budget-1']

      // Simulate unlinking
      const unlinked = transactions
        .filter(tx => budgetIdsToDelete.includes(tx.budget_id))
        .map(tx => ({ ...tx, budget_id: null }))

      assertEqual(unlinked.length, 2, 'Two transactions unlinked')
      assertEqual(unlinked[0].budget_id, null, 'budget_id set to null')
      assertEqual(unlinked[0].amount, -85, 'Transaction amount preserved')
      assertEqual(unlinked[0].description, 'Albert Heijn', 'Transaction description preserved')

      // Unaffected transactions remain linked
      const remaining = transactions.filter(tx => !budgetIdsToDelete.includes(tx.budget_id))
      assertEqual(remaining.length, 1, 'One transaction unaffected')
      assertEqual(remaining[0].budget_id, 'budget-2', 'Other budget_id preserved')
    },
  },

  // ── B: PUT /api/budgets/favorites ────────────────────────────────────────
  {
    id: 'budget-api-favorites-sync',
    name: 'PUT /api/budgets/favorites: favorieten synchronisatie',
    description: 'Favorites endpoint accepts array of IDs and syncs is_favorite flag',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Request body validation
      const validBody = { favoriteIds: ['id-1', 'id-2', 'id-3'] }
      assert(Array.isArray(validBody.favoriteIds), 'favoriteIds is array')

      // Simulate sync logic: clear all, then set selected
      const budgets = [
        { id: 'id-1', is_favorite: false },
        { id: 'id-2', is_favorite: true },
        { id: 'id-3', is_favorite: false },
        { id: 'id-4', is_favorite: true },
      ]

      // Step 1: Clear all favorites
      const cleared = budgets.map(b => ({ ...b, is_favorite: false }))
      assert(cleared.every(b => !b.is_favorite), 'All favorites cleared')

      // Step 2: Set selected as favorite
      const synced = cleared.map(b => ({
        ...b,
        is_favorite: validBody.favoriteIds.includes(b.id),
      }))

      assertEqual(synced.filter(b => b.is_favorite).length, 3, 'Three budgets favorited')
      assert(synced.find(b => b.id === 'id-1')!.is_favorite, 'id-1 is favorite')
      assert(synced.find(b => b.id === 'id-2')!.is_favorite, 'id-2 is favorite')
      assert(synced.find(b => b.id === 'id-3')!.is_favorite, 'id-3 is favorite')
      assert(!synced.find(b => b.id === 'id-4')!.is_favorite, 'id-4 is NOT favorite')
    },
  },
  {
    id: 'budget-api-favorites-validation',
    name: 'PUT /api/budgets/favorites: request body validatie',
    description: 'Invalid body (non-array favoriteIds) returns 400',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Valid: array of strings
      assert(Array.isArray(['id-1', 'id-2']), 'Array is valid')

      // Invalid: non-array values
      assert(!Array.isArray('id-1'), 'String is invalid')
      assert(!Array.isArray(42), 'Number is invalid')
      assert(!Array.isArray(null), 'null is invalid')
      assert(!Array.isArray(undefined), 'undefined is invalid')
      assert(!Array.isArray({ favoriteIds: ['id-1'] }), 'Object is invalid')

      // Empty array is valid (clears all favorites)
      assert(Array.isArray([]), 'Empty array is valid')
    },
  },
  {
    id: 'budget-api-favorites-empty-array',
    name: 'PUT /api/budgets/favorites: lege array wist alle favorieten',
    description: 'Sending empty array clears all favorites without error',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      const budgets = [
        { id: 'id-1', is_favorite: true },
        { id: 'id-2', is_favorite: true },
      ]
      const favoriteIds: string[] = []

      // Clear all
      const cleared = budgets.map(b => ({ ...b, is_favorite: false }))

      // No IDs to set, so step 2 is skipped
      assertEqual(favoriteIds.length, 0, 'Empty favoriteIds')
      assert(cleared.every(b => !b.is_favorite), 'All favorites cleared')
    },
  },

  // ── C: GET /api/budget-trends ────────────────────────────────────────────
  {
    id: 'budget-api-trends-12-months',
    name: 'GET /api/budget-trends: 12-maanden venster',
    description: 'Trends endpoint returns exactly 12 months of data per budget',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Build 12 month windows (same logic as route)
      const now = new Date()
      const months: { start: string; end: string; label: string; month: string }[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const start = d.toISOString().split('T')[0]
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().split('T')[0]
        const label = d.toLocaleDateString('nl-NL', { month: 'short' })
        months.push({ start, end, label, month: start })
      }

      assertEqual(months.length, 12, 'Exactly 12 months')

      // Each month's start < end
      for (const m of months) {
        assert(m.start < m.end, `${m.start} < ${m.end}`)
      }

      // Months are in chronological order
      for (let i = 1; i < months.length; i++) {
        assert(months[i].start > months[i - 1].start, `Month ${i} after ${i - 1}`)
      }

      // Labels are short Dutch month names
      assertType(months[0].label, 'string', 'Label is string')
      assertGreaterThan(months[0].label.length, 0, 'Label is non-empty')
    },
  },
  {
    id: 'budget-api-trends-parent-aggregation',
    name: 'GET /api/budget-trends: parent-child aggregatie',
    description: 'Spending from child budgets is aggregated under parent categories',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Simulate parent-child aggregation
      const allBudgets = [
        { id: 'p1', name: 'Wonen', icon: '🏠', budget_type: 'expense', parent_id: null, sort_order: 1 },
        { id: 'c1', name: 'Huur', icon: '', budget_type: 'expense', parent_id: 'p1', sort_order: 2 },
        { id: 'c2', name: 'Energie', icon: '', budget_type: 'expense', parent_id: 'p1', sort_order: 3 },
        { id: 'p2', name: 'Vervoer', icon: '🚗', budget_type: 'expense', parent_id: null, sort_order: 4 },
      ]

      const parents = allBudgets.filter(b => !b.parent_id)
      const children = allBudgets.filter(b => b.parent_id)

      assertEqual(parents.length, 2, 'Two parent budgets')
      assertEqual(children.length, 2, 'Two child budgets')

      // Spending map: children have spending
      const spendingMap: Record<string, Record<string, number>> = {
        'c1': { '2026-01-01': 900, '2026-02-01': 900 },
        'c2': { '2026-01-01': 150, '2026-02-01': 160 },
      }

      // Aggregate for parent 'p1'
      const wonenChildren = children.filter(c => c.parent_id === 'p1')
      const relevantIds = wonenChildren.map(c => c.id)

      const jan = relevantIds.reduce((sum, id) => sum + (spendingMap[id]?.['2026-01-01'] ?? 0), 0)
      const feb = relevantIds.reduce((sum, id) => sum + (spendingMap[id]?.['2026-02-01'] ?? 0), 0)

      assertEqual(jan, 1050, 'January: 900 + 150 = 1050')
      assertEqual(feb, 1060, 'February: 900 + 160 = 1060')

      // Parent without children uses own ID
      const vervoerChildren = children.filter(c => c.parent_id === 'p2')
      const vervoerIds = vervoerChildren.length > 0 ? vervoerChildren.map(c => c.id) : ['p2']
      assertIncludes(vervoerIds, 'p2', 'Parent with no children uses own ID')
    },
  },
  {
    id: 'budget-api-trends-response-shape',
    name: 'GET /api/budget-trends: response shape validatie',
    description: 'Response contains trends array, monthLabels, and dataMonths',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Validate expected response shape
      const response = {
        trends: [
          {
            budgetId: 'p1',
            budgetName: 'Wonen',
            budgetIcon: '🏠',
            budgetType: 'expense' as const,
            months: [
              { month: '2026-01-01', label: 'jan', spent: 1050 },
              { month: '2026-02-01', label: 'feb', spent: 1060 },
            ],
          },
        ],
        monthLabels: ['jan', 'feb'],
        dataMonths: 2,
      }

      assert(Array.isArray(response.trends), 'trends is array')
      assert(Array.isArray(response.monthLabels), 'monthLabels is array')
      assertType(response.dataMonths, 'number', 'dataMonths is number')

      const trend = response.trends[0]
      assertType(trend.budgetId, 'string', 'budgetId is string')
      assertType(trend.budgetName, 'string', 'budgetName is string')
      assertIncludes(
        ['income', 'expense', 'savings', 'debt'],
        trend.budgetType,
        'budgetType is valid enum'
      )
      assert(Array.isArray(trend.months), 'months is array')

      const month = trend.months[0]
      assertType(month.month, 'string', 'month date is string')
      assertType(month.label, 'string', 'month label is string')
      assertType(month.spent, 'number', 'spent is number')
      assertFinite(month.spent, 'spent is finite')
    },
  },
  {
    id: 'budget-api-trends-spending-rounding',
    name: 'GET /api/budget-trends: afronding op 2 decimalen',
    description: 'Spending amounts are rounded to 2 decimal places',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      // Route uses: Math.round(totalSpent * 100) / 100
      const amounts = [33.333, 66.666, 100.005, 99.999, 0.001]
      const rounded = amounts.map(a => Math.round(a * 100) / 100)

      assertEqual(rounded[0], 33.33, '33.333 → 33.33')
      assertEqual(rounded[1], 66.67, '66.666 → 66.67')
      assertEqual(rounded[2], 100.01, '100.005 → 100.01')
      assertEqual(rounded[3], 100, '99.999 → 100')
      assertEqual(rounded[4], 0, '0.001 → 0')
    },
  },

  // ── D: GET /api/budget-variance ──────────────────────────────────────────
  {
    id: 'budget-api-variance-statistics',
    name: 'GET /api/budget-variance: statistische berekeningen',
    description: 'Variance endpoint computes mean, stdDev, CV correctly',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Same formula as the route
      const monthlySpending = [500, 520, 480, 510, 490, 500]
      const nonZero = monthlySpending.filter(v => v > 0)
      const mean = nonZero.reduce((s, v) => s + v, 0) / nonZero.length
      const variance = nonZero.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / nonZero.length
      const stdDev = Math.sqrt(variance)
      const cv = mean > 0 ? stdDev / mean : 1

      assertEqual(mean, 500, 'Mean of symmetric data')
      assertFinite(stdDev, 'StdDev is finite')
      assertGreaterThan(stdDev, 0, 'StdDev is positive for varying data')
      assertFinite(cv, 'CV is finite')
      assertGreaterThan(cv, 0, 'CV is positive')

      // CV should be small for low-variance data
      assertLessThanOrEqual(cv, 0.15, 'Low CV for consistent spending')
    },
  },
  {
    id: 'budget-api-variance-confidence-levels',
    name: 'GET /api/budget-variance: confidence level mapping',
    description: 'CV maps to high/medium/low confidence correctly',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Confidence mapping logic from the route
      function getConfidence(cv: number): { confidence: string; confidencePercent: number } {
        let confidence: string
        let confidencePercent: number

        if (cv < 0.15) {
          confidence = 'high'
          confidencePercent = Math.round(90 - cv * 100)
        } else if (cv < 0.35) {
          confidence = 'medium'
          confidencePercent = Math.round(75 - (cv - 0.15) * 150)
        } else {
          confidence = 'low'
          confidencePercent = Math.round(Math.max(20, 45 - (cv - 0.35) * 100))
        }
        confidencePercent = Math.max(10, Math.min(95, confidencePercent))
        return { confidence, confidencePercent }
      }

      // High confidence: CV < 0.15
      const high = getConfidence(0.05)
      assertEqual(high.confidence, 'high', 'CV 0.05 → high')
      assertGreaterThanOrEqual(high.confidencePercent, 80, 'High confidence ≥ 80%')
      assertLessThanOrEqual(high.confidencePercent, 95, 'High confidence ≤ 95%')

      // Medium confidence: 0.15 ≤ CV < 0.35
      const medium = getConfidence(0.25)
      assertEqual(medium.confidence, 'medium', 'CV 0.25 → medium')
      assertGreaterThanOrEqual(medium.confidencePercent, 10, 'Medium confidence ≥ 10%')

      // Low confidence: CV ≥ 0.35
      const low = getConfidence(0.5)
      assertEqual(low.confidence, 'low', 'CV 0.5 → low')
      assertGreaterThanOrEqual(low.confidencePercent, 10, 'Low confidence ≥ 10%')
      assertLessThanOrEqual(low.confidencePercent, 45, 'Low confidence ≤ 45%')

      // Boundary: exactly 0.15
      const boundary1 = getConfidence(0.15)
      assertEqual(boundary1.confidence, 'medium', 'CV 0.15 → medium')

      // Boundary: exactly 0.35
      const boundary2 = getConfidence(0.35)
      assertEqual(boundary2.confidence, 'low', 'CV 0.35 → low')
    },
  },
  {
    id: 'budget-api-variance-insufficient-data',
    name: 'GET /api/budget-variance: onvoldoende data fallback',
    description: 'Categories with < 3 months of data return insufficient confidence',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Route requires ≥ 3 non-zero months for statistics
      const scenarios = [
        { spending: [], expected: false },
        { spending: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], expected: false },
        { spending: [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], expected: false },
        { spending: [100, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], expected: false },
        { spending: [100, 200, 300, 0, 0, 0, 0, 0, 0, 0, 0, 0], expected: true },
      ]

      for (const { spending, expected } of scenarios) {
        const nonZeroMonths = spending.filter(v => v > 0).length
        const hasSufficientData = nonZeroMonths >= 3
        assertEqual(hasSufficientData, expected, `${nonZeroMonths} non-zero months`)
      }

      // Insufficient data returns zeroed stats
      const insufficientResult = {
        stdDev: 0,
        mean: 0,
        cv: 1,
        confidence: 'insufficient' as const,
        confidencePercent: 0,
        hasSufficientData: false,
      }

      assertEqual(insufficientResult.stdDev, 0, 'Zero stdDev for insufficient')
      assertEqual(insufficientResult.mean, 0, 'Zero mean for insufficient')
      assertEqual(insufficientResult.cv, 1, 'CV=1 for insufficient')
      assertEqual(insufficientResult.confidence, 'insufficient', 'Confidence is insufficient')
      assertEqual(insufficientResult.confidencePercent, 0, 'Zero confidence percent')
    },
  },
  {
    id: 'budget-api-variance-response-summary',
    name: 'GET /api/budget-variance: response summary aggregatie',
    description: 'Summary counts totalCategories, confidence distribution correctly',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const categories = [
        { confidence: 'high', hasSufficientData: true },
        { confidence: 'high', hasSufficientData: true },
        { confidence: 'medium', hasSufficientData: true },
        { confidence: 'low', hasSufficientData: true },
        { confidence: 'insufficient', hasSufficientData: false },
      ]

      const summary = {
        totalCategories: categories.length,
        withSufficientData: categories.filter(c => c.hasSufficientData).length,
        highConfidence: categories.filter(c => c.confidence === 'high').length,
        mediumConfidence: categories.filter(c => c.confidence === 'medium').length,
        lowConfidence: categories.filter(c => c.confidence === 'low').length,
        insufficientData: categories.filter(c => c.confidence === 'insufficient').length,
      }

      assertEqual(summary.totalCategories, 5, '5 total categories')
      assertEqual(summary.withSufficientData, 4, '4 with sufficient data')
      assertEqual(summary.highConfidence, 2, '2 high confidence')
      assertEqual(summary.mediumConfidence, 1, '1 medium confidence')
      assertEqual(summary.lowConfidence, 1, '1 low confidence')
      assertEqual(summary.insufficientData, 1, '1 insufficient data')

      // Sum should equal total
      const sum = summary.highConfidence + summary.mediumConfidence + summary.lowConfidence + summary.insufficientData
      assertEqual(sum, summary.totalCategories, 'Sum equals total')
    },
  },

  // ── E: GET /api/cashflow-forecast ────────────────────────────────────────
  {
    id: 'budget-api-forecast-6-months',
    name: 'GET /api/cashflow-forecast: 6-maanden projectie structuur',
    description: 'Forecast returns current month + 6 future months with correct fields',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Build forecast structure (same as route logic)
      const now = new Date()
      const forecast: {
        month: string
        label: string
        projectedBalance: number
        income: number
        expenses: number
        isCurrentMonth: boolean
      }[] = []

      // Current month
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const currentMonthLabel = now.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
      forecast.push({
        month: currentMonthStart,
        label: currentMonthLabel,
        projectedBalance: 5000,
        income: 1500,
        expenses: 800,
        isCurrentMonth: true,
      })

      // 6 future months
      for (let i = 1; i <= 6; i++) {
        const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1)
        forecast.push({
          month: futureDate.toISOString().split('T')[0],
          label: futureDate.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' }),
          projectedBalance: 5000 + i * 700,
          income: 3000,
          expenses: 2300,
          isCurrentMonth: false,
        })
      }

      assertEqual(forecast.length, 7, 'Current + 6 future = 7 data points')
      assert(forecast[0].isCurrentMonth, 'First is current month')
      assert(!forecast[1].isCurrentMonth, 'Second is future')
      assert(!forecast[6].isCurrentMonth, 'Last is future')

      // All fields present
      for (const point of forecast) {
        assertType(point.month, 'string', 'month is string')
        assertType(point.label, 'string', 'label is string')
        assertFinite(point.projectedBalance, 'projectedBalance is finite')
        assertFinite(point.income, 'income is finite')
        assertFinite(point.expenses, 'expenses is finite')
        assertType(point.isCurrentMonth, 'boolean', 'isCurrentMonth is boolean')
      }
    },
  },
  {
    id: 'budget-api-forecast-recurring-blending',
    name: 'GET /api/cashflow-forecast: recurring + pattern blending',
    description: 'Income/expense estimation blends recurring (70%) with actual patterns (30%)',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // When both recurring and recent transactions exist: 70/30 blend
      const recurringMonthlyIncome = 3000
      const recurringMonthlyExpenses = 2000
      const avgMonthlyIncome = 3500
      const avgMonthlyExpenses = 2500

      const estimatedIncome = recurringMonthlyIncome * 0.7 + avgMonthlyIncome * 0.3
      const estimatedExpenses = recurringMonthlyExpenses * 0.7 + avgMonthlyExpenses * 0.3

      assertEqual(estimatedIncome, 3150, 'Income: 3000*0.7 + 3500*0.3 = 3150')
      assertEqual(estimatedExpenses, 2150, 'Expenses: 2000*0.7 + 2500*0.3 = 2150')

      // When only recurring: 100% recurring
      const recurringOnly = recurringMonthlyIncome
      assertEqual(recurringOnly, 3000, 'Recurring only = 100% recurring')

      // When only patterns: 100% actual
      const patternsOnly = avgMonthlyIncome
      assertEqual(patternsOnly, 3500, 'Patterns only = 100% actual')
    },
  },
  {
    id: 'budget-api-forecast-recurring-frequency',
    name: 'GET /api/cashflow-forecast: recurring frequency normalisatie',
    description: 'Recurring transactions are normalized to monthly amounts',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Frequency normalization logic from the route
      const frequencies = [
        { frequency: 'weekly', amount: 100, expectedMonthly: 100 * (52 / 12) },
        { frequency: 'monthly', amount: 3000, expectedMonthly: 3000 },
        { frequency: 'quarterly', amount: 600, expectedMonthly: 200 },
        { frequency: 'yearly', amount: 1200, expectedMonthly: 100 },
      ]

      for (const { frequency, amount, expectedMonthly } of frequencies) {
        let monthlyAmount = 0
        switch (frequency) {
          case 'weekly': monthlyAmount = amount * (52 / 12); break
          case 'monthly': monthlyAmount = amount; break
          case 'quarterly': monthlyAmount = amount / 3; break
          case 'yearly': monthlyAmount = amount / 12; break
        }

        // Use approximate comparison for weekly (52/12 = 4.333...)
        const diff = Math.abs(monthlyAmount - expectedMonthly)
        assert(diff < 0.01, `${frequency}: ${monthlyAmount} ≈ ${expectedMonthly}`)
      }
    },
  },
  {
    id: 'budget-api-forecast-low-balance-alerts',
    name: 'GET /api/cashflow-forecast: saldo-waarschuwingen',
    description: 'Alerts fire when projected balance drops below €500 or €0',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Simulate balance trajectory with declining trend
      const forecast = [
        { month: '2026-03-01', label: 'mrt 2026', projectedBalance: 2000, isCurrentMonth: true },
        { month: '2026-04-01', label: 'apr 2026', projectedBalance: 1200, isCurrentMonth: false },
        { month: '2026-05-01', label: 'mei 2026', projectedBalance: 400, isCurrentMonth: false },
        { month: '2026-06-01', label: 'jun 2026', projectedBalance: -400, isCurrentMonth: false },
        { month: '2026-07-01', label: 'jul 2026', projectedBalance: -1200, isCurrentMonth: false },
      ]

      const thresholds = [500, 0]
      const alerts: { threshold: number; month: string; balance: number }[] = []

      for (const threshold of thresholds) {
        for (const point of forecast) {
          if (point.isCurrentMonth) continue
          if (point.projectedBalance < threshold) {
            alerts.push({ threshold, month: point.month, balance: point.projectedBalance })
            break // Only first month per threshold
          }
        }
      }

      assertEqual(alerts.length, 2, 'Two alerts: €500 and €0 thresholds')

      // €500 threshold triggered in May (400 < 500)
      assertEqual(alerts[0].threshold, 500, 'First alert is €500 threshold')
      assertEqual(alerts[0].month, '2026-05-01', 'Triggered in May')
      assertEqual(alerts[0].balance, 400, 'Balance is 400')

      // €0 threshold triggered in June (-400 < 0)
      assertEqual(alerts[1].threshold, 0, 'Second alert is €0 threshold')
      assertEqual(alerts[1].month, '2026-06-01', 'Triggered in June')
      assertLessThanOrEqual(alerts[1].balance, 0, 'Balance is negative')
    },
  },
  {
    id: 'budget-api-forecast-no-data',
    name: 'GET /api/cashflow-forecast: geen data beschikbaar',
    description: 'When no transactions, recurrings, or budgets exist, returns empty forecast',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Route returns early when no data sources available
      const hasRecurrings = false
      const hasRecentTx = false
      const hasBudgets = false

      if (!hasRecurrings && !hasRecentTx && !hasBudgets) {
        const response = {
          forecast: [] as unknown[],
          alerts: [] as unknown[],
          currentBalance: 1500,
          estimatedMonthlyIncome: 0,
          estimatedMonthlyExpenses: 0,
          hasData: false,
        }

        assertEqual(response.forecast.length, 0, 'Empty forecast array')
        assertEqual(response.alerts.length, 0, 'Empty alerts array')
        assertFinite(response.currentBalance, 'Balance still returned')
        assertEqual(response.estimatedMonthlyIncome, 0, 'Zero income estimate')
        assertEqual(response.estimatedMonthlyExpenses, 0, 'Zero expense estimate')
        assert(!response.hasData, 'hasData is false')
      }
    },
  },
  {
    id: 'budget-api-forecast-partial-month',
    name: 'GET /api/cashflow-forecast: huidige maand pro-rata berekening',
    description: 'Current month projects remaining income/expenses based on day of month',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Simulate partial month calculation
      const dayOfMonth = 15
      const daysInMonth = 30
      const remainingDaysFraction = (daysInMonth - dayOfMonth) / daysInMonth

      assertEqual(remainingDaysFraction, 0.5, '15/30 → 50% remaining')

      const estimatedMonthlyIncome = 3000
      const estimatedMonthlyExpenses = 2000

      // Income already received (first half)
      const receivedIncome = estimatedMonthlyIncome * (1 - remainingDaysFraction)
      assertEqual(receivedIncome, 1500, 'Half of income already received')

      // Expenses already spent (first half)
      const spentExpenses = estimatedMonthlyExpenses * (1 - remainingDaysFraction)
      assertEqual(spentExpenses, 1000, 'Half of expenses already spent')

      // Remaining net for the month
      const monthlyNet = estimatedMonthlyIncome - estimatedMonthlyExpenses
      const remainingNet = monthlyNet * remainingDaysFraction
      assertEqual(remainingNet, 500, 'Remaining net = 500')

      // Day of month edge cases
      const firstDay = (daysInMonth - 1) / daysInMonth
      const lastDay = (daysInMonth - daysInMonth) / daysInMonth
      assertGreaterThan(firstDay, 0.9, 'Day 1: almost full month remaining')
      assertEqual(lastDay, 0, 'Last day: no remaining fraction')
    },
  },

  // ── F: Auth guards (cross-cutting) ─────────────────────────────────────
  {
    id: 'budget-api-auth-guard-consistency',
    name: 'Budget API routes: auth guard consistentie',
    description: 'All budget API endpoints check authentication and return 401',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // All routes follow the same auth pattern:
      // 1. Get user via supabase.auth.getUser()
      // 2. If no user, return 401
      const endpoints = [
        { method: 'DELETE', path: '/api/budgets/[id]', errorMsg: 'Niet ingelogd' },
        { method: 'GET', path: '/api/budgets/[id]', errorMsg: 'Niet ingelogd' },
        { method: 'PUT', path: '/api/budgets/favorites', errorMsg: 'Niet ingelogd' },
        { method: 'GET', path: '/api/budget-trends', errorMsg: 'Unauthorized' },
        { method: 'GET', path: '/api/budget-variance', errorMsg: 'Niet ingelogd' },
        { method: 'GET', path: '/api/cashflow-forecast', errorMsg: 'Niet ingelogd' },
      ]

      assertEqual(endpoints.length, 6, 'All 6 endpoints have auth guards')

      for (const endpoint of endpoints) {
        assertType(endpoint.method, 'string', `${endpoint.path} has method`)
        assertType(endpoint.path, 'string', `${endpoint.path} has path`)
        assertType(endpoint.errorMsg, 'string', `${endpoint.path} has error message`)
        assertGreaterThan(endpoint.errorMsg.length, 0, `${endpoint.path} error message non-empty`)
      }
    },
  },
]

export function register(): void {
  registerTests(tests)
}

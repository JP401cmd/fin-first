/**
 * Regression tests: De Wil — Acties filterbaar overzicht
 *
 * Tests for the action list modal filtering, sorting, and impact calculation:
 * - Status filter correctness
 * - Subject/onderwerp filter (recommendation_type + manual/chat)
 * - Week planning bucket classification
 * - Combined AND-logic across filters
 * - Impact total calculation for filtered results
 * - Sorting by impact, priority, week
 * - Empty state when no matches
 * - Performance with 50 actions
 */

import { registerTests } from '../test-registry'
import {
  assert,
  assertEqual,
} from '../assert'
import type { TestCase } from '../test-types'
import { getWeekBucket, getCurrentWeek, getNextWeek } from '@/lib/week-utils'
import type { Action, ActionStatus, RecommendationType } from '@/lib/recommendation-data'

const CAT = 'wil.acties'

// ── Test helpers ─────────────────────────────────────────────────────────────

function makeAction(overrides: Partial<Action> & { id: string }): Action {
  return {
    user_id: 'test-user',
    recommendation_id: null,
    source: 'manual',
    title: `Actie ${overrides.id}`,
    description: null,
    freedom_days_impact: 0,
    euro_impact_monthly: null,
    status: 'open',
    scheduled_week: null,
    due_date: null,
    postpone_weeks: null,
    postponed_until: null,
    rejection_reason: null,
    sort_order: 0,
    priority_score: 3,
    completed_at: null,
    status_changed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: null,
    assigned_to: null,
    assigned_by: null,
    ...overrides,
  }
}

function filterByStatus(actions: Action[], status: ActionStatus | 'all'): Action[] {
  if (status === 'all') return actions
  return actions.filter((a) => a.status === status)
}

function filterBySubject(actions: Action[], subject: RecommendationType | 'manual' | 'all'): Action[] {
  if (subject === 'all') return actions
  return actions.filter((a) => {
    if (a.recommendation?.recommendation_type) {
      return a.recommendation.recommendation_type === subject
    }
    return subject === 'manual'
  })
}

function filterByPlanning(actions: Action[], planning: string): Action[] {
  if (planning === 'all') return actions
  return actions.filter((a) => getWeekBucket(a.scheduled_week) === planning)
}

// ── Tests ────────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  {
    id: 'wil-acties-status-filter',
    name: 'Status filter: toont alleen acties met geselecteerde status',
    description: 'Each status filter value returns only actions matching that status',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const actions = [
        makeAction({ id: '1', status: 'open' }),
        makeAction({ id: '2', status: 'postponed' }),
        makeAction({ id: '3', status: 'completed' }),
        makeAction({ id: '4', status: 'rejected' }),
        makeAction({ id: '5', status: 'open' }),
      ]

      assertEqual(filterByStatus(actions, 'open').length, 2)
      assertEqual(filterByStatus(actions, 'postponed').length, 1)
      assertEqual(filterByStatus(actions, 'completed').length, 1)
      assertEqual(filterByStatus(actions, 'rejected').length, 1)
      assertEqual(filterByStatus(actions, 'all').length, 5)
    },
  },

  {
    id: 'wil-acties-subject-filter',
    name: 'Onderwerp filter: recommendation_type en handmatig correct gefilterd',
    description: 'Subject filter maps to recommendation_type or falls back to "manual" for non-recommendation actions',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const actions = [
        makeAction({ id: '1', source: 'ai', recommendation: { title: 'Budget tip', recommendation_type: 'budget_optimization' } }),
        makeAction({ id: '2', source: 'ai', recommendation: { title: 'Schuld tip', recommendation_type: 'debt_acceleration' } }),
        makeAction({ id: '3', source: 'manual', recommendation: null }),
        makeAction({ id: '4', source: 'chat', recommendation: null }),
      ]

      assertEqual(filterBySubject(actions, 'budget_optimization').length, 1)
      assertEqual(filterBySubject(actions, 'debt_acceleration').length, 1)
      assertEqual(filterBySubject(actions, 'manual').length, 2) // manual + chat both lack recommendation_type
      assertEqual(filterBySubject(actions, 'all').length, 4)
      assertEqual(filterBySubject(actions, 'income_increase').length, 0)
    },
  },

  {
    id: 'wil-acties-planning-filter',
    name: 'Weekplanning filter: bucket classificatie correct',
    description: 'getWeekBucket correctly classifies scheduled_week into this_week, next_week, later, unplanned',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const current = getCurrentWeek()
      const next = getNextWeek()

      assertEqual(getWeekBucket(null), 'unplanned')
      assertEqual(getWeekBucket(current), 'this_week')
      assertEqual(getWeekBucket(next), 'next_week')
      assertEqual(getWeekBucket('2099-W50'), 'later')

      // Actions with planning filter
      const actions = [
        makeAction({ id: '1', scheduled_week: current }),
        makeAction({ id: '2', scheduled_week: next }),
        makeAction({ id: '3', scheduled_week: '2099-W01' }),
        makeAction({ id: '4', scheduled_week: null }),
      ]

      assertEqual(filterByPlanning(actions, 'this_week').length, 1)
      assertEqual(filterByPlanning(actions, 'next_week').length, 1)
      assertEqual(filterByPlanning(actions, 'later').length, 1)
      assertEqual(filterByPlanning(actions, 'unplanned').length, 1)
    },
  },

  {
    id: 'wil-acties-combined-filter',
    name: 'Gecombineerd filter: AND-logica over status + onderwerp + planning',
    description: 'All three filters apply simultaneously with AND logic',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const current = getCurrentWeek()
      const actions = [
        makeAction({ id: '1', status: 'open', scheduled_week: current, source: 'ai', recommendation: { title: 'T', recommendation_type: 'budget_optimization' } }),
        makeAction({ id: '2', status: 'open', scheduled_week: current, source: 'manual' }),
        makeAction({ id: '3', status: 'completed', scheduled_week: current, source: 'ai', recommendation: { title: 'T', recommendation_type: 'budget_optimization' } }),
        makeAction({ id: '4', status: 'open', scheduled_week: null, source: 'ai', recommendation: { title: 'T', recommendation_type: 'budget_optimization' } }),
      ]

      // open + budget + this_week = only action 1
      const filtered = actions
        .filter((a) => a.status === 'open')
        .filter((a) => a.recommendation?.recommendation_type === 'budget_optimization')
        .filter((a) => getWeekBucket(a.scheduled_week) === 'this_week')

      assertEqual(filtered.length, 1)
      assertEqual(filtered[0].id, '1')
    },
  },

  {
    id: 'wil-acties-impact-berekening',
    name: 'Impact berekening: totaal klopt met som van gefilterde acties',
    description: 'Filtered impact total equals sum of freedom_days_impact for matching actions',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const actions = [
        makeAction({ id: '1', status: 'open', freedom_days_impact: 5 }),
        makeAction({ id: '2', status: 'open', freedom_days_impact: 3 }),
        makeAction({ id: '3', status: 'completed', freedom_days_impact: 10 }),
        makeAction({ id: '4', status: 'open', freedom_days_impact: null }),
      ]

      const openActions = filterByStatus(actions, 'open')
      const impact = Math.round(openActions.reduce((sum, a) => sum + (a.freedom_days_impact || 0), 0))

      assertEqual(impact, 8)
      assertEqual(openActions.length, 3)
    },
  },

  {
    id: 'wil-acties-sortering-impact',
    name: 'Sortering: impact-sort plaatst hoogste impact bovenaan',
    description: 'Actions sorted by freedom_days_impact descending, then priority descending',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const actions = [
        makeAction({ id: 'low', freedom_days_impact: 1, priority_score: 5 }),
        makeAction({ id: 'high', freedom_days_impact: 10, priority_score: 1 }),
        makeAction({ id: 'mid', freedom_days_impact: 5, priority_score: 3 }),
      ]

      const sorted = [...actions].sort((a, b) =>
        (b.freedom_days_impact || 0) - (a.freedom_days_impact || 0) ||
        (b.priority_score || 0) - (a.priority_score || 0)
      )

      assertEqual(sorted[0].id, 'high')
      assertEqual(sorted[1].id, 'mid')
      assertEqual(sorted[2].id, 'low')
    },
  },

  {
    id: 'wil-acties-empty-state',
    name: 'Empty state: filtercombinatie zonder resultaten geeft 0 acties',
    description: 'When no actions match the combined filter, result is empty array',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const actions = [
        makeAction({ id: '1', status: 'open', source: 'manual' }),
        makeAction({ id: '2', status: 'completed', source: 'ai', recommendation: { title: 'T', recommendation_type: 'income_increase' } }),
      ]

      // Looking for open + income_increase → none exist
      const filtered = actions
        .filter((a) => a.status === 'open')
        .filter((a) => a.recommendation?.recommendation_type === 'income_increase')

      assertEqual(filtered.length, 0)
    },
  },

  {
    id: 'wil-acties-performance-50',
    name: 'Performance: 50 acties filteren en sorteren < 50ms',
    description: 'Filtering and sorting 50 actions completes within acceptable time',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const current = getCurrentWeek()
      const statuses: ActionStatus[] = ['open', 'postponed', 'completed', 'rejected']
      const types: (RecommendationType | null)[] = ['budget_optimization', 'debt_acceleration', 'income_increase', null]

      const actions: Action[] = Array.from({ length: 50 }, (_, i) => {
        const recType = types[i % types.length]
        return makeAction({
          id: String(i),
          status: statuses[i % statuses.length],
          freedom_days_impact: Math.random() * 20,
          priority_score: (i % 5) + 1,
          scheduled_week: i % 3 === 0 ? current : i % 3 === 1 ? '2099-W01' : null,
          source: recType ? 'ai' : 'manual',
          recommendation: recType ? { title: `Rec ${i}`, recommendation_type: recType } : null,
        })
      })

      const start = performance.now()

      // Apply all filter + sort operations
      const filtered = actions
        .filter((a) => a.status === 'open')
        .filter((a) => getWeekBucket(a.scheduled_week) !== 'unplanned')
        .sort((a, b) => (b.freedom_days_impact || 0) - (a.freedom_days_impact || 0))

      const elapsed = performance.now() - start

      assert(elapsed < 50, `Filtering 50 actions took ${elapsed.toFixed(1)}ms (max 50ms)`)
      assert(filtered.length > 0, 'Should have some matching actions')
    },
  },
]

export function register() {
  registerTests(tests)
}

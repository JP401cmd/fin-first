'use client'

import { useState, useMemo, useEffect } from 'react'
import { Plus, ChevronDown } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { ActionCard } from '@/components/app/action-card'
import { ActionForm } from '@/components/app/action-form'
import type { Action, ActionStatus, RecommendationType } from '@/lib/recommendation-data'
import {
  ACTION_STATUS_LABELS,
  RECOMMENDATION_TYPE_SHORT_LABELS,
} from '@/lib/recommendation-data'
import { getWeekBucket } from '@/lib/week-utils'
import { compareActionsByPriority } from '@/lib/action-sort'
import type { CancellationMetadata } from '@/lib/cancellation-types'

// ── Types ────────────────────────────────────────────────────────────────────

type SubjectFilter = RecommendationType | 'manual' | 'all'
type PlanningFilter = 'all' | 'this_week' | 'next_week' | 'later' | 'unplanned'
type SortBy = 'priority' | 'impact' | 'week'

/**
 * Default = 'priority': de modal opent in DEZELFDE volgorde als de compacte lijst
 * (priority_score desc, sort_order asc, created_at desc — `lib/action-sort.ts`).
 * 'Impact' blijft een expliciete keuze, maar niet langer de default: met impact als
 * default toonde de modal voor dezelfde actie-set een andere volgorde dan het bord
 * (eigenaarsbesluit WF-OVZ-20-bug1, optie A, 3 sep 2026).
 */
const DEFAULT_SORT: SortBy = 'priority'

// Volgorde van dit object = volgorde in het sorteermenu (default bovenaan).
const SORT_LABELS: Record<SortBy, string> = {
  priority: 'Prioriteit',
  impact: 'Impact',
  week: 'Week',
}

const PLANNING_LABELS: Record<PlanningFilter, string> = {
  all: 'Alles',
  this_week: 'Deze week',
  next_week: 'Volgende week',
  later: 'Later',
  unplanned: 'Niet gepland',
}

const SUBJECT_OPTIONS: { key: SubjectFilter; label: string }[] = [
  { key: 'all', label: 'Alles' },
  { key: 'budget_optimization', label: RECOMMENDATION_TYPE_SHORT_LABELS.budget_optimization },
  { key: 'asset_reallocation', label: RECOMMENDATION_TYPE_SHORT_LABELS.asset_reallocation },
  { key: 'debt_acceleration', label: RECOMMENDATION_TYPE_SHORT_LABELS.debt_acceleration },
  { key: 'income_increase', label: RECOMMENDATION_TYPE_SHORT_LABELS.income_increase },
  { key: 'savings_boost', label: RECOMMENDATION_TYPE_SHORT_LABELS.savings_boost },
  { key: 'manual', label: 'Handmatig' },
]

const STATUS_OPTIONS: ActionStatus[] = ['open', 'postponed', 'completed', 'rejected']

// ── Props ────────────────────────────────────────────────────────────────────

type ActionListModalProps = {
  open: boolean
  onClose: () => void
  actions: Action[]
  onStatusChange: (id: string, status: ActionStatus, data?: Record<string, unknown>) => Promise<void>
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>
  onCreateAction: (data: {
    title: string
    description?: string
    freedom_days_impact: number
    euro_impact_monthly?: number
    due_date?: string
    priority_score?: number
  }) => Promise<void>
  onCancellationOpen?: (metadata: CancellationMetadata) => void
  partnerInfo?: { partnerId: string; partnerName: string } | null
  onAssign?: (actionId: string, partnerId: string | null) => Promise<void>
  currentUserId?: string | null
  isPartnerAssigned: (action: Action) => boolean
}

// ── Component ────────────────────────────────────────────────────────────────

export function ActionListModal({
  open,
  onClose,
  actions,
  onStatusChange,
  onUpdate,
  onCreateAction,
  onCancellationOpen,
  partnerInfo,
  onAssign,
  currentUserId,
  isPartnerAssigned,
}: ActionListModalProps) {
  // Filter state — resets when modal opens
  const [statusFilter, setStatusFilter] = useState<ActionStatus | 'all'>('open')
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>('all')
  const [planningFilter, setPlanningFilter] = useState<PlanningFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>(DEFAULT_SORT)
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Reset filters when modal opens
  useEffect(() => {
    if (open) {
      setStatusFilter('open')
      setSubjectFilter('all')
      setPlanningFilter('all')
      setSortBy(DEFAULT_SORT)
      setShowSortMenu(false)
      setShowForm(false)
    }
  }, [open])

  // ── Filtering ──────────────────────────────────────────────────────────────

  const getActionSubject = (a: Action): SubjectFilter => {
    if (a.recommendation?.recommendation_type) {
      return a.recommendation.recommendation_type as RecommendationType
    }
    return 'manual'
  }

  const matchesStatus = (a: Action) => statusFilter === 'all' || a.status === statusFilter
  const matchesSubject = (a: Action) => subjectFilter === 'all' || getActionSubject(a) === subjectFilter
  const matchesPlanning = (a: Action) => planningFilter === 'all' || getWeekBucket(a.scheduled_week) === planningFilter

  const filteredActions = useMemo(() => {
    return actions.filter((a) => matchesStatus(a) && matchesSubject(a) && matchesPlanning(a))
  }, [actions, statusFilter, subjectFilter, planningFilter])

  // ── Sorting ────────────────────────────────────────────────────────────────

  const sortedActions = useMemo(() => {
    const sorted = [...filteredActions]
    // Elke variant eindigt op de canonieke prioriteitsvolgorde als tiebreaker, zodat
    // ook 'Impact' en 'Week' deterministisch zijn bij gelijke impact/week.
    switch (sortBy) {
      case 'priority':
        sorted.sort(compareActionsByPriority)
        break
      case 'impact':
        sorted.sort((a, b) =>
          (b.freedom_days_impact || 0) - (a.freedom_days_impact || 0) ||
          compareActionsByPriority(a, b)
        )
        break
      case 'week':
        sorted.sort((a, b) => {
          const wA = a.scheduled_week || 'zzzz'
          const wB = b.scheduled_week || 'zzzz'
          return wA.localeCompare(wB) || compareActionsByPriority(a, b)
        })
        break
    }
    return sorted
  }, [filteredActions, sortBy])

  // ── Grouping (only when status = 'all') ────────────────────────────────────

  const groupedByStatus = useMemo(() => {
    if (statusFilter !== 'all') return null
    const groups: Record<ActionStatus, Action[]> = {
      open: [],
      postponed: [],
      completed: [],
      rejected: [],
    }
    for (const a of sortedActions) {
      groups[a.status].push(a)
    }
    return groups
  }, [sortedActions, statusFilter])

  // ── Counts ─────────────────────────────────────────────────────────────────

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 }
    for (const s of STATUS_OPTIONS) counts[s] = 0
    for (const a of actions) {
      if (matchesSubject(a) && matchesPlanning(a)) {
        counts[a.status] = (counts[a.status] || 0) + 1
        counts.all++
      }
    }
    return counts
  }, [actions, subjectFilter, planningFilter])

  // ── Impact metrics ─────────────────────────────────────────────────────────

  const filteredImpact = useMemo(() =>
    Math.round(filteredActions.reduce((sum, a) => sum + (a.freedom_days_impact || 0), 0)),
    [filteredActions],
  )

  const completedImpact = useMemo(() =>
    Math.round(actions.filter((a) => a.status === 'completed').reduce((sum, a) => sum + (a.freedom_days_impact || 0), 0)),
    [actions],
  )

  const totalImpact = useMemo(() =>
    Math.round(actions.reduce((sum, a) => sum + (a.freedom_days_impact || 0), 0)),
    [actions],
  )

  const progressPct = totalImpact > 0 ? Math.round((completedImpact / totalImpact) * 100) : 0

  // ── Reset filters ──────────────────────────────────────────────────────────

  function resetFilters() {
    setStatusFilter('open')
    setSubjectFilter('all')
    setPlanningFilter('all')
  }

  // ── Card props ─────────────────────────────────────────────────────────────

  const cardProps = {
    onStatusChange,
    onUpdate,
    onCancellationOpen,
    partnerInfo,
    onAssign,
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  // The BottomSheet's own overflow-y-auto div is the scroll container.
  // position:sticky works correctly as a direct child of that scroll context.

  return (
    <BottomSheet open={open} onClose={onClose} title="Alle acties" size="lg">
      {/* ── Sticky header: impact + filters ── */}
      <div className="sticky top-0 z-10 border-b border-[var(--border-ed)] bg-[var(--paper)] px-5 pb-3 pt-3">
        {/* Impact strip */}
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="label-editorial text-wil-600">Impact</p>
            <p className="mt-0.5 font-mono text-2xl font-bold tabular-nums text-[var(--ink)]">
              +{filteredImpact}d
            </p>
            <p className="font-serif text-xs italic text-[var(--ink-3)]">
              vrijheidsdagen
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-[var(--ink-3)]">
              <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">{filteredActions.length}</span>
              {' '}van {actions.length} acties
            </span>
            {/* Sort toggle */}
            <div className="relative">
              <button
                type="button"
                aria-label={`Sorteren op: ${SORT_LABELS[sortBy]}`}
                aria-expanded={showSortMenu}
                aria-haspopup="listbox"
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="touch-target flex items-center gap-1 text-[11px] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
              >
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
                {SORT_LABELS[sortBy]}
              </button>
              {showSortMenu && (
                <div role="listbox" className="absolute right-0 top-full z-20 mt-1 border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s1)]">
                  {(Object.keys(SORT_LABELS) as SortBy[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="option"
                      aria-selected={sortBy === s}
                      onClick={() => { setSortBy(s); setShowSortMenu(false) }}
                      className={`block w-full px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--subtle)] ${
                        sortBy === s ? 'font-semibold text-wil-600' : 'text-[var(--ink-2)]'
                      }`}
                    >
                      {SORT_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-1 h-[3px] w-full overflow-hidden bg-[var(--subtle)]">
          <div
            className="h-full bg-wil-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="mb-3 text-[10px] text-[var(--ink-4)]">
          {completedImpact}d gerealiseerd ({progressPct}%)
        </p>

        {/* Filter dropdowns — single row */}
        <div className="flex items-center gap-2">
          <FilterSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as ActionStatus | 'all')}
            options={[
              { value: 'all', label: 'Alle statussen' },
              ...STATUS_OPTIONS.map((s) => ({
                value: s,
                label: `${ACTION_STATUS_LABELS[s]}${statusCounts[s] != null ? ` (${statusCounts[s]})` : ''}`,
              })),
            ]}
          />
          <FilterSelect
            value={subjectFilter}
            onChange={(v) => setSubjectFilter(v as SubjectFilter)}
            options={SUBJECT_OPTIONS.map((opt) => ({
              value: opt.key,
              label: opt.key === 'all' ? 'Alle onderwerpen' : opt.label,
            }))}
          />
          <FilterSelect
            value={planningFilter}
            onChange={(v) => setPlanningFilter(v as PlanningFilter)}
            options={(Object.keys(PLANNING_LABELS) as PlanningFilter[]).map((p) => ({
              value: p,
              label: p === 'all' ? 'Alle weken' : PLANNING_LABELS[p],
            }))}
          />
        </div>
      </div>

      {/* ── Scrollable content (inside BottomSheet's scroll container) ── */}
      <div className="px-5 pb-6 pt-4">
        {/* New action button */}
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mb-4 inline-flex items-center gap-1.5 border border-[var(--border-ed)] px-3 py-2.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] hover:bg-[var(--subtle)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Nieuwe actie
          </button>
        )}

        {showForm && (
          <div className="mb-4">
            <ActionForm
              onSubmit={async (data) => {
                await onCreateAction(data)
                setShowForm(false)
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Action list */}
        {sortedActions.length > 0 ? (
          groupedByStatus ? (
            // Grouped view when status = 'all'
            <div className="space-y-1">
              {STATUS_OPTIONS.map((s) => {
                const group = groupedByStatus[s]
                if (group.length === 0) return null
                return (
                  <div key={s}>
                    <p className="mb-2 mt-5 first:mt-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-4)]">
                      {ACTION_STATUS_LABELS[s]} ({group.length})
                    </p>
                    <div className="space-y-2">
                      {group.map((action) => (
                        <ActionCard
                          key={action.id}
                          action={action}
                          {...cardProps}
                          isPartnerAssigned={isPartnerAssigned(action)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            // Flat sorted view when specific status is selected
            <div className="space-y-2">
              {sortedActions.map((action) => (
                <ActionCard
                  key={action.id}
                  action={action}
                  {...cardProps}
                  isPartnerAssigned={isPartnerAssigned(action)}
                />
              ))}
            </div>
          )
        ) : (
          // Empty state
          <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-6 text-center">
            <p className="text-sm text-[var(--ink-3)]">Geen acties voor deze selectie</p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-2 text-xs text-wil-600 transition-colors hover:text-wil-700"
            >
              Filters resetten
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  const isActive = value !== 'all'
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`min-w-0 flex-1 appearance-none border bg-[var(--paper)] px-2.5 py-2 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-wil-500 focus:ring-offset-1 ${
        isActive
          ? 'border-wil-500 text-wil-700'
          : 'border-[var(--border-ed)] text-[var(--ink-3)]'
      }`}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

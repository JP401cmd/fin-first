'use client'

import { useState, useMemo, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { RecommendationCard } from '@/components/app/recommendation-card'
import type { Recommendation, RecommendationType, RecommendationStatus } from '@/lib/recommendation-data'
import {
  RECOMMENDATION_TYPE_LABELS,
  RECOMMENDATION_TYPE_SHORT_LABELS,
} from '@/lib/recommendation-data'

// ── Types ────────────────────────────────────────────────────────────────────

type SortBy = 'impact' | 'priority' | 'recent'

const SORT_LABELS: Record<SortBy, string> = {
  impact: 'Impact',
  priority: 'Prioriteit',
  recent: 'Recent',
}

const STATUS_LABELS: Record<RecommendationStatus, string> = {
  pending: 'Openstaand',
  accepted: 'Geaccepteerd',
  rejected: 'Afgewezen',
  postponed: 'Uitgesteld',
  expired: 'Verlopen',
}

const STATUS_OPTIONS: RecommendationStatus[] = ['pending', 'accepted', 'postponed', 'rejected']

const TYPE_OPTIONS: RecommendationType[] = [
  'budget_optimization',
  'asset_reallocation',
  'debt_acceleration',
  'income_increase',
  'savings_boost',
]

// ── Props ────────────────────────────────────────────────────────────────────

type RecommendationListModalProps = {
  open: boolean
  onClose: () => void
  recommendations: Recommendation[]
  onSelect: (rec: Recommendation) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function RecommendationListModal({
  open,
  onClose,
  recommendations,
  onSelect,
}: RecommendationListModalProps) {
  const [statusFilter, setStatusFilter] = useState<RecommendationStatus | 'all'>('pending')
  const [typeFilter, setTypeFilter] = useState<RecommendationType | 'all'>('all')
  const [sortBy, setSortBy] = useState<SortBy>('impact')
  const [showSortMenu, setShowSortMenu] = useState(false)

  // Reset filters when modal opens
  useEffect(() => {
    if (open) {
      setStatusFilter('pending')
      setTypeFilter('all')
      setSortBy('impact')
      setShowSortMenu(false)
    }
  }, [open])

  // ── Filtering ──────────────────────────────────────────────────────────────

  const matchesStatus = (r: Recommendation) => statusFilter === 'all' || r.status === statusFilter
  const matchesType = (r: Recommendation) => typeFilter === 'all' || r.recommendation_type === typeFilter

  const filteredRecs = useMemo(() => {
    return recommendations.filter((r) => matchesStatus(r) && matchesType(r))
  }, [recommendations, statusFilter, typeFilter])

  // ── Sorting ────────────────────────────────────────────────────────────────

  const sortedRecs = useMemo(() => {
    const sorted = [...filteredRecs]
    switch (sortBy) {
      case 'impact':
        sorted.sort((a, b) =>
          (b.freedom_days_per_year || 0) - (a.freedom_days_per_year || 0) ||
          (b.priority_score || 0) - (a.priority_score || 0)
        )
        break
      case 'priority':
        sorted.sort((a, b) =>
          (b.priority_score || 0) - (a.priority_score || 0) ||
          (b.freedom_days_per_year || 0) - (a.freedom_days_per_year || 0)
        )
        break
      case 'recent':
        sorted.sort((a, b) => b.created_at.localeCompare(a.created_at))
        break
    }
    return sorted
  }, [filteredRecs, sortBy])

  // ── Grouping (only when status = 'all') ────────────────────────────────────

  const groupedByStatus = useMemo(() => {
    if (statusFilter !== 'all') return null
    const groups: Record<RecommendationStatus, Recommendation[]> = {
      pending: [],
      accepted: [],
      postponed: [],
      rejected: [],
      expired: [],
    }
    for (const r of sortedRecs) {
      groups[r.status].push(r)
    }
    return groups
  }, [sortedRecs, statusFilter])

  // ── Counts ─────────────────────────────────────────────────────────────────

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 }
    for (const s of STATUS_OPTIONS) counts[s] = 0
    for (const r of recommendations) {
      if (matchesType(r)) {
        counts[r.status] = (counts[r.status] || 0) + 1
        counts.all++
      }
    }
    return counts
  }, [recommendations, typeFilter])

  // ── Impact metrics ─────────────────────────────────────────────────────────

  const filteredImpact = useMemo(() =>
    Math.round(filteredRecs.reduce((sum, r) => sum + (r.freedom_days_per_year || 0), 0)),
    [filteredRecs],
  )

  const acceptedImpact = useMemo(() =>
    Math.round(recommendations.filter((r) => r.status === 'accepted').reduce((sum, r) => sum + (r.freedom_days_per_year || 0), 0)),
    [recommendations],
  )

  const totalImpact = useMemo(() =>
    Math.round(recommendations.reduce((sum, r) => sum + (r.freedom_days_per_year || 0), 0)),
    [recommendations],
  )

  const progressPct = totalImpact > 0 ? Math.round((acceptedImpact / totalImpact) * 100) : 0

  // ── Reset filters ──────────────────────────────────────────────────────────

  function resetFilters() {
    setStatusFilter('pending')
    setTypeFilter('all')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <BottomSheet open={open} onClose={onClose} title="Alle voorstellen" size="lg">
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
              vrijheidsdagen per jaar
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-[var(--ink-3)]">
              <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">{filteredRecs.length}</span>
              {' '}van {recommendations.length} voorstellen
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
          {acceptedImpact}d geaccepteerd ({progressPct}%)
        </p>

        {/* Filter dropdowns — single row */}
        <div className="flex items-center gap-2">
          <FilterSelect
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as RecommendationStatus | 'all')}
            options={[
              { value: 'all', label: 'Alle statussen' },
              ...STATUS_OPTIONS.map((s) => ({
                value: s,
                label: `${STATUS_LABELS[s]} (${statusCounts[s] ?? 0})`,
              })),
            ]}
          />
          <FilterSelect
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as RecommendationType | 'all')}
            options={[
              { value: 'all', label: 'Alle typen' },
              ...TYPE_OPTIONS.map((t) => ({
                value: t,
                label: RECOMMENDATION_TYPE_SHORT_LABELS[t],
              })),
            ]}
          />
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div className="px-5 pb-6 pt-4">
        {sortedRecs.length > 0 ? (
          groupedByStatus ? (
            // Grouped view when status = 'all'
            <div className="space-y-1">
              {STATUS_OPTIONS.map((s) => {
                const group = groupedByStatus[s]
                if (group.length === 0) return null
                return (
                  <div key={s}>
                    <p className="mb-2 mt-5 first:mt-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--ink-4)]">
                      {STATUS_LABELS[s]} ({group.length})
                    </p>
                    <div className="space-y-2">
                      {group.map((rec) => (
                        <RecommendationCard
                          key={rec.id}
                          recommendation={rec}
                          onClick={() => onSelect(rec)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            // Flat sorted view
            <div className="space-y-2">
              {sortedRecs.map((rec) => (
                <RecommendationCard
                  key={rec.id}
                  recommendation={rec}
                  onClick={() => onSelect(rec)}
                />
              ))}
            </div>
          )
        ) : (
          // Empty state
          <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-6 text-center">
            <p className="text-sm text-[var(--ink-3)]">Geen voorstellen voor deze selectie</p>
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
  const isActive = value !== 'all' && value !== 'pending'
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

'use client'

import { useState, useMemo } from 'react'
import { Plus, Sparkles, CheckCircle, Landmark, CreditCard, ArrowUpDown, Receipt } from 'lucide-react'
import { RecommendationList } from '@/components/app/recommendation-list'
import { ActionBoard } from '@/components/app/action-board'
import { WillEditorialHeader } from '@/components/will/will-editorial-header'
import type { Recommendation, Action } from '@/lib/recommendation-data'
import type { CancellationMetadata } from '@/lib/cancellation-types'
import { tagToLever, LEVER_LABELS } from '@/lib/lever-mapping'
import type { LeverId } from '@/lib/lever-mapping'
import type { LucideIcon } from 'lucide-react'

interface ActionCenterProps {
  recommendations: Recommendation[]
  actions: Action[]
  partnerInfo: { partnerId: string; partnerName: string } | null
  currentUserId: string | null
  onCancellationOpen?: (metadata: CancellationMetadata) => void
  /** Called after any child mutation so parent can refresh server data */
  onDataChanged?: () => void
  /** KPI counts for header cells */
  openRecommendationCount?: number
  openActionCount?: number
  avgGoalProgress?: number
  /** Doorgegeven vanuit WillLanding voor het tonen van Doelvoortgang-cel */
  doelenEnabled?: boolean
}

// ── Lever filter config ─────────────────────────────────────────────────────

type LeverFilterOption = {
  key: LeverId
  label: string
  Icon: LucideIcon
}

const LEVER_FILTERS: LeverFilterOption[] = [
  { key: 'cashflow', label: LEVER_LABELS.cashflow, Icon: ArrowUpDown },
  { key: 'assets', label: LEVER_LABELS.assets, Icon: Landmark },
  { key: 'debts', label: LEVER_LABELS.debts, Icon: CreditCard },
  { key: 'tax', label: LEVER_LABELS.tax, Icon: Receipt },
]

/** Get the lever for a recommendation based on its type. */
function getRecommendationLever(rec: Recommendation): LeverId {
  return tagToLever(rec.recommendation_type)
}

/** Get the lever for an action based on its linked recommendation type. */
function getActionLever(action: Action): LeverId {
  if (action.recommendation?.recommendation_type) {
    return tagToLever(action.recommendation.recommendation_type)
  }
  // Actions without a recommendation type fall back to cashflow
  return 'cashflow'
}

/**
 * ActionCenter — 2-koloms werk-board (Voorstellen ↔ Acties) met editorial banner.
 *
 * De landing-pijplijn is teruggebracht tot het feitelijke werk: links de open
 * voorstellen, rechts de acties. De Resultaat-kolom (doelen) is verhuisd naar
 * de losse `<DoelenStrook />` op /will, gescheiden door een double-rule. De
 * editorial banner (`WillEditorialHeader`) toont de KPI's; deze component
 * concentreert zich puur op de twee werk-kolommen + sectielabel.
 *
 * CTA-hiërarchie: "Nieuwe actie" is primair (solid wil-500) — dat is de hoofd-
 * actie van de pagina. "Analyseren" blijft secundair (outline) omdat het
 * voorstellen genereert die de gebruiker daarna nog moet wegen.
 */
export function ActionCenter({
  recommendations,
  actions,
  partnerInfo,
  currentUserId,
  onCancellationOpen,
  onDataChanged,
  openRecommendationCount,
  openActionCount,
  avgGoalProgress,
  doelenEnabled = true,
}: ActionCenterProps) {
  const [activeTab, setActiveTab] = useState<'inzicht' | 'actie'>('actie')
  const [generateTrigger, setGenerateTrigger] = useState(0)
  const [addTrigger, setAddTrigger] = useState(0)
  const [leverFilter, setLeverFilter] = useState<LeverId | null>(null)

  // ── Lever counts (for filter chip badges) ───────────────────────────────
  const leverCounts = useMemo(() => {
    const counts: Record<LeverId, number> = { assets: 0, debts: 0, cashflow: 0, tax: 0 }
    // Count pending recommendations per lever
    for (const rec of recommendations) {
      if (rec.status === 'pending' || (rec.status === 'postponed' && rec.postponed_until && new Date(rec.postponed_until) <= new Date())) {
        counts[getRecommendationLever(rec)]++
      }
    }
    // Count open/postponed actions per lever
    for (const action of actions) {
      if (action.status === 'open' || action.status === 'postponed') {
        counts[getActionLever(action)]++
      }
    }
    return counts
  }, [recommendations, actions])

  // ── Filtered lists ──────────────────────────────────────────────────────
  const filteredRecommendations = useMemo(() => {
    if (!leverFilter) return recommendations
    return recommendations.filter(rec => getRecommendationLever(rec) === leverFilter)
  }, [recommendations, leverFilter])

  const filteredActions = useMemo(() => {
    if (!leverFilter) return actions
    return actions.filter(action => getActionLever(action) === leverFilter)
  }, [actions, leverFilter])

  const pendingCount = openRecommendationCount ?? recommendations.filter(r => r.status === 'pending').length

  const totalPendingRecDays = Math.round(
    recommendations
      .filter(r => r.status === 'pending')
      .reduce((s, r) => s + (r.freedom_days_per_year || 0), 0),
  )

  const totalOpenActionDays = Math.round(
    actions
      .filter(a => a.status === 'open' || a.status === 'postponed')
      .reduce((s, a) => s + (a.freedom_days_impact || 0), 0),
  )

  // Acties die in de laatste 90 dagen zijn afgerond — voedt de "Afgerond"-cel
  // in de header en geeft de gebruiker een gevoel van voortgang per kwartaal.
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
  const completedActionsCount = actions.filter(a => {
    if (a.status !== 'completed' || !a.completed_at) return false
    return new Date(a.completed_at).getTime() >= ninetyDaysAgo
  }).length

  const goalProgress = avgGoalProgress ?? 0

  const tabs = [
    { key: 'inzicht' as const, label: `Voorstellen (${pendingCount})` },
    { key: 'actie' as const, label: `Acties (${openActionCount ?? 0})` },
  ]

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden">
      {/* Accent bar */}
      <div className="h-[3px] w-full" style={{ background: 'var(--module-active-500)' }} />

      {/* Editorial banner — KPI's + intentvraag */}
      <WillEditorialHeader
        totalPendingRecDays={totalPendingRecDays}
        totalOpenActionDays={totalOpenActionDays}
        goalProgress={goalProgress}
        completedActionsCount={completedActionsCount}
        doelenEnabled={doelenEnabled}
      />

      {/* Sectie-label "Het werk" — situeert het 2-koloms gedeelte */}
      <div className="px-5 sm:px-6 pt-6 pb-3 flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
        <span aria-hidden className="inline-block h-px w-7" style={{ background: 'var(--module-active-500)' }} />
        Het werk · Voorstellen ↔ Acties
      </div>

      {/* ── Hefboom-filter chips ─────────────────────────────────────────── */}
      <div className="px-5 sm:px-6 pb-4" role="toolbar" aria-label="Filter op hefboom">
        <div className="flex flex-wrap gap-1.5">
          {/* "Alle" chip */}
          <button
            type="button"
            onClick={() => setLeverFilter(null)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors min-h-[32px] ${
              leverFilter === null
                ? 'bg-[var(--module-active-100)] text-[var(--module-active-700)] ring-1 ring-[var(--module-active-300)]'
                : 'bg-[var(--subtle)] text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)]'
            }`}
            aria-pressed={leverFilter === null}
          >
            Alle
          </button>

          {/* Per-lever chips */}
          {LEVER_FILTERS.map(({ key, label, Icon }) => {
            const count = leverCounts[key]
            const isActive = leverFilter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setLeverFilter(isActive ? null : key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors min-h-[32px] ${
                  isActive
                    ? 'bg-[var(--module-active-100)] text-[var(--module-active-700)] ring-1 ring-[var(--module-active-300)]'
                    : 'bg-[var(--subtle)] text-[var(--ink-3)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)]'
                }`}
                aria-pressed={isActive}
              >
                <Icon className="h-3 w-3" />
                {label}
                <span className={`inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold tabular-nums ${
                  isActive ? 'bg-[var(--module-active-200)] text-[var(--module-active-800)]' : 'bg-[var(--paper)] text-[var(--ink-3)]'
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Mobile tab bar (< lg) — desktop toont beide kolommen naast elkaar */}
      <div className="border-b border-[var(--border-ed)] px-5 pb-3 lg:hidden">
        <div className="flex gap-1 rounded-[var(--r)] bg-[var(--subtle)] p-1" role="tablist">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`flex-1 rounded-[var(--r-sm)] px-2 py-2 text-[11px] font-semibold transition-colors min-h-[44px] ${
                activeTab === tab.key
                  ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                  : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2-koloms grid: Voorstellen ↔ Acties */}
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Voorstellen */}
        <div
          id="voorstellen"
          className={`scroll-mt-8 p-5 lg:border-r lg:border-[var(--border-ed)] ${
            activeTab !== 'inzicht' ? 'hidden lg:block' : ''
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-wil-500" />
              <h3 className="label-editorial text-[var(--ink-2)]">Voorstellen</h3>
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--subtle)] px-1.5 font-mono text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
                {pendingCount}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setGenerateTrigger(t => t + 1)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-transparent px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] hover:bg-[var(--subtle)] min-h-[44px] sm:min-h-0"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Analyseren</span>
            </button>
          </div>
          <RecommendationList
            initialRecommendations={filteredRecommendations}
            hideHeader
            generateTrigger={generateTrigger}
            onDataChanged={onDataChanged}
          />
        </div>

        {/* Acties */}
        <div
          id="acties"
          className={`scroll-mt-8 p-5 ${activeTab !== 'actie' ? 'hidden lg:block' : ''}`}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-wil-500" />
              <h3 className="label-editorial text-[var(--ink-2)]">Acties</h3>
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--subtle)] px-1.5 font-mono text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
                {openActionCount ?? 0}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAddTrigger(t => t + 1)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--r)] bg-wil-500 text-white px-3 py-2 text-xs font-semibold transition-colors hover:bg-wil-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] min-h-[44px] sm:min-h-0"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nieuwe actie</span>
            </button>
          </div>
          <ActionBoard
            initialActions={filteredActions}
            partnerInfo={partnerInfo}
            currentUserId={currentUserId}
            onCancellationOpen={onCancellationOpen}
            addTrigger={addTrigger}
            onDataChanged={onDataChanged}
          />
        </div>
      </div>
    </div>
  )
}

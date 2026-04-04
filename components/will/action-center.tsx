'use client'

import { useState } from 'react'
import { Target, Plus, Users, Sparkles, CheckCircle, ChevronRight } from 'lucide-react'
import { RecommendationList } from '@/components/app/recommendation-list'
import { ActionBoard } from '@/components/app/action-board'
import { GoalDetailModal } from '@/components/app/will/goal-detail-modal'
import { GoalForm } from '@/components/app/goal-form'
import {
  getGoalColorClasses,
  GOAL_TYPE_META,
  type Goal,
  type GoalType,
} from '@/lib/goal-data'
import { BudgetIcon } from '@/components/app/budget-shared'
import { useDailyExpenseRate } from '@/components/app/freedom-time-label'
import { FeatureGate } from '@/components/app/feature-gate'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { isFeatureAccessible } from '@/lib/compute-feature-access'
import type { Recommendation, Action } from '@/lib/recommendation-data'
import type { CancellationMetadata } from '@/lib/cancellation-types'

type GoalWithBudget = Goal & {
  budgets?: { id: string; name: string } | null
}

interface ActionCenterProps {
  recommendations: Recommendation[]
  actions: Action[]
  goals: GoalWithBudget[]
  goalProgresses: { current: number; target: number; pct: number; onTrack: boolean; eta: string | null }[]
  goalAssets: { id: string; name: string; current_value: number }[]
  goalDebts: { id: string; name: string; current_balance: number }[]
  completedGoalCount: number
  totalGoalCount: number
  partnerInfo: { partnerId: string; partnerName: string } | null
  currentUserId: string | null
  onGoalsChanged?: () => void
  onCancellationOpen?: (metadata: CancellationMetadata) => void
  /** Called after any child mutation so parent can refresh server data */
  onDataChanged?: () => void
  /** KPI counts for stat cards */
  openRecommendationCount?: number
  openActionCount?: number
  avgGoalProgress?: number
}

export function ActionCenter({
  recommendations,
  actions,
  goals,
  goalProgresses,
  goalAssets,
  goalDebts,
  completedGoalCount,
  totalGoalCount,
  partnerInfo,
  currentUserId,
  onGoalsChanged,
  onCancellationOpen,
  onDataChanged,
  openRecommendationCount,
  openActionCount,
  avgGoalProgress,
}: ActionCenterProps) {
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalFilter, setGoalFilter] = useState<'all' | 'personal' | 'shared'>('all')
  const [activeTab, setActiveTab] = useState<'inzicht' | 'actie' | 'resultaat'>('actie')
  const { dailyExpenseRate } = useDailyExpenseRate()
  const { features } = useFeatureAccess()
  const doelenEnabled = isFeatureAccessible(features, 'doelen_systeem')
  const [generateTrigger, setGenerateTrigger] = useState(0)
  const [addTrigger, setAddTrigger] = useState(0)

  // Filter goals by ownership
  const hasSharedGoals = goals.some(g => g.ownership === 'shared')
  const filteredGoals = goalFilter === 'all'
    ? goals
    : goalFilter === 'shared'
      ? goals.filter(g => g.ownership === 'shared')
      : goals.filter(g => g.ownership !== 'shared')
  const filteredGoalProgresses = goals
    .map((g, i) => ({ goal: g, progress: goalProgresses[i] }))
    .filter(({ goal }) =>
      goalFilter === 'all' ? true : goalFilter === 'shared' ? goal.ownership === 'shared' : goal.ownership !== 'shared',
    )
    .map(({ progress }) => progress)

  const handleGoalsChanged = () => {
    onGoalsChanged?.()
    onDataChanged?.()
  }

  // --- Pipeline metrics ---
  const pendingCount = openRecommendationCount ?? recommendations.filter(r => r.status === 'pending').length

  const totalPendingRecDays = Math.round(
    recommendations
      .filter(r => r.status === 'pending')
      .reduce((s, r) => s + (r.freedom_days_per_year || 0), 0)
  )

  const totalOpenActionDays = Math.round(
    actions
      .filter(a => a.status === 'open' || a.status === 'postponed')
      .reduce((s, a) => s + (a.freedom_days_impact || 0), 0)
  )

  const goalProgress = avgGoalProgress ?? 0

  // --- Tab config (conditionally include Resultaat) ---
  const tabs = [
    { key: 'inzicht' as const, label: `Inzicht (${pendingCount})` },
    { key: 'actie' as const, label: `Actie (${openActionCount ?? 0})` },
    ...(doelenEnabled ? [{ key: 'resultaat' as const, label: `Resultaat (${filteredGoals.length})` }] : []),
  ]

  return (
    <>
      <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden">
        {/* ── Accent bar ── */}
        <div className="h-[3px] w-full bg-wil-500" />

        {/* ── Pipeline header: Inzicht → Actie → Resultaat ── */}
        <div className="border-b border-[var(--border-ed)] px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between">
            {/* Step 1: Inzicht */}
            <div className="flex-1 text-center animate-fade-up" style={{ '--stagger': '0ms' } as React.CSSProperties}>
              <p className="label-editorial text-wil-600">Inzicht</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--ink)] sm:text-xl">
                +{totalPendingRecDays}
              </p>
              <p className="font-serif text-[11px] italic text-[var(--ink-3)] sm:text-xs">
                vrijheidsdagen te ontdekken
              </p>
            </div>

            {/* Connector 1→2 */}
            <div className="flex shrink-0 items-center text-[var(--ink-4)]">
              <div className="h-px w-3 bg-[var(--border-md)] sm:w-6" />
              <ChevronRight className="h-3 w-3" />
            </div>

            {/* Step 2: Actie */}
            <div className="flex-1 text-center animate-fade-up" style={{ '--stagger': '80ms' } as React.CSSProperties}>
              <p className="label-editorial text-wil-600">Actie</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--ink)] sm:text-xl">
                +{totalOpenActionDays}
              </p>
              <p className="font-serif text-[11px] italic text-[var(--ink-3)] sm:text-xs">
                vrijheidsdagen in uitvoering
              </p>
            </div>

            {/* Connector 2→3 */}
            <div className="flex shrink-0 items-center text-[var(--ink-4)]">
              <div className="h-px w-3 bg-[var(--border-md)] sm:w-6" />
              <ChevronRight className="h-3 w-3" />
            </div>

            {/* Step 3: Resultaat */}
            <div className="flex-1 text-center animate-fade-up" style={{ '--stagger': '160ms' } as React.CSSProperties}>
              <p className="label-editorial text-wil-600">Resultaat</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--ink)] sm:text-xl">
                {goalProgress}%
              </p>
              <p className="font-serif text-[11px] italic text-[var(--ink-3)] sm:text-xs">
                doelvoortgang
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div
              className="h-full rounded-full bg-wil-500 transition-all duration-500"
              style={{ width: `${goalProgress}%` }}
            />
          </div>
        </div>

        {/* ── Mobile tab bar (< lg) ── */}
        <div className="border-b border-[var(--border-ed)] px-5 pb-3 pt-3 lg:hidden">
          <div className="flex gap-1 rounded-[var(--r)] bg-[var(--subtle)] p-1" role="tablist">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`flex-1 rounded-[var(--r-sm)] px-2 py-2 text-[11px] font-semibold transition-colors ${
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

        {/* ── Content grid — tabs on mobile, 3-col with vertical rules on desktop ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3">
          {/* Column 1: Inzicht (Voorstellen) */}
          <div
            id="voorstellen"
            className={`scroll-mt-8 p-5 lg:border-r lg:border-[var(--border-ed)] ${
              activeTab !== 'inzicht' ? 'hidden lg:block' : ''
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-wil-500" />
                <h3 className="label-editorial text-[var(--ink-2)]">Inzicht</h3>
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--subtle)] px-1.5 font-mono text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
                  {pendingCount}
                </span>
              </div>
              <button
                onClick={() => setGenerateTrigger(t => t + 1)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-transparent px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] hover:bg-[var(--subtle)]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Analyseren</span>
              </button>
            </div>
            <RecommendationList initialRecommendations={recommendations} hideHeader generateTrigger={generateTrigger} onDataChanged={onDataChanged} />
          </div>

          {/* Column 2: Actie */}
          <div
            id="acties"
            className={`scroll-mt-8 p-5 lg:border-r lg:border-[var(--border-ed)] ${
              activeTab !== 'actie' ? 'hidden lg:block' : ''
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-wil-500" />
                <h3 className="label-editorial text-[var(--ink-2)]">Actie</h3>
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--subtle)] px-1.5 font-mono text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
                  {openActionCount ?? 0}
                </span>
              </div>
              <button
                onClick={() => setAddTrigger(t => t + 1)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-transparent px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] hover:bg-[var(--subtle)]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Nieuwe actie</span>
              </button>
            </div>
            <ActionBoard
              initialActions={actions}
              partnerInfo={partnerInfo}
              currentUserId={currentUserId}
              onCancellationOpen={onCancellationOpen}
              addTrigger={addTrigger}
              onDataChanged={onDataChanged}
            />
          </div>

          {/* Column 3: Resultaat (Doelen) */}
          <FeatureGate featureId="doelen_systeem" fallback="hidden">
            <div
              id="doelen"
              className={`scroll-mt-8 p-5 ${
                activeTab !== 'resultaat' ? 'hidden lg:block' : ''
              }`}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-wil-500" />
                  <h3 className="label-editorial text-[var(--ink-2)]">Resultaat</h3>
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--subtle)] px-1.5 font-mono text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
                    {filteredGoals.length}
                  </span>
                </div>
                <button
                  onClick={() => setShowGoalForm(true)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-transparent px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] hover:bg-[var(--subtle)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Nieuw doel</span>
                </button>
              </div>

              {/* Goal filter tabs (only when household exists) */}
              {hasSharedGoals && partnerInfo && (
                <div className="mb-3 flex gap-1 rounded-[var(--r)] bg-[var(--subtle)] p-1">
                  {([
                    { key: 'all' as const, label: 'Alles' },
                    { key: 'personal' as const, label: 'Persoonlijk' },
                    { key: 'shared' as const, label: 'Gedeeld' },
                  ]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setGoalFilter(key)}
                      className={`flex-1 rounded-[var(--r-sm)] px-2 py-1 text-[11px] font-medium transition-colors ${
                        goalFilter === key
                          ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                          : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                      }`}
                    >
                      {key === 'shared' && <Users className="mr-1 inline h-3 w-3" />}
                      {label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1">
                {filteredGoals.length > 0 ? (
                  <div className="space-y-3">
                    {filteredGoals.slice(0, 3).map((goal, i) => (
                      <GoalSummaryRow
                        key={goal.id}
                        goal={goal}
                        progress={filteredGoalProgresses[i]}
                        onClick={() => setShowGoalModal(true)}
                        dailyExpenses={dailyExpenseRate}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <div className="mb-3 rounded-2xl bg-[var(--subtle)] p-3">
                      <Target className="h-6 w-6 text-[var(--ink-4)]" />
                    </div>
                    <h4 className="mb-1 text-sm font-semibold text-[var(--ink-2)]">Nog geen doelen</h4>
                    <p className="mb-5 max-w-[240px] text-xs leading-relaxed text-[var(--ink-3)]">
                      Stel een financieel doel in om je voortgang bij te houden — zoals een noodfonds, aflossing of spaardoel.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowGoalForm(true)}
                      className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] hover:bg-[var(--subtle)]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Nieuw doel
                    </button>
                  </div>
                )}
              </div>

              {/* View all goals button */}
              <button
                type="button"
                onClick={() => setShowGoalModal(true)}
                className="mt-4 w-full rounded-[var(--r)] py-2 text-center text-xs font-medium text-wil-600 transition-colors hover:bg-wil-50"
              >
                {filteredGoals.length > 3
                  ? `Bekijk alle ${filteredGoals.length} doelen`
                  : 'Alle doelen bekijken'}
              </button>
            </div>
          </FeatureGate>
        </div>
      </div>

      {/* === Goal Modals (outside container) === */}
      <FeatureGate featureId="doelen_systeem" fallback="hidden">
        <GoalDetailModal
          open={showGoalModal}
          onClose={() => setShowGoalModal(false)}
          onGoalsChanged={handleGoalsChanged}
        />

        {showGoalForm && (
          <GoalForm
            assets={goalAssets}
            debts={goalDebts}
            onClose={() => setShowGoalForm(false)}
            onSaved={() => {
              setShowGoalForm(false)
              handleGoalsChanged()
            }}
          />
        )}
      </FeatureGate>
    </>
  )
}

// --- Internal component: GoalSummaryRow ---

function GoalSummaryRow({
  goal,
  progress,
  onClick,
  dailyExpenses,
}: {
  goal: GoalWithBudget
  progress: { current: number; target: number; pct: number; onTrack: boolean; eta: string | null }
  onClick: () => void
  dailyExpenses?: number
}) {
  const colors = getGoalColorClasses(goal.color)
  const goalType = goal.goal_type as GoalType
  const meta = GOAL_TYPE_META[goalType] ?? GOAL_TYPE_META.custom

  // Freedom-time framing only for types where it's relevant
  let freedomTimeStr: string | null = null
  if (meta.freedomTimeRelevant && dailyExpenses && dailyExpenses > 0 && progress.target > 100) {
    const totalDays = Math.round(progress.target / dailyExpenses)
    if (totalDays >= 365) {
      const y = Math.floor(totalDays / 365)
      const m = Math.round((totalDays % 365) / 30)
      freedomTimeStr = m > 0 ? `${y}j ${m}m vrijheid` : `${y}j vrijheid`
    } else if (totalDays >= 30) {
      freedomTimeStr = `${Math.round(totalDays / 30)}m vrijheid`
    } else {
      freedomTimeStr = `${totalDays}d vrijheid`
    }
  }

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[var(--r)] px-3 py-3 text-left transition-colors hover:bg-[var(--subtle)]"
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] ${colors.bgLight}`}>
        <BudgetIcon name={goal.icon} className={`h-4 w-4 ${colors.text}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="truncate text-sm font-medium text-[var(--ink)]">{goal.name}</p>
          <div className="ml-3 flex shrink-0 items-center gap-1.5">
            <span className="font-mono text-xs tabular-nums font-semibold text-[var(--ink-2)]">{progress.pct}%</span>
            {!progress.onTrack && goal.target_date && (
              <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">achter</span>
            )}
          </div>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div
            className={`h-full rounded-full ${colors.bar} transition-all duration-500`}
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      </div>
    </button>
  )
}

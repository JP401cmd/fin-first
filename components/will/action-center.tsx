'use client'

import { useState } from 'react'
import { Target, Plus, Users } from 'lucide-react'
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
  openRecommendationCount,
  openActionCount,
  avgGoalProgress,
}: ActionCenterProps) {
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalFilter, setGoalFilter] = useState<'all' | 'personal' | 'shared'>('all')
  const { dailyExpenseRate } = useDailyExpenseRate()

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
  }

  const showKpiCards = openRecommendationCount != null || openActionCount != null || avgGoalProgress != null

  return (
    <>
      {/* Section header */}
      <div className="mb-4 border-b border-[var(--border-ed)] pb-2">
        <h2 className="label-editorial text-[var(--ink-2)]">Actiecentrum</h2>
      </div>

      {/* KPI stat cards */}
      {showKpiCards && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-3 text-center">
            <p className="font-mono text-2xl font-bold tabular-nums text-[var(--ink)]">
              {openRecommendationCount ?? 0}
            </p>
            <p className="text-xs text-[var(--ink-3)]">Voorstellen</p>
          </div>
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-3 text-center">
            <p className="font-mono text-2xl font-bold tabular-nums text-[var(--ink)]">
              {openActionCount ?? 0}
            </p>
            <p className="text-xs text-[var(--ink-3)]">Acties</p>
          </div>
          <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-3 text-center">
            <p className="font-mono text-2xl font-bold tabular-nums text-[var(--ink)]">
              {avgGoalProgress ?? 0}%
            </p>
            <p className="text-xs text-[var(--ink-3)]">Doel voortgang</p>
          </div>
        </div>
      )}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">

        {/* --- Column 1: Voorstellen --- */}
        <div id="voorstellen" className="scroll-mt-8 flex flex-col rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          <h2 className="mb-4 label-editorial text-[var(--ink-2)]">Voorstellen</h2>
          <RecommendationList initialRecommendations={recommendations} />
        </div>

        {/* --- Column 2: Acties --- */}
        <div id="acties" className="scroll-mt-8 flex flex-col rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          <h2 className="mb-4 label-editorial text-[var(--ink-2)]">Acties</h2>
          <ActionBoard
            initialActions={actions}
            partnerInfo={partnerInfo}
            currentUserId={currentUserId}
            onCancellationOpen={onCancellationOpen}
          />
        </div>

        {/* --- Column 3: Doelen --- */}
        <FeatureGate featureId="doelen_systeem" fallback="hidden">
          <div id="doelen" className="scroll-mt-8 flex flex-col rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="label-editorial text-[var(--ink-2)]">Doelen</h2>
                <div className="mt-2 flex items-center gap-2">
                  <Target className="h-4 w-4 shrink-0 text-wil-500" />
                  <span className="text-sm font-semibold text-[var(--ink)]">Doelen</span>
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--subtle)] px-1.5 font-mono text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
                    {filteredGoals.length}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--ink-3)]">
                  Financiele mijlpalen op weg naar volledige vrijheid
                </p>
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
                <div className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-6 text-center">
                  <p className="text-sm text-[var(--ink-3)]">
                    Nog geen doelen. Klik op &ldquo;Nieuw doel&rdquo; om te starten.
                  </p>
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
      </section>

      {/* === Goal Modals === */}
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

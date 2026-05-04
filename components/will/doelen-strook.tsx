'use client'

import { useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { FeatureGate } from '@/components/app/feature-gate'
import { useDailyExpenseRate } from '@/components/app/freedom-time-label'
import { GoalDetailModal } from '@/components/app/will/goal-detail-modal'
import { GoalForm } from '@/components/app/goal-form'
import { BudgetIcon } from '@/components/app/budget-shared'
import {
  getGoalColorClasses,
  GOAL_TYPE_LABELS,
  GOAL_TYPE_META,
  type Goal,
  type GoalType,
} from '@/lib/goal-data'
import { MaskedAmount } from '@/components/app/masked-amount'

// Goal-card editorial color tokens (accent line + highlight-marker per goal color).
// Mirrors the palette emitted by `getGoalColorClasses` but in raw OKLCH so we can
// pass the values directly to inline `style={{ background }}` and
// `linear-gradient(...)`. Tailwind classes can't power CSS gradients here.
const GOAL_COLOR_VARS: Record<string, { accent: string; marker: string }> = {
  teal:    { accent: 'oklch(0.55 0.10 200)', marker: 'oklch(0.92 0.04 200)' },
  amber:   { accent: 'oklch(0.65 0.13 75)',  marker: 'oklch(0.94 0.06 75)' },
  purple:  { accent: 'oklch(0.50 0.13 295)', marker: 'oklch(0.92 0.05 295)' },
  emerald: { accent: 'oklch(0.55 0.12 152)', marker: 'oklch(0.93 0.05 152)' },
  red:     { accent: 'oklch(0.55 0.18 25)',  marker: 'oklch(0.93 0.06 25)' },
  blue:    { accent: 'oklch(0.55 0.13 240)', marker: 'oklch(0.93 0.05 240)' },
}

type GoalWithBudget = Goal & { budgets?: { id: string; name: string } | null }

interface DoelenStrookProps {
  goals: GoalWithBudget[]
  goalProgresses: Array<{
    current: number
    target: number
    pct: number
    onTrack: boolean
    eta: string | null
  }>
  goalAssets: Array<{ id: string; name: string; current_value: number }>
  goalDebts: Array<{ id: string; name: string; current_balance: number }>
  partnerInfo: { partnerId: string; partnerName: string } | null
  currentUserId: string | null
  onGoalsChanged?: () => void
  onDataChanged?: () => void
}

/**
 * DoelenStrook — "Kompas · Doelen" section on /will.
 *
 * Page-level strip that lives below the `<ActionCenter />` work-board. Renders
 * a section header (kicker + count + CTA), an optional filter tab-bar (only
 * when shared goals + partner exist), a 1/2/3-column grid of editorial goal
 * cards (capped at 6) or an empty-state, and a "view all goals" link that
 * opens the `GoalDetailModal`. Wraps everything in a `FeatureGate` so the
 * entire strook collapses cleanly when the `doelen_systeem` feature is off.
 *
 * The filter UI mirrors the previous in-panel `GoalSummaryRow` filter from
 * `action-center.tsx` so behavior is preserved across the refactor.
 */
export function DoelenStrook({
  goals,
  goalProgresses,
  goalAssets,
  goalDebts,
  partnerInfo,
  // currentUserId is reserved for future per-user filtering; underscore to silence unused-var lint.
  currentUserId: _currentUserId,
  onGoalsChanged,
  onDataChanged,
}: DoelenStrookProps) {
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalFilter, setGoalFilter] = useState<'all' | 'personal' | 'shared'>('all')
  const { dailyExpenseRate } = useDailyExpenseRate()

  const hasSharedGoals = goals.some((g) => g.ownership === 'shared')

  // Filter the goals + their parallel progress array in lockstep so card[i]
  // always pairs with progress[i]. Without the zip we'd misalign progress
  // values when filtering changes the array length.
  const filteredGoals =
    goalFilter === 'all'
      ? goals
      : goalFilter === 'shared'
        ? goals.filter((g) => g.ownership === 'shared')
        : goals.filter((g) => g.ownership !== 'shared')

  const filteredGoalProgresses = goals
    .map((g, i) => ({ goal: g, progress: goalProgresses[i] }))
    .filter(({ goal }) =>
      goalFilter === 'all'
        ? true
        : goalFilter === 'shared'
          ? goal.ownership === 'shared'
          : goal.ownership !== 'shared',
    )
    .map(({ progress }) => progress)

  const handleGoalsChanged = () => {
    onGoalsChanged?.()
    onDataChanged?.()
  }

  return (
    <FeatureGate featureId="doelen_systeem" fallback="hidden">
      <section
        id="doelen"
        className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)]"
      >
        <div aria-hidden className="h-[3px] w-full bg-wil-500" />
        <div className="space-y-4 p-5">
        {/* Section header — kicker · label · count + "Nieuw doel" CTA */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
            <span
              aria-hidden
              className="inline-block h-px w-7"
              style={{ background: 'var(--module-active-500)' }}
            />
            Kompas · Doelen
            <span className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--subtle)] px-1.5 font-mono text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
              {filteredGoals.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowGoalForm(true)}
            className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-transparent px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:border-[var(--border-md)] hover:bg-[var(--subtle)] min-h-[44px] sm:min-h-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Nieuw doel</span>
          </button>
        </div>

        {/* Filter tab-bar — only when household has shared goals AND a partner is linked. */}
        {hasSharedGoals && partnerInfo && (
          <div
            className="flex gap-1 rounded-[var(--r)] bg-[var(--subtle)] p-1"
            role="tablist"
          >
            {(
              [
                { key: 'all' as const, label: 'Alles' },
                { key: 'personal' as const, label: 'Persoonlijk' },
                { key: 'shared' as const, label: 'Gedeeld' },
              ]
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setGoalFilter(key)}
                role="tab"
                aria-selected={goalFilter === key}
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

        {/* Goal-cards grid (capped at 6) or empty-state. */}
        {filteredGoals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGoals.slice(0, 6).map((goal, i) => (
              <GoalEditorialCard
                key={goal.id}
                goal={goal}
                progress={filteredGoalProgresses[i]}
                onClick={() => setShowGoalModal(true)}
                dailyExpenses={dailyExpenseRate}
              />
            ))}
          </div>
        ) : (
          <EmptyDoelenState onClick={() => setShowGoalForm(true)} />
        )}

        {/* "View all goals" link — only renders when at least one goal exists. */}
        {filteredGoals.length > 0 && (
          <button
            type="button"
            onClick={() => setShowGoalModal(true)}
            className="block mx-auto text-xs font-medium italic text-[var(--module-active-700)] hover:underline decoration-[var(--module-active-500)] underline-offset-4 min-h-[44px] sm:min-h-0"
          >
            {filteredGoals.length > 6
              ? `Bekijk alle ${filteredGoals.length} doelen →`
              : 'Alle doelen bekijken →'}
          </button>
        )}

        {/* Modals — open from goal-card click ("detail") or "+ Nieuw doel" CTA. */}
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
        </div>
      </section>
    </FeatureGate>
  )
}

/**
 * GoalEditorialCard — mini-article blueprint per goal.
 *
 * Goal's own `color` drives the accent bar + highlight-marker so each card
 * reads as its own "kompas direction" — visually distinct from the surrounding
 * Wil-purple work-board chrome. Freedom-time framing is shown only when the
 * goal type opts in via `GOAL_TYPE_META[type].freedomTimeRelevant` AND the
 * household has a measurable daily expense rate; otherwise we fall back to
 * the date-based ETA from `computeGoalProgress`.
 */
function GoalEditorialCard({
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
  const colorVars = GOAL_COLOR_VARS[goal.color] ?? GOAL_COLOR_VARS.teal
  const goalType = goal.goal_type as GoalType
  const meta = GOAL_TYPE_META[goalType]
  const label = GOAL_TYPE_LABELS[goalType] ?? goalType

  // Translate "target EUR" into "X jaar/maanden/dagen vrijheid" — only for goal types
  // where the freedom-time framing makes sense (savings, net_worth, etc.) and only
  // when we have a non-zero daily expense rate AND a meaningful target (>€100).
  let freedomTimeStr: string | null = null
  if (meta?.freedomTimeRelevant && dailyExpenses && dailyExpenses > 0 && progress.target > 100) {
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
      type="button"
      onClick={onClick}
      className="block text-left w-full border border-[var(--border-ed)] bg-[var(--paper)] hover:shadow-[var(--s1)] transition-shadow group"
    >
      {/* 3px accent bar in the goal's own color — anchors the card visually. */}
      <div className="h-[3px] w-full" style={{ background: colorVars.accent }} />
      <div className="p-4 sm:p-5">
        {/* Kicker row — colored icon-tile + UPPERCASE goal-type label + optional "achter" badge. */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r)] ${colors.bgLight}`}
          >
            <BudgetIcon name={goal.icon} className={`h-3.5 w-3.5 ${colors.text}`} />
          </div>
          <p
            className="text-[10px] uppercase tracking-[0.18em] font-mono font-semibold"
            style={{ color: colorVars.accent }}
          >
            {label}
          </p>
          {!progress.onTrack && goal.target_date && (
            <span className="ml-auto rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
              achter
            </span>
          )}
        </div>

        <h3
          className="font-bold leading-tight text-[18px] sm:text-[20px]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          {goal.name}
        </h3>

        {/* Hoofdcijfer — current/target with translucent highlight-marker.
            formatCurrency() already prepends "€", so no extra symbol here. */}
        <p className="mt-2 leading-none">
          <span
            className="inline px-1"
            style={{
              backgroundImage: `linear-gradient(transparent 60%, ${colorVars.marker} 60%)`,
            }}
          >
            <MaskedAmount value={progress.current} tone="wil" className="text-[20px] font-bold sm:text-[22px]" />
            {' / '}
            <MaskedAmount value={progress.target} tone="wil" className="text-[20px] font-bold sm:text-[22px]" />
          </span>
        </p>

        <p
          className="mt-1.5 italic text-[12px] text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          {progress.pct}% · {freedomTimeStr ?? `eta: ${progress.eta ?? 'n.v.t.'}`}
        </p>

        {/* Mini progress bar — uses the goal's own bar color via getGoalColorClasses. */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div
            className={`h-full rounded-full ${colors.bar} transition-[width] duration-500 motion-reduce:transition-none`}
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      </div>
    </button>
  )
}

/**
 * EmptyDoelenState — replaces the cards-grid when no goals exist (or none
 * match the active filter). Centered editorial composition with kicker +
 * Playfair headline + Source Serif body + primary CTA. CTA is solid-ink so
 * the call-to-action visually outweighs the "+ Nieuw doel" outline button in
 * the section header.
 */
function EmptyDoelenState({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-4 max-w-md mx-auto">
      <div className="mb-3 flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
        <span
          aria-hidden
          className="inline-block h-px w-7"
          style={{ background: 'var(--module-active-500)' }}
        />
        Kompas
      </div>
      <h3
        className="font-bold leading-tight text-[20px] sm:text-[24px]"
        style={{ fontFamily: 'var(--font-playfair, serif)' }}
      >
        Stel je{' '}
        <em
          className="font-normal italic"
          style={{ color: 'var(--module-active-700)' }}
        >
          kompas
        </em>{' '}
        in.
      </h3>
      <p
        className="mt-3 italic text-[14px] text-[var(--ink-2)] max-w-prose"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Doelen geven je voorstellen en acties richting — een noodfonds, een aflossing, een
        spaardoel. Zonder kompas blijft het bij optimalisatie zonder bestemming.
      </p>
      <button
        type="button"
        onClick={onClick}
        className="mt-6 inline-flex items-center gap-1.5 bg-[var(--ink)] text-[var(--paper)] px-4 py-2.5 text-xs font-semibold hover:bg-[var(--ink-2)] min-h-[44px] rounded-[var(--r)]"
      >
        <Plus className="h-4 w-4" /> Eerste doel toevoegen
      </button>
    </div>
  )
}

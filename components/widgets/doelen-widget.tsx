'use client'

import { memo } from 'react'
import Link from 'next/link'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData, TopGoal } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { getGoalColorClasses, computeGoalProgress, isGoalReached, type GoalType } from '@/lib/goal-data'
import { Target } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

/**
 * Consume-don't-recompute: de doelvoortgang komt uit de CANONIEKE, richting-
 * bewuste `computeGoalProgress()` (`lib/goal-data.ts`) — niet uit een lokale
 * som. Cruciaal voor `direction:'down'`-types (bv. `fire_age`), waar hoger NIET
 * beter is; een naïeve `current/target` zou daar structureel op 100% klemmen en
 * afwijken van het doel-scherm (`/toekomst`). `TopGoal` draagt alle velden die
 * de canonieke functie voor `pct` leest.
 *
 * LET OP: `TopGoal` draagt géén `created_at`, dus de pace-toets (`onTrack`,
 * bevindingen M31/M32) kan hier niet meten en valt terug op "geen oordeel".
 * Deze widget toont dan ook alléén `pct` — wil je hier ooit een status tonen,
 * neem `created_at` mee in `TopGoal` i.p.v. een eigen oordeel te bouwen.
 */
function goalPct(goal: TopGoal): number {
  return computeGoalProgress({
    goal_type: goal.goal_type as GoalType,
    current_value: goal.current_value,
    target_value: goal.target_value,
    target_date: goal.target_date,
  }).pct
}

/**
 * "Binnen?" — de canonieke richting-bewuste toets, niet `pct >= 100`. Bij een
 * omlaag-doel is dat percentage geen oordeel: `target / current` staat op een
 * schuldenvrij-datum (jaartallen rond 2030) afgerond op 100% terwijl het doel
 * jaren achterloopt.
 */
function goalDone(goal: TopGoal): boolean {
  return isGoalReached(goal.goal_type as GoalType, goal.current_value, goal.target_value)
}

function isOverdue(goal: TopGoal): boolean {
  // Een live-gesynchroniseerd doel (canonieke `eta`) toont de GEPROJECTEERDE
  // datum; "Verlopen" hoort bij een streefdatum, niet bij een projectie.
  if (goal.eta) return false
  if (!goal.target_date) return false
  return new Date(goal.target_date) < new Date() && !goalDone(goal)
}

function etaLabel(goal: TopGoal): string | null {
  // Canonieke projectie wint van de opgeslagen streefdatum (bevinding C10) —
  // spiegelt `computeGoalProgress`'s `etaOverride` op het doelen-scherm, zodat
  // widget en scherm dezelfde datum tonen.
  if (goal.eta) return goal.eta
  if (!goal.target_date) return null
  return new Date(goal.target_date).toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
}

// ── Half-size: lijstrij per doel ──────────────────────────────

function GoalProgressRow({ goal, index, hasEntered }: { goal: TopGoal; index: number; hasEntered: boolean }) {
  const colors = getGoalColorClasses(goal.color)
  const pct = goalPct(goal)
  const overdue = isOverdue(goal)
  const eta = etaLabel(goal)
  const nearlyDone = pct >= 90 && pct < 100

  return (
    <div
      className="py-2.5 border-b border-[var(--border-ed)] last:border-0"
      style={{
        animation: hasEntered ? `fadeUp 0.4s ease-out ${index * 60}ms both` : 'none',
        opacity: hasEntered ? undefined : 0,
      }}
    >
      {/* Naam + tag + percentage */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="flex-1 min-w-0 text-sm font-medium text-[var(--ink)] truncate">
          {goal.name}
        </span>
        {nearlyDone && (
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.05em] rounded-[var(--r-sm)] px-1.5 py-px bg-wil-50 border border-wil-200 text-wil-700">
            Bijna!
          </span>
        )}
        <span className={`shrink-0 font-mono text-sm tabular-nums ${overdue ? 'text-negative' : 'text-[var(--ink)]'}`}>
          {pct}%
        </span>
      </div>

      {/* Voortgangsbalk */}
      <div
        role="progressbar"
        aria-label={`Voortgang ${goal.name}`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]"
      >
        <div
          className={`h-full rounded-full ${overdue ? 'bg-negative' : colors.bar}`}
          style={{
            width: hasEntered ? `${pct}%` : '0%',
            transition: hasEntered
              ? `width ${500 + index * 80}ms cubic-bezier(.22,1,.36,1) ${index * 80}ms`
              : 'none',
          }}
        />
      </div>

      {/* Deadline */}
      {eta && (
        <p className={`mt-0.5 font-mono text-[10px] tabular-nums ${overdue ? 'text-negative' : 'text-[var(--ink-4)]'}`}>
          {overdue ? 'Verlopen — ' : ''}{eta}
        </p>
      )}
    </div>
  )
}

// ── Lege staat ────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-8">
      <div className="h-12 w-12 rounded-full bg-wil-50 flex items-center justify-center mb-2">
        <Target className="h-6 w-6 text-wil-200" />
      </div>
      <p className="text-sm text-[var(--ink-3)]">Nog geen doelen ingesteld</p>
      <p className="font-serif italic text-[11px] text-[var(--ink-4)] mt-0.5">
        Een doel maakt zichtbaar waar je vrijheid opbouwt.
      </p>
      {/* CTA — "Geen CTA = doodlopend". Werkwoord-eerst, scherpe hoeken, ink-mini. */}
      <Link
        href="/toekomst/doelen"
        className="mt-3 inline-flex min-h-11 items-center justify-center border border-[var(--ink)] bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--paper)] transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        Stel je eerste doel
      </Link>
    </div>
  )
}

// ── Widget ────────────────────────────────────────────────────

export const DoelenWidget = memo(function DoelenWidget({ size, data, href }: Props) {
  const { topGoals, goals } = data
  const { ref: containerRef, hasEntered } = useInViewAnimation({ duration: 800 })
  const footerLabel = goals === 1 ? '1 actief doel' : `${goals} actieve doelen`

  // ── Mini-size: active goals count ────
  if (size === 'mini') {
    return (
      <WidgetShell module="wil" size="mini" kicker="Doelen" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {goals} actief
        </p>
      </WidgetShell>
    )
  }

  // Sorteer op voortgang: meest achterlopende doel (laagste %) eerst (WF-OVZ-06).
  // `goalPct` leunt op de richting-bewuste `computeGoalProgress`, dus dit klopt
  // ook voor `direction:'down'`-doelen. Losse kopie — `topGoals` (canonieke
  // sort_order-volgorde uit de bundel) blijft ongemoeid.
  const sortedGoals = [...topGoals].sort((a, b) => goalPct(a) - goalPct(b))

  // ── Quarter-size: eerste doel compact ───────────────────────
  if (size === 'quarter') {
    const goal = sortedGoals[0] ?? null

    if (!goal) {
      return (
        <WidgetShell module="wil" size={size} kicker="Doelen" href={href}>
          <div className="flex flex-col items-center justify-center text-center py-3">
            <Target className="h-6 w-6 text-wil-200 mb-1" />
            <p className="text-[11px] text-[var(--ink-3)]">Geen doelen</p>
          </div>
        </WidgetShell>
      )
    }

    const pct = goalPct(goal)
    const overdue = isOverdue(goal)
    const eta = etaLabel(goal)
    const colors = getGoalColorClasses(goal.color)
    const pctColor = overdue ? 'text-negative' : pct >= 90 ? 'text-positive' : pct >= 50 ? 'text-[var(--ink-2)]' : 'text-[var(--ink)]'

    return (
      <WidgetShell module="wil" size={size} kicker="Doelen" href={href}>
        <div ref={containerRef}>
          <p className="text-sm text-[var(--ink)] font-medium truncate">{goal.name}</p>
          <p className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${pctColor}`}>
            {pct}%
          </p>
          <div
            role="progressbar"
            aria-label={`Voortgang ${goal.name}`}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]"
          >
            <div
              className={`h-full rounded-full ${overdue ? 'bg-negative' : colors.bar}`}
              style={{
                width: hasEntered ? `${pct}%` : '0%',
                transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1)' : 'none',
              }}
            />
          </div>
          {eta && (
            <p className={`mt-0.5 font-mono text-[10px] tabular-nums ${overdue ? 'text-negative' : 'text-[var(--ink-4)]'}`}>
              {overdue ? 'Verlopen — ' : ''}{eta}
            </p>
          )}
        </div>
      </WidgetShell>
    )
  }

  // ── Half-size: horizontal layout — left stats, right goal bars ────
  if (size === 'half') {
    const halfGoals = sortedGoals.slice(0, 2)
    const avgPctHalf = topGoals.length > 0
      ? Math.round(topGoals.reduce((sum, g) => sum + goalPct(g), 0) / topGoals.length)
      : 0
    return (
      <WidgetShell module="wil" size={size} kicker="Doelen" href={href}>
        <div ref={containerRef} className="flex gap-3 h-full">
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">{goals}</span>
            <span className="text-[11px] text-[var(--ink-3)]">{goals === 1 ? 'doel' : 'doelen'}</span>
            {avgPctHalf > 0 && (
              <p className="mt-1.5 font-mono text-xs tabular-nums text-wil-700">
                Gem. {avgPctHalf}%
              </p>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {halfGoals.length === 0 ? (
              <p className="text-[11px] text-[var(--ink-3)]">Nog geen doelen</p>
            ) : (
              <div className="space-y-1.5">
                {halfGoals.map((goal, i) => {
                  const colors = getGoalColorClasses(goal.color)
                  const pct = goalPct(goal)
                  const overdue = isOverdue(goal)
                  return (
                    <div key={goal.id}>
                      <div className="flex items-center gap-1.5">
                        <span className="flex-1 min-w-0 text-[11px] text-[var(--ink)] truncate">{goal.name}</span>
                        <span className={`shrink-0 font-mono text-[10px] tabular-nums ${overdue ? 'text-negative' : 'text-[var(--ink-3)]'}`}>
                          {pct}%
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={`Voortgang ${goal.name}`}
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]"
                      >
                        <div
                          className={`h-full rounded-full ${overdue ? 'bg-negative' : colors.bar}`}
                          style={{
                            width: hasEntered ? `${pct}%` : '0%',
                            transition: hasEntered ? `width ${500 + i * 80}ms cubic-bezier(.22,1,.36,1) ${i * 80}ms` : 'none',
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full-size: summary + vertical goal list (336px height) ────
  const completedGoals = topGoals.filter(goalDone).length
  const avgPct = topGoals.length > 0
    ? Math.round(topGoals.reduce((sum, g) => sum + goalPct(g), 0) / topGoals.length)
    : 0

  // Find the goal with the nearest future deadline
  const now = new Date()
  const closestDeadlineGoal = topGoals
    .filter(g => g.target_date && new Date(g.target_date) > now && !goalDone(g))
    .sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())[0] ?? null

  const fullGoals = sortedGoals.slice(0, 3)

  return (
    <WidgetShell module="wil" size={size} kicker="Doelen" href={href}>
      <div ref={containerRef}>
        {topGoals.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Summary row — compact */}
            <div className="grid grid-cols-3 divide-x divide-dashed divide-[var(--border-ed)] border border-dashed border-[var(--border-ed)] rounded-[var(--r)] px-3 py-2 mb-2">
              <div className="flex flex-col items-center pr-3">
                <span className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">{goals}</span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] font-sans text-center">DOELEN</span>
              </div>
              <div className="flex flex-col items-center px-3">
                <span className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">{avgPct}%</span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] font-sans text-center leading-tight">GEM. VOORTGANG</span>
              </div>
              <div className="flex flex-col items-center pl-3">
                <span className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">{completedGoals}</span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] font-sans text-center">BEHAALD</span>
              </div>
            </div>

            {/* Closest deadline indicator */}
            {closestDeadlineGoal && (
              <div className="flex items-center gap-1.5 rounded-[var(--r)] bg-wil-50 border border-wil-200 px-2.5 py-1.5 mb-2">
                <Target className="h-3 w-3 text-wil-600 shrink-0" />
                <span className="text-[11px] text-wil-700 font-medium truncate">{closestDeadlineGoal.name}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-wil-600">
                  {new Date(closestDeadlineGoal.target_date!).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                </span>
              </div>
            )}

            {/* Vertical goal list — max 3 */}
            <div>
              {fullGoals.map((goal, i) => (
                <GoalProgressRow key={goal.id} goal={goal} index={i} hasEntered={hasEntered} />
              ))}
            </div>
          </>
        )}
      </div>
    </WidgetShell>
  )
})

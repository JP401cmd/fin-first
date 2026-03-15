'use client'

import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData, TopGoal } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { getGoalColorClasses, formatGoalValue, type GoalType } from '@/lib/goal-data'
import { Target } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

function goalPct(goal: TopGoal): number {
  return goal.target_value > 0
    ? Math.min(Math.round((goal.current_value / goal.target_value) * 100), 100)
    : 0
}

function isOverdue(goal: TopGoal): boolean {
  if (!goal.target_date) return false
  return new Date(goal.target_date) < new Date() && goalPct(goal) < 100
}

function etaLabel(goal: TopGoal): string | null {
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
        <span className={`shrink-0 font-mono text-sm tabular-nums ${overdue ? 'text-red-600' : 'text-[var(--ink)]'}`}>
          {pct}%
        </span>
      </div>

      {/* Voortgangsbalk */}
      <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
        <div
          className={`h-full rounded-full ${overdue ? 'bg-red-400' : colors.bar}`}
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
        <p className={`mt-0.5 font-mono text-[10px] tabular-nums ${overdue ? 'text-red-500' : 'text-[var(--ink-4)]'}`}>
          {overdue ? 'Verlopen — ' : ''}{eta}
        </p>
      )}
    </div>
  )
}

// ── Full-size: kaart per doel ─────────────────────────────────

function GoalCard({ goal, index, hasEntered }: { goal: TopGoal; index: number; hasEntered: boolean }) {
  const colors = getGoalColorClasses(goal.color)
  const pct = goalPct(goal)
  const overdue = isOverdue(goal)
  const eta = etaLabel(goal)
  const nearlyDone = pct >= 90 && pct < 100

  return (
    <div
      className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/50 p-3"
      style={{
        animation: hasEntered ? `fadeUp 0.4s ease-out ${index * 60}ms both` : 'none',
        opacity: hasEntered ? undefined : 0,
      }}
    >
      {/* Naam + tag + percentage */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="flex-1 min-w-0 text-sm font-medium text-[var(--ink)] leading-tight">
          {goal.name}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {nearlyDone && (
            <span className="text-[9px] font-bold uppercase tracking-[0.05em] rounded-[var(--r-sm)] px-1.5 py-px bg-wil-50 border border-wil-200 text-wil-700">
              Bijna!
            </span>
          )}
          <span className={`font-mono text-sm tabular-nums font-semibold ${overdue ? 'text-red-600' : 'text-[var(--ink)]'}`}>
            {pct}%
          </span>
        </div>
      </div>

      {/* Voortgangsbalk */}
      <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)] mb-2">
        <div
          className={`h-full rounded-full ${overdue ? 'bg-red-400' : colors.bar}`}
          style={{
            width: hasEntered ? `${pct}%` : '0%',
            transition: hasEntered
              ? `width ${500 + index * 80}ms cubic-bezier(.22,1,.36,1) ${index * 80}ms`
              : 'none',
          }}
        />
      </div>

      {/* Bedrag + deadline */}
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] tabular-nums text-[var(--ink-3)] truncate">
          {formatGoalValue(goal.current_value, goal.goal_type as GoalType, goal.custom_unit)} / {formatGoalValue(goal.target_value, goal.goal_type as GoalType, goal.custom_unit)}
        </p>
        {eta && (
          <p className={`shrink-0 font-mono text-[10px] tabular-nums ${overdue ? 'text-red-500' : 'text-[var(--ink-4)]'}`}>
            {eta}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Lege staat ────────────────────────────────────────────────

function EmptyState({ full }: { full?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${full ? 'py-8' : 'py-4'}`}>
      {full && (
        <div className="h-12 w-12 rounded-full bg-wil-50 flex items-center justify-center mb-2">
          <Target className="h-6 w-6 text-wil-200" />
        </div>
      )}
      {!full && <Target className="h-7 w-7 text-wil-200 mb-2" />}
      <p className="text-sm text-[var(--ink-3)]">Nog geen doelen ingesteld</p>
      <p className="font-serif italic text-[11px] text-[var(--ink-4)] mt-0.5">
        Stel je eerste doel in om te starten
      </p>
    </div>
  )
}

// ── Widget ────────────────────────────────────────────────────

export function DoelenWidget({ size, data, href }: Props) {
  const { topGoals, goals } = data
  const { ref: containerRef, hasEntered } = useInViewAnimation({ duration: 800 })
  const footerLabel = goals === 1 ? '1 actief doel' : `${goals} actieve doelen`

  // ── Mini-size: achieved/total ────
  if (size === 'mini') {
    const achieved = topGoals.filter(g => goalPct(g) >= 100).length
    return (
      <WidgetShell module="wil" size="mini" kicker="Doelen" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {achieved}/{goals} bereikt
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size: eerste doel compact ───────────────────────
  if (size === 'quarter') {
    const goal = topGoals[0] ?? null

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
    const pctColor = overdue ? 'text-red-600' : pct >= 90 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-[var(--ink)]'

    return (
      <WidgetShell module="wil" size={size} kicker="Doelen" href={href}>
        <div ref={containerRef}>
          <p className="text-sm text-[var(--ink)] font-medium truncate">{goal.name}</p>
          <p className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${pctColor}`}>
            {pct}%
          </p>
          <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
            <div
              className={`h-full rounded-full ${overdue ? 'bg-red-400' : colors.bar}`}
              style={{
                width: hasEntered ? `${pct}%` : '0%',
                transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1)' : 'none',
              }}
            />
          </div>
          {eta && (
            <p className={`mt-0.5 font-mono text-[10px] tabular-nums ${overdue ? 'text-red-500' : 'text-[var(--ink-4)]'}`}>
              {overdue ? 'Verlopen — ' : ''}{eta}
            </p>
          )}
        </div>
      </WidgetShell>
    )
  }

  // ── Half-size: compact for 1-row 160px height ────
  if (size === 'half') {
    const halfGoals = topGoals.slice(0, 2)
    return (
      <WidgetShell module="wil" size={size} kicker="Doelen" href={href}>
        <div ref={containerRef}>
          {halfGoals.length === 0 ? (
            <div className="flex items-center gap-2 py-2">
              <Target className="h-5 w-5 text-wil-200 shrink-0" />
              <p className="text-sm text-[var(--ink-3)]">Nog geen doelen</p>
            </div>
          ) : (
            <div>
              {halfGoals.map((goal, i) => {
                const colors = getGoalColorClasses(goal.color)
                const pct = goalPct(goal)
                const overdue = isOverdue(goal)
                return (
                  <div
                    key={goal.id}
                    className="py-1 border-b border-[var(--border-ed)] last:border-0"
                    style={{
                      animation: hasEntered ? `fadeUp 0.4s ease-out ${i * 60}ms both` : 'none',
                      opacity: hasEntered ? undefined : 0,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="flex-1 min-w-0 text-sm text-[var(--ink)] truncate">{goal.name}</span>
                      <span className={`shrink-0 font-mono text-xs tabular-nums ${overdue ? 'text-red-600' : 'text-[var(--ink)]'}`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
                      <div
                        className={`h-full rounded-full ${overdue ? 'bg-red-400' : colors.bar}`}
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
          {goals > halfGoals.length && (
            <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">{footerLabel}</p>
          )}
        </div>
      </WidgetShell>
    )
  }

  // ── Full-size: summary + goal cards grid (336px height) ────
  const completedGoals = topGoals.filter(g => goalPct(g) >= 100).length
  const avgPct = topGoals.length > 0
    ? Math.round(topGoals.reduce((sum, g) => sum + goalPct(g), 0) / topGoals.length)
    : 0

  return (
    <WidgetShell module="wil" size={size} kicker="Doelen" href={href}>
      <div ref={containerRef}>
        {topGoals.length === 0 ? (
          <EmptyState full />
        ) : (
          <>
            {/* Summary row */}
            <div className="grid grid-cols-3 divide-x divide-dashed divide-[var(--border-ed)] border border-dashed border-[var(--border-ed)] rounded-[var(--r)] p-3 mb-3">
              <div className="flex flex-col items-center pr-3">
                <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">{goals}</span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] font-sans mt-0.5 text-center">DOELEN</span>
              </div>
              <div className="flex flex-col items-center px-3">
                <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">{avgPct}%</span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] font-sans mt-0.5 text-center leading-tight">GEM. VOORTGANG</span>
              </div>
              <div className="flex flex-col items-center pl-3">
                <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">{completedGoals}</span>
                <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] font-sans mt-0.5 text-center">BEHAALD</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {topGoals.map((goal, i) => (
                <GoalCard key={goal.id} goal={goal} index={i} hasEntered={hasEntered} />
              ))}
            </div>
          </>
        )}
      </div>
    </WidgetShell>
  )
}

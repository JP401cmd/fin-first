'use client'

import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData, TopGoal } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { getGoalColorClasses } from '@/lib/goal-data'
import { formatCurrency } from '@/lib/format'
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
          {formatCurrency(goal.current_value)} / {formatCurrency(goal.target_value)}
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

  if (size === 'half') {
    return (
      <WidgetShell module="wil" size={size} kicker="Doelen" href={href}>
        <div ref={containerRef}>
          {topGoals.length === 0 ? (
            <EmptyState />
          ) : (
            <div>
              {topGoals.map((goal, i) => (
                <GoalProgressRow key={goal.id} goal={goal} index={i} hasEntered={hasEntered} />
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-[var(--ink-3)]">{footerLabel}</p>
        </div>
      </WidgetShell>
    )
  }

  // Full size
  return (
    <WidgetShell module="wil" size={size} kicker="Doelen" href={href}>
      <div ref={containerRef}>
        {topGoals.length === 0 ? (
          <EmptyState full />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {topGoals.map((goal, i) => (
              <GoalCard key={goal.id} goal={goal} index={i} hasEntered={hasEntered} />
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--ink-3)]">{footerLabel}</p>
      </div>
    </WidgetShell>
  )
}

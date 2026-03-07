'use client'

import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData, TopAction } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

function priorityDotClass(score: number | null): string {
  if (score === 5) return 'bg-wil-600'
  if (score === 4) return 'bg-wil-400'
  if (score === 3) return 'bg-[var(--ink-3)]'
  return 'bg-[var(--ink-4)]'
}

function ActionRow({ action, index, hasEntered }: { action: TopAction; index: number; hasEntered: boolean }) {
  const days = action.freedom_days_impact != null && action.freedom_days_impact > 0
    ? Math.round(action.freedom_days_impact)
    : null

  return (
    <div
      className="flex items-center gap-2 py-1.5 border-b border-[var(--border-ed)] last:border-0"
      style={{
        animation: hasEntered
          ? `fadeUp 0.4s ease-out ${index * 60}ms both`
          : 'none',
        opacity: hasEntered ? undefined : 0,
      }}
    >
      <span className="font-mono text-[10px] text-[var(--ink-4)] w-4 shrink-0 tabular-nums">
        {index + 1}
      </span>
      <span className={`h-2 w-2 rounded-full shrink-0 ${priorityDotClass(action.priority_score)}`} />
      <span className="flex-1 min-w-0 text-sm text-[var(--ink)] truncate">
        {action.title}
      </span>
      {days !== null && (
        <span className="shrink-0 font-mono text-xs tabular-nums text-wil-700 bg-wil-50 rounded-full px-2 py-px">
          +{days}d
        </span>
      )}
    </div>
  )
}

export function ActiesWidget({ size, data, href }: Props) {
  const { openActions, totalFreedomDaysOpen, completedActionsThisMonth, topOpenActions } = data
  const { ref: containerRef, hasEntered } = useInViewAnimation({ duration: 600 })

  const top = size === 'full' ? topOpenActions.slice(0, 5) : topOpenActions.slice(0, 3)
  const roundedDays = Math.round(totalFreedomDaysOpen)

  // ── Quarter-size: stacked KPIs ────
  if (size === 'quarter') {
    return (
      <WidgetShell module="wil" size={size} kicker="Acties" href={href}>
        <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
          {openActions} <span className="text-xs font-normal text-[var(--ink-3)]">open</span>
        </p>
        <p className="mt-1 text-xs text-[var(--ink-3)]">
          {completedActionsThisMonth} afgerond
        </p>
        {roundedDays > 0 && (
          <p className="mt-1 font-mono text-xs tabular-nums text-wil-700">
            +{roundedDays}d te winnen
          </p>
        )}
      </WidgetShell>
    )
  }

  if (size === 'half') {
    return (
      <WidgetShell module="wil" size={size} kicker="Acties" href={href}>
        <div ref={containerRef}>
          {top.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <p className="font-sans text-sm text-[var(--ink-3)]">Geen openstaande acties</p>
              <p className="font-serif italic text-[11px] text-[var(--ink-4)] mt-1">Alle acties zijn afgerond</p>
            </div>
          ) : (
            <div className="space-y-0">
              {top.map((action, i) => (
                <ActionRow key={action.id} action={action} index={i} hasEntered={hasEntered} />
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-[var(--ink-3)]">
            {openActions} {openActions === 1 ? 'actie' : 'acties'} open
          </p>
        </div>
      </WidgetShell>
    )
  }

  // Full size
  return (
    <WidgetShell module="wil" size={size} kicker="Acties" href={href}>
      <div ref={containerRef}>
        {/* Samenvattingsrij */}
        <div className="grid grid-cols-3 divide-x divide-dashed divide-[var(--border-ed)] border border-dashed border-[var(--border-ed)] rounded-[var(--r)] p-3">
          <div className="flex flex-col items-center pr-3">
            <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">{openActions}</span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] font-sans mt-0.5 text-center">OPEN</span>
          </div>
          <div className="flex flex-col items-center px-3">
            <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">{completedActionsThisMonth}</span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] font-sans mt-0.5 text-center leading-tight">AFGEROND DEZE MAAND</span>
          </div>
          <div className="flex flex-col items-center pl-3">
            <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">{roundedDays}</span>
            <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] font-sans mt-0.5 text-center leading-tight">DAGEN TE WINNEN</span>
          </div>
        </div>

        {/* Actielijst */}
        <p className="label-editorial text-[var(--ink-3)] mt-4 mb-2">TOP ACTIES</p>

        {top.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="font-sans text-sm text-[var(--ink-3)]">Geen openstaande acties</p>
            <p className="font-serif italic text-[11px] text-[var(--ink-4)] mt-1">Alle acties zijn afgerond</p>
          </div>
        ) : (
          <div>
            {top.map((action, i) => (
              <ActionRow key={action.id} action={action} index={i} hasEntered={hasEntered} />
            ))}
          </div>
        )}
      </div>
    </WidgetShell>
  )
}

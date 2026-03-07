import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { Award } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function BadgesWidget({ size, data, href }: Props) {
  const { badgeSummary } = data
  const { earned, total, latestBadge, nearestBadge } = badgeSummary

  if (earned === 0 && !nearestBadge) {
    return (
      <WidgetShell module="cross" size={size} kicker="Badges" href={href}>
        <WidgetEmpty icon={Award} message="Verdien badges door financiele mijlpalen te bereiken." />
      </WidgetShell>
    )
  }

  const pct = total > 0 ? (earned / total) * 100 : 0

  if (size === 'quarter') {
    return (
      <WidgetShell module="cross" size={size} kicker="Badges" href={href}>
        <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {earned}/{total}
        </p>
        {latestBadge && (
          <p className="mt-1 text-xs text-[var(--ink-3)] line-clamp-1">{latestBadge.icon} {latestBadge.name}</p>
        )}
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="cross" size={size} kicker="Badges" href={href}>
      <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
        {earned}<span className="text-base text-[var(--ink-3)]">/{total}</span>
      </p>

      {/* Progress bar */}
      <div className="mt-2 h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
        <div
          className="h-full rounded-full bg-amber-500 transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {latestBadge && (
        <p className="mt-2 text-xs text-[var(--ink-2)]">
          Laatste: {latestBadge.icon} {latestBadge.name}
        </p>
      )}
      {nearestBadge && (
        <p className="mt-1 text-xs text-[var(--ink-3)]">
          Bijna: {nearestBadge.name} ({Math.round(nearestBadge.progress * 100)}%)
        </p>
      )}
    </WidgetShell>
  )
}

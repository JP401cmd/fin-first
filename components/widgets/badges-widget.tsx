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
        <WidgetEmpty icon={Award} message="Start met je eerste badge!" />
      </WidgetShell>
    )
  }

  const pct = total > 0 ? (earned / total) * 100 : 0
  const nearPct = nearestBadge ? Math.round(nearestBadge.progress * 100) : 0

  // ── Quarter: laatst verdiende badge icoon + 'X/Y verdiend' teller ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="cross" size={size} kicker="Badges" href={href}>
        {latestBadge && (
          <p className="text-xl leading-none mb-1">{latestBadge.icon}</p>
        )}
        <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
          {earned}<span className="text-sm text-[var(--ink-3)]">/{total}</span>
          <span className="ml-1 text-xs font-normal text-[var(--ink-3)]">verdiend</span>
        </p>
      </WidgetShell>
    )
  }

  // ── Half: verdiende badges grid + locked badges + 'Bijna' met progress bar ──
  if (size === 'half') {
    return (
      <WidgetShell module="cross" size={size} kicker="Badges" href={href}>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
            {earned}<span className="text-base text-[var(--ink-3)]">/{total}</span>
          </span>
        </div>

        {/* Overall progress bar */}
        <div className="mt-2 h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
          <div
            className="h-full rounded-full bg-amber-500 transition-all"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>

        {/* Latest earned badge */}
        {latestBadge && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-lg">{latestBadge.icon}</span>
            <div>
              <p className="text-sm font-medium text-[var(--ink)]">{latestBadge.name}</p>
              <p className="text-[10px] text-[var(--ink-4)]">
                {new Date(latestBadge.earnedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
              </p>
            </div>
          </div>
        )}

        {/* Near badge with progress bar */}
        {nearestBadge && (
          <div className="mt-3 rounded-md bg-[var(--subtle)] px-2.5 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-[var(--ink-3)]">Bijna: {nearestBadge.name}</span>
              <span className="text-xs font-mono tabular-nums text-[var(--ink-3)]">{nearPct}%</span>
            </div>
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--paper)]">
              <div
                className="h-full rounded-full bg-teal-400 transition-all"
                style={{ width: `${Math.min(nearPct, 100)}%` }}
              />
            </div>
          </div>
        )}
      </WidgetShell>
    )
  }

  // ── Full: volledige badge overzicht + progress bars + datums ──
  return (
    <WidgetShell module="cross" size={size} kicker="Badges" href={href}>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {earned}<span className="text-base text-[var(--ink-3)]">/{total}</span>
        </span>
        <span className="text-xs text-[var(--ink-3)]">badges verdiend</span>
      </div>

      {/* Overall progress bar */}
      <div className="h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)] mb-4">
        <div
          className="h-full rounded-full bg-amber-500 transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {/* Latest earned badge - highlighted */}
      {latestBadge && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-amber-600 font-semibold mb-1">Laatst verdiend</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{latestBadge.icon}</span>
            <div>
              <p className="text-sm font-medium text-[var(--ink)]">{latestBadge.name}</p>
              <p className="text-[10px] text-[var(--ink-4)]">
                {new Date(latestBadge.earnedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Near badge with progress */}
      {nearestBadge && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-teal-600 font-semibold mb-1">Bijna verdiend</p>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-[var(--ink)]">{nearestBadge.name}</span>
            <span className="text-xs font-mono tabular-nums text-teal-600">{nearPct}%</span>
          </div>
          <div className="h-[4px] w-full overflow-hidden rounded-full bg-teal-100">
            <div
              className="h-full rounded-full bg-teal-500 transition-all"
              style={{ width: `${Math.min(nearPct, 100)}%` }}
            />
          </div>
        </div>
      )}
    </WidgetShell>
  )
}

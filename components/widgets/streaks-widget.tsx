import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { Flame } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const STREAK_LABELS: Record<string, string> = {
  login: 'Login',
  budget: 'Budget',
  action: 'Actie',
}

export function StreaksWidget({ size, data, href }: Props) {
  const { streaks } = data
  const bestStreak = streaks.length > 0
    ? streaks.reduce((a, b) => a.currentCount >= b.currentCount ? a : b)
    : null

  if (!bestStreak || streaks.every(s => s.currentCount === 0)) {
    return (
      <WidgetShell module="cross" size={size} kicker="Streaks" href={href}>
        <WidgetEmpty icon={Flame} message="Start een streak door dagelijks in te loggen." />
      </WidgetShell>
    )
  }

  if (size === 'quarter') {
    return (
      <WidgetShell module="cross" size={size} kicker="Streaks" href={href}>
        <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {bestStreak.currentCount}<span className="text-sm text-[var(--ink-3)]"> wk</span>
        </p>
        <p className="mt-1 text-xs text-[var(--ink-3)]">{STREAK_LABELS[bestStreak.type] ?? bestStreak.type} streak</p>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="cross" size={size} kicker="Streaks" href={href}>
      <div className="space-y-2">
        {streaks.map(s => (
          <div key={s.type} className="flex items-center justify-between">
            <span className="text-sm text-[var(--ink-2)]">{STREAK_LABELS[s.type] ?? s.type}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                {s.currentCount}<span className="text-xs text-[var(--ink-3)]"> wk</span>
              </span>
              <span className="text-xs text-[var(--ink-4)]">
                (record: {s.longestCount})
              </span>
            </div>
          </div>
        ))}
      </div>
    </WidgetShell>
  )
}

import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function MaandoverzichtWidget({ size, data, href }: Props) {
  const { monthSummary } = data
  const { freedomDaysWon, savingsRate, budgetScore, prevMonthComparison } = monthSummary
  const isPositive = freedomDaysWon >= 0

  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Maandoverzicht" href={href}>
        <p className={`font-mono text-2xl font-semibold tabular-nums ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
          {isPositive ? '+' : ''}{freedomDaysWon}<span className="text-sm text-[var(--ink-3)]">d</span>
        </p>
        <p className="mt-1 text-xs text-[var(--ink-3)]">vrijheid deze maand</p>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="kern" size={size} kicker="Maandoverzicht" href={href}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-[var(--ink-3)]">Vrijheidsdagen</p>
          <p className={`font-mono text-lg font-semibold tabular-nums ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{freedomDaysWon}d
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--ink-3)]">Spaarquote</p>
          <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
            {savingsRate.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--ink-3)]">Budgetscore</p>
          <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
            {budgetScore}<span className="text-xs text-[var(--ink-3)]">/100</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--ink-3)]">vs. vorige maand</p>
          <p className={`font-mono text-lg font-semibold tabular-nums ${prevMonthComparison >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {prevMonthComparison >= 0 ? '+' : ''}{prevMonthComparison.toFixed(1)}%
          </p>
        </div>
      </div>
    </WidgetShell>
  )
}

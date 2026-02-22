import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function SpaarquoteWidget({ size, data, href }: Props) {
  const { monthlyIncome, monthlyExpenses } = data
  const savings = monthlyIncome - monthlyExpenses
  const rate = monthlyIncome > 0 ? (savings / monthlyIncome) * 100 : 0
  const isPositive = rate >= 0

  return (
    <WidgetShell module="kern" size={size} kicker="Spaarquote" href={href}>
      <p className={`font-mono text-2xl font-semibold tabular-nums ${isPositive ? 'text-[var(--ink)]' : 'text-red-600'}`}>
        {rate.toFixed(1)}%
      </p>

      {/* Mini bar */}
      <div className="mt-2 h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
        <div
          className={`h-full rounded-full transition-all ${isPositive ? 'bg-emerald-500' : 'bg-red-400'}`}
          style={{ width: `${Math.min(Math.abs(rate), 100)}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-[var(--ink-3)]">
        {formatCurrency(Math.max(savings, 0))} gespaard per maand
      </p>
    </WidgetShell>
  )
}

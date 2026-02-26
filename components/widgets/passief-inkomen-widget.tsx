import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { formatCurrency } from '@/lib/format'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function PassiefInkomenWidget({ size, data, href }: Props) {
  const { fireProjResult, monthlyExpenses } = data

  const current = fireProjResult.monthlyPassiveIncome ?? 0
  const target = monthlyExpenses > 0 ? monthlyExpenses : fireProjResult.fireTarget / 12
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0

  return (
    <WidgetShell module="horizon" size={size} kicker="Passief Inkomen" href={href}>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
          {formatCurrency(current)}
        </p>
        <span className="text-[10px] text-[var(--ink-3)]">/mnd</span>
      </div>

      <p className="mt-0.5 text-xs text-[var(--ink-3)]">
        van {formatCurrency(target)} nodig voor FIRE
      </p>

      <div className="mt-3">
        <div className="flex justify-between text-[10px] text-[var(--ink-3)] mb-1">
          <span>Passief inkomen doel</span>
          <span className="font-mono tabular-nums">{pct.toFixed(1)}%</span>
        </div>
        <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </WidgetShell>
  )
}

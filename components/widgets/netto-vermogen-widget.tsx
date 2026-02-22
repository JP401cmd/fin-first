import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency, formatFreedomTimeString, calculateFreedomTime } from '@/lib/format'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function NettoVermogenWidget({ size, data, href }: Props) {
  const { netWorth, monthlyExpenses } = data
  const dailyExp = monthlyExpenses / 30
  const freedomTime = dailyExp > 0 ? calculateFreedomTime(Math.abs(netWorth), dailyExp) : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  return (
    <WidgetShell module="kern" size={size} kicker="Netto Vermogen" href={href}>
      <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
        {formatCurrency(netWorth)}
      </p>
      {freedomStr && (
        <p className="mt-1 font-serif italic text-[12px] text-[var(--ink-3)]">
          ≈ {freedomStr} vrijheid
        </p>
      )}
      <p className="mt-2 text-xs text-[var(--ink-3)]">
        Vermogen min schulden
      </p>
    </WidgetShell>
  )
}

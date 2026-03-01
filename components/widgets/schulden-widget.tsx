import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function SchuldenWidget({ size, data, href }: Props) {
  const { totalDebts, monthlyExpenses } = data

  const dailyExp = monthlyExpenses / 30
  const freedomTime = dailyExp > 0 && totalDebts > 0
    ? calculateFreedomTime(totalDebts, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  return (
    <WidgetShell module="kern" size={size} kicker="Schulden" href={href}>
      <p className={`font-mono text-2xl font-semibold tabular-nums ${totalDebts > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
        {totalDebts > 0 ? '-' : ''}{formatCurrency(totalDebts)}
      </p>
      {freedomStr && (
        <p className="mt-0.5 font-serif italic text-[12px] text-[var(--ink-3)]">
          {freedomStr} vrijheid terug te winnen
        </p>
      )}
      <p className="mt-1 text-xs text-[var(--ink-3)]">
        {totalDebts > 0 ? 'Vrijheid die je terugkoopt' : 'Geen actieve schulden'}
      </p>
    </WidgetShell>
  )
}

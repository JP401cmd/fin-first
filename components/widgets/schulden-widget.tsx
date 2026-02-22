import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function SchuldenWidget({ size, data, href }: Props) {
  const { totalDebts } = data

  return (
    <WidgetShell module="kern" size={size} kicker="Schulden" href={href}>
      <p className={`font-mono text-2xl font-semibold tabular-nums ${totalDebts > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
        {totalDebts > 0 ? '-' : ''}{formatCurrency(totalDebts)}
      </p>
      <p className="mt-1 text-xs text-[var(--ink-3)]">
        {totalDebts > 0 ? 'Vrijheid die je terugkoopt' : 'Geen actieve schulden'}
      </p>
    </WidgetShell>
  )
}

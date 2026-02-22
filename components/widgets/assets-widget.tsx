import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function AssetsWidget({ size, data, href }: Props) {
  const { totalAssets, monthlyContributions } = data

  return (
    <WidgetShell module="kern" size={size} kicker="Vermogen" href={href}>
      <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
        {formatCurrency(totalAssets)}
      </p>
      <p className="mt-1 text-xs text-[var(--ink-3)]">
        Totaal actief vermogen
      </p>
      {monthlyContributions > 0 && (
        <p className="mt-2 font-mono text-sm text-emerald-700 tabular-nums">
          +{formatCurrency(monthlyContributions)} / maand
        </p>
      )}
    </WidgetShell>
  )
}

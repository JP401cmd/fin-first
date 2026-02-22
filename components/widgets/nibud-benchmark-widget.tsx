import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function NibudBenchmarkWidget({ size, data, href }: Props) {
  const { monthlyExpenses } = data

  return (
    <WidgetShell module="kern" size={size} kicker="NIBUD Benchmark" href={href}>
      <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
        {formatCurrency(monthlyExpenses)}
      </p>
      <p className="mt-1 text-xs text-[var(--ink-3)]">
        Jouw maanduitgaven
      </p>
      <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
        Vergelijk met NIBUD richtlijnen →
      </p>
    </WidgetShell>
  )
}

import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { BarChart2 } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function MonteCarloWidget({ size, data, href }: Props) {
  return (
    <WidgetShell module="horizon" size={size} kicker="Monte Carlo" href={href}>
      <div className="flex items-center gap-2">
        <BarChart2 className="h-4 w-4 text-horizon-500 shrink-0" />
        <p className="text-sm text-[var(--ink-3)]">Scenario-analyse</p>
      </div>
      <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
        Simuleer duizenden mogelijke toekomsten →
      </p>
    </WidgetShell>
  )
}

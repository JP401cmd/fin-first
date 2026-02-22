import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { TrendingUp } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function HoldingsWidget({ size, data: _data, href }: Props) {
  return (
    <WidgetShell module="kern" size={size} kicker="Beleggingen" href={href}>
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-kern-500 shrink-0" />
        <p className="text-sm text-[var(--ink-3)]">Portfolio overzicht</p>
      </div>
      <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
        Bekijk je beleggingsportfolio →
      </p>
    </WidgetShell>
  )
}

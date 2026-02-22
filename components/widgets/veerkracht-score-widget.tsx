import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Shield } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function VeerkrachtScoreWidget({ size, data, href }: Props) {
  // Compute a simple resilience score based on months covered
  const { monthsCovered } = data
  // Score: 0-100 based on months covered (6 months = ~50, 12 months = ~80)
  const score = Math.min(Math.round((monthsCovered / 24) * 100), 100)

  const scoreColor = score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-horizon-600' : 'text-red-600'

  return (
    <WidgetShell module="horizon" size={size} kicker="Veerkracht Score" href={href}>
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-horizon-500 shrink-0" />
        <p className={`font-mono text-2xl font-semibold tabular-nums ${scoreColor}`}>
          {score}
        </p>
        <span className="text-sm text-[var(--ink-3)]">/ 100</span>
      </div>
      <p className="mt-1 text-xs text-[var(--ink-3)]">
        Gebaseerd op {monthsCovered.toFixed(1)} maanden buffer
      </p>
    </WidgetShell>
  )
}

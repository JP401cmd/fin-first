import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Zap } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function ActiesWidget({ size, data, href }: Props) {
  const { openActions, totalFreedomDaysOpen } = data

  return (
    <WidgetShell module="wil" size={size} kicker="Acties" href={href}>
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-wil-500 shrink-0" />
        <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {openActions}
        </p>
      </div>
      <p className="mt-0.5 text-sm text-[var(--ink-3)]">
        {openActions === 1 ? 'actie' : 'acties'} open
      </p>
      <p className="mt-2 font-mono text-sm font-medium text-wil-600 tabular-nums">
        +{Math.round(totalFreedomDaysOpen)} {Math.round(totalFreedomDaysOpen) === 1 ? 'dag' : 'dagen'} vrijheid te winnen
      </p>
    </WidgetShell>
  )
}

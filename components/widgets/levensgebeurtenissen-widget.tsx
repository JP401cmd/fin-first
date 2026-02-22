import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Calendar } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function LevensgebeurtenissenWidget({ size, data, href }: Props) {
  const { lifeEvents } = data

  return (
    <WidgetShell module="horizon" size={size} kicker="Levensgebeurtenissen" href={href}>
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-horizon-500 shrink-0" />
        <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {lifeEvents}
        </p>
      </div>
      <p className="mt-0.5 text-sm text-[var(--ink-3)]">
        {lifeEvents === 1 ? 'life event' : 'life events'} gepland
      </p>
      <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
        Bekijk je tijdlijn →
      </p>
    </WidgetShell>
  )
}

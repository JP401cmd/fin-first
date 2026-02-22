import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Lightbulb } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function VoorstellenWidget({ size, data, href }: Props) {
  const { recommendations } = data

  return (
    <WidgetShell module="wil" size={size} kicker="Voorstellen" href={href}>
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-wil-500 shrink-0" />
        <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {recommendations}
        </p>
      </div>
      <p className="mt-0.5 text-sm text-[var(--ink-3)]">
        {recommendations === 1 ? 'aanbeveling' : 'aanbevelingen'} pending
      </p>
      <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
        Bekijk aanbevelingen →
      </p>
    </WidgetShell>
  )
}

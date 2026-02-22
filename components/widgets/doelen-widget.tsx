import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Target } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function DoelenWidget({ size, data, href }: Props) {
  const { goals } = data

  return (
    <WidgetShell module="wil" size={size} kicker="Doelen" href={href}>
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-wil-500 shrink-0" />
        <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {goals}
        </p>
      </div>
      <p className="mt-0.5 text-sm text-[var(--ink-3)]">
        {goals === 1 ? 'actief doel' : 'actieve doelen'}
      </p>
      <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
        Bekijk doelen →
      </p>
    </WidgetShell>
  )
}

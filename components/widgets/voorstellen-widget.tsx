import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Lightbulb } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-amber-500',
  3: 'bg-emerald-500',
}

export function VoorstellenWidget({ size, data, href }: Props) {
  const { recommendations, topRecommendations } = data

  const topPriority = topRecommendations?.[0]?.priority ?? null

  // ── Quarter-size: count + icon + priority dot ────
  if (size === 'quarter') {
    return (
      <WidgetShell module="wil" size={size} kicker="Voorstellen" href={href}>
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-wil-500 shrink-0" />
          <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
            {recommendations}
          </p>
          {topPriority != null && (
            <span
              className={`inline-block h-2 w-2 rounded-full shrink-0 ${PRIORITY_COLORS[topPriority] ?? 'bg-[var(--ink-4)]'}`}
              title={`Prioriteit ${topPriority}`}
            />
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
          {recommendations === 1 ? 'aanbeveling' : 'aanbevelingen'}
        </p>
      </WidgetShell>
    )
  }

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

import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import { Compass } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function VrijheidsvoortgangWidget({ size, data, href }: Props) {
  const { netWorth, fireTarget, freedomPct, fireProjResult } = data

  return (
    <WidgetShell module="cross" size={size} kicker="Vrijheidsvoortgang" href={href}>
      <div className="flex items-center gap-2 mb-2">
        <Compass className="h-3.5 w-3.5 text-horizon-600 shrink-0" />
        <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {freedomPct.toFixed(1)}%
        </p>
      </div>

      {/* Progress bar */}
      <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)] mb-2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600 transition-all duration-700"
          style={{ width: `${Math.min(freedomPct, 100)}%` }}
        />
      </div>

      <p className="text-xs text-[var(--ink-3)] font-mono tabular-nums">
        {formatCurrency(netWorth)} / {formatCurrency(fireTarget)}
      </p>

      <p className="mt-1.5 font-serif italic text-[11px] text-[var(--ink-3)]">
        {fireProjResult.fireDate === 'Bereikt!'
          ? 'Volledige vrijheid bereikt!'
          : fireProjResult.fireDate === 'Niet haalbaar'
            ? 'Verhoog spaarcapaciteit'
            : `Vrijheid: ${fireProjResult.fireDate}`
        }
      </p>
    </WidgetShell>
  )
}

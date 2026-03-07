import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Calendar } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function LevensgebeurtenissenWidget({ size, data, href }: Props) {
  const { lifeEvents, topLifeEvents } = data

  // ── Quarter-size: compact count + next event name ────
  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker="Levensgebeurtenissen" href={href}>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-horizon-500 shrink-0" />
          <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
            {lifeEvents}
          </p>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
          {lifeEvents === 1 ? 'life event' : 'life events'} gepland
        </p>
        {topLifeEvents?.[0] && (
          <p className="mt-1 text-[11px] font-medium text-[var(--ink-2)] truncate">
            Volgende: {topLifeEvents[0].name}
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Half-size (2col × 1row = 160px landscape) ────
  if (size === 'half') {
    const events = topLifeEvents?.slice(0, 3) ?? []
    return (
      <WidgetShell module="horizon" size={size} kicker="Levensgebeurtenissen" href={href}>
        {events.length > 0 ? (
          <div className="relative pl-4">
            {/* Vertical connecting line */}
            <div className="absolute left-[5px] top-1 bottom-1 w-px bg-horizon-300/50" />
            <div className="flex flex-col gap-1.5">
              {events.map((evt) => (
                <div key={evt.id} className="relative flex items-center gap-2">
                  {/* Timeline dot */}
                  <div className="absolute -left-4 top-1 h-2 w-2 rounded-full border-2 border-horizon-400 bg-[var(--paper)]" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {evt.year && (
                        <span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
                          {evt.year}
                        </span>
                      )}
                      <span className="text-[11px] font-medium text-[var(--ink-2)] truncate">
                        {evt.name}
                      </span>
                    </div>
                  </div>
                  <span className={`shrink-0 text-[11px] font-semibold ${evt.impactType === 'positive' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {evt.impactType === 'positive' ? '↑' : '↓'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--ink-3)]">Geen life events gepland</p>
        )}
        <p className="mt-1 text-[10px] text-[var(--ink-3)]">
          {lifeEvents} {lifeEvents === 1 ? 'life event' : 'life events'} totaal
        </p>
      </WidgetShell>
    )
  }

  // ── Full-size: complete timeline with impact euros + cumulative ────
  const allEvents = topLifeEvents?.slice(0, 5) ?? []
  const cumulativeImpact = allEvents.reduce((sum, evt) => {
    if (evt.estimatedImpact == null) return sum
    return sum + (evt.impactType === 'positive' ? evt.estimatedImpact : -evt.estimatedImpact)
  }, 0)

  return (
    <WidgetShell module="horizon" size={size} kicker="Levensgebeurtenissen" href={href}>
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="h-4 w-4 text-horizon-500 shrink-0" />
        <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {lifeEvents}
        </p>
        <p className="text-sm text-[var(--ink-3)]">
          {lifeEvents === 1 ? 'life event' : 'life events'} gepland
        </p>
      </div>

      {allEvents.length > 0 ? (
        <div className="relative pl-4">
          {/* Vertical connecting line */}
          <div className="absolute left-[5px] top-1 bottom-1 w-px bg-horizon-300/40" />
          <div className="flex flex-col gap-3">
            {allEvents.map((evt) => {
              const isPositive = evt.impactType === 'positive'
              return (
                <div key={evt.id} className="relative flex items-start gap-2">
                  {/* Colored timeline dot */}
                  <div className={`absolute -left-4 top-1 h-2.5 w-2.5 rounded-full border-2 ${isPositive ? 'border-emerald-500 bg-emerald-100' : 'border-red-400 bg-red-100'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {evt.year && (
                        <span className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                          {evt.year}
                        </span>
                      )}
                      <span className="text-xs font-medium text-[var(--ink-2)] truncate">
                        {evt.name}
                      </span>
                    </div>
                    {evt.estimatedImpact != null && evt.estimatedImpact > 0 && (
                      <p className={`mt-0.5 font-mono text-[11px] tabular-nums ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                        {isPositive ? '+' : '−'}{formatCurrency(evt.estimatedImpact)}
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                    {isPositive ? '↑' : '↓'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--ink-3)]">Geen life events gepland</p>
      )}

      {/* Cumulative impact summary */}
      {allEvents.length > 0 && cumulativeImpact !== 0 && (
        <div className="mt-3 pt-2 border-t border-[var(--border-ed)]">
          <p className="text-[11px] text-[var(--ink-3)]">Cumulatieve impact op FIRE</p>
          <p className={`font-mono text-sm font-semibold tabular-nums ${cumulativeImpact > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {cumulativeImpact > 0 ? '+' : '−'}{formatCurrency(Math.abs(cumulativeImpact))}
          </p>
        </div>
      )}
    </WidgetShell>
  )
}

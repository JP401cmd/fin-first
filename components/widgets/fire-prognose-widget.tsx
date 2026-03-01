import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { Compass } from 'lucide-react'
import type { DashboardData } from './widget-renderer'
import { NL_SWR } from '@/lib/horizon-data'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function FirePrognoseWidget({ size, data, href }: Props) {
  const { fireProjResult, freedomPct, fireAgeFractional, simFireCountdown } = data
  const cd = simFireCountdown ?? fireProjResult

  const isReached = cd.fireDate === 'Bereikt!'
  const isNotFeasible = cd.fireDate === 'Niet haalbaar'

  return (
    <WidgetShell module="horizon" size={size} kicker="FIRE Prognose" href={href}>
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-horizon-50">
          <Compass className="h-4 w-4 text-horizon-600" />
        </div>
        <div className="min-w-0">
          {isReached ? (
            <p className="font-mono text-xl font-semibold text-horizon-600">Bereikt! 🎉</p>
          ) : isNotFeasible ? (
            <>
              <p className="font-mono text-xl font-semibold text-[var(--ink)]">—</p>
              <p className="mt-1 text-xs text-[var(--ink-3)]">Verhoog je spaarcapaciteit</p>
            </>
          ) : (
            <>
              <p className="text-xs text-[var(--ink-3)] mb-0.5">Countdown naar vrijheid</p>
              <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
                {cd.countdownYears}j {cd.countdownMonths}m
              </p>
              {fireAgeFractional != null ? (
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                  Vrijheidsleeftijd: <span className="font-mono font-semibold text-horizon-600">{fireAgeFractional.toFixed(1)}</span> jaar
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">
                  Verwacht: {cd.fireDate}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Progress bar for full-size */}
      {size === 'full' && (
        <div className="mt-4">
          <div className="flex justify-between text-[10px] text-[var(--ink-3)] mb-1">
            <span>Voortgang FIRE</span>
            <span className="font-mono tabular-nums">{freedomPct.toFixed(1)}%</span>
          </div>
          <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600 transition-all duration-700"
              style={{ width: `${Math.min(freedomPct, 100)}%` }}
            />
          </div>
          <p className="mt-3 font-serif italic text-[12px] text-[var(--ink-3)]">
            Gebaseerd op NL FIRE-model ({(NL_SWR * 100).toFixed(2)}% opnameregel) — klik voor details
          </p>
        </div>
      )}
    </WidgetShell>
  )
}

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

  // ── Quarter-size: compact countdown + FIRE leeftijd ─────────
  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker="FIRE Prognose" href={href}>
        <div>
          {isReached ? (
            <>
              <div className="flex items-center gap-1.5">
                <Compass className="h-4 w-4 text-horizon-600" />
                <p className="font-mono text-lg font-semibold text-horizon-600">Bereikt! 🎉</p>
              </div>
            </>
          ) : isNotFeasible ? (
            <>
              <div className="flex items-center gap-1.5">
                <Compass className="h-4 w-4 text-[var(--ink-3)]" />
                <p className="font-mono text-lg font-semibold text-[var(--ink-3)]">—</p>
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--ink-4)]">Niet haalbaar</p>
            </>
          ) : (
            <>
              <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
                {cd.countdownYears}j {cd.countdownMonths}m
              </p>
              {fireAgeFractional != null && (
                <p className="mt-0.5 text-xs text-horizon-600">
                  Leeftijd {fireAgeFractional.toFixed(1)}
                </p>
              )}
            </>
          )}
        </div>
      </WidgetShell>
    )
  }

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

      {/* Mini vermogenspad for full-size */}
      {size === 'full' && data.simRows && data.simRows.length > 1 && (() => {
        const rows = data.simRows!
        const accRows = rows.filter(r => r.phase === 'accumulation')
        if (accRows.length < 2) return null
        const W = 240
        const H = 60
        const pad = 4
        const maxVal = Math.max(...accRows.map(r => r.endPortfolio), 1)
        const minAge = accRows[0].age
        const maxAge = accRows[accRows.length - 1].age
        const ageSpan = maxAge - minAge || 1
        const toX = (age: number) => pad + ((age - minAge) / ageSpan) * (W - pad * 2)
        const toY = (val: number) => H - pad - (Math.max(val, 0) / maxVal) * (H - pad * 2)
        const pathD = accRows.map((r, i) => `${i === 0 ? 'M' : 'L'}${toX(r.age).toFixed(1)},${toY(r.endPortfolio).toFixed(1)}`).join(' ')
        const areaD = pathD + ` L${toX(maxAge).toFixed(1)},${(H - pad).toFixed(1)} L${toX(minAge).toFixed(1)},${(H - pad).toFixed(1)} Z`
        const fireX = fireAgeFractional != null ? toX(fireAgeFractional) : null
        const fireY = fireAgeFractional != null ? toY(accRows.at(-1)?.endPortfolio ?? 0) : null

        return (
          <div className="mt-4">
            <svg
              width="100%"
              viewBox={`0 0 ${W} ${H}`}
              className="overflow-visible"
              aria-label="Mini vermogenspad"
            >
              <defs>
                <linearGradient id="fire-mini-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--horizon-500, #c4a06b)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--horizon-500, #c4a06b)" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {/* Area fill */}
              <path d={areaD} fill="url(#fire-mini-grad)" />
              {/* Line */}
              <path
                d={pathD}
                fill="none"
                stroke="var(--horizon-500, #c4a06b)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* FIRE punt */}
              {fireX != null && fireY != null && (
                <circle
                  cx={fireX}
                  cy={fireY}
                  r="3"
                  fill="var(--horizon-600, #a07840)"
                />
              )}
            </svg>
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-[10px] text-[var(--ink-4)] font-mono">{minAge}j</p>
              {fireAgeFractional != null && (
                <p className="text-[10px] text-horizon-600 font-mono font-semibold">
                  FIRE {fireAgeFractional.toFixed(1)}j
                </p>
              )}
              <p className="text-[10px] text-[var(--ink-4)] font-mono">{maxAge}j</p>
            </div>
          </div>
        )
      })()}

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

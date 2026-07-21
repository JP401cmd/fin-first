import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { WEERBAARHEID_STERK, WEERBAARHEID_MATIG, WEERBAARHEID_SCHILD } from '@/lib/constants'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const BacktestingScoreWidget = memo(function BacktestingScoreWidget({ size, data, href }: Props) {
  const { backtestSuccessRate, backtestNamedPaths } = data

  if (backtestSuccessRate == null) {
    return (
      <WidgetShell module="horizon" size={size} kicker="Historische Weerbaarheid" href={href}>
        <p className="text-xs text-[var(--ink-3)]">Onvoldoende data voor backtesting</p>
      </WidgetShell>
    )
  }

  // Stoplicht-tint (semantisch, geen module-accent): weerbaar → aandacht → kwetsbaar.
  const successColor =
    backtestSuccessRate >= WEERBAARHEID_STERK ? 'text-positive' :
    backtestSuccessRate >= WEERBAARHEID_MATIG ? 'text-warning' : 'text-negative'

  const isVeilig = backtestSuccessRate >= WEERBAARHEID_SCHILD
  const shieldLabel = isVeilig ? 'Historisch weerbaar' : 'Historisch kwetsbaar'

  // ── Mini-size: success percentage with color code ────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="horizon" size="mini" kicker="Historische Weerbaarheid" href={href}>
        <p className={`font-mono text-[15px] font-semibold tabular-nums leading-none truncate ${successColor}`}>
          {backtestSuccessRate}%
        </p>
      </WidgetShell>
    )
  }

  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker="Historische Weerbaarheid" href={href}>
        <div className="mt-1 flex items-center gap-2">
          {isVeilig
            ? <ShieldCheck className="h-3.5 w-3.5 text-positive shrink-0" aria-label={shieldLabel} role="img" />
            : <ShieldAlert className="h-3.5 w-3.5 text-negative shrink-0" aria-label={shieldLabel} role="img" />
          }
          <span className={`font-mono text-lg font-semibold tabular-nums leading-none ${successColor}`}>
            {backtestSuccessRate}%
          </span>
        </div>
        <p className="text-[10px] text-[var(--ink-3)] mt-0.5">historisch</p>
      </WidgetShell>
    )
  }

  const successes = backtestNamedPaths?.filter(p => p.success).length ?? 0
  const total = backtestNamedPaths?.length ?? 0

  return (
    <WidgetShell module="horizon" size={size} kicker="Historische Weerbaarheid" href={href}>
      <div className="flex items-center gap-2">
        {isVeilig
          ? <ShieldCheck className={`${size === 'half' ? 'h-4 w-4' : 'h-5 w-5'} text-positive shrink-0`} aria-label={shieldLabel} role="img" />
          : <ShieldAlert className={`${size === 'half' ? 'h-4 w-4' : 'h-5 w-5'} text-negative shrink-0`} aria-label={shieldLabel} role="img" />
        }
        <div>
          <p className={`font-mono ${size === 'half' ? 'text-xl' : 'text-2xl'} font-semibold tabular-nums leading-none ${successColor}`}>
            {backtestSuccessRate}%
          </p>
          <p className="text-[10px] text-[var(--ink-3)] mt-0.5">historische succeskans</p>
        </div>
      </div>

      {backtestNamedPaths && backtestNamedPaths.length > 0 && (
        <div className={`${size === 'half' ? 'mt-1.5' : 'mt-3'} flex flex-wrap gap-1`}>
          {/* Half heeft weinig hoogte → cap op 4 badges tegen 2-regelige wrap; full toont alles. */}
          {(size === 'half' ? backtestNamedPaths.slice(0, 4) : backtestNamedPaths).map(p => (
            <span
              key={p.label}
              className={`inline-flex items-center gap-0.5 rounded-[var(--r-sm)] border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide
                ${p.success
                  ? 'border-positive/40 bg-positive/10 text-positive'
                  : 'border-negative/40 bg-negative/10 text-negative'
                }`}
            >
              {p.success ? '✓' : '✗'} {p.label}
            </span>
          ))}
        </div>
      )}

      {size === 'full' && (
        <>
          {/* Vergelijking: jouw succeskans t.o.v. het doel-niveau (WEERBAARHEID_STERK) waarop
              een plan historisch als weerbaar geldt. Geen verzonnen benchmark meer. */}
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="w-14 shrink-0 text-[var(--ink-3)]">Jouw plan</span>
              <div className="flex-1 h-2 rounded-full bg-[var(--subtle)] overflow-hidden">
                <div className={`h-full rounded-full ${backtestSuccessRate >= WEERBAARHEID_STERK ? 'bg-positive' : backtestSuccessRate >= WEERBAARHEID_MATIG ? 'bg-warning' : 'bg-negative'}`} style={{ width: `${backtestSuccessRate}%` }} />
              </div>
              <span className="font-mono tabular-nums w-8 text-right">{backtestSuccessRate}%</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="w-14 shrink-0 text-[var(--ink-3)]">Doel</span>
              <div className="flex-1 h-2 rounded-full bg-[var(--subtle)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--border-md)]" style={{ width: `${WEERBAARHEID_STERK}%` }} />
              </div>
              <span className="font-mono tabular-nums w-8 text-right text-[var(--ink-4)]">{WEERBAARHEID_STERK}%</span>
            </div>
          </div>

          {total > 0 && (
            <p className="mt-1.5 font-serif italic text-[11px] text-[var(--ink-3)]">
              {successes} van {total} historische crises overleefd
            </p>
          )}
        </>
      )}
    </WidgetShell>
  )
})

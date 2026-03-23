import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { ShieldCheck, ShieldAlert } from 'lucide-react'

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

  const successColor =
    backtestSuccessRate >= 85 ? 'text-emerald-600' :
    backtestSuccessRate >= 65 ? 'text-horizon-600' : 'text-red-600'

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
          {backtestSuccessRate >= 75
            ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            : <ShieldAlert className="h-3.5 w-3.5 text-red-400 shrink-0" />
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
        {backtestSuccessRate >= 75
          ? <ShieldCheck className={`${size === 'half' ? 'h-4 w-4' : 'h-5 w-5'} text-emerald-500 shrink-0`} />
          : <ShieldAlert className={`${size === 'half' ? 'h-4 w-4' : 'h-5 w-5'} text-red-400 shrink-0`} />
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
          {backtestNamedPaths.map(p => (
            <span
              key={p.label}
              className={`inline-flex items-center gap-0.5 rounded-[var(--r-sm)] border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide
                ${p.success
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
                }`}
            >
              {p.success ? '✓' : '✗'} {p.label}
            </span>
          ))}
        </div>
      )}

      {size === 'full' && (
        <>
          {/* Benchmark comparison bars */}
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="w-14 shrink-0 text-[var(--ink-3)]">Jouw plan</span>
              <div className="flex-1 h-2 rounded-full bg-[var(--subtle)] overflow-hidden">
                <div className={`h-full rounded-full ${backtestSuccessRate >= 85 ? 'bg-emerald-400' : backtestSuccessRate >= 65 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${backtestSuccessRate}%` }} />
              </div>
              <span className="font-mono tabular-nums w-8 text-right">{backtestSuccessRate}%</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="w-14 shrink-0 text-[var(--ink-3)]">Benchmark</span>
              <div className="flex-1 h-2 rounded-full bg-[var(--subtle)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--border-md)]" style={{ width: '85%' }} />
              </div>
              <span className="font-mono tabular-nums w-8 text-right text-[var(--ink-4)]">85%</span>
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

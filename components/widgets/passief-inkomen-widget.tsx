import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function PassiefInkomenWidget({ size, data, href }: Props) {
  const { fireProjResult, monthlyExpenses } = data

  const current = fireProjResult.monthlyPassiveIncome ?? 0
  const target = monthlyExpenses > 0 ? monthlyExpenses : fireProjResult.fireTarget / 12
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0
  const remaining = Math.max(target - current, 0)

  // Freedom framing: how many days per month does passive income cover?
  const dailyExp = monthlyExpenses > 0 ? monthlyExpenses / 30 : target / 30
  const freedomDays = dailyExp > 0 ? current / dailyExp : 0

  // ── Mini-size: passive income amount ──────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="horizon" size="mini" kicker="Passief Inkomen" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {formatCurrency(current)}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size: compact bedrag + /mnd + percentage ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker="Passief Inkomen" href={href}>
        <div className="flex items-baseline gap-1">
          <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
            {formatCurrency(current)}
          </p>
          <span className="text-[10px] text-[var(--ink-3)]">/mnd</span>
        </div>
        <p className="mt-1 text-[10px] text-[var(--ink-3)] font-mono tabular-nums">
          {pct.toFixed(0)}% van FIRE doel
        </p>
      </WidgetShell>
    )
  }

  // ── Full-size: bedrag + doel + progress bar + nog nodig + freedom framing + groei ──
  if (size === 'full') {
    const freedomTime = dailyExp > 0 && current > 0
      ? calculateFreedomTime(current, dailyExp)
      : null
    const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

    return (
      <WidgetShell module="horizon" size={size} kicker="Passief Inkomen" href={href}>
        <div className="flex items-start justify-between gap-4">
          {/* Left: bedrag + doel */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
                {formatCurrency(current)}
              </p>
              <span className="text-xs text-[var(--ink-3)]">/mnd</span>
            </div>

            <p className="mt-1 text-xs text-[var(--ink-3)]">
              van {formatCurrency(target)} nodig voor FIRE
            </p>
          </div>

          {/* Right: percentage badge */}
          <div className="flex-shrink-0 flex flex-col items-end">
            <span className={`font-mono text-xl font-semibold tabular-nums ${pct >= 100 ? 'text-emerald-600' : 'text-[var(--ink)]'}`}>
              {pct.toFixed(1)}%
            </span>
            <span className="text-[10px] text-[var(--ink-3)]">van doel</span>
          </div>
        </div>

        {/* Progress bar with horizon gradient */}
        <div className="mt-3">
          <div className="h-[6px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600 transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Nog nodig voor FIRE */}
        {remaining > 0 && (
          <p className="mt-3 text-sm text-[var(--ink-2)]">
            Nog <span className="font-mono font-semibold tabular-nums">{formatCurrency(remaining)}</span>/mnd nodig voor FIRE
          </p>
        )}
        {remaining === 0 && current > 0 && (
          <p className="mt-3 text-sm text-emerald-600 font-medium">
            FIRE-doel bereikt!
          </p>
        )}

        {/* Freedom framing */}
        <p className="mt-1.5 font-serif italic text-[12px] text-[var(--ink-3)]">
          Huidig passief inkomen dekt {freedomDays.toFixed(1)} dagen per maand
        </p>

        {/* Breakdown: inkomen vs uitgaven */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-md bg-[var(--subtle)] p-2">
            <p className="text-[10px] text-[var(--ink-4)] uppercase tracking-wide">Passief inkomen</p>
            <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">{formatCurrency(current)}</p>
          </div>
          <div className="rounded-md bg-[var(--subtle)] p-2">
            <p className="text-[10px] text-[var(--ink-4)] uppercase tracking-wide">FIRE-doel</p>
            <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">{formatCurrency(target)}</p>
          </div>
        </div>

        {freedomStr && (
          <p className="mt-2 text-[11px] text-[var(--ink-3)]">
            = {freedomStr} vrijheid per maand
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Half-size (2col × 1row = 160px landscape) ──
  return (
    <WidgetShell module="horizon" size={size} kicker="Passief Inkomen" href={href}>
      <div className="flex items-baseline gap-1.5">
        <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
          {formatCurrency(current)}
        </p>
        <span className="text-[10px] text-[var(--ink-3)]">/mnd</span>
        <span className="text-[10px] text-[var(--ink-3)] ml-auto font-mono tabular-nums">{pct.toFixed(1)}%</span>
      </div>

      <div className="mt-1.5">
        <div className="h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-horizon-400 to-horizon-600 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <p className="mt-1 text-[11px] text-[var(--ink-3)]">
        van {formatCurrency(target)} nodig voor FIRE
      </p>
    </WidgetShell>
  )
}

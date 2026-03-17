import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { DashboardData } from './widget-renderer'
import { PiggyBank } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const SpaarquoteWidget = memo(function SpaarquoteWidget({ size, data, href }: Props) {
  const { monthlyIncome, monthlyExpenses, monthlySavingsBudgetSpent } = data
  const savings = monthlyIncome - monthlyExpenses + monthlySavingsBudgetSpent
  const rate = data.savingsRate6m
  const isPositive = rate >= 0

  if (monthlyIncome === 0 && rate === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker="Spaarquote" href={href}>
        <WidgetEmpty icon={PiggyBank} message="Stel budgetten in om je spaarquote te berekenen." />
      </WidgetShell>
    )
  }

  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Spaarquote" href={href}>
        <>
          <p className={`font-mono text-[15px] font-semibold tabular-nums leading-none truncate ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
            {rate.toFixed(1)}%
          </p>
          <div className="mt-0.5 h-[2px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div className={`h-full rounded-full ${isPositive ? 'bg-emerald-500' : 'bg-red-400'}`} style={{ width: `${Math.min(Math.abs(rate), 100)}%` }} />
          </div>
        </>
      </WidgetShell>
    )
  }

  // ── Quarter-size: groot percentage + kleur + mini progress bar ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Spaarquote" href={href}>
        <p className={`font-mono text-lg font-semibold tabular-nums ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
          {rate.toFixed(1)}%
        </p>
        <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div
            className={`h-full rounded-full ${isPositive ? 'bg-emerald-500' : 'bg-red-400'}`}
            style={{ width: `${Math.min(Math.abs(rate), 100)}%` }}
          />
        </div>
      </WidgetShell>
    )
  }

  const dailyExp = monthlyExpenses / 30
  const freedomTime = dailyExp > 0 && savings > 0
    ? calculateFreedomTime(savings, dailyExp)
    : null
  const freedomStr = freedomTime ? formatFreedomTimeString(freedomTime, 'short') : null

  // ── Vorige maand vergelijking ──
  const { prevMonthIncome, prevMonthExpenses, prevMonthSavingsBudgetSpent } = data
  const prevSavings = prevMonthIncome - prevMonthExpenses + prevMonthSavingsBudgetSpent
  const prevRate = prevMonthIncome > 0 ? (prevSavings / prevMonthIncome) * 100 : 0
  const delta = rate - prevRate
  const hasPrevData = prevMonthIncome > 0

  // ── Full-size: sparkline + averages + FIRE benchmark ──
  if (size === 'full') {
    // Derive estimated savings rates from net worth deltas
    const history = data.netWorthHistory ?? []
    const estimatedRates: number[] = []
    for (let i = 1; i < history.length; i++) {
      const monthDelta = history[i].value - history[i - 1].value
      // Estimate rate as delta / income (use current income as proxy)
      const estRate = monthlyIncome > 0 ? (monthDelta / monthlyIncome) * 100 : 0
      estimatedRates.push(Math.max(-100, Math.min(100, estRate)))
    }
    // Append current rate
    estimatedRates.push(rate)

    // Take last 6 months for sparkline
    const sparkData = estimatedRates.slice(-6)
    const avg3m = estimatedRates.length >= 3
      ? estimatedRates.slice(-3).reduce((a, b) => a + b, 0) / 3
      : null
    const avg6m = estimatedRates.length >= 6
      ? estimatedRates.slice(-6).reduce((a, b) => a + b, 0) / 6
      : null

    // FIRE-optimaal benchmark
    const fireBenchmark = 50

    // Sparkline SVG
    const svgW = 200
    const svgH = 48
    const minVal = Math.min(...sparkData, 0)
    const maxVal = Math.max(...sparkData, fireBenchmark, 10)
    const range = maxVal - minVal || 1
    const points = sparkData.map((v, i) => {
      const x = sparkData.length > 1 ? (i / (sparkData.length - 1)) * svgW : svgW / 2
      const y = svgH - ((v - minVal) / range) * svgH
      return `${x},${y}`
    }).join(' ')
    const benchmarkY = svgH - ((fireBenchmark - minVal) / range) * svgH

    return (
      <WidgetShell module="kern" size={size} kicker="Spaarquote" href={href}>
        {/* Percentage + bar + bedrag (stacked vertically for 2-col full) */}
        <div>
          <p className={`font-mono text-2xl font-semibold tabular-nums ${isPositive ? 'text-[var(--ink)]' : 'text-red-600'}`}>
            {rate.toFixed(1)}%
          </p>

          <div className="mt-2 h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
            <div
              className={`h-full rounded-full transition-all ${isPositive ? 'bg-emerald-500' : 'bg-red-400'}`}
              style={{ width: `${Math.min(Math.abs(rate), 100)}%` }}
            />
          </div>

          <p className="mt-2 text-xs text-[var(--ink-3)]">
            {formatCurrency(Math.max(savings, 0))} gespaard per maand
          </p>

          {hasPrevData && (
            <p className={`mt-1 text-xs font-mono tabular-nums ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% t.o.v. vorige maand
            </p>
          )}

          {freedomStr && (
            <p className="mt-0.5 font-serif italic text-[12px] text-[var(--ink-3)]">
              +{freedomStr} vrijheid per maand
            </p>
          )}
        </div>

        {/* Sparkline — full width below content */}
        {sparkData.length >= 2 && (
          <div className="mt-3">
            <svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="none" className="overflow-visible">
              {/* FIRE benchmark lijn */}
              <line
                x1={0} y1={benchmarkY} x2={svgW} y2={benchmarkY}
                stroke="var(--ink-4)" strokeWidth={1} strokeDasharray="4 3" opacity={0.5}
              />
              <text x={svgW} y={benchmarkY - 3} textAnchor="end" className="fill-[var(--ink-4)]" fontSize={9}>
                50%
              </text>
              {/* Trend lijn */}
              <polyline
                points={points}
                fill="none"
                stroke={isPositive ? '#10b981' : '#ef4444'}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Data punten */}
              {sparkData.map((v, i) => {
                const x = sparkData.length > 1 ? (i / (sparkData.length - 1)) * svgW : svgW / 2
                const y = svgH - ((v - minVal) / range) * svgH
                return (
                  <circle
                    key={i}
                    cx={x} cy={y} r={2.5}
                    fill={v >= 0 ? '#10b981' : '#ef4444'}
                  />
                )
              })}
            </svg>
          </div>
        )}

        {/* Gemiddelden + benchmark */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--ink-3)] font-mono tabular-nums">
          {avg3m !== null && (
            <span>3m gem: {avg3m.toFixed(1)}%</span>
          )}
          {avg6m !== null && (
            <span>· 6m gem: {avg6m.toFixed(1)}%</span>
          )}
          <span className="text-[var(--ink-4)]">· FIRE-optimaal: {fireBenchmark}%+</span>
        </div>
      </WidgetShell>
    )
  }

  // ── Half-size: percentage + bar + bedrag + vergelijking + freedom ──
  return (
    <WidgetShell module="kern" size={size} kicker="Spaarquote" href={href}>
      <p className={`font-mono text-2xl font-semibold tabular-nums ${isPositive ? 'text-[var(--ink)]' : 'text-red-600'}`}>
        {rate.toFixed(1)}%
      </p>

      {/* Mini bar */}
      <div className="mt-2 h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
        <div
          className={`h-full rounded-full transition-all ${isPositive ? 'bg-emerald-500' : 'bg-red-400'}`}
          style={{ width: `${Math.min(Math.abs(rate), 100)}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-[var(--ink-3)]">
        {formatCurrency(Math.max(savings, 0))} gespaard per maand
      </p>

      {/* Vorige maand vergelijking */}
      {hasPrevData && (
        <p className={`mt-1 text-xs font-mono tabular-nums ${delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% t.o.v. vorige maand
        </p>
      )}

      {freedomStr && (
        <p className="mt-0.5 font-serif italic text-[12px] text-[var(--ink-3)]">
          +{freedomStr} vrijheid per maand
        </p>
      )}
    </WidgetShell>
  )
})

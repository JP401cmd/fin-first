'use client'

import { useMemo } from 'react'
import { BarChart3 } from 'lucide-react'
import { buildMonthlyFreedomData, type MonthlyFreedomData } from '@/lib/freedom-days-trend'

// Re-export for consumers that import from component file
export { buildMonthlyFreedomData, type MonthlyFreedomData }

interface FreedomDaysMonthlyTrendProps {
  /** Completed actions with freedom_days_impact and completed_at */
  completedActions: {
    freedom_days_impact: number
    completed_at: string | null
  }[]
}

/**
 * Bar chart showing 12-month freedom days trend with summary stats.
 * Used on De Wil overview page.
 */
export function FreedomDaysMonthlyTrend({ completedActions }: FreedomDaysMonthlyTrendProps) {
  const monthlyData = useMemo(
    () => buildMonthlyFreedomData(completedActions),
    [completedActions]
  )

  const stats = useMemo(() => {
    const currentMonth = monthlyData[monthlyData.length - 1]
    const monthsWithData = monthlyData.filter(m => m.days > 0)
    const avg = monthsWithData.length > 0
      ? monthsWithData.reduce((sum, m) => sum + m.days, 0) / monthsWithData.length
      : 0
    const best = monthlyData.reduce((max, m) => Math.max(max, m.days), 0)

    return {
      current: currentMonth?.days ?? 0,
      average: Math.round(avg * 10) / 10,
      best: Math.round(best * 10) / 10,
    }
  }, [monthlyData])

  const maxDays = Math.max(...monthlyData.map(m => m.days), 1)
  const hasAnyData = monthlyData.some(m => m.days > 0)

  // SVG dimensions
  const W = 600
  const H = 180
  const padLeft = 45
  const padRight = 10
  const padTop = 10
  const padBottom = 30
  const chartW = W - padLeft - padRight
  const chartH = H - padTop - padBottom
  const barGap = 4
  const barW = (chartW - barGap * (monthlyData.length - 1)) / monthlyData.length

  // Y-axis gridlines
  const yTicks = hasAnyData ? generateTicks(maxDays) : [0, 1, 2]
  const yMax = hasAnyData ? Math.max(...yTicks) : 2

  return (
    <div data-testid="freedom-days-monthly-trend">
      {/* Summary stats */}
      <div
        className="mb-4 flex flex-wrap gap-3 text-sm"
        data-testid="freedom-days-trend-summary"
      >
        <span className="rounded-full bg-wil-50 px-3 py-1 font-medium text-wil-700" data-testid="trend-summary-current">
          Deze maand: +{formatDays(stats.current)} dagen
        </span>
        <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-[var(--ink-2)]" data-testid="trend-summary-average">
          Gemiddeld: +{formatDays(stats.average)} dagen
        </span>
        <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-[var(--ink-2)]" data-testid="trend-summary-best">
          Beste maand: +{formatDays(stats.best)} dagen
        </span>
      </div>

      {/* Bar chart */}
      {hasAnyData ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ maxHeight: H }}
          data-testid="freedom-days-bar-chart"
        >
          {/* Y-axis gridlines */}
          {yTicks.map((tick) => {
            const y = padTop + chartH - (tick / yMax) * chartH
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={W - padRight}
                  y2={y}
                  stroke="#e4e4e7"
                  strokeWidth={1}
                  strokeDasharray={tick === 0 ? undefined : '4 2'}
                />
                <text
                  x={padLeft - 6}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-zinc-400"
                  style={{ fontSize: 10 }}
                >
                  {tick % 1 === 0 ? tick : tick.toFixed(1)}
                </text>
              </g>
            )
          })}

          {/* Bars */}
          {monthlyData.map((m, i) => {
            const x = padLeft + i * (barW + barGap)
            const barHeight = m.days > 0 ? Math.max((m.days / yMax) * chartH, 2) : 0
            const y = padTop + chartH - barHeight
            const isCurrentMonth = i === monthlyData.length - 1
            const isBestMonth = m.days === stats.best && m.days > 0

            return (
              <g key={m.month} data-testid={`trend-bar-${m.month}`}>
                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barHeight}
                  rx={2}
                  fill={isCurrentMonth ? '#0d9488' : isBestMonth ? '#14b8a6' : '#5eead4'}
                  opacity={m.days > 0 ? 0.85 : 0}
                />

                {/* Value label on top of bar */}
                {m.days > 0 && (
                  <text
                    x={x + barW / 2}
                    y={y - 4}
                    textAnchor="middle"
                    className="fill-wil-700"
                    style={{ fontSize: 9, fontWeight: 600 }}
                  >
                    +{formatDays(m.days)}
                  </text>
                )}

                {/* Month label */}
                <text
                  x={x + barW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-zinc-400"
                  style={{ fontSize: 10, fontWeight: isCurrentMonth ? 600 : 400 }}
                >
                  {m.label}
                </text>
              </g>
            )
          })}

          {/* Y-axis label */}
          <text
            x={10}
            y={padTop + chartH / 2}
            textAnchor="middle"
            className="fill-zinc-400"
            style={{ fontSize: 9 }}
            transform={`rotate(-90, 10, ${padTop + chartH / 2})`}
          >
            dagen
          </text>
        </svg>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border-md)] bg-[var(--subtle)] py-10" data-testid="freedom-days-no-data">
          <BarChart3 className="mb-2 h-8 w-8 text-[var(--ink-4)]" />
          <p className="text-sm text-[var(--ink-3)]">
            Nog geen voltooide acties met vrijheidsdagen.
          </p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Rond acties af om je trend te zien.
          </p>
        </div>
      )}
    </div>
  )
}

/** Format days value for display: show 1 decimal only if needed */
function formatDays(days: number): string {
  if (days === 0) return '0'
  return days % 1 === 0 ? String(days) : days.toFixed(1)
}

/** Generate nice y-axis ticks for a given max value */
function generateTicks(max: number): number[] {
  if (max <= 0) return [0]
  if (max <= 2) return [0, 1, 2]
  if (max <= 5) return [0, 1, 2, 3, 4, 5]
  if (max <= 10) return [0, 2, 4, 6, 8, 10]
  if (max <= 20) return [0, 5, 10, 15, 20]
  if (max <= 50) return [0, 10, 20, 30, 40, 50]
  // For larger values, use round intervals
  const step = Math.ceil(max / 5)
  const ticks: number[] = []
  for (let i = 0; i <= max + step; i += step) {
    ticks.push(i)
    if (i >= max) break
  }
  return ticks
}

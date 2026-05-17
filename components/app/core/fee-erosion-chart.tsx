'use client'

import { memo, useMemo } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatCurrency } from '@/lib/format'
import { TrendingDown } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────

export interface FeeErosionChartProps {
  /** Current portfolio value in EUR */
  portfolioValue: number
  /** Gross annual return (decimal, e.g. 0.07 = 7%) */
  grossReturn: number
  /** Current weighted TER (decimal, e.g. 0.0045 = 0.45%) */
  currentTER: number
  /** Low-cost alternative TER (decimal, e.g. 0.002 = 0.20%) — defaults to 0.002 */
  lowTER?: number
  /** Projection horizon in years — defaults to 30 */
  years?: number
  /** Annual contribution in EUR — defaults to 0 */
  annualContribution?: number
  /** Daily expense rate for freedom-time calculation (optional) */
  dailyExpenses?: number
}

// ── Helpers ────────────────────────────────────────────────────

interface ProjectionPoint {
  year: number
  value: number
}

/**
 * Project portfolio growth with annual fees subtracted from returns.
 * Growth = grossReturn - ter (net return after fees).
 */
function projectGrowth(
  startValue: number,
  grossReturn: number,
  ter: number,
  years: number,
  annualContribution: number,
): ProjectionPoint[] {
  const points: ProjectionPoint[] = [{ year: 0, value: startValue }]
  let value = startValue
  const netReturn = grossReturn - ter

  for (let y = 1; y <= years; y++) {
    value = value * (1 + netReturn) + annualContribution
    points.push({ year: y, value: Math.max(0, value) })
  }
  return points
}

function formatEurShort(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (value >= 1_000) return `€${Math.round(value / 1_000)}k`
  return formatCurrency(value)
}

function formatFreedomDiff(eurDiff: number, dailyExpenses: number): string {
  if (dailyExpenses <= 0) return ''
  const totalDays = eurDiff / dailyExpenses
  const years = Math.floor(totalDays / 365)
  const months = Math.floor((totalDays - years * 365) / 30)
  const parts: string[] = []
  if (years > 0) parts.push(`${years} jaar`)
  if (months > 0) parts.push(`${months} maand${months > 1 ? 'en' : ''}`)
  if (parts.length === 0) {
    const days = Math.round(totalDays)
    if (days > 0) parts.push(`${days} dag${days > 1 ? 'en' : ''}`)
  }
  return parts.join(' en ')
}

// ── Chart Component ────────────────────────────────────────────

export const FeeErosionChart = memo(function FeeErosionChart({
  portfolioValue,
  grossReturn,
  currentTER,
  lowTER = 0.002,
  years = 30,
  annualContribution = 0,
  dailyExpenses,
}: FeeErosionChartProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 900 })

  const { highCostPoints, lowCostPoints, maxValue, difference, differenceFormatted, freedomTimeStr } = useMemo(() => {
    const high = projectGrowth(portfolioValue, grossReturn, currentTER, years, annualContribution)
    const low = projectGrowth(portfolioValue, grossReturn, lowTER, years, annualContribution)

    const allValues = [...high.map(p => p.value), ...low.map(p => p.value)]
    const maxVal = Math.max(...allValues, portfolioValue * 1.1)

    const diff = low[low.length - 1].value - high[high.length - 1].value
    const diffFmt = formatEurShort(diff)

    let freedomStr = ''
    if (dailyExpenses && dailyExpenses > 0 && diff > 0) {
      freedomStr = formatFreedomDiff(diff, dailyExpenses)
    }

    return {
      highCostPoints: high,
      lowCostPoints: low,
      maxValue: maxVal,
      difference: diff,
      differenceFormatted: diffFmt,
      freedomTimeStr: freedomStr,
    }
  }, [portfolioValue, grossReturn, currentTER, lowTER, years, annualContribution, dailyExpenses])

  if (portfolioValue <= 0 || currentTER <= 0) return null

  // Chart dimensions
  const w = 720
  const h = 300
  const pad = { top: 24, right: 100, bottom: 48, left: 64 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  function x(year: number) {
    return pad.left + (year / years) * chartW
  }
  function y(val: number) {
    return pad.top + chartH - (val / maxValue) * chartH
  }

  // Build SVG paths
  function buildPath(points: ProjectionPoint[]): string {
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.year).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(' ')
  }

  // Build fill area between the two lines (the "erosion" area)
  function buildDiffArea(): string {
    if (lowCostPoints.length === 0) return ''
    // Top line (low cost) left-to-right
    const top = lowCostPoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.year).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(' ')
    // Bottom line (high cost) right-to-left
    const bottom = [...highCostPoints]
      .reverse()
      .map((p) => `L ${x(p.year).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(' ')
    return `${top} ${bottom} Z`
  }

  // Y-axis ticks (4-5 ticks)
  const yTickCount = 5
  const yTicks = Array.from({ length: yTickCount }, (_, i) => Math.round((maxValue / (yTickCount - 1)) * i))

  // X-axis ticks
  const xTickStride = years <= 10 ? 2 : years <= 20 ? 5 : 10
  const xTicks: number[] = []
  for (let yr = xTickStride; yr < years; yr += xTickStride) xTicks.push(yr)
  xTicks.push(years)

  const currentTERpct = (currentTER * 100).toFixed(2).replace('.', ',')
  const lowTERpct = (lowTER * 100).toFixed(2).replace('.', ',')
  const endHighValue = highCostPoints[highCostPoints.length - 1].value
  const endLowValue = lowCostPoints[lowCostPoints.length - 1].value

  return (
    <div ref={ref} className="space-y-3">
      {/* Title */}
      <div className="flex items-center gap-2 mb-1">
        <TrendingDown className="h-4 w-4 text-negative" />
        <h3 className="text-sm font-semibold text-[var(--ink)]">
          Fee-erosie over {years} jaar
        </h3>
      </div>

      {/* Chart */}
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Fee-erosie grafiek: verschil van ${differenceFormatted} over ${years} jaar`}
      >
        <defs>
          {/* Gradient for erosion area */}
          <linearGradient id="fee-erosion-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.03" />
          </linearGradient>
          {/* Low cost line gradient */}
          <linearGradient id="fee-low-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          {/* High cost line gradient */}
          <linearGradient id="fee-high-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((val) => (
          <line
            key={`y-${val}`}
            x1={pad.left}
            y1={y(val)}
            x2={w - pad.right}
            y2={y(val)}
            stroke="var(--border-ed)"
            strokeWidth="0.5"
            strokeDasharray="3,3"
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((val) => (
          <text
            key={`yl-${val}`}
            x={pad.left - 8}
            y={y(val) + 3}
            textAnchor="end"
            className="fill-[var(--ink-4)]"
            fontSize="10"
            fontFamily="var(--font-mono)"
          >
            {formatEurShort(val)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((yr) => (
          <text
            key={`xl-${yr}`}
            x={x(yr)}
            y={h - pad.bottom + 20}
            textAnchor="middle"
            className="fill-[var(--ink-4)]"
            fontSize="10"
          >
            {yr}j
          </text>
        ))}

        {/* X-axis label */}
        <text
          x={pad.left + chartW / 2}
          y={h - 4}
          textAnchor="middle"
          className="fill-[var(--ink-3)]"
          fontSize="10"
        >
          Jaren
        </text>

        {/* Difference area (the dramatic erosion zone) */}
        <path
          d={buildDiffArea()}
          fill="url(#fee-erosion-fill)"
          style={{
            opacity: hasEntered ? 1 : 0,
            transition: 'opacity 600ms 300ms ease',
          }}
        />

        {/* High-cost line (current TER) */}
        <path
          d={buildPath(highCostPoints)}
          fill="none"
          stroke="url(#fee-high-line)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: hasEntered ? '0' : '2000',
            strokeDashoffset: hasEntered ? '0' : '2000',
            transition: 'stroke-dashoffset 1200ms ease',
          }}
          pathLength={1}
        />

        {/* Low-cost line (alternative TER) */}
        <path
          d={buildPath(lowCostPoints)}
          fill="none"
          stroke="url(#fee-low-line)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: hasEntered ? '0' : '2000',
            strokeDashoffset: hasEntered ? '0' : '2000',
            transition: 'stroke-dashoffset 1200ms 100ms ease',
          }}
          pathLength={1}
        />

        {/* End dots */}
        <circle
          cx={x(years)}
          cy={y(endHighValue)}
          r="4"
          fill="#d97706"
          style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 400ms 800ms ease' }}
        />
        <circle
          cx={x(years)}
          cy={y(endLowValue)}
          r="4"
          fill="#059669"
          style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 400ms 800ms ease' }}
        />

        {/* End value labels */}
        <text
          x={x(years) + 10}
          y={y(endLowValue) + 4}
          className="fill-[#059669]"
          fontSize="11"
          fontFamily="var(--font-mono)"
          fontWeight="600"
          style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 400ms 900ms ease' }}
        >
          {formatEurShort(endLowValue)}
        </text>
        <text
          x={x(years) + 10}
          y={y(endHighValue) + 4}
          className="fill-[#d97706]"
          fontSize="11"
          fontFamily="var(--font-mono)"
          fontWeight="600"
          style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 400ms 900ms ease' }}
        >
          {formatEurShort(endHighValue)}
        </text>

        {/* Difference annotation arrow + label (at midpoint) */}
        {difference > 0 && (
          <g style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 500ms 1000ms ease' }}>
            {/* Vertical dashed line at ~75% of the horizon */}
            <line
              x1={x(Math.round(years * 0.75))}
              y1={y(lowCostPoints[Math.round(years * 0.75)]?.value ?? endLowValue)}
              x2={x(Math.round(years * 0.75))}
              y2={y(highCostPoints[Math.round(years * 0.75)]?.value ?? endHighValue)}
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeDasharray="4,3"
            />
            {/* Difference label */}
            <text
              x={x(Math.round(years * 0.75)) - 6}
              y={(y(lowCostPoints[Math.round(years * 0.75)]?.value ?? endLowValue) + y(highCostPoints[Math.round(years * 0.75)]?.value ?? endHighValue)) / 2 + 4}
              textAnchor="end"
              fill="#ef4444"
              fontSize="10"
              fontFamily="var(--font-mono)"
              fontWeight="600"
            >
              {formatEurShort(
                (lowCostPoints[Math.round(years * 0.75)]?.value ?? endLowValue) -
                (highCostPoints[Math.round(years * 0.75)]?.value ?? endHighValue)
              )}
            </text>
          </g>
        )}

        {/* Start value */}
        <text
          x={pad.left - 8}
          y={y(portfolioValue) - 6}
          textAnchor="end"
          className="fill-[var(--ink-3)]"
          fontSize="9"
        >
          Start
        </text>
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-sm bg-gradient-to-r from-[#10b981] to-[#059669]" />
          <span className="text-[var(--ink-2)]">Lage kosten ({lowTERpct}% TER)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-sm bg-gradient-to-r from-[#f59e0b] to-[#d97706]" />
          <span className="text-[var(--ink-2)]">Huidige kosten ({currentTERpct}% TER)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-sm bg-[#ef4444]/15 border border-[#ef4444]/30" />
          <span className="text-[var(--ink-2)]">Verschil (verloren rendement)</span>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="rounded-lg bg-[var(--subtle)] border border-[var(--border-ed)] p-4 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[var(--ink-2)]">Verloren vermogen door kosten</span>
          <span className="font-mono tabular-nums text-sm font-semibold text-negative">
            {differenceFormatted}
          </span>
        </div>
        {freedomTimeStr && (
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-[var(--ink-2)]">Verloren vrijheidstijd</span>
            <span className="font-mono tabular-nums text-sm font-semibold text-negative">
              {freedomTimeStr}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[var(--ink-3)]">Eindwaarde huidig ({currentTERpct}%)</span>
          <span className="font-mono tabular-nums text-xs text-[var(--ink-3)]">
            {formatEurShort(endHighValue)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[var(--ink-3)]">Eindwaarde laag ({lowTERpct}%)</span>
          <span className="font-mono tabular-nums text-xs text-[var(--ink-3)]">
            {formatEurShort(endLowValue)}
          </span>
        </div>
      </div>
    </div>
  )
})

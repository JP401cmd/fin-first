'use client'

import { memo, useMemo, useState, useEffect } from 'react'
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

// ── Progressive reveal phases ─────────────────────────────────
// Phase 0: nothing visible
// Phase 1: grid + axes fade in
// Phase 2: high-cost line draws (your current path)
// Phase 3: low-cost line draws (the alternative)
// Phase 4: erosion area fills in (the dramatic reveal)
// Phase 5: end values + difference annotation (the punchline)
// Phase 6: summary metrics + legend (the conclusion)

function useProgressiveReveal(hasEntered: boolean) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!hasEntered) return
    // Respect prefers-reduced-motion — skip to final phase
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase(6)
      return
    }

    const timers: ReturnType<typeof setTimeout>[] = []
    // Phase 1: grid + axes (immediate)
    timers.push(setTimeout(() => setPhase(1), 0))
    // Phase 2: high-cost line (400ms)
    timers.push(setTimeout(() => setPhase(2), 400))
    // Phase 3: low-cost line (1000ms)
    timers.push(setTimeout(() => setPhase(3), 1000))
    // Phase 4: erosion area (1500ms)
    timers.push(setTimeout(() => setPhase(4), 1500))
    // Phase 5: punchline values (2000ms)
    timers.push(setTimeout(() => setPhase(5), 2000))
    // Phase 6: summary + legend (2400ms)
    timers.push(setTimeout(() => setPhase(6), 2400))

    return () => timers.forEach(clearTimeout)
  }, [hasEntered])

  return phase
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
  const { ref, hasEntered } = useInViewAnimation({ duration: 2800 })
  const phase = useProgressiveReveal(hasEntered)

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
            <stop offset="0%" stopColor="var(--negative)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--negative)" stopOpacity="0.03" />
          </linearGradient>
          {/* Low cost line gradient */}
          <linearGradient id="fee-low-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--positive)" />
            <stop offset="100%" stopColor="var(--positive)" />
          </linearGradient>
          {/* High cost line gradient */}
          <linearGradient id="fee-high-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>

        {/* Phase 1: Grid lines */}
        <g
          style={{
            opacity: phase >= 1 ? 1 : 0,
            transition: 'opacity 400ms ease-out',
          }}
        >
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
        </g>

        {/* Phase 2: High-cost line (current TER) — your current path */}
        <path
          d={buildPath(highCostPoints)}
          fill="none"
          stroke="url(#fee-high-line)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: phase >= 2 ? 0 : 1,
            transition: 'stroke-dashoffset 800ms ease-out',
          }}
        />

        {/* Phase 3: Low-cost line (alternative TER) — the better path */}
        <path
          d={buildPath(lowCostPoints)}
          fill="none"
          stroke="url(#fee-low-line)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: phase >= 3 ? 0 : 1,
            transition: 'stroke-dashoffset 800ms ease-out',
          }}
        />

        {/* Phase 4: Difference area (the dramatic erosion zone) */}
        <path
          d={buildDiffArea()}
          fill="url(#fee-erosion-fill)"
          style={{
            opacity: phase >= 4 ? 1 : 0,
            transition: 'opacity 500ms ease-out',
          }}
        />

        {/* Phase 5: End dots */}
        <circle
          cx={x(years)}
          cy={y(endHighValue)}
          r="4"
          fill="#d97706"
          style={{
            opacity: phase >= 5 ? 1 : 0,
            transform: phase >= 5 ? 'scale(1)' : 'scale(0)',
            transformOrigin: `${x(years)}px ${y(endHighValue)}px`,
            transformBox: 'fill-box',
            transition: 'opacity 300ms ease-out, transform 300ms cubic-bezier(0.34,1.56,0.64,1)',
          }}
        />
        <circle
          cx={x(years)}
          cy={y(endLowValue)}
          r="4"
          fill="var(--positive)"
          style={{
            opacity: phase >= 5 ? 1 : 0,
            transform: phase >= 5 ? 'scale(1)' : 'scale(0)',
            transformOrigin: `${x(years)}px ${y(endLowValue)}px`,
            transformBox: 'fill-box',
            transition: 'opacity 300ms 100ms ease-out, transform 300ms 100ms cubic-bezier(0.34,1.56,0.64,1)',
          }}
        />

        {/* Phase 5: End value labels */}
        <text
          x={x(years) + 10}
          y={y(endLowValue) + 4}
          className="fill-[var(--positive)]"
          fontSize="11"
          fontFamily="var(--font-mono)"
          fontWeight="600"
          style={{
            opacity: phase >= 5 ? 1 : 0,
            transform: phase >= 5 ? 'translateX(0)' : 'translateX(-8px)',
            transition: 'opacity 400ms 100ms ease-out, transform 400ms 100ms ease-out',
          }}
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
          style={{
            opacity: phase >= 5 ? 1 : 0,
            transform: phase >= 5 ? 'translateX(0)' : 'translateX(-8px)',
            transition: 'opacity 400ms ease-out, transform 400ms ease-out',
          }}
        >
          {formatEurShort(endHighValue)}
        </text>

        {/* Phase 5: Difference annotation arrow + label (the punchline) */}
        {difference > 0 && (
          <g style={{
            opacity: phase >= 5 ? 1 : 0,
            transition: 'opacity 500ms 200ms ease-out',
          }}>
            {/* Vertical dashed line at ~75% of the horizon */}
            <line
              x1={x(Math.round(years * 0.75))}
              y1={y(lowCostPoints[Math.round(years * 0.75)]?.value ?? endLowValue)}
              x2={x(Math.round(years * 0.75))}
              y2={y(highCostPoints[Math.round(years * 0.75)]?.value ?? endHighValue)}
              stroke="var(--negative)"
              strokeWidth="1.5"
              strokeDasharray="4,3"
            />
            {/* Difference label */}
            <text
              x={x(Math.round(years * 0.75)) - 6}
              y={(y(lowCostPoints[Math.round(years * 0.75)]?.value ?? endLowValue) + y(highCostPoints[Math.round(years * 0.75)]?.value ?? endHighValue)) / 2 + 4}
              textAnchor="end"
              fill="var(--negative)"
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
      </svg>

      {/* Phase 6: Legend */}
      <div
        className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs"
        style={{
          opacity: phase >= 6 ? 1 : 0,
          transform: phase >= 6 ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 400ms ease-out, transform 400ms ease-out',
        }}
      >
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-sm bg-[var(--positive)]" />
          <span className="text-[var(--ink-2)]">Lage kosten ({lowTERpct}% TER)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-sm bg-gradient-to-r from-[#f59e0b] to-[#d97706]" />
          <span className="text-[var(--ink-2)]">Huidige kosten ({currentTERpct}% TER)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-sm bg-[var(--negative)]/15 border border-[var(--negative)]/30" />
          <span className="text-[var(--ink-2)]">Verschil (verloren rendement)</span>
        </div>
      </div>

      {/* Phase 6: Summary metrics */}
      <div
        className="rounded-lg bg-[var(--subtle)] border border-[var(--border-ed)] p-4 space-y-2"
        style={{
          opacity: phase >= 6 ? 1 : 0,
          transform: phase >= 6 ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 400ms 100ms ease-out, transform 400ms 100ms ease-out',
        }}
      >
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

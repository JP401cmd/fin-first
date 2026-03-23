'use client'

import { memo } from 'react'
import { useModalAnimation } from '@/lib/hooks/use-modal-animation'

// ── Types ────────────────────────────────────────────────────────────────────

interface FanChartProps {
  /** Percentile arrays, each length = years + 1 (starting from year 0) */
  percentiles: {
    p10: number[]
    p25: number[]
    p50: number[]
    p75: number[]
    p90: number[]
  }
  startAge: number
  /** Number of years (percentile arrays have years+1 entries) */
  years: number
  /** Optional horizontal threshold line (e.g. FIRE target) */
  fireTarget?: number
  /** Accent color CSS variable, default "var(--color-horizon-600, #a07840)" */
  accentColor?: string
  /** SVG width, default 320 */
  width?: number
  /** SVG height, default 140 */
  height?: number
  /** Accessible label for the chart */
  label?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PAD = { top: 16, right: 16, bottom: 24, left: 56 }

/** Format a value for the Y-axis: €1.2M, €350k, or €0 */
function formatYLabel(val: number): string {
  if (val >= 1_000_000) return `\u20AC${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `\u20AC${Math.round(val / 1_000)}k`
  return `\u20AC${Math.round(val)}`
}

/**
 * Build an SVG polygon path from two boundary arrays (upper and lower).
 * The lower boundary is traced in reverse so the path closes properly.
 */
function bandPath(
  upper: number[],
  lower: number[],
  xFn: (i: number) => number,
  yFn: (v: number) => number,
): string {
  // Upper boundary: left to right
  const fwd = upper.map((v, i) => `${xFn(i)},${yFn(v)}`).join(' L')
  // Lower boundary: right to left
  const rev = [...lower]
    .map((v, i) => `${xFn(i)},${yFn(v)}`)
    .reverse()
    .join(' L')
  return `M${fwd} L${rev} Z`
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Reusable SVG fan chart showing Monte Carlo percentile bands.
 *
 * Renders three layers:
 *   1. Outer band (p10-p90) at 8% accent opacity
 *   2. Inner band (p25-p75) at 12% accent opacity
 *   3. Median line (p50) as a solid 2px stroke
 *
 * Optionally shows a dashed horizontal line for the FIRE target.
 * Uses `useModalAnimation` for a draw-in entrance effect.
 */
export const FanChart = memo(function FanChart({
  percentiles,
  startAge,
  years,
  fireTarget,
  accentColor = 'var(--color-horizon-600, #a07840)',
  width = 320,
  height = 140,
  label = 'Monte Carlo projectie',
}: FanChartProps) {
  const { hasEntered } = useModalAnimation({ delay: 150, duration: 700 })

  const chartW = width - PAD.left - PAD.right
  const chartH = height - PAD.top - PAD.bottom

  // Determine Y-range: 0..max(p90), clamped to at least 1
  const maxVal = Math.max(...percentiles.p90, fireTarget ?? 0, 1)

  // Coordinate transforms
  const xFn = (i: number) => PAD.left + (i / Math.max(years, 1)) * chartW
  const yFn = (v: number) => PAD.top + chartH - (Math.max(v, 0) / maxVal) * chartH

  // ── Axis ticks ─────────────────────────────────────────────
  const yTicks = [0, 0.5, 1.0].map((f) => ({
    val: maxVal * f,
    yPos: yFn(maxVal * f),
  }))

  const ageSpan = years || 1
  const xStep = ageSpan <= 10 ? 2 : ageSpan <= 20 ? 5 : 10
  const xTicks: number[] = []
  for (
    let a = Math.ceil(startAge / xStep) * xStep;
    a <= startAge + years;
    a += xStep
  ) {
    xTicks.push(a)
  }

  // ── Band paths ─────────────────────────────────────────────
  const outerBand = bandPath(percentiles.p90, percentiles.p10, xFn, yFn)
  const innerBand = bandPath(percentiles.p75, percentiles.p25, xFn, yFn)

  // Median line
  const medianPoints = percentiles.p50
    .map((v, i) => `${xFn(i)},${yFn(v)}`)
    .join(' L')
  const medianPath = `M${medianPoints}`

  // Animation progress
  const animProgress = hasEntered ? 1 : 0

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label={label}
    >
      {/* Grid lines */}
      {yTicks.map((t) => (
        <g key={t.val}>
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={t.yPos}
            y2={t.yPos}
            stroke="var(--border-ed, #e5e5e5)"
            strokeWidth={0.5}
          />
          <text
            x={PAD.left - 6}
            y={t.yPos + 3}
            textAnchor="end"
            className="fill-[var(--ink-4)]"
            style={{ fontSize: 8, fontFamily: 'var(--font-mono, monospace)' }}
          >
            {formatYLabel(t.val)}
          </text>
        </g>
      ))}

      {/* X-axis ticks */}
      {xTicks.map((age) => (
        <text
          key={age}
          x={xFn(age - startAge)}
          y={height - 4}
          textAnchor="middle"
          className="fill-[var(--ink-4)]"
          style={{ fontSize: 8, fontFamily: 'var(--font-mono, monospace)' }}
        >
          {age}
        </text>
      ))}

      {/* Outer band: p10-p90 */}
      <path
        d={outerBand}
        fill={accentColor}
        style={{
          transition: 'opacity 700ms ease-out',
          opacity: animProgress * 0.08,
        }}
      />

      {/* Inner band: p25-p75 */}
      <path
        d={innerBand}
        fill={accentColor}
        style={{
          transition: 'opacity 700ms ease-out',
          opacity: animProgress * 0.12,
        }}
      />

      {/* Median line: p50 */}
      <path
        d={medianPath}
        fill="none"
        stroke={accentColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        style={{
          strokeDasharray: 1,
          strokeDashoffset: 1 - animProgress,
          transition: 'stroke-dashoffset 700ms ease-out',
        }}
      />

      {/* Optional FIRE target dashed line */}
      {fireTarget != null && fireTarget > 0 && (
        <g>
          <line
            x1={PAD.left}
            x2={width - PAD.right}
            y1={yFn(fireTarget)}
            y2={yFn(fireTarget)}
            stroke="var(--ink-3, #999)"
            strokeWidth={1}
            strokeDasharray="4 3"
            style={{
              transition: 'opacity 400ms ease-out 400ms',
              opacity: animProgress,
            }}
          />
          <text
            x={width - PAD.right}
            y={yFn(fireTarget) - 4}
            textAnchor="end"
            className="fill-[var(--ink-3)]"
            style={{ fontSize: 7, fontFamily: 'var(--font-mono, monospace)' }}
          >
            FIRE {formatYLabel(fireTarget)}
          </text>
        </g>
      )}

      {/* End dot on median */}
      <circle
        cx={xFn(years)}
        cy={yFn(percentiles.p50[percentiles.p50.length - 1] ?? 0)}
        r={3}
        fill={accentColor}
        style={{
          transition: 'opacity 400ms ease-out 500ms',
          opacity: animProgress,
        }}
      />
    </svg>
  )
})

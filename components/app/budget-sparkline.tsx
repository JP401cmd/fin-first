'use client'

import { useMemo } from 'react'

export type SparklineDataPoint = {
  month: string  // YYYY-MM-DD
  label: string  // e.g. 'jan', 'feb'
  spent: number
}

type BudgetSparklineProps = {
  /** Monthly spending data (up to 12 points) */
  data: SparklineDataPoint[]
  /** Width of the SVG in pixels */
  width?: number
  /** Height of the SVG in pixels */
  height?: number
  /** Whether to invert color logic (green for up = income, default: expenses where up = bad) */
  isIncome?: boolean
  /** Show dots at each data point */
  showDots?: boolean
  /** Show fill area under the line */
  showFill?: boolean
  /** Additional CSS class for the container */
  className?: string
  /** data-testid */
  testId?: string
}

/**
 * Calculate linear regression slope to determine trend direction
 */
function calculateTrend(values: number[]): 'up' | 'down' | 'flat' {
  if (values.length < 2) return 'flat'

  // Simple linear regression slope
  const n = values.length
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)

  // Determine significant trend (> 5% of average value change per month)
  const avg = sumY / n
  const threshold = avg * 0.03 // 3% threshold for significance
  if (slope > threshold) return 'up'
  if (slope < -threshold) return 'down'
  return 'flat'
}

/**
 * BudgetSparkline — A mini inline SVG chart showing 12-month spending trend.
 *
 * For expense budgets:
 *   - Upward trend → red (spending more = bad)
 *   - Downward trend → green (spending less = good)
 *
 * For income budgets (isIncome=true):
 *   - Upward trend → green (earning more = good)
 *   - Downward trend → red (earning less = bad)
 *
 * Handles sparse data (< 12 months) gracefully.
 */
export function BudgetSparkline({
  data,
  width = 120,
  height = 32,
  isIncome = false,
  showDots = false,
  showFill = true,
  className = '',
  testId,
}: BudgetSparklineProps) {
  const { points, fillPath, linePath, trend, trendColor, hasData } = useMemo(() => {
    const values = data.map(d => d.spent)
    if (values.length < 2 || values.every(v => v === 0)) {
      return { points: [], fillPath: '', linePath: '', trend: 'flat' as const, trendColor: '#a1a1aa', hasData: false }
    }

    const trend = calculateTrend(values)

    // Determine color based on trend and type
    let trendColor: string
    if (trend === 'flat') {
      trendColor = '#a1a1aa' // zinc-400
    } else if (isIncome) {
      // Income: up=green, down=red
      trendColor = trend === 'up' ? '#059669' : '#dc2626'
    } else {
      // Expenses: up=red, down=green
      trendColor = trend === 'up' ? '#dc2626' : '#059669'
    }

    const padding = { top: 3, bottom: 3, left: 2, right: 2 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    const maxVal = Math.max(...values, 1)
    const minVal = Math.min(...values.filter(v => v > 0), 0)
    const range = maxVal - minVal || 1

    const pts = values.map((v, i) => ({
      x: padding.left + (i / (values.length - 1)) * chartWidth,
      y: padding.top + chartHeight - ((v - minVal) / range) * chartHeight,
    }))

    // Build SVG path for the line
    let linePath = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 1; i < pts.length; i++) {
      linePath += ` L ${pts[i].x} ${pts[i].y}`
    }

    // Build SVG path for the fill area
    const fillPath = `${linePath} L ${pts[pts.length - 1].x} ${padding.top + chartHeight} L ${pts[0].x} ${padding.top + chartHeight} Z`

    return { points: pts, fillPath, linePath, trend, trendColor, hasData: true }
  }, [data, width, height, isIncome])

  if (!hasData) {
    return (
      <div
        className={`inline-flex items-center ${className}`}
        data-testid={testId}
        data-trend="none"
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {/* Flat line for no data */}
          <line
            x1={4}
            y1={height / 2}
            x2={width - 4}
            y2={height / 2}
            stroke="#d4d4d8"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        </svg>
      </div>
    )
  }

  return (
    <div
      className={`inline-flex items-center ${className}`}
      data-testid={testId}
      data-trend={trend}
      data-trend-color={trendColor}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Fill area under the line */}
        {showFill && (
          <path
            d={fillPath}
            fill={trendColor}
            opacity={0.12}
          />
        )}

        {/* Main sparkline */}
        <path
          d={linePath}
          fill="none"
          stroke={trendColor}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data point dots */}
        {showDots && points.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={1.5}
            fill={trendColor}
          />
        ))}

        {/* Endpoint dot (always shown for context) */}
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r={2}
          fill={trendColor}
        />
      </svg>
    </div>
  )
}

/**
 * Compact sparkline with trend label for use in cards and lists
 */
export function SparklineWithLabel({
  data,
  width = 80,
  height = 24,
  isIncome = false,
  showLabel = true,
  className = '',
  testId,
}: Omit<BudgetSparklineProps, 'showDots' | 'showFill'> & { showLabel?: boolean }) {
  const values = data.map(d => d.spent)
  const trend = values.length >= 2 ? calculateTrend(values) : 'flat'

  let trendLabel: string
  let labelColor: string
  if (trend === 'flat') {
    trendLabel = 'stabiel'
    labelColor = 'text-zinc-400'
  } else if (isIncome) {
    trendLabel = trend === 'up' ? '↑ groei' : '↓ daling'
    labelColor = trend === 'up' ? 'text-emerald-600' : 'text-red-600'
  } else {
    trendLabel = trend === 'up' ? '↑ stijgend' : '↓ dalend'
    labelColor = trend === 'up' ? 'text-red-600' : 'text-emerald-600'
  }

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`} data-testid={testId}>
      <BudgetSparkline
        data={data}
        width={width}
        height={height}
        isIncome={isIncome}
        showFill={true}
        showDots={false}
      />
      {showLabel && (
        <span className={`text-[10px] font-medium whitespace-nowrap ${labelColor}`} data-testid={testId ? `${testId}-label` : undefined}>
          {trendLabel}
        </span>
      )}
    </div>
  )
}

export { calculateTrend }

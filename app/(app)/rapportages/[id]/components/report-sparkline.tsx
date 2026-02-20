/**
 * ReportSparkline — Pure SVG sparkline for report pages.
 * Print-safe: uses inline SVG attributes (no CSS classes for colors).
 * Trend detection via linear regression.
 */

export type SparklineTrend = 'up' | 'down' | 'flat'

/**
 * Compute linear regression trend from a series of values.
 */
export function computeSparklineTrend(values: number[]): SparklineTrend {
  if (values.length < 2) return 'flat'

  const n = values.length
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += values[i]
    sumXY += i * values[i]
    sumX2 += i * i
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)

  const avg = sumY / n
  const threshold = avg * 0.03
  if (slope > threshold) return 'up'
  if (slope < -threshold) return 'down'
  return 'flat'
}

interface ReportSparklineProps {
  /** Data values to plot */
  values: number[]
  /** Base color for the line (CSS color string) */
  color: string
  /** SVG width */
  width?: number
  /** SVG height */
  height?: number
  /** Show fill area under the line */
  showFill?: boolean
  /**
   * When true, upward trend is bad (e.g. expenses).
   * When false (default), upward trend is good (e.g. savings, net worth).
   */
  invertTrend?: boolean
  /** Optional horizontal threshold line (e.g. FIRE target) */
  thresholdValue?: number
  /** Color for the threshold line */
  thresholdColor?: string
  /** Vertical marker positions (indices into values array) */
  markers?: { index: number; label: string }[]
  /** Additional CSS class */
  className?: string
}

const COLOR_POSITIVE = '#059669' // emerald-600
const COLOR_NEGATIVE = '#dc2626' // red-600
const COLOR_NEUTRAL = '#a1a1aa'  // zinc-400

export function ReportSparkline({
  values,
  color,
  width = 200,
  height = 40,
  showFill = true,
  invertTrend = false,
  thresholdValue,
  thresholdColor = '#c4a06b',
  markers,
  className = '',
}: ReportSparklineProps) {
  if (values.length < 2) return null

  const trend = computeSparklineTrend(values)

  // Determine stroke color based on trend
  let strokeColor: string
  if (trend === 'flat') {
    strokeColor = COLOR_NEUTRAL
  } else if (invertTrend) {
    strokeColor = trend === 'up' ? COLOR_NEGATIVE : COLOR_POSITIVE
  } else {
    strokeColor = trend === 'up' ? COLOR_POSITIVE : COLOR_NEGATIVE
  }
  // Use the provided module color for neutral/positive trends
  if (trend === 'flat' || (!invertTrend && trend === 'up') || (invertTrend && trend === 'down')) {
    strokeColor = color
  }

  const padding = { top: 4, bottom: 4, left: 2, right: 2 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const allValues = thresholdValue != null ? [...values, thresholdValue] : values
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const range = max - min || 1

  const toX = (i: number) => padding.left + (i / (values.length - 1)) * chartW
  const toY = (v: number) => padding.top + chartH - ((v - min) / range) * chartH

  const points = values.map((v, i) => ({ x: toX(i), y: toY(v) }))

  let linePath = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    linePath += ` L ${points[i].x} ${points[i].y}`
  }

  const fillPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`

  const thresholdY = thresholdValue != null ? toY(thresholdValue) : null

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full ${className}`}
      style={{ height }}
      preserveAspectRatio="none"
    >
      {/* Threshold line */}
      {thresholdY != null && (
        <line
          x1={padding.left}
          y1={thresholdY}
          x2={width - padding.right}
          y2={thresholdY}
          stroke={thresholdColor}
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity="0.6"
        />
      )}

      {/* Vertical markers */}
      {markers?.map((m) => {
        const x = toX(m.index)
        return (
          <g key={m.index}>
            <line
              x1={x}
              y1={padding.top}
              x2={x}
              y2={padding.top + chartH}
              stroke="#c8c5ba"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
            <text
              x={x}
              y={padding.top + chartH + 10}
              textAnchor="middle"
              fill="#888070"
              fontSize="8"
              fontFamily="Inter, sans-serif"
            >
              {m.label}
            </text>
          </g>
        )
      })}

      {/* Fill area */}
      {showFill && (
        <path d={fillPath} fill={strokeColor} opacity="0.1" />
      )}

      {/* Main line */}
      <polyline
        points={points.map(p => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* End dot */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="2.5"
        fill={strokeColor}
      />
    </svg>
  )
}

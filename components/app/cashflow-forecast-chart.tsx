'use client'

import { useState, memo } from 'react'
import { formatCurrency } from '@/components/app/budget-shared'
import { AlertTriangle } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { MaskedAmount } from '@/components/app/masked-amount'
import { ChartTips } from '@/components/editorial/chart-tips'
import { getCashflowForecastTips } from '@/lib/chart-tips'

export type ForecastPoint = {
  month: string
  label: string
  projectedBalance: number
  income: number
  expenses: number
  isCurrentMonth: boolean
}

export type ForecastAlert = {
  month: string
  label: string
  projectedBalance: number
  message: string
}

type Props = {
  forecast: ForecastPoint[]
  alerts: ForecastAlert[]
  currentBalance: number
}

/**
 * CashFlowForecastChart — SVG area chart showing projected bank balance
 * over the next 3-6 months. Shows current balance as starting point,
 * with filled area chart projecting forward. Red zone below €500.
 * Alerts shown below the chart.
 */
export const CashFlowForecastChart = memo(function CashFlowForecastChart({ forecast, alerts, currentBalance }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const { ref, hasEntered, animationComplete } = useInViewAnimation({ duration: 700 })

  if (!forecast || forecast.length < 2) {
    return (
      <div className="py-6 text-center text-sm text-[var(--ink-3)]" data-testid="cashflow-forecast-empty">
        Onvoldoende data om een cashflow prognose te maken.
      </div>
    )
  }

  // Chart dimensions
  const width = 600
  const height = 240
  const paddingLeft = 60
  const paddingRight = 20
  const paddingTop = 20
  const paddingBottom = 40
  const chartWidth = width - paddingLeft - paddingRight
  const chartHeight = height - paddingTop - paddingBottom

  // Calculate value bounds
  const values = forecast.map(p => p.projectedBalance)
  const minVal = Math.min(...values, 0) // Include 0 in range
  const maxVal = Math.max(...values, currentBalance)
  const valueRange = maxVal - minVal || 1
  const buffer = valueRange * 0.1
  const yMin = minVal - buffer
  const yMax = maxVal + buffer
  const yRange = yMax - yMin || 1

  // Position helpers
  const xStep = chartWidth / Math.max(1, forecast.length - 1)
  const getX = (i: number) => paddingLeft + i * xStep
  const getY = (val: number) => paddingTop + chartHeight - ((val - yMin) / yRange) * chartHeight

  // Build area path (filled below the line)
  const lineParts: string[] = []
  for (let i = 0; i < forecast.length; i++) {
    const x = getX(i)
    const y = getY(forecast[i].projectedBalance)
    lineParts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
  }
  const linePath = lineParts.join(' ')

  // Area path: line + bottom closure
  const areaPath = `${linePath} L${getX(forecast.length - 1).toFixed(1)},${(paddingTop + chartHeight).toFixed(1)} L${getX(0).toFixed(1)},${(paddingTop + chartHeight).toFixed(1)} Z`

  // Red danger zone (below €500)
  const dangerThreshold = 500
  const dangerY = getY(dangerThreshold)
  const showDangerZone = dangerThreshold > yMin

  // Y-axis grid lines (5 lines)
  const gridCount = 5
  const gridLines: { value: number; y: number; label: string }[] = []
  for (let i = 0; i <= gridCount; i++) {
    const val = yMin + (yRange / gridCount) * i
    gridLines.push({
      value: val,
      y: getY(val),
      label: formatEurShort(val),
    })
  }

  // Find the transition point between current and projected months
  const currentMonthIndex = forecast.findIndex(p => p.isCurrentMonth)
  const firstProjectedIndex = currentMonthIndex >= 0 ? currentMonthIndex + 1 : 1

  // Split area: solid for current, semi-transparent for projected
  // Build projected area (from first projected month onward)
  let projectedAreaPath = ''
  if (firstProjectedIndex < forecast.length) {
    const projParts: string[] = []
    // Start from the current month point (overlap) for smooth transition
    const startIdx = Math.max(0, firstProjectedIndex - 1)
    for (let i = startIdx; i < forecast.length; i++) {
      const x = getX(i)
      const y = getY(forecast[i].projectedBalance)
      projParts.push(`${i === startIdx ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    }
    projectedAreaPath = `${projParts.join(' ')} L${getX(forecast.length - 1).toFixed(1)},${(paddingTop + chartHeight).toFixed(1)} L${getX(startIdx).toFixed(1)},${(paddingTop + chartHeight).toFixed(1)} Z`
  }

  // Determine trend color
  const lastBalance = forecast[forecast.length - 1].projectedBalance
  const trendPositive = lastBalance >= currentBalance
  const mainColor = trendPositive ? '#059669' : '#dc2626' // emerald-600 or red-600
  const areaGradientId = 'cashflow-area-gradient'
  const projGradientId = 'cashflow-proj-gradient'

  // Animation timings
  const lineAnim = hasEntered ? 'drawPath 700ms cubic-bezier(.22,1,.36,1) both' : 'none'
  const fillAnim = hasEntered ? 'fadeInFill 250ms ease-out 455ms both' : 'none'
  const projLineAnim = hasEntered ? 'drawPath 700ms cubic-bezier(.22,1,.36,1) 595ms both' : 'none'
  const redZoneAnim = hasEntered ? 'fadeInFill 250ms ease-out 520ms both' : 'none'

  return (
    <div ref={ref} data-testid="cashflow-forecast-chart">
      {/* Inline ChartTips */}
      <div className="mb-2 flex justify-end">
        <ChartTips
          storageKey="cashflow_forecast_chart"
          tips={getCashflowForecastTips({
            monthCount: forecast.length,
            alertCount: alerts.length,
            warningThreshold: 500,
          })}
          align="right"
        />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2" data-testid="cashflow-forecast-alerts">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              data-testid={`cashflow-alert-${i}`}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        data-testid="cashflow-forecast-svg"
        role="img"
        aria-label="Cashflow prognose grafiek"
      >
        <defs>
          {/* Gradient for actual part (solid) */}
          <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mainColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={mainColor} stopOpacity="0.05" />
          </linearGradient>
          {/* Gradient for projected part (dashed pattern) */}
          <linearGradient id={projGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mainColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={mainColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={paddingLeft}
              y1={g.y}
              x2={width - paddingRight}
              y2={g.y}
              stroke="#e4e4e7"
              strokeWidth="0.5"
            />
            <text
              x={paddingLeft - 8}
              y={g.y + 4}
              textAnchor="end"
              className="fill-zinc-400"
              fontSize="9"
            >
              {g.label}
            </text>
          </g>
        ))}

        {/* Danger zone (below €500) */}
        {showDangerZone && (
          <rect
            x={paddingLeft}
            y={dangerY}
            width={chartWidth}
            height={paddingTop + chartHeight - dangerY}
            fill="#fef2f2"
            opacity="0.6"
            style={{ animation: redZoneAnim }}
          />
        )}

        {/* Danger threshold line */}
        {showDangerZone && (
          <>
            <line
              x1={paddingLeft}
              y1={dangerY}
              x2={width - paddingRight}
              y2={dangerY}
              stroke="#fca5a5"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
            <text
              x={width - paddingRight - 2}
              y={dangerY - 4}
              textAnchor="end"
              className="fill-red-400"
              fontSize="8"
            >
              €500
            </text>
          </>
        )}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${areaGradientId})`} style={{ animation: fillAnim }} />

        {/* Projected area overlay (lighter) */}
        {projectedAreaPath && (
          <path d={projectedAreaPath} fill={`url(#${projGradientId})`} style={{ animation: fillAnim }} />
        )}

        {/* Main line */}
        <path
          d={linePath}
          fill="none"
          stroke={mainColor}
          strokeWidth="2"
          strokeLinejoin="round"
          pathLength={1}
          style={{ strokeDashoffset: hasEntered ? undefined : 1, animation: lineAnim }}
        />

        {/* Projected portion: dashed overlay line */}
        {firstProjectedIndex < forecast.length && (
          <path
            d={(() => {
              const parts: string[] = []
              const startIdx = Math.max(0, firstProjectedIndex - 1)
              for (let i = startIdx; i < forecast.length; i++) {
                parts.push(`${i === startIdx ? 'M' : 'L'}${getX(i).toFixed(1)},${getY(forecast[i].projectedBalance).toFixed(1)}`)
              }
              return parts.join(' ')
            })()}
            fill="none"
            stroke={mainColor}
            strokeWidth="2"
            strokeDasharray="6 4"
            strokeLinejoin="round"
            pathLength={1}
            style={{ strokeDashoffset: hasEntered ? undefined : 1, animation: projLineAnim }}
          />
        )}

        {/* "Vandaag" marker at transition point */}
        {currentMonthIndex >= 0 && (
          <>
            <line
              x1={getX(currentMonthIndex)}
              y1={paddingTop}
              x2={getX(currentMonthIndex)}
              y2={paddingTop + chartHeight}
              stroke="#a1a1aa"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text
              x={getX(currentMonthIndex)}
              y={paddingTop - 6}
              textAnchor="middle"
              className="fill-zinc-500"
              fontSize="8"
              fontWeight="500"
            >
              vandaag
            </text>
          </>
        )}

        {/* Data points */}
        {forecast.map((point, i) => {
          const x = getX(i)
          const y = getY(point.projectedBalance)
          const isHovered = hoveredIndex === i
          return (
            <g key={i}>
              <circle
                cx={x}
                cy={y}
                r={isHovered ? 5 : 3.5}
                fill={point.isCurrentMonth ? mainColor : 'white'}
                stroke={mainColor}
                strokeWidth="2"
                style={{ cursor: animationComplete ? 'pointer' : 'default', pointerEvents: animationComplete ? 'auto' : 'none' }}
                onMouseEnter={animationComplete ? () => setHoveredIndex(i) : undefined}
                onMouseLeave={animationComplete ? () => setHoveredIndex(null) : undefined}
              />
              {/* Value label on hover */}
              {isHovered && (
                <g>
                  <rect
                    x={x - 40}
                    y={y - 28}
                    width={80}
                    height={20}
                    rx={4}
                    fill="white"
                    stroke="#e4e4e7"
                    strokeWidth="0.5"
                  />
                  <text
                    x={x}
                    y={y - 15}
                    textAnchor="middle"
                    className="fill-zinc-700"
                    fontSize="10"
                    fontWeight="600"
                  >
                    {<MaskedAmount value={point.projectedBalance} tone="horizon" />}
                  </text>
                </g>
              )}
            </g>
          )
        })}

        {/* X-axis labels */}
        {forecast.map((point, i) => (
          <text
            key={i}
            x={getX(i)}
            y={height - 8}
            textAnchor="middle"
            className={point.isCurrentMonth ? 'fill-zinc-700 font-medium' : 'fill-zinc-400'}
            fontSize="9"
          >
            {point.label}
          </text>
        ))}

        {/* Chart legend */}
        <g transform={`translate(${paddingLeft}, ${height - 4})`}>
          <line x1="0" y1="-2" x2="16" y2="-2" stroke={mainColor} strokeWidth="2" />
          <text x="20" y="1" fontSize="8" className="fill-zinc-500">Werkelijk</text>
          <line x1="72" y1="-2" x2="88" y2="-2" stroke={mainColor} strokeWidth="2" strokeDasharray="4 3" />
          <text x="92" y="1" fontSize="8" className="fill-zinc-500">Prognose</text>
        </g>
      </svg>

      {/* Summary stats below chart */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center" data-testid="cashflow-forecast-summary">
        <div className="rounded-lg bg-[var(--subtle)] p-2">
          <p className="text-[10px] text-[var(--ink-3)]">Huidig saldo</p>
          <p className="text-sm font-bold text-[var(--ink)]">{<MaskedAmount value={currentBalance} tone="horizon" />}</p>
        </div>
        <div className="rounded-lg bg-[var(--subtle)] p-2">
          <p className="text-[10px] text-[var(--ink-3)]">Over 3 maanden</p>
          <p className={`text-sm font-bold ${forecast.length >= 4 && forecast[3].projectedBalance >= currentBalance ? 'text-emerald-600' : 'text-red-600'}`}>
            {forecast.length >= 4 ? formatCurrency(forecast[3].projectedBalance) : '—'}
          </p>
        </div>
        <div className="rounded-lg bg-[var(--subtle)] p-2">
          <p className="text-[10px] text-[var(--ink-3)]">Over 6 maanden</p>
          <p className={`text-sm font-bold ${forecast.length >= 7 && forecast[6].projectedBalance >= currentBalance ? 'text-emerald-600' : 'text-red-600'}`}>
            {forecast.length >= 7 ? formatCurrency(forecast[6].projectedBalance) : '—'}
          </p>
        </div>
      </div>
    </div>
  )
})

function formatEurShort(amount: number): string {
  if (Math.abs(amount) >= 1000) {
    return `€${(amount / 1000).toFixed(1)}k`
  }
  return `€${Math.round(amount)}`
}

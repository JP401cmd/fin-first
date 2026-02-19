'use client'

import { useMemo, useState } from 'react'
import {
  type ComparisonResult,
  type TimePeriod,
  type BenchmarkId,
  TIME_PERIODS,
  BENCHMARKS,
  getAlphaDescription,
} from '@/lib/benchmark-comparison'
import { TrendingUp, TrendingDown, Minus, BarChart3, Info } from 'lucide-react'

// ── Chart component ──────────────────────────────────────────

interface BenchmarkComparisonChartProps {
  comparison: ComparisonResult | null
  onPeriodChange: (period: TimePeriod) => void
  activePeriod: TimePeriod
  availablePeriods?: TimePeriod[]
  loading?: boolean
}

export function BenchmarkComparisonChart({
  comparison,
  onPeriodChange,
  activePeriod,
  availablePeriods,
  loading,
}: BenchmarkComparisonChartProps) {
  const [hoveredBenchmark, setHoveredBenchmark] = useState<BenchmarkId | null>(null)
  const [tooltipData, setTooltipData] = useState<{
    x: number
    y: number
    date: string
    values: { name: string; value: number; color: string }[]
  } | null>(null)
  const periods = availablePeriods || TIME_PERIODS

  const PORTFOLIO_COLOR = '#f59e0b' // amber

  // Build chart data from comparison result
  const chartData = useMemo(() => {
    if (!comparison) return null

    // Collect all dates from portfolio + benchmarks
    const allDates = new Set<string>()
    for (const p of comparison.portfolio.dataPoints) allDates.add(p.date)
    for (const b of comparison.benchmarks) {
      for (const p of b.dataPoints) allDates.add(p.date)
    }
    const sortedDates = [...allDates].sort()
    if (sortedDates.length === 0) return null

    // Determine Y range
    let minVal = Infinity
    let maxVal = -Infinity

    const portfolioByDate: Record<string, number> = {}
    for (const p of comparison.portfolio.dataPoints) {
      portfolioByDate[p.date] = p.value
      minVal = Math.min(minVal, p.value)
      maxVal = Math.max(maxVal, p.value)
    }

    const benchmarksByDate: Record<string, Record<string, number>> = {}
    for (const b of comparison.benchmarks) {
      for (const p of b.dataPoints) {
        if (!benchmarksByDate[p.date]) benchmarksByDate[p.date] = {}
        benchmarksByDate[p.date][b.id] = p.value
        minVal = Math.min(minVal, p.value)
        maxVal = Math.max(maxVal, p.value)
      }
    }

    // Add padding
    const range = maxVal - minVal
    minVal = Math.max(0, minVal - range * 0.1)
    maxVal = maxVal + range * 0.1

    return {
      dates: sortedDates,
      portfolioByDate,
      benchmarksByDate,
      minVal,
      maxVal,
    }
  }, [comparison])

  // Y-axis grid values
  const yTicks = useMemo(() => {
    if (!chartData) return []
    const range = chartData.maxVal - chartData.minVal
    const step = range / 4
    return Array.from({ length: 5 }, (_, i) => chartData.minVal + step * i)
  }, [chartData])

  // X-axis date labels (show ~5 labels)
  const xLabels = useMemo(() => {
    if (!chartData) return []
    const { dates } = chartData
    if (dates.length <= 5) return dates.map((d, i) => ({ date: d, index: i }))
    const step = Math.max(1, Math.floor(dates.length / 4))
    const labels: { date: string; index: number }[] = []
    for (let i = 0; i < dates.length; i += step) {
      labels.push({ date: dates[i], index: i })
    }
    // Always include last
    const lastIdx = dates.length - 1
    if (labels[labels.length - 1]?.index !== lastIdx) {
      labels.push({ date: dates[lastIdx], index: lastIdx })
    }
    return labels
  }, [chartData])

  const sortedByReturn = useMemo(
    () => comparison ? [...comparison.benchmarks].sort((a, b) => b.returnPct - a.returnPct) : [],
    [comparison],
  )

  // SVG dimensions
  const width = 600
  const height = 280
  const padding = { top: 20, right: 20, bottom: 30, left: 50 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  function getX(index: number, total: number): number {
    return padding.left + (index / Math.max(1, total - 1)) * chartW
  }

  function getY(value: number, minVal: number, maxVal: number): number {
    const range = maxVal - minVal
    if (range === 0) return padding.top + chartH / 2
    return padding.top + chartH - ((value - minVal) / range) * chartH
  }

  // Build SVG path from data points
  function buildPath(
    dates: string[],
    valueMap: Record<string, number>,
  ): string {
    const points: string[] = []
    let prevValue: number | null = null

    for (let i = 0; i < dates.length; i++) {
      const val = valueMap[dates[i]]
      if (val == null) {
        // Use previous value if missing
        if (prevValue != null) {
          const x = getX(i, dates.length)
          const y = getY(prevValue, chartData!.minVal, chartData!.maxVal)
          points.push(`${x},${y}`)
        }
        continue
      }
      prevValue = val
      const x = getX(i, dates.length)
      const y = getY(val, chartData!.minVal, chartData!.maxVal)
      points.push(`${x},${y}`)
    }

    if (points.length === 0) return ''
    return `M${points.join(' L')}`
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!chartData) return
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * width

    // Find closest date index
    const relX = mouseX - padding.left
    const idx = Math.round((relX / chartW) * (chartData.dates.length - 1))
    if (idx < 0 || idx >= chartData.dates.length) {
      setTooltipData(null)
      return
    }

    const date = chartData.dates[idx]
    const x = getX(idx, chartData.dates.length)

    const values: { name: string; value: number; color: string }[] = []
    if (chartData.portfolioByDate[date] != null) {
      values.push({
        name: 'Portfolio',
        value: chartData.portfolioByDate[date],
        color: PORTFOLIO_COLOR,
      })
    }
    for (const b of comparison!.benchmarks) {
      const bVal = chartData.benchmarksByDate[date]?.[b.id]
      if (bVal != null) {
        values.push({ name: b.name, value: bVal, color: b.color })
      }
    }

    setTooltipData({ x, y: padding.top, date, values })
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6" data-testid="benchmark-comparison-section">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-kern-600" />
          <h2 className="text-sm font-semibold text-zinc-700">Benchmark vergelijking</h2>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-zinc-100" />
          <div className="h-64 rounded-lg bg-zinc-100" />
          <div className="h-16 rounded bg-zinc-100" />
        </div>
      </div>
    )
  }

  if (!comparison || !chartData) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6" data-testid="benchmark-comparison-section">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-4 w-4 text-kern-600" />
          <h2 className="text-sm font-semibold text-zinc-700">Benchmark vergelijking</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <BarChart3 className="h-10 w-10 text-zinc-300" />
          <p className="mt-3 text-sm font-medium text-zinc-600">
            Onvoldoende data voor vergelijking
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Voeg holdings toe en registreer transacties om je portfolio te vergelijken met benchmarks.
          </p>
        </div>
      </div>
    )
  }

  const bestBenchmark = sortedByReturn[0] ?? null
  const alphaVsBest = bestBenchmark ? getAlphaDescription(bestBenchmark.alpha) : null

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6" data-testid="benchmark-comparison-section">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-kern-600" />
          <h2 className="text-sm font-semibold text-zinc-700">Benchmark vergelijking</h2>
        </div>
        {/* Period buttons */}
        <div className="flex items-center gap-1" data-testid="benchmark-period-buttons">
          {periods.map((p) => (
            <button
              key={p.id}
              onClick={() => onPeriodChange(p)}
              data-testid={`benchmark-period-${p.id}`}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                activePeriod.id === p.id
                  ? 'bg-kern-100 text-kern-700'
                  : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="overflow-visible"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltipData(null)}
          data-testid="benchmark-chart"
        >
          {/* Grid lines */}
          {yTicks.map((tick, i) => {
            const y = getY(tick, chartData.minVal, chartData.maxVal)
            return (
              <g key={i}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#e4e4e7"
                  strokeDasharray="2 2"
                />
                <text
                  x={padding.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="#a1a1aa"
                >
                  {tick.toFixed(0)}
                </text>
              </g>
            )
          })}

          {/* 100 baseline */}
          {chartData.minVal < 100 && chartData.maxVal > 100 && (
            <line
              x1={padding.left}
              y1={getY(100, chartData.minVal, chartData.maxVal)}
              x2={width - padding.right}
              y2={getY(100, chartData.minVal, chartData.maxVal)}
              stroke="#d4d4d8"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          )}

          {/* X-axis labels */}
          {xLabels.map(({ date, index }) => {
            const x = getX(index, chartData.dates.length)
            const d = new Date(date)
            return (
              <text
                key={index}
                x={x}
                y={height - 5}
                textAnchor="middle"
                fontSize="9"
                fill="#a1a1aa"
              >
                {d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })}
              </text>
            )
          })}

          {/* Benchmark lines */}
          {comparison.benchmarks.map((b) => {
            const benchmarkByDate: Record<string, number> = {}
            for (const p of b.dataPoints) benchmarkByDate[p.date] = p.value
            const path = buildPath(chartData.dates, benchmarkByDate)
            if (!path) return null
            return (
              <path
                key={b.id}
                d={path}
                fill="none"
                stroke={b.color}
                strokeWidth={hoveredBenchmark === b.id ? 2.5 : 1.5}
                strokeDasharray="4 3"
                opacity={hoveredBenchmark && hoveredBenchmark !== b.id ? 0.3 : 0.7}
                onMouseEnter={() => setHoveredBenchmark(b.id)}
                onMouseLeave={() => setHoveredBenchmark(null)}
                className="transition-opacity"
              />
            )
          })}

          {/* Portfolio line (solid, on top) */}
          {(() => {
            const path = buildPath(chartData.dates, chartData.portfolioByDate)
            if (!path) return null
            return (
              <path
                d={path}
                fill="none"
                stroke={PORTFOLIO_COLOR}
                strokeWidth={2.5}
                opacity={hoveredBenchmark ? 0.5 : 1}
                className="transition-opacity"
              />
            )
          })()}

          {/* Tooltip vertical line */}
          {tooltipData && (
            <line
              x1={tooltipData.x}
              y1={padding.top}
              x2={tooltipData.x}
              y2={height - padding.bottom}
              stroke="#a1a1aa"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          )}
        </svg>

        {/* Tooltip */}
        {tooltipData && (
          <div
            className="absolute z-10 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg"
            style={{
              left: `${(tooltipData.x / width) * 100}%`,
              top: '10px',
              transform: tooltipData.x > width * 0.7 ? 'translateX(-100%)' : 'translateX(0)',
            }}
          >
            <p className="text-[10px] font-medium text-zinc-500 mb-1">
              {new Date(tooltipData.date).toLocaleDateString('nl-NL', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
            {tooltipData.values.map((v, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: v.color }}
                />
                <span className="text-zinc-600">{v.name}</span>
                <span className="font-medium text-zinc-900 ml-auto">
                  {v.value.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded-full" style={{ backgroundColor: PORTFOLIO_COLOR }} />
          <span className="text-[11px] font-medium text-zinc-700">Jouw portfolio</span>
          <span className={`text-[11px] font-semibold ${comparison.portfolio.returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {comparison.portfolio.returnPct >= 0 ? '+' : ''}{comparison.portfolio.returnPct.toFixed(1)}%
          </span>
        </div>
        {comparison.benchmarks.map((b) => (
          <div
            key={b.id}
            className="flex items-center gap-1.5 cursor-default"
            onMouseEnter={() => setHoveredBenchmark(b.id)}
            onMouseLeave={() => setHoveredBenchmark(null)}
          >
            <span
              className="inline-block h-0.5 w-4 rounded-full"
              style={{
                backgroundColor: b.color,
                opacity: hoveredBenchmark && hoveredBenchmark !== b.id ? 0.3 : 1,
              }}
            />
            <span className="text-[11px] text-zinc-500">{b.name}</span>
            <span className={`text-[11px] font-medium ${b.returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {b.returnPct >= 0 ? '+' : ''}{b.returnPct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* Alpha summary */}
      <div className="mt-4 space-y-2" data-testid="alpha-summary">
        {comparison.benchmarks.map((b) => {
          const desc = getAlphaDescription(b.alpha)
          const AlphaIcon = b.alpha > 0 ? TrendingUp : b.alpha < 0 ? TrendingDown : Minus
          return (
            <div
              key={b.id}
              className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
              data-testid={`alpha-${b.id}`}
            >
              <AlphaIcon className={`h-3.5 w-3.5 ${desc.color}`} />
              <span className="text-xs text-zinc-600 flex-1">
                vs {b.name}
              </span>
              <span className={`text-xs font-semibold ${desc.color}`} data-testid={`alpha-value-${b.id}`}>
                {b.alpha >= 0 ? '+' : ''}{b.alpha.toFixed(1)}% alpha
              </span>
            </div>
          )
        })}
      </div>

      {/* Contextual message */}
      {alphaVsBest && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-kern-100 bg-kern-50/50 p-3" data-testid="benchmark-context-message">
          <Info className="h-3.5 w-3.5 shrink-0 text-kern-500 mt-0.5" />
          <p className="text-xs text-zinc-600 leading-relaxed">
            <span className="font-medium">Benchmarkvergelijking:</span>{' '}
            Je portfolio rendement van{' '}
            <span className={`font-semibold ${comparison.portfolio.returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {comparison.portfolio.returnPct >= 0 ? '+' : ''}{comparison.portfolio.returnPct.toFixed(1)}%
            </span>
            {' '}over deze periode.{' '}
            {bestBenchmark && (
              <span>
                De beste benchmark ({bestBenchmark.name}) behaalde{' '}
                <span className="font-medium">
                  {bestBenchmark.returnPct >= 0 ? '+' : ''}
                  {bestBenchmark.returnPct.toFixed(1)}%
                </span>.
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}

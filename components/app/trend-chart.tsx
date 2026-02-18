'use client'

import { useState, useMemo, useCallback } from 'react'
import type { DomainColor } from '@/lib/navigation'

// ── Types ─────────────────────────────────────────────────────

export type TrendChartMode = 'line' | 'area' | 'bar'

export type TrendDataPoint = {
  /** X-axis label (e.g. 'jan', 'feb 2025', 'Q1') */
  label: string
  /** Primary value (actual/historical data) */
  value: number
  /** Optional projected/forecasted value for overlay */
  projected?: number
}

export type TrendChartSeries = {
  /** Unique identifier for the series */
  id: string
  /** Display name (used in legend and tooltip) */
  name: string
  /** Data points in chronological order */
  data: TrendDataPoint[]
  /** Optional override color (hex). Falls back to module theme color. */
  color?: string
}

export type TrendChartProps = {
  /** One or more data series to render */
  series: TrendChartSeries[]
  /** Chart display mode */
  mode: TrendChartMode
  /** Module color theme for consistent styling */
  moduleColor?: DomainColor
  /** Chart title (optional, rendered above chart) */
  title?: string
  /** Y-axis label (e.g. '€', '%', 'dagen') */
  yAxisLabel?: string
  /** Format function for Y-axis values. Default: short EUR format */
  formatValue?: (value: number) => string
  /** Format function for tooltip values. Default: uses formatValue */
  formatTooltip?: (value: number) => string
  /** Show legend below chart */
  showLegend?: boolean
  /** Show projected data overlay (dashed line/lighter fill) */
  showProjected?: boolean
  /** Height of the SVG (viewBox-based, responsive) */
  height?: number
  /** Additional CSS classes */
  className?: string
  /** data-testid attribute */
  testId?: string
}

// ── Color definitions per module theme ───────────────────────

const MODULE_COLORS: Record<DomainColor, {
  primary: string
  secondary: string
  gradient: [string, string]
  gridStroke: string
  axisText: string
}> = {
  amber: {
    primary: '#f59e0b',    // amber-500
    secondary: '#d97706',  // amber-600
    gradient: ['#f59e0b', '#fef3c7'],
    gridStroke: '#e4e4e7',
    axisText: '#71717a',
  },
  teal: {
    primary: '#14b8a6',    // teal-500
    secondary: '#0d9488',  // teal-600
    gradient: ['#14b8a6', '#ccfbf1'],
    gridStroke: '#e4e4e7',
    axisText: '#71717a',
  },
  purple: {
    primary: '#a855f7',    // purple-500
    secondary: '#7e22ce',  // purple-700
    gradient: ['#a855f7', '#f3e8ff'],
    gridStroke: '#e4e4e7',
    axisText: '#71717a',
  },
}

// Fallback multi-series colors when multiple series are shown
const SERIES_COLORS = [
  '#f59e0b', // amber
  '#14b8a6', // teal
  '#a855f7', // purple
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // emerald
  '#f97316', // orange
  '#6366f1', // indigo
]

// ── Helpers ──────────────────────────────────────────────────

function defaultFormatValue(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `€${(val / 1_000_000).toFixed(1)}M`
  if (Math.abs(val) >= 1_000) return `€${(val / 1_000).toFixed(0)}k`
  return `€${Math.round(val)}`
}

function getSeriesColor(
  series: TrendChartSeries,
  index: number,
  moduleColor: DomainColor,
  totalSeries: number,
): string {
  if (series.color) return series.color
  if (totalSeries === 1) return MODULE_COLORS[moduleColor].primary
  return SERIES_COLORS[index % SERIES_COLORS.length]
}

// ── Component ────────────────────────────────────────────────

export function TrendChart({
  series,
  mode,
  moduleColor = 'amber',
  title,
  yAxisLabel,
  formatValue = defaultFormatValue,
  formatTooltip,
  showLegend = true,
  showProjected = true,
  height = 260,
  className = '',
  testId = 'trend-chart',
}: TrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [hoveredSeriesId, setHoveredSeriesId] = useState<string | null>(null)

  const tooltipFormat = formatTooltip || formatValue
  const theme = MODULE_COLORS[moduleColor]

  // ── Compute chart geometry ──────────────────────────────────
  const W = 600
  const H = height
  const PAD = { top: 24, right: 20, bottom: 36, left: 56 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  // ── Compute data ranges ─────────────────────────────────────
  const { allLabels, minVal, maxVal, valRange } = useMemo(() => {
    // Use the first series' labels as canonical X-axis labels
    const allLabels = series.length > 0 ? series[0].data.map(d => d.label) : []

    let minVal = Infinity
    let maxVal = -Infinity

    for (const s of series) {
      for (const d of s.data) {
        if (isFinite(d.value)) {
          minVal = Math.min(minVal, d.value)
          maxVal = Math.max(maxVal, d.value)
        }
        if (d.projected != null && isFinite(d.projected)) {
          minVal = Math.min(minVal, d.projected)
          maxVal = Math.max(maxVal, d.projected)
        }
      }
    }

    // Handle edge cases
    if (!isFinite(minVal)) minVal = 0
    if (!isFinite(maxVal)) maxVal = 100
    if (minVal === maxVal) {
      minVal = minVal - 1
      maxVal = maxVal + 1
    }

    // Add 10% buffer
    const buffer = (maxVal - minVal) * 0.1
    minVal = Math.min(minVal - buffer, 0)
    maxVal = maxVal + buffer
    const valRange = maxVal - minVal || 1

    return { allLabels, minVal, maxVal, valRange }
  }, [series])

  // ── Coordinate helpers ──────────────────────────────────────
  const xPos = useCallback(
    (idx: number) => {
      const count = allLabels.length
      if (mode === 'bar') {
        // Center bars in their slot
        const slotW = chartW / Math.max(1, count)
        return PAD.left + slotW * idx + slotW / 2
      }
      return PAD.left + (idx / Math.max(1, count - 1)) * chartW
    },
    [allLabels.length, chartW, PAD.left, mode],
  )

  const yPos = useCallback(
    (val: number) => PAD.top + chartH - ((val - minVal) / valRange) * chartH,
    [chartH, PAD.top, minVal, valRange],
  )

  // ── Grid lines ──────────────────────────────────────────────
  const gridLines = useMemo(() => {
    const lines: { y: number; val: number }[] = []
    const count = 4
    for (let i = 0; i <= count; i++) {
      const pct = i / count
      const val = minVal + pct * valRange
      lines.push({ y: yPos(val), val })
    }
    return lines
  }, [minVal, valRange, yPos])

  // ── X-axis label selection (max ~8 labels) ─────────────────
  const xLabels = useMemo(() => {
    if (allLabels.length <= 8) {
      return allLabels.map((label, i) => ({ label, index: i }))
    }
    const step = Math.ceil(allLabels.length / 7)
    const labels: { label: string; index: number }[] = []
    for (let i = 0; i < allLabels.length; i += step) {
      labels.push({ label: allLabels[i], index: i })
    }
    // Always include last
    const lastIdx = allLabels.length - 1
    if (labels[labels.length - 1]?.index !== lastIdx) {
      labels.push({ label: allLabels[lastIdx], index: lastIdx })
    }
    return labels
  }, [allLabels])

  // ── Build SVG paths for each series ─────────────────────────
  const seriesPaths = useMemo(() => {
    return series.map((s, sIdx) => {
      const color = getSeriesColor(s, sIdx, moduleColor, series.length)
      const data = s.data

      // Line/area path for actual values
      const lineParts: string[] = []
      for (let i = 0; i < data.length; i++) {
        if (!isFinite(data[i].value)) continue
        const cmd = lineParts.length === 0 ? 'M' : 'L'
        lineParts.push(`${cmd}${xPos(i).toFixed(1)},${yPos(data[i].value).toFixed(1)}`)
      }
      const linePath = lineParts.join(' ')

      // Area path (line + bottom closure)
      let areaPath = ''
      if (lineParts.length >= 2) {
        const lastI = data.length - 1
        const firstI = data.findIndex(d => isFinite(d.value))
        areaPath =
          linePath +
          ` L${xPos(lastI).toFixed(1)},${(PAD.top + chartH).toFixed(1)}` +
          ` L${xPos(firstI >= 0 ? firstI : 0).toFixed(1)},${(PAD.top + chartH).toFixed(1)} Z`
      }

      // Projected line path (dashed)
      const projParts: string[] = []
      if (showProjected) {
        for (let i = 0; i < data.length; i++) {
          if (data[i].projected == null || !isFinite(data[i].projected!)) continue
          const cmd = projParts.length === 0 ? 'M' : 'L'
          projParts.push(`${cmd}${xPos(i).toFixed(1)},${yPos(data[i].projected!).toFixed(1)}`)
        }
      }
      const projLinePath = projParts.join(' ')

      // Projected area path
      let projAreaPath = ''
      if (projParts.length >= 2) {
        const projIndices = data
          .map((d, i) => (d.projected != null && isFinite(d.projected) ? i : -1))
          .filter(i => i >= 0)
        const firstProjI = projIndices[0]
        const lastProjI = projIndices[projIndices.length - 1]
        projAreaPath =
          projLinePath +
          ` L${xPos(lastProjI).toFixed(1)},${(PAD.top + chartH).toFixed(1)}` +
          ` L${xPos(firstProjI).toFixed(1)},${(PAD.top + chartH).toFixed(1)} Z`
      }

      return {
        id: s.id,
        name: s.name,
        color,
        data,
        linePath,
        areaPath,
        projLinePath,
        projAreaPath,
      }
    })
  }, [series, moduleColor, showProjected, xPos, yPos, chartH, PAD.top])

  // ── Bar chart geometry ──────────────────────────────────────
  const barWidth = useMemo(() => {
    if (mode !== 'bar') return 0
    const count = allLabels.length
    const slotW = chartW / Math.max(1, count)
    const numSeries = series.length
    const gapBetweenGroups = slotW * 0.2
    const groupW = slotW - gapBetweenGroups
    return Math.min(groupW / numSeries, 40)
  }, [mode, allLabels.length, chartW, series.length])

  // ── Handlers ────────────────────────────────────────────────
  const handleMouseEnter = useCallback((idx: number, seriesId?: string) => {
    setHoveredIndex(idx)
    if (seriesId) setHoveredSeriesId(seriesId)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredIndex(null)
    setHoveredSeriesId(null)
  }, [])

  // ── Empty state ─────────────────────────────────────────────
  if (series.length === 0 || allLabels.length === 0) {
    return (
      <div
        className={`py-6 text-center text-sm text-zinc-400 ${className}`}
        data-testid={testId}
        data-mode={mode}
      >
        Onvoldoende data om een grafiek te tonen.
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className={className} data-testid={testId} data-mode={mode} data-module-color={moduleColor}>
      {/* Title */}
      {title && (
        <h3 className="mb-2 text-sm font-semibold text-zinc-700" data-testid={`${testId}-title`}>
          {title}
        </h3>
      )}

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: H + 20 }}
        data-testid={`${testId}-svg`}
        role="img"
        aria-label={title || 'Trendgrafiek'}
      >
        {/* Gradient definitions */}
        <defs>
          {seriesPaths.map((sp, i) => (
            <linearGradient key={`grad-${sp.id}`} id={`trend-grad-${sp.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={sp.color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={sp.color} stopOpacity="0.03" />
            </linearGradient>
          ))}
          {seriesPaths.map((sp) => (
            <linearGradient key={`proj-grad-${sp.id}`} id={`trend-proj-grad-${sp.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={sp.color} stopOpacity="0.12" />
              <stop offset="100%" stopColor={sp.color} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>

        {/* Horizontal grid lines */}
        {gridLines.map(({ y, val }, i) => (
          <g key={`grid-${i}`}>
            <line
              x1={PAD.left}
              y1={y}
              x2={W - PAD.right}
              y2={y}
              stroke={theme.gridStroke}
              strokeDasharray="4"
              strokeWidth="0.5"
            />
            <text
              x={PAD.left - 8}
              y={y + 3}
              textAnchor="end"
              fill={theme.axisText}
              style={{ fontSize: 9 }}
            >
              {formatValue(val)}
            </text>
          </g>
        ))}

        {/* Y-axis label */}
        {yAxisLabel && (
          <text
            x={10}
            y={PAD.top + chartH / 2}
            textAnchor="middle"
            fill={theme.axisText}
            style={{ fontSize: 9, fontWeight: 500 }}
            transform={`rotate(-90, 10, ${PAD.top + chartH / 2})`}
          >
            {yAxisLabel}
          </text>
        )}

        {/* X-axis labels */}
        {xLabels.map(({ label, index }) => (
          <text
            key={`x-${index}`}
            x={xPos(index)}
            y={H - 6}
            textAnchor="middle"
            fill={theme.axisText}
            style={{ fontSize: 9 }}
          >
            {label}
          </text>
        ))}

        {/* ── LINE / AREA MODE ─────────────────────────────── */}
        {(mode === 'line' || mode === 'area') && seriesPaths.map((sp) => {
          const isHighlighted = !hoveredSeriesId || hoveredSeriesId === sp.id
          const opacity = isHighlighted ? 1 : 0.25

          return (
            <g key={sp.id} data-testid={`${testId}-series-${sp.id}`}>
              {/* Area fill (area mode only) */}
              {mode === 'area' && sp.areaPath && (
                <path
                  d={sp.areaPath}
                  fill={`url(#trend-grad-${sp.id})`}
                  opacity={opacity}
                  className="transition-opacity duration-200"
                />
              )}

              {/* Projected area fill */}
              {mode === 'area' && showProjected && sp.projAreaPath && (
                <path
                  d={sp.projAreaPath}
                  fill={`url(#trend-proj-grad-${sp.id})`}
                  opacity={opacity}
                  className="transition-opacity duration-200"
                />
              )}

              {/* Projected line (dashed) */}
              {showProjected && sp.projLinePath && (
                <path
                  d={sp.projLinePath}
                  fill="none"
                  stroke={sp.color}
                  strokeWidth="2"
                  strokeDasharray="6 4"
                  opacity={opacity * 0.7}
                  className="transition-opacity duration-200"
                />
              )}

              {/* Main line */}
              {sp.linePath && (
                <path
                  d={sp.linePath}
                  fill="none"
                  stroke={sp.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  opacity={opacity}
                  className="transition-opacity duration-200"
                />
              )}

              {/* Data points */}
              {sp.data.map((d, i) => {
                if (!isFinite(d.value)) return null
                const isHovered = hoveredIndex === i
                return (
                  <circle
                    key={`pt-${i}`}
                    cx={xPos(i)}
                    cy={yPos(d.value)}
                    r={isHovered ? 5 : 3}
                    fill={sp.color}
                    stroke="white"
                    strokeWidth={isHovered ? 2 : 1}
                    opacity={opacity}
                    className="cursor-pointer transition-all duration-150"
                    onMouseEnter={() => handleMouseEnter(i, sp.id)}
                    onMouseLeave={handleMouseLeave}
                  />
                )
              })}

              {/* Projected data points */}
              {showProjected && sp.data.map((d, i) => {
                if (d.projected == null || !isFinite(d.projected)) return null
                const isHovered = hoveredIndex === i
                return (
                  <circle
                    key={`proj-pt-${i}`}
                    cx={xPos(i)}
                    cy={yPos(d.projected)}
                    r={isHovered ? 4 : 2.5}
                    fill="white"
                    stroke={sp.color}
                    strokeWidth={isHovered ? 2 : 1.5}
                    strokeDasharray="2 1"
                    opacity={opacity * 0.8}
                    className="cursor-pointer transition-all duration-150"
                    onMouseEnter={() => handleMouseEnter(i, sp.id)}
                    onMouseLeave={handleMouseLeave}
                  />
                )
              })}
            </g>
          )
        })}

        {/* ── BAR MODE ─────────────────────────────────────── */}
        {mode === 'bar' && seriesPaths.map((sp, sIdx) => {
          const numSeries = seriesPaths.length
          const isHighlighted = !hoveredSeriesId || hoveredSeriesId === sp.id
          const opacity = isHighlighted ? 1 : 0.3

          return (
            <g key={sp.id} data-testid={`${testId}-series-${sp.id}`}>
              {sp.data.map((d, i) => {
                if (!isFinite(d.value)) return null
                const baseX = xPos(i)
                const totalGroupW = barWidth * numSeries
                const barX = baseX - totalGroupW / 2 + sIdx * barWidth
                const barH = Math.abs(yPos(d.value) - yPos(0))
                const barY = d.value >= 0 ? yPos(d.value) : yPos(0)
                const isHovered = hoveredIndex === i && (!hoveredSeriesId || hoveredSeriesId === sp.id)

                return (
                  <g key={`bar-${i}`}>
                    {/* Actual value bar */}
                    <rect
                      x={barX}
                      y={barY}
                      width={barWidth}
                      height={Math.max(barH, 1)}
                      rx={2}
                      fill={sp.color}
                      opacity={isHovered ? opacity : opacity * 0.85}
                      className="cursor-pointer transition-opacity duration-150"
                      onMouseEnter={() => handleMouseEnter(i, sp.id)}
                      onMouseLeave={handleMouseLeave}
                    />
                    {/* Projected value bar (overlay, lighter) */}
                    {showProjected && d.projected != null && isFinite(d.projected) && (() => {
                      const projH = Math.abs(yPos(d.projected) - yPos(0))
                      const projY = d.projected >= 0 ? yPos(d.projected) : yPos(0)
                      return (
                        <rect
                          x={barX}
                          y={projY}
                          width={barWidth}
                          height={Math.max(projH, 1)}
                          rx={2}
                          fill="none"
                          stroke={sp.color}
                          strokeWidth="1.5"
                          strokeDasharray="4 2"
                          opacity={opacity * 0.5}
                          className="pointer-events-none"
                        />
                      )
                    })()}
                  </g>
                )
              })}
            </g>
          )
        })}

        {/* ── Hover tooltip ────────────────────────────────── */}
        {hoveredIndex !== null && (() => {
          const hx = xPos(hoveredIndex)

          // Vertical indicator line
          const tooltipLines: { name: string; value: string; projected?: string; color: string }[] = []
          for (const sp of seriesPaths) {
            const d = sp.data[hoveredIndex]
            if (!d) continue
            const line: { name: string; value: string; projected?: string; color: string } = {
              name: sp.name,
              value: tooltipFormat(d.value),
              color: sp.color,
            }
            if (showProjected && d.projected != null && isFinite(d.projected)) {
              line.projected = tooltipFormat(d.projected)
            }
            tooltipLines.push(line)
          }

          if (tooltipLines.length === 0) return null

          const tooltipW = 140
          const tooltipH = 16 + tooltipLines.length * 15 + (tooltipLines.some(l => l.projected) ? tooltipLines.length * 12 : 0)
          const tooltipX = Math.min(Math.max(hx - tooltipW / 2, PAD.left), W - PAD.right - tooltipW)
          const tooltipY = PAD.top + 4

          return (
            <g data-testid={`${testId}-tooltip`}>
              {/* Vertical hover line */}
              <line
                x1={hx}
                y1={PAD.top}
                x2={hx}
                y2={PAD.top + chartH}
                stroke="#a1a1aa"
                strokeWidth="1"
                strokeDasharray="3 3"
              />

              {/* Tooltip box */}
              <rect
                x={tooltipX}
                y={tooltipY}
                width={tooltipW}
                height={tooltipH}
                rx={6}
                fill="white"
                stroke="#e4e4e7"
                strokeWidth="1"
                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.08))"
              />

              {/* Label */}
              <text
                x={tooltipX + tooltipW / 2}
                y={tooltipY + 12}
                textAnchor="middle"
                fill="#71717a"
                style={{ fontSize: 9, fontWeight: 500 }}
              >
                {allLabels[hoveredIndex] || ''}
              </text>

              {/* Values */}
              {tooltipLines.map((line, i) => {
                const lineY = tooltipY + 24 + i * (line.projected ? 26 : 14)
                return (
                  <g key={i}>
                    {/* Color dot + name + value */}
                    <circle cx={tooltipX + 10} cy={lineY - 2} r={3} fill={line.color} />
                    <text
                      x={tooltipX + 18}
                      y={lineY}
                      fill="#52525b"
                      style={{ fontSize: 9 }}
                    >
                      {line.name}
                    </text>
                    <text
                      x={tooltipX + tooltipW - 8}
                      y={lineY}
                      textAnchor="end"
                      fill="#18181b"
                      style={{ fontSize: 10, fontWeight: 600 }}
                    >
                      {line.value}
                    </text>
                    {/* Projected value */}
                    {line.projected && (
                      <text
                        x={tooltipX + tooltipW - 8}
                        y={lineY + 12}
                        textAnchor="end"
                        fill="#a1a1aa"
                        style={{ fontSize: 8, fontStyle: 'italic' }}
                      >
                        prognose: {line.projected}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })()}
      </svg>

      {/* Legend */}
      {showLegend && series.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-3" data-testid={`${testId}-legend`}>
          {seriesPaths.map((sp) => (
            <div
              key={sp.id}
              className="flex items-center gap-1.5 cursor-default"
              onMouseEnter={() => setHoveredSeriesId(sp.id)}
              onMouseLeave={() => setHoveredSeriesId(null)}
            >
              {mode === 'bar' ? (
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: sp.color }}
                />
              ) : (
                <span
                  className="inline-block h-0.5 w-4 rounded-full"
                  style={{ backgroundColor: sp.color }}
                />
              )}
              <span className="text-[11px] font-medium text-zinc-600">
                {sp.name}
              </span>
            </div>
          ))}
          {showProjected && series.some(s => s.data.some(d => d.projected != null)) && (
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 rounded-full"
                style={{
                  background: `repeating-linear-gradient(90deg, ${theme.primary} 0px, ${theme.primary} 3px, transparent 3px, transparent 6px)`,
                }}
              />
              <span className="text-[11px] text-zinc-400">Prognose</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

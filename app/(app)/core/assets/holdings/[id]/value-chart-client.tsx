'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Loader2, TrendingUp, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/components/app/budget-shared'

type ValueHistoryPoint = {
  date: string
  value: number
  units: number
  price: number
  event: string
  cost_basis: number
}

type ValueHistoryResponse = {
  holding_id: string
  holding_name: string
  ticker: string | null
  history: ValueHistoryPoint[]
  current_value: number
  current_units: number
  current_price: number
}

export default function HoldingValueChartClient({
  holdingId,
}: {
  holdingId: string
}) {
  const [data, setData] = useState<ValueHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`/api/holdings/${holdingId}/value-history`)
      if (!res.ok) {
        if (res.status === 401) throw new Error('Niet ingelogd')
        throw new Error(`HTTP ${res.status}`)
      }
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon waardeverloop niet laden')
    } finally {
      setLoading(false)
    }
  }, [holdingId])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="value-chart-loading">
        <Loader2 className="h-6 w-6 animate-spin text-kern-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4" data-testid="value-chart-error">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
        <button
          onClick={() => { setLoading(true); loadHistory() }}
          className="mt-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
        >
          Opnieuw proberen
        </button>
      </div>
    )
  }

  if (!data || data.history.length < 2) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center" data-testid="value-chart-empty">
        <TrendingUp className="mx-auto h-8 w-8 text-zinc-300" />
        <p className="mt-2 text-sm text-zinc-500">
          Nog niet genoeg data voor een waardegrafiek.
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Voeg transacties toe om het waardeverloop te zien.
        </p>
      </div>
    )
  }

  return <ValueChart data={data} />
}

// ── SVG Value Chart ─────────────────────────────────────────────

function ValueChart({ data }: { data: ValueHistoryResponse }) {
  const { history } = data

  // Chart dimensions
  const width = 600
  const height = 250
  const padding = { top: 20, right: 20, bottom: 40, left: 65 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  // Compute value + cost basis ranges
  const allValues = history.map(p => p.value)
  const allCostBases = history.map(p => p.cost_basis)
  const allPoints = [...allValues, ...allCostBases]
  const minVal = Math.min(...allPoints) * 0.95
  const maxVal = Math.max(...allPoints) * 1.05
  const range = maxVal - minVal || 1

  // Scale functions
  const xScale = (i: number) => padding.left + (i / Math.max(1, history.length - 1)) * chartW
  const yScale = (v: number) => padding.top + chartH - ((v - minVal) / range) * chartH

  // Build SVG paths for value line
  const valuePath = history
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(p.value).toFixed(1)}`)
    .join(' ')

  // Build area fill under value line
  const valueAreaPath = `${valuePath} L ${xScale(history.length - 1).toFixed(1)} ${yScale(minVal).toFixed(1)} L ${xScale(0).toFixed(1)} ${yScale(minVal).toFixed(1)} Z`

  // Build cost basis line (dashed)
  const costPath = history
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i).toFixed(1)} ${yScale(p.cost_basis).toFixed(1)}`)
    .join(' ')

  // Y-axis labels (4 steps)
  const yLabels = useMemo(() => {
    const steps = 4
    return Array.from({ length: steps + 1 }, (_, i) => {
      const val = minVal + (range * i) / steps
      return { val, y: yScale(val) }
    })
  }, [minVal, range])

  // X-axis labels (show max 6 date labels)
  const xLabels = useMemo(() => {
    if (history.length <= 6) return history.map((p, i) => ({ label: formatDate(p.date), x: xScale(i) }))
    const step = Math.max(1, Math.floor((history.length - 1) / 5))
    const labels = []
    for (let i = 0; i < history.length; i += step) {
      labels.push({ label: formatDate(history[i].date), x: xScale(i) })
    }
    // Ensure the last point is shown
    const lastIdx = history.length - 1
    if (labels[labels.length - 1]?.x !== xScale(lastIdx)) {
      labels.push({ label: formatDate(history[lastIdx].date), x: xScale(lastIdx) })
    }
    return labels
  }, [history])

  // Hover state
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  // Overall P&L
  const firstValue = history[0].value
  const lastValue = history[history.length - 1].value
  const pnlAbs = lastValue - firstValue
  const pnlPct = firstValue > 0 ? (pnlAbs / firstValue) * 100 : 0

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="value-chart">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-kern-600" />
          <h3 className="text-sm font-semibold text-zinc-700">Waardeverloop</h3>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-6 rounded-full bg-kern-500" />
            <span className="text-zinc-500">Waarde</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-zinc-400" />
            <span className="text-zinc-500">Kostenbasis</span>
          </span>
        </div>
      </div>

      {/* P&L summary badge */}
      <div className="mb-3 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          pnlAbs >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`} data-testid="chart-pnl-badge">
          {pnlAbs >= 0 ? '▲' : '▼'} {pnlAbs >= 0 ? '+' : ''}{formatCurrency(pnlAbs)}
          <span className="ml-0.5 font-normal">
            ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
          </span>
        </span>
        <span className="text-[10px] text-zinc-400">
          {formatDate(history[0].date)} → {formatDate(history[history.length - 1].date)}
        </span>
      </div>

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ maxHeight: '280px' }}
        data-testid="value-chart-svg"
      >
        <defs>
          <linearGradient id="valueAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yLabels.map((l, i) => (
          <line
            key={i}
            x1={padding.left}
            y1={l.y}
            x2={width - padding.right}
            y2={l.y}
            stroke="#f4f4f5"
            strokeWidth="1"
          />
        ))}

        {/* Y-axis labels */}
        {yLabels.map((l, i) => (
          <text
            key={i}
            x={padding.left - 8}
            y={l.y + 3}
            textAnchor="end"
            fontSize="9"
            fill="#a1a1aa"
          >
            {formatShortCurrency(l.val)}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={height - 8}
            textAnchor="middle"
            fontSize="9"
            fill="#a1a1aa"
          >
            {l.label}
          </text>
        ))}

        {/* Value area fill */}
        <path
          d={valueAreaPath}
          fill="url(#valueAreaGrad)"
        />

        {/* Cost basis line (dashed) */}
        <path
          d={costPath}
          fill="none"
          stroke="#a1a1aa"
          strokeWidth="1.5"
          strokeDasharray="4 3"
          strokeLinejoin="round"
        />

        {/* Value line */}
        <path
          d={valuePath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {history.map((p, i) => (
          <g key={i}>
            {/* Invisible wider hit area for hover */}
            <circle
              cx={xScale(i)}
              cy={yScale(p.value)}
              r={12}
              fill="transparent"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: 'pointer' }}
            />
            {/* Visible dot */}
            <circle
              cx={xScale(i)}
              cy={yScale(p.value)}
              r={hoveredIdx === i ? 5 : 3}
              fill={hoveredIdx === i ? '#f59e0b' : '#fff'}
              stroke="#f59e0b"
              strokeWidth="2"
              data-testid={`chart-point-${i}`}
            />
          </g>
        ))}

        {/* Hover tooltip */}
        {hoveredIdx !== null && (
          <HoverTooltip
            point={history[hoveredIdx]}
            x={xScale(hoveredIdx)}
            y={yScale(history[hoveredIdx].value)}
            chartWidth={width}
            padding={padding}
          />
        )}
      </svg>

      {/* Transaction events timeline */}
      <div className="mt-3 flex flex-wrap gap-1.5" data-testid="chart-events">
        {history.map((p, i) => {
          const eventColors: Record<string, string> = {
            'Koop': 'bg-emerald-100 text-emerald-700',
            'Verkoop': 'bg-red-100 text-red-700',
            'Dividend': 'bg-kern-100 text-kern-700',
            'Aankoop': 'bg-emerald-100 text-emerald-700',
            'Huidig': 'bg-zinc-100 text-zinc-600',
          }
          return (
            <span
              key={i}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${eventColors[p.event] || 'bg-zinc-100 text-zinc-600'}`}
              data-testid={`chart-event-${i}`}
            >
              {p.event} · {formatDate(p.date)}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Tooltip component ───────────────────────────────────────────

function HoverTooltip({
  point,
  x,
  y,
  chartWidth,
  padding,
}: {
  point: ValueHistoryPoint
  x: number
  y: number
  chartWidth: number
  padding: { left: number; right: number }
}) {
  const tooltipW = 140
  const tooltipH = 72
  // Flip to left side if near right edge
  const flip = x + tooltipW + 10 > chartWidth - padding.right
  const tx = flip ? x - tooltipW - 10 : x + 10
  const ty = Math.max(5, y - tooltipH / 2)

  const pnl = point.value - point.cost_basis

  return (
    <g>
      <rect
        x={tx}
        y={ty}
        width={tooltipW}
        height={tooltipH}
        rx="6"
        fill="#18181b"
        fillOpacity="0.92"
      />
      <text x={tx + 8} y={ty + 15} fontSize="9" fill="#f59e0b" fontWeight="600">
        {point.event} · {formatDate(point.date)}
      </text>
      <text x={tx + 8} y={ty + 30} fontSize="10" fill="#fff" fontWeight="700">
        {formatCurrency(point.value)}
      </text>
      <text x={tx + 8} y={ty + 44} fontSize="9" fill="#a1a1aa">
        {point.units.toFixed(3)} eenheden @ {formatShortCurrency(point.price)}
      </text>
      <text x={tx + 8} y={ty + 58} fontSize="9" fill={pnl >= 0 ? '#34d399' : '#f87171'}>
        W/V: {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
      </text>
    </g>
  )
}

// ── Helpers ─────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: '2-digit' })
  } catch {
    return dateStr
  }
}

function formatShortCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `€${(value / 1_000_000).toFixed(1)}M`
  }
  if (Math.abs(value) >= 1_000) {
    return `€${(value / 1_000).toFixed(1)}K`
  }
  return `€${value.toFixed(0)}`
}

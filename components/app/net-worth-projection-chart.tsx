'use client'

import { useState } from 'react'
import type { NetWorthProjectionResult } from '@/lib/net-worth-projection'
import { formatProjectedValue, getProjectionMessage } from '@/lib/net-worth-projection'
import { TrendingUp, TrendingDown, Target, Info } from 'lucide-react'

/**
 * Net worth growth projection chart for De Kern.
 * Shows 1-5 year projection with FIRE target comparison line.
 *
 * Short-term tactical view (differs from Horizon's 30-year strategic projection).
 */
export function NetWorthProjectionChart({
  projection,
}: {
  projection: NetWorthProjectionResult
}) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null)
  const { points, fireTarget, fireReachedMonth, isGrowing, current } = projection

  if (points.length < 2) return null

  // Sample points for cleaner chart: every 3 months + first + last
  const sampled = points.filter((p, i) => i === 0 || i % 3 === 0 || i === points.length - 1)

  // Compute chart dimensions
  const W = 600
  const H = 220
  const PAD_LEFT = 50
  const PAD_RIGHT = 20
  const PAD_TOP = 24
  const PAD_BOTTOM = 35

  const chartW = W - PAD_LEFT - PAD_RIGHT
  const chartH = H - PAD_TOP - PAD_BOTTOM

  // Value range
  const allValues = sampled.map(p => p.netWorth)
  if (fireTarget > 0) allValues.push(fireTarget)
  const maxVal = Math.max(...allValues, current + 1000)
  const minVal = Math.min(...allValues, 0)
  const valRange = maxVal - minVal || 1

  // Coordinate helpers
  function xPos(idx: number) {
    return PAD_LEFT + (idx / (sampled.length - 1)) * chartW
  }
  function yPos(val: number) {
    return PAD_TOP + chartH - ((val - minVal) / valRange) * chartH
  }

  // Build line + area paths
  const linePath = sampled
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(p.netWorth).toFixed(1)}`)
    .join(' ')

  const areaPath =
    linePath +
    ` L${xPos(sampled.length - 1).toFixed(1)},${(PAD_TOP + chartH).toFixed(1)}` +
    ` L${PAD_LEFT},${(PAD_TOP + chartH).toFixed(1)} Z`

  // FIRE target line position
  const fireY = fireTarget > 0 ? yPos(fireTarget) : null
  const fireInRange = fireY !== null && fireY > PAD_TOP && fireY < PAD_TOP + chartH

  // "vandaag" marker (first point = current)
  const todayX = xPos(0)

  // Year markers at months 12, 24, 36, 48, 60
  const yearMarkers = [12, 24, 36, 48, 60].map(m => {
    const idx = sampled.findIndex(p => p.month === m)
    return idx >= 0 ? { idx, month: m, label: `${m / 12}j` } : null
  }).filter(Boolean) as { idx: number; month: number; label: string }[]

  // Contextual message
  const message = getProjectionMessage(projection)

  // Grid lines (4 horizontal)
  const gridLines = [0.25, 0.5, 0.75].map(pct => ({
    y: PAD_TOP + chartH - pct * chartH,
    val: minVal + pct * valRange,
  }))

  // Color based on growth direction
  const lineColor = isGrowing ? '#f59e0b' : '#ef4444'
  const fillColor = isGrowing ? '#f59e0b' : '#ef4444'

  return (
    <div data-testid="net-worth-projection-section">
      {/* Contextual message */}
      <div
        className={`mb-4 flex items-start gap-2.5 rounded-xl border p-3.5 ${
          isGrowing
            ? 'border-kern-200 bg-kern-50/60'
            : current === projection.year5
              ? 'border-zinc-200 bg-zinc-50/60'
              : 'border-red-200 bg-red-50/60'
        }`}
        data-testid="projection-context-message"
      >
        {isGrowing ? (
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
        ) : projection.year5 < current ? (
          <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        ) : (
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
        )}
        <p className={`text-sm font-medium ${
          isGrowing ? 'text-kern-800' : projection.year5 < current ? 'text-red-800' : 'text-zinc-700'
        }`}>
          {message}
        </p>
      </div>

      {/* Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: 240 }}
        data-testid="net-worth-projection-chart"
      >
        {/* Gradient definition */}
        <defs>
          <linearGradient id="nwProjGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={fillColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridLines.map(({ y, val }, i) => (
          <g key={i}>
            <line
              x1={PAD_LEFT}
              y1={y}
              x2={W - PAD_RIGHT}
              y2={y}
              stroke="#e4e4e7"
              strokeDasharray="4"
            />
            <text
              x={PAD_LEFT - 6}
              y={y + 3}
              textAnchor="end"
              className="fill-zinc-400"
              style={{ fontSize: 9 }}
            >
              {val >= 1_000_000
                ? `${(val / 1_000_000).toFixed(1)}M`
                : val >= 1000
                  ? `${(val / 1000).toFixed(0)}k`
                  : val.toFixed(0)}
            </text>
          </g>
        ))}

        {/* FIRE target comparison line */}
        {fireInRange && (
          <>
            <line
              x1={PAD_LEFT}
              y1={fireY!}
              x2={W - PAD_RIGHT}
              y2={fireY!}
              stroke="#8B5CB8"
              strokeWidth="1.5"
              strokeDasharray="6 3"
              data-testid="fire-target-line"
            />
            <text
              x={W - PAD_RIGHT + 2}
              y={fireY! + 3}
              className="fill-horizon-500"
              style={{ fontSize: 8, fontWeight: 600 }}
            >
              FIRE
            </text>
          </>
        )}

        {/* Area fill */}
        <path d={areaPath} fill="url(#nwProjGrad)" />

        {/* "vandaag" vertical marker */}
        <line
          x1={todayX}
          y1={PAD_TOP}
          x2={todayX}
          y2={PAD_TOP + chartH}
          stroke="#a1a1aa"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <text
          x={todayX}
          y={PAD_TOP - 4}
          textAnchor="middle"
          className="fill-zinc-400"
          style={{ fontSize: 8 }}
        >
          vandaag
        </text>

        {/* Projection line: solid for current, dashed for projected */}
        {/* First point (current) to rest (projected) */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeDasharray="6 3" />
        {/* Solid dot at current value */}
        <circle
          cx={xPos(0)}
          cy={yPos(sampled[0].netWorth)}
          r="4"
          fill={lineColor}
          stroke="white"
          strokeWidth="1.5"
        />

        {/* Data points at sampled intervals */}
        {sampled.map((p, i) => {
          if (i === 0) return null // Already drawn as solid dot
          return (
            <circle
              key={i}
              cx={xPos(i)}
              cy={yPos(p.netWorth)}
              r={hoveredPoint === i ? 4 : 2.5}
              fill={lineColor}
              stroke="white"
              strokeWidth="1"
              onMouseEnter={() => setHoveredPoint(i)}
              onMouseLeave={() => setHoveredPoint(null)}
              style={{ cursor: 'pointer' }}
            />
          )
        })}

        {/* FIRE reached marker */}
        {fireReachedMonth !== null && (() => {
          const fireIdx = sampled.findIndex(p => p.month >= fireReachedMonth)
          if (fireIdx < 0) return null
          const fx = xPos(fireIdx)
          const fy = yPos(sampled[fireIdx].netWorth)
          return (
            <g data-testid="fire-reached-marker">
              <line
                x1={fx} y1={PAD_TOP} x2={fx} y2={PAD_TOP + chartH}
                stroke="#8B5CB8" strokeWidth="1" strokeDasharray="3 3" opacity="0.5"
              />
              <text x={fx} y={fy - 10} textAnchor="middle" style={{ fontSize: 12 }}>🎯</text>
            </g>
          )
        })()}

        {/* Hover tooltip */}
        {hoveredPoint !== null && sampled[hoveredPoint] && (() => {
          const p = sampled[hoveredPoint]
          const hx = xPos(hoveredPoint)
          const hy = yPos(p.netWorth)
          const tooltipW = 120
          const tooltipX = Math.min(Math.max(hx - tooltipW / 2, 2), W - tooltipW - 2)
          return (
            <g>
              <rect
                x={tooltipX} y={hy - 38} width={tooltipW} height={28} rx={4}
                fill="white" stroke="#e4e4e7" strokeWidth="1"
                filter="drop-shadow(0 1px 3px rgba(0,0,0,0.1))"
              />
              <text
                x={tooltipX + tooltipW / 2} y={hy - 26}
                textAnchor="middle" className="fill-zinc-500" style={{ fontSize: 8 }}
              >
                {p.label}
              </text>
              <text
                x={tooltipX + tooltipW / 2} y={hy - 16}
                textAnchor="middle" className="fill-zinc-800" style={{ fontSize: 10, fontWeight: 600 }}
              >
                {formatProjectedValue(p.netWorth)}
              </text>
            </g>
          )
        })()}

        {/* Year markers on X-axis */}
        {yearMarkers.map(({ idx, label }) => (
          <g key={label}>
            <line
              x1={xPos(idx)} y1={PAD_TOP + chartH}
              x2={xPos(idx)} y2={PAD_TOP + chartH + 4}
              stroke="#a1a1aa" strokeWidth="1"
            />
            <text
              x={xPos(idx)} y={H - 8}
              textAnchor="middle" className="fill-zinc-500"
              style={{ fontSize: 10, fontWeight: 500 }}
            >
              {label}
            </text>
          </g>
        ))}

        {/* X-axis label for "vandaag" */}
        <text
          x={todayX} y={H - 8}
          textAnchor="middle" className="fill-zinc-400"
          style={{ fontSize: 9 }}
        >
          nu
        </text>

        {/* Legend */}
        <circle cx={PAD_LEFT} cy={H - 6} r="3" fill={lineColor} />
        <text x={PAD_LEFT + 7} y={H - 3} className="fill-zinc-500" style={{ fontSize: 9 }}>
          Prognose
        </text>
        {fireInRange && (
          <>
            <line
              x1={PAD_LEFT + 70} y1={H - 6}
              x2={PAD_LEFT + 82} y2={H - 6}
              stroke="#8B5CB8" strokeWidth="1.5" strokeDasharray="4 2"
            />
            <text x={PAD_LEFT + 86} y={H - 3} className="fill-zinc-500" style={{ fontSize: 9 }}>
              FIRE-doel
            </text>
          </>
        )}
      </svg>

      {/* Summary badges below chart */}
      <div className="mt-3 flex flex-wrap gap-2" data-testid="projection-summary-badges">
        <ProjectionBadge
          label="Over 1 jaar"
          value={formatProjectedValue(projection.year1)}
          delta={projection.year1 - current}
        />
        <ProjectionBadge
          label="Over 3 jaar"
          value={formatProjectedValue(projection.year3)}
          delta={projection.year3 - current}
        />
        <ProjectionBadge
          label="Over 5 jaar"
          value={formatProjectedValue(projection.year5)}
          delta={projection.year5 - current}
        />
        {fireReachedMonth !== null && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-horizon-200 bg-horizon-50 px-2.5 py-1 text-xs">
            <Target className="h-3 w-3 text-horizon-500" />
            <span className="font-medium text-horizon-700">
              FIRE in {Math.floor(fireReachedMonth / 12)}j{fireReachedMonth % 12 > 0 ? ` ${fireReachedMonth % 12}m` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function ProjectionBadge({
  label,
  value,
  delta,
}: {
  label: string
  value: string
  delta: number
}) {
  const isPositive = delta > 0
  const isNegative = delta < 0

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs">
      <span className="text-zinc-500">{label}:</span>
      <span className="font-medium text-zinc-800">{value}</span>
      <span className={`font-medium ${isPositive ? 'text-emerald-600' : isNegative ? 'text-red-600' : 'text-zinc-400'}`}>
        ({isPositive ? '+' : ''}{formatProjectedValue(delta)})
      </span>
    </div>
  )
}

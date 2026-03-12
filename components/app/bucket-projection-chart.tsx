'use client'

import { useState } from 'react'
import type { BucketProjectionResult, BucketRow } from '@/lib/bucket-projection'
import { ASSET_TYPE_COLORS, ASSET_TYPE_LABELS, type AssetType } from '@/lib/asset-data'
import { formatCurrency, formatFreedomTimeString, calculateFreedomTime } from '@/lib/format'
import { TrendingUp, TrendingDown, Info, ToggleLeft, ToggleRight } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

/**
 * Per-bucket vermogensprognose chart.
 * Stacked area chart showing asset types, debts, net worth,
 * and optional alternative Box 3 method comparison.
 * Supports nominaal/reëel display toggle and dynamic horizons.
 */
export function BucketProjectionChart({
  projection,
  dailyExpenses,
  fireTarget,
}: {
  projection: BucketProjectionResult
  dailyExpenses?: number
  fireTarget?: number
}) {
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null)
  const [showAlternative, setShowAlternative] = useState(false)
  const [showReal, setShowReal] = useState(false)
  const { ref, hasEntered, animationComplete } = useInViewAnimation({ duration: 700 })

  const { rows, alternativeRows, alternativeMethod, isGrowing, currentNetWorth } = projection

  if (rows.length < 2) return null

  const totalMonths = rows[rows.length - 1].month
  const totalYears = Math.round(totalMonths / 12)

  // Deflation helper: nominal → real
  const val = (v: number, row: BucketRow) => showReal ? v / row.inflationFactor : v

  // Dynamic sampling interval based on horizon
  const sampleInterval = totalMonths <= 60 ? 3 : totalMonths <= 120 ? 6 : 12
  const sampled = rows.filter((r, i) => i === 0 || r.month % sampleInterval === 0 || i === rows.length - 1)
  const sampledAlt = alternativeRows.filter((r, i) => i === 0 || r.month % sampleInterval === 0 || i === alternativeRows.length - 1)

  // Active asset types (those with non-zero values)
  const activeTypes = new Set<AssetType>()
  for (const row of sampled) {
    for (const [type, v] of Object.entries(row.assetBuckets)) {
      if (v && v > 0) activeTypes.add(type as AssetType)
    }
  }
  const orderedTypes = [...activeTypes] as AssetType[]

  // Chart dimensions
  const W = 640
  const H = 260
  const PAD_LEFT = 55
  const PAD_RIGHT = 20
  const PAD_TOP = 24
  const PAD_BOTTOM = 40
  const chartW = W - PAD_LEFT - PAD_RIGHT
  const chartH = H - PAD_TOP - PAD_BOTTOM

  // Value range — computed in display mode (nominal or real)
  const allNetWorths = sampled.map(r => val(r.netWorth, r))
  const allAssets = sampled.map(r => val(r.totalAssets, r))
  const maxVal = Math.max(...allAssets, ...(fireTarget ? [fireTarget] : []), ...allNetWorths)
  const minDebt = Math.max(...sampled.map(r => val(r.totalDebts, r)))
  const minVal = minDebt > 0 ? -minDebt * 0.3 : Math.min(0, ...allNetWorths)
  const valRange = (maxVal - minVal) || 1

  function xPos(idx: number) {
    return PAD_LEFT + (idx / Math.max(sampled.length - 1, 1)) * chartW
  }
  function yPos(v: number) {
    return PAD_TOP + chartH - ((v - minVal) / valRange) * chartH
  }

  // Build stacked area paths (bottom-up)
  function buildStackedAreas() {
    const areas: { type: AssetType; path: string; color: string }[] = []

    // Compute cumulative values per sample point
    const cumulatives: number[][] = sampled.map(() => [])
    for (let s = 0; s < sampled.length; s++) {
      let cumul = 0
      const f = showReal ? sampled[s].inflationFactor : 1
      for (const type of orderedTypes) {
        const v = (sampled[s].assetBuckets[type] ?? 0) / f
        cumul += v
        cumulatives[s].push(cumul)
      }
    }

    for (let t = orderedTypes.length - 1; t >= 0; t--) {
      const topPoints = sampled.map((_, s) => {
        const cumVal = cumulatives[s][t]
        return `${xPos(s).toFixed(1)},${yPos(cumVal).toFixed(1)}`
      })
      const bottomPoints = sampled.map((_, s) => {
        const cumVal = t > 0 ? cumulatives[s][t - 1] : 0
        return `${xPos(s).toFixed(1)},${yPos(cumVal).toFixed(1)}`
      }).reverse()

      const path = `M${topPoints.join(' L')} L${bottomPoints.join(' L')} Z`
      areas.push({ type: orderedTypes[t], path, color: ASSET_TYPE_COLORS[orderedTypes[t]] })
    }

    return areas
  }

  const stackedAreas = buildStackedAreas()

  // Net worth line
  const nwLinePath = sampled
    .map((r, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(val(r.netWorth, r)).toFixed(1)}`)
    .join(' ')

  // Alternative net worth line
  const altNwLinePath = sampledAlt
    .map((r, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(val(r.netWorth, r)).toFixed(1)}`)
    .join(' ')

  // Debt area (below x-axis conceptually, but shown as negative from total assets)
  const hasDebts = sampled.some(r => r.totalDebts > 0)

  // FIRE target line
  const fireY = fireTarget && fireTarget > 0 ? yPos(fireTarget) : null
  const fireInRange = fireY !== null && fireY > PAD_TOP && fireY < PAD_TOP + chartH

  // Dynamic year markers based on horizon
  const yearMarkerMonths: number[] = totalMonths <= 60
    ? [12, 24, 36, 48, 60]
    : totalMonths <= 120
      ? [12, 36, 60, 84, 120]
      : [12, 36, 60, 120, 180, 240]
  const yearMarkers = yearMarkerMonths
    .filter(m => m <= totalMonths)
    .map(m => {
      const idx = sampled.findIndex(r => r.month === m)
      return idx >= 0 ? { idx, label: `${m / 12}j` } : null
    })
    .filter(Boolean) as { idx: number; label: string }[]

  // Grid lines
  const gridLines = [0.25, 0.5, 0.75].map(pct => ({
    y: PAD_TOP + chartH - pct * chartH,
    val: minVal + pct * valRange,
  }))

  // End snapshot for contextual message (use last row)
  const endRow = rows[rows.length - 1]
  const endNetWorth = val(endRow.netWorth, endRow)
  const pctChange = currentNetWorth !== 0
    ? ((endNetWorth - currentNetWorth) / Math.abs(currentNetWorth) * 100).toFixed(0)
    : '0'
  const lineColor = isGrowing ? '#f59e0b' : '#ef4444'

  // Animation
  const lineAnim = hasEntered ? 'drawPath 700ms cubic-bezier(.22,1,.36,1) both' : 'none'
  const fillAnim = hasEntered ? 'fadeInFill 250ms ease-out 455ms both' : 'none'

  // Tooltip data
  const hoveredSample = hoveredMonth !== null ? sampled[hoveredMonth] : null
  const hoveredAlt = hoveredMonth !== null ? sampledAlt[hoveredMonth] : null

  // Badge helper: deflate milestone value
  const badgeVal = (nw: number, inflFactor: number) => showReal ? nw / inflFactor : nw

  return (
    <div ref={ref} data-testid="bucket-projection-section">
      {/* Contextual message */}
      <div
        className={`mb-4 flex items-start gap-2.5 rounded-[var(--r-lg)] border p-3.5 ${
          isGrowing
            ? 'border-kern-200 bg-kern-50/60'
            : endNetWorth < currentNetWorth
              ? 'border-red-200 bg-red-50/60'
              : 'border-[var(--border-ed)] bg-[var(--subtle)]/60'
        }`}
      >
        {isGrowing ? (
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-kern-600" />
        ) : endNetWorth < currentNetWorth ? (
          <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        ) : (
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" />
        )}
        <p className={`text-sm font-medium ${
          isGrowing ? 'text-kern-800' : endNetWorth < currentNetWorth ? 'text-red-800' : 'text-[var(--ink-2)]'
        }`}>
          {isGrowing
            ? `Je vermogen groeit met ${pctChange}% naar ${formatCurrency(endNetWorth)} over ${totalYears} jaar${showReal ? ' (in euro\u2019s van vandaag)' : ''} — per bucket berekend.`
            : endNetWorth < currentNetWorth
              ? `Let op: je vermogen daalt naar ${formatCurrency(endNetWorth)} over ${totalYears} jaar${showReal ? ' (reëel)' : ''}.`
              : `Je vermogen blijft stabiel rond ${formatCurrency(currentNetWorth)}.`
          }
        </p>
      </div>

      {/* Toggle buttons */}
      <div className="mb-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowReal(!showReal)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1 text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)]"
        >
          {showReal ? <ToggleRight className="h-3.5 w-3.5 text-kern-500" /> : <ToggleLeft className="h-3.5 w-3.5" />}
          Reële waarden
        </button>
        <button
          type="button"
          onClick={() => setShowAlternative(!showAlternative)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1 text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)]"
        >
          {showAlternative ? <ToggleRight className="h-3.5 w-3.5 text-kern-500" /> : <ToggleLeft className="h-3.5 w-3.5" />}
          Vergelijk {alternativeMethod === 'werkelijk' ? 'werkelijk' : 'forfaitair'} rendement
        </button>
      </div>

      {/* Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: 280 }}
        data-testid="bucket-projection-chart"
      >
        {/* Gradient defs for stacked areas */}
        <defs>
          {orderedTypes.map(type => (
            <linearGradient key={type} id={`bucketGrad-${type}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ASSET_TYPE_COLORS[type]} stopOpacity="0.6" />
              <stop offset="100%" stopColor={ASSET_TYPE_COLORS[type]} stopOpacity="0.15" />
            </linearGradient>
          ))}
        </defs>

        {/* Grid lines */}
        {gridLines.map(({ y, val: gv }, i) => (
          <g key={i}>
            <line
              x1={PAD_LEFT} y1={y} x2={W - PAD_RIGHT} y2={y}
              stroke="#e4e4e7" strokeDasharray="4"
            />
            <text x={PAD_LEFT - 6} y={y + 3} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>
              {gv >= 1_000_000 ? `${(gv / 1_000_000).toFixed(1)}M`
                : gv >= 1000 ? `${(gv / 1000).toFixed(0)}k`
                : gv.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Zero line */}
        <line
          x1={PAD_LEFT} y1={yPos(0)} x2={W - PAD_RIGHT} y2={yPos(0)}
          stroke="#a1a1aa" strokeWidth="0.5"
        />

        {/* FIRE target line */}
        {fireInRange && (
          <>
            <line
              x1={PAD_LEFT} y1={fireY!} x2={W - PAD_RIGHT} y2={fireY!}
              stroke="#8B5CB8" strokeWidth="1.5" strokeDasharray="6 3"
            />
            <text
              x={W - PAD_RIGHT + 2} y={fireY! + 3}
              className="fill-horizon-500" style={{ fontSize: 8, fontWeight: 600 }}
            >
              FIRE
            </text>
          </>
        )}

        {/* Stacked area fills */}
        {stackedAreas.map(({ type, path }) => (
          <path
            key={type}
            d={path}
            fill={`url(#bucketGrad-${type})`}
            style={{ animation: fillAnim }}
          />
        ))}

        {/* Net worth line */}
        <path
          d={nwLinePath}
          fill="none"
          stroke={lineColor}
          strokeWidth="2.5"
          strokeLinejoin="round"
          pathLength={1}
          style={{ animation: lineAnim }}
        />

        {/* Alternative net worth line (dashed) */}
        {showAlternative && (
          <path
            d={altNwLinePath}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.5"
            strokeDasharray="6 4"
            opacity="0.5"
            strokeLinejoin="round"
          />
        )}

        {/* "vandaag" marker */}
        <line
          x1={xPos(0)} y1={PAD_TOP} x2={xPos(0)} y2={PAD_TOP + chartH}
          stroke="#a1a1aa" strokeWidth="1" strokeDasharray="3 3"
        />
        <text
          x={xPos(0)} y={PAD_TOP - 4}
          textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 8 }}
        >
          vandaag
        </text>

        {/* Data point dots on net worth line */}
        {sampled.map((r, i) => (
          <circle
            key={i}
            cx={xPos(i)}
            cy={yPos(val(r.netWorth, r))}
            r={hoveredMonth === i ? 4 : 2}
            fill={lineColor}
            stroke="white"
            strokeWidth="1"
            opacity={hasEntered ? 1 : 0}
            style={{
              transition: hasEntered ? 'opacity 100ms ease-out 650ms' : 'none',
              cursor: animationComplete ? 'pointer' : 'default',
              pointerEvents: animationComplete ? 'auto' : 'none',
            }}
            onMouseEnter={animationComplete ? () => setHoveredMonth(i) : undefined}
            onMouseLeave={animationComplete ? () => setHoveredMonth(null) : undefined}
          />
        ))}

        {/* Hover tooltip */}
        {hoveredSample && hoveredMonth !== null && (() => {
          const displayNw = val(hoveredSample.netWorth, hoveredSample)
          const hx = xPos(hoveredMonth)
          const hy = yPos(displayNw)
          const tooltipW = 160
          const tooltipH = showAlternative ? 56 : 40
          const tooltipX = Math.min(Math.max(hx - tooltipW / 2, 2), W - tooltipW - 2)
          const tooltipY = Math.max(hy - tooltipH - 10, 2)
          return (
            <g>
              <rect
                x={tooltipX} y={tooltipY} width={tooltipW} height={tooltipH} rx={4}
                fill="white" stroke="#e4e4e7" strokeWidth="1"
                filter="drop-shadow(0 1px 3px rgba(0,0,0,0.1))"
              />
              <text x={tooltipX + 6} y={tooltipY + 13} className="fill-zinc-500" style={{ fontSize: 8 }}>
                Maand {hoveredSample.month} — {showReal ? 'Reëel netto' : 'Netto'}
              </text>
              <text x={tooltipX + 6} y={tooltipY + 26} className="fill-zinc-800" style={{ fontSize: 11, fontWeight: 600 }}>
                {formatCurrency(displayNw)}{showReal ? " (euro's van vandaag)" : ''}
              </text>
              {showAlternative && hoveredAlt && (
                <text x={tooltipX + 6} y={tooltipY + 42} className="fill-zinc-400" style={{ fontSize: 9 }}>
                  Alt: {formatCurrency(val(hoveredAlt.netWorth, hoveredAlt))} ({alternativeMethod})
                </text>
              )}
            </g>
          )
        })()}

        {/* Year markers */}
        {yearMarkers.map(({ idx, label }) => (
          <g key={label}>
            <line
              x1={xPos(idx)} y1={PAD_TOP + chartH} x2={xPos(idx)} y2={PAD_TOP + chartH + 4}
              stroke="#a1a1aa" strokeWidth="1"
            />
            <text
              x={xPos(idx)} y={H - 10}
              textAnchor="middle" className="fill-zinc-500"
              style={{ fontSize: 10, fontWeight: 500 }}
            >
              {label}
            </text>
          </g>
        ))}

        {/* X-axis "nu" label */}
        <text
          x={xPos(0)} y={H - 10}
          textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}
        >
          nu
        </text>
      </svg>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        {orderedTypes.map(type => (
          <div key={type} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ASSET_TYPE_COLORS[type] }} />
            <span className="text-[10px] text-[var(--ink-3)]">{ASSET_TYPE_LABELS[type]}</span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: lineColor }} />
          <span className="text-[10px] text-[var(--ink-3)]">Netto vermogen</span>
        </div>
        {showAlternative && (
          <div className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 rounded border-t border-dashed" style={{ borderColor: lineColor, opacity: 0.5 }} />
            <span className="text-[10px] text-[var(--ink-3)]">Alt. ({alternativeMethod})</span>
          </div>
        )}
        {fireInRange && (
          <div className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 rounded border-t border-dashed border-horizon-500" />
            <span className="text-[10px] text-[var(--ink-3)]">FIRE-doel</span>
          </div>
        )}
      </div>

      {/* Summary badges */}
      <div className="mt-3 flex flex-wrap gap-2" data-testid="bucket-projection-badges">
        <ProjectionBadge
          label="Over 1 jaar"
          value={formatCurrency(badgeVal(projection.year1.netWorth, projection.year1.inflationFactor))}
          delta={badgeVal(projection.year1.netWorth, projection.year1.inflationFactor) - currentNetWorth}
          dailyExpenses={dailyExpenses}
        />
        <ProjectionBadge
          label="Over 3 jaar"
          value={formatCurrency(badgeVal(projection.year3.netWorth, projection.year3.inflationFactor))}
          delta={badgeVal(projection.year3.netWorth, projection.year3.inflationFactor) - currentNetWorth}
          dailyExpenses={dailyExpenses}
        />
        <ProjectionBadge
          label="Over 5 jaar"
          value={formatCurrency(badgeVal(projection.year5.netWorth, projection.year5.inflationFactor))}
          delta={badgeVal(projection.year5.netWorth, projection.year5.inflationFactor) - currentNetWorth}
          dailyExpenses={dailyExpenses}
        />
        {projection.year10 && (
          <ProjectionBadge
            label="Over 10 jaar"
            value={formatCurrency(badgeVal(projection.year10.netWorth, projection.year10.inflationFactor))}
            delta={badgeVal(projection.year10.netWorth, projection.year10.inflationFactor) - currentNetWorth}
            dailyExpenses={dailyExpenses}
          />
        )}
        {projection.year20 && (
          <ProjectionBadge
            label="Over 20 jaar"
            value={formatCurrency(badgeVal(projection.year20.netWorth, projection.year20.inflationFactor))}
            delta={badgeVal(projection.year20.netWorth, projection.year20.inflationFactor) - currentNetWorth}
            dailyExpenses={dailyExpenses}
          />
        )}
      </div>
    </div>
  )
}

function ProjectionBadge({
  label,
  value,
  delta,
  dailyExpenses,
}: {
  label: string
  value: string
  delta: number
  dailyExpenses?: number
}) {
  const isPositive = delta > 0
  const isNegative = delta < 0

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1 text-xs">
      <span className="text-[var(--ink-3)]">{label}:</span>
      <span className="font-mono font-medium tabular-nums text-[var(--ink)]">{value}</span>
      <span className={`font-mono font-medium tabular-nums ${isPositive ? 'text-emerald-600' : isNegative ? 'text-red-600' : 'text-[var(--ink-3)]'}`}>
        ({isPositive ? '+' : ''}{formatCurrency(delta)})
      </span>
      {dailyExpenses && dailyExpenses > 0 && Math.abs(delta) > 0 && (
        <span className="text-[var(--ink-4)]">
          · {formatFreedomTimeString(calculateFreedomTime(Math.abs(delta), dailyExpenses), 'short')}
        </span>
      )}
    </div>
  )
}

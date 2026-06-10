'use client'

import { useState, useMemo, memo } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

import type { EntityBalanceHistory } from '@/lib/net-worth-data'
import { MaskedAmount } from '@/components/app/masked-amount'
import { ChartTips } from '@/components/editorial/chart-tips'
import { getBalanceHistoryTips } from '@/lib/chart-tips'

// ── Color palette for entities (warm, editorial tones) ─────────
const ENTITY_COLORS = [
  '#b8860b', // dark goldenrod
  '#6b8e23', // olive drab
  '#4682b4', // steel blue
  '#cd853f', // peru
  '#708090', // slate gray
  '#8b5c2a', // saddle brown lighter
  '#5f9ea0', // cadet blue
  '#a0522d', // sienna
  '#bc8f8f', // rosy brown
  '#6a5acd', // slate blue
]

const DEBT_COLORS = [
  '#b04040', // muted red
  '#c46040', // terra cotta
  '#a05060', // mauve
  '#906050', // warm brown-red
  '#805070', // plum
]

// ── Helpers ─────────────────────────────────────────────────────

function formatShortValue(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `€${(v / 1_000).toFixed(0)}k`
  return `€${v.toFixed(0)}`
}

function formatMonthLabel(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('nl-NL', { month: 'short' })
}

function formatFullLabel(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
}

// ── Types ───────────────────────────────────────────────────────

type BalanceHistoryChartProps = {
  entities: EntityBalanceHistory[]
  title?: string
  className?: string
  /** Optionele storage-key voor inline ChartTips. */
  tipsStorageKey?: string
}

// ── Component ───────────────────────────────────────────────────

export const BalanceHistoryChart = memo(function BalanceHistoryChart({
  entities,
  title = 'Vermogensopbouw',
  className,
  tipsStorageKey,
}: BalanceHistoryChartProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })

  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const [hoveredEntity, setHoveredEntity] = useState<string | null>(null)

  // Split into assets and debts
  const assetEntities = useMemo(() => entities.filter(e => e.entity_type === 'asset'), [entities])
  const debtEntities = useMemo(() => entities.filter(e => e.entity_type === 'debt'), [entities])

  // Collect all unique dates (sorted)
  const allDates = useMemo(() => {
    const dateSet = new Set<string>()
    for (const e of entities) {
      for (const p of e.points) dateSet.add(p.date)
    }
    return Array.from(dateSet).sort()
  }, [entities])

  // Build lookup: entity_id → date → balance
  const lookup = useMemo(() => {
    const map = new Map<string, Map<string, number>>()
    for (const e of entities) {
      const dateMap = new Map<string, number>()
      for (const p of e.points) dateMap.set(p.date, p.balance)
      map.set(e.entity_id, dateMap)
    }
    return map
  }, [entities])

  // For each date, compute stacked values
  const assetStacked = useMemo(() => {
    return allDates.map(date => {
      const values: { entity_id: string; value: number; cumulative: number }[] = []
      let cumulative = 0
      for (const e of assetEntities) {
        const val = lookup.get(e.entity_id)?.get(date) ?? 0
        cumulative += val
        values.push({ entity_id: e.entity_id, value: val, cumulative })
      }
      return { date, values, total: cumulative }
    })
  }, [allDates, assetEntities, lookup])

  const debtStacked = useMemo(() => {
    return allDates.map(date => {
      const values: { entity_id: string; value: number; cumulative: number }[] = []
      let cumulative = 0
      for (const e of debtEntities) {
        const val = lookup.get(e.entity_id)?.get(date) ?? 0
        cumulative += val
        values.push({ entity_id: e.entity_id, value: val, cumulative })
      }
      return { date, values, total: cumulative }
    })
  }, [allDates, debtEntities, lookup])

  if (allDates.length < 2 || entities.length === 0) {
    return (
      <div className={`rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6 text-center ${className ?? ''}`}>
        <p className="text-sm text-[var(--ink-3)]">
          Balanshistorie wordt opgebouwd bij de volgende maandelijkse snapshot.
        </p>
      </div>
    )
  }

  // ── SVG dimensions ──
  const W = 600
  const H = 260
  const PAD = { top: 16, right: 16, bottom: 28, left: 52 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const maxAsset = Math.max(...assetStacked.map(d => d.total), 1)
  const maxDebt = Math.max(...debtStacked.map(d => d.total), 0)
  const yMax = Math.max(maxAsset, maxDebt) * 1.1

  const xScale = (i: number) => PAD.left + (i / (allDates.length - 1)) * chartW
  const yScale = (v: number) => PAD.top + chartH - (v / yMax) * chartH

  // Build stacked area paths for assets
  const assetPaths = assetEntities.map((e, eIdx) => {
    const topPoints = allDates.map((_, di) => {
      const val = assetStacked[di].values[eIdx]?.cumulative ?? 0
      return `${xScale(di).toFixed(1)},${yScale(val).toFixed(1)}`
    })
    const bottomPoints = allDates.map((_, di) => {
      const prev = eIdx > 0 ? (assetStacked[di].values[eIdx - 1]?.cumulative ?? 0) : 0
      return `${xScale(di).toFixed(1)},${yScale(prev).toFixed(1)}`
    }).reverse()

    return {
      entity_id: e.entity_id,
      entity_name: e.entity_name,
      color: ENTITY_COLORS[eIdx % ENTITY_COLORS.length],
      d: `M${topPoints.join(' L')} L${bottomPoints.join(' L')} Z`,
    }
  })

  // Build stacked area paths for debts (rendered below zero line or as separate section)
  const debtPaths = debtEntities.map((e, eIdx) => {
    const topPoints = allDates.map((_, di) => {
      const val = debtStacked[di].values[eIdx]?.cumulative ?? 0
      return `${xScale(di).toFixed(1)},${yScale(val).toFixed(1)}`
    })
    const bottomPoints = allDates.map((_, di) => {
      const prev = eIdx > 0 ? (debtStacked[di].values[eIdx - 1]?.cumulative ?? 0) : 0
      return `${xScale(di).toFixed(1)},${yScale(prev).toFixed(1)}`
    }).reverse()

    return {
      entity_id: e.entity_id,
      entity_name: e.entity_name,
      color: DEBT_COLORS[eIdx % DEBT_COLORS.length],
      d: `M${topPoints.join(' L')} L${bottomPoints.join(' L')} Z`,
    }
  })

  // Grid lines
  const gridCount = 4
  const gridLines = Array.from({ length: gridCount + 1 }, (_, i) => {
    const val = (yMax / gridCount) * i
    return { y: yScale(val), label: formatShortValue(val) }
  })

  // X-axis labels (max ~8)
  const labelStep = Math.max(1, Math.floor(allDates.length / 7))
  const xLabels = allDates.filter((_, i) => i % labelStep === 0 || i === allDates.length - 1)

  // Hover column detection
  const colWidth = chartW / allDates.length
  const hoveredIdx = hoveredDate ? allDates.indexOf(hoveredDate) : -1

  // Latest totals
  const latestAssetTotal = assetStacked[assetStacked.length - 1]?.total ?? 0
  const latestDebtTotal = debtStacked[debtStacked.length - 1]?.total ?? 0

  return (
    <div ref={ref} className={className}>
      {/* Header */}
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--ink-2)]">{title}</h3>
        <div className="flex items-center gap-4 text-xs text-[var(--ink-3)]">
          <span className="font-mono tabular-nums">{<MaskedAmount value={latestAssetTotal} tone="kern" />} bezittingen</span>
          {latestDebtTotal > 0 && (
            <span className="font-mono tabular-nums">{<MaskedAmount value={latestDebtTotal} tone="kern" />} schulden</span>
          )}
          {tipsStorageKey && (
            <ChartTips
              storageKey={tipsStorageKey}
              tips={getBalanceHistoryTips({
                entityCount: entities.length,
                hasDebts: debtEntities.length > 0,
                monthCount: allDates.length,
              })}
              align="right"
            />
          )}
        </div>
      </div>

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: 280 }}
        onMouseLeave={() => { setHoveredDate(null); setHoveredEntity(null) }}
      >
        {/* Grid lines */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={g.y} x2={W - PAD.right} y2={g.y}
              stroke="var(--border-ed)" strokeWidth="0.5"
            />
            <text
              x={PAD.left - 6} y={g.y + 3}
              textAnchor="end" className="fill-[var(--ink-4)]"
              style={{ fontSize: 9, fontFamily: 'var(--font-dm-mono)' }}
            >
              {g.label}
            </text>
          </g>
        ))}

        {/* Asset stacked areas */}
        <g style={{
          opacity: hasEntered ? 1 : 0,
          transition: 'opacity 500ms cubic-bezier(.22,1,.36,1)',
        }}>
          {assetPaths.map((path) => (
            <path
              key={path.entity_id}
              d={path.d}
              fill={path.color}
              fillOpacity={hoveredEntity && hoveredEntity !== path.entity_id ? 0.15 : 0.55}
              stroke={path.color}
              strokeWidth={hoveredEntity === path.entity_id ? 1.5 : 0.5}
              style={{ transition: 'fill-opacity 150ms, stroke-width 150ms' }}
              onMouseEnter={() => setHoveredEntity(path.entity_id)}
              onMouseLeave={() => setHoveredEntity(null)}
            />
          ))}
        </g>

        {/* Debt stacked areas (dashed outline) */}
        {debtPaths.length > 0 && (
          <g style={{
            opacity: hasEntered ? 1 : 0,
            transition: 'opacity 500ms cubic-bezier(.22,1,.36,1) 200ms',
          }}>
            {debtPaths.map((path) => (
              <path
                key={path.entity_id}
                d={path.d}
                fill={path.color}
                fillOpacity={hoveredEntity && hoveredEntity !== path.entity_id ? 0.1 : 0.35}
                stroke={path.color}
                strokeWidth={hoveredEntity === path.entity_id ? 1.5 : 0.5}
                strokeDasharray="4 2"
                style={{ transition: 'fill-opacity 150ms, stroke-width 150ms' }}
                onMouseEnter={() => setHoveredEntity(path.entity_id)}
                onMouseLeave={() => setHoveredEntity(null)}
              />
            ))}
          </g>
        )}

        {/* Hover column */}
        {hoveredIdx >= 0 && (
          <line
            x1={xScale(hoveredIdx)} y1={PAD.top}
            x2={xScale(hoveredIdx)} y2={PAD.top + chartH}
            stroke="var(--ink-3)" strokeWidth="0.5" strokeDasharray="3 3"
          />
        )}

        {/* Invisible hover rects */}
        {allDates.map((date, i) => (
          <rect
            key={date}
            x={xScale(i) - colWidth / 2}
            y={PAD.top}
            width={colWidth}
            height={chartH}
            fill="transparent"
            onMouseEnter={() => setHoveredDate(date)}
          />
        ))}

        {/* X-axis labels */}
        {xLabels.map(date => {
          const i = allDates.indexOf(date)
          return (
            <text
              key={date}
              x={xScale(i)}
              y={H - 6}
              textAnchor="middle"
              className="fill-[var(--ink-4)]"
              style={{ fontSize: 9, fontFamily: 'var(--font-inter)' }}
            >
              {formatMonthLabel(date)}
            </text>
          )
        })}
      </svg>

      {/* Hover tooltip */}
      {hoveredDate && (
        <div className="mt-2 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 shadow-[var(--s1)]">
          <p className="mb-1 text-xs font-semibold text-[var(--ink-2)]">{formatFullLabel(hoveredDate)}</p>
          <div className="space-y-0.5">
            {assetEntities.map((e, eIdx) => {
              const val = lookup.get(e.entity_id)?.get(hoveredDate) ?? 0
              if (val === 0) return null
              return (
                <div key={e.entity_id} className="flex items-center justify-between gap-4 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: ENTITY_COLORS[eIdx % ENTITY_COLORS.length] }}
                    />
                    <span className="text-[var(--ink-2)]">{e.entity_name}</span>
                  </span>
                  <span className="font-mono tabular-nums text-[var(--ink)]">{<MaskedAmount value={val} tone="kern" />}</span>
                </div>
              )
            })}
            {debtEntities.map((e, eIdx) => {
              const val = lookup.get(e.entity_id)?.get(hoveredDate) ?? 0
              if (val === 0) return null
              return (
                <div key={e.entity_id} className="flex items-center justify-between gap-4 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: DEBT_COLORS[eIdx % DEBT_COLORS.length] }}
                    />
                    <span className="text-[var(--ink-2)]">{e.entity_name}</span>
                  </span>
                  <span className="font-mono tabular-nums text-negative">−{<MaskedAmount value={val} tone="kern" />}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3">
        {assetEntities.map((e, i) => (
          <button
            key={e.entity_id}
            type="button"
            className="flex items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-1 text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            onMouseEnter={() => setHoveredEntity(e.entity_id)}
            onMouseLeave={() => setHoveredEntity(null)}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: ENTITY_COLORS[i % ENTITY_COLORS.length] }}
            />
            {e.entity_name}
          </button>
        ))}
        {debtEntities.map((e, i) => (
          <button
            key={e.entity_id}
            type="button"
            className="flex items-center gap-1.5 rounded-[var(--r-sm)] px-2 py-1 text-xs text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            onMouseEnter={() => setHoveredEntity(e.entity_id)}
            onMouseLeave={() => setHoveredEntity(null)}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: DEBT_COLORS[i % DEBT_COLORS.length], opacity: 0.7 }}
            />
            {e.entity_name}
          </button>
        ))}
      </div>
    </div>
  )
})

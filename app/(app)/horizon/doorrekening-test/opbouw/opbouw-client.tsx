'use client'

import { useMemo, useState, useCallback, useRef } from 'react'
import { ChevronDown, ChevronRight, TrendingUp, Landmark, PiggyBank, BarChart3 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { ASSET_TYPE_LABELS, type Asset, type AssetType } from '@/lib/asset-data'
import { DEBT_TYPE_LABELS, type Debt, type DebtType } from '@/lib/debt-data'
import type { FireParams } from '@/lib/fire-params'
import { NL_FICTIEF_BELEGGINGEN, BOX3_TARIEF } from '@/lib/constants'
import type { SimCashflow } from '@/lib/fire-simulation'
import { computeLifeEventNetImpact, type LifeEvent } from '@/lib/horizon-data'
import { SettingsBanner } from '../settings-banner'
import { useDoorrekeningSettings } from '../settings-context'
import { useDoorrekeningSim } from '../use-doorrekening-sim'
import { CrossCheckPanel } from '@/components/app/doorrekening/cross-check-panel'
import type { HybridProjectionInputs } from '../calc/hybrid-projection'
import type { AfbouwDistributionStrategy, WithdrawalStrategy as AfbouwWithdrawalStrategy } from '../calc/afbouw-projection'
import { computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import {
  projectAssetYearly,
  projectDebtYearly,
  simulateAssetsWithEvents,
  computeBox3Tax,
  computeAssetMonthly,
  computeAmortization,
  type YearRow,
  type AmortizationRow,
  type AllocationStrategy,
  type EventAssetAllocation,
} from '../calc/opbouw-projection'
// SavingsRateTable + SavingsProjectionTable verhuisd naar gedeelde file
// in Fase G4 zodat overzicht + year-details-sheet ze kunnen hergebruiken
// zonder dit bestand te importeren.
import {
  SavingsRateTable,
  SavingsProjectionTable,
} from '@/components/app/doorrekening/savings-tables'

// ── Projection helpers ────────────────────────────────────────

const DEFAULT_PROJECTION_YEARS = 30

// ── Grouped types ────────────────────────────────────────────

function groupAssetsByType(assets: Asset[]) {
  const groups = new Map<AssetType, Asset[]>()
  for (const a of assets) {
    const list = groups.get(a.asset_type) ?? []
    list.push(a)
    groups.set(a.asset_type, list)
  }
  return groups
}

function groupDebtsByType(debts: Debt[]) {
  const groups = new Map<DebtType, Debt[]>()
  for (const d of debts) {
    const list = groups.get(d.debt_type) ?? []
    list.push(d)
    groups.set(d.debt_type, list)
  }
  return groups
}

// ── Stacked area chart (feature #633) ───────────────────────

// Horizon-purple-harmonieus palet: indigo → violet → cyan → teal
const ASSET_COLORS = [
  '#6366f1', // indigo-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#14b8a6', // teal-500
  '#818cf8', // indigo-400
  '#a78bfa', // violet-400
  '#22d3ee', // cyan-400
  '#2dd4bf', // teal-400
]
const DEBT_COLORS = [
  '#ef4444', // red-500
  '#f87171', // red-400
  '#fca5a5', // red-300
  '#f43f5e', // rose-500
  '#fb7185', // rose-400
]
const SAVINGS_COLOR = '#f59e0b' // amber-500

interface StackedSeries {
  label: string
  values: number[]
  color: string
  side: 'asset' | 'debt' | 'savings'
}

function StackedAreaChart({
  assets,
  debts,
  profileMonthlyIncome,
  profileSavingsRate,
  projectionYears,
  crossoverMonth,
}: {
  assets: Asset[]
  debts: Debt[]
  profileMonthlyIncome: number
  profileSavingsRate: number
  projectionYears: number
  crossoverMonth: number | null
}) {
  const totalMonths = projectionYears * 12
  const monthlySavings = profileMonthlyIncome * (profileSavingsRate / 100)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Build series data
  const series: StackedSeries[] = useMemo(() => {
    const result: StackedSeries[] = []

    // Asset series
    assets.forEach((a, idx) => {
      const monthlyRows = computeAssetMonthly(a, totalMonths, crossoverMonth)
      result.push({
        label: a.name,
        values: monthlyRows.map((r) => r.endValue),
        color: ASSET_COLORS[idx % ASSET_COLORS.length],
        side: 'asset',
      })
    })

    // Savings series (stops accumulating after crossover)
    if (monthlySavings > 0) {
      const savingsValues: number[] = []
      let cumSavings = 0
      for (let m = 1; m <= totalMonths; m++) {
        if (crossoverMonth == null || m <= crossoverMonth) {
          cumSavings += monthlySavings
        }
        savingsValues.push(cumSavings)
      }
      result.push({
        label: 'Spaargeld',
        values: savingsValues,
        color: SAVINGS_COLOR,
        side: 'savings',
      })
    }

    // Debt series (shown as negative)
    debts.forEach((d, idx) => {
      const rows = computeAmortization(d, totalMonths)
      const values: number[] = []
      for (let m = 1; m <= totalMonths; m++) {
        const row = rows.find((r) => r.month === m)
        values.push(row?.endBalance ?? 0)
      }
      result.push({
        label: d.name,
        values,
        color: DEBT_COLORS[idx % DEBT_COLORS.length],
        side: 'debt',
      })
    })

    return result
  }, [assets, debts, totalMonths, monthlySavings, crossoverMonth])

  // Use yearly sample points for readability
  const samplePoints = useMemo(() => {
    const points: number[] = []
    const step = projectionYears <= 10 ? 3 : projectionYears <= 20 ? 6 : 12
    for (let m = step; m <= totalMonths; m += step) {
      points.push(m - 1) // zero-indexed
    }
    if (points.length === 0) points.push(totalMonths - 1)
    if (points[points.length - 1] !== totalMonths - 1) points.push(totalMonths - 1)
    return points
  }, [totalMonths, projectionYears])

  const numPts = samplePoints.length

  // Compute stacked positive and negative values
  const assetSeries = series.filter((s) => s.side === 'asset' || s.side === 'savings')
  const debtSeries = series.filter((s) => s.side === 'debt')

  // Compute max/min for scale
  let maxVal = 0
  let minVal = 0
  for (const pt of samplePoints) {
    let posStack = 0
    for (const s of assetSeries) posStack += s.values[pt] ?? 0
    if (posStack > maxVal) maxVal = posStack

    let negStack = 0
    for (const s of debtSeries) negStack += s.values[pt] ?? 0
    if (negStack > minVal) minVal = negStack
  }
  // Debts shown below zero
  minVal = -minVal
  const range = (maxVal - minVal) || 1

  const w = 700
  const h = 300
  const px = 56
  const py = 28

  const toX = (i: number) => px + (i / Math.max(numPts - 1, 1)) * (w - 2 * px)
  const toY = (v: number) => py + (1 - (v - minVal) / range) * (h - 2 * py)

  // Build stacked area paths for positive series (assets + savings)
  const posAreaPaths = useMemo(() => {
    const stackedBottoms = samplePoints.map(() => 0)
    const paths: { path: string; color: string; label: string }[] = []

    for (const s of assetSeries) {
      const tops = samplePoints.map((pt, i) => {
        const val = stackedBottoms[i] + (s.values[pt] ?? 0)
        return val
      })

      // Build area: top line forward, bottom line backward
      let topLine = ''
      let bottomLine = ''
      for (let i = 0; i < numPts; i++) {
        const xCoord = toX(i).toFixed(1)
        topLine += `${i === 0 ? 'M' : 'L'}${xCoord},${toY(tops[i]).toFixed(1)} `
        bottomLine = `L${xCoord},${toY(stackedBottoms[i]).toFixed(1)} ` + bottomLine
      }
      bottomLine = bottomLine.replace(/^L/, 'L')

      paths.push({
        path: topLine + bottomLine + 'Z',
        color: s.color,
        label: s.label,
      })

      // Update bottoms
      for (let i = 0; i < numPts; i++) {
        stackedBottoms[i] = tops[i]
      }
    }

    return paths
  }, [assetSeries, samplePoints, numPts])

  // Build stacked area paths for negative series (debts)
  const negAreaPaths = useMemo(() => {
    const stackedBottoms = samplePoints.map(() => 0)
    const paths: { path: string; color: string; label: string }[] = []

    for (const s of debtSeries) {
      const tops = samplePoints.map((pt, i) => {
        const val = stackedBottoms[i] + (s.values[pt] ?? 0)
        return val
      })

      let topLine = ''
      let bottomLine = ''
      for (let i = 0; i < numPts; i++) {
        const xCoord = toX(i).toFixed(1)
        topLine += `${i === 0 ? 'M' : 'L'}${xCoord},${toY(-tops[i]).toFixed(1)} `
        bottomLine = `L${xCoord},${toY(-stackedBottoms[i]).toFixed(1)} ` + bottomLine
      }
      bottomLine = bottomLine.replace(/^L/, 'L')

      paths.push({
        path: topLine + bottomLine + 'Z',
        color: s.color,
        label: s.label,
      })

      for (let i = 0; i < numPts; i++) {
        stackedBottoms[i] = tops[i]
      }
    }

    return paths
  }, [debtSeries, samplePoints, numPts])

  // Net worth line (weighted by net_worth_inclusion_pct per asset)
  const netLine = useMemo(() => {
    // Build inclusion weight per asset series (savings always 100%)
    const assetWeights = assets.map(a => (a.net_worth_inclusion_pct ?? 100) / 100)
    return samplePoints
      .map((pt, i) => {
        let pos = 0
        let assetIdx = 0
        for (const s of assetSeries) {
          const val = s.values[pt] ?? 0
          if (s.side === 'asset') {
            pos += val * (assetWeights[assetIdx] ?? 1)
            assetIdx++
          } else {
            pos += val // savings at 100%
          }
        }
        let neg = 0
        for (const s of debtSeries) neg += s.values[pt] ?? 0
        const net = pos - neg
        return `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(net).toFixed(1)}`
      })
      .join(' ')
  }, [assetSeries, debtSeries, samplePoints, assets])

  // X-axis labels (years)
  const xLabels: { x: number; label: string }[] = useMemo(() => {
    const labels: { x: number; label: string }[] = []
    const step = projectionYears <= 10 ? 1 : projectionYears <= 20 ? 5 : projectionYears <= 40 ? 5 : 10
    for (let yr = 0; yr <= projectionYears; yr += step) {
      // Find closest sample point
      const targetMonth = yr * 12 - 1
      const closestIdx = samplePoints.reduce((best, pt, i) =>
        Math.abs(pt - targetMonth) < Math.abs(samplePoints[best] - targetMonth) ? i : best, 0)
      labels.push({ x: toX(closestIdx), label: `${yr}j` })
    }
    // Ensure last year
    if (labels.length === 0 || labels[labels.length - 1].label !== `${projectionYears}j`) {
      labels.push({ x: toX(numPts - 1), label: `${projectionYears}j` })
    }
    return labels
  }, [projectionYears, samplePoints, numPts])

  // Y-axis grid
  const yGridLines = [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
    y: py + frac * (h - 2 * py),
    val: maxVal - frac * range,
  }))

  // Legend items
  const legendItems = [
    ...assetSeries.map((s) => ({ label: s.label, color: s.color })),
    ...debtSeries.map((s) => ({ label: s.label, color: s.color })),
    { label: 'Netto vermogen', color: '#8b5cf6' },
  ]

  // ── Hover handlers ──
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * w
    // Find nearest sample point index
    let closest = 0
    let closestDist = Infinity
    for (let i = 0; i < numPts; i++) {
      const dist = Math.abs(toX(i) - mouseX)
      if (dist < closestDist) {
        closestDist = dist
        closest = i
      }
    }
    setHoverIdx(closest)
  }, [numPts, w])

  const handleMouseLeave = useCallback(() => setHoverIdx(null), [])

  // ── Tooltip data for hovered point ──
  const hoverData = useMemo(() => {
    if (hoverIdx == null) return null
    const pt = samplePoints[hoverIdx]
    const month = pt + 1
    const year = Math.ceil(month / 12)
    const items: { label: string; value: number; color: string; side: 'asset' | 'debt' | 'savings' }[] = []
    let totalAssets = 0
    let totalDebts = 0
    let assetIdx = 0
    for (const s of series) {
      const val = s.values[pt] ?? 0
      items.push({ label: s.label, value: val, color: s.color, side: s.side })
      if (s.side === 'asset') {
        const weight = (assets[assetIdx]?.net_worth_inclusion_pct ?? 100) / 100
        totalAssets += val * weight
        assetIdx++
      } else if (s.side === 'savings') {
        totalAssets += val
      }
      if (s.side === 'debt') totalDebts += val
    }
    return { year, month, items, totalAssets, totalDebts, netWorth: totalAssets - totalDebts }
  }, [hoverIdx, samplePoints, series])

  // Tooltip flip (show left of crosshair when past 60%)
  const tooltipFlip = hoverIdx != null && hoverIdx > numPts * 0.6

  return (
    <div className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} className="w-full" aria-label="Stacked area grafiek">
        {/* Grid lines */}
        {yGridLines.map(({ y, val }) => (
          <g key={val}>
            <line x1={px} y1={y} x2={w - px} y2={y} stroke="var(--border-ed)" strokeWidth={0.5} />
            <text x={px - 6} y={y + 3} textAnchor="end" fontSize={7} fill="var(--ink-4)" className="font-mono">
              {formatCurrency(val)}
            </text>
          </g>
        ))}
        {/* Zero line */}
        {minVal < 0 && (
          <line x1={px} y1={toY(0)} x2={w - px} y2={toY(0)} stroke="var(--ink-3)" strokeWidth={0.75} strokeDasharray="4 2" />
        )}
        {/* X axis labels */}
        {xLabels.map(({ x, label }, i) => (
          <text key={`xlabel-${i}`} x={x} y={h - 4} textAnchor="middle" fontSize={8} fill="var(--ink-4)" className="font-mono">
            {label}
          </text>
        ))}
        {/* Positive stacked areas (assets + savings) */}
        {posAreaPaths.map(({ path, color, label }, i) => (
          <path key={`pos-${i}-${label}`} d={path} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={0.5} />
        ))}
        {/* Negative stacked areas (debts) */}
        {negAreaPaths.map(({ path, color, label }, i) => (
          <path key={`neg-${i}-${label}`} d={path} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={0.5} />
        ))}
        {/* Net worth line */}
        <path d={netLine} fill="none" stroke="#8b5cf6" strokeWidth={2.5} />

        {/* ── Hover crosshair + dots ── */}
        {hoverIdx != null && hoverData != null && (
          <>
            <line
              x1={toX(hoverIdx)} x2={toX(hoverIdx)}
              y1={py} y2={h - py}
              stroke="var(--ink-3)" strokeWidth={0.75} strokeDasharray="3 2"
            />
            {/* Net worth dot */}
            <circle cx={toX(hoverIdx)} cy={toY(hoverData.netWorth)} r={4} fill="#8b5cf6" stroke="white" strokeWidth={1.5} />
          </>
        )}

        {/* Invisible hover rect for mouse tracking */}
        <rect
          x={px} y={py}
          width={w - 2 * px} height={h - 2 * py}
          fill="transparent"
          className="cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </svg>

      {/* ── Tooltip (HTML overlay) ── */}
      {hoverIdx != null && hoverData != null && (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            top: '8px',
            left: tooltipFlip ? undefined : `${(toX(hoverIdx) / w) * 100}%`,
            right: tooltipFlip ? `${100 - (toX(hoverIdx) / w) * 100}%` : undefined,
            transform: tooltipFlip ? 'translateX(8px)' : 'translateX(-50%)',
          }}
        >
          <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2.5 shadow-lg" style={{ minWidth: '190px' }}>
            {/* Header */}
            <div className="border-b border-[var(--border-ed)] pb-1.5 mb-1.5">
              <span className="font-mono text-xs font-bold tabular-nums text-[var(--ink)]">
                Jaar {hoverData.year} · mnd {hoverData.month}
              </span>
            </div>

            {/* Net worth */}
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: '#8b5cf6' }} />
                Netto vermogen
              </span>
              <span className="font-mono text-xs font-bold tabular-nums" style={{ color: '#8b5cf6' }}>
                {formatCurrency(hoverData.netWorth)}
              </span>
            </div>

            {/* Assets breakdown */}
            {hoverData.items.filter((it) => it.side === 'asset' || it.side === 'savings').length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Bezittingen</div>
                {hoverData.items
                  .filter((it) => it.side === 'asset' || it.side === 'savings')
                  .map((it, idx) => (
                    <div key={`asset-hover-${idx}-${it.label}`} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-[10px] text-[var(--ink-3)]">
                        <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: it.color, opacity: 0.8 }} />
                        <span className="truncate max-w-[100px]">{it.label}</span>
                      </span>
                      <span className="font-mono text-[10px] font-semibold tabular-nums text-emerald-600">
                        {formatCurrency(it.value)}
                      </span>
                    </div>
                  ))}
                {hoverData.items.filter((it) => it.side === 'asset' || it.side === 'savings').length > 1 && (
                  <div className="flex items-center justify-between gap-3 border-t border-[var(--border-ed)] pt-0.5">
                    <span className="text-[10px] font-medium text-[var(--ink-3)]">Totaal</span>
                    <span className="font-mono text-[10px] font-bold tabular-nums text-emerald-700">
                      {formatCurrency(hoverData.totalAssets)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Debts breakdown */}
            {hoverData.items.filter((it) => it.side === 'debt').length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">Schulden</div>
                {hoverData.items
                  .filter((it) => it.side === 'debt')
                  .map((it, idx) => (
                    <div key={`debt-hover-${idx}-${it.label}`} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-[10px] text-[var(--ink-3)]">
                        <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: it.color, opacity: 0.8 }} />
                        <span className="truncate max-w-[100px]">{it.label}</span>
                      </span>
                      <span className="font-mono text-[10px] font-semibold tabular-nums text-red-600">
                        -{formatCurrency(it.value)}
                      </span>
                    </div>
                  ))}
                {hoverData.items.filter((it) => it.side === 'debt').length > 1 && (
                  <div className="flex items-center justify-between gap-3 border-t border-[var(--border-ed)] pt-0.5">
                    <span className="text-[10px] font-medium text-[var(--ink-3)]">Totaal</span>
                    <span className="font-mono text-[10px] font-bold tabular-nums text-red-700">
                      -{formatCurrency(hoverData.totalDebts)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-2">
        {legendItems.map(({ label, color }, i) => (
          <div key={`legend-${i}-${label}`} className="flex items-center gap-1.5 text-[10px] text-[var(--ink-3)]">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color, opacity: label === 'Netto vermogen' ? 1 : 0.6 }} />
            <span className="truncate max-w-[120px]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Mini summary chart (SVG) ─────────────────────────────────

function SummaryChart({ assetTotals, debtTotals, netTotals, projectionYears, lifeEvents, currentAge }: {
  assetTotals: number[]
  debtTotals: number[]
  netTotals: number[]
  projectionYears: number
  lifeEvents: LifeEvent[]
  currentAge: number | null
}) {
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null)

  const allValues = [...assetTotals, ...debtTotals, ...netTotals]
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(...allValues, 0)
  const range = maxVal - minVal || 1

  const w = 600
  const h = 250 // Increased height to accommodate event labels at bottom
  const px = 48
  const py = 24
  const bottomPadding = 46 // Extra space for event labels below x-axis

  const numPoints = projectionYears
  const toX = (i: number) => px + (i / Math.max(numPoints - 1, 1)) * (w - 2 * px)
  const toY = (v: number) => py + (1 - (v - minVal) / range) * (h - 2 * py - bottomPadding + py)

  const makePath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')

  // Generate sensible x-axis labels based on projection years
  const xLabels: number[] = []
  const step = projectionYears <= 10 ? 1 : projectionYears <= 20 ? 5 : projectionYears <= 40 ? 5 : 10
  for (let yr = 0; yr <= projectionYears; yr += step) {
    xLabels.push(yr)
  }
  if (xLabels[xLabels.length - 1] !== projectionYears) {
    xLabels.push(projectionYears)
  }

  // Area fill under net worth line
  const makeAreaPath = (values: number[]) => {
    const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')
    const chartBottom = toY(minVal)
    const bottomRight = `L${toX(values.length - 1).toFixed(1)},${chartBottom.toFixed(1)}`
    const bottomLeft = `L${toX(0).toFixed(1)},${chartBottom.toFixed(1)}`
    return `${line} ${bottomRight} ${bottomLeft} Z`
  }

  // Compute life event markers within projection range
  const eventMarkers = useMemo(() => {
    if (currentAge == null || lifeEvents.length === 0) return []
    return lifeEvents
      .filter((e) => e.is_active && e.target_age != null)
      .map((e) => {
        const yearIndex = e.target_age! - currentAge
        if (yearIndex < 0 || yearIndex > projectionYears) return null
        const netImpact = computeLifeEventNetImpact(e)
        const isPositive = netImpact > 0
        const durationYears = e.duration_months > 0 ? e.duration_months / 12 : 0
        const endYearIndex = durationYears > 0 ? Math.min(yearIndex + durationYears, projectionYears) : yearIndex
        return {
          id: e.id,
          name: e.name,
          icon: e.icon,
          yearIndex,
          endYearIndex,
          isPositive,
          netImpact,
          hasDuration: durationYears > 0,
          targetAge: e.target_age!,
          durationMonths: e.duration_months,
          oneTimeCost: e.one_time_cost,
          monthlyIncome: e.monthly_income_change,
          monthlyCost: e.monthly_cost_change,
        }
      })
      .filter(Boolean) as {
        id: string; name: string; icon: string; yearIndex: number; endYearIndex: number;
        isPositive: boolean; netImpact: number; hasDuration: boolean; targetAge: number;
        durationMonths: number; oneTimeCost: number; monthlyIncome: number; monthlyCost: number;
      }[]
  }, [lifeEvents, currentAge, projectionYears])

  const chartBottom = toY(minVal)
  const chartTop = toY(maxVal)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" aria-label="Projectie grafiek">
      <defs>
        <linearGradient id="netAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-horizon-500)" stopOpacity={0.12} />
          <stop offset="100%" stopColor="var(--color-horizon-500)" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const yy = chartTop + frac * (chartBottom - chartTop)
        const val = maxVal - frac * range
        return (
          <g key={frac}>
            <line x1={px} y1={yy} x2={w - px} y2={yy} stroke="var(--border-ed)" strokeWidth={0.5} />
            <text x={px - 6} y={yy + 3} textAnchor="end" fontSize={8} fill="var(--ink-4)" className="font-mono">
              {formatCurrency(val)}
            </text>
          </g>
        )
      })}
      {/* X axis labels */}
      {xLabels.map((yr) => (
        <text key={yr} x={toX(yr)} y={chartBottom + 14} textAnchor="middle" fontSize={8} fill="var(--ink-4)" className="font-mono">
          {yr}j
        </text>
      ))}

      {/* Life event duration ranges (hatched background) */}
      {eventMarkers.filter((m) => m.hasDuration).map((marker) => (
        <rect
          key={`range-${marker.id}`}
          x={toX(marker.yearIndex)}
          y={chartTop}
          width={Math.max(0, toX(marker.endYearIndex) - toX(marker.yearIndex))}
          height={chartBottom - chartTop}
          fill={marker.isPositive ? 'var(--color-emerald-500)' : 'var(--color-amber-500)'}
          opacity={hoveredEvent === marker.id ? 0.12 : 0.06}
          rx={2}
        />
      ))}

      {/* Area fill under net worth */}
      <path d={makeAreaPath(netTotals)} fill="url(#netAreaGrad)" />
      {/* Asset line */}
      <path d={makePath(assetTotals)} fill="none" stroke="var(--color-emerald-500)" strokeWidth={2} />
      {/* Debt line */}
      <path d={makePath(debtTotals)} fill="none" stroke="var(--color-red-400)" strokeWidth={1.5} />
      {/* Net line */}
      <path d={makePath(netTotals)} fill="none" stroke="var(--color-horizon-500)" strokeWidth={2.5} />

      {/* Life event vertical marker lines + labels */}
      {eventMarkers.map((marker, idx) => {
        const x = toX(marker.yearIndex)
        const isHovered = hoveredEvent === marker.id
        const markerColor = marker.isPositive ? 'var(--color-emerald-600)' : 'var(--color-amber-600)'
        // Stagger labels vertically to avoid overlap
        const labelY = chartBottom + 26 + (idx % 2) * 12

        return (
          <g
            key={marker.id}
            onMouseEnter={() => setHoveredEvent(marker.id)}
            onMouseLeave={() => setHoveredEvent(null)}
            style={{ cursor: 'default' }}
          >
            {/* Vertical marker line */}
            <line
              x1={x} y1={chartTop} x2={x} y2={chartBottom}
              stroke={markerColor}
              strokeWidth={isHovered ? 1.5 : 1}
              strokeDasharray={marker.hasDuration ? '4 2' : '3 3'}
              opacity={isHovered ? 0.9 : 0.5}
            />

            {/* Arrow indicator: upward for positive, downward for negative */}
            {marker.isPositive ? (
              <polygon
                points={`${x},${chartTop + 4} ${x - 4},${chartTop + 12} ${x + 4},${chartTop + 12}`}
                fill={markerColor}
                opacity={isHovered ? 1 : 0.7}
              />
            ) : (
              <polygon
                points={`${x},${chartBottom - 4} ${x - 4},${chartBottom - 12} ${x + 4},${chartBottom - 12}`}
                fill={markerColor}
                opacity={isHovered ? 1 : 0.7}
              />
            )}

            {/* Icon + name label below x-axis */}
            <text
              x={x}
              y={labelY}
              textAnchor="middle"
              fontSize={7}
              fill={isHovered ? markerColor : 'var(--ink-3)'}
              fontWeight={isHovered ? 600 : 400}
            >
              {marker.icon} {marker.name.length > 14 ? marker.name.slice(0, 12) + '\u2026' : marker.name}
            </text>

            {/* Hover hitbox (invisible wider area for easier hover) */}
            <rect
              x={x - 12}
              y={chartTop}
              width={24}
              height={chartBottom - chartTop + 40}
              fill="transparent"
              onMouseEnter={() => setHoveredEvent(marker.id)}
              onMouseLeave={() => setHoveredEvent(null)}
            />

            {/* Tooltip on hover */}
            {isHovered && (
              <g>
                {/* Tooltip background */}
                <rect
                  x={Math.min(x - 70, w - px - 145)}
                  y={chartTop - 4}
                  width={140}
                  height={marker.hasDuration ? 52 : 40}
                  rx={4}
                  fill="var(--paper)"
                  stroke="var(--border-md)"
                  strokeWidth={0.5}
                  filter="drop-shadow(0 1px 3px rgba(0,0,0,0.08))"
                />
                {/* Event name */}
                <text
                  x={Math.min(x - 70, w - px - 145) + 8}
                  y={chartTop + 10}
                  fontSize={8}
                  fontWeight={600}
                  fill="var(--ink)"
                >
                  {marker.icon} {marker.name.length > 18 ? marker.name.slice(0, 16) + '\u2026' : marker.name}
                </text>
                {/* Age */}
                <text
                  x={Math.min(x - 70, w - px - 145) + 8}
                  y={chartTop + 22}
                  fontSize={7}
                  fill="var(--ink-3)"
                >
                  Leeftijd: {marker.targetAge}j
                  {marker.hasDuration && ` \u2014 ${Math.round(marker.durationMonths / 12 * 10) / 10}j duur`}
                </text>
                {/* Financial impact */}
                <text
                  x={Math.min(x - 70, w - px - 145) + 8}
                  y={chartTop + 33}
                  fontSize={7}
                  fill={marker.isPositive ? 'var(--color-emerald-600)' : 'var(--color-amber-600)'}
                  fontWeight={500}
                >
                  {marker.isPositive ? '\u25B2' : '\u25BC'} {formatCurrency(Math.abs(marker.netImpact))} netto impact
                </text>
                {/* Details line for duration events */}
                {marker.hasDuration && (
                  <text
                    x={Math.min(x - 70, w - px - 145) + 8}
                    y={chartTop + 44}
                    fontSize={7}
                    fill="var(--ink-4)"
                  >
                    {marker.oneTimeCost > 0 && `Eenmalig: ${formatCurrency(marker.oneTimeCost)}`}
                    {marker.monthlyCost > 0 && ` Mnd: -${formatCurrency(marker.monthlyCost)}`}
                    {marker.monthlyIncome > 0 && ` Mnd: +${formatCurrency(marker.monthlyIncome)}`}
                  </text>
                )}
              </g>
            )}
          </g>
        )
      })}

      {/* End dots */}
      {netTotals.length > 0 && (
        <>
          <circle cx={toX(netTotals.length - 1)} cy={toY(netTotals[netTotals.length - 1])} r={3.5} fill="var(--color-horizon-500)" />
          <circle cx={toX(assetTotals.length - 1)} cy={toY(assetTotals[assetTotals.length - 1])} r={3} fill="var(--color-emerald-500)" />
          <circle cx={toX(debtTotals.length - 1)} cy={toY(debtTotals[debtTotals.length - 1])} r={3} fill="var(--color-red-400)" />
        </>
      )}
      {/* Legend */}
      <circle cx={px + 10} cy={12} r={4} fill="var(--color-emerald-500)" />
      <text x={px + 18} y={15} fontSize={9} fill="var(--ink-2)">Bezittingen</text>
      <circle cx={px + 100} cy={12} r={4} fill="var(--color-red-400)" />
      <text x={px + 108} y={15} fontSize={9} fill="var(--ink-2)">Schulden</text>
      <circle cx={px + 180} cy={12} r={4} fill="var(--color-horizon-500)" />
      <text x={px + 188} y={15} fontSize={9} fill="var(--ink-2)">Netto vermogen</text>
    </svg>
  )
}

// ── Data table component ─────────────────────────────────────

function getDisplayYears(projectionYears: number): number[] {
  if (projectionYears <= 10) {
    return Array.from({ length: projectionYears }, (_, i) => i + 1)
  }
  const years: number[] = [1]
  const step = projectionYears <= 20 ? 5 : projectionYears <= 40 ? 5 : 10
  for (let y = step; y <= projectionYears; y += step) {
    years.push(y)
  }
  if (years[years.length - 1] !== projectionYears) {
    years.push(projectionYears)
  }
  return years
}

function ProjectionTable({ title, columns, color, projectionYears, defaultExpanded }: {
  title: string
  columns: { label: string; rows: YearRow[] }[]
  color: string
  projectionYears: number
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? true)

  if (columns.length === 0) return null

  const displayYears = getDisplayYears(projectionYears)
  const currentTotal = columns.reduce((sum, col) => sum + (col.rows[0]?.value ?? 0), 0)
  const finalTotal = columns.reduce((sum, col) => sum + (col.rows[projectionYears - 1]?.value ?? 0), 0)

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex w-full items-center justify-between border-b border-[var(--border-ed)] px-4 py-3 text-left transition-colors hover:brightness-95 ${color}`}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--ink-3)]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-3)]" />
          )}
          <h3 className="text-sm font-semibold text-[var(--ink)]">{title}</h3>
          <span className="text-[10px] text-[var(--ink-4)]">({columns.length})</span>
        </div>
        {!expanded && (
          <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums">
            <span className="text-[var(--ink-3)]">Jaar 1: {formatCurrency(currentTotal)}</span>
            <span className="text-[var(--ink-2)]">Jaar {projectionYears}: {formatCurrency(finalTotal)}</span>
          </div>
        )}
      </button>
      {expanded && <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
              <th className="px-3 py-1.5 text-left font-medium text-[var(--ink-3)]">Jaar</th>
              {columns.map((col, ci) => (
                <th key={`col-h-${ci}-${col.label}`} className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">
                  {col.label}
                </th>
              ))}
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-2)]">Totaal</th>
            </tr>
          </thead>
          <tbody>
            {displayYears.map((yr, idx) => {
              const total = columns.reduce((sum, col) => sum + (col.rows[yr - 1]?.value ?? 0), 0)
              return (
                <tr key={yr} className={`border-b border-[var(--border-ed)] last:border-b-0 hover:bg-[var(--subtle)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}>
                  <td className="px-3 py-1 font-mono tabular-nums text-[var(--ink-3)]">{yr}</td>
                  {columns.map((col, ci) => (
                    <td key={`col-${yr}-${ci}-${col.label}`} className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                      {formatCurrency(col.rows[yr - 1]?.value ?? 0)}
                    </td>
                  ))}
                  <td className="px-3 py-1 text-right font-mono tabular-nums font-semibold text-[var(--ink)]">
                    {formatCurrency(total)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>}
    </div>
  )
}

// ── Per-asset monthly detail table ───────────────────────────

function getDisplayMonths(totalMonths: number): number[] {
  if (totalMonths <= 24) {
    return Array.from({ length: totalMonths }, (_, i) => i + 1)
  }
  // Show first 6 months, then every 6 months, plus the last month
  const months: number[] = [1, 2, 3, 4, 5, 6]
  for (let m = 12; m <= totalMonths; m += 6) {
    if (!months.includes(m)) months.push(m)
  }
  if (!months.includes(totalMonths)) months.push(totalMonths)
  return months.sort((a, b) => a - b)
}

function AssetMonthlyTable({ asset, projectionYears, crossoverMonth }: {
  asset: Asset
  projectionYears: number
  crossoverMonth: number | null
}) {
  const totalMonths = projectionYears * 12
  const rows = useMemo(() => computeAssetMonthly(asset, totalMonths, crossoverMonth), [asset, totalMonths, crossoverMonth])
  const displayMonths = useMemo(() => getDisplayMonths(totalMonths), [totalMonths])

  const annualReturn = Number(asset.expected_return)

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="border-b border-[var(--border-ed)] bg-emerald-50/40 px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">
          {asset.name}
          {(asset.net_worth_inclusion_pct ?? 100) < 100 && (
            <span className="ml-2 text-[10px] font-normal text-[var(--ink-4)]">({asset.net_worth_inclusion_pct}% meegeteld in netto vermogen)</span>
          )}
        </h3>
        <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
          Startwaarde {formatCurrency(Number(asset.current_value))} · Rendement {annualReturn.toFixed(1)}%/jr · Inleg {formatCurrency(Number(asset.monthly_contribution))}/mnd
        </p>
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
              <th className="px-3 py-1.5 text-left font-medium text-[var(--ink-3)]">Maand</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Startwaarde</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Rendement</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Inleg</th>
              <th className="px-3 py-1.5 text-right font-medium text-emerald-600">Eindwaarde</th>
            </tr>
          </thead>
          <tbody>
            {displayMonths.map((m, idx) => {
              const row = rows[m - 1]
              if (!row) return null
              return (
                <tr key={m} className={`border-b border-[var(--border-ed)] last:border-b-0 hover:bg-[var(--subtle)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}>
                  <td className="px-3 py-1 font-mono tabular-nums text-[var(--ink-3)]">{m}</td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {formatCurrency(row.startValue)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {formatCurrency(row.rendement)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {formatCurrency(row.inleg)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums font-semibold text-emerald-600">
                    {formatCurrency(row.endValue)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Collapsible section header ──────────────────────────────

function SectionHeader({ icon, title, subtitle, color, count, expanded, onToggle }: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  color: string
  count: number
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-xl border border-[var(--border-ed)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)]/50 ${color}`}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--paper)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-[var(--ink)]">{title}</h2>
          <span className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-3)]">
            {count}
          </span>
        </div>
        {subtitle && (
          <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">{subtitle}</p>
        )}
      </div>
      {expanded ? (
        <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
      ) : (
        <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />
      )}
    </button>
  )
}

// ── Savings rate + projection tables ────────────────────────────
//
// Deze componenten (`SavingsRateTable`, `SavingsProjectionTable`) zijn
// in Fase G4 verhuisd naar `@/components/app/doorrekening/savings-tables`
// zodat ze ook vanuit de overzicht-pagina en de year-details-sheet
// hergebruikt kunnen worden zonder deze grote client-file te importeren.
// Bij oorzaak-twijfel: zie `kun-je-een-mogelijkheid-glittery-waterfall.md`.

// ── Per-debt amortization table (month-by-month) ────────────

function getAmortizationDisplayMonths(rows: AmortizationRow[]): number[] {
  const total = rows.length
  if (total <= 24) {
    return rows.map((r) => r.month)
  }
  // Show first 3 months, then every 6 months, plus last month
  const months: number[] = [1, 2, 3]
  for (let m = 6; m <= total; m += 6) {
    if (!months.includes(m)) months.push(m)
  }
  if (!months.includes(total)) months.push(total)
  return months.sort((a, b) => a - b)
}

function DebtAmortizationTable({ debt, projectionYears }: {
  debt: Debt
  projectionYears: number
}) {
  const maxMonths = projectionYears * 12
  const rows = useMemo(() => computeAmortization(debt, maxMonths), [debt, maxMonths])
  const displayMonths = useMemo(() => getAmortizationDisplayMonths(rows), [rows])

  if (rows.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
        <div className="border-b border-[var(--border-ed)] bg-red-50/30 px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--ink)]">{debt.name}</h3>
        </div>
        <div className="p-4 text-center text-sm text-[var(--ink-3)]">
          Deze schuld is al afgelost.
        </div>
      </div>
    )
  }

  const totalInterest = rows.reduce((s, r) => s + r.interest, 0)
  const totalRepayment = rows.reduce((s, r) => s + r.repayment, 0)
  const paidOff = rows[rows.length - 1].endBalance <= 0.01
  const paidOffMonth = paidOff ? rows.length : null

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="border-b border-[var(--border-ed)] bg-red-50/30 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--ink)]">{debt.name}</h3>
          <div className="flex items-center gap-3 text-[10px] text-[var(--ink-4)]">
            <span>Saldo: <span className="font-mono tabular-nums font-semibold text-red-500">{formatCurrency(Number(debt.current_balance))}</span></span>
            <span>Rente: <span className="font-mono tabular-nums">{Number(debt.interest_rate).toFixed(2)}%</span></span>
            <span>Betaling: <span className="font-mono tabular-nums">{formatCurrency(Number(debt.monthly_payment))}/mnd</span></span>
            {paidOffMonth && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 font-medium">
                Afgelost in {paidOffMonth} mnd
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
              <th className="px-3 py-1.5 text-left font-medium text-[var(--ink-3)]">Maand</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Restant</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Rente</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Aflossing</th>
              <th className="px-3 py-1.5 text-right font-medium text-red-500">Nieuw restant</th>
            </tr>
          </thead>
          <tbody>
            {displayMonths.map((month, idx) => {
              const row = rows.find((r) => r.month === month)
              if (!row) return null
              const isZeroBalance = row.endBalance <= 0.01
              return (
                <tr key={month} className={`border-b border-[var(--border-ed)] last:border-b-0 hover:bg-[var(--subtle)]/50 ${isZeroBalance ? 'bg-emerald-50/60' : idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}>
                  <td className="px-3 py-1 font-mono tabular-nums text-[var(--ink-3)]">{month}</td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {formatCurrency(row.startBalance)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-3)]">
                    {formatCurrency(row.interest)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-emerald-600">
                    {formatCurrency(row.repayment)}
                  </td>
                  <td className={`px-3 py-1 text-right font-mono tabular-nums font-semibold ${isZeroBalance ? 'text-emerald-600' : 'text-red-500'}`}>
                    {formatCurrency(row.endBalance)}
                    {isZeroBalance && <span className="ml-1 text-[9px]">✓</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]/50">
              <td className="px-3 py-1 font-medium text-[var(--ink-3)]">Totaal</td>
              <td className="px-3 py-1" />
              <td className="px-3 py-1 text-right font-mono tabular-nums font-semibold text-[var(--ink-3)]">
                {formatCurrency(totalInterest)}
              </td>
              <td className="px-3 py-1 text-right font-mono tabular-nums font-semibold text-emerald-600">
                {formatCurrency(totalRepayment)}
              </td>
              <td className="px-3 py-1 text-right font-mono tabular-nums font-semibold text-red-500">
                {formatCurrency(rows[rows.length - 1].endBalance)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}


// ── Net worth monthly table (feature #629) ──────────────────

function NetWorthMonthlyTable({
  assets,
  debts,
  profileMonthlyIncome,
  profileSavingsRate,
  projectionYears,
  crossoverMonth,
}: {
  assets: Asset[]
  debts: Debt[]
  profileMonthlyIncome: number
  profileSavingsRate: number
  projectionYears: number
  crossoverMonth: number | null
}) {
  const totalMonths = projectionYears * 12
  const monthlySavings = profileMonthlyIncome * (profileSavingsRate / 100)

  const assetMonthlyData = useMemo(
    () => assets.map((a) => ({ name: a.name, rows: computeAssetMonthly(a, totalMonths, crossoverMonth) })),
    [assets, totalMonths, crossoverMonth],
  )

  const debtMonthlyData = useMemo(
    () => debts.map((d) => ({ name: d.name, rows: computeAmortization(d, totalMonths) })),
    [debts, totalMonths],
  )

  const displayMonths = useMemo(() => getDisplayMonths(totalMonths), [totalMonths])

  const hasAssets = assets.length > 0
  const hasDebts = debts.length > 0
  const hasSavings = monthlySavings > 0

  if (!hasAssets && !hasDebts && !hasSavings) return null

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="border-b border-[var(--border-ed)] bg-horizon-50/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Netto vermogen per maand</h3>
        <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
          Bezittingen − schulden + cumulatief spaargeld = netto vermogen
        </p>
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
              <th className="sticky left-0 z-20 bg-[var(--subtle)] px-3 py-1.5 text-left font-medium text-[var(--ink-3)]">
                Maand
              </th>
              {assetMonthlyData.map((a, aIdx) => {
                const pct = assets[aIdx]?.net_worth_inclusion_pct ?? 100
                return (
                <th
                  key={`asset-${aIdx}-${a.name}`}
                  className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-emerald-600"
                >
                  {a.name}{pct < 100 && <span className="ml-1 text-[9px] text-[var(--ink-4)]">({pct}%)</span>}
                </th>
                )
              })}
              {hasAssets && (
                <th className="whitespace-nowrap px-3 py-1.5 text-right font-semibold text-emerald-700 bg-emerald-50/40">
                  ∑ Bezittingen
                </th>
              )}
              {debtMonthlyData.map((d, dIdx) => (
                <th
                  key={`debt-${dIdx}-${d.name}`}
                  className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-red-500"
                >
                  {d.name}
                </th>
              ))}
              {hasDebts && (
                <th className="whitespace-nowrap px-3 py-1.5 text-right font-semibold text-red-600 bg-red-50/30">
                  ∑ Schulden
                </th>
              )}
              {hasSavings && (
                <th className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-amber-600">
                  Spaargeld
                </th>
              )}
              <th className="whitespace-nowrap px-3 py-1.5 text-right font-semibold text-horizon-600 bg-horizon-50/30">
                Netto vermogen
              </th>
            </tr>
          </thead>
          <tbody>
            {displayMonths.map((month, idx) => {
              let assetTotal = 0
              const assetValues = assetMonthlyData.map((a, aIdx) => {
                const val = a.rows[month - 1]?.endValue ?? 0
                const weight = (assets[aIdx]?.net_worth_inclusion_pct ?? 100) / 100
                assetTotal += val * weight
                return val
              })

              let debtTotal = 0
              const debtValues = debtMonthlyData.map((d) => {
                const row = d.rows.find((r) => r.month === month)
                const val = row?.endBalance ?? 0
                debtTotal += val
                return val
              })

              const savings = hasSavings ? monthlySavings * month : 0
              const netWorth = assetTotal - debtTotal + savings

              return (
                <tr
                  key={month}
                  className={`border-b border-[var(--border-ed)] last:border-b-0 hover:bg-[var(--subtle)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}
                >
                  <td className="sticky left-0 z-10 bg-inherit px-3 py-1 font-mono tabular-nums text-[var(--ink-3)]">
                    {month}
                  </td>
                  {assetValues.map((val, i) => (
                    <td
                      key={`a-${i}`}
                      className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]"
                    >
                      {formatCurrency(val)}
                    </td>
                  ))}
                  {hasAssets && (
                    <td className="px-3 py-1 text-right font-mono tabular-nums font-semibold text-emerald-700 bg-emerald-50/20">
                      {formatCurrency(assetTotal)}
                    </td>
                  )}
                  {debtValues.map((val, i) => (
                    <td
                      key={`d-${i}`}
                      className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]"
                    >
                      {formatCurrency(val)}
                    </td>
                  ))}
                  {hasDebts && (
                    <td className="px-3 py-1 text-right font-mono tabular-nums font-semibold text-red-600 bg-red-50/20">
                      {formatCurrency(debtTotal)}
                    </td>
                  )}
                  {hasSavings && (
                    <td className="px-3 py-1 text-right font-mono tabular-nums text-amber-600">
                      {formatCurrency(savings)}
                    </td>
                  )}
                  <td className="px-3 py-1 text-right font-mono tabular-nums font-bold text-horizon-600 bg-horizon-50/15">
                    {formatCurrency(netWorth)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Total overview table ─────────────────────────────────────

/** Tooltip that shows per-asset allocation for an event cell */
// ── Event-toewijzingen summary (Stap 3) ─────────────────────────

/**
 * Toont per life-event de totale verdeling over de bezittingen. Aggregeert
 * `eventAllocations` over alle jaren en rendert per event een strook met
 * bedrag + percentage per asset + mini horizontale bar.
 *
 * Verandert live mee met de `Verdeling Toename`-instelling uit de settings-
 * context — dezelfde bron als de TotalTable. Geen eigen rekenlogica, alleen
 * aggregatie van bestaande per-jaar data.
 */
function EventAllocationsSummary({
  eventGroups,
  eventAllocations,
  assetNames,
  strategyLabel,
}: {
  eventGroups: { event: LifeEvent; cashflows: SimCashflow[] }[]
  eventAllocations: EventAssetAllocation[][] | null
  assetNames: string[]
  strategyLabel: string
}) {
  if (!eventAllocations || eventGroups.length === 0) return null

  // Som per event-idx → per asset-idx over alle jaren.
  const perEventTotals: { eventName: string; firstYear: number | null; totalsByAsset: number[]; total: number }[] = eventGroups.map((g, ei) => {
    const yearRows = eventAllocations[ei] ?? []
    const totals = new Array<number>(assetNames.length).fill(0)
    let firstYear: number | null = null
    for (let yr = 0; yr < yearRows.length; yr++) {
      const row = yearRows[yr]
      if (!row) continue
      for (let ai = 0; ai < assetNames.length; ai++) {
        totals[ai] += row.perAsset[ai] ?? 0
      }
      if (firstYear == null && row.perAsset.some(v => v !== 0)) {
        firstYear = yr + 1
      }
    }
    const total = totals.reduce((s, v) => s + v, 0)
    return { eventName: g.event.name, firstYear, totalsByAsset: totals, total }
  }).filter(e => Math.abs(e.total) > 0.5)

  if (perEventTotals.length === 0) return null

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="border-b border-[var(--border-ed)] bg-horizon-50/30 px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">Event-toewijzingen</h3>
          <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
            Hoe ieder life event over je bezittingen wordt verdeeld volgens de gekozen strategie.
          </p>
        </div>
        <span className="rounded bg-horizon-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-horizon-700">
          {strategyLabel}
        </span>
      </div>
      <div className="divide-y divide-[var(--border-ed)]">
        {perEventTotals.map((ev) => {
          const isInflow = ev.total > 0
          return (
            <div key={ev.eventName} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] font-semibold text-[var(--ink)]">{ev.eventName}</span>
                  {ev.firstYear != null && (
                    <span className="text-[10px] text-[var(--ink-4)]">vanaf jaar {ev.firstYear}</span>
                  )}
                </div>
                <span className={`font-mono tabular-nums text-[12px] font-semibold ${isInflow ? 'text-emerald-600' : 'text-red-500'}`}>
                  {isInflow ? '+' : ''}{formatCurrency(Math.round(ev.total))}
                </span>
              </div>
              <div className="space-y-1">
                {ev.totalsByAsset.map((amount, ai) => {
                  if (Math.abs(amount) < 0.5) return null
                  const pct = ev.total !== 0 ? (amount / ev.total) * 100 : 0
                  const barWidthPct = Math.min(100, Math.abs(pct))
                  return (
                    <div key={ai} className="flex items-center gap-2 text-[11px]">
                      <span className="min-w-0 flex-1 truncate text-[var(--ink-3)]">{assetNames[ai]}</span>
                      <div className="h-1.5 w-24 overflow-hidden rounded bg-[var(--subtle)]">
                        <div
                          className={`h-full ${isInflow ? 'bg-emerald-400' : 'bg-red-400'}`}
                          style={{ width: `${barWidthPct}%` }}
                        />
                      </div>
                      <span className="w-10 text-right font-mono tabular-nums text-[10px] text-[var(--ink-4)]">{pct.toFixed(0)}%</span>
                      <span className={`w-24 text-right font-mono tabular-nums ${amount > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {amount > 0 ? '+' : ''}{formatCurrency(Math.round(amount))}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EventAllocationTooltip({ allocation, assetNames }: {
  allocation: EventAssetAllocation
  assetNames: string[]
}) {
  const hasAllocations = allocation.perAsset.some(v => v !== 0)
  if (!hasAllocations) return null

  return (
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 w-max max-w-[220px] rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-2 shadow-lg text-[10px] pointer-events-none">
      <p className="font-semibold text-[var(--ink-3)] mb-1">Verdeling over bezittingen:</p>
      {allocation.perAsset.map((amount, i) => {
        if (amount === 0) return null
        return (
          <div key={i} className="flex justify-between gap-2">
            <span className="text-[var(--ink-3)] truncate">{assetNames[i]}</span>
            <span className={`font-mono tabular-nums whitespace-nowrap ${amount > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {amount > 0 ? '+' : ''}{formatCurrency(amount)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function TotalTable({ assetTotals, debtTotals, netTotals, box3Taxes, projectionYears, crossoverYear, yearlyEventCashflows, perEventYearlyCashflows, eventGroups, eventAllocations, assetNames, allocationStrategyLabel }: {
  assetTotals: number[]
  debtTotals: number[]
  netTotals: number[]
  box3Taxes: number[]
  projectionYears: number
  crossoverYear: number | null
  yearlyEventCashflows: number[]
  perEventYearlyCashflows: number[][] // [eventIdx][year]
  eventGroups: { event: LifeEvent; cashflows: SimCashflow[] }[]
  eventAllocations: EventAssetAllocation[][] | null // [eventIdx][year]
  assetNames: string[]
  allocationStrategyLabel?: string
}) {
  const hasEvents = yearlyEventCashflows.some((v) => v !== 0)
  const [hoveredCell, setHoveredCell] = useState<string | null>(null)
  const displayYears = useMemo(() => {
    const years = getDisplayYears(projectionYears)
    if (crossoverYear != null && !years.includes(crossoverYear)) {
      years.push(crossoverYear)
      years.sort((a, b) => a - b)
    }
    return years
  }, [projectionYears, crossoverYear])
  const cumulativeTax = useMemo(() => {
    const cum: number[] = []
    let total = 0
    for (const t of box3Taxes) {
      total += t
      cum.push(total)
    }
    return cum
  }, [box3Taxes])

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="border-b border-[var(--border-ed)] bg-horizon-50/30 px-4 py-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">Totaaloverzicht</h3>
          <p className="text-[10px] text-[var(--ink-4)] mt-0.5">
            Box 3: fictief rendement {(NL_FICTIEF_BELEGGINGEN * 100).toFixed(2)}% × tarief {(BOX3_TARIEF * 100).toFixed(0)}%, heffingsvrij vermogen afgetrokken
            {hasEvents && ' · hover op event-kolom toont verdeling over bezittingen'}
          </p>
        </div>
        {hasEvents && allocationStrategyLabel && (
          <span className="rounded bg-horizon-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-horizon-700 whitespace-nowrap">
            Verdeling: {allocationStrategyLabel}
          </span>
        )}
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
              <th className="px-3 py-1.5 text-left font-medium text-[var(--ink-3)]">Jaar</th>
              <th className="px-3 py-1.5 text-right font-medium text-emerald-700 bg-emerald-50/50">Bezittingen</th>
              <th className="px-3 py-1.5 text-right font-medium text-red-600 bg-red-50/50">Schulden</th>
              <th className="px-3 py-1.5 text-right font-medium text-horizon-700 bg-horizon-50/60 border-l-2 border-horizon-200">Netto vermogen</th>
              {hasEvents && eventGroups.map((g, ei) => (
                <th key={`ev-${ei}`} className="px-2 py-1.5 text-right font-medium text-purple-600 whitespace-nowrap" title={g.event.name}>
                  {g.event.name.length > 16 ? g.event.name.slice(0, 15) + '\u2026' : g.event.name}
                </th>
              ))}
              {hasEvents && eventGroups.length > 1 && (
                <th className="px-3 py-1.5 text-right font-medium text-purple-700 border-l border-purple-200/50">{'\u03A3'} Events</th>
              )}
              <th className="px-3 py-1.5 text-right font-medium text-amber-600">Box 3 belasting</th>
              <th className="px-3 py-1.5 text-right font-medium text-amber-500">Cumulatief Box 3</th>
            </tr>
          </thead>
          <tbody>
            {displayYears.map((yr, idx) => {
              const isCrossover = crossoverYear != null && yr === crossoverYear
              const isAfterCrossover = crossoverYear != null && yr > crossoverYear
              const isMilestone = yr % 5 === 0 || yr === projectionYears || isCrossover
              return (
              <tr key={yr} className={`border-b border-[var(--border-ed)] last:border-b-0 hover:bg-[var(--subtle)]/50 ${isCrossover ? 'bg-horizon-50/60 ring-1 ring-inset ring-horizon-300' : idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}>
                <td className={`px-3 py-1 font-mono tabular-nums ${isMilestone ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-3)]'}`}>
                  {yr}
                  {isCrossover && <span className="ml-1 text-[9px] font-semibold text-horizon-600">{'\u26A1'} kruispunt</span>}
                  {isAfterCrossover && <span className="ml-1 text-[9px] text-[var(--ink-4)]">na kruispunt</span>}
                </td>
                <td className="px-3 py-1 text-right font-mono tabular-nums text-emerald-600 bg-emerald-50/30">
                  {formatCurrency(assetTotals[yr - 1])}
                </td>
                <td className="px-3 py-1 text-right font-mono tabular-nums text-red-500 bg-red-50/30">
                  {formatCurrency(debtTotals[yr - 1])}
                </td>
                <td className="px-3 py-1 text-right font-mono tabular-nums font-bold text-horizon-700 bg-horizon-50/40 border-l-2 border-horizon-200">
                  {formatCurrency(netTotals[yr - 1])}
                </td>
                {hasEvents && eventGroups.map((_g, ei) => {
                  const evVal = perEventYearlyCashflows[ei]?.[yr - 1] ?? 0
                  const allocation = eventAllocations?.[ei]?.[yr - 1] ?? null
                  const cellKey = `${ei}-${yr}`
                  const isHovered = hoveredCell === cellKey
                  return (
                    <td
                      key={`ev-${ei}`}
                      className={`px-2 py-1 text-right font-mono tabular-nums relative cursor-default ${evVal > 0 ? 'text-emerald-600' : evVal < 0 ? 'text-red-500' : 'text-[var(--ink-4)]'}`}
                      onMouseEnter={() => allocation && setHoveredCell(cellKey)}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      {evVal !== 0 ? formatCurrency(evVal) : '\u2014'}
                      {allocation && isHovered && (
                        <EventAllocationTooltip allocation={allocation} assetNames={assetNames} />
                      )}
                    </td>
                  )
                })}
                {hasEvents && eventGroups.length > 1 && (
                  <td className={`px-3 py-1 text-right font-mono tabular-nums border-l border-purple-200/50 font-semibold ${yearlyEventCashflows[yr - 1] > 0 ? 'text-emerald-600' : yearlyEventCashflows[yr - 1] < 0 ? 'text-red-500' : 'text-[var(--ink-4)]'}`}>
                    {yearlyEventCashflows[yr - 1] !== 0 ? formatCurrency(yearlyEventCashflows[yr - 1]) : '\u2014'}
                  </td>
                )}
                <td className="px-3 py-1 text-right font-mono tabular-nums text-amber-600">
                  {box3Taxes[yr - 1] > 0 ? formatCurrency(box3Taxes[yr - 1]) : '\u2014'}
                </td>
                <td className="px-3 py-1 text-right font-mono tabular-nums text-amber-500">
                  {cumulativeTax[yr - 1] > 0 ? formatCurrency(cumulativeTax[yr - 1]) : '\u2014'}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────

export function OpbouwClient({
  assets,
  debts,
  profile,
  fireParams,
  cashflows,
  lifeEvents,
  savingsRate6m,
  estimatedYearlyIncome,
  netWorth,
  yearlyMustExpenses,
  userAowAge,
  weightedGrossReturn,
}: {
  assets: Asset[]
  debts: Debt[]
  profile: Record<string, unknown> | null
  fireParams: FireParams
  cashflows: SimCashflow[]
  lifeEvents: LifeEvent[]
  /** 6-month rolling savings rate from core page (same as kern header) */
  savingsRate6m: number
  /** Extrapolated 12-month income from core page (same as kern "Geschat Jaarinkomen") */
  estimatedYearlyIncome: number
  /** Huidig netto vermogen (totalAssets - totalDebts). */
  netWorth: number
  /** Jaarlijkse essentiële uitgaven — input voor computeRetirementExpenses. */
  yearlyMustExpenses: number
  /** Fractionele AOW-leeftijd. */
  userAowAge: number
  /** Gewogen asset-return (zelfde bron als overzicht). */
  weightedGrossReturn: number
}) {
  // ── Profile-derived values with safe defaults (feature #628) ──
  // Use core page values (transaction-based) with profile fallback
  const profileMonthlyIncome = estimatedYearlyIncome > 0
    ? estimatedYearlyIncome / 12
    : Number(profile?.net_monthly_income ?? 0)
  const profileSavingsRate = savingsRate6m !== 0
    ? savingsRate6m
    : Number(profile?.savings_rate ?? 0)
  const householdType = String(profile?.household_type ?? 'solo')
  const hasPartner = householdType === 'samenwonend' || householdType === 'getrouwd'

  // ── Age-based projection limit (feature #637) ──
  const dateOfBirth = typeof profile?.date_of_birth === 'string' ? profile.date_of_birth : null
  const currentAge = dateOfBirth
    ? Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null
  const maxProjectionYears = currentAge != null ? Math.max(1, 100 - currentAge) : 60
  const defaultYears = currentAge != null ? maxProjectionYears : DEFAULT_PROJECTION_YEARS

  // Tijdshorizon and allocation-strategie zijn nu gecentraliseerd op /overzicht
  // en worden uit de gedeelde settings-context gelezen.
  const projectionYears = defaultYears
  const settings = useDoorrekeningSettings()
  // Settings `distributionStrategy` ('proportional' | 'cash_first' | 'lowest_return')
  // → mappen naar de opbouw-lokale `AllocationStrategy` union. cash_first en
  // lowest_return zijn functioneel equivalent (beide sorteren assets op
  // expected_return oplopend). Deze mapping moet in sync blijven met de
  // mapping in `hybrid-projection.ts` en de cross-check panel-inputs
  // hieronder — één bron van waarheid voor beide tabbladen.
  const allocationStrategy: AllocationStrategy =
    settings.distributionStrategy === 'cash_first' ? 'cash_first'
    : settings.distributionStrategy === 'lowest_return' ? 'cash_first'
    : settings.distributionStrategy === 'highest_return' ? 'hoogste_rendement'
    : 'spreiden'
  const [assetsExpanded, setAssetsExpanded] = useState(true)
  const [debtsExpanded, setDebtsExpanded] = useState(true)

  // Group and project
  const assetGroups = useMemo(() => groupAssetsByType(assets), [assets])
  const debtGroups = useMemo(() => groupDebtsByType(debts), [debts])

  // ── Kruispunt-bron (overgangsfase) ─────────────────────────────────
  // TODO(fase-later): vervang deze gedeelde runSimulation-aanroep door een
  // eigen `findIntersection(computeOpbouwProjection(...).yearlyRows,
  // computeAfbouwRequiredSchedule(...))` zodat opbouw-client volledig los
  // staat van lib/fire-simulation. Overzicht heeft die migratie in Fase 2c
  // al afgerond; hier moet nog een analoge wiring komen incl. retirement-
  // expense + AOW-household resolution vanuit profile/settings-context.
  // Voor nu blijft `sim.fireAge` de bron — met dat voorbehoud is de
  // kruispunt-leeftijd identiek aan wat /overzicht tekent tijdens Fase 3.
  const sim = useDoorrekeningSim({
    currentAge: currentAge ?? 30,
    netWorth,
    monthlyIncome: profileMonthlyIncome,
    savingsRate: profileSavingsRate,
    yearlyMustExpenses,
    estimatedYearlyIncome,
    weightedGrossReturn,
    fireParams,
    lifeEvents,
    cashflows,
    userAowAge,
    profile: profile ?? {},
  })

  // Kruispunt uit gedeelde simulatie: jaar = sim.fireAge - currentAge; maand = jaar × 12.
  const crossoverYear = useMemo(() => {
    if (sim.fireAge == null || currentAge == null) return null
    return sim.fireAge - currentAge
  }, [sim.fireAge, currentAge])
  const crossoverMonth = crossoverYear != null ? crossoverYear * 12 : null

  // ── Cross-check (H4) ─────────────────────────────────────────────
  // Bouwt `HybridProjectionInputs` met dezelfde bronnen die `sim` ook krijgt,
  // plus settings-context voor strategie. Het panel vergelijkt sim.fireAge +
  // sim.rows[last].endPortfolio met de hybride uitkomst en waarschuwt bij
  // divergentie. Verborgen in productie (activeer via ?check=1). Settings-
  // context wordt hierboven al ingelezen — hergebruik die instance.
  const hybridInputs = useMemo<HybridProjectionInputs>(() => {
    const retirementMethod = (profile?.retirement_expense_method as RetirementExpenseMethod | undefined) ?? 'essential_budgets'
    const retirementCustomAmount = Number(profile?.retirement_expense_custom_amount ?? 0)
    const estimatedMonthlyExpenses = Number(profile?.estimated_monthly_expenses ?? 0)
    const yearlyRetirementExpenses = computeRetirementExpenses(
      retirementMethod,
      yearlyMustExpenses,
      profileMonthlyIncome * 12,
      retirementCustomAmount,
      estimatedMonthlyExpenses * 12,
    )
    const displayEndAge = settings.endStrategy === 'pensioen' ? 100 : settings.endAge
    const withdrawalStrategy: AfbouwWithdrawalStrategy =
      settings.withdrawalStrategy === 'swr' ? 'swr' : settings.withdrawalStrategy
    const distributionStrategy: AfbouwDistributionStrategy =
      settings.distributionStrategy === 'cash_first'
        ? 'cash_first'
        : settings.distributionStrategy === 'lowest_return'
          ? 'lowest_return_first'
          : settings.distributionStrategy === 'highest_return'
            ? 'highest_return_first'
            : 'proportional'
    const outflowDistribution: AfbouwDistributionStrategy =
      settings.outflowDistribution === 'cash_first'
        ? 'cash_first'
        : settings.outflowDistribution === 'lowest_return_first'
          ? 'lowest_return_first'
          : 'proportional'
    const withdrawalOrder: AfbouwDistributionStrategy =
      settings.withdrawalOrder === 'cash_first'
        ? 'cash_first'
        : settings.withdrawalOrder === 'low_return_first'
          ? 'lowest_return_first'
          : settings.withdrawalOrder === 'own_home_last'
            ? 'own_home_last'
            : settings.withdrawalOrder === 'highest_value_first'
              ? 'highest_value_first'
              : 'proportional'
    return {
      assets,
      debts,
      lifeEvents,
      cashflows,
      currentAge: currentAge ?? 30,
      endAge: displayEndAge,
      fireParams,
      endStrategy: settings.endStrategy,
      endAgeConfig: settings.endAge,
      legacyAmount: settings.legacyAmount,
      withdrawalStrategy,
      distributionStrategy,
      outflowDistribution,
      withdrawalOrder,
      hasPartner,
      yearlyRetirementExpenses,
      aowAge: userAowAge,
      savingsInflow: { monthlyAmount: (profileMonthlyIncome * profileSavingsRate) / 100 },
    }
  }, [
    assets, debts, lifeEvents, cashflows, currentAge, fireParams,
    settings.endStrategy, settings.endAge, settings.legacyAmount,
    settings.withdrawalStrategy, settings.distributionStrategy, settings.outflowDistribution, settings.withdrawalOrder,
    hasPartner, yearlyMustExpenses, userAowAge,
    profileMonthlyIncome, profileSavingsRate, profile,
  ])

  // ── Per-event yearly cashflow impacts (features #663, #670) ──
  // Group cashflows by source life event, then compute per-event yearly cashflows.
  // perEventYearlyCashflows[eventIdx][year] = net cashflow for that event in that year.
  // yearlyEventCashflows[year] = aggregate across all events (backward compat).

  /** Map each life event to its cashflows */
  const eventCashflowGroups = useMemo(() => {
    // Group cashflows by their source event ID (cashflow IDs contain the event ID)
    const groups: { event: LifeEvent; cashflows: SimCashflow[] }[] = []
    for (const ev of lifeEvents) {
      const evCfs = cashflows.filter((cf) => cf.id.includes(ev.id))
      if (evCfs.length > 0) groups.push({ event: ev, cashflows: evCfs })
    }
    // Also catch any cashflows that don't match a known event (defensive)
    const matchedIds = new Set(groups.flatMap((g) => g.cashflows.map((c) => c.id)))
    const unmatched = cashflows.filter((cf) => !matchedIds.has(cf.id))
    if (unmatched.length > 0) {
      groups.push({ event: { id: '_unmatched', name: 'Overig', icon: '📋' } as LifeEvent, cashflows: unmatched })
    }
    return groups
  }, [lifeEvents, cashflows])

  const perEventYearlyCashflows = useMemo(() => {
    if (!eventCashflowGroups.length || currentAge == null) return [] as number[][]
    const inflationRate = fireParams.inflationRate

    return eventCashflowGroups.map((group) => {
      return Array.from({ length: projectionYears }, (_, yr) => {
        const yearStartAge = currentAge + yr
        const yearEndAge = currentAge + yr + 1
        let yearTotal = 0

        for (const cf of group.cashflows) {
          if (cf.type === 'one_time') {
            if (cf.fromAge >= yearStartAge && cf.fromAge < yearEndAge) {
              const yearsFromNow = cf.fromAge - currentAge
              const inflationFactor = cf.indexed ? Math.pow(1 + inflationRate, yearsFromNow) : 1
              const amount = cf.amount * inflationFactor
              yearTotal += cf.direction === 'income' ? amount : -amount
            }
          } else {
            const cfEnd = cf.toAge ?? 999
            const overlapStart = Math.max(cf.fromAge, yearStartAge)
            const overlapEnd = Math.min(cfEnd, yearEndAge)
            if (overlapStart < overlapEnd) {
              const months = Math.round((overlapEnd - overlapStart) * 12)
              const yearsFromNow = yr
              const inflationFactor = cf.indexed ? Math.pow(1 + inflationRate, yearsFromNow) : 1
              const monthlyAmount = cf.amount * inflationFactor
              const periodAmount = monthlyAmount * months
              yearTotal += cf.direction === 'income' ? periodAmount : -periodAmount
          }
        }
      }

      return Math.round(yearTotal)
      })
    })
  }, [eventCashflowGroups, currentAge, projectionYears, fireParams.inflationRate])

  // Aggregate yearly event cashflows (sum across all events per year)
  const yearlyEventCashflows = useMemo(() => {
    if (!perEventYearlyCashflows.length) return Array(projectionYears).fill(0) as number[]
    return Array.from({ length: projectionYears }, (_, yr) =>
      perEventYearlyCashflows.reduce((sum, evCf) => sum + (evCf[yr] ?? 0), 0)
    )
  }, [perEventYearlyCashflows, projectionYears])

  const assetProjections = useMemo(() => {
    const result: { type: AssetType; label: string; columns: { label: string; rows: YearRow[] }[] }[] = []
    for (const [type, group] of assetGroups) {
      result.push({
        type,
        label: ASSET_TYPE_LABELS[type],
        columns: group.map((a) => {
          const pct = a.net_worth_inclusion_pct ?? 100
          return {
            label: pct < 100 ? `${a.name} (${pct}%)` : a.name,
            rows: projectAssetYearly(a, projectionYears, crossoverMonth),
          }
        }),
      })
    }
    return result
  }, [assetGroups, projectionYears, crossoverMonth])

  const debtProjections = useMemo(() => {
    const result: { type: DebtType; label: string; columns: { label: string; rows: YearRow[] }[] }[] = []
    for (const [type, group] of debtGroups) {
      result.push({
        type,
        label: DEBT_TYPE_LABELS[type],
        columns: group.map((d) => ({
          label: d.name,
          rows: projectDebtYearly(d, projectionYears),
        })),
      })
    }
    return result
  }, [debtGroups, projectionYears])

  // ── Event-adjusted asset simulation (features #665, #666) ──
  // When life events produce cashflows, run a joint month-by-month simulation
  // that withdraws from (or deposits into) assets using the chosen strategy.
  const hasEvents = yearlyEventCashflows.some((v) => v !== 0)

  const eventAdjustedAssets = useMemo(() => {
    if (!hasEvents) return null
    return simulateAssetsWithEvents(
      assets,
      projectionYears * 12,
      perEventYearlyCashflows,
      allocationStrategy,
      crossoverMonth,
    )
  }, [assets, projectionYears, perEventYearlyCashflows, allocationStrategy, crossoverMonth, hasEvents])

  // Compute yearly totals met Box 3 belasting op netto vermogen.
  // Asset/debt totals komen uit per-asset projections (drill-down-tabellen delen
  // dezelfde bron). Netto-vermogen = assets − debts − cumulatieve Box 3 —
  // volledig opbouw-eigen formules (geen runSimulation-override meer; zie
  // Fase 4 van `doorrekening-overzicht-aggregatie.md`).
  const { assetTotals, debtTotals, netTotals, box3Taxes } = useMemo(() => {
    const aTotals: number[] = []
    const dTotals: number[] = []
    const nTotals: number[] = []
    const taxes: number[] = []
    let cumulativeTax = 0

    const inclusionWeights = assets.map(a => (a.net_worth_inclusion_pct ?? 100) / 100)

    for (let yr = 0; yr < projectionYears; yr++) {
      let assetSum = 0
      if (eventAdjustedAssets) {
        for (let i = 0; i < assets.length; i++) {
          assetSum += (eventAdjustedAssets.yearlyAssetValues[i]?.[yr] ?? 0) * inclusionWeights[i]
        }
      } else {
        let flatIdx = 0
        for (const group of assetProjections) {
          for (const col of group.columns) {
            assetSum += (col.rows[yr]?.value ?? 0) * inclusionWeights[flatIdx]
            flatIdx++
          }
        }
      }

      let debtSum = 0
      for (const group of debtProjections) {
        for (const col of group.columns) {
          debtSum += col.rows[yr]?.value ?? 0
        }
      }

      const rawNet = assetSum - debtSum
      const adjustedNet = rawNet - cumulativeTax
      const yearTax = computeBox3Tax(adjustedNet, hasPartner)
      cumulativeTax += yearTax

      aTotals.push(assetSum)
      dTotals.push(debtSum)
      nTotals.push(rawNet - cumulativeTax)
      taxes.push(yearTax)
    }

    return { assetTotals: aTotals, debtTotals: dTotals, netTotals: nTotals, box3Taxes: taxes }
  }, [assetProjections, debtProjections, projectionYears, hasPartner, eventAdjustedAssets, assets])

  const hasAssets = assets.length > 0
  const hasDebts = debts.length > 0
  const totalAssetValueRaw = assets.reduce((s, a) => s + Number(a.current_value), 0)
  const totalAssetValue = assets.reduce((s, a) => s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
  const totalDebtValue = debts.reduce((s, d) => s + Number(d.current_balance), 0)
  // Display-only net worth met inclusion-pct weging (header-weergave).
  const displayNetWorth = totalAssetValue - totalDebtValue

  return (
    <div className="space-y-6">
      <SettingsBanner />

      {/* Section 1: Summary header card with time horizon */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Huidige bezittingen
            </p>
            <p className="font-mono tabular-nums text-lg font-bold text-emerald-600">
              {formatCurrency(totalAssetValue)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Huidige schulden
            </p>
            <p className="font-mono tabular-nums text-lg font-bold text-red-500">
              {formatCurrency(totalDebtValue)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Netto vermogen
            </p>
            <p className="font-mono tabular-nums text-xl font-bold text-horizon-600">
              {formatCurrency(displayNetWorth)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Netto inkomen
            </p>
            <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink)]">
              {formatCurrency(profileMonthlyIncome)}
              <span className="ml-1 text-[10px] text-[var(--ink-4)]">
                /mnd
              </span>
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Spaarquote (profiel)
            </p>
            <p className="font-mono tabular-nums text-sm font-semibold text-horizon-600">
              {profileSavingsRate.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              Rendement / Inflatie
            </p>
            <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink-2)]">
              {(fireParams.grossReturn * 100).toFixed(1)}% /{" "}
              {(fireParams.inflationRate * 100).toFixed(1)}%
            </p>
          </div>
        </div>

        {hasEvents && (
          <p className="mt-4 border-t border-[var(--border-ed)] pt-3 text-[11px] text-[var(--ink-4)]">
            {lifeEvents.length} levensgebeurtenis{lifeEvents.length !== 1 ? 'sen' : ''} be{'\u00EF'}nvloeden de projectie.
          </p>
        )}
      </div>

      {/* Section 2: Summary chart */}
      {(hasAssets || hasDebts) && (
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Vermogensprojectie — {projectionYears} jaar
          </h2>
          <div className="overflow-x-auto -mx-2 px-2">
            <div className="min-w-[480px]">
              <SummaryChart
                assetTotals={assetTotals}
                debtTotals={debtTotals}
                netTotals={netTotals}
                projectionYears={projectionYears}
                lifeEvents={lifeEvents}
                currentAge={currentAge}
              />
            </div>
          </div>
        </div>
      )}

      {/* Section 2b: Stacked area chart per bezitting/schuld */}
      {(hasAssets || hasDebts) && (
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Bezittingen &amp; schulden — individueel
          </h2>
          <div className="overflow-x-auto -mx-2 px-2">
            <div className="min-w-[480px]">
              <StackedAreaChart
                assets={assets}
                debts={debts}
                profileMonthlyIncome={profileMonthlyIncome}
                profileSavingsRate={profileSavingsRate}
                projectionYears={projectionYears}
                crossoverMonth={crossoverMonth}
              />
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Bezittingen (collapsible) */}
      {hasAssets && (
        <div className="space-y-4">
          <SectionHeader
            icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
            title="Bezittingen"
            subtitle={`${formatCurrency(totalAssetValueRaw)} huidige waarde`}
            color="bg-emerald-50/30"
            count={assets.length}
            expanded={assetsExpanded}
            onToggle={() => setAssetsExpanded(!assetsExpanded)}
          />
          {assetsExpanded && (
            <div className="space-y-4 pl-2">
              {assetProjections.map((group) => (
                <ProjectionTable
                  key={group.type}
                  title={group.label}
                  columns={group.columns}
                  color="bg-emerald-50/40"
                  projectionYears={projectionYears}
                  defaultExpanded={assetProjections.length <= 3}
                />
              ))}
              {assets.map((asset) => (
                <AssetMonthlyTable
                  key={asset.id}
                  asset={asset}
                  projectionYears={projectionYears}
                  crossoverMonth={crossoverMonth}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section 4: Schulden (collapsible) */}
      {hasDebts && (
        <div className="space-y-4">
          <SectionHeader
            icon={<Landmark className="h-4 w-4 text-red-500" />}
            title="Schulden"
            subtitle={`${formatCurrency(totalDebtValue)} openstaand`}
            color="bg-red-50/20"
            count={debts.length}
            expanded={debtsExpanded}
            onToggle={() => setDebtsExpanded(!debtsExpanded)}
          />
          {debtsExpanded && (
            <div className="space-y-4 pl-2">
              {debtProjections.map((group) => (
                <ProjectionTable
                  key={group.type}
                  title={group.label}
                  columns={group.columns}
                  color="bg-red-50/30"
                  projectionYears={projectionYears}
                  defaultExpanded={debtProjections.length <= 3}
                />
              ))}
              {debts.map((debt) => (
                <DebtAmortizationTable
                  key={debt.id}
                  debt={debt}
                  projectionYears={projectionYears}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section 5: Spaarquote */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-1">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-horizon-50/40">
            <PiggyBank className="h-4 w-4 text-horizon-600" />
          </span>
          <h2 className="text-sm font-semibold text-[var(--ink)]">
            Spaarquote
          </h2>
        </div>
        <div className="space-y-4 pl-2">
          <SavingsRateTable
            assets={assets}
            debts={debts}
            profileMonthlyIncome={profileMonthlyIncome}
            profileSavingsRate={profileSavingsRate}
            estimatedYearlyIncome={estimatedYearlyIncome}
            savingsRate6m={savingsRate6m}
          />
          <SavingsProjectionTable
            profileMonthlyIncome={profileMonthlyIncome}
            profileSavingsRate={profileSavingsRate}
            projectionYears={projectionYears}
            crossoverMonth={crossoverMonth}
          />
        </div>
      </div>

      {/* Section 6: Totaal Netto Vermogen */}
      {(hasAssets || hasDebts) && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-1">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-horizon-50/40">
              <BarChart3 className="h-4 w-4 text-horizon-600" />
            </span>
            <h2 className="text-sm font-semibold text-[var(--ink)]">
              Totaal Netto Vermogen
            </h2>
          </div>
          <div className="space-y-4 pl-2">
            <NetWorthMonthlyTable
              assets={assets}
              debts={debts}
              profileMonthlyIncome={profileMonthlyIncome}
              profileSavingsRate={profileSavingsRate}
              projectionYears={projectionYears}
              crossoverMonth={crossoverMonth}
            />
            <TotalTable
              assetTotals={assetTotals}
              debtTotals={debtTotals}
              netTotals={netTotals}
              box3Taxes={box3Taxes}
              projectionYears={projectionYears}
              crossoverYear={crossoverYear}
              yearlyEventCashflows={yearlyEventCashflows}
              perEventYearlyCashflows={perEventYearlyCashflows}
              eventGroups={eventCashflowGroups}
              eventAllocations={eventAdjustedAssets?.yearlyEventAllocations ?? null}
              assetNames={assets.map(a => a.name)}
              allocationStrategyLabel={
                allocationStrategy === 'cash_first' ? 'Cash first'
                : allocationStrategy === 'hoogste_rendement' ? 'Hoogste rendement'
                : 'Spreiden'
              }
            />
            <EventAllocationsSummary
              eventGroups={eventCashflowGroups}
              eventAllocations={eventAdjustedAssets?.yearlyEventAllocations ?? null}
              assetNames={assets.map(a => a.name)}
              strategyLabel={
                allocationStrategy === 'cash_first' ? 'Cash first / laagste rendement'
                : allocationStrategy === 'hoogste_rendement' ? 'Hoogste rendement first'
                : 'Spreiden (proportioneel)'
              }
            />
          </div>
        </div>
      )}

      <CrossCheckPanel
        pageName="opbouw"
        hybridInputs={hybridInputs}
        localFireAge={sim.fireAge ?? null}
        localEndPortfolio={sim.rows.at(-1)?.endPortfolio ?? null}
      />

      {/* Empty state */}
      {!hasAssets && !hasDebts && (
        <div className="rounded-xl border border-dashed border-[var(--border-md)] p-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">
            Nog geen bezittingen of schulden gevonden. Voeg eerst je
            financi\u00eble gegevens toe via{" "}
            <a
              href="/core/assets"
              className="text-horizon-600 underline underline-offset-2"
            >
              Bezittingen
            </a>{" "}
            of{" "}
            <a
              href="/core/debts"
              className="text-horizon-600 underline underline-offset-2"
            >
              Schulden
            </a>
            .
          </p>
        </div>
      )}
    </div>
  )
}

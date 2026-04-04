'use client'

import { useMemo, useState, useCallback } from 'react'
import { ChevronDown, ChevronRight, TrendingUp, Landmark, PiggyBank, BarChart3 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { projectAsset } from '@/lib/asset-data'
import { ASSET_TYPE_LABELS, type Asset, type AssetType } from '@/lib/asset-data'
import { DEBT_TYPE_LABELS, type Debt, type DebtType } from '@/lib/debt-data'
import type { FireParams } from '@/lib/fire-params'
import { NL_FICTIEF_BELEGGINGEN, BOX3_TARIEF } from '@/lib/constants'

// Heffingsvrij vermogen 2026 (single / partner)
const HEFFINGSVRIJ_SINGLE = 59_357
const HEFFINGSVRIJ_PARTNER = 118_714

// ── Projection helpers ────────────────────────────────────────

const DEFAULT_PROJECTION_YEARS = 30

interface YearRow {
  year: number
  value: number
  growth: number
  contribution: number
}

/**
 * Project an asset yearly, optionally stopping monthly contributions after
 * the crossover month (kruispunt). Returns continue after crossover.
 */
function projectAssetYearly(asset: Asset, years: number, crossoverMonth?: number | null): YearRow[] {
  const monthlyRate = Number(asset.expected_return) / 100 / 12
  const monthlyContrib = Number(asset.monthly_contribution)
  const totalMonths = years * 12
  let value = Number(asset.current_value)

  // Month-by-month simulation with crossover-aware contributions
  const monthlyValues: number[] = []
  for (let m = 1; m <= totalMonths; m++) {
    const growth = value * monthlyRate
    // Stop contributions after crossover month (if set), but keep returns
    const contrib = (crossoverMonth != null && m > crossoverMonth) ? 0 : monthlyContrib
    value = Math.max(0, value + growth + contrib)
    monthlyValues.push(value)
  }

  const rows: YearRow[] = []
  for (let y = 1; y <= years; y++) {
    const idx = y * 12 - 1
    const prevIdx = (y - 1) * 12 - 1
    const prev = prevIdx >= 0 ? monthlyValues[prevIdx] : Number(asset.current_value)
    const curr = monthlyValues[idx] ?? prev
    // Sum actual contributions for this year
    let yearContrib = 0
    for (let m = (y - 1) * 12 + 1; m <= y * 12; m++) {
      if (crossoverMonth != null && m > crossoverMonth) continue
      yearContrib += monthlyContrib
    }
    rows.push({
      year: y,
      value: Math.round(curr),
      growth: Math.round(curr - prev - yearContrib),
      contribution: Math.round(yearContrib),
    })
  }
  return rows
}

function projectDebtYearly(debt: Debt, years: number): YearRow[] {
  const monthlyRate = Number(debt.interest_rate) / 100 / 12
  const monthly = Number(debt.monthly_payment)
  let balance = Number(debt.current_balance)
  const rows: YearRow[] = []

  for (let y = 1; y <= years; y++) {
    let yearInterest = 0
    let yearPayment = 0
    for (let m = 0; m < 12; m++) {
      if (balance <= 0) break
      const interest = balance * monthlyRate
      yearInterest += interest
      const payment = Math.min(monthly, balance + interest)
      yearPayment += payment
      balance = Math.max(0, balance + interest - payment)
    }
    rows.push({
      year: y,
      value: Math.round(balance),
      growth: Math.round(yearInterest),
      contribution: Math.round(-yearPayment),
    })
  }
  return rows
}

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

// ── Box 3 belasting berekening ───────────────────────────────

/**
 * Bereken Box 3 belasting op basis van netto vermogen (peildatum 1 januari).
 * Fictief rendement × tarief, na aftrek heffingsvrij vermogen.
 */
function computeBox3Tax(netWorth: number, hasPartner: boolean): number {
  const heffingsvrij = hasPartner ? HEFFINGSVRIJ_PARTNER : HEFFINGSVRIJ_SINGLE
  // Grondslag = netto vermogen minus heffingsvrij, minimaal 0
  const grondslag = Math.max(0, netWorth - heffingsvrij)
  // Fictief rendement over de grondslag
  const fictief = grondslag * NL_FICTIEF_BELEGGINGEN
  // Belasting = fictief rendement × tarief
  return Math.round(fictief * BOX3_TARIEF)
}


// ── Stacked area chart (feature #633) ───────────────────────

const ASSET_COLORS = [
  'var(--color-emerald-500)',
  'var(--color-emerald-400)',
  'var(--color-emerald-300)',
  'var(--color-teal-500)',
  'var(--color-teal-400)',
  'var(--color-teal-300)',
  'var(--color-green-500)',
  'var(--color-green-400)',
]
const DEBT_COLORS = [
  'var(--color-red-500)',
  'var(--color-red-400)',
  'var(--color-red-300)',
  'var(--color-rose-500)',
  'var(--color-rose-400)',
]
const SAVINGS_COLOR = 'var(--color-amber-400)'

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
        const x = toX(i).toFixed(1)
        topLine += `${i === 0 ? 'M' : 'L'}${x},${toY(tops[i]).toFixed(1)} `
        bottomLine = `L${x},${toY(stackedBottoms[i]).toFixed(1)} ` + bottomLine
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
        const x = toX(i).toFixed(1)
        topLine += `${i === 0 ? 'M' : 'L'}${x},${toY(-tops[i]).toFixed(1)} `
        bottomLine = `L${x},${toY(-stackedBottoms[i]).toFixed(1)} ` + bottomLine
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

  // Net worth line
  const netLine = useMemo(() => {
    return samplePoints
      .map((pt, i) => {
        let pos = 0
        for (const s of assetSeries) pos += s.values[pt] ?? 0
        let neg = 0
        for (const s of debtSeries) neg += s.values[pt] ?? 0
        const net = pos - neg
        return `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(net).toFixed(1)}`
      })
      .join(' ')
  }, [assetSeries, debtSeries, samplePoints])

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
    { label: 'Netto vermogen', color: 'var(--color-horizon-500)' },
  ]

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" aria-label="Stacked area grafiek">
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
        {xLabels.map(({ x, label }) => (
          <text key={label} x={x} y={h - 4} textAnchor="middle" fontSize={8} fill="var(--ink-4)" className="font-mono">
            {label}
          </text>
        ))}
        {/* Positive stacked areas (assets + savings) */}
        {posAreaPaths.map(({ path, color, label }) => (
          <path key={`pos-${label}`} d={path} fill={color} fillOpacity={0.35} stroke={color} strokeWidth={0.5} />
        ))}
        {/* Negative stacked areas (debts) */}
        {negAreaPaths.map(({ path, color, label }) => (
          <path key={`neg-${label}`} d={path} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={0.5} />
        ))}
        {/* Net worth line */}
        <path d={netLine} fill="none" stroke="var(--color-horizon-500)" strokeWidth={2.5} />
      </svg>
      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-2">
        {legendItems.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px] text-[var(--ink-3)]">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color, opacity: label === 'Netto vermogen' ? 1 : 0.6 }} />
            <span className="truncate max-w-[120px]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Mini summary chart (SVG) ─────────────────────────────────

function SummaryChart({ assetTotals, debtTotals, netTotals, projectionYears }: {
  assetTotals: number[]
  debtTotals: number[]
  netTotals: number[]
  projectionYears: number
}) {
  const allValues = [...assetTotals, ...debtTotals, ...netTotals]
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(...allValues, 0)
  const range = maxVal - minVal || 1

  const w = 600
  const h = 220
  const px = 48
  const py = 24

  const numPoints = projectionYears
  const toX = (i: number) => px + (i / Math.max(numPoints - 1, 1)) * (w - 2 * px)
  const toY = (v: number) => py + (1 - (v - minVal) / range) * (h - 2 * py)

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
    const bottomRight = `L${toX(values.length - 1).toFixed(1)},${(h - py).toFixed(1)}`
    const bottomLeft = `L${toX(0).toFixed(1)},${(h - py).toFixed(1)}`
    return `${line} ${bottomRight} ${bottomLeft} Z`
  }

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
        const yy = py + frac * (h - 2 * py)
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
        <text key={yr} x={toX(yr)} y={h - 4} textAnchor="middle" fontSize={8} fill="var(--ink-4)" className="font-mono">
          {yr}j
        </text>
      ))}
      {/* Area fill under net worth */}
      <path d={makeAreaPath(netTotals)} fill="url(#netAreaGrad)" />
      {/* Asset line */}
      <path d={makePath(assetTotals)} fill="none" stroke="var(--color-emerald-500)" strokeWidth={2} />
      {/* Debt line */}
      <path d={makePath(debtTotals)} fill="none" stroke="var(--color-red-400)" strokeWidth={1.5} />
      {/* Net line */}
      <path d={makePath(netTotals)} fill="none" stroke="var(--color-horizon-500)" strokeWidth={2.5} />
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
              {columns.map((col) => (
                <th key={col.label} className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">
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
                  {columns.map((col) => (
                    <td key={col.label} className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
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

interface MonthRow {
  month: number
  startValue: number
  rendement: number
  inleg: number
  endValue: number
}

function computeAssetMonthly(asset: Asset, totalMonths: number, crossoverMonth?: number | null): MonthRow[] {
  const monthlyRate = Number(asset.expected_return) / 100 / 12
  const monthlyContrib = Number(asset.monthly_contribution)
  let value = Number(asset.current_value)
  const rows: MonthRow[] = []

  for (let m = 1; m <= totalMonths; m++) {
    const startValue = value
    const rendement = startValue * monthlyRate
    // Stop contributions after crossover month, returns continue
    const inleg = (crossoverMonth != null && m > crossoverMonth) ? 0 : monthlyContrib
    const endValue = startValue + rendement + inleg
    rows.push({
      month: m,
      startValue: Math.round(startValue * 100) / 100,
      rendement: Math.round(rendement * 100) / 100,
      inleg: Math.round(inleg * 100) / 100,
      endValue: Math.round(endValue * 100) / 100,
    })
    value = endValue
  }
  return rows
}

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
        <h3 className="text-sm font-semibold text-[var(--ink)]">{asset.name}</h3>
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

// ── Savings rate section ───────────────────────────────────────

function SavingsRateTable({ assets, debts, profileMonthlyIncome, profileSavingsRate }: {
  assets: Asset[]
  debts: Debt[]
  profileMonthlyIncome: number
  profileSavingsRate: number
}) {
  const totalContributions = assets.reduce((sum, a) => sum + Number(a.monthly_contribution), 0)
  const totalDebtPayments = debts.reduce((sum, d) => sum + Number(d.monthly_payment), 0)
  const monthlySavings = totalContributions + totalDebtPayments
  const computedRate = profileMonthlyIncome > 0 ? (monthlySavings / profileMonthlyIncome) * 100 : 0

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="border-b border-[var(--border-ed)] bg-horizon-50/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Spaarquote</h3>
      </div>
      <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-5">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Netto inkomen</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-[var(--ink)]">
            {formatCurrency(profileMonthlyIncome)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Inleg bezittingen</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-emerald-600">
            {formatCurrency(totalContributions)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Aflossing schulden</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-red-500">
            {formatCurrency(totalDebtPayments)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Berekende spaarquote</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-horizon-600">
            {computedRate.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Profiel spaarquote</p>
          <p className="mt-1 font-mono tabular-nums text-sm font-semibold text-[var(--ink-2)]">
            {profileSavingsRate.toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Savings projection table (month-by-month) ───────────────

function SavingsProjectionTable({ profileMonthlyIncome, profileSavingsRate, projectionYears }: {
  profileMonthlyIncome: number
  profileSavingsRate: number
  projectionYears: number
}) {
  const totalMonths = projectionYears * 12
  const savingsRateFrac = profileSavingsRate / 100
  const monthlySavings = profileMonthlyIncome * savingsRateFrac

  // For large horizons, show sampled rows instead of every month
  const displayMonths: number[] = useMemo(() => {
    if (totalMonths <= 24) {
      // Show every month for ≤2 years
      return Array.from({ length: totalMonths }, (_, i) => i + 1)
    }
    // Show first 3 months, then every 6 months, plus last month
    const months: number[] = [1, 2, 3]
    for (let m = 6; m <= totalMonths; m += 6) {
      if (!months.includes(m)) months.push(m)
    }
    if (!months.includes(totalMonths)) months.push(totalMonths)
    return months.sort((a, b) => a - b)
  }, [totalMonths])

  if (profileMonthlyIncome <= 0 || profileSavingsRate <= 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
        <div className="border-b border-[var(--border-ed)] bg-horizon-50/30 px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Spaarquote doorrekening — maand-op-maand</h3>
        </div>
        <div className="p-4 text-center text-sm text-[var(--ink-3)]">
          Vul je netto inkomen en spaarquote in bij je profiel om de doorrekening te zien.
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
      <div className="border-b border-[var(--border-ed)] bg-horizon-50/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">
          Spaarquote doorrekening — maand-op-maand
        </h3>
        <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
          {formatCurrency(monthlySavings)}/mnd bij {profileSavingsRate.toFixed(1)}% spaarquote
        </p>
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
              <th className="px-3 py-1.5 text-left font-medium text-[var(--ink-3)]">Maand</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Inkomen (mnd)</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Spaarquote %</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Spaarbedrag</th>
              <th className="px-3 py-1.5 text-right font-medium text-horizon-600">Cumulatief</th>
            </tr>
          </thead>
          <tbody>
            {displayMonths.map((month, idx) => {
              const cumulative = monthlySavings * month
              return (
                <tr key={month} className={`border-b border-[var(--border-ed)] last:border-b-0 hover:bg-[var(--subtle)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}>
                  <td className="px-3 py-1 font-mono tabular-nums text-[var(--ink-3)]">{month}</td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {formatCurrency(profileMonthlyIncome)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {profileSavingsRate.toFixed(1)}%
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums text-emerald-600">
                    {formatCurrency(monthlySavings)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono tabular-nums font-semibold text-horizon-600">
                    {formatCurrency(cumulative)}
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

// ── Per-debt amortization table (month-by-month) ────────────

interface AmortizationRow {
  month: number
  startBalance: number
  interest: number
  repayment: number
  endBalance: number
}

function computeAmortization(debt: Debt, maxMonths: number): AmortizationRow[] {
  const monthlyRate = Number(debt.interest_rate) / 100 / 12
  const monthly = Number(debt.monthly_payment)
  let balance = Number(debt.current_balance)
  const rows: AmortizationRow[] = []

  for (let m = 1; m <= maxMonths; m++) {
    if (balance <= 0.005) break
    const interest = balance * monthlyRate
    const payment = Math.min(monthly, balance + interest)
    const repayment = payment - interest
    const endBalance = Math.max(0, balance - repayment)

    rows.push({
      month: m,
      startBalance: Math.round(balance * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      repayment: Math.round(repayment * 100) / 100,
      endBalance: Math.round(endBalance * 100) / 100,
    })

    balance = endBalance
  }
  return rows
}

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
              {assetMonthlyData.map((a) => (
                <th
                  key={`asset-${a.name}`}
                  className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-emerald-600"
                >
                  {a.name}
                </th>
              ))}
              {hasAssets && (
                <th className="whitespace-nowrap px-3 py-1.5 text-right font-semibold text-emerald-700 bg-emerald-50/40">
                  ∑ Bezittingen
                </th>
              )}
              {debtMonthlyData.map((d) => (
                <th
                  key={`debt-${d.name}`}
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
              const assetValues = assetMonthlyData.map((a) => {
                const val = a.rows[month - 1]?.endValue ?? 0
                assetTotal += val
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

function TotalTable({ assetTotals, debtTotals, netTotals, box3Taxes, projectionYears, crossoverYear }: {
  assetTotals: number[]
  debtTotals: number[]
  netTotals: number[]
  box3Taxes: number[]
  projectionYears: number
  crossoverYear: number | null
}) {
  const displayYears = getDisplayYears(projectionYears)
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
      <div className="border-b border-[var(--border-ed)] bg-horizon-50/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Totaaloverzicht</h3>
        <p className="text-[10px] text-[var(--ink-4)] mt-0.5">
          Box 3: fictief rendement {(NL_FICTIEF_BELEGGINGEN * 100).toFixed(2)}% × tarief {(BOX3_TARIEF * 100).toFixed(0)}%, heffingsvrij vermogen afgetrokken
        </p>
      </div>
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
              <th className="px-3 py-1.5 text-left font-medium text-[var(--ink-3)]">Jaar</th>
              <th className="px-3 py-1.5 text-right font-medium text-emerald-600">Bezittingen</th>
              <th className="px-3 py-1.5 text-right font-medium text-red-500">Schulden</th>
              <th className="px-3 py-1.5 text-right font-medium text-horizon-600">Netto vermogen</th>
              <th className="px-3 py-1.5 text-right font-medium text-amber-600">Box 3 belasting</th>
              <th className="px-3 py-1.5 text-right font-medium text-amber-500">Cumulatief Box 3</th>
            </tr>
          </thead>
          <tbody>
            {displayYears.map((yr, idx) => {
              const isCrossover = crossoverYear != null && yr === crossoverYear
              const isAfterCrossover = crossoverYear != null && yr > crossoverYear
              return (
              <tr key={yr} className={`border-b border-[var(--border-ed)] last:border-b-0 hover:bg-[var(--subtle)]/50 ${isCrossover ? 'bg-horizon-50/60 ring-1 ring-inset ring-horizon-300' : idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}>
                <td className="px-3 py-1 font-mono tabular-nums text-[var(--ink-3)]">
                  {yr}
                  {isCrossover && <span className="ml-1 text-[9px] font-semibold text-horizon-600">⚡ kruispunt</span>}
                  {isAfterCrossover && <span className="ml-1 text-[9px] text-[var(--ink-4)]">na kruispunt</span>}
                </td>
                <td className="px-3 py-1 text-right font-mono tabular-nums text-emerald-600">
                  {formatCurrency(assetTotals[yr - 1])}
                </td>
                <td className="px-3 py-1 text-right font-mono tabular-nums text-red-500">
                  {formatCurrency(debtTotals[yr - 1])}
                </td>
                <td className="px-3 py-1 text-right font-mono tabular-nums font-semibold text-horizon-600">
                  {formatCurrency(netTotals[yr - 1])}
                </td>
                <td className="px-3 py-1 text-right font-mono tabular-nums text-amber-600">
                  {box3Taxes[yr - 1] > 0 ? formatCurrency(box3Taxes[yr - 1]) : '—'}
                </td>
                <td className="px-3 py-1 text-right font-mono tabular-nums text-amber-500">
                  {cumulativeTax[yr - 1] > 0 ? formatCurrency(cumulativeTax[yr - 1]) : '—'}
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

export function OpbouwClient({ assets, debts, profile, fireParams }: {
  assets: Asset[]
  debts: Debt[]
  profile: Record<string, unknown> | null
  fireParams: FireParams
}) {
  // ── Profile-derived values with safe defaults (feature #628) ──
  const profileMonthlyIncome = Number(profile?.net_monthly_income ?? 0)
  const profileSavingsRate = Number(profile?.savings_rate ?? 0)
  const householdType = String(profile?.household_type ?? 'solo')
  const hasPartner = householdType === 'samenwonend' || householdType === 'getrouwd'

  // ── Age-based projection limit (feature #637) ──
  const dateOfBirth = typeof profile?.date_of_birth === 'string' ? profile.date_of_birth : null
  const currentAge = dateOfBirth
    ? Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null
  const maxProjectionYears = currentAge != null ? Math.max(1, 100 - currentAge) : 60
  const defaultYears = currentAge != null ? maxProjectionYears : DEFAULT_PROJECTION_YEARS

  const [projectionYears, setProjectionYears] = useState(defaultYears)
  const [assetsExpanded, setAssetsExpanded] = useState(true)
  const [debtsExpanded, setDebtsExpanded] = useState(true)

  const handleYearsChange = useCallback((value: number) => {
    setProjectionYears(Math.max(1, Math.min(maxProjectionYears, value)))
  }, [maxProjectionYears])

  // Group and project
  const assetGroups = useMemo(() => groupAssetsByType(assets), [assets])
  const debtGroups = useMemo(() => groupDebtsByType(debts), [debts])

  // ── Kruispunt (crossover month) berekening ──
  // The month at which passive income >= expenses — contributions stop after this point.
  // Annual expenses = income - savings. Passive income = netWorth × effectiveSwr.
  const crossoverMonth = useMemo(() => {
    const monthlyExpenses = profileMonthlyIncome * (1 - profileSavingsRate / 100)
    const annualExpenses = monthlyExpenses * 12
    if (annualExpenses <= 0 || profileMonthlyIncome <= 0) return null // No meaningful crossover

    // Simulate net worth month-by-month to find crossover
    const totalMonths = projectionYears * 12
    const monthlyGrossReturn = fireParams.grossReturn / 12

    // Start values
    let totalAssetValue = assets.reduce((s, a) => s + Number(a.current_value), 0)
    let totalDebtBalance = debts.reduce((s, d) => s + Number(d.current_balance), 0)

    for (let m = 1; m <= totalMonths; m++) {
      // Grow each asset
      let assetGrowth = 0
      let assetContributions = 0
      for (const a of assets) {
        // Approximate: use each asset's own return
        assetGrowth += (Number(a.current_value) > 0 ? totalAssetValue : 0) * 0 // simplified below
      }
      // Simplified: grow total assets at gross return, add total contributions
      assetGrowth = totalAssetValue * monthlyGrossReturn
      assetContributions = assets.reduce((s, a) => s + Number(a.monthly_contribution), 0)
      totalAssetValue += assetGrowth + assetContributions

      // Shrink debts
      for (const d of debts) {
        const monthlyRate = Number(d.interest_rate) / 100 / 12
        const interest = totalDebtBalance * monthlyRate
        const payment = Math.min(Number(d.monthly_payment), totalDebtBalance + interest)
        totalDebtBalance = Math.max(0, totalDebtBalance + interest - payment)
      }

      const netWorth = totalAssetValue - totalDebtBalance
      const passiveIncome = netWorth * fireParams.effectiveSwr
      if (passiveIncome >= annualExpenses) {
        return m // Crossover month found
      }
    }
    return null // Not reached within projection horizon
  }, [assets, debts, profileMonthlyIncome, profileSavingsRate, fireParams, projectionYears])

  // Crossover year for display purposes
  const crossoverYear = crossoverMonth != null ? Math.ceil(crossoverMonth / 12) : null

  const assetProjections = useMemo(() => {
    const result: { type: AssetType; label: string; columns: { label: string; rows: YearRow[] }[] }[] = []
    for (const [type, group] of assetGroups) {
      result.push({
        type,
        label: ASSET_TYPE_LABELS[type],
        columns: group.map((a) => ({
          label: a.name,
          rows: projectAssetYearly(a, projectionYears, crossoverMonth),
        })),
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

  // Compute yearly totals with Box 3 tax impact on net worth
  const { assetTotals, debtTotals, netTotals, box3Taxes } = useMemo(() => {
    const aTotals: number[] = []
    const dTotals: number[] = []
    const nTotals: number[] = []

    for (let yr = 0; yr < projectionYears; yr++) {
      let assetSum = 0
      for (const group of assetProjections) {
        for (const col of group.columns) {
          assetSum += col.rows[yr]?.value ?? 0
        }
      }

      let debtSum = 0
      for (const group of debtProjections) {
        for (const col of group.columns) {
          debtSum += col.rows[yr]?.value ?? 0
        }
      }

      aTotals.push(assetSum)
      dTotals.push(debtSum)
      nTotals.push(assetSum - debtSum)
    }

    return { assetTotals: aTotals, debtTotals: dTotals, netTotals: nTotals, box3Taxes: taxes }
  }, [assetProjections, debtProjections, projectionYears, hasPartner])

  const hasAssets = assets.length > 0
  const hasDebts = debts.length > 0
  const totalAssetValue = assets.reduce((s, a) => s + Number(a.current_value), 0)
  const totalDebtValue = debts.reduce((s, d) => s + Number(d.current_balance), 0)
  const netWorth = totalAssetValue - totalDebtValue

  return (
    <div className="space-y-8">
      {/* Section: Summary header */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Huidige bezittingen</p>
          <p className="font-mono tabular-nums text-lg font-bold text-emerald-600">
            {formatCurrency(assets.reduce((s, a) => s + Number(a.current_value), 0))}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Huidige schulden</p>
          <p className="font-mono tabular-nums text-lg font-bold text-red-500">
            {formatCurrency(debts.reduce((s, d) => s + Number(d.current_balance), 0))}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Netto vermogen</p>
          <p className="font-mono tabular-nums text-lg font-bold text-horizon-600">
            {formatCurrency(
              assets.reduce((s, a) => s + Number(a.current_value), 0) -
              debts.reduce((s, d) => s + Number(d.current_balance), 0)
            )}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Netto inkomen</p>
          <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink)]">
            {formatCurrency(profileMonthlyIncome)}<span className="text-[var(--ink-4)] text-[10px] ml-1">/mnd</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Spaarquote (profiel)</p>
          <p className="font-mono tabular-nums text-sm font-semibold text-horizon-600">
            {profileSavingsRate.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--ink-4)]">Rendement / Inflatie</p>
          <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink-2)]">
            {(fireParams.grossReturn * 100).toFixed(1)}% / {(fireParams.inflationRate * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Section: Time horizon selector */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">
            Tijdshorizon
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={maxProjectionYears}
              step={1}
              value={projectionYears}
              onChange={(e) => handleYearsChange(Number(e.target.value))}
              className="h-2 w-40 cursor-pointer appearance-none rounded-full bg-[var(--subtle)] accent-horizon-500 sm:w-56"
            />
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={maxProjectionYears}
                value={projectionYears}
                onChange={(e) => handleYearsChange(Number(e.target.value))}
                className="w-16 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1.5 text-center font-mono tabular-nums text-sm text-[var(--ink)] focus:border-horizon-500 focus:outline-none focus:ring-1 focus:ring-horizon-500"
              />
              <span className="text-sm text-[var(--ink-3)]">jaar</span>
            </div>
          </div>
          {currentAge != null && (
            <span className="text-[11px] text-[var(--ink-4)]">
              Leeftijd nu: {currentAge} · tot {currentAge + projectionYears} jaar{projectionYears === maxProjectionYears ? ' (max 100)' : ''}
            </span>
          )}
          {projectionYears !== defaultYears && (
            <button
              onClick={() => setProjectionYears(defaultYears)}
              className="text-[11px] text-horizon-600 underline underline-offset-2 hover:text-horizon-700"
            >
              Reset naar {defaultYears} jaar
            </button>
          )}
        </div>
      </div>

      {/* Section: Summary chart */}
      {(hasAssets || hasDebts) && (
        <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--ink-3)]">
            Vermogensopbouw — {projectionYears} jaar projectie
          </h2>
          <StackedAreaChart
            assets={assets}
            debts={debts}
            profileMonthlyIncome={profileMonthlyIncome}
            profileSavingsRate={profileSavingsRate}
            projectionYears={projectionYears}
            crossoverMonth={crossoverMonth}
          />
        </div>
      )}

      {/* Section: Asset tables by type */}
      {hasAssets && (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            Bezittingen per categorie
          </h2>
          {assetProjections.map((group) => (
            <ProjectionTable
              key={group.type}
              title={group.label}
              columns={group.columns}
              color="bg-emerald-50/40"
              projectionYears={projectionYears}
            />
          ))}
        </div>
      )}

      {/* Section: Per-asset monthly tables */}
      {hasAssets && (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            Doorrekening per bezitting — maand-op-maand
          </h2>
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

      {/* Section: Debt tables by type */}
      {hasDebts && (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-red-500">
            Schulden per categorie
          </h2>
          {debtProjections.map((group) => (
            <ProjectionTable
              key={group.type}
              title={group.label}
              columns={group.columns}
              color="bg-red-50/30"
              projectionYears={projectionYears}
            />
          ))}
        </div>
      )}

      {/* Section: Per-debt amortization tables (month-by-month) */}
      {hasDebts && (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-red-500">
            Doorrekening per schuld — maand-op-maand
          </h2>
          {debts.map((debt) => (
            <DebtAmortizationTable key={debt.id} debt={debt} projectionYears={projectionYears} />
          ))}
        </div>
      )}

      {/* Section: Savings rate */}
      <SavingsRateTable
        assets={assets}
        debts={debts}
        profileMonthlyIncome={profileMonthlyIncome}
        profileSavingsRate={profileSavingsRate}
      />

      {/* Section: Savings projection month-by-month */}
      <SavingsProjectionTable
        profileMonthlyIncome={profileMonthlyIncome}
        profileSavingsRate={profileSavingsRate}
        projectionYears={projectionYears}
      />

      {/* Section: Net worth monthly overview (feature #629) */}
      <NetWorthMonthlyTable
        assets={assets}
        debts={debts}
        profileMonthlyIncome={profileMonthlyIncome}
        profileSavingsRate={profileSavingsRate}
        projectionYears={projectionYears}
      />

      {/* Section: Total overview */}
      {(hasAssets || hasDebts) && (
        <TotalTable assetTotals={assetTotals} debtTotals={debtTotals} netTotals={netTotals} box3Taxes={box3Taxes} projectionYears={projectionYears} crossoverYear={crossoverYear} />
      )}

      {/* Empty state */}
      {!hasAssets && !hasDebts && (
        <div className="rounded-xl border border-dashed border-[var(--border-md)] p-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">
            Nog geen bezittingen of schulden gevonden. Voeg eerst je financiële gegevens toe via{' '}
            <a href="/core/assets" className="text-horizon-600 underline underline-offset-2">Bezittingen</a>{' '}
            of{' '}
            <a href="/core/debts" className="text-horizon-600 underline underline-offset-2">Schulden</a>.
          </p>
        </div>
      )}
    </div>
  )
}

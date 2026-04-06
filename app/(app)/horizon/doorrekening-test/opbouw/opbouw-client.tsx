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


// ── Withdrawal strategy for life event impacts (features #665, #666) ────

type AllocationStrategy = 'spreiden' | 'cash_first' | 'hoogste_rendement'

/**
 * Apply a withdrawal from assets using the chosen strategy.
 * Mutates the `values` array in-place. Assets can never go below 0 —
 * any remainder cascades to the next asset.
 */
function applyWithdrawal(
  values: number[],
  assets: Asset[],
  amount: number,
  strategy: AllocationStrategy,
) {
  let remaining = amount

  if (strategy === 'spreiden') {
    // Proportional: withdraw from each asset by its value share
    const total = values.reduce((s, v) => s + v, 0)
    if (total <= 0) return
    for (let i = 0; i < values.length; i++) {
      const share = values[i] / total
      const withdraw = Math.min(values[i], remaining * share)
      values[i] -= withdraw
      remaining -= withdraw
    }
    // Handle rounding remainder — cascade through assets
    if (remaining > 0.01) {
      for (let i = 0; i < values.length; i++) {
        const withdraw = Math.min(values[i], remaining)
        values[i] -= withdraw
        remaining -= withdraw
        if (remaining <= 0.01) break
      }
    }
  } else if (strategy === 'cash_first') {
    // Cash first: withdraw from lowest-returning asset first
    const indices = assets.map((_, i) => i)
    indices.sort(
      (a, b) => Number(assets[a].expected_return) - Number(assets[b].expected_return),
    )
    for (const idx of indices) {
      if (remaining <= 0.01) break
      const withdraw = Math.min(values[idx], remaining)
      values[idx] -= withdraw
      remaining -= withdraw
    }
  } else {
    // hoogste_rendement: withdraw from highest-returning asset first
    const indices = assets.map((_, i) => i)
    indices.sort(
      (a, b) => Number(assets[b].expected_return) - Number(assets[a].expected_return),
    )
    for (const idx of indices) {
      if (remaining <= 0.01) break
      const withdraw = Math.min(values[idx], remaining)
      values[idx] -= withdraw
      remaining -= withdraw
    }
  }
}

/**
 * Apply a deposit (positive cashflow) to assets using the chosen strategy.
 * Mutates the `values` array in-place.
 */
function applyDeposit(
  values: number[],
  assets: Asset[],
  amount: number,
  strategy: AllocationStrategy,
) {
  if (values.length === 0) return

  if (strategy === 'spreiden') {
    // Proportional: distribute across assets by current value share
    const total = values.reduce((s, v) => s + v, 0)
    if (total > 0) {
      for (let i = 0; i < values.length; i++) {
        values[i] += amount * (values[i] / total)
      }
    } else {
      // All zero: distribute equally
      const share = amount / values.length
      for (let i = 0; i < values.length; i++) {
        values[i] += share
      }
    }
  } else if (strategy === 'cash_first') {
    // Cash first: add to lowest-returning asset first
    const indices = assets.map((_, i) => i)
    indices.sort(
      (a, b) => Number(assets[a].expected_return) - Number(assets[b].expected_return),
    )
    values[indices[0]] += amount
  } else {
    // hoogste_rendement: add to highest-returning asset first
    const indices = assets.map((_, i) => i)
    indices.sort(
      (a, b) => Number(assets[b].expected_return) - Number(assets[a].expected_return),
    )
    values[indices[0]] += amount
  }
}

/** Per-event allocation record: how an event's cashflow was distributed across assets in a given year */
interface EventAssetAllocation {
  /** Amount allocated to each asset (positive = deposit, negative = withdrawal) */
  perAsset: number[]
}

/** Result from simulateAssetsWithEvents including per-event allocation tracking */
interface EventSimulationResult {
  yearlyAssetValues: number[][] /* [assetIdx][year] */
  /** Per-event per-year allocation details: [eventIdx][year] */
  yearlyEventAllocations: EventAssetAllocation[][]
}

/**
 * Run a joint month-by-month asset simulation that applies life event
 * cashflows each month via the chosen allocation strategy.
 *
 * Positive cashflows (income events) are deposited using `applyDeposit`.
 * Negative cashflows (expense events) are withdrawn using `applyWithdrawal`.
 *
 * Returns yearly snapshots (end of each 12-month period) per asset,
 * plus per-event allocation tracking for the TotalTable.
 */
function simulateAssetsWithEvents(
  assets: Asset[],
  totalMonths: number,
  perEventYearlyCashflows: number[][],
  strategy: AllocationStrategy,
  crossoverMonth: number | null,
): EventSimulationResult {
  const numEvents = perEventYearlyCashflows.length
  // Initialize per-asset values
  const values = assets.map((a) => Number(a.current_value))
  const rates = assets.map((a) => Number(a.expected_return) / 100 / 12)
  const contribs = assets.map((a) => Number(a.monthly_contribution))

  // Convert per-event yearly cashflows to monthly by dividing evenly across 12 months.
  // monthlyPerEvent: Map<month, number[]> where number[] is per-event monthly cashflow
  const monthlyPerEvent = new Map<number, number[]>()
  for (let ei = 0; ei < numEvents; ei++) {
    const yearlyCf = perEventYearlyCashflows[ei]
    for (let yr = 0; yr < yearlyCf.length; yr++) {
      const annual = yearlyCf[yr]
      if (annual === 0) continue
      const monthly = annual / 12
      for (let m = yr * 12 + 1; m <= (yr + 1) * 12 && m <= totalMonths; m++) {
        let arr = monthlyPerEvent.get(m)
        if (!arr) { arr = new Array(numEvents).fill(0); monthlyPerEvent.set(m, arr) }
        arr[ei] += monthly
      }
    }
  }

  // Track yearly snapshots (end of each 12-month period)
  const yearlyValues: number[][] = assets.map(() => [])
  // Track per-event per-year cumulative allocations per asset
  // yearlyAllocAccum[eventIdx][assetIdx] accumulates within the current year
  const yearlyAllocAccum: number[][] = Array.from({ length: numEvents }, () => new Array(assets.length).fill(0))
  const yearlyEventAllocations: EventAssetAllocation[][] = Array.from({ length: numEvents }, () => [])

  for (let m = 1; m <= totalMonths; m++) {
    // 1. Apply returns
    for (let i = 0; i < values.length; i++) {
      values[i] += values[i] * rates[i]
    }

    // 2. Apply contributions (stop after crossover)
    for (let i = 0; i < values.length; i++) {
      if (crossoverMonth != null && m > crossoverMonth) continue
      values[i] += contribs[i]
    }

    // 3. Apply per-event cashflows using the chosen allocation strategy
    const evCfs = monthlyPerEvent.get(m)
    if (evCfs) {
      for (let ei = 0; ei < numEvents; ei++) {
        const cf = evCfs[ei]
        if (cf === 0) continue
        // Snapshot before applying this event to track per-asset delta
        const before = values.slice()
        if (cf < 0) {
          applyWithdrawal(values, assets, -cf, strategy)
        } else {
          applyDeposit(values, assets, cf, strategy)
        }
        // Record per-asset delta for this event
        for (let ai = 0; ai < assets.length; ai++) {
          yearlyAllocAccum[ei][ai] += values[ai] - before[ai]
        }
      }
    }

    // Ensure no negative values
    for (let i = 0; i < values.length; i++) {
      values[i] = Math.max(0, values[i])
    }

    // Record yearly snapshot at end of each 12-month period
    if (m % 12 === 0) {
      for (let i = 0; i < values.length; i++) {
        yearlyValues[i].push(Math.round(values[i]))
      }
      // Record and reset per-event allocation accumulators
      for (let ei = 0; ei < numEvents; ei++) {
        yearlyEventAllocations[ei].push({ perAsset: yearlyAllocAccum[ei].map(v => Math.round(v)) })
        yearlyAllocAccum[ei].fill(0)
      }
    }
  }

  return { yearlyAssetValues: yearlyValues, yearlyEventAllocations }
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

function SavingsProjectionTable({ profileMonthlyIncome, profileSavingsRate, projectionYears, crossoverMonth }: {
  profileMonthlyIncome: number
  profileSavingsRate: number
  projectionYears: number
  crossoverMonth: number | null
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
    // Always include crossover month so the kruispunt row is visible
    if (crossoverMonth != null && crossoverMonth >= 1 && crossoverMonth <= totalMonths && !months.includes(crossoverMonth)) {
      months.push(crossoverMonth)
    }
    if (!months.includes(totalMonths)) months.push(totalMonths)
    return months.sort((a, b) => a - b)
  }, [totalMonths, crossoverMonth])

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
              const isAfterCrossover = crossoverMonth != null && month > crossoverMonth
              const isCrossoverMonth = crossoverMonth != null && month === crossoverMonth
              // Cumulative: grows until crossover, then stays flat
              const effectiveMonths = crossoverMonth != null ? Math.min(month, crossoverMonth) : month
              const cumulative = monthlySavings * effectiveMonths
              const effectiveSavings = isAfterCrossover ? 0 : monthlySavings
              const effectiveRate = isAfterCrossover ? 0 : profileSavingsRate
              const effectiveIncome = isAfterCrossover ? 0 : profileMonthlyIncome
              return (
                <tr key={month} className={`border-b border-[var(--border-ed)] last:border-b-0 hover:bg-[var(--subtle)]/50 ${isCrossoverMonth ? 'bg-horizon-50/60' : isAfterCrossover ? 'bg-[var(--subtle)]/15' : idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}>
                  <td className="px-3 py-1 font-mono tabular-nums text-[var(--ink-3)]">
                    {month}
                    {isCrossoverMonth && <span className="ml-1 text-[9px] font-semibold text-horizon-600">⚡ kruispunt</span>}
                  </td>
                  <td className={`px-3 py-1 text-right font-mono tabular-nums ${isAfterCrossover ? 'text-[var(--ink-4)]' : 'text-[var(--ink-2)]'}`}>
                    {formatCurrency(effectiveIncome)}
                  </td>
                  <td className={`px-3 py-1 text-right font-mono tabular-nums ${isAfterCrossover ? 'text-[var(--ink-4)]' : 'text-[var(--ink-2)]'}`}>
                    {effectiveRate.toFixed(1)}%
                  </td>
                  <td className={`px-3 py-1 text-right font-mono tabular-nums ${isAfterCrossover ? 'text-[var(--ink-4)]' : 'text-emerald-600'}`}>
                    {formatCurrency(effectiveSavings)}
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

function TotalTable({ assetTotals, debtTotals, netTotals, box3Taxes, projectionYears, crossoverYear, yearlyEventCashflows, perEventYearlyCashflows, eventGroups, eventAllocations, assetNames }: {
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
      <div className="border-b border-[var(--border-ed)] bg-horizon-50/30 px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Totaaloverzicht</h3>
        <p className="text-[10px] text-[var(--ink-4)] mt-0.5">
          Box 3: fictief rendement {(NL_FICTIEF_BELEGGINGEN * 100).toFixed(2)}% × tarief {(BOX3_TARIEF * 100).toFixed(0)}%, heffingsvrij vermogen afgetrokken
          {hasEvents && ' · hover op event-kolom toont verdeling over bezittingen'}
        </p>
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

export function OpbouwClient({ assets, debts, profile, fireParams, cashflows, lifeEvents }: {
  assets: Asset[]
  debts: Debt[]
  profile: Record<string, unknown> | null
  fireParams: FireParams
  cashflows: SimCashflow[]
  lifeEvents: LifeEvent[]
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
  const [allocationStrategy, setAllocationStrategy] = useState<AllocationStrategy>('spreiden')

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

    // Simulate each asset individually with its own return rate
    const totalMonths = projectionYears * 12
    const aVals = assets.map((a) => Number(a.current_value))
    const aRates = assets.map((a) => Number(a.expected_return) / 100 / 12)
    const aContribs = assets.map((a) => Number(a.monthly_contribution))
    const dBals = debts.map((d) => Number(d.current_balance))
    const dRates = debts.map((d) => Number(d.interest_rate) / 100 / 12)
    const dPays = debts.map((d) => Number(d.monthly_payment))

    for (let m = 1; m <= totalMonths; m++) {
      for (let i = 0; i < aVals.length; i++) {
        aVals[i] = Math.max(0, aVals[i] + aVals[i] * aRates[i] + aContribs[i])
      }
      for (let i = 0; i < dBals.length; i++) {
        if (dBals[i] <= 0) continue
        const interest = dBals[i] * dRates[i]
        dBals[i] = Math.max(0, dBals[i] + interest - Math.min(dPays[i], dBals[i] + interest))
      }
      const nw = aVals.reduce((s, v) => s + v, 0) - dBals.reduce((s, v) => s + v, 0)
      if (nw * fireParams.effectiveSwr >= annualExpenses) {
        return m
      }
    }
    return null // Not reached within projection horizon
  }, [assets, debts, profileMonthlyIncome, profileSavingsRate, fireParams, projectionYears])

  // Crossover year for display purposes
  const crossoverYear = crossoverMonth != null ? Math.ceil(crossoverMonth / 12) : null

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

  // Compute yearly totals with Box 3 tax impact on net worth.
  // When events exist, asset totals come from the event-adjusted simulation
  // so that Box 3 tax automatically reflects reduced/increased asset values (#666).
  const { assetTotals, debtTotals, netTotals, box3Taxes } = useMemo(() => {
    const aTotals: number[] = []
    const dTotals: number[] = []
    const nTotals: number[] = []
    const taxes: number[] = []
    let cumulativeTax = 0

    // Build a flat list of inclusion weights matching the asset order
    const inclusionWeights = assets.map(a => (a.net_worth_inclusion_pct ?? 100) / 100)

    for (let yr = 0; yr < projectionYears; yr++) {
      let assetSum = 0
      if (eventAdjustedAssets) {
        // Use event-adjusted per-asset values, weighted by inclusion pct
        for (let i = 0; i < assets.length; i++) {
          assetSum += (eventAdjustedAssets.yearlyAssetValues[i]?.[yr] ?? 0) * inclusionWeights[i]
        }
      } else {
        // Original: sum from independent projections, weighted by inclusion pct
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
  const netWorth = totalAssetValue - totalDebtValue

  return (
    <div className="space-y-6">
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
              {formatCurrency(netWorth)}
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

        {/* Time horizon selector inside the summary card */}
        <div className="mt-4 border-t border-[var(--border-ed)] pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Tijdshorizon
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={60}
                step={1}
                value={projectionYears}
                onChange={(e) => handleYearsChange(Number(e.target.value))}
                className="h-2 w-40 cursor-pointer appearance-none rounded-full bg-[var(--subtle)] accent-horizon-500 sm:w-56"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={projectionYears}
                  onChange={(e) => handleYearsChange(Number(e.target.value))}
                  className="w-16 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1.5 text-center font-mono tabular-nums text-sm text-[var(--ink)] focus:border-horizon-500 focus:outline-none focus:ring-1 focus:ring-horizon-500"
                />
                <span className="text-sm text-[var(--ink-3)]">jaar</span>
              </div>
            </div>
            {projectionYears !== DEFAULT_PROJECTION_YEARS && (
              <button
                onClick={() => setProjectionYears(DEFAULT_PROJECTION_YEARS)}
                className="text-[11px] text-horizon-600 underline underline-offset-2 hover:text-horizon-700"
              >
                Reset naar {DEFAULT_PROJECTION_YEARS} jaar
              </button>
            )}
          </div>
        </div>

        {/* Withdrawal strategy selector — only shown when life events produce cashflows */}
        {hasEvents && (
          <div className="mt-4 border-t border-[var(--border-ed)] pt-4">
            <div className="flex flex-wrap items-center gap-4">
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Toename-strategie
              </label>
              <div className="flex gap-2">
                {([
                  { key: 'spreiden' as const, label: 'Spreiden' },
                  { key: 'cash_first' as const, label: 'Cash first' },
                  { key: 'hoogste_rendement' as const, label: 'Hoogste rendement' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setAllocationStrategy(key)}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      allocationStrategy === key
                        ? 'bg-horizon-600 text-white'
                        : 'bg-[var(--subtle)] text-[var(--ink-3)] hover:bg-[var(--subtle)]/80'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[10px] text-[var(--ink-4)]">
              {lifeEvents.length} levensgebeurtenis{lifeEvents.length !== 1 ? 'sen' : ''} be{'\u00EF'}nvloeden de projectie
              {allocationStrategy === 'spreiden' && ' \u2014 bedragen worden proportioneel verdeeld over bezittingen'}
              {allocationStrategy === 'cash_first' && ' \u2014 bedragen gaan eerst naar bezitting met laagste rendement'}
              {allocationStrategy === 'hoogste_rendement' && ' \u2014 bedragen gaan eerst naar bezitting met hoogste rendement'}
            </p>
          </div>
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
            />
          </div>
        </div>
      )}

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

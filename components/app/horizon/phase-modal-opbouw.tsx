'use client'

import { memo, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { formatCurrency } from '@/lib/format'
import { useModalAnimation } from '@/lib/hooks/use-modal-animation'
import { PhaseDetailTable } from '@/components/app/horizon/phase-detail-table'
import type { UnifiedProjectionRow, AssetBucketDetail } from '@/lib/unified-projection'
import { ASSET_TYPE_LABELS, type AssetType, type Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

// ── Types ────────────────────────────────────────────────────────────────────

interface PhaseModalOpbouwProps {
  open: boolean
  onClose: () => void
  currentAge: number
  fireAge: number
  currentNetWorth: number
  expectedPortfolioAtFire: number
  yearlySavings: number
  yearlyExpenses: number  // for freedom-day calculation
  expectedReturn: number  // e.g. 0.07 for 7%
  inflationRate: number   // e.g. 0.02 for 2%
  /** Unified projection rows (with per-asset-type detail) */
  rows: UnifiedProjectionRow[]
  /** Assets for type labels in breakdown */
  assets?: Asset[]
  /** Debts metadata for human-readable labels in detail table */
  debts?: Debt[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Short label for asset types in the kassabon breakdown */
const WEALTHGROUP_LABELS: Partial<Record<AssetType, string>> = {
  cash: 'Cash',
  savings: 'Spaargeld',
  investment: 'Beleggingen',
  retirement: 'Pensioen',
  eigen_huis: 'Vastgoed (woning)',
  real_estate: 'Vastgoed',
  crypto: 'Crypto',
  other: 'Overig',
}

function wealthGroupLabel(type: AssetType): string {
  return WEALTHGROUP_LABELS[type] ?? ASSET_TYPE_LABELS[type] ?? type
}

// ── Mini Chart ───────────────────────────────────────────────────────────────

const CHART_W = 320
const CHART_H = 120
const PAD = { top: 16, right: 16, bottom: 24, left: 56 }

const MiniAccumulationChart = memo(function MiniAccumulationChart({
  rows,
  hasEntered,
}: {
  rows: UnifiedProjectionRow[]
  hasEntered: boolean
}) {
  if (rows.length < 2) return null

  const chartW = CHART_W - PAD.left - PAD.right
  const chartH = CHART_H - PAD.top - PAD.bottom

  const maxVal = Math.max(...rows.map(r => r.totalAssets), 1)
  const minAge = rows[0].age
  const maxAge = rows[rows.length - 1].age
  const ageSpan = maxAge - minAge || 1

  const x = (age: number) => PAD.left + ((age - minAge) / ageSpan) * chartW
  const y = (val: number) => PAD.top + chartH - (val / maxVal) * chartH

  // Build area path
  const points = rows.map(r => `${x(r.age)},${y(r.totalAssets)}`)
  const linePath = `M${points.join(' L')}`
  const areaPath = `${linePath} L${x(maxAge)},${y(0)} L${x(minAge)},${y(0)} Z`

  // Y-axis ticks (3 levels)
  const yTicks = [0, 0.5, 1.0].map(f => ({
    val: maxVal * f,
    yPos: y(maxVal * f),
  }))

  // X-axis ticks
  const xStep = ageSpan <= 10 ? 2 : ageSpan <= 20 ? 5 : 10
  const xTicks: number[] = []
  for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge; a += xStep) {
    xTicks.push(a)
  }

  const animProgress = hasEntered ? 1 : 0

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full"
      role="img"
      aria-label="Vermogensgroei tijdens opbouwfase"
    >
      {/* Grid lines */}
      {yTicks.map(t => (
        <g key={t.val}>
          <line
            x1={PAD.left}
            x2={CHART_W - PAD.right}
            y1={t.yPos}
            y2={t.yPos}
            stroke="var(--border-ed, #e5e5e5)"
            strokeWidth={0.5}
          />
          <text
            x={PAD.left - 6}
            y={t.yPos + 3}
            textAnchor="end"
            className="fill-[var(--ink-4)]"
            style={{ fontSize: 8, fontFamily: 'var(--font-mono, monospace)' }}
          >
            {t.val >= 1_000_000
              ? `\u20AC${(t.val / 1_000_000).toFixed(1)}M`
              : t.val >= 1_000
              ? `\u20AC${Math.round(t.val / 1_000)}k`
              : `\u20AC${Math.round(t.val)}`}
          </text>
        </g>
      ))}

      {/* X-axis ticks */}
      {xTicks.map(age => (
        <text
          key={age}
          x={x(age)}
          y={CHART_H - 4}
          textAnchor="middle"
          className="fill-[var(--ink-4)]"
          style={{ fontSize: 8, fontFamily: 'var(--font-mono, monospace)' }}
        >
          {age}
        </text>
      ))}

      {/* Area fill */}
      <path
        d={areaPath}
        fill="var(--color-horizon-100, #e8dcca)"
        opacity={0.5}
        style={{
          transition: 'opacity 700ms ease-out',
          opacity: animProgress * 0.5,
        }}
      />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke="var(--color-horizon-600, #a07840)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        style={{
          strokeDasharray: 1,
          strokeDashoffset: 1 - animProgress,
          transition: 'stroke-dashoffset 700ms ease-out',
        }}
      />

      {/* End dot */}
      <circle
        cx={x(maxAge)}
        cy={y(rows[rows.length - 1].totalAssets)}
        r={3}
        fill="var(--color-horizon-600, #a07840)"
        style={{
          transition: 'opacity 400ms ease-out 500ms',
          opacity: animProgress,
        }}
      />
    </svg>
  )
})

// ── Modal Component ──────────────────────────────────────────────────────────

export const PhaseModalOpbouw = memo(function PhaseModalOpbouw({
  open,
  onClose,
  currentAge,
  fireAge,
  currentNetWorth,
  expectedPortfolioAtFire,
  yearlySavings,
  yearlyExpenses,
  expectedReturn,
  inflationRate,
  rows,
  assets,
  debts,
}: PhaseModalOpbouwProps) {
  const [assumptionsOpen, setAssumptionsOpen] = useState(false)

  // Filter to accumulation phase rows
  const accumulationRows = rows.filter(r => r.phase === 'accumulation')

  // ── Waterval-kassabon aggregaten ────────────────────────────────────────
  const totalInleg = accumulationRows.reduce((sum, r) => sum + r.savings, 0)
  const totalRendement = accumulationRows.reduce((sum, r) => sum + r.totalGrowth, 0)
  const totalBox3 = accumulationRows.reduce((sum, r) => sum + r.totalBox3, 0)
  const totalEvents = accumulationRows.reduce((sum, r) => sum + r.cashflowNet, 0)

  // Start value: net worth at beginning of first accumulation year (assets - debts)
  const startVermogen = accumulationRows.length > 0
    ? accumulationRows[0].startNetWorth
    : currentNetWorth
  // End value: net worth at end of last accumulation year (assets - debts)
  const eindVermogen = accumulationRows.length > 0
    ? accumulationRows[accumulationRows.length - 1].netWorth
    : expectedPortfolioAtFire

  // ── Rendement per wealthgroup ──────────────────────────────────────────
  const growthByType: Partial<Record<AssetType, number>> = {}
  const box3ByType: Partial<Record<AssetType, number>> = {}
  const returnByType: Partial<Record<AssetType, { totalGrowth: number; avgValue: number; years: number }>> = {}

  for (const row of accumulationRows) {
    for (const [type, bucket] of Object.entries(row.assetBuckets) as [AssetType, AssetBucketDetail][]) {
      if (!bucket) continue
      growthByType[type] = (growthByType[type] ?? 0) + bucket.growth
      box3ByType[type] = (box3ByType[type] ?? 0) + bucket.box3Drag

      if (!returnByType[type]) {
        returnByType[type] = { totalGrowth: 0, avgValue: 0, years: 0 }
      }
      returnByType[type]!.totalGrowth += bucket.growth
      returnByType[type]!.avgValue += bucket.startValue
      returnByType[type]!.years += 1
    }
  }

  // Filter to wealthgroups with actual growth
  const activeTypes = (Object.keys(growthByType) as AssetType[]).filter(
    t => Math.abs(growthByType[t] ?? 0) > 0.5
  )

  // ── Redactionele noot: vrijheidsdagen per maand ────────────────────────
  const yearsAccumulation = Math.max(fireAge - currentAge, 1)
  // Freedom days built per month = monthly savings / daily expenses
  // Derive monthly savings from total inleg if yearlySavings prop is 0
  const effectiveMonthlySavings = yearlySavings > 0
    ? yearlySavings / 12
    : (totalInleg / yearsAccumulation / 12)
  const dailyExpenseRate = yearlyExpenses > 0 ? yearlyExpenses / 365 : 0
  const freedomDaysBuiltPerMonth = dailyExpenseRate > 0 && effectiveMonthlySavings > 0
    ? Math.round(effectiveMonthlySavings / dailyExpenseRate)
    : null

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`Opbouwfase \u00b7 ${Math.round(currentAge)} \u2192 ${Math.round(fireAge)} jaar`}
      size="lg"
      initialMobileHeight="60vh"
    >
      {/* Accent line */}
      <div className="h-[2px] bg-[var(--color-horizon-600)]" />

      <div className="p-5">
        {/* ── Waterval Kassabon ───────────────────────────────────── */}
        <KassabonShell>
          {/* Header */}
          <div className="mb-3 text-center">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              VERMOGENSPROGNOSE
            </p>
            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
              Opbouwfase &middot; {Math.round(yearsAccumulation)} jaar
            </p>
          </div>

          {/* Waterval receipt rows */}
          <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <ReceiptRow label="Startvermogen" value={formatCurrency(Math.round(startVermogen))} />
            <ReceiptRow label="Totale inleg" value={formatCurrency(Math.round(totalInleg))} plus />
            <ReceiptRow label="Totaal rendement" value={formatCurrency(Math.round(totalRendement))} plus />

            {/* Rendement sub-breakdown per wealthgroup */}
            {activeTypes.length > 1 && (
              <div className="ml-4 border-l border-dotted border-[var(--border-ed)] pl-3">
                {activeTypes.map(type => (
                  <ReceiptRow
                    key={type}
                    label={wealthGroupLabel(type)}
                    value={formatCurrency(Math.round(growthByType[type] ?? 0))}
                    subtle
                  />
                ))}
              </div>
            )}

            <ReceiptRow
              label="Box 3 belasting"
              value={totalBox3 > 0 ? `\u2212${formatCurrency(Math.round(totalBox3)).replace('\u20AC', '\u20AC ')}` : formatCurrency(0)}
              minus={totalBox3 > 0}
            />
            {Math.abs(totalEvents) > 0.5 && (
              <ReceiptRow
                label="Life events"
                value={totalEvents >= 0
                  ? formatCurrency(Math.round(totalEvents))
                  : `\u2212${formatCurrency(Math.round(Math.abs(totalEvents))).replace('\u20AC', '\u20AC ')}`}
                plus={totalEvents > 0}
                minus={totalEvents < 0}
              />
            )}
          </div>

          {/* Total */}
          <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
            <span className="font-sans text-sm text-[var(--ink)]">Vermogen bij FIRE</span>
            <span className="font-mono tabular-nums text-[var(--ink)]">
              {formatCurrency(Math.round(eindVermogen))}
            </span>
          </div>
        </KassabonShell>

        {/* ── Mini chart ──────────────────────────────────────────── */}
        {accumulationRows.length >= 2 && (
          <div className="mt-4">
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Vermogensgroei
            </p>
            <MiniChartWrapper rows={accumulationRows} />
          </div>
        )}

        {/* ── PhaseDetailTable (collapsed by default) ─────────────── */}
        {accumulationRows.length > 0 && (
          <PhaseDetailTable
            rows={accumulationRows}
            phase="accumulation"
            inflationRate={inflationRate}
            showAssetDetail={activeTypes.length > 1}
            debts={debts}
          />
        )}

        {/* ── Aannames sectie (collapsed) ──────────────────────────── */}
        <div className="mt-4 rounded-[var(--r)] border border-dashed border-[var(--border-ed)]">
          <button
            type="button"
            onClick={() => setAssumptionsOpen(!assumptionsOpen)}
            className="inline-flex min-h-[44px] w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
            aria-expanded={assumptionsOpen}
          >
            {assumptionsOpen
              ? <ChevronDown className="h-3.5 w-3.5 transition-transform duration-150" />
              : <ChevronRight className="h-3.5 w-3.5 transition-transform duration-150" />
            }
            Aannames
          </button>

          {assumptionsOpen && (
            <div className="border-t border-dashed border-[var(--border-ed)] px-3 pb-3 pt-2">
              <div className="space-y-1">
                <AssumptionRow label="Inflatie" value={`${(inflationRate * 100).toFixed(1)}%`} />
                <AssumptionRow label="Verwacht rendement (bruto)" value={`${(expectedReturn * 100).toFixed(1)}%`} />
                {activeTypes.map(type => {
                  const info = returnByType[type]
                  if (!info || info.years === 0) return null
                  const avgReturn = info.avgValue > 0 ? info.totalGrowth / info.avgValue : 0
                  const box3Drag = box3ByType[type] ?? 0
                  const avgBox3Rate = info.avgValue > 0 ? box3Drag / info.avgValue : 0
                  return (
                    <div key={type} className="ml-2 border-l border-dotted border-[var(--border-ed)] pl-2">
                      <AssumptionRow
                        label={`${wealthGroupLabel(type)} rendement`}
                        value={`~${(avgReturn * 100 / info.years).toFixed(1)}%/jr`}
                      />
                      {avgBox3Rate > 0 && (
                        <AssumptionRow
                          label={`${wealthGroupLabel(type)} Box 3 drag`}
                          value={`~${(avgBox3Rate * 100 / info.years).toFixed(2)}%/jr`}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Redactionele noot ────────────────────────────────────── */}
        {freedomDaysBuiltPerMonth != null && freedomDaysBuiltPerMonth > 0 && (
          <div className="mt-5 rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/30 px-4 py-3">
            <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-3)]">
              Elke maand bouw je {freedomDaysBuiltPerMonth} vrijheidsdagen op
            </p>
          </div>
        )}
      </div>
    </BottomSheet>
  )
})

// Wrapper to use useModalAnimation (hooks can't be inside memo directly with conditional)
function MiniChartWrapper({ rows }: { rows: UnifiedProjectionRow[] }) {
  const { hasEntered } = useModalAnimation({ delay: 150, duration: 700 })
  return <MiniAccumulationChart rows={rows} hasEntered={hasEntered} />
}

// ── Receipt row helper ───────────────────────────────────────────────────────

function ReceiptRow({
  label,
  value,
  plus,
  minus,
  subtle,
}: {
  label: string
  value: string
  plus?: boolean
  minus?: boolean
  subtle?: boolean
}) {
  return (
    <div className={`flex justify-between py-0.5 ${subtle ? 'opacity-70' : ''}`}>
      <span className={`font-sans ${subtle ? 'text-xs' : 'text-sm'} text-[var(--ink-2)]`}>
        {plus && !minus ? '+ ' : ''}{minus ? '\u2212 ' : ''}{label}
      </span>
      <span className={`font-mono tabular-nums ${subtle ? 'text-xs' : ''} ${
        plus ? 'text-[var(--positive)]' :
        minus ? 'text-[var(--negative)]' :
        'text-[var(--ink)]'
      }`}>
        {value}
      </span>
    </div>
  )
}

// ── Assumption row helper ────────────────────────────────────────────────────

function AssumptionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="font-sans text-xs text-[var(--ink-3)]">{label}</span>
      <span className="font-mono text-xs tabular-nums text-[var(--ink-2)]">{value}</span>
    </div>
  )
}

'use client'

import { memo } from 'react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { formatCurrency } from '@/lib/format'
import { useModalAnimation } from '@/lib/hooks/use-modal-animation'
import type { SimRow } from '@/lib/fire-simulation'

// ── Types ────────────────────────────────────────────────────────────────────

interface PhaseModalOpbouwProps {
  open: boolean
  onClose: () => void
  currentAge: number
  fireAge: number
  currentNetWorth: number
  expectedPortfolioAtFire: number
  yearlySavings: number
  expectedReturn: number  // e.g. 0.07 for 7%
  rows: SimRow[]          // full sim rows — we filter to accumulation
}

// ── Mini Chart ───────────────────────────────────────────────────────────────

const CHART_W = 320
const CHART_H = 120
const PAD = { top: 16, right: 16, bottom: 24, left: 56 }

const MiniAccumulationChart = memo(function MiniAccumulationChart({
  rows,
  hasEntered,
}: {
  rows: SimRow[]
  hasEntered: boolean
}) {
  if (rows.length < 2) return null

  const chartW = CHART_W - PAD.left - PAD.right
  const chartH = CHART_H - PAD.top - PAD.bottom

  const maxVal = Math.max(...rows.map(r => r.endPortfolio), 1)
  const minAge = rows[0].age
  const maxAge = rows[rows.length - 1].age
  const ageSpan = maxAge - minAge || 1

  const x = (age: number) => PAD.left + ((age - minAge) / ageSpan) * chartW
  const y = (val: number) => PAD.top + chartH - (val / maxVal) * chartH

  // Build area path
  const points = rows.map(r => `${x(r.age)},${y(r.endPortfolio)}`)
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
              ? `€${(t.val / 1_000_000).toFixed(1)}M`
              : t.val >= 1_000
              ? `€${Math.round(t.val / 1_000)}k`
              : `€${Math.round(t.val)}`}
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
        cy={y(rows[rows.length - 1].endPortfolio)}
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
  expectedReturn,
  rows,
}: PhaseModalOpbouwProps) {
  // Filter to accumulation phase rows
  const accumulationRows = rows.filter(r => r.phase === 'accumulation')

  // Compute estimated growth
  const estimatedGrowth = expectedPortfolioAtFire - currentNetWorth - (yearlySavings * (fireAge - currentAge))

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`Opbouwfase · ${Math.round(currentAge)} → ${Math.round(fireAge)} jaar`}
    >
      <div className="p-5">
        <KassabonShell>
          {/* Header */}
          <div className="mb-3 text-center">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              VERMOGENSPROGNOSE
            </p>
            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
              Opbouwfase · {Math.round(fireAge - currentAge)} jaar
            </p>
          </div>

          {/* Receipt rows */}
          <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <ReceiptRow label="Huidig vermogen" value={formatCurrency(currentNetWorth)} />
            <ReceiptRow label="Verwacht bij FIRE" value={formatCurrency(Math.round(expectedPortfolioAtFire))} />
            <ReceiptRow label="Jaarlijkse besparing" value={formatCurrency(Math.round(yearlySavings))} />
            <ReceiptRow label="Verwacht rendement" value={`${(expectedReturn * 100).toFixed(1)}%`} />
            <ReceiptRow label="Geschatte groei" value={formatCurrency(Math.round(estimatedGrowth))} />
          </div>

          {/* Total */}
          <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
            <span className="font-sans text-sm text-[var(--ink)]">Doelvermogen</span>
            <span className="font-mono tabular-nums text-[var(--ink)]">
              {formatCurrency(Math.round(expectedPortfolioAtFire))}
            </span>
          </div>
        </KassabonShell>

        {/* Mini chart */}
        {accumulationRows.length >= 2 && (
          <div className="mt-4">
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Vermogensgroei
            </p>
            <MiniChartWrapper rows={accumulationRows} />
          </div>
        )}
      </div>
    </BottomSheet>
  )
})

// Wrapper to use useModalAnimation (hooks can't be inside memo directly with conditional)
function MiniChartWrapper({ rows }: { rows: SimRow[] }) {
  const { hasEntered } = useModalAnimation({ delay: 150, duration: 700 })
  return <MiniAccumulationChart rows={rows} hasEntered={hasEntered} />
}

// ── Receipt row helper ───────────────────────────────────────────────────────

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="font-sans text-sm text-[var(--ink-2)]">{label}</span>
      <span className="font-mono tabular-nums text-[var(--ink)]">{value}</span>
    </div>
  )
}

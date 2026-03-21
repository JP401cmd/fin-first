'use client'

import { memo } from 'react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { formatCurrency } from '@/lib/format'
import { useModalAnimation } from '@/lib/hooks/use-modal-animation'
import type { SimRow } from '@/lib/fire-simulation'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import { STRATEGY_LABELS } from '@/lib/fire-strategy'

// ── Types ────────────────────────────────────────────────────────────────────

interface PhaseModalOnttrekkingProps {
  open: boolean
  onClose: () => void
  startAge: number
  endAge: number
  startPortfolio: number
  strategy: FireEndStrategy
  targetEndPortfolio: number
  yearlyWithdrawal: number
  yearlyAowIncome: number
  rows: SimRow[]            // full sim rows — we filter to retirement
}

// ── Mini Chart ───────────────────────────────────────────────────────────────

const CHART_W = 320
const CHART_H = 120
const PAD = { top: 16, right: 16, bottom: 24, left: 56 }

const MiniWithdrawalChart = memo(function MiniWithdrawalChart({
  rows,
  hasEntered,
}: {
  rows: SimRow[]
  hasEntered: boolean
}) {
  if (rows.length < 2) return null

  const chartW = CHART_W - PAD.left - PAD.right
  const chartH = CHART_H - PAD.top - PAD.bottom

  const maxVal = Math.max(...rows.map(r => Math.max(r.startPortfolio, r.endPortfolio)), 1)
  const minAge = rows[0].age
  const maxAge = rows[rows.length - 1].age
  const ageSpan = maxAge - minAge || 1

  const x = (age: number) => PAD.left + ((age - minAge) / ageSpan) * chartW
  const y = (val: number) => PAD.top + chartH - (val / maxVal) * chartH

  // Build area path using endPortfolio
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
      aria-label="Vermogensafname tijdens onttrekkingsfase"
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
        fill="var(--color-kern-100, #f5e6d0)"
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
        stroke="var(--color-kern-500, #8b6914)"
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
        fill="var(--color-kern-500, #8b6914)"
        style={{
          transition: 'opacity 400ms ease-out 500ms',
          opacity: animProgress,
        }}
      />
    </svg>
  )
})

// ── Modal Component ──────────────────────────────────────────────────────────

export const PhaseModalOnttrekking = memo(function PhaseModalOnttrekking({
  open,
  onClose,
  startAge,
  endAge,
  startPortfolio,
  strategy,
  targetEndPortfolio,
  yearlyWithdrawal,
  yearlyAowIncome,
  rows,
}: PhaseModalOnttrekkingProps) {
  // Filter to retirement phase rows
  const retirementRows = rows.filter(r => r.phase === 'retirement')
  const endPortfolio = retirementRows.length > 0
    ? retirementRows[retirementRows.length - 1].endPortfolio
    : targetEndPortfolio

  const strategyLabel = STRATEGY_LABELS[strategy]?.name ?? strategy
  const title = `Onttrekkingsfase \u00b7 ${Math.round(startAge)} \u2192 ${Math.round(endAge)} jaar`

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="p-5">
        <KassabonShell>
          {/* Header */}
          <div className="mb-3 text-center">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              AFBOUWANALYSE
            </p>
            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
              {strategyLabel} &middot; {Math.round(endAge - startAge)} jaar
            </p>
          </div>

          {/* Receipt rows */}
          <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
            <ReceiptRow label="Startvermogen" value={formatCurrency(Math.round(startPortfolio))} />
            <ReceiptRow label="Strategie" value={strategyLabel} />
            <ReceiptRow label="Jaarlijkse onttrekking" value={formatCurrency(Math.round(yearlyWithdrawal))} />
            <ReceiptRow label="AOW-inkomen/jaar" value={formatCurrency(Math.round(yearlyAowIncome))} />
            <ReceiptRow label="Geschat eindvermogen" value={formatCurrency(Math.round(endPortfolio))} />
          </div>

          {/* Total */}
          <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
            <span className="font-sans text-sm text-[var(--ink)]">Doelvermogen einde</span>
            <span className="font-mono tabular-nums text-[var(--ink)]">
              {formatCurrency(Math.round(targetEndPortfolio))}
            </span>
          </div>
        </KassabonShell>

        {/* Mini withdrawal chart */}
        {retirementRows.length >= 2 && (
          <div className="mt-4">
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Vermogensafname
            </p>
            <MiniChartWrapper rows={retirementRows} />
          </div>
        )}
      </div>
    </BottomSheet>
  )
})

// Wrapper to use useModalAnimation
function MiniChartWrapper({ rows }: { rows: SimRow[] }) {
  const { hasEntered } = useModalAnimation({ delay: 150, duration: 700 })
  return <MiniWithdrawalChart rows={rows} hasEntered={hasEntered} />
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

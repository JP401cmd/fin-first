'use client'

import { memo } from 'react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { formatCurrency } from '@/lib/format'
import { useModalAnimation } from '@/lib/hooks/use-modal-animation'
import { PhaseDetailTable } from '@/components/app/horizon/phase-detail-table'
import type { UnifiedProjectionRow, AssetBucketDetail } from '@/lib/unified-projection'
import type { Debt } from '@/lib/debt-data'

// ── Types ────────────────────────────────────────────────────────────────────

export type TransitionScenario = 'gap' | 'shortfall' | 'none'

interface PhaseModalOvergangProps {
  open: boolean
  onClose: () => void
  transitionScenario: TransitionScenario
  startAge: number          // FIRE age (gap) or AOW age (shortfall)
  endAge: number            // AOW age (gap) or FIRE age (shortfall)
  fireAge: number
  aowAge: number
  /** Annual portfolio withdrawal during transition */
  yearlyWithdrawal: number
  /** Annual AOW income (only relevant for shortfall scenario) */
  yearlyAowIncome: number
  /** Annual expenses */
  yearlyExpenses: number
  /** Portfolio value at start of transition */
  portfolioAtTransitionStart: number
  /** Unified projection rows for transition phase detail */
  rows: UnifiedProjectionRow[]
  /** Inflation rate for PhaseDetailTable */
  inflationRate: number
  /** Debts metadata for human-readable labels in detail table */
  debts?: Debt[]
}

// ── Mini Chart ───────────────────────────────────────────────────────────────

const CHART_W = 320
const CHART_H = 120
const PAD = { top: 16, right: 16, bottom: 24, left: 56 }

const MiniTransitionChart = memo(function MiniTransitionChart({
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
      aria-label="Vermogensverloop tijdens overgangsfase"
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
        stroke="var(--color-horizon-400, #c0a060)"
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
        fill="var(--color-horizon-400, #c0a060)"
        style={{
          transition: 'opacity 400ms ease-out 500ms',
          opacity: animProgress,
        }}
      />
    </svg>
  )
})

// ── Modal Component ──────────────────────────────────────────────────────────

export const PhaseModalOvergang = memo(function PhaseModalOvergang({
  open,
  onClose,
  transitionScenario,
  startAge,
  endAge,
  fireAge,
  aowAge,
  yearlyWithdrawal,
  yearlyAowIncome,
  yearlyExpenses,
  portfolioAtTransitionStart,
  rows,
  inflationRate,
  debts,
}: PhaseModalOvergangProps) {
  if (transitionScenario === 'none') return null

  const durationYears = Math.max(Math.round(endAge - startAge), 1)
  const title = `Overgangsfase \u00b7 ${Math.round(startAge)} \u2192 ${Math.round(endAge)} jaar`

  // Filter to transition phase rows
  const transitionRows = rows.filter(r => r.phase === 'transition')

  // ── Waterval-kassabon aggregaten van unified rows ──────────────────────
  const hasTransitionRows = transitionRows.length > 0

  const startVermogen = hasTransitionRows
    ? Object.values(transitionRows[0].assetBuckets).reduce((sum, b) => sum + ((b as AssetBucketDetail)?.startValue ?? 0), 0)
    : portfolioAtTransitionStart

  const totalRendement = hasTransitionRows
    ? transitionRows.reduce((sum, r) => sum + r.totalGrowth, 0)
    : 0

  const totalOnttrekking = hasTransitionRows
    ? transitionRows.reduce((sum, r) => sum + r.withdrawal, 0)
    : yearlyWithdrawal * durationYears

  const totalBox3 = hasTransitionRows
    ? transitionRows.reduce((sum, r) => sum + r.totalBox3, 0)
    : 0

  const totalEvents = hasTransitionRows
    ? transitionRows.reduce((sum, r) => sum + r.cashflowNet, 0)
    : 0

  const totalIncome = hasTransitionRows
    ? transitionRows.reduce((sum, r) => sum + r.grossIncome, 0)
    : yearlyAowIncome * durationYears

  const eindVermogen = hasTransitionRows
    ? transitionRows[transitionRows.length - 1].totalAssets
    : Math.max(portfolioAtTransitionStart - totalOnttrekking + totalRendement, 0)

  return (
    <BottomSheet open={open} onClose={onClose} title={title} size="lg" initialMobileHeight="60vh">
      {/* Accent line */}
      <div className="h-[2px] bg-[var(--color-horizon-200)]" />

      <div className="p-5">
        {transitionScenario === 'gap' ? (
          <GapAnalysis
            durationYears={durationYears}
            fireAge={fireAge}
            aowAge={aowAge}
            startVermogen={startVermogen}
            totalRendement={totalRendement}
            totalOnttrekking={totalOnttrekking}
            totalBox3={totalBox3}
            totalEvents={totalEvents}
            eindVermogen={eindVermogen}
            yearlyExpenses={yearlyExpenses}
            portfolioAtTransitionStart={portfolioAtTransitionStart}
          />
        ) : (
          <ShortfallAnalysis
            durationYears={durationYears}
            fireAge={fireAge}
            aowAge={aowAge}
            startVermogen={startVermogen}
            totalRendement={totalRendement}
            totalOnttrekking={totalOnttrekking}
            totalBox3={totalBox3}
            totalEvents={totalEvents}
            totalIncome={totalIncome}
            eindVermogen={eindVermogen}
            yearlyAowIncome={yearlyAowIncome}
            yearlyExpenses={yearlyExpenses}
          />
        )}

        {/* Mini chart */}
        {transitionRows.length >= 2 && (
          <div className="mt-4">
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Vermogensverloop
            </p>
            <MiniChartWrapper rows={transitionRows} />
          </div>
        )}

        {/* PhaseDetailTable (collapsed by default) */}
        {transitionRows.length > 0 && (
          <PhaseDetailTable
            rows={transitionRows}
            phase="transition"
            inflationRate={inflationRate}
            debts={debts}
          />
        )}

        {/* Filosofische noot */}
        <div className="mt-5 rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/30 px-4 py-3">
          <p className="font-serif text-sm italic leading-relaxed text-[var(--ink-3)]">
            {durationYears} jaar overgang = {durationYears} jaar eerder verdiende vrijheid die je nu overbrugt
          </p>
        </div>
      </div>
    </BottomSheet>
  )
})

// Wrapper to use useModalAnimation
function MiniChartWrapper({ rows }: { rows: UnifiedProjectionRow[] }) {
  const { hasEntered } = useModalAnimation({ delay: 150, duration: 700 })
  return <MiniTransitionChart rows={rows} hasEntered={hasEntered} />
}

// ── Scenario A: Gap (FIRE < AOW) ────────────────────────────────────────────

function GapAnalysis({
  durationYears,
  fireAge,
  aowAge,
  startVermogen,
  totalRendement,
  totalOnttrekking,
  totalBox3,
  totalEvents,
  eindVermogen,
  yearlyExpenses,
  portfolioAtTransitionStart,
}: {
  durationYears: number
  fireAge: number
  aowAge: number
  startVermogen: number
  totalRendement: number
  totalOnttrekking: number
  totalBox3: number
  totalEvents: number
  eindVermogen: number
  yearlyExpenses: number
  portfolioAtTransitionStart: number
}) {
  const totalExpenses = yearlyExpenses * durationYears

  return (
    <KassabonShell>
      {/* Header */}
      <div className="mb-3 text-center">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          GAP-ANALYSE
        </p>
        <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
          FIRE ({Math.round(fireAge)}) tot AOW ({Math.round(aowAge)}) &middot; {durationYears} jaar zonder AOW
        </p>
      </div>

      {/* Waterfall receipt rows */}
      <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
        <ReceiptRow label="Startvermogen (bij FIRE)" value={formatCurrency(Math.round(startVermogen))} />
        <ReceiptRow
          label="Rendement"
          value={formatCurrency(Math.round(totalRendement))}
          plus={totalRendement > 0}
        />
        <ReceiptRow
          label="Onttrekking"
          value={totalOnttrekking > 0 ? `\u2212${formatCurrency(Math.round(totalOnttrekking)).replace('\u20AC', '\u20AC ')}` : formatCurrency(0)}
          minus={totalOnttrekking > 0}
        />
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
        <span className="font-sans text-sm text-[var(--ink)]">Vermogen bij AOW</span>
        <span className="font-mono tabular-nums text-[var(--ink)]">
          {formatCurrency(Math.round(eindVermogen))}
        </span>
      </div>

      {/* Coverage indicator */}
      <div className="mt-2">
        {portfolioAtTransitionStart >= totalExpenses ? (
          <p className="text-[11px] text-[var(--positive)]">
            &#10003; Vermogen dekt de overgangsperiode volledig
          </p>
        ) : (
          <p className="text-[11px] text-[var(--negative)]">
            &#9888; Tekort van {formatCurrency(Math.round(totalExpenses - portfolioAtTransitionStart))} tijdens overgang
          </p>
        )}
      </div>
    </KassabonShell>
  )
}

// ── Scenario B: Shortfall (FIRE > AOW) ──────────────────────────────────────

function ShortfallAnalysis({
  durationYears,
  fireAge,
  aowAge,
  startVermogen,
  totalRendement,
  totalOnttrekking,
  totalBox3,
  totalEvents,
  totalIncome,
  eindVermogen,
  yearlyAowIncome,
  yearlyExpenses,
}: {
  durationYears: number
  fireAge: number
  aowAge: number
  startVermogen: number
  totalRendement: number
  totalOnttrekking: number
  totalBox3: number
  totalEvents: number
  totalIncome: number
  eindVermogen: number
  yearlyAowIncome: number
  yearlyExpenses: number
}) {
  const shortfallPerYear = Math.max(yearlyExpenses - yearlyAowIncome, 0)

  return (
    <KassabonShell>
      {/* Header */}
      <div className="mb-3 text-center">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          TEKORT-ANALYSE
        </p>
        <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
          AOW ({Math.round(aowAge)}) tot FIRE ({Math.round(fireAge)}) &middot; {durationYears} jaar met AOW
        </p>
      </div>

      {/* Waterfall receipt rows */}
      <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2">
        <ReceiptRow label="Startvermogen" value={formatCurrency(Math.round(startVermogen))} />
        <ReceiptRow
          label="Rendement"
          value={formatCurrency(Math.round(totalRendement))}
          plus={totalRendement > 0}
        />
        {totalIncome > 0 && (
          <ReceiptRow
            label="AOW/Pensioen inkomen"
            value={formatCurrency(Math.round(totalIncome))}
            plus
          />
        )}
        <ReceiptRow
          label="Onttrekking"
          value={totalOnttrekking > 0 ? `\u2212${formatCurrency(Math.round(totalOnttrekking)).replace('\u20AC', '\u20AC ')}` : formatCurrency(0)}
          minus={totalOnttrekking > 0}
        />
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
        <span className="font-sans text-sm text-[var(--ink)]">Vermogen na overgang</span>
        <span className="font-mono tabular-nums text-[var(--ink)]">
          {formatCurrency(Math.round(eindVermogen))}
        </span>
      </div>

      {/* Coverage note */}
      {shortfallPerYear === 0 && (
        <div className="mt-2">
          <p className="text-[11px] text-[var(--positive)]">
            &#10003; AOW dekt je uitgaven volledig in deze fase
          </p>
        </div>
      )}
    </KassabonShell>
  )
}

// ── Receipt row helper ───────────────────────────────────────────────────────

function ReceiptRow({
  label,
  value,
  plus,
  minus,
}: {
  label: string
  value: string
  plus?: boolean
  minus?: boolean
}) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="font-sans text-sm text-[var(--ink-2)]">
        {plus && !minus ? '+ ' : ''}{minus ? '\u2212 ' : ''}{label}
      </span>
      <span className={`font-mono tabular-nums ${
        plus ? 'text-[var(--positive)]' :
        minus ? 'text-[var(--negative)]' :
        'text-[var(--ink)]'
      }`}>
        {value}
      </span>
    </div>
  )
}

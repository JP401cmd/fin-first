'use client'

import { useState, useMemo, useCallback, useId, memo } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

// ── Types ───────────────────────────────────────────────────────────────────

export type CompoundInterestRow = {
  year: number
  totalDeposits: number
  totalReturns: number
  totalValue: number
}

// ── Computation ─────────────────────────────────────────────────────────────

export function computeCompoundInterest(
  monthlyDeposit: number,
  annualReturn: number,
  years: number,
): CompoundInterestRow[] {
  const monthlyRate = annualReturn / 12
  const rows: CompoundInterestRow[] = [
    { year: 0, totalDeposits: 0, totalReturns: 0, totalValue: 0 },
  ]

  let totalValue = 0
  for (let m = 1; m <= years * 12; m++) {
    // Interest on existing balance first, then add deposit
    totalValue = totalValue * (1 + monthlyRate) + monthlyDeposit
    const totalDeposits = monthlyDeposit * m
    const totalReturns = totalValue - totalDeposits

    // Record a data point every 12 months (yearly)
    if (m % 12 === 0) {
      rows.push({
        year: m / 12,
        totalDeposits,
        totalReturns: Math.max(0, totalReturns),
        totalValue,
      })
    }
  }

  return rows
}

// ── Formatting ──────────────────────────────────────────────────────────────

function fmtEur(val: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val)
}

function fmtYAxis(val: number): string {
  const abs = Math.abs(val)
  if (abs >= 1_000_000) return `€ ${(val / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `€ ${Math.round(val / 1_000)}k`
  if (abs > 0) return `€ ${Math.round(val)}`
  return '€ 0'
}

// ── Constants ───────────────────────────────────────────────────────────────

const PAD = { top: 24, right: 24, bottom: 36, left: 64 }
const HORIZON_OPTIONS = [10, 20, 30] as const
type HorizonOption = (typeof HORIZON_OPTIONS)[number]

// ── Chart Component ─────────────────────────────────────────────────────────

export const CompoundInterestChart = memo(function CompoundInterestChart({
  defaultMonthlyDeposit,
  defaultAnnualReturn,
  height = 340,
}: {
  /** Default monthly deposit amount from user's savings data */
  defaultMonthlyDeposit: number
  /** Default annual return from user's fire params (e.g. 0.07 for 7%) */
  defaultAnnualReturn: number
  height?: number
}) {
  const uid = useId()
  const { ref, hasEntered } = useInViewAnimation({ duration: 900 })

  const [horizon, setHorizon] = useState<HorizonOption>(20)
  const [monthlyDeposit, setMonthlyDeposit] = useState(
    Math.max(50, Math.round(defaultMonthlyDeposit / 50) * 50),
  )
  // Internal state is decimal (0.07 = 7%); display state is percentage (7.0)
  const [annualReturn, setAnnualReturn] = useState(defaultAnnualReturn)
  const [returnPctInput, setReturnPctInput] = useState(
    (defaultAnnualReturn * 100).toFixed(1),
  )

  const rows = useMemo(
    () => computeCompoundInterest(monthlyDeposit, annualReturn, horizon),
    [monthlyDeposit, annualReturn, horizon],
  )

  const maxValue = rows[rows.length - 1]?.totalValue ?? 0
  const finalDeposits = rows[rows.length - 1]?.totalDeposits ?? 0
  const finalReturns = rows[rows.length - 1]?.totalReturns ?? 0

  // Nice Y-axis ceiling
  const yMax = useMemo(() => {
    if (maxValue <= 0) return 10_000
    const exp = Math.pow(10, Math.floor(Math.log10(maxValue)))
    return Math.ceil(maxValue / exp) * exp * 1.1
  }, [maxValue])

  // SVG dimensions
  const W = 600
  const H = height
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const xScale = useCallback(
    (year: number) => PAD.left + (year / horizon) * chartW,
    [horizon, chartW],
  )
  const yScale = useCallback(
    (val: number) => PAD.top + chartH - (val / yMax) * chartH,
    [yMax, chartH],
  )

  // Build paths for deposits and total value areas
  const depositsPath = useMemo(() => {
    const pts = rows.map((r) => `${xScale(r.year)},${yScale(r.totalDeposits)}`)
    const baseRight = `${xScale(horizon)},${yScale(0)}`
    const baseLeft = `${xScale(0)},${yScale(0)}`
    return `M${baseLeft} L${pts.join(' L')} L${baseRight} Z`
  }, [rows, xScale, yScale, horizon])

  const returnsPath = useMemo(() => {
    // Top edge: total value line (deposits + returns)
    const topPts = rows.map(
      (r) => `${xScale(r.year)},${yScale(r.totalValue)}`,
    )
    // Bottom edge: deposits line (reversed)
    const bottomPts = [...rows]
      .reverse()
      .map((r) => `${xScale(r.year)},${yScale(r.totalDeposits)}`)
    return `M${topPts.join(' L')} L${bottomPts.join(' L')} Z`
  }, [rows, xScale, yScale])

  const totalLine = useMemo(() => {
    const pts = rows.map((r) => `${xScale(r.year)},${yScale(r.totalValue)}`)
    return `M${pts.join(' L')}`
  }, [rows, xScale, yScale])

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const count = 5
    return Array.from({ length: count + 1 }, (_, i) => (yMax / count) * i)
  }, [yMax])

  // X-axis ticks (every 5 years)
  const xTicks = useMemo(() => {
    const step = horizon <= 10 ? 2 : 5
    const ticks: number[] = []
    for (let y = 0; y <= horizon; y += step) ticks.push(y)
    if (ticks[ticks.length - 1] !== horizon) ticks.push(horizon)
    return ticks
  }, [horizon])

  // Crosshair state
  const [hoverYear, setHoverYear] = useState<number | null>(null)
  const hoveredRow = hoverYear !== null ? rows[hoverYear] : null

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const clientX = e.clientX - rect.left
      const svgX = (clientX / rect.width) * W
      const year = Math.round(
        ((svgX - PAD.left) / chartW) * horizon,
      )
      if (year >= 0 && year <= horizon) {
        setHoverYear(year)
      } else {
        setHoverYear(null)
      }
    },
    [chartW, horizon],
  )

  const handleMouseLeave = useCallback(() => setHoverYear(null), [])

  // Multiplier annotation
  const multiplier =
    finalDeposits > 0 ? (finalReturns / finalDeposits).toFixed(1) : '0'

  // Percentage of total that is returns
  const returnsPct =
    maxValue > 0 ? Math.round((finalReturns / maxValue) * 100) : 0

  return (
    <div ref={ref} className="space-y-5">
      {/* ── Controls ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4 sm:gap-6">
        {/* Time horizon selector */}
        <div>
          <label className="block text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1.5">
            Tijdshorizon
          </label>
          <div className="flex gap-1 bg-[var(--subtle)] rounded-md p-0.5">
            {HORIZON_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setHorizon(opt)}
                className={`px-3 py-1.5 text-sm font-mono rounded-md transition-colors ${
                  horizon === opt
                    ? 'bg-[var(--ink)] text-[var(--paper)] font-semibold'
                    : 'text-[var(--ink-2)] hover:text-[var(--ink)]'
                }`}
              >
                {opt} jaar
              </button>
            ))}
          </div>
        </div>

        {/* Monthly deposit input */}
        <div>
          <label
            htmlFor={`${uid}-deposit`}
            className="block text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1.5"
          >
            Maandelijkse inleg
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-3)] font-mono">
              &euro;
            </span>
            <input
              id={`${uid}-deposit`}
              type="number"
              min={0}
              step={50}
              value={monthlyDeposit}
              onChange={(e) =>
                setMonthlyDeposit(Math.max(0, Number(e.target.value)))
              }
              className="w-[120px] pl-7 pr-3 py-1.5 text-sm font-mono tabular-nums border border-[var(--border-ed)] rounded-md bg-[var(--paper)] text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--module-active-500)]"
            />
          </div>
        </div>

        {/* Annual return input */}
        <div>
          <label
            htmlFor={`${uid}-return`}
            className="block text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1.5"
          >
            Verwacht rendement
          </label>
          <div className="relative">
            <input
              id={`${uid}-return`}
              type="number"
              min={0}
              max={20}
              step={0.5}
              value={returnPctInput}
              onChange={(e) => {
                const raw = e.target.value
                setReturnPctInput(raw)
                const pct = Number(raw)
                if (!isNaN(pct)) {
                  setAnnualReturn(
                    Math.min(0.20, Math.max(0, pct / 100)),
                  )
                }
              }}
              className="w-[100px] pl-3 pr-8 py-1.5 text-sm font-mono tabular-nums border border-[var(--border-ed)] rounded-md bg-[var(--paper)] text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--module-active-500)]"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-3)] font-mono">
              %
            </span>
          </div>
          <div className="text-[10px] font-mono text-[var(--ink-4)] mt-0.5">
            {(annualReturn * 100).toFixed(1)}% per jaar
          </div>
        </div>
      </div>

      {/* ── SVG Chart ─────────────────────────────────────────── */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          role="img"
          aria-label={`Samengestelde interest grafiek: ${fmtEur(maxValue)} na ${horizon} jaar`}
        >
          <defs>
            {/* Gradient for returns area */}
            <linearGradient
              id={`${uid}-returns-grad`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="var(--color-horizon-500)"
                stopOpacity={0.6}
              />
              <stop
                offset="100%"
                stopColor="var(--color-horizon-500)"
                stopOpacity={0.15}
              />
            </linearGradient>
            {/* Gradient for deposits area */}
            <linearGradient
              id={`${uid}-deposits-grad`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="var(--color-horizon-300)"
                stopOpacity={0.45}
              />
              <stop
                offset="100%"
                stopColor="var(--color-horizon-300)"
                stopOpacity={0.1}
              />
            </linearGradient>
          </defs>

          {/* Y-axis gridlines */}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                y1={yScale(tick)}
                x2={W - PAD.right}
                y2={yScale(tick)}
                stroke="var(--rule-soft)"
                strokeWidth={tick === 0 ? 1 : 0.5}
                strokeDasharray={tick === 0 ? undefined : '3,3'}
              />
              <text
                x={PAD.left - 8}
                y={yScale(tick) + 4}
                textAnchor="end"
                className="text-[10px] font-mono fill-[var(--ink-3)]"
              >
                {fmtYAxis(tick)}
              </text>
            </g>
          ))}

          {/* X-axis labels */}
          {xTicks.map((year) => (
            <text
              key={year}
              x={xScale(year)}
              y={H - 8}
              textAnchor="middle"
              className="text-[10px] font-mono fill-[var(--ink-3)]"
            >
              {year === 0 ? 'Nu' : `${year}j`}
            </text>
          ))}

          {/* Deposits area (bottom layer) */}
          <path
            d={depositsPath}
            fill={`url(#${uid}-deposits-grad)`}
            style={{
              opacity: hasEntered ? 1 : 0,
              transition: 'opacity 0.6s ease-out',
            }}
          />

          {/* Returns area (top layer — between deposits and total) */}
          <path
            d={returnsPath}
            fill={`url(#${uid}-returns-grad)`}
            style={{
              opacity: hasEntered ? 1 : 0,
              transition: 'opacity 0.8s ease-out 0.2s',
            }}
          />

          {/* Total value line */}
          <path
            d={totalLine}
            fill="none"
            stroke="var(--color-horizon-600)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: hasEntered ? 'none' : '2000',
              strokeDashoffset: hasEntered ? 0 : 2000,
              transition: 'stroke-dashoffset 1.2s ease-out',
            }}
          />

          {/* Deposits boundary line (dashed) */}
          {rows.length > 1 && (
            <path
              d={rows
                .map(
                  (r, i) =>
                    `${i === 0 ? 'M' : 'L'}${xScale(r.year)},${yScale(r.totalDeposits)}`,
                )
                .join(' ')}
              fill="none"
              stroke="var(--color-horizon-400)"
              strokeWidth={1.5}
              strokeDasharray="6,4"
              opacity={hasEntered ? 0.7 : 0}
              style={{ transition: 'opacity 0.8s ease-out 0.4s' }}
            />
          )}

          {/* Annotation: final value */}
          {hasEntered && maxValue > 0 && (
            <g
              style={{
                opacity: hasEntered ? 1 : 0,
                transition: 'opacity 0.5s ease-out 1s',
              }}
            >
              {/* Arrow from annotation to curve endpoint */}
              <circle
                cx={xScale(horizon)}
                cy={yScale(maxValue)}
                r={4}
                fill="var(--color-horizon-600)"
              />
              <text
                x={xScale(horizon) - 12}
                y={yScale(maxValue) - 14}
                textAnchor="end"
                className="text-[12px] font-mono font-bold fill-[var(--ink)]"
              >
                {fmtEur(Math.round(maxValue))}
              </text>
            </g>
          )}

          {/* Crosshair + tooltip */}
          {hoveredRow && hoverYear !== null && (
            <g>
              {/* Vertical crosshair line */}
              <line
                x1={xScale(hoverYear)}
                y1={PAD.top}
                x2={xScale(hoverYear)}
                y2={PAD.top + chartH}
                stroke="var(--ink-3)"
                strokeWidth={1}
                strokeDasharray="3,3"
                opacity={0.5}
              />
              {/* Total value dot */}
              <circle
                cx={xScale(hoverYear)}
                cy={yScale(hoveredRow.totalValue)}
                r={5}
                fill="var(--color-horizon-600)"
                stroke="var(--paper)"
                strokeWidth={2}
              />
              {/* Deposits dot */}
              <circle
                cx={xScale(hoverYear)}
                cy={yScale(hoveredRow.totalDeposits)}
                r={4}
                fill="var(--color-horizon-300)"
                stroke="var(--paper)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>

        {/* Hover tooltip card */}
        {hoveredRow && hoverYear !== null && (
          <div
            className="absolute pointer-events-none bg-[var(--paper)] border border-[var(--border-ed)] shadow-sm rounded-md px-3 py-2 text-xs font-mono z-10"
            style={{
              left: `${(xScale(hoverYear) / W) * 100}%`,
              top: `${((yScale(hoveredRow.totalValue) / H) * 100) - 2}%`,
              transform: hoverYear > horizon * 0.7
                ? 'translate(-110%, -100%)'
                : 'translate(10%, -100%)',
            }}
          >
            <div className="text-[var(--ink-3)] mb-1">
              Na {hoverYear} {hoverYear === 1 ? 'jaar' : 'jaar'}
            </div>
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: 'var(--color-horizon-300)' }}
              />
              <span className="text-[var(--ink-2)]">Inleg:</span>
              <span className="text-[var(--ink)] font-semibold tabular-nums">
                {fmtEur(hoveredRow.totalDeposits)}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: 'var(--color-horizon-500)' }}
              />
              <span className="text-[var(--ink-2)]">Rendement:</span>
              <span className="text-[var(--ink)] font-semibold tabular-nums">
                {fmtEur(hoveredRow.totalReturns)}
              </span>
            </div>
            <div className="border-t border-[var(--rule-soft)] pt-1 mt-1 flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: 'var(--color-horizon-600)' }}
              />
              <span className="text-[var(--ink-2)]">Totaal:</span>
              <span className="text-[var(--ink)] font-bold tabular-nums">
                {fmtEur(hoveredRow.totalValue)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Legend + Summary stats ─────────────────────────────── */}
      <div className="flex flex-wrap gap-4 sm:gap-6 items-start">
        {/* Legend */}
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ background: 'var(--color-horizon-300)', opacity: 0.6 }}
            />
            <span className="text-xs text-[var(--ink-2)]">Inleg</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ background: 'var(--color-horizon-500)', opacity: 0.6 }}
            />
            <span className="text-xs text-[var(--ink-2)]">Rendement</span>
          </div>
        </div>

        {/* Summary stat cards */}
        <div className="flex flex-wrap gap-3 ml-auto">
          <div className="bg-[var(--subtle)] px-3 py-2 rounded-md">
            <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-[var(--ink-3)]">
              Totale inleg
            </div>
            <div className="text-sm font-mono font-semibold tabular-nums text-[var(--ink)]">
              {fmtEur(finalDeposits)}
            </div>
          </div>
          <div className="bg-[var(--subtle)] px-3 py-2 rounded-md">
            <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-[var(--ink-3)]">
              Totaal rendement
            </div>
            <div className="text-sm font-mono font-semibold tabular-nums" style={{ color: 'var(--color-horizon-600)' }}>
              {fmtEur(finalReturns)}
            </div>
          </div>
          <div className="bg-[var(--subtle)] px-3 py-2 rounded-md">
            <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-[var(--ink-3)]">
              Rendement / inleg
            </div>
            <div className="text-sm font-mono font-semibold tabular-nums" style={{ color: 'var(--color-horizon-600)' }}>
              {multiplier}&times; &middot; {returnsPct}%
            </div>
          </div>
        </div>
      </div>

      {/* ── Snowball insight ───────────────────────────────────── */}
      {hasEntered && horizon >= 20 && finalReturns > finalDeposits && (
        <div
          className="border-l-[3px] pl-4 py-2 text-sm text-[var(--ink-2)]"
          style={{
            borderColor: 'var(--module-active-500)',
            fontFamily: 'var(--font-source-serif, Georgia, serif)',
            fontStyle: 'italic',
            opacity: hasEntered ? 1 : 0,
            transition: 'opacity 0.6s ease-out 1.2s',
          }}
        >
          Na {horizon} jaar is{' '}
          <strong className="text-[var(--ink)] not-italic font-semibold">
            {returnsPct}%
          </strong>{' '}
          van je vermogen puur rendement op rendement.
          Het sneeuwbaleffect versnelt elk jaar &mdash; de laatste{' '}
          {Math.round(horizon / 3)} jaar leverden meer op dan de eerste{' '}
          {Math.round((horizon * 2) / 3)} jaar samen.
        </div>
      )}
    </div>
  )
})

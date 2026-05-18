'use client'

import { useState, useMemo, useCallback, useId, useEffect, memo } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

// ── Types ───────────────────────────────────────────────────────────────────

export type InflationRow = {
  year: number
  /** Nominal amount (stays at startAmount) */
  nominal: number
  /** Real purchasing power after inflation */
  realValue: number
  /** Freedom days the real value represents */
  freedomDays: number
  /** Freedom days lost vs year 0 */
  freedomDaysLost: number
}

// ── Computation ─────────────────────────────────────────────────────────────

export function computeInflationErosion(
  startAmount: number,
  annualInflation: number,
  years: number,
  dailyExpenses: number,
): InflationRow[] {
  const rows: InflationRow[] = []
  const baseFreedomDays =
    dailyExpenses > 0 ? startAmount / dailyExpenses : 0

  for (let y = 0; y <= years; y++) {
    const realValue = startAmount / Math.pow(1 + annualInflation, y)
    const freedomDays = dailyExpenses > 0 ? realValue / dailyExpenses : 0
    rows.push({
      year: y,
      nominal: startAmount,
      realValue,
      freedomDays,
      freedomDaysLost: baseFreedomDays - freedomDays,
    })
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

function fmtDays(days: number): string {
  if (days < 1) return '< 1 dag'
  if (days < 30) return `${Math.round(days)} ${days >= 1.5 ? 'dagen' : 'dag'}`
  const months = days / 30.44
  if (months < 12) {
    return `${months.toFixed(1)} maanden`
  }
  const years = Math.floor(months / 12)
  const remainMonths = Math.round(months % 12)
  if (remainMonths === 0) return `${years} ${years === 1 ? 'jaar' : 'jaar'}`
  return `${years}j ${remainMonths}m`
}

// ── Constants ───────────────────────────────────────────────────────────────

const PAD = { top: 24, right: 24, bottom: 36, left: 64 }
const HORIZON_OPTIONS = [10, 20, 30] as const
type HorizonOption = (typeof HORIZON_OPTIONS)[number]

// ── Progressive reveal phases ───────────────────────────────────────────────
// Phase 0: nothing visible
// Phase 1: grid + nominal line (the "illusion" — what you think you have)
// Phase 2: real value line draws downward (the truth unfolds)
// Phase 3: lost area fills in (the evaporating value — dramatic reveal)
// Phase 4: milestones + final value (the punchline — how much is gone)
// Phase 5: summary + urgency insight (the conclusion)

function useProgressiveReveal(hasEntered: boolean) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    if (!hasEntered) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setPhase(5)
      return
    }

    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => setPhase(1), 0))
    timers.push(setTimeout(() => setPhase(2), 500))
    timers.push(setTimeout(() => setPhase(3), 1200))
    timers.push(setTimeout(() => setPhase(4), 1800))
    timers.push(setTimeout(() => setPhase(5), 2400))

    return () => timers.forEach(clearTimeout)
  }, [hasEntered])

  return phase
}

// ── Chart Component ─────────────────────────────────────────────────────────

export const InflationErosionChart = memo(function InflationErosionChart({
  defaultInflationRate,
  defaultDailyExpenses,
  height = 340,
}: {
  /** Default annual inflation from user's fire params (e.g. 0.02 for 2%) */
  defaultInflationRate: number
  /** Daily expenses for freedom-time calculation */
  defaultDailyExpenses: number
  height?: number
}) {
  const uid = useId()
  const { ref, hasEntered } = useInViewAnimation({ duration: 2800 })
  const phase = useProgressiveReveal(hasEntered)

  const [horizon, setHorizon] = useState<HorizonOption>(20)
  const [startAmount, setStartAmount] = useState(1000)
  const [inflationRate, setInflationRate] = useState(defaultInflationRate)
  const [inflationPctInput, setInflationPctInput] = useState(
    (defaultInflationRate * 100).toFixed(1),
  )
  const dailyExpenses = defaultDailyExpenses

  const rows = useMemo(
    () =>
      computeInflationErosion(startAmount, inflationRate, horizon, dailyExpenses),
    [startAmount, inflationRate, horizon, dailyExpenses],
  )

  const finalRow = rows[rows.length - 1]
  const initialFreedomDays = rows[0]?.freedomDays ?? 0
  const finalFreedomDays = finalRow?.freedomDays ?? 0
  const freedomDaysLost = finalRow?.freedomDaysLost ?? 0
  const percentLost = startAmount > 0
    ? Math.round(((startAmount - (finalRow?.realValue ?? 0)) / startAmount) * 100)
    : 0

  // SVG dimensions
  const W = 600
  const H = height
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const xScale = useCallback(
    (year: number) => PAD.left + (year / horizon) * chartW,
    [horizon, chartW],
  )

  // Y scale: from 0 to startAmount (nominal stays constant)
  const yMax = startAmount * 1.1
  const yScale = useCallback(
    (val: number) => PAD.top + chartH - (val / yMax) * chartH,
    [yMax, chartH],
  )

  // Real value area path (purchasing power)
  const realAreaPath = useMemo(() => {
    const pts = rows.map((r) => `${xScale(r.year)},${yScale(r.realValue)}`)
    const baseRight = `${xScale(horizon)},${yScale(0)}`
    const baseLeft = `${xScale(0)},${yScale(0)}`
    return `M${baseLeft} L${pts.join(' L')} L${baseRight} Z`
  }, [rows, xScale, yScale, horizon])

  // Lost value area path (between nominal and real)
  const lostAreaPath = useMemo(() => {
    const topPts = rows.map(
      (r) => `${xScale(r.year)},${yScale(r.nominal)}`,
    )
    const bottomPts = [...rows]
      .reverse()
      .map((r) => `${xScale(r.year)},${yScale(r.realValue)}`)
    return `M${topPts.join(' L')} L${bottomPts.join(' L')} Z`
  }, [rows, xScale, yScale])

  // Real value line
  const realLine = useMemo(() => {
    const pts = rows.map((r) => `${xScale(r.year)},${yScale(r.realValue)}`)
    return `M${pts.join(' L')}`
  }, [rows, xScale, yScale])

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const count = 4
    return Array.from({ length: count + 1 }, (_, i) =>
      Math.round((startAmount / count) * i),
    )
  }, [startAmount])

  // X-axis ticks
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
      // Only enable hover after animation completes
      if (phase < 5) return
      const rect = e.currentTarget.getBoundingClientRect()
      const clientX = e.clientX - rect.left
      const svgX = (clientX / rect.width) * W
      const year = Math.round(((svgX - PAD.left) / chartW) * horizon)
      if (year >= 0 && year <= horizon) {
        setHoverYear(year)
      } else {
        setHoverYear(null)
      }
    },
    [chartW, horizon, phase],
  )

  const handleMouseLeave = useCallback(() => setHoverYear(null), [])

  // Freedom days milestone markers
  const milestones = useMemo(() => {
    const targets = [0.25, 0.5, 0.75] // 25%, 50%, 75% lost
    return targets
      .map((pct) => {
        const row = rows.find(
          (r) =>
            r.freedomDaysLost / initialFreedomDays >= pct && r.year > 0,
        )
        return row ? { pct, year: row.year, row } : null
      })
      .filter(Boolean) as { pct: number; year: number; row: InflationRow }[]
  }, [rows, initialFreedomDays])

  return (
    <div ref={ref} className="space-y-5">
      {/* ── Controls ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4 sm:gap-6">
        {/* Time horizon */}
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

        {/* Start amount */}
        <div>
          <label
            htmlFor={`${uid}-amount`}
            className="block text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1.5"
          >
            Startbedrag
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-3)] font-mono">
              &euro;
            </span>
            <input
              id={`${uid}-amount`}
              type="number"
              min={100}
              step={100}
              value={startAmount}
              onChange={(e) =>
                setStartAmount(Math.max(100, Number(e.target.value)))
              }
              className="w-[120px] pl-7 pr-3 py-1.5 text-sm font-mono tabular-nums border border-[var(--border-ed)] rounded-md bg-[var(--paper)] text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--module-active-500)]"
            />
          </div>
        </div>

        {/* Inflation rate */}
        <div>
          <label
            htmlFor={`${uid}-inflation`}
            className="block text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-1.5"
          >
            Inflatiepercentage
          </label>
          <div className="relative">
            <input
              id={`${uid}-inflation`}
              type="number"
              min={0}
              max={15}
              step={0.1}
              value={inflationPctInput}
              onChange={(e) => {
                const raw = e.target.value
                setInflationPctInput(raw)
                const pct = Number(raw)
                if (!isNaN(pct)) {
                  setInflationRate(Math.min(0.15, Math.max(0, pct / 100)))
                }
              }}
              className="w-[100px] pl-3 pr-8 py-1.5 text-sm font-mono tabular-nums border border-[var(--border-ed)] rounded-md bg-[var(--paper)] text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--module-active-500)]"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-3)] font-mono">
              %
            </span>
          </div>
          <div className="text-[10px] font-mono text-[var(--ink-4)] mt-0.5">
            {(inflationRate * 100).toFixed(1)}% per jaar
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
          aria-label={`Inflatie koopkrachtverlies: ${fmtEur(finalRow?.realValue ?? 0)} reële waarde na ${horizon} jaar`}
        >
          <defs>
            {/* Gradient for lost area (the "evaporated" part) */}
            <linearGradient
              id={`${uid}-lost-grad`}
              x1="0"
              y1="0"
              x2="1"
              y2="0"
            >
              <stop
                offset="0%"
                stopColor="var(--negative)"
                stopOpacity={0.04}
              />
              <stop
                offset="100%"
                stopColor="var(--negative)"
                stopOpacity={0.18}
              />
            </linearGradient>
            {/* Gradient for remaining real value */}
            <linearGradient
              id={`${uid}-real-grad`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor="var(--color-horizon-500)"
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor="var(--color-horizon-500)"
                stopOpacity={0.08}
              />
            </linearGradient>
            {/* Striped pattern for lost area */}
            <pattern
              id={`${uid}-stripes`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="6"
                stroke="var(--negative)"
                strokeWidth="1"
                strokeOpacity="0.08"
              />
            </pattern>
          </defs>

          {/* Phase 1: Y-axis gridlines + labels + nominal line */}
          <g
            style={{
              opacity: phase >= 1 ? 1 : 0,
              transition: 'opacity 400ms ease-out',
            }}
          >
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

            {/* Nominal line (constant — the "illusion") */}
            <line
              x1={PAD.left}
              y1={yScale(startAmount)}
              x2={W - PAD.right}
              y2={yScale(startAmount)}
              stroke="var(--ink-3)"
              strokeWidth={1}
              strokeDasharray="6,4"
              opacity={0.5}
            />
            <text
              x={W - PAD.right - 4}
              y={yScale(startAmount) - 8}
              textAnchor="end"
              className="text-[10px] font-mono fill-[var(--ink-3)]"
              opacity={0.7}
            >
              nominaal {fmtEur(startAmount)}
            </text>
          </g>

          {/* Phase 2: Real value area (what's actually left) — appears first as context */}
          <path
            d={realAreaPath}
            fill={`url(#${uid}-real-grad)`}
            style={{
              opacity: phase >= 2 ? 1 : 0,
              transition: 'opacity 500ms ease-out',
            }}
          />

          {/* Phase 2: Real value line (draws downward — the truth unfolds) */}
          <path
            d={realLine}
            fill="none"
            stroke="var(--color-horizon-600)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: phase >= 2 ? 0 : 1,
              transition: 'stroke-dashoffset 800ms ease-out',
            }}
          />

          {/* Phase 3: Lost value area (between nominal and real) — the dramatic reveal */}
          <path
            d={lostAreaPath}
            fill={`url(#${uid}-lost-grad)`}
            style={{
              opacity: phase >= 3 ? 1 : 0,
              transition: 'opacity 500ms ease-out',
            }}
          />
          <path
            d={lostAreaPath}
            fill={`url(#${uid}-stripes)`}
            style={{
              opacity: phase >= 3 ? 1 : 0,
              transition: 'opacity 500ms ease-out',
            }}
          />

          {/* Phase 4: Freedom days lost milestone markers (appear sequentially) */}
          {milestones.map((m, idx) => (
            <g
              key={m.pct}
              style={{
                opacity: phase >= 4 ? 1 : 0,
                transition: `opacity 300ms ${idx * 150}ms ease-out`,
              }}
            >
              <line
                x1={xScale(m.year)}
                y1={yScale(m.row.realValue)}
                x2={xScale(m.year)}
                y2={yScale(m.row.nominal)}
                stroke="var(--negative)"
                strokeWidth={1}
                strokeDasharray="3,3"
                opacity={0.4}
              />
              <text
                x={xScale(m.year)}
                y={yScale(m.row.nominal) + (yScale(m.row.realValue) - yScale(m.row.nominal)) / 2 + 4}
                textAnchor="middle"
                className="text-[9px] font-mono font-semibold"
                fill="var(--negative)"
                opacity={0.7}
              >
                -{Math.round(m.pct * 100)}%
              </text>
            </g>
          ))}

          {/* Phase 4: Final value annotation (the punchline) */}
          {finalRow && (
            <g
              style={{
                opacity: phase >= 4 ? 1 : 0,
                transition: 'opacity 500ms ease-out',
              }}
            >
              <circle
                cx={xScale(horizon)}
                cy={yScale(finalRow.realValue)}
                r={4}
                fill="var(--color-horizon-600)"
                style={{
                  transform: phase >= 4 ? 'scale(1)' : 'scale(0)',
                  transformOrigin: `${xScale(horizon)}px ${yScale(finalRow.realValue)}px`,
                  transformBox: 'fill-box',
                  transition: 'transform 300ms cubic-bezier(0.34,1.56,0.64,1)',
                }}
              />
              <text
                x={xScale(horizon) - 12}
                y={yScale(finalRow.realValue) + 18}
                textAnchor="end"
                className="text-[12px] font-mono font-bold fill-[var(--ink)]"
                style={{
                  opacity: phase >= 4 ? 1 : 0,
                  transform: phase >= 4 ? 'translateY(0)' : 'translateY(-6px)',
                  transition: 'opacity 400ms 100ms ease-out, transform 400ms 100ms ease-out',
                }}
              >
                {fmtEur(Math.round(finalRow.realValue))}
              </text>
            </g>
          )}

          {/* Crosshair + tooltip (only after animation completes) */}
          {hoveredRow && hoverYear !== null && phase >= 5 && (
            <g>
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
              <circle
                cx={xScale(hoverYear)}
                cy={yScale(hoveredRow.realValue)}
                r={5}
                fill="var(--color-horizon-600)"
                stroke="var(--paper)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>

        {/* Hover tooltip (only after animation) */}
        {hoveredRow && hoverYear !== null && phase >= 5 && (
          <div
            className="absolute pointer-events-none bg-[var(--paper)] border border-[var(--border-ed)] shadow-sm rounded-md px-3 py-2 text-xs font-mono z-10"
            style={{
              left: `${(xScale(hoverYear) / W) * 100}%`,
              top: `${((yScale(hoveredRow.realValue) / H) * 100) - 2}%`,
              transform:
                hoverYear > horizon * 0.7
                  ? 'translate(-110%, -100%)'
                  : 'translate(10%, -100%)',
            }}
          >
            <div className="text-[var(--ink-3)] mb-1">
              Na {hoverYear} jaar
            </div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[var(--ink-2)]">Nominaal:</span>
              <span className="text-[var(--ink)] tabular-nums">
                {fmtEur(hoveredRow.nominal)}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[var(--ink-2)]">Reëel:</span>
              <span
                className="font-semibold tabular-nums"
                style={{ color: 'var(--color-horizon-600)' }}
              >
                {fmtEur(Math.round(hoveredRow.realValue))}
              </span>
            </div>
            <div className="border-t border-[var(--rule-soft)] pt-1 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-[var(--ink-2)]">Vrijheid:</span>
                <span className="text-[var(--ink)] tabular-nums">
                  {fmtDays(hoveredRow.freedomDays)}
                </span>
              </div>
              {hoveredRow.freedomDaysLost > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[var(--ink-2)]">Verloren:</span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: 'var(--negative)' }}
                  >
                    -{fmtDays(hoveredRow.freedomDaysLost)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Phase 5: Legend + Summary ─────────────────────────── */}
      <div
        className="flex flex-wrap gap-4 sm:gap-6 items-start"
        style={{
          opacity: phase >= 5 ? 1 : 0,
          transform: phase >= 5 ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 400ms ease-out, transform 400ms ease-out',
        }}
      >
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ background: 'var(--color-horizon-500)', opacity: 0.5 }}
            />
            <span className="text-xs text-[var(--ink-2)]">
              Reële koopkracht
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm"
              style={{
                background:
                  'repeating-linear-gradient(45deg, transparent, transparent 2px, var(--negative) 2px, var(--negative) 3px)',
                opacity: 0.3,
              }}
            />
            <span className="text-xs text-[var(--ink-2)]">Verdampt door inflatie</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 ml-auto">
          {/* Freedom days summary */}
          <div
            className="bg-[var(--subtle)] px-3 py-2 rounded-md"
            style={{
              opacity: phase >= 5 ? 1 : 0,
              transform: phase >= 5 ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 400ms ease-out, transform 400ms ease-out',
            }}
          >
            <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-[var(--ink-3)]">
              Vrijheid vandaag
            </div>
            <div className="text-sm font-mono font-semibold tabular-nums text-[var(--ink)]">
              {fmtDays(initialFreedomDays)}
            </div>
          </div>
          <div
            className="bg-[var(--subtle)] px-3 py-2 rounded-md"
            style={{
              opacity: phase >= 5 ? 1 : 0,
              transform: phase >= 5 ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 400ms 80ms ease-out, transform 400ms 80ms ease-out',
            }}
          >
            <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-[var(--ink-3)]">
              Vrijheid na {horizon}j
            </div>
            <div
              className="text-sm font-mono font-semibold tabular-nums"
              style={{ color: 'var(--color-horizon-600)' }}
            >
              {fmtDays(finalFreedomDays)}
            </div>
          </div>
          <div
            className="bg-[var(--subtle)] px-3 py-2 rounded-md"
            style={{
              opacity: phase >= 5 ? 1 : 0,
              transform: phase >= 5 ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 400ms 160ms ease-out, transform 400ms 160ms ease-out',
            }}
          >
            <div className="text-[10px] uppercase tracking-[0.16em] font-mono text-[var(--ink-3)]">
              Vrijheid verdampt
            </div>
            <div
              className="text-sm font-mono font-semibold tabular-nums"
              style={{ color: 'var(--negative)' }}
            >
              -{fmtDays(freedomDaysLost)} ({percentLost}%)
            </div>
          </div>
        </div>
      </div>

      {/* ── Phase 5: Urgency insight ──────────────────────────── */}
      {phase >= 5 && percentLost > 0 && (
        <div
          className="border-l-[3px] pl-4 py-2 text-sm text-[var(--ink-2)]"
          style={{
            borderColor: 'var(--negative)',
            fontFamily: 'var(--font-source-serif, Georgia, serif)',
            fontStyle: 'italic',
            opacity: phase >= 5 ? 1 : 0,
            transform: phase >= 5 ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 500ms 200ms ease-out, transform 500ms 200ms ease-out',
          }}
        >
          Over {horizon} jaar koopt {fmtEur(startAmount)} nog maar voor{' '}
          <strong className="text-[var(--ink)] not-italic font-semibold">
            {fmtEur(Math.round(finalRow?.realValue ?? 0))}
          </strong>{' '}
          aan goederen &mdash;{' '}
          <strong
            className="not-italic font-semibold"
            style={{ color: 'var(--negative)' }}
          >
            {fmtDays(freedomDaysLost)}
          </strong>{' '}
          vrijheid verdampt stilletjes.
          Sparen zonder te beleggen is langzaam koopkracht verliezen.
        </div>
      )}
    </div>
  )
})

'use client'

import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { SimRow, SimCashflow } from '@/lib/fire-simulation'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import { NL_SWR, type ScenarioPath, type ProjectionMonth } from '@/lib/horizon-data'
import { CHART_PAD } from '@/lib/chart-constants'
import { ChartEventMarkers, topPaddingFor, bottomPaddingFor } from './chart-event-markers'
import type { ChartEventOverlay, ChartEventKind } from '@/lib/chart-event-overlay'

// ── Types ───────────────────────────────────────────────────────────────────

export type ScenarioOverlay = {
  name: string
  label: string
  color: string
  points: [number, number][]  // [age, netWorth]
}

export type HouseholdPartnerOverlay = {
  name: string
  color: string
  points: [number, number][]  // [age, netWorth]
  fireAge: number | null
  /** If true, renders as dashed line (used for combined household line) */
  isDashed?: boolean
}

export type MonteCarloOverlay = {
  /** Percentile bands indexed by year offset (0 = current age) */
  p10: number[]
  p25: number[]
  p50: number[]
  p75: number[]
  p90: number[]
  startAge: number
}

// ── SimChart ────────────────────────────────────────────────────────────────

export const SimChart = memo(function SimChart({
  rows,
  fireAge,
  fireAgeFractional,
  currentAge,
  endAge,
  cashflows,
  fireTarget,
  forModal,
  strategy,
  targetEndPortfolio,
  baselineRows,
  scenarioOverlays,
  monteCarloOverlay,
  baselineFireAge,
  dailyExpenseRate,
  householdOverlays,
  visibleMinAge,
  visibleMaxAge,
  aowAgeFractional,
  planningMode = 'fire',
  showDepletionWarning,
  baselineEmphasis = 'ghost',
  eventOverlay,
  onEventClick,
  onEventDragEnd,
}: {
  rows: SimRow[]
  fireAge: number | null
  fireAgeFractional: number | null
  currentAge: number
  endAge: number
  cashflows: SimCashflow[]
  fireTarget?: number
  forModal?: boolean
  strategy?: FireEndStrategy
  targetEndPortfolio?: number
  /** Optional baseline rows for ghost-line overlay (what-if mode) */
  baselineRows?: SimRow[]
  scenarioOverlays?: ScenarioOverlay[]
  monteCarloOverlay?: MonteCarloOverlay
  /** Optional baseline FIRE age for delta annotation (what-if mode) */
  baselineFireAge?: number | null
  /** Daily expense rate for freedom-time tooltip (optional) */
  dailyExpenseRate?: number
  /** Optional partner trajectories for household perspective */
  householdOverlays?: HouseholdPartnerOverlay[]
  /** Zoomed visible range (optional — defaults to full range) */
  visibleMinAge?: number
  visibleMaxAge?: number
  /** AOW pension age as fractional value (e.g. 67.25 for 67j+3m) */
  aowAgeFractional?: number
  /** Planning mode: 'fire' (default) uses FIRE age as split point, 'pensioen' uses AOW age */
  planningMode?: 'fire' | 'pensioen'
  /** Show red depletion zone when portfolio hits zero (AOW-stop mode) */
  showDepletionWarning?: boolean
  /** Baseline rendering: 'ghost' (default, faint gray reference) or 'compare' (solid horizon-700, side-by-side feel) */
  baselineEmphasis?: 'ghost' | 'compare'
  /** Event overlay markers (life events + natural milestones) rendered on the chart */
  eventOverlay?: ChartEventOverlay[]
  /** Click handler for event markers — routes to EventPane or NaturalMilestoneSheet */
  onEventClick?: (id: string, kind: ChartEventKind, sourceId?: string) => void
  /** F-1 directe manipulatie: drag-end handler. Caller persisteert de
   *  nieuwe target_age (typisch via supabase.update op life_events). */
  onEventDragEnd?: (
    id: string,
    sourceId: string | undefined,
    newAge: number,
    kind: ChartEventKind,
  ) => void
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1200, forModal })
  const [hoveredCfId, setHoveredCfId] = useState<string | null>(null)
  const [hoveredAge, setHoveredAge] = useState<number | null>(null)

  const [containerW, setContainerW] = useState(600)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerW(Math.round(w))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  const W = containerW
  const isDesktop = containerW >= 768

  // Dynamic padding for event markers (same approach as WealthCompositionChart)
  const aboveCount = eventOverlay
    ? eventOverlay.filter(e => e.side === 'above').length
    : 0
  const belowCount = eventOverlay
    ? eventOverlay.filter(e => e.side === 'below').length
    : 0
  const extraTop = topPaddingFor(aboveCount)
  const extraBottom = bottomPaddingFor(belowCount)
  const PAD = {
    top: CHART_PAD.top + extraTop,
    right: CHART_PAD.right,
    bottom: CHART_PAD.bottom + extraBottom,
    left: CHART_PAD.left,
  }
  const H = (isDesktop ? 260 : 220) + extraTop + extraBottom
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const minAge = visibleMinAge ?? currentAge
  const maxAge = visibleMaxAge ?? endAge

  // Build all path points from rows
  const allPts: [number, number][] = []
  if (rows.length > 0) {
    allPts.push([rows[0].age, rows[0].startPortfolio])
    for (const r of rows) {
      allPts.push([r.age + 1, r.endPortfolio])
    }
  }

  // Build baseline ghost-line points (what-if mode)
  const baselinePts: [number, number][] = []
  if (baselineRows && baselineRows.length > 0) {
    baselinePts.push([baselineRows[0].age, baselineRows[0].startPortfolio])
    for (const r of baselineRows) {
      baselinePts.push([r.age + 1, r.endPortfolio])
    }
  }

  // Filter points to visible range for Y-axis rescaling
  const inRange = ([age]: [number, number]) => age >= minAge - 1 && age <= maxAge + 1
  const visibleAllPts = allPts.filter(inRange)
  const visibleBaselinePts = baselinePts.filter(inRange)

  const baselineMax = visibleBaselinePts.length > 0
    ? Math.max(...visibleBaselinePts.map(([, v]) => v))
    : 0
  const overlayMax = scenarioOverlays?.length
    ? Math.max(...scenarioOverlays.flatMap(o => o.points.filter(inRange).map(([, v]) => v)))
    : 0
  const mcMax = monteCarloOverlay
    ? Math.max(...monteCarloOverlay.p90.filter((_, i) => {
        const age = monteCarloOverlay.startAge + i
        return age >= minAge && age <= maxAge
      }))
    : 0
  const hhMax = householdOverlays?.length
    ? Math.max(...householdOverlays.flatMap(o => o.points.filter(inRange).map(([, v]) => v)))
    : 0
  const rawMax = visibleAllPts.length > 0
    ? Math.max(...visibleAllPts.map(([, v]) => v), fireTarget ?? 0, baselineMax, overlayMax, mcMax, hhMax)
    : Math.max(1, overlayMax, mcMax, hhMax)
  const maxVal = Math.max(rawMax, 1) * 1.08

  const xScale = (age: number) =>
    maxAge > minAge ? ((age - minAge) / (maxAge - minAge)) * innerW : 0
  const yScale = (val: number) => innerH - (val / maxVal) * innerH

  function pointsToPath(pts: [number, number][]): string {
    return pts
      .map(([age, val], i) => {
        const x = PAD.left + xScale(age)
        const y = PAD.top + yScale(Math.max(val, 0))
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  }

  // Build fractional FIRE junction point via linear interpolation.
  // The engine now prorates savings in the FIRE year, so the data naturally
  // reflects the correct portfolio value — no snapping to fireTarget needed.
  let fireFractionalPt: [number, number] | null = null
  if (fireAge !== null && fireAgeFractional !== null) {
    if (fireAge > currentAge) {
      const t = fireAgeFractional - (fireAge - 1)
      const ptBefore = allPts.find(([a]) => a === fireAge - 1)?.[1] ?? 0
      const ptAfter  = allPts.find(([a]) => a === fireAge)?.[1] ?? 0
      fireFractionalPt = [fireAgeFractional, ptBefore + t * (ptAfter - ptBefore)]
    } else {
      // Already at FIRE at currentAge
      fireFractionalPt = [currentAge, allPts[0]?.[1] ?? 0]
    }
  }

  // In pensioen mode, compute AOW junction point for path splitting
  const isPensioenMode = planningMode === 'pensioen'
  let aowFractionalPt: [number, number] | null = null
  if (isPensioenMode && aowAgeFractional != null) {
    const aowFloor = Math.floor(aowAgeFractional)
    if (aowFloor > currentAge) {
      const t = aowAgeFractional - aowFloor
      const ptBefore = allPts.find(([a]) => a === aowFloor)?.[1] ?? 0
      const ptAfter  = allPts.find(([a]) => a === aowFloor + 1)?.[1] ?? 0
      aowFractionalPt = [aowAgeFractional, ptBefore + t * (ptAfter - ptBefore)]
    } else {
      aowFractionalPt = [currentAge, allPts[0]?.[1] ?? 0]
    }
  }

  // Determine split point: AOW age in pensioen mode, FIRE fractional age otherwise.
  // Using fireAgeFractional (e.g. 60.2) ensures the gold→brown colour transition
  // aligns with the FIRE marker, preventing the visual artifact where the gold path
  // continues past FIRE because the integer fireAge (61) is 1 year later.
  const splitAge = isPensioenMode
    ? (aowAgeFractional != null ? Math.ceil(aowAgeFractional) : null)
    : (fireAgeFractional ?? fireAge)
  const splitFractionalPt = isPensioenMode ? aowFractionalPt : fireFractionalPt
  const splitFractionalAge = isPensioenMode ? aowAgeFractional ?? null : fireAgeFractional

  // Split at fractional point for two-colour rendering (opbouw = acc, pensioen/afbouw = dec)
  const accPts: [number, number][] = splitFractionalPt !== null && splitAge !== null
    ? [...allPts.filter(([age]) => age < splitAge), splitFractionalPt]
    : splitAge !== null
    ? allPts.filter(([age]) => age <= splitAge)
    : allPts
  // Build decumulation path starting from the FIRE junction point.
  // The engine prorates savings in the FIRE year, so data naturally reflects
  // correct values — no clamping needed.
  const decPts: [number, number][] = splitFractionalPt !== null && splitAge !== null
    ? [splitFractionalPt, ...allPts.filter(([age]) => age >= Math.ceil(splitAge))]
    : splitAge !== null
    ? allPts.filter(([age]) => age >= splitAge)
    : []

  // Use fractional position for the FIRE vertical line
  const xFire = fireAgeFractional !== null ? PAD.left + xScale(fireAgeFractional) : null
  const yZero = PAD.top + yScale(0)

  // Vertical markers for all recurring cashflows — one line per unique fromAge
  const recurringMarkers = (() => {
    const seen = new Set<number>()
    return cashflows
      .filter(cf => cf.type === 'recurring' && cf.fromAge > minAge && cf.fromAge < maxAge)
      .reduce<{ fromAge: number; label: string; direction: 'income' | 'expense'; amount: number }[]>((acc, cf) => {
        if (seen.has(cf.fromAge)) {
          const entry = acc.find(m => m.fromAge === cf.fromAge)!
          entry.label = entry.label.includes('·') ? entry.label : `${entry.label} · ${cf.name.length > 6 ? cf.name.slice(0, 5) + '…' : cf.name}`
          entry.amount += cf.direction === 'income' ? cf.amount : -cf.amount
          return acc
        }
        seen.add(cf.fromAge)
        acc.push({
          fromAge: cf.fromAge,
          label: cf.name.length > 8 ? cf.name.slice(0, 7) + '…' : cf.name,
          direction: cf.direction,
          amount: cf.direction === 'income' ? cf.amount : -cf.amount,
        })
        return acc
      }, [])
  })()

  // Module-kleuren: Horizon goud voor opbouw/inkomen, Kern bruin voor afbouw/uitgaven
  const COLOR_OPBOUW = 'var(--hor-t, #8a6e42)'
  const COLOR_AFBOUW = 'var(--kern-t, #58362d)'

  const yTicks = [0, 0.33, 0.66, 1.0].map(f => ({
    val: maxVal * f,
    y: PAD.top + yScale(maxVal * f),
  }))

  const totalAgeSpan = maxAge - minAge
  const xStep = totalAgeSpan <= 10 ? 1 : totalAgeSpan <= 20 ? 2 : totalAgeSpan <= 40 ? 5 : 10
  const xTickAges: number[] = []
  for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge; a += xStep) {
    xTickAges.push(a)
  }

  const yFireDot = fireFractionalPt !== null ? PAD.top + yScale(Math.max(fireFractionalPt[1], 0)) : null

  // Pre-compute Monte Carlo band SVG paths (gradient confidence band)
  const mcPaths = monteCarloOverlay ? (() => {
    const mc = monteCarloOverlay
    function bandPath(upper: number[], lower: number[]): string {
      const fwd: string[] = []
      const bwd: string[] = []
      for (let i = 0; i < upper.length; i++) {
        const age = mc.startAge + i
        if (age < minAge || age > maxAge) continue
        const x = PAD.left + xScale(age)
        fwd.push(`${x.toFixed(1)},${(PAD.top + yScale(Math.max(upper[i], 0))).toFixed(1)}`)
        bwd.unshift(`${x.toFixed(1)},${(PAD.top + yScale(Math.max(lower[i], 0))).toFixed(1)}`)
      }
      if (fwd.length < 2) return ''
      return `M ${fwd[0]} ${fwd.slice(1).map(p => `L ${p}`).join(' ')} L ${bwd.join(' L ')} Z`
    }
    function linePath(values: number[]): string {
      let first = true
      return values.map((val, i) => {
        const age = mc.startAge + i
        if (age < minAge || age > maxAge) return null
        const x = PAD.left + xScale(age)
        const y = PAD.top + yScale(Math.max(val, 0))
        const cmd = first ? 'M' : 'L'
        first = false
        return `${cmd} ${x.toFixed(1)} ${y.toFixed(1)}`
      }).filter(Boolean).join(' ')
    }
    // Additional bands for smoother gradient effect (interpolated percentiles)
    function interpolatePercentile(a: number[], b: number[], t: number): number[] {
      return a.map((v, i) => v + (b[i] - v) * t)
    }
    const p15 = interpolatePercentile(mc.p10, mc.p25, 0.5)
    const p35 = interpolatePercentile(mc.p25, mc.p50, 0.5)
    const p65 = interpolatePercentile(mc.p50, mc.p75, 0.5)
    const p85 = interpolatePercentile(mc.p75, mc.p90, 0.5)
    return {
      outermost: bandPath(mc.p90, mc.p10),       // p10-p90: lightest
      outerMid: bandPath(p85, p15),               // p15-p85: slightly denser
      inner: bandPath(mc.p75, mc.p25),            // p25-p75: medium
      innerMid: bandPath(p65, p35),               // p35-p65: denser
      median: linePath(mc.p50),
    }
  })() : null

  // One-time cashflow markers (only for |amount| > 5000)
  const oneTimeMarkers = cashflows
    .filter(cf => cf.type === 'one_time' && Math.abs(cf.amount) > 5000)
    .filter(cf => cf.fromAge > minAge && cf.fromAge < maxAge)
    .map(cf => {
      const pt = allPts.find(([age]) => age === cf.fromAge + 1) ?? null
      const y = pt ? PAD.top + yScale(Math.max(pt[1], 0)) : null
      return { cf, x: PAD.left + xScale(cf.fromAge + 1), y }
    })

  // Recurring cashflow bands (colored rectangles spanning fromAge → toAge)
  const recurringBands = cashflows
    .filter(cf => cf.type === 'recurring' && cf.fromAge < maxAge)
    .map(cf => {
      const startAge = Math.max(cf.fromAge, minAge)
      const endCfAge = cf.toAge != null ? Math.min(cf.toAge, maxAge) : maxAge
      if (endCfAge <= startAge) return null
      const x1 = PAD.left + xScale(startAge)
      const x2 = PAD.left + xScale(endCfAge)
      return { cf, x1, x2, width: x2 - x1 }
    })
    .filter(Boolean) as { cf: SimCashflow; x1: number; x2: number; width: number }[]

  // Freedom-time helper for tooltip
  function freedomDaysFor(amount: number): string {
    if (!dailyExpenseRate || dailyExpenseRate <= 0) return ''
    const days = Math.round(amount / dailyExpenseRate)
    if (days >= 365) return `${(days / 365).toFixed(1)} jr vrijheid`
    if (days >= 30) return `${Math.round(days / 30)} mnd vrijheid`
    return `${days} dgn vrijheid`
  }

  function fmtAmount(amount: number, direction: 'income' | 'expense'): string {
    const prefix = direction === 'income' ? '+' : '−'
    if (amount >= 1_000_000) return `${prefix}€${(amount / 1_000_000).toFixed(1)}M`
    if (amount >= 1_000) return `${prefix}€${Math.round(amount / 1_000)}K`
    return `${prefix}€${Math.round(amount)}`
  }

  /** Format an absolute value for the crosshair tooltip (no sign prefix) */
  function fmtAbs(val: number): string {
    const abs = Math.abs(val)
    if (abs >= 1_000_000) return `€${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `€${Math.round(abs / 1_000)}K`
    return `€${Math.round(abs)}`
  }

  // ── Crosshair tooltip handlers ──────────────────────────────────────────
  const handleOverlayMouseMove = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    const svgEl = ref.current?.querySelector('svg')
    if (!svgEl) return
    const rect = svgEl.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const raw = minAge + ((svgX - PAD.left) / innerW) * (maxAge - minAge)
    const age = Math.max(minAge, Math.min(maxAge, Math.round(raw)))
    setHoveredAge(age)
  }, [ref, W, minAge, maxAge, PAD.left, innerW])

  const handleOverlayMouseLeave = useCallback(() => {
    setHoveredAge(null)
  }, [])

  /** SimRow for the currently hovered age (null if nothing hovered) */
  const hoveredRow = useMemo(() => {
    if (hoveredAge === null) return null
    return rows.find(r => r.age === hoveredAge) ?? null
  }, [hoveredAge, rows])

  /** SVG x-position of the hovered age crosshair */
  const crosshairX = hoveredAge !== null ? PAD.left + xScale(hoveredAge) : null

  /** Compute the portfolio value at hoveredAge for the dot on the line */
  const crosshairY = useMemo(() => {
    if (hoveredAge === null) return null
    // The allPts array maps age → value on the drawn line.
    // At x = hoveredAge the line shows the startPortfolio of that year
    // (which equals endPortfolio of the previous year).
    const pt = allPts.find(([a]) => a === hoveredAge)
    if (pt) return PAD.top + yScale(Math.max(pt[1], 0))
    // Fallback: try the startPortfolio entry at the exact age
    const ptStart = allPts.find(([a]) => a === hoveredAge)
    if (ptStart) return PAD.top + yScale(Math.max(ptStart[1], 0))
    return null
  }, [hoveredAge, allPts, PAD.top, yScale])

  /** Determine the colour for the crosshair dot based on phase */
  const crosshairDotColor = useMemo(() => {
    if (!hoveredRow) return COLOR_OPBOUW
    return hoveredRow.phase === 'retirement' ? COLOR_AFBOUW : COLOR_OPBOUW
  }, [hoveredRow, COLOR_OPBOUW, COLOR_AFBOUW])

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" overflow="hidden" aria-hidden="true">
        {/* Grid lines */}
        {yTicks.map(({ val, y }) => (
          <line key={val} x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y}
            stroke="var(--border-ed)" strokeWidth={1} strokeDasharray="4 4" />
        ))}

        {/* Recurring cashflow duration bands (behind everything) */}
        {recurringBands.map(({ cf, x1, width }) => (
          <rect
            key={`band-${cf.id}`}
            x={x1} y={PAD.top}
            width={width} height={innerH}
            fill={cf.direction === 'income' ? COLOR_OPBOUW : COLOR_AFBOUW}
            opacity={hoveredCfId === cf.id ? 0.12 : 0.05}
            rx={2}
            onMouseEnter={() => setHoveredCfId(cf.id)}
            onMouseLeave={() => setHoveredCfId(null)}
            style={{ cursor: 'default', transition: 'opacity 150ms ease' }}
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map(({ val, y }) => (
          <text key={val} x={PAD.left - 5} y={y + 4} textAnchor="end" fontSize={9}
            fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">
            {val >= 1_000_000
              ? `€${(val / 1_000_000).toFixed(1)}M`
              : val >= 1_000
              ? `€${Math.round(val / 1_000)}k`
              : val > 0 ? `€${Math.round(val)}` : '€0'}
          </text>
        ))}

        {/* X-axis labels */}
        {xTickAges.map(age => (
          <text key={age} x={PAD.left + xScale(age)} y={H - 4} textAnchor="middle" fontSize={9}
            fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">{age}</text>
        ))}

        {/* FIRE doelbedrag — horizontale dashed lijn (hidden in pensioen mode) */}
        {!isPensioenMode && fireTarget != null && fireTarget > 0 && (
          <>
            <line
              x1={PAD.left} x2={PAD.left + innerW}
              y1={PAD.top + yScale(fireTarget)} y2={PAD.top + yScale(fireTarget)}
              stroke="var(--hor-t, #8a6e42)" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.6}
            />
            <text
              x={PAD.left + innerW - 2} y={PAD.top + yScale(fireTarget) - 9}
              fontSize={8} fill="var(--hor-t, #8a6e42)" textAnchor="end"
              fontFamily="var(--font-inter, sans-serif)" fontWeight={600}
            >
              doel
            </text>
            <text
              x={PAD.left + innerW - 2} y={PAD.top + yScale(fireTarget) - 1}
              fontSize={7.5} fill="var(--hor-t, #8a6e42)" textAnchor="end"
              fontFamily="var(--font-dm-mono, monospace)"
            >
              {fireTarget >= 1_000_000
                ? `€${(fireTarget / 1_000_000).toFixed(2)}M`
                : `€${Math.round(fireTarget / 1000)}k`}
            </text>
          </>
        )}

        {/* Legacy/Perpetual target — horizontal dashed line at target portfolio value (hidden in pensioen mode) */}
        {!isPensioenMode && (strategy === 'legacy' || strategy === 'perpetual') && targetEndPortfolio != null && targetEndPortfolio > 0 && (
          <>
            <line
              x1={PAD.left} x2={PAD.left + innerW}
              y1={PAD.top + yScale(targetEndPortfolio)} y2={PAD.top + yScale(targetEndPortfolio)}
              stroke="var(--kern-t, #58362d)" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.6}
            />
            <text
              x={PAD.left + innerW - 2} y={PAD.top + yScale(targetEndPortfolio) - 4}
              fontSize={8} fill="var(--kern-t, #58362d)" textAnchor="end"
              fontFamily="var(--font-inter, sans-serif)" fontWeight={600}
            >
              {strategy === 'perpetual' ? 'koopkracht' : 'erfenis'} {targetEndPortfolio >= 1_000_000
                ? `€${(targetEndPortfolio / 1_000_000).toFixed(1)}M`
                : `€${Math.round(targetEndPortfolio / 1000)}k`}
            </text>
          </>
        )}

        {/* Zero baseline */}
        <line x1={PAD.left} x2={PAD.left + innerW} y1={yZero} y2={yZero}
          stroke="var(--border-md)" strokeWidth={1.5} />

        {/* Depletion zone — red tint when portfolio hits zero (AOW-stop mode) */}
        {showDepletionWarning && (() => {
          const depletionPt = allPts.find(([, v]) => v <= 0)
          if (!depletionPt || depletionPt[0] >= maxAge || depletionPt[0] <= minAge) return null
          const x1 = PAD.left + xScale(depletionPt[0])
          const x2 = PAD.left + xScale(maxAge)
          return (
            <>
              <rect x={x1} y={PAD.top} width={Math.max(0, x2 - x1)} height={innerH}
                fill="#ef4444" opacity={0.06} />
              <text x={x1 + 4} y={PAD.top + 14} fontSize={8}
                fill="#dc2626" fontWeight={600}
                fontFamily="var(--font-inter, sans-serif)">
                Vermogen op
              </text>
            </>
          )
        })()}

        {/* Recurring cashflow dashed verticals (one per unique fromAge) */}
        {recurringMarkers.map(({ fromAge, direction }) => {
          const x = PAD.left + xScale(fromAge)
          const lineColor = direction === 'income' ? COLOR_OPBOUW : COLOR_AFBOUW
          return (
            <line key={`rec-vline-${fromAge}`} x1={x} x2={x} y1={PAD.top} y2={PAD.top + innerH}
              stroke={lineColor} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
          )
        })}

        {/* FIRE dashed vertical (hidden in pensioen mode) */}
        {!isPensioenMode && xFire !== null && fireAgeFractional !== null && fireAgeFractional > minAge && fireAgeFractional < maxAge && (
          <line x1={xFire} x2={xFire} y1={PAD.top} y2={PAD.top + innerH}
            stroke={COLOR_OPBOUW} strokeWidth={1.5} strokeDasharray="4 2" opacity={0.85} />
        )}

        {/* AOW pensioenleeftijd dashed vertical (promoted in pensioen mode) */}
        {aowAgeFractional != null && aowAgeFractional > minAge && aowAgeFractional < maxAge && (
          <>
            <line
              x1={PAD.left + xScale(aowAgeFractional)}
              x2={PAD.left + xScale(aowAgeFractional)}
              y1={PAD.top} y2={PAD.top + innerH}
              stroke={isPensioenMode ? COLOR_OPBOUW : "var(--ink-3, #8a8680)"}
              strokeWidth={isPensioenMode ? 1.8 : 1.2}
              strokeDasharray={isPensioenMode ? "4 2" : "3 3"}
              opacity={isPensioenMode ? 0.85 : 0.6}
            />
            <text
              x={PAD.left + xScale(aowAgeFractional) - 4}
              y={PAD.top + 14}
              textAnchor="end"
              fontSize={8}
              fill="var(--ink-3, #8a8680)"
              fontFamily="var(--font-inter, sans-serif)"
              fontWeight={600}
            >
              AOW
            </text>
            <text
              x={PAD.left + xScale(aowAgeFractional) - 4}
              y={PAD.top + 23}
              textAnchor="end"
              fontSize={7}
              fill="var(--ink-4, #bbb8b0)"
              fontFamily="var(--font-dm-mono, monospace)"
            >
              {aowAgeFractional % 1 === 0
                ? `${aowAgeFractional}`
                : `${Math.floor(aowAgeFractional)}+${Math.round((aowAgeFractional % 1) * 12)}m`}
            </text>
            {/* AOW dot at junction point (pensioen mode only) */}
            {isPensioenMode && aowFractionalPt !== null && (
              <circle
                cx={PAD.left + xScale(aowFractionalPt[0])}
                cy={PAD.top + yScale(Math.max(aowFractionalPt[1], 0))}
                r={5}
                fill={COLOR_OPBOUW}
                stroke="var(--paper)"
                strokeWidth={1.5}
              />
            )}
          </>
        )}

        {/* Baseline reference line (what-if mode) — emphasis switches between
            faint ghost (no preset active) and solid compare (preset active). */}
        {baselinePts.length > 1 && (
          <path
            d={pointsToPath(baselinePts)}
            fill="none"
            stroke={baselineEmphasis === 'compare'
              ? 'var(--color-horizon-700, #8a6e42)'
              : 'var(--ink-4, #bbb8b0)'}
            strokeWidth={baselineEmphasis === 'compare' ? 2 : 2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            opacity={baselineEmphasis === 'compare' ? 0.85 : 0.55}
            style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)' : 'none' }}
          />
        )}

        {/* Monte Carlo gradient confidence band */}
        {mcPaths && (
          <g style={{
            opacity: hasEntered ? 1 : 0,
            transition: hasEntered ? 'opacity 0.8s ease 0.2s' : 'none',
          }}>
            {/* SVG gradient definition for confidence band fade */}
            <defs>
              <linearGradient id="mc-band-gradient-v" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-horizon-600, #a07840)" stopOpacity="0" />
                <stop offset="35%" stopColor="var(--color-horizon-600, #a07840)" stopOpacity="0.18" />
                <stop offset="50%" stopColor="var(--color-horizon-600, #a07840)" stopOpacity="0.25" />
                <stop offset="65%" stopColor="var(--color-horizon-600, #a07840)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--color-horizon-600, #a07840)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="mc-band-gradient-h" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-horizon-600, #a07840)" stopOpacity="0.8" />
                <stop offset="100%" stopColor="var(--color-horizon-600, #a07840)" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            {/* Outermost band: p10-p90 — lightest layer */}
            {mcPaths.outermost && (
              <path d={mcPaths.outermost} fill="url(#mc-band-gradient-v)" opacity={0.5} />
            )}
            {/* Outer-mid band: p15-p85 — slightly denser */}
            {mcPaths.outerMid && (
              <path d={mcPaths.outerMid} fill="var(--color-horizon-600, #a07840)" opacity={0.06} />
            )}
            {/* Inner band: p25-p75 — medium density */}
            {mcPaths.inner && (
              <path d={mcPaths.inner} fill="var(--color-horizon-600, #a07840)" opacity={0.09} />
            )}
            {/* Inner-mid band: p35-p65 — densest fill near median */}
            {mcPaths.innerMid && (
              <path d={mcPaths.innerMid} fill="var(--color-horizon-600, #a07840)" opacity={0.1} />
            )}
            {/* Median line: p50 — clear solid line */}
            {mcPaths.median && (
              <path d={mcPaths.median} fill="none"
                stroke="var(--color-horizon-600, #a07840)" strokeWidth={1.8}
                strokeLinecap="round" strokeLinejoin="round" opacity={0.7}
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset={hasEntered ? 0 : 1}
                style={{ transition: hasEntered ? 'stroke-dashoffset 1s cubic-bezier(.22,1,.36,1) 0.3s' : 'none' }}
              />
            )}
          </g>
        )}

        {/* Scenario overlay paths (behind main line) */}
        {scenarioOverlays?.map((overlay, i) =>
          overlay.points.length > 1 && (
            <path
              key={overlay.name}
              d={pointsToPath(overlay.points)}
              fill="none"
              stroke={overlay.color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.45}
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={hasEntered ? 0 : 1}
              style={{ transition: hasEntered ? `stroke-dashoffset 1s cubic-bezier(.22,1,.36,1) ${0.3 + i * 0.1}s` : 'none' }}
            />
          )
        )}

        {/* Household partner overlay paths */}
        {householdOverlays?.map((overlay, i) =>
          overlay.points.length > 1 && (
            <g key={`hh-${overlay.name}`}>
              <path
                d={pointsToPath(overlay.points)}
                fill="none"
                stroke={overlay.color}
                strokeWidth={overlay.isDashed ? 2 : 1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={overlay.isDashed ? '6 4' : 'none'}
                opacity={overlay.isDashed ? 0.7 : 0.55}
                pathLength={1}
                style={{
                  strokeDashoffset: hasEntered ? 0 : (overlay.isDashed ? 0 : 1),
                  transition: hasEntered ? `stroke-dashoffset 1s cubic-bezier(.22,1,.36,1) ${0.2 + i * 0.15}s` : 'none',
                  ...(overlay.isDashed ? {} : { strokeDasharray: '1', strokeDashoffset: hasEntered ? 0 : 1 }),
                }}
              />
              {/* Partner FIRE age dot */}
              {overlay.fireAge !== null && overlay.fireAge >= currentAge && overlay.fireAge <= endAge && (
                <circle
                  cx={PAD.left + xScale(overlay.fireAge)}
                  cy={PAD.top + yScale(
                    overlay.points.find(([a]) => Math.abs(a - overlay.fireAge!) < 1)?.[1] ?? 0
                  )}
                  r={3}
                  fill={overlay.color}
                  opacity={hasEntered ? 0.8 : 0}
                  style={{ transition: 'opacity 0.4s ease 1s' }}
                />
              )}
            </g>
          )
        )}

        {/* Accumulation path — horizon goud */}
        {accPts.length > 1 && (
          <path
            d={pointsToPath(accPts)}
            fill="none"
            stroke={COLOR_OPBOUW}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)' : 'none' }}
          />
        )}

        {/* Decumulation path — kern bruin (or horizon goud for perpetual in fire mode) */}
        {decPts.length > 1 && (
          <path
            d={pointsToPath(decPts)}
            fill="none"
            stroke={!isPensioenMode && strategy === 'perpetual' ? COLOR_OPBOUW : COLOR_AFBOUW}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1) 0.15s' : 'none' }}
          />
        )}

        {/* Path when FIRE not reachable — grey single line */}
        {fireAge === null && allPts.length > 1 && (
          <path
            d={pointsToPath(allPts)}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)' : 'none' }}
          />
        )}

        {/* Event markers (life events + natural milestones) — rendered ABOVE the
            confidence band and projection lines so they are never hidden */}
        {eventOverlay && eventOverlay.length > 0 && (
          <ChartEventMarkers
            events={eventOverlay}
            xScale={xScale}
            padLeft={PAD.left}
            chartTopY={PAD.top}
            chartBottomY={PAD.top + innerH}
            visibleMinAge={minAge}
            visibleMaxAge={maxAge}
            onEventClick={onEventClick}
            onEventDragEnd={onEventDragEnd}
          />
        )}

        {/* Crosshair hover overlay — invisible rect covering chart area for mouse tracking */}
        <rect
          x={PAD.left} y={PAD.top}
          width={innerW} height={innerH}
          fill="transparent"
          pointerEvents="all"
          style={{ cursor: 'crosshair' }}
          onMouseMove={handleOverlayMouseMove}
          onMouseLeave={handleOverlayMouseLeave}
        />

        {/* Crosshair vertical line */}
        {hoveredAge !== null && crosshairX !== null && (
          <line
            x1={crosshairX} x2={crosshairX}
            y1={PAD.top} y2={PAD.top + innerH}
            stroke="var(--ink-3)" strokeWidth={1} opacity={0.4}
            pointerEvents="none"
          />
        )}

        {/* Crosshair dot on the wealth line */}
        {hoveredAge !== null && crosshairX !== null && crosshairY !== null && (
          <circle
            cx={crosshairX} cy={crosshairY} r={4}
            fill={crosshairDotColor}
            stroke="var(--paper)" strokeWidth={1.5}
            pointerEvents="none"
          />
        )}

        {/* Dot at FIRE junction (hidden in pensioen mode) */}
        {!isPensioenMode && xFire !== null && yFireDot !== null && fireAgeFractional !== null && fireAgeFractional > minAge && fireAgeFractional < maxAge && (
          <circle cx={xFire} cy={yFireDot} r={5}
            fill={COLOR_OPBOUW} stroke="var(--paper)" strokeWidth={1.5} />
        )}

        {/* One-time cashflow markers with amount labels */}
        {oneTimeMarkers.map(({ cf, x, y }) => y !== null && (
          <g
            key={cf.id}
            onMouseEnter={() => setHoveredCfId(cf.id)}
            onMouseLeave={() => setHoveredCfId(null)}
            style={{ cursor: 'default' }}
          >
            <circle cx={x} cy={y} r={hoveredCfId === cf.id ? 6 : 4}
              fill={cf.direction === 'income' ? COLOR_OPBOUW : COLOR_AFBOUW}
              stroke="var(--paper)" strokeWidth={1} opacity={0.9}
              style={{ transition: 'r 150ms ease' }} />
            <text x={x} y={y - 8} textAnchor="middle" fontSize={7}
              fill={cf.direction === 'income' ? COLOR_OPBOUW : COLOR_AFBOUW}
              fontFamily="var(--font-inter, sans-serif)" fontWeight={500}>
              {cf.name.length > 8 ? cf.name.slice(0, 7) + '…' : cf.name}
            </text>
            {/* Amount label */}
            <text x={x} y={y - 16} textAnchor="middle" fontSize={7.5}
              fill={cf.direction === 'income' ? COLOR_OPBOUW : COLOR_AFBOUW}
              fontFamily="var(--font-dm-mono, monospace)" fontWeight={600}>
              {fmtAmount(cf.amount, cf.direction)}
            </text>

            {/* Hover tooltip with name, amount, freedom-time */}
            {hoveredCfId === cf.id && (
              <g>
                <rect
                  x={Math.max(PAD.left, Math.min(x - 65, W - PAD.right - 130))}
                  y={Math.max(PAD.top, y - 52)}
                  width={130} height={freedomDaysFor(cf.amount) ? 36 : 26}
                  rx={4} fill="var(--ink)" opacity={0.92}
                />
                <text
                  x={Math.max(PAD.left + 65, Math.min(x, W - PAD.right - 65))}
                  y={Math.max(PAD.top + 11, y - 40)}
                  textAnchor="middle" fontSize={8} fontWeight={600}
                  fill="var(--paper)" fontFamily="var(--font-inter, sans-serif)">
                  {cf.name}
                </text>
                <text
                  x={Math.max(PAD.left + 65, Math.min(x, W - PAD.right - 65))}
                  y={Math.max(PAD.top + 21, y - 29)}
                  textAnchor="middle" fontSize={7}
                  fill="var(--paper)" fontFamily="var(--font-dm-mono, monospace)">
                  {fmtAmount(cf.amount, cf.direction)} · leeftijd {cf.fromAge}
                </text>
                {freedomDaysFor(cf.amount) && (
                  <text
                    x={Math.max(PAD.left + 65, Math.min(x, W - PAD.right - 65))}
                    y={Math.max(PAD.top + 31, y - 19)}
                    textAnchor="middle" fontSize={7}
                    fill={cf.direction === 'income' ? '#6ee7b7' : '#fca5a5'}
                    fontFamily="var(--font-inter, sans-serif)">
                    {freedomDaysFor(cf.amount)}
                  </text>
                )}
              </g>
            )}
          </g>
        ))}

        {/* Phase label: OPBOUW / VERMOGENSGROEI */}
        {splitFractionalAge !== null && splitFractionalAge > minAge + 3 && (
          <text x={PAD.left + xScale((minAge + splitFractionalAge) / 2)} y={PAD.top + 14}
            textAnchor="middle" fontSize={10} fill={COLOR_OPBOUW}
            fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
            {isPensioenMode ? 'VERMOGENSGROEI' : 'OPBOUW'}
          </text>
        )}

        {/* Phase label: AFBOUW / BEHOUD / PENSIOEN */}
        {splitFractionalAge !== null && splitFractionalAge < maxAge - 3 && (
          <text x={PAD.left + xScale((splitFractionalAge + maxAge) / 2)} y={PAD.top + 14}
            textAnchor="middle" fontSize={10}
            fill={!isPensioenMode && strategy === 'perpetual' ? COLOR_OPBOUW : COLOR_AFBOUW}
            fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
            {isPensioenMode ? 'PENSIOEN' : strategy === 'perpetual' ? 'BEHOUD' : 'AFBOUW'}
          </text>
        )}

        {/* FIRE age label (hidden in pensioen mode) */}
        {!isPensioenMode && xFire !== null && fireAgeFractional !== null && fireAgeFractional > minAge && fireAgeFractional < maxAge && (
          <text x={xFire + 4} y={PAD.top + 24} fontSize={8}
            fill={COLOR_OPBOUW} fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
            FIRE {fireAgeFractional.toFixed(1)}
          </text>
        )}

        {/* FIRE age delta label (what-if mode) */}
        {xFire !== null && yFireDot !== null && fireAgeFractional !== null && baselineFireAge != null &&
          fireAgeFractional > minAge && fireAgeFractional < maxAge &&
          Math.abs(fireAgeFractional - baselineFireAge) > 0.1 && (
          <text
            x={xFire}
            y={yFireDot - 14}
            textAnchor="middle"
            fontSize={9}
            fontWeight={700}
            fontFamily="var(--font-dm-mono, monospace)"
            fill={fireAgeFractional < baselineFireAge ? COLOR_OPBOUW : COLOR_AFBOUW}
          >
            {fireAgeFractional < baselineFireAge ? '' : '+'}
            {(fireAgeFractional - baselineFireAge).toFixed(1)} jr
          </text>
        )}

        {/* Recurring cashflow labels with € amount near bottom of chart */}
        {recurringMarkers.map(({ fromAge, label, direction, amount }) => {
          const x = PAD.left + xScale(fromAge)
          const textColor = direction === 'income' ? COLOR_OPBOUW : COLOR_AFBOUW
          const absAmt = Math.abs(amount)
          const amtFmt = absAmt >= 1000 ? `€${(absAmt / 1000).toFixed(1)}k` : `€${Math.round(absAmt)}`
          const prefix = direction === 'income' ? '+' : '−'
          // Find matching cashflow for hover
          const matchCf = cashflows.find(cf => cf.type === 'recurring' && cf.fromAge === fromAge)
          return (
            <g
              key={`rec-label-${fromAge}`}
              onMouseEnter={() => matchCf && setHoveredCfId(matchCf.id)}
              onMouseLeave={() => setHoveredCfId(null)}
              style={{ cursor: 'default' }}
            >
              <text x={x + 3} y={PAD.top + innerH - 14} fontSize={8}
                fill={textColor} fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
                {label}
              </text>
              <text x={x + 3} y={PAD.top + innerH - 4} fontSize={7.5}
                fill={textColor} fontFamily="var(--font-dm-mono, monospace)">
                {prefix}{amtFmt}/mnd
              </text>

              {/* Hover tooltip for recurring */}
              {matchCf && hoveredCfId === matchCf.id && (
                <g>
                  <rect
                    x={Math.max(PAD.left, Math.min(x - 65, W - PAD.right - 130))}
                    y={PAD.top + innerH - 56}
                    width={130} height={freedomDaysFor(absAmt * 12) ? 36 : 26}
                    rx={4} fill="var(--ink)" opacity={0.92}
                  />
                  <text
                    x={Math.max(PAD.left + 65, Math.min(x, W - PAD.right - 65))}
                    y={PAD.top + innerH - 45}
                    textAnchor="middle" fontSize={8} fontWeight={600}
                    fill="var(--paper)" fontFamily="var(--font-inter, sans-serif)">
                    {matchCf.name}
                  </text>
                  <text
                    x={Math.max(PAD.left + 65, Math.min(x, W - PAD.right - 65))}
                    y={PAD.top + innerH - 34}
                    textAnchor="middle" fontSize={7}
                    fill="var(--paper)" fontFamily="var(--font-dm-mono, monospace)">
                    {prefix}{amtFmt}/mnd · leeftijd {matchCf.fromAge}{matchCf.toAge ? `–${matchCf.toAge}` : ''}
                  </text>
                  {freedomDaysFor(absAmt * 12) && (
                    <text
                      x={Math.max(PAD.left + 65, Math.min(x, W - PAD.right - 65))}
                      y={PAD.top + innerH - 23}
                      textAnchor="middle" fontSize={7}
                      fill={direction === 'income' ? '#6ee7b7' : '#fca5a5'}
                      fontFamily="var(--font-inter, sans-serif)">
                      {freedomDaysFor(absAmt * 12)}/jaar
                    </text>
                  )}
                </g>
              )}
            </g>
          )
        })}
      </svg>

      {/* Crosshair tooltip (HTML overlay for crisp text rendering) */}
      {hoveredAge !== null && hoveredRow && crosshairX !== null && (() => {
        // Convert SVG crosshair X to CSS percentage within the container
        const pctX = crosshairX / W
        // Position tooltip to the right by default; flip left if too close to right edge
        const tooltipW = 180
        const flipThreshold = 0.7
        const showLeft = pctX > flipThreshold
        // Vertical position: roughly at chart midpoint
        const pctY = (PAD.top + innerH * 0.2) / H

        // Collect drijvers (positive factors)
        const drijvers: { label: string; value: number }[] = []
        if (hoveredRow.growth > 0) drijvers.push({ label: 'Rendement', value: hoveredRow.growth })
        if (hoveredRow.savings > 0) drijvers.push({ label: 'Sparen', value: hoveredRow.savings })
        if (hoveredRow.cashflowNet > 0) drijvers.push({ label: 'Inkomsten', value: hoveredRow.cashflowNet })
        if (hoveredRow.oneTimeNet > 0) drijvers.push({ label: 'Eenmalig', value: hoveredRow.oneTimeNet })

        // Collect drukkers (negative factors)
        const drukkers: { label: string; value: number }[] = []
        if (hoveredRow.withdrawal > 0) drukkers.push({ label: 'Onttrekking', value: hoveredRow.withdrawal })
        if (hoveredRow.cashflowNet < 0) drukkers.push({ label: 'Uitgaven', value: Math.abs(hoveredRow.cashflowNet) })
        if (hoveredRow.oneTimeNet < 0) drukkers.push({ label: 'Eenmalig', value: Math.abs(hoveredRow.oneTimeNet) })
        if (hoveredRow.growth < 0) drukkers.push({ label: 'Rendement', value: Math.abs(hoveredRow.growth) })

        // Monte Carlo percentile values at hovered age
        const mcPercentiles = monteCarloOverlay ? (() => {
          const idx = hoveredAge - monteCarloOverlay.startAge
          if (idx < 0 || idx >= monteCarloOverlay.p50.length) return null
          return {
            p10: monteCarloOverlay.p10[idx],
            p25: monteCarloOverlay.p25[idx],
            p50: monteCarloOverlay.p50[idx],
            p75: monteCarloOverlay.p75[idx],
            p90: monteCarloOverlay.p90[idx],
          }
        })() : null

        return (
          <div
            className="pointer-events-none absolute z-10"
            style={{
              left: showLeft ? `calc(${(pctX * 100).toFixed(1)}% - ${tooltipW + 12}px)` : `calc(${(pctX * 100).toFixed(1)}% + 12px)`,
              top: `${(pctY * 100).toFixed(1)}%`,
              width: tooltipW,
            }}
          >
            <div
              className="rounded-lg px-3 py-2"
              style={{ background: 'var(--ink)', opacity: 0.94 }}
            >
              {/* Header: age */}
              <div
                className="font-semibold"
                style={{ fontSize: 11, color: 'var(--paper)' }}
              >
                Leeftijd {hoveredRow.age}
              </div>

              {/* Separator */}
              <div className="my-1" style={{ height: 1, background: 'var(--ink-3)', opacity: 0.4 }} />

              {/* Vermogen */}
              <div className="flex items-baseline justify-between" style={{ fontSize: 10, color: 'var(--paper)' }}>
                <span>Vermogen</span>
                <span className="font-mono tabular-nums font-semibold">{fmtAbs(hoveredRow.startPortfolio)}</span>
              </div>

              {/* Drijvers section */}
              {drijvers.length > 0 && (
                <>
                  <div className="mt-1.5" style={{ height: 1, background: 'var(--ink-3)', opacity: 0.25 }} />
                  {drijvers.map(d => (
                    <div key={d.label} className="flex items-baseline justify-between mt-0.5" style={{ fontSize: 9 }}>
                      <span style={{ color: '#6ee7b7' }}>&#9650; {d.label}</span>
                      <span className="font-mono tabular-nums" style={{ color: '#6ee7b7' }}>+{fmtAbs(d.value)}</span>
                    </div>
                  ))}
                </>
              )}

              {/* Drukkers section */}
              {drukkers.length > 0 && (
                <>
                  <div className="mt-1.5" style={{ height: 1, background: 'var(--ink-3)', opacity: 0.25 }} />
                  {drukkers.map(d => (
                    <div key={d.label} className="flex items-baseline justify-between mt-0.5" style={{ fontSize: 9 }}>
                      <span style={{ color: '#fca5a5' }}>&#9660; {d.label}</span>
                      <span className="font-mono tabular-nums" style={{ color: '#fca5a5' }}>{'\u2212'}{fmtAbs(d.value)}</span>
                    </div>
                  ))}
                </>
              )}

              {/* Monte Carlo percentiles section */}
              {mcPercentiles && (
                <>
                  <div className="mt-1.5" style={{ height: 1, background: 'var(--ink-3)', opacity: 0.25 }} />
                  <div className="mt-1" style={{ fontSize: 8, color: 'var(--color-horizon-300, #d4b88a)', fontWeight: 600, letterSpacing: '0.04em' }}>
                    MONTE CARLO
                  </div>
                  {([
                    { label: 'p90', value: mcPercentiles.p90, opacity: 0.5 },
                    { label: 'p75', value: mcPercentiles.p75, opacity: 0.65 },
                    { label: 'p50', value: mcPercentiles.p50, opacity: 1 },
                    { label: 'p25', value: mcPercentiles.p25, opacity: 0.65 },
                    { label: 'p10', value: mcPercentiles.p10, opacity: 0.5 },
                  ] as const).map(p => (
                    <div key={p.label} className="flex items-baseline justify-between mt-0.5" style={{ fontSize: 9, opacity: p.opacity }}>
                      <span style={{ color: p.label === 'p50' ? 'var(--color-horizon-300, #d4b88a)' : 'var(--ink-4, #bbb8b0)' }}>
                        {p.label}{p.label === 'p50' ? ' \u25cf' : ''}
                      </span>
                      <span
                        className="font-mono tabular-nums"
                        style={{
                          color: p.label === 'p50' ? 'var(--color-horizon-300, #d4b88a)' : 'var(--paper)',
                          fontWeight: p.label === 'p50' ? 600 : 400,
                        }}
                      >
                        {fmtAbs(p.value)}
                      </span>
                    </div>
                  ))}
                </>
              )}

              {/* Scenario overlay values at hovered age */}
              {scenarioOverlays && scenarioOverlays.length > 0 && (() => {
                const overlayValues = scenarioOverlays
                  .map(o => {
                    const pt = o.points.find(([age]) => Math.round(age) === hoveredAge)
                    return pt ? { label: o.label, color: o.color, value: pt[1] } : null
                  })
                  .filter((v): v is { label: string; color: string; value: number } => v !== null)
                if (overlayValues.length === 0) return null
                return (
                  <>
                    <div className="mt-1.5" style={{ height: 1, background: 'var(--ink-3)', opacity: 0.25 }} />
                    <div className="mt-1" style={{ fontSize: 8, color: 'var(--ink-4, #bbb8b0)', fontWeight: 600, letterSpacing: '0.04em' }}>
                      SCENARIO&apos;S
                    </div>
                    {overlayValues.map(v => (
                      <div key={v.label} className="flex items-baseline justify-between mt-0.5" style={{ fontSize: 9 }}>
                        <span className="flex items-center gap-1" style={{ color: v.color }}>
                          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />
                          <span className="truncate max-w-[80px]">{v.label}</span>
                        </span>
                        <span className="font-mono tabular-nums" style={{ color: 'var(--paper)' }}>
                          {fmtAbs(v.value)}
                        </span>
                      </div>
                    ))}
                  </>
                )
              })()}
            </div>
          </div>
        )
      })()}

      {/* Household partner legend */}
      {householdOverlays && householdOverlays.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4">
          {householdOverlays.map(overlay => (
            <div key={overlay.name} className="flex items-center gap-1.5">
              <svg width="20" height="8" className="shrink-0">
                <line
                  x1="0" y1="4" x2="20" y2="4"
                  stroke={overlay.color}
                  strokeWidth={overlay.isDashed ? 2 : 1.8}
                  strokeDasharray={overlay.isDashed ? '4 3' : 'none'}
                  opacity={overlay.isDashed ? 0.7 : 0.55}
                />
              </svg>
              <span className="text-[10px] font-medium text-[var(--ink-3)]">
                {overlay.name}
                {overlay.fireAge !== null && (
                  <span className="ml-1 font-mono text-[var(--ink-4)]">
                    ({Math.round(overlay.fireAge)}j)
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Scenario overlay legend — shows label + color for each active saved scenario */}
      {scenarioOverlays && scenarioOverlays.length > 0 && !householdOverlays?.length && (
        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4">
          {scenarioOverlays.map(overlay => (
            <div key={overlay.name} className="flex items-center gap-1.5">
              <svg width="20" height="8" className="shrink-0">
                <line
                  x1="0" y1="4" x2="20" y2="4"
                  stroke={overlay.color}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.65}
                />
              </svg>
              <span className="text-[10px] font-medium text-[var(--ink-3)]">
                {overlay.label}
              </span>
            </div>
          ))}
        </div>
      )}

    </div>
  )
})

// ── Scenario variant builder ────────────────────────────────────────────────

/** Return-rate offsets for pessimistic/optimistic variants (percentage points) */
export const SCENARIO_VARIANTS = [
  { name: 'pessimist', label: 'Voorzichtig', color: '#9e6b50', delta: -0.02 },
  { name: 'optimist', label: 'Optimistisch', color: '#5b8c5a', delta: +0.02 },
] as const

/**
 * Build scenario overlay paths that stay symmetric around the main simulation.
 *
 * Instead of compounding the delta on the variant's own (diverged) portfolio,
 * we track an "extra" divergence that compounds at the BASE return rate and
 * accumulates delta applied to the MAIN sim's portfolio each year.
 * This keeps optimist and pessimist equidistant from the main line
 * (main is always the exact midpoint).
 */
export function buildScenarioVariants(
  rows: SimRow[],
  baseReturn: number,
): ScenarioOverlay[] {
  if (rows.length === 0) return []

  return SCENARIO_VARIANTS.map(({ name, label, color, delta }) => {
    let extra = 0
    const points: [number, number][] = [[rows[0].age, rows[0].startPortfolio]]

    for (const row of rows) {
      // Derive base net-of-tax return from the main sim row
      const baseNetReturn = row.startPortfolio > 0
        ? row.growth / row.startPortfolio
        : 0
      // Extra divergence: existing extra grows at base rate,
      // plus delta applied to main sim's portfolio this year
      extra = extra * (1 + baseNetReturn) + row.startPortfolio * delta
      const portfolio = row.endPortfolio + extra
      points.push([row.age + 1, Math.max(portfolio, 0)])
      if (portfolio <= 0) break
    }

    return { name, label, color, points }
  })
}

// ── Simulation-derived scenario paths (for detail modal) ───────────────────

/**
 * Build 3 ScenarioPath objects from the main simulation for the detail modal:
 * Voorzichtig (-2%), Huidige Koers (baseline), Optimistisch (+2%).
 * All paths share the same cashflow pattern — only return rate differs.
 * Returns ScenarioPath[] so the existing DivergingPathsChart and
 * ScenarioDetailModal work without changes.
 */
export function buildScenarioPathsFromSim(
  rows: SimRow[],
  baseReturn: number,
  fireTarget: number,
): ScenarioPath[] {
  if (rows.length === 0) return []

  const startAge = rows[0].age
  const now = new Date()

  function rowsToMonths(pts: { age: number; netWorth: number; contributions: number; growth: number }[]): ProjectionMonth[] {
    return pts.map(pt => {
      const yearOffset = pt.age - startAge
      const month = yearOffset * 12
      const date = new Date(now)
      date.setMonth(date.getMonth() + month)
      return {
        month,
        date: date.toISOString().split('T')[0],
        netWorth: Math.round(pt.netWorth),
        passiveIncome: Math.round((pt.netWorth * NL_SWR) / 12),
        age: pt.age,
        contributions: Math.round(pt.contributions),
        growth: Math.round(pt.growth),
      }
    })
  }

  // Baseline path from main simulation rows
  const baselinePts: { age: number; netWorth: number; contributions: number; growth: number }[] = [
    { age: startAge, netWorth: rows[0].startPortfolio, contributions: 0, growth: 0 },
  ]
  let baselineFireAge: number | null = null
  let baselineFireMonth: number | null = null
  for (const row of rows) {
    baselinePts.push({ age: row.age + 1, netWorth: row.endPortfolio, contributions: row.savings, growth: row.growth })
    if (baselineFireAge === null && row.endPortfolio >= fireTarget && fireTarget > 0) {
      baselineFireAge = row.age + 1
      baselineFireMonth = (row.age + 1 - startAge) * 12
    }
  }

  // Variant paths (symmetric around main, with FIRE detection + richer output)
  function buildVariant(name: string, label: string, color: string, delta: number): ScenarioPath {
    let extra = 0
    const pts: { age: number; netWorth: number; contributions: number; growth: number }[] = [
      { age: startAge, netWorth: rows[0].startPortfolio, contributions: 0, growth: 0 },
    ]
    let varFireAge: number | null = null
    let varFireMonth: number | null = null

    for (const row of rows) {
      const baseNetReturn = row.startPortfolio > 0
        ? row.growth / row.startPortfolio
        : 0
      // Symmetric divergence: extra compounds at base rate + delta on main portfolio
      extra = extra * (1 + baseNetReturn) + row.startPortfolio * delta
      const portfolio = row.endPortfolio + extra
      const clamped = Math.max(portfolio, 0)
      const extraGrowth = Math.round(extra * baseNetReturn + row.startPortfolio * delta)
      pts.push({ age: row.age + 1, netWorth: clamped, contributions: row.savings, growth: extraGrowth })

      if (varFireAge === null && clamped >= fireTarget && fireTarget > 0) {
        varFireAge = row.age + 1
        varFireMonth = (row.age + 1 - startAge) * 12
      }

      if (portfolio <= 0) break
    }

    return { name, label, color, months: rowsToMonths(pts), fireAge: varFireAge, fireMonth: varFireMonth }
  }

  const pessimist = buildVariant('pessimist', 'Voorzichtig', '#9e6b50', -0.02)
  const optimist = buildVariant('optimist', 'Optimistisch', '#5b8c5a', +0.02)

  const baseline: ScenarioPath = {
    name: 'current',
    label: 'Huidige Koers',
    color: '#8B5CB8',
    months: rowsToMonths(baselinePts),
    fireAge: baselineFireAge,
    fireMonth: baselineFireMonth,
  }

  return [pessimist, baseline, optimist]
}

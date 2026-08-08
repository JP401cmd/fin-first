'use client'

import { useState, useEffect, memo, useCallback } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import type { SimRow } from '@/lib/fire-simulation'
import type { BreakdownResult, BreakdownRow, BreakdownLayer } from '@/lib/income-expense-breakdown'

// ── Constants ────────────────────────────────────────────────────────────────

const PAD = { top: 16, right: 16, bottom: 28, left: 60 }

/**
 * Euro-label voor as-ticks en tooltips.
 *
 * `masked` is een VERPLICHTE parameter, geen optionele: elk bedrag in deze
 * grafiek loopt hier langs, en een vergeten argument zou precies het lek
 * terugbrengen dat ADR 0091 hier dicht (de Y-as toonde bedragen dwars door de
 * bedragmaskering heen). Spiegelt `fmtAbs` in `sim-chart.tsx`.
 *
 * Let op: op de AS wordt deze functie onder maskering helemaal niet aangeroepen
 * — daar verdwijnt de tick volledig (ADR 0091: "bullets op een as zijn ruis").
 * De bullets zijn er voor tooltip-regels, waar het label ernaast wél context geeft.
 */
function fmtY(val: number, masked: boolean): string {
  if (masked) return MASKED_AMOUNT_PLACEHOLDER
  const abs = Math.abs(val)
  if (abs >= 1_000_000) return `€${(val / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `€${Math.round(val / 1_000)}k`
  if (abs > 0) return `€${Math.round(val)}`
  return '€0'
}

// ── IncomeExpenseChart ───────────────────────────────────────────────────────

export const IncomeExpenseChart = memo(function IncomeExpenseChart({
  rows,
  currentAge,
  endAge,
  visibleMinAge,
  visibleMaxAge,
  fireAge,
  planningMode = 'fire',
  aowAgeFractional,
  viewMode = 'lines',
  breakdownResult,
  baselineRows,
  ghostOverlayRows,
  ghostColor,
}: {
  rows: SimRow[]
  currentAge: number
  endAge: number
  visibleMinAge?: number
  visibleMaxAge?: number
  fireAge?: number | null
  planningMode?: 'fire' | 'pensioen'
  aowAgeFractional?: number
  viewMode?: 'lines' | 'breakdown'
  breakdownResult?: BreakdownResult | null
  baselineRows?: SimRow[]
  ghostOverlayRows?: SimRow[]
  ghostColor?: string
}) {
  const { ref, hasEntered, animationComplete } = useInViewAnimation({ duration: 1200 })
  // Bedragmaskering (ADR 0091) komt uit de hook, NIET uit een prop: de hook
  // heeft een fallback-context, dus het propcontract van dit component blijft
  // ongewijzigd en elke bestaande caller erft de fix zonder eigen wijziging.
  const { masked } = useMaskedAmounts()

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

  const [hoveredAge, setHoveredAge] = useState<number | null>(null)

  const W = containerW
  const isDesktop = containerW >= 768
  const isBreakdown = viewMode === 'breakdown' && breakdownResult != null
  const H = isBreakdown ? (isDesktop ? 220 : 160) : (isDesktop ? 150 : 120)
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const minAge = visibleMinAge ?? currentAge
  const maxAge = visibleMaxAge ?? endAge

  const xScale = useCallback(
    (age: number) => (maxAge > minAge ? ((age - minAge) / (maxAge - minAge)) * innerW : 0),
    [minAge, maxAge, innerW],
  )

  // Shared age-from-X resolver
  const resolveAge = useCallback((clientX: number, svgRect: DOMRect) => {
    const mouseX = ((clientX - svgRect.left) / svgRect.width) * W
    const relX = mouseX - PAD.left
    if (relX < 0 || relX > innerW) return null
    const age = Math.round(minAge + (relX / innerW) * (maxAge - minAge))
    return Math.max(minAge, Math.min(maxAge - 1, age))
  }, [W, innerW, minAge, maxAge])

  // Mouse hover handler
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!animationComplete) return
    const age = resolveAge(e.clientX, e.currentTarget.getBoundingClientRect())
    setHoveredAge(age)
  }, [animationComplete, resolveAge])

  // Touch handler for mobile
  const handleTouchMove = useCallback((e: React.TouchEvent<SVGSVGElement>) => {
    if (!animationComplete) return
    const touch = e.touches[0]
    if (!touch) return
    const age = resolveAge(touch.clientX, e.currentTarget.getBoundingClientRect())
    setHoveredAge(age)
  }, [animationComplete, resolveAge])

  const handleMouseLeave = useCallback(() => setHoveredAge(null), [])
  const handleTouchEnd = useCallback(() => setHoveredAge(null), [])

  const isPensioenMode = planningMode === 'pensioen'

  const svgHandlers = { handleMouseMove, handleMouseLeave, handleTouchMove, handleTouchEnd }

  if (isBreakdown) {
    return (
      <div ref={ref}>
        <BreakdownView
          breakdownResult={breakdownResult!}
          W={W} H={H} innerW={innerW} innerH={innerH}
          minAge={minAge} maxAge={maxAge}
          xScale={xScale}
          hasEntered={hasEntered}
          hoveredAge={hoveredAge}
          svgHandlers={svgHandlers}
          fireAge={fireAge}
          isPensioenMode={isPensioenMode}
          aowAgeFractional={aowAgeFractional}
          isDesktop={isDesktop}
          masked={masked}
        />
      </div>
    )
  }

  return (
    <div ref={ref}>
      <LinesView
        rows={rows}
        W={W} H={H} innerW={innerW} innerH={innerH}
        minAge={minAge} maxAge={maxAge}
        xScale={xScale}
        hasEntered={hasEntered}
        hoveredAge={hoveredAge}
        svgHandlers={svgHandlers}
        fireAge={fireAge}
        isPensioenMode={isPensioenMode}
        aowAgeFractional={aowAgeFractional}
        baselineRows={baselineRows}
        ghostOverlayRows={ghostOverlayRows}
        ghostColor={ghostColor}
        masked={masked}
      />
    </div>
  )
})

// ── Types ────────────────────────────────────────────────────────────────────

interface SvgHandlers {
  handleMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void
  handleMouseLeave: () => void
  handleTouchMove: (e: React.TouchEvent<SVGSVGElement>) => void
  handleTouchEnd: () => void
}

// ── Lines View (existing behavior) ──────────────────────────────────────────

function LinesView({
  rows, W, H, innerW, innerH, minAge, maxAge, xScale, hasEntered,
  hoveredAge, svgHandlers,
  fireAge, isPensioenMode, aowAgeFractional,
  baselineRows, ghostOverlayRows, ghostColor, masked,
}: {
  rows: SimRow[]
  W: number; H: number; innerW: number; innerH: number
  minAge: number; maxAge: number
  xScale: (age: number) => number
  hasEntered: boolean
  hoveredAge: number | null
  svgHandlers: SvgHandlers
  fireAge?: number | null
  isPensioenMode: boolean
  aowAgeFractional?: number
  baselineRows?: SimRow[]
  ghostOverlayRows?: SimRow[]
  ghostColor?: string
  /** Bedragmaskering (ADR 0091) — geometrie blijft, euro-LABELS verdwijnen. */
  masked: boolean
}) {
  const visibleRows = rows.filter(r => r.age >= minAge && r.age < maxAge)
  // EURO-WEERGAVE: `rows` (en `breakdownResult`/`ghostOverlayRows`) komen al omgezet
  // binnen uit het render-grensblok van `horizon-client.tsx` — chart-feed-regime (D4).
  // Dit component blijft euro-weergave-onwetend: het is een tekenmachine.
  const incomePts: [number, number][] = visibleRows.map(r => [r.age, r.flowIn])
  const expensePts: [number, number][] = visibleRows.map(r => [r.age, r.flowOut])

  const ghostInVals = (baselineRows ?? ghostOverlayRows ?? [])
    .filter(r => r.age >= minAge && r.age < maxAge)
    .flatMap(r => [r.flowIn, r.flowOut])
  const allVals = [
    ...incomePts.map(([, v]) => v),
    ...expensePts.map(([, v]) => v),
    ...ghostInVals,
  ]
  const rawMax = allVals.length > 0 ? Math.max(...allVals) : 1
  const maxVal = Math.max(rawMax, 1) * 1.08

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

  function buildAreaSegments(): { path: string; type: 'surplus' | 'deficit' }[] {
    if (incomePts.length < 2) return []
    const segments: { path: string; type: 'surplus' | 'deficit' }[] = []
    let segStart = 0

    for (let i = 0; i < incomePts.length; i++) {
      const isSurplus = incomePts[i][1] >= expensePts[i][1]
      const prevIsSurplus = i > 0 ? incomePts[i - 1][1] >= expensePts[i - 1][1] : isSurplus
      if (i > 0 && isSurplus !== prevIsSurplus) {
        pushSegment(segStart, i, prevIsSurplus ? 'surplus' : 'deficit')
        segStart = i - 1
      }
      if (i === incomePts.length - 1) {
        pushSegment(segStart, i + 1, isSurplus ? 'surplus' : 'deficit')
      }
    }

    function pushSegment(from: number, to: number, type: 'surplus' | 'deficit') {
      if (to - from < 1) return
      const topPts = incomePts.slice(from, to)
      const botPts = expensePts.slice(from, to)
      const upper = type === 'surplus' ? topPts : botPts
      const lower = type === 'surplus' ? botPts : topPts
      const fwd = upper.map(([age, val]) => `${(PAD.left + xScale(age)).toFixed(1)} ${(PAD.top + yScale(Math.max(val, 0))).toFixed(1)}`)
      const bwd = [...lower].reverse().map(([age, val]) => `${(PAD.left + xScale(age)).toFixed(1)} ${(PAD.top + yScale(Math.max(val, 0))).toFixed(1)}`)
      if (fwd.length < 1) return
      segments.push({ path: `M ${fwd[0]} ${fwd.slice(1).map(p => `L ${p}`).join(' ')} L ${bwd.join(' L ')} Z`, type })
    }
    return segments
  }

  const areaSegments = buildAreaSegments()
  const yTicks = [0, 0.33, 0.66, 1.0].map(f => ({ val: maxVal * f, y: PAD.top + yScale(maxVal * f) }))

  const totalAgeSpan = maxAge - minAge
  const xStep = totalAgeSpan <= 10 ? 1 : totalAgeSpan <= 20 ? 2 : totalAgeSpan <= 40 ? 5 : 10
  const xTickAges: number[] = []
  for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge; a += xStep) xTickAges.push(a)

  const hoveredRow = hoveredAge !== null ? visibleRows.find(r => r.age === hoveredAge) : null

  // Module-identiteit: inkomenslijn = horizon-accent, uitgavenlijn = kern-accent.
  // Volgt de instelbare kleur via de juiste --color-<module>-* tokens
  // (de oude --horizon-500/--kern-500 namen bestonden niet → viel altijd op de hex terug).
  const COLOR_INCOME = 'var(--color-horizon-500, #c4a06b)'
  const COLOR_EXPENSE = 'var(--color-kern-500, #6b4339)'

  const xFireLine = !isPensioenMode && fireAge != null && fireAge >= minAge && fireAge <= maxAge
    ? PAD.left + xScale(fireAge) : null
  const xAowLine = isPensioenMode && aowAgeFractional != null && aowAgeFractional >= minAge && aowAgeFractional <= maxAge
    ? PAD.left + xScale(aowAgeFractional) : null

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" overflow="hidden"
        role="img" aria-label="Grafiek met inkomen en uitgaven over tijd"
        onMouseMove={svgHandlers.handleMouseMove} onMouseLeave={svgHandlers.handleMouseLeave}
        onTouchMove={svgHandlers.handleTouchMove} onTouchEnd={svgHandlers.handleTouchEnd}>

        {yTicks.map(({ val, y }) => (
          <line key={val} x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y}
            stroke="var(--border-ed)" strokeWidth={1} strokeDasharray="4 4" />
        ))}
        {/* Y-as-labels — onder maskering VOLLEDIG weg (ADR 0091: "bullets op een
            as zijn ruis, geen informatie"). De gridlijnen hierboven blijven
            staan, dus de verhoudingen in de grafiek blijven leesbaar. */}
        {!masked && yTicks.map(({ val, y }) => (
          <text key={val} x={PAD.left - 5} y={y + 4} textAnchor="end" fontSize={9}
            fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">{fmtY(val, masked)}</text>
        ))}
        {xTickAges.map(age => (
          <text key={age} x={PAD.left + xScale(age)} y={H - 4} textAnchor="middle" fontSize={9}
            fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">{age}</text>
        ))}

        <line x1={PAD.left} x2={PAD.left + innerW} y1={PAD.top + yScale(0)} y2={PAD.top + yScale(0)}
          stroke="var(--border-md)" strokeWidth={1.5} />

        {areaSegments.map((seg, i) => (
          <path key={`area-${i}`} d={seg.path}
            fill={seg.type === 'surplus' ? COLOR_INCOME : COLOR_EXPENSE}
            opacity={hasEntered ? 0.1 : 0}
            style={{ transition: hasEntered ? 'opacity 0.6s ease 0.3s' : 'none' }} />
        ))}

        {/* Baseline ghost lines */}
        {baselineRows && baselineRows.length > 1 && (() => {
          const ghostVisible = baselineRows.filter(r => r.age >= minAge && r.age < maxAge)
          const ghostIncome = ghostVisible.map(r => [r.age, r.flowIn] as [number, number])
          const ghostExpense = ghostVisible.map(r => [r.age, r.flowOut] as [number, number])
          return (
            <>
              {ghostIncome.length > 1 && (
                <path d={pointsToPath(ghostIncome)} fill="none" stroke="var(--ink-4)" strokeWidth={1.5}
                  strokeDasharray="6 4" opacity={0.35} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {ghostExpense.length > 1 && (
                <path d={pointsToPath(ghostExpense)} fill="none" stroke="var(--ink-4)" strokeWidth={1.5}
                  strokeDasharray="6 4" opacity={0.35} strokeLinecap="round" strokeLinejoin="round" />
              )}
            </>
          )
        })()}

        {/* Scenario overlay ghost lines */}
        {ghostOverlayRows && ghostColor && ghostOverlayRows.length > 1 && (() => {
          const ghostVisible = ghostOverlayRows.filter(r => r.age >= minAge && r.age < maxAge)
          const ghostIncome = ghostVisible.map(r => [r.age, r.flowIn] as [number, number])
          const ghostExpense = ghostVisible.map(r => [r.age, r.flowOut] as [number, number])
          return (
            <>
              {ghostIncome.length > 1 && (
                <path d={pointsToPath(ghostIncome)} fill="none" stroke={ghostColor} strokeWidth={1.5}
                  strokeDasharray="6 4" opacity={0.4} strokeLinecap="round" strokeLinejoin="round" />
              )}
              {ghostExpense.length > 1 && (
                <path d={pointsToPath(ghostExpense)} fill="none" stroke={ghostColor} strokeWidth={1.5}
                  strokeDasharray="6 4" opacity={0.4} strokeLinecap="round" strokeLinejoin="round" />
              )}
            </>
          )
        })()}

        {incomePts.length > 1 && (
          <path d={pointsToPath(incomePts)} fill="none" stroke={COLOR_INCOME} strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)' : 'none' }} />
        )}
        {expensePts.length > 1 && (
          <path d={pointsToPath(expensePts)} fill="none" stroke={COLOR_EXPENSE} strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1) 0.15s' : 'none' }} />
        )}

        <RefLines xFireLine={xFireLine} xAowLine={xAowLine} fireAge={fireAge}
          isPensioenMode={isPensioenMode} aowAgeFractional={aowAgeFractional} innerH={innerH} />

        {hoveredAge !== null && hoveredRow && (() => {
          const hx = PAD.left + xScale(hoveredAge)
          const inc = hoveredRow.flowIn
          const exp = hoveredRow.flowOut
          const diff = inc - exp
          const tooltipW = 140
          const tooltipH = 52
          const tx = Math.max(PAD.left, Math.min(hx - tooltipW / 2, W - PAD.right - tooltipW))
          const ty = PAD.top + 4
          return (
            <g>
              <line x1={hx} x2={hx} y1={PAD.top} y2={PAD.top + innerH}
                stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
              <circle cx={hx} cy={PAD.top + yScale(Math.max(inc, 0))} r={3.5}
                fill={COLOR_INCOME} stroke="var(--paper)" strokeWidth={1.5} />
              <circle cx={hx} cy={PAD.top + yScale(Math.max(exp, 0))} r={3.5}
                fill={COLOR_EXPENSE} stroke="var(--paper)" strokeWidth={1.5} />
              <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={4} fill="var(--ink)" opacity={0.92} />
              <text x={tx + tooltipW / 2} y={ty + 13} textAnchor="middle" fontSize={8}
                fontWeight={600} fill="var(--paper)" fontFamily="var(--font-inter, sans-serif)">
                Leeftijd {hoveredAge}
              </text>
              <text x={tx + 6} y={ty + 26} fontSize={7.5} fill="var(--horizon-400, #c4a06b)" fontFamily="var(--font-dm-mono, monospace)">
                Aanvulling: {fmtY(inc, masked)}
              </text>
              <text x={tx + 6} y={ty + 37} fontSize={7.5} fill="var(--kern-400, #a07860)" fontFamily="var(--font-dm-mono, monospace)">
                Onttrekking: {fmtY(exp, masked)}
              </text>
              {/* Het losse `+` verdwijnt onder maskering (ADR 0091): de richting
                  staat al in het woord "groei"/"daling" ernaast. */}
              <text x={tx + 6} y={ty + 48} fontSize={7.5}
                fill={diff >= 0 ? 'var(--horizon-400, #c4a06b)' : 'var(--kern-400, #a07860)'}
                fontFamily="var(--font-dm-mono, monospace)" fontWeight={600}>
                {diff >= 0 && !masked ? '+' : ''}{fmtY(Math.abs(diff), masked)} {diff >= 0 ? 'netto groei' : 'netto daling'}
              </text>
            </g>
          )
        })()}
      </svg>

      <div className="mt-1 flex items-center justify-center gap-x-4 px-4" role="list" aria-label="Legenda aanvulling en onttrekking">
        <div className="flex items-center gap-1.5" role="listitem">
          <svg width="16" height="4" className="shrink-0" aria-hidden="true">
            <line x1="0" y1="2" x2="16" y2="2" stroke={COLOR_INCOME} strokeWidth={2} strokeLinecap="round" />
          </svg>
          <span className="text-[10px] font-medium text-[var(--ink-3)]">Aanvulling</span>
        </div>
        <div className="flex items-center gap-1.5" role="listitem">
          <svg width="16" height="4" className="shrink-0" aria-hidden="true">
            <line x1="0" y1="2" x2="16" y2="2" stroke={COLOR_EXPENSE} strokeWidth={2} strokeLinecap="round" />
          </svg>
          <span className="text-[10px] font-medium text-[var(--ink-3)]">Onttrekking</span>
        </div>
      </div>
    </>
  )
}

// ── Breakdown View (stacked butterfly bars) ─────────────────────────────────

function BreakdownView({
  breakdownResult, W, H, innerW, innerH, minAge, maxAge, xScale,
  hasEntered, hoveredAge, svgHandlers,
  fireAge, isPensioenMode, aowAgeFractional, isDesktop, masked,
}: {
  breakdownResult: BreakdownResult
  W: number; H: number; innerW: number; innerH: number
  minAge: number; maxAge: number
  xScale: (age: number) => number
  hasEntered: boolean
  hoveredAge: number | null
  svgHandlers: SvgHandlers
  fireAge?: number | null
  isPensioenMode: boolean
  aowAgeFractional?: number
  isDesktop: boolean
  /** Bedragmaskering (ADR 0091) — staafgeometrie blijft, euro-LABELS verdwijnen. */
  masked: boolean
}) {
  const { rows, incomeLayers, expenseLayers } = breakdownResult
  const visibleRows = rows.filter(r => r.age >= minAge && r.age < maxAge)

  // Build layer lookup maps
  const incomeColorMap = new Map(incomeLayers.map(l => [l.id, l.color]))
  const expenseColorMap = new Map(expenseLayers.map(l => [l.id, l.color]))

  // Compute Y range (max income up, max expenses down)
  let yMaxIncome = 0
  let yMaxExpense = 0
  for (const row of visibleRows) {
    if (row.totalIncome > yMaxIncome) yMaxIncome = row.totalIncome
    if (row.totalExpenses > yMaxExpense) yMaxExpense = row.totalExpenses
  }
  yMaxIncome = Math.max(yMaxIncome, 1) * 1.08
  yMaxExpense = Math.max(yMaxExpense, 1) * 1.08
  const yRange = yMaxIncome + yMaxExpense

  // Zero line Y position (proportional to income/expense ratio)
  const yZero = PAD.top + (yMaxIncome / yRange) * innerH

  const yScaleUp = (val: number) => (val / yRange) * innerH
  const yScaleDown = (val: number) => (val / yRange) * innerH

  // Bar dimensions
  const yearStep = innerW / Math.max(maxAge - minAge, 1)
  const barWidth = Math.max(2, yearStep * (isDesktop ? 0.85 : 0.75))

  // Y-axis ticks
  const yTicks: { val: number; y: number }[] = []
  const incomeSteps = [0.25, 0.5, 0.75, 1.0]
  for (const f of incomeSteps) {
    const val = yMaxIncome * f
    yTicks.push({ val, y: yZero - yScaleUp(val) })
  }
  yTicks.push({ val: 0, y: yZero })
  const expenseSteps = [0.5, 1.0]
  for (const f of expenseSteps) {
    const val = -yMaxExpense * f
    yTicks.push({ val, y: yZero + yScaleDown(yMaxExpense * f) })
  }

  // X-axis ticks
  const totalAgeSpan = maxAge - minAge
  const xStep = totalAgeSpan <= 10 ? 1 : totalAgeSpan <= 20 ? 2 : totalAgeSpan <= 40 ? 5 : 10
  const xTickAges: number[] = []
  for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge; a += xStep) xTickAges.push(a)

  // Tooltip data
  const hoveredRow = hoveredAge != null ? visibleRows.find(r => r.age === hoveredAge) : null

  // Reference lines
  const xFireLine = !isPensioenMode && fireAge != null && fireAge >= minAge && fireAge <= maxAge
    ? PAD.left + xScale(fireAge) : null
  const xAowLine = isPensioenMode && aowAgeFractional != null && aowAgeFractional >= minAge && aowAgeFractional <= maxAge
    ? PAD.left + xScale(aowAgeFractional) : null

  // Find first deficit age for label
  const firstDeficitAge = visibleRows.find(r => r.surplus < 0)?.age

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" overflow="hidden"
        aria-hidden="true"
        onMouseMove={svgHandlers.handleMouseMove} onMouseLeave={svgHandlers.handleMouseLeave}
        onTouchMove={svgHandlers.handleTouchMove} onTouchEnd={svgHandlers.handleTouchEnd}>

        {/* Grid lines */}
        {yTicks.map(({ val, y }) => (
          <line key={val} x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y}
            stroke="var(--border-ed)" strokeWidth={1} strokeDasharray="4 4" />
        ))}

        {/* Zero line */}
        <line x1={PAD.left} x2={PAD.left + innerW} y1={yZero} y2={yZero}
          stroke="var(--border-md)" strokeWidth={1.5} />

        {/* Y-axis labels — onder maskering volledig weg (ADR 0091); de gridlijnen
            en de nullijn hierboven blijven, dus de verhoudingen blijven leesbaar. */}
        {!masked && yTicks.map(({ val, y }) => (
          <text key={val} x={PAD.left - 5} y={y + 4} textAnchor="end" fontSize={9}
            fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">{fmtY(Math.abs(val), masked)}</text>
        ))}

        {/* X-axis labels */}
        {xTickAges.map(age => (
          <text key={age} x={PAD.left + xScale(age)} y={H - 4} textAnchor="middle" fontSize={9}
            fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">{age}</text>
        ))}

        {/* Danger zone background for deficit years */}
        {visibleRows.filter(r => r.surplus < 0).map(row => (
          <rect key={`dz-${row.age}`}
            x={PAD.left + xScale(row.age) - barWidth / 2 - 1}
            y={PAD.top}
            width={barWidth + 2}
            height={innerH}
            fill="var(--negative)"
            opacity={hasEntered ? 0.05 : 0}
            style={{ transition: hasEntered ? 'opacity 0.6s ease 0.5s' : 'none' }}
          />
        ))}

        {/* Danger zone label */}
        {firstDeficitAge != null && hasEntered && (
          <text
            x={PAD.left + xScale(firstDeficitAge)}
            y={PAD.top + 10}
            textAnchor="middle"
            fontSize={7}
            fill="var(--negative)"
            fontFamily="var(--font-inter, sans-serif)"
            fontWeight={600}
            opacity={0.7}
          >
            Tekort
          </text>
        )}

        {/* Stacked bars per age */}
        {visibleRows.map(row => {
          const x = PAD.left + xScale(row.age) - barWidth / 2
          const isHovered = hoveredAge === row.age
          const animProgress = hasEntered ? 1 : 0

          // Income bars stacked upward from zero
          let cumUp = 0
          const incomeBars = incomeLayers
            .map(layer => {
              const val = row.incomeBySource[layer.id] ?? 0
              if (val <= 0) return null
              const barH = yScaleUp(val)
              cumUp += barH
              return { id: layer.id, color: layer.color, y: yZero - cumUp, height: barH }
            })
            .filter(Boolean) as { id: string; color: string; y: number; height: number }[]

          // Expense bars stacked downward from zero
          let cumDown = 0
          const expenseBars = expenseLayers
            .map(layer => {
              const val = row.expenseBySource[layer.id] ?? 0
              if (val <= 0) return null
              const barH = yScaleDown(val)
              const y = yZero + cumDown
              cumDown += barH
              return { id: layer.id, color: layer.color, y, height: barH }
            })
            .filter(Boolean) as { id: string; color: string; y: number; height: number }[]

          return (
            <g key={row.age} opacity={hasEntered ? 1 : 0} style={{
              transition: hasEntered ? `opacity 0.4s ease ${Math.min((row.age - minAge) * 0.06, 0.8)}s` : 'none',
            }}>
              {/* Income bars (above zero) */}
              {incomeBars.map(bar => (
                <rect key={bar.id} x={x}
                  y={yZero - (yZero - bar.y) * animProgress}
                  width={barWidth}
                  height={bar.height * animProgress}
                  fill={bar.color}
                  opacity={isHovered ? 1 : 0.85}
                  rx={barWidth > 4 ? 1 : 0}
                  style={{ transition: 'opacity 150ms ease, y 0.8s cubic-bezier(.22,1,.36,1), height 0.8s cubic-bezier(.22,1,.36,1)' }}
                />
              ))}
              {/* Expense bars (below zero) */}
              {expenseBars.map(bar => (
                <rect key={bar.id} x={x}
                  y={yZero}
                  width={barWidth}
                  height={bar.height * animProgress}
                  fill={bar.color}
                  opacity={isHovered ? 1 : 0.85}
                  rx={barWidth > 4 ? 1 : 0}
                  style={{ transition: 'opacity 150ms ease, height 0.8s cubic-bezier(.22,1,.36,1)' }}
                />
              ))}
            </g>
          )
        })}

        {/* Reference lines */}
        <RefLines xFireLine={xFireLine} xAowLine={xAowLine} fireAge={fireAge}
          isPensioenMode={isPensioenMode} aowAgeFractional={aowAgeFractional} innerH={innerH} />

        {/* Hover tooltip */}
        {hoveredRow && hoveredAge != null && (() => {
          const hx = PAD.left + xScale(hoveredAge)
          const incomeItems = incomeLayers
            .map(l => ({ label: l.label, color: l.color, value: hoveredRow.incomeBySource[l.id] ?? 0 }))
            .filter(it => it.value > 0)
          const expenseItems = expenseLayers
            .map(l => ({ label: l.label, color: l.color, value: hoveredRow.expenseBySource[l.id] ?? 0 }))
            .filter(it => it.value > 0)

          const allItems = [...incomeItems, ...expenseItems]
          const lineH = 13
          const tooltipW = 160
          const sectionGap = (incomeItems.length > 0 && expenseItems.length > 0) ? lineH : 0
          const tooltipH = 32 + allItems.length * lineH + sectionGap + 16
          const rawX = hx - tooltipW / 2
          const tx = Math.max(PAD.left, Math.min(rawX, W - PAD.right - tooltipW))
          const ty = PAD.top + 4

          let yOff = 0
          return (
            <g>
              <line x1={hx} x2={hx} y1={PAD.top} y2={PAD.top + innerH}
                stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
              <rect x={tx} y={ty} width={tooltipW} height={tooltipH} rx={4} fill="var(--ink)" opacity={0.94} />

              {/* Age header */}
              <text x={tx + 8} y={ty + 14} fontSize={9} fontWeight={700}
                fill="var(--paper)" fontFamily="var(--font-inter, sans-serif)">
                Leeftijd {hoveredAge}
              </text>

              {/* Income items */}
              {incomeItems.map((item, i) => {
                const itemY = ty + 26 + i * lineH
                return (
                  <g key={`inc-${item.label}`}>
                    <rect x={tx + 8} y={itemY - 5} width={6} height={6} rx={1} fill={item.color} />
                    <text x={tx + 18} y={itemY} fontSize={8} fill="var(--paper)" fontFamily="var(--font-inter, sans-serif)">
                      {item.label}
                    </text>
                    <text x={tx + tooltipW - 8} y={itemY} textAnchor="end" fontSize={8}
                      fill="var(--paper)" fontFamily="var(--font-dm-mono, monospace)">
                      {fmtY(item.value, masked)}
                    </text>
                  </g>
                )
              })}

              {/* Expense items (with gap after income section) */}
              {expenseItems.map((item, i) => {
                yOff = incomeItems.length * lineH + sectionGap
                const itemY = ty + 26 + yOff + i * lineH
                return (
                  <g key={`exp-${item.label}`}>
                    <rect x={tx + 8} y={itemY - 5} width={6} height={6} rx={1} fill={item.color} />
                    <text x={tx + 18} y={itemY} fontSize={8} fill="var(--paper)" fontFamily="var(--font-inter, sans-serif)">
                      {item.label}
                    </text>
                    <text x={tx + tooltipW - 8} y={itemY} textAnchor="end" fontSize={8}
                      fill="var(--paper)" fontFamily="var(--font-dm-mono, monospace)">
                      {fmtY(item.value, masked)}
                    </text>
                  </g>
                )
              })}

              {/* Net total */}
              {(() => {
                const totalY = ty + 26 + incomeItems.length * lineH + sectionGap + expenseItems.length * lineH
                const surplus = hoveredRow.surplus
                return (
                  <g>
                    <line x1={tx + 8} x2={tx + tooltipW - 8} y1={totalY + 2} y2={totalY + 2}
                      stroke="var(--paper)" strokeWidth={0.5} opacity={0.3} />
                    <text x={tx + 8} y={totalY + 14} fontSize={8} fontWeight={700}
                      fill="var(--paper)" fontFamily="var(--font-inter, sans-serif)">
                      {surplus >= 0 ? 'Netto aanvulling' : 'Netto onttrekking'}
                    </text>
                    {/* Het losse +/− verdwijnt onder maskering (ADR 0091): de
                        richting staat al in het label "Netto aanvulling"/
                        "Netto onttrekking" ernaast. */}
                    <text x={tx + tooltipW - 8} y={totalY + 14} textAnchor="end" fontSize={8}
                      fontWeight={700} fill={surplus >= 0 ? '#c4b5fd' : '#fcd34d'}
                      fontFamily="var(--font-dm-mono, monospace)">
                      {masked ? '' : surplus >= 0 ? '+' : '-'}{fmtY(Math.abs(surplus), masked)}
                    </text>
                  </g>
                )
              })()}
            </g>
          )
        })()}
      </svg>

      {/* Legend: grouped by aanvulling / onttrekking */}
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4">
        {incomeLayers.length > 0 && (
          <span className="text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)] font-semibold">Aanvulling</span>
        )}
        {incomeLayers.map(l => (
          <div key={l.id} className="flex items-center gap-1.5">
            <div className="h-2 w-2.5 shrink-0" style={{ backgroundColor: l.color }} />
            <span className="text-[10px] font-medium text-[var(--ink-3)]">{l.label}</span>
          </div>
        ))}
        {expenseLayers.length > 0 && incomeLayers.length > 0 && (
          <span className="text-[9px] uppercase tracking-[0.08em] text-[var(--ink-4)] font-semibold ml-1">Onttrekking</span>
        )}
        {expenseLayers.map(l => (
          <div key={l.id} className="flex items-center gap-1.5">
            <div className="h-2 w-2.5 shrink-0" style={{ backgroundColor: l.color }} />
            <span className="text-[10px] font-medium text-[var(--ink-3)]">{l.label}</span>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Shared: Reference lines ─────────────────────────────────────────────────

function RefLines({
  xFireLine, xAowLine, fireAge, isPensioenMode, aowAgeFractional, innerH,
}: {
  xFireLine: number | null
  xAowLine: number | null
  fireAge?: number | null
  isPensioenMode: boolean
  aowAgeFractional?: number
  innerH: number
}) {
  return (
    <>
      {xFireLine !== null && (
        <g>
          <line x1={xFireLine} x2={xFireLine} y1={PAD.top} y2={PAD.top + innerH}
            stroke="var(--hor-t, #8a6e42)" strokeWidth={1.5} strokeDasharray="4 2" opacity={0.85} />
          <text x={xFireLine + 4} y={PAD.top + 10} fontSize={7}
            fill="var(--hor-t, #8a6e42)" fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
            FIRE {fireAge}
          </text>
        </g>
      )}
      {xAowLine !== null && aowAgeFractional != null && (
        <g>
          <line x1={xAowLine} x2={xAowLine} y1={PAD.top} y2={PAD.top + innerH}
            stroke="var(--hor-t, #8a6e42)" strokeWidth={1.8} strokeDasharray="4 2" opacity={0.85} />
          <text x={xAowLine - 4} y={PAD.top + 10} textAnchor="end" fontSize={7}
            fill="var(--hor-t, #8a6e42)" fontFamily="var(--font-inter, sans-serif)" fontWeight={600}>
            AOW
          </text>
          <text x={xAowLine - 4} y={PAD.top + 19} textAnchor="end" fontSize={7}
            fill="var(--hor-t, #8a6e42)" fontFamily="var(--font-dm-mono, monospace)" fontWeight={500}>
            {aowAgeFractional % 1 === 0
              ? `${aowAgeFractional}`
              : `${Math.floor(aowAgeFractional)}+${Math.round((aowAgeFractional % 1) * 12)}m`}
          </text>
        </g>
      )}
    </>
  )
}

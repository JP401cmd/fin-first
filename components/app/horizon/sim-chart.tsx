'use client'

import { useState, useEffect, memo } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { SimRow, SimCashflow } from '@/lib/fire-simulation'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import { NL_SWR, type ScenarioPath, type ProjectionMonth } from '@/lib/horizon-data'
import { CHART_PAD } from '@/lib/chart-constants'

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
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1200, forModal })
  const [hoveredCfId, setHoveredCfId] = useState<string | null>(null)

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
  const H = isDesktop ? 260 : 220
  const PAD = CHART_PAD
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
    ? Math.max(...monteCarloOverlay.p75.filter((_, i) => {
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

  // Build fractional FIRE junction point (interpolated between integer year boundaries)
  let fireFractionalPt: [number, number] | null = null
  if (fireAge !== null && fireAgeFractional !== null) {
    if (fireAge > currentAge) {
      const t = fireAgeFractional - (fireAge - 1)  // 0..1
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

  // Determine split point: AOW age in pensioen mode, FIRE age otherwise
  const splitAge = isPensioenMode ? (aowAgeFractional != null ? Math.ceil(aowAgeFractional) : null) : fireAge
  const splitFractionalPt = isPensioenMode ? aowFractionalPt : fireFractionalPt
  const splitFractionalAge = isPensioenMode ? aowAgeFractional ?? null : fireAgeFractional

  // Split at fractional point for two-colour rendering (opbouw = acc, pensioen/afbouw = dec)
  const accPts: [number, number][] = splitFractionalPt !== null && splitAge !== null
    ? [...allPts.filter(([age]) => age < splitAge), splitFractionalPt]
    : splitAge !== null
    ? allPts.filter(([age]) => age <= splitAge)
    : allPts
  const decPts: [number, number][] = splitFractionalPt !== null && splitAge !== null
    ? [splitFractionalPt, ...allPts.filter(([age]) => age > splitAge)]
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

  // Pre-compute Monte Carlo band SVG paths
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
    return {
      outer: bandPath(mc.p90, mc.p10),
      inner: bandPath(mc.p75, mc.p25),
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
      return { cf, x: PAD.left + xScale(cf.fromAge), y }
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

  return (
    <div ref={ref}>
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

        {/* Baseline ghost-line (what-if mode) — solid gray reference */}
        {baselinePts.length > 1 && (
          <path
            d={pointsToPath(baselinePts)}
            fill="none"
            stroke="var(--ink-4, #bbb8b0)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            opacity={0.55}
            style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)' : 'none' }}
          />
        )}

        {/* Monte Carlo percentile bands (furthest back layer) */}
        {mcPaths && (
          <g style={{
            opacity: hasEntered ? 1 : 0,
            transition: hasEntered ? 'opacity 0.6s ease 0.2s' : 'none',
          }}>
            {mcPaths.outer && <path d={mcPaths.outer} fill="var(--hor-t, #8a6e42)" opacity={0.07} />}
            {mcPaths.inner && <path d={mcPaths.inner} fill="var(--hor-t, #8a6e42)" opacity={0.1} />}
            {mcPaths.median && (
              <path d={mcPaths.median} fill="none"
                stroke="var(--hor-t, #8a6e42)" strokeWidth={1} strokeDasharray="4 3" opacity={0.4} />
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
            <circle cx={x} cy={y - 8} r={hoveredCfId === cf.id ? 6 : 4}
              fill={cf.direction === 'income' ? COLOR_OPBOUW : COLOR_AFBOUW}
              stroke="var(--paper)" strokeWidth={1} opacity={0.9}
              style={{ transition: 'r 150ms ease' }} />
            <text x={x} y={y - 16} textAnchor="middle" fontSize={7}
              fill={cf.direction === 'income' ? COLOR_OPBOUW : COLOR_AFBOUW}
              fontFamily="var(--font-inter, sans-serif)" fontWeight={500}>
              {cf.name.length > 8 ? cf.name.slice(0, 7) + '…' : cf.name}
            </text>
            {/* Amount label */}
            <text x={x} y={y - 24} textAnchor="middle" fontSize={7.5}
              fill={cf.direction === 'income' ? COLOR_OPBOUW : COLOR_AFBOUW}
              fontFamily="var(--font-dm-mono, monospace)" fontWeight={600}>
              {fmtAmount(cf.amount, cf.direction)}
            </text>

            {/* Hover tooltip with name, amount, freedom-time */}
            {hoveredCfId === cf.id && (
              <g>
                <rect
                  x={Math.max(PAD.left, Math.min(x - 65, W - PAD.right - 130))}
                  y={Math.max(PAD.top, y - 60)}
                  width={130} height={freedomDaysFor(cf.amount) ? 36 : 26}
                  rx={4} fill="var(--ink)" opacity={0.92}
                />
                <text
                  x={Math.max(PAD.left + 65, Math.min(x, W - PAD.right - 65))}
                  y={Math.max(PAD.top + 11, y - 48)}
                  textAnchor="middle" fontSize={8} fontWeight={600}
                  fill="var(--paper)" fontFamily="var(--font-inter, sans-serif)">
                  {cf.name}
                </text>
                <text
                  x={Math.max(PAD.left + 65, Math.min(x, W - PAD.right - 65))}
                  y={Math.max(PAD.top + 21, y - 37)}
                  textAnchor="middle" fontSize={7}
                  fill="var(--paper)" fontFamily="var(--font-dm-mono, monospace)">
                  {fmtAmount(cf.amount, cf.direction)} · leeftijd {cf.fromAge}
                </text>
                {freedomDaysFor(cf.amount) && (
                  <text
                    x={Math.max(PAD.left + 65, Math.min(x, W - PAD.right - 65))}
                    y={Math.max(PAD.top + 31, y - 27)}
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

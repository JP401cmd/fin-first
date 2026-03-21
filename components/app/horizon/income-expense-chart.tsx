'use client'

import { useState, useEffect, memo, useCallback } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { SimRow } from '@/lib/fire-simulation'

// ── IncomeExpenseChart ─────────────────────────────────────────────────────

export const IncomeExpenseChart = memo(function IncomeExpenseChart({
  rows,
  currentAge,
  endAge,
  visibleMinAge,
  visibleMaxAge,
  fireAge,
  planningMode = 'fire',
  aowAgeFractional,
}: {
  rows: SimRow[]
  currentAge: number
  endAge: number
  visibleMinAge?: number
  visibleMaxAge?: number
  /** FIRE age for reference line (hidden in pensioen mode) */
  fireAge?: number | null
  /** Planning mode: 'fire' (default) shows FIRE line, 'pensioen' shows AOW line */
  planningMode?: 'fire' | 'pensioen'
  /** AOW pension age as fractional value (e.g. 67.25 for 67j+3m) */
  aowAgeFractional?: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1200 })

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
  const H = isDesktop ? 150 : 120
  // Identical padding to SimChart for vertical alignment
  const PAD = { top: 16, right: 16, bottom: 28, left: 60 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const minAge = visibleMinAge ?? currentAge
  const maxAge = visibleMaxAge ?? endAge

  // Filter rows to visible range
  const visibleRows = rows.filter(r => r.age >= minAge && r.age < maxAge)

  // Build income/expense points from rows
  const incomePts: [number, number][] = visibleRows.map(r => [r.age, r.grossIncome])
  const expensePts: [number, number][] = visibleRows.map(r => [r.age, r.grossExpenses])

  // Y-axis: find max across both series
  const allVals = [...incomePts.map(([, v]) => v), ...expensePts.map(([, v]) => v)]
  const rawMax = allVals.length > 0 ? Math.max(...allVals) : 1
  const maxVal = Math.max(rawMax, 1) * 1.08

  const xScale = useCallback(
    (age: number) => (maxAge > minAge ? ((age - minAge) / (maxAge - minAge)) * innerW : 0),
    [minAge, maxAge, innerW],
  )
  const yScale = useCallback(
    (val: number) => innerH - (val / maxVal) * innerH,
    [innerH, maxVal],
  )

  function pointsToPath(pts: [number, number][]): string {
    return pts
      .map(([age, val], i) => {
        const x = PAD.left + xScale(age)
        const y = PAD.top + yScale(Math.max(val, 0))
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  }

  // Build filled area between the two lines, split by which is higher
  function buildAreaSegments(): { path: string; type: 'surplus' | 'deficit' }[] {
    if (incomePts.length < 2) return []

    const segments: { path: string; type: 'surplus' | 'deficit' }[] = []
    let segStart = 0

    for (let i = 0; i < incomePts.length; i++) {
      const isSurplus = incomePts[i][1] >= expensePts[i][1]
      const prevIsSurplus = i > 0 ? incomePts[i - 1][1] >= expensePts[i - 1][1] : isSurplus

      if (i > 0 && isSurplus !== prevIsSurplus) {
        // Close previous segment
        pushSegment(segStart, i, prevIsSurplus ? 'surplus' : 'deficit')
        segStart = i - 1 // overlap by 1 for smooth transition
      }

      if (i === incomePts.length - 1) {
        pushSegment(segStart, i + 1, isSurplus ? 'surplus' : 'deficit')
      }
    }

    function pushSegment(from: number, to: number, type: 'surplus' | 'deficit') {
      if (to - from < 1) return

      const topPts = incomePts.slice(from, to)
      const botPts = expensePts.slice(from, to)

      // Forward along top (income or expense, whichever is higher)
      const upper = type === 'surplus' ? topPts : botPts
      const lower = type === 'surplus' ? botPts : topPts

      const fwd = upper.map(([age, val]) => {
        const x = PAD.left + xScale(age)
        const y = PAD.top + yScale(Math.max(val, 0))
        return `${x.toFixed(1)} ${y.toFixed(1)}`
      })

      const bwd = [...lower].reverse().map(([age, val]) => {
        const x = PAD.left + xScale(age)
        const y = PAD.top + yScale(Math.max(val, 0))
        return `${x.toFixed(1)} ${y.toFixed(1)}`
      })

      if (fwd.length < 1) return
      const d = `M ${fwd[0]} ${fwd.slice(1).map(p => `L ${p}`).join(' ')} L ${bwd.join(' L ')} Z`
      segments.push({ path: d, type })
    }

    return segments
  }

  const areaSegments = buildAreaSegments()

  // Y-axis ticks (same style as SimChart)
  const yTicks = [0, 0.33, 0.66, 1.0].map(f => ({
    val: maxVal * f,
    y: PAD.top + yScale(maxVal * f),
  }))

  // X-axis ticks
  const totalAgeSpan = maxAge - minAge
  const xStep = totalAgeSpan <= 10 ? 1 : totalAgeSpan <= 20 ? 2 : totalAgeSpan <= 40 ? 5 : 10
  const xTickAges: number[] = []
  for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge; a += xStep) {
    xTickAges.push(a)
  }

  // Format currency for Y-axis
  function fmtY(val: number): string {
    if (val >= 1_000_000) return `€${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000) return `€${Math.round(val / 1_000)}k`
    if (val > 0) return `€${Math.round(val)}`
    return '€0'
  }

  // Tooltip data
  const hoveredRow = hoveredAge !== null ? visibleRows.find(r => r.age === hoveredAge) : null

  // Hover hit area: map mouse X to age
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * W
    const relX = mouseX - PAD.left
    if (relX < 0 || relX > innerW) {
      setHoveredAge(null)
      return
    }
    const age = Math.round(minAge + (relX / innerW) * (maxAge - minAge))
    const clamped = Math.max(minAge, Math.min(maxAge - 1, age))
    setHoveredAge(clamped)
  }

  const COLOR_INCOME = 'var(--horizon-500, #8b5cf6)'
  const COLOR_EXPENSE = 'var(--kern-500, #f59e0b)'
  const COLOR_SURPLUS = 'var(--horizon-500, #8b5cf6)'
  const COLOR_DEFICIT = 'var(--kern-500, #f59e0b)'

  const isPensioenMode = planningMode === 'pensioen'

  // FIRE reference line (hidden in pensioen mode)
  const xFireLine = !isPensioenMode && fireAge != null && fireAge >= minAge && fireAge <= maxAge
    ? PAD.left + xScale(fireAge)
    : null

  // AOW reference line (promoted in pensioen mode)
  const xAowLine = isPensioenMode && aowAgeFractional != null && aowAgeFractional >= minAge && aowAgeFractional <= maxAge
    ? PAD.left + xScale(aowAgeFractional)
    : null

  return (
    <div ref={ref}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        overflow="hidden"
        role="img"
        aria-label="Grafiek met inkomen en uitgaven over tijd"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredAge(null)}
      >
        {/* Grid lines */}
        {yTicks.map(({ val, y }) => (
          <line key={val} x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y}
            stroke="var(--border-ed)" strokeWidth={1} strokeDasharray="4 4" />
        ))}

        {/* Y-axis labels */}
        {yTicks.map(({ val, y }) => (
          <text key={val} x={PAD.left - 5} y={y + 4} textAnchor="end" fontSize={9}
            fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">
            {fmtY(val)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTickAges.map(age => (
          <text key={age} x={PAD.left + xScale(age)} y={H - 4} textAnchor="middle" fontSize={9}
            fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">{age}</text>
        ))}

        {/* Zero baseline */}
        <line x1={PAD.left} x2={PAD.left + innerW} y1={PAD.top + yScale(0)} y2={PAD.top + yScale(0)}
          stroke="var(--border-md)" strokeWidth={1.5} />

        {/* Filled area segments between income and expense lines */}
        {areaSegments.map((seg, i) => (
          <path
            key={`area-${i}`}
            d={seg.path}
            fill={seg.type === 'surplus' ? COLOR_SURPLUS : COLOR_DEFICIT}
            opacity={hasEntered ? 0.1 : 0}
            style={{ transition: hasEntered ? 'opacity 0.6s ease 0.3s' : 'none' }}
          />
        ))}

        {/* Income line */}
        {incomePts.length > 1 && (
          <path
            d={pointsToPath(incomePts)}
            fill="none"
            stroke={COLOR_INCOME}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)' : 'none' }}
          />
        )}

        {/* Expense line */}
        {expensePts.length > 1 && (
          <path
            d={pointsToPath(expensePts)}
            fill="none"
            stroke={COLOR_EXPENSE}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{ transition: hasEntered ? 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1) 0.15s' : 'none' }}
          />
        )}

        {/* FIRE reference line (hidden in pensioen mode) */}
        {xFireLine !== null && (
          <g>
            <line
              x1={xFireLine}
              x2={xFireLine}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--hor-t, #8a6e42)"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              opacity={0.85}
            />
            <text
              x={xFireLine + 4}
              y={PAD.top + 10}
              fontSize={7}
              fill="var(--hor-t, #8a6e42)"
              fontFamily="var(--font-inter, sans-serif)"
              fontWeight={600}
            >
              FIRE {fireAge}
            </text>
          </g>
        )}

        {/* AOW pensioenleeftijd line (promoted in pensioen mode) */}
        {xAowLine !== null && aowAgeFractional != null && (
          <g>
            <line
              x1={xAowLine}
              x2={xAowLine}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--hor-t, #8a6e42)"
              strokeWidth={1.8}
              strokeDasharray="4 2"
              opacity={0.85}
            />
            <text
              x={xAowLine - 4}
              y={PAD.top + 10}
              textAnchor="end"
              fontSize={7}
              fill="var(--hor-t, #8a6e42)"
              fontFamily="var(--font-inter, sans-serif)"
              fontWeight={600}
            >
              AOW
            </text>
            <text
              x={xAowLine - 4}
              y={PAD.top + 19}
              textAnchor="end"
              fontSize={7}
              fill="var(--hor-t, #8a6e42)"
              fontFamily="var(--font-dm-mono, monospace)"
              fontWeight={500}
            >
              {aowAgeFractional % 1 === 0
                ? `${aowAgeFractional}`
                : `${Math.floor(aowAgeFractional)}+${Math.round((aowAgeFractional % 1) * 12)}m`}
            </text>
          </g>
        )}

        {/* Hover vertical line + tooltip */}
        {hoveredAge !== null && hoveredRow && (() => {
          const hx = PAD.left + xScale(hoveredAge)
          const inc = hoveredRow.grossIncome
          const exp = hoveredRow.grossExpenses
          const diff = inc - exp
          const tooltipW = 140
          const tooltipH = 52
          // Position tooltip to avoid overflow
          const tx = Math.max(PAD.left, Math.min(hx - tooltipW / 2, W - PAD.right - tooltipW))
          const ty = PAD.top + 4

          return (
            <g>
              {/* Vertical hover line */}
              <line x1={hx} x2={hx} y1={PAD.top} y2={PAD.top + innerH}
                stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />

              {/* Income dot */}
              <circle cx={hx} cy={PAD.top + yScale(Math.max(inc, 0))} r={3.5}
                fill={COLOR_INCOME} stroke="var(--paper)" strokeWidth={1.5} />

              {/* Expense dot */}
              <circle cx={hx} cy={PAD.top + yScale(Math.max(exp, 0))} r={3.5}
                fill={COLOR_EXPENSE} stroke="var(--paper)" strokeWidth={1.5} />

              {/* Tooltip background */}
              <rect x={tx} y={ty} width={tooltipW} height={tooltipH}
                rx={4} fill="var(--ink)" opacity={0.92} />

              {/* Tooltip: age */}
              <text x={tx + tooltipW / 2} y={ty + 13} textAnchor="middle" fontSize={8}
                fontWeight={600} fill="var(--paper)" fontFamily="var(--font-inter, sans-serif)">
                Leeftijd {hoveredAge}
              </text>

              {/* Tooltip: income — color matches income line */}
              <text x={tx + 6} y={ty + 26} fontSize={7.5}
                fill="#c4b5fd" fontFamily="var(--font-dm-mono, monospace)">
                Inkomen: {fmtY(inc)}
              </text>

              {/* Tooltip: expenses — color matches expense line */}
              <text x={tx + 6} y={ty + 37} fontSize={7.5}
                fill="#fcd34d" fontFamily="var(--font-dm-mono, monospace)">
                Uitgaven: {fmtY(exp)}
              </text>

              {/* Tooltip: difference */}
              <text x={tx + 6} y={ty + 48} fontSize={7.5}
                fill={diff >= 0 ? '#c4b5fd' : '#fcd34d'}
                fontFamily="var(--font-dm-mono, monospace)" fontWeight={600}>
                {diff >= 0 ? '+' : ''}{fmtY(Math.abs(diff))} {diff >= 0 ? 'overschot' : 'tekort'}
              </text>
            </g>
          )
        })()}
      </svg>

      {/* Legend */}
      <div className="mt-1 flex items-center justify-center gap-x-4 px-4" role="list" aria-label="Legenda inkomen en uitgaven">
        <div className="flex items-center gap-1.5" role="listitem">
          <svg width="16" height="4" className="shrink-0" aria-hidden="true">
            <line x1="0" y1="2" x2="16" y2="2"
              stroke={COLOR_INCOME} strokeWidth={2} strokeLinecap="round" />
          </svg>
          <span className="text-[10px] font-medium text-[var(--ink-3)]">Inkomen</span>
        </div>
        <div className="flex items-center gap-1.5" role="listitem">
          <svg width="16" height="4" className="shrink-0" aria-hidden="true">
            <line x1="0" y1="2" x2="16" y2="2"
              stroke={COLOR_EXPENSE} strokeWidth={2} strokeLinecap="round" />
          </svg>
          <span className="text-[10px] font-medium text-[var(--ink-3)]">Uitgaven</span>
        </div>
      </div>
    </div>
  )
})

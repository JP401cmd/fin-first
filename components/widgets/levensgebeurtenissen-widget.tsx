'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData, TopLifeEvent } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatCurrency } from '@/lib/format'
import { Calendar } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// ── Colors matching SimChart ──────────────────────────────────────────────────
const COLOR_OPBOUW = 'var(--hor-t, #8a6e42)'
const COLOR_AFBOUW = 'var(--kern-t, #58362d)'
const COLOR_POS = '#10b981'
const COLOR_NEG = '#ef4444'

/** Linearly interpolate portfolio value at a fractional age. */
function interpAt(
  simRows: { age: number; endPortfolio: number }[],
  targetAge: number,
): number | null {
  if (simRows.length === 0) return null
  if (targetAge <= simRows[0].age) return simRows[0].endPortfolio
  if (targetAge >= simRows[simRows.length - 1].age)
    return simRows[simRows.length - 1].endPortfolio
  for (let i = 1; i < simRows.length; i++) {
    if (simRows[i].age >= targetAge) {
      const prev = simRows[i - 1]
      const curr = simRows[i]
      const t = (targetAge - prev.age) / (curr.age - prev.age)
      return prev.endPortfolio + t * (curr.endPortfolio - prev.endPortfolio)
    }
  }
  return null
}

/** Format large currency amounts compactly for SVG labels. */
function fmtCompact(val: number): string {
  if (val >= 1_000_000) return `€${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `€${Math.round(val / 1_000)}k`
  return `€${Math.round(val)}`
}

/** Build SVG path string from [age, value] tuples. */
function pointsToPath(
  pts: [number, number][],
  toX: (age: number) => number,
  toY: (val: number) => number,
): string {
  return pts
    .map(([age, val], i) => {
      const x = toX(age)
      const y = toY(Math.max(val, 0))
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

/** Filter events to those with a targetAge inside simRows range. */
function chartableEvents(
  events: TopLifeEvent[],
  simRows: { age: number }[],
): TopLifeEvent[] {
  if (simRows.length === 0) return []
  const minAge = simRows[0].age
  const maxAge = simRows[simRows.length - 1].age
  return events.filter(
    e => e.targetAge != null && e.targetAge >= minAge && e.targetAge <= maxAge,
  )
}

/** Build [age, portfolio] tuples from simRows (matching SimChart pattern). */
function buildPts(simRows: { age: number; endPortfolio: number; phase: string }[]): [number, number][] {
  if (simRows.length === 0) return []
  const pts: [number, number][] = [[simRows[0].age, simRows[0].endPortfolio]]
  for (const r of simRows.slice(1)) {
    pts.push([r.age, r.endPortfolio])
  }
  return pts
}

export const LevensgebeurtenissenWidget = memo(function LevensgebeurtenissenWidget({ size, data, href }: Props) {
  const { simRows, fireAgeFractional, topLifeEvents, lifeEvents } = data
  const { ref, hasEntered } = useInViewAnimation({ duration: 800 })

  // ── Mini-size: active event count ───────────────────────
  if (size === 'mini') {
    const activeCount = lifeEvents
    return (
      <WidgetShell module="horizon" size="mini" kicker="Levensgebeurtenissen" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {activeCount} actief
        </p>
      </WidgetShell>
    )
  }

  // ── Text fallback when no simRows ───────────────────────
  if (!simRows || simRows.length === 0) {
    return <TextFallback size={size} lifeEvents={lifeEvents} topLifeEvents={topLifeEvents} href={href} />
  }

  const events = chartableEvents(topLifeEvents, simRows)
  const allPts = buildPts(simRows)
  const minAge = simRows[0].age
  const maxAge = simRows[simRows.length - 1].age
  const ageSpan = maxAge - minAge || 1

  // Find FIRE age boundary row index for split
  const fireIdx = fireAgeFractional != null
    ? simRows.findIndex(r => r.age >= fireAgeFractional)
    : -1

  // Split points at FIRE for two-color rendering
  const accPts = fireIdx > 0 ? allPts.slice(0, fireIdx + 1) : (fireIdx === -1 ? allPts : allPts)
  const decPts = fireIdx > 0 ? allPts.slice(fireIdx) : []

  // ── Quarter: mini sparkline ─────────────────────────────
  if (size === 'quarter') {
    const W = 120
    const H = 44
    const PAD = { top: 3, right: 3, bottom: 3, left: 3 }
    const innerW = W - PAD.left - PAD.right
    const innerH = H - PAD.top - PAD.bottom
    const rawMax = Math.max(...allPts.map(([, v]) => v), 1)
    const maxVal = rawMax * 1.08
    const toX = (age: number) => PAD.left + ((age - minAge) / ageSpan) * innerW
    const toY = (val: number) => PAD.top + innerH - (val / maxVal) * innerH

    const pathD = allPts.length > 1 ? pointsToPath(allPts, toX, toY) : ''

    return (
      <WidgetShell module="horizon" size={size} kicker="Levensgebeurtenissen" href={href}>
        <div ref={ref}>
          <svg
            width="100%"
            viewBox={`0 0 ${W} ${H}`}
            className="overflow-visible"
            aria-label="Levensgebeurtenissen sparkline"
          >
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke={COLOR_OPBOUW}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset={hasEntered ? 0 : 1}
                style={{
                  transition: hasEntered
                    ? 'stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)'
                    : 'none',
                }}
              />
            )}
            {/* Event dots on path */}
            {events.map((evt, i) => {
              const portfolio = interpAt(simRows, evt.targetAge!)
              if (portfolio == null) return null
              return (
                <circle
                  key={evt.id}
                  cx={toX(evt.targetAge!)}
                  cy={toY(portfolio)}
                  r="2.5"
                  fill={evt.impactType === 'positive' ? COLOR_POS : COLOR_NEG}
                  stroke="white"
                  strokeWidth="0.8"
                  style={{
                    opacity: hasEntered ? 1 : 0,
                    transition: `opacity 200ms ease ${500 + i * 60}ms`,
                  }}
                />
              )
            })}
            {/* FIRE dot */}
            {fireAgeFractional != null && fireAgeFractional >= minAge && fireAgeFractional <= maxAge && (
              <circle
                cx={toX(fireAgeFractional)}
                cy={toY(interpAt(simRows, fireAgeFractional) ?? 0)}
                r="3"
                fill={COLOR_OPBOUW}
                stroke="white"
                strokeWidth="1"
                style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 300ms ease 500ms' }}
              />
            )}
          </svg>
          <p className="text-[10px] text-[var(--ink-3)] mt-0.5">
            {events.length} {events.length === 1 ? 'event' : 'events'}
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── Shared setup for half + full ────────────────────────
  const rawMax = Math.max(...allPts.map(([, v]) => v), 1)
  const maxVal = rawMax * 1.08

  // ── Half: compact chart that fits vertically ───────────
  if (size === 'half') {
    const W = 280
    const H = 110
    const PAD = { top: 6, right: 6, bottom: 13, left: 30 }
    const innerW = W - PAD.left - PAD.right
    const innerH = H - PAD.top - PAD.bottom

    const toX = (age: number) => PAD.left + ((age - minAge) / ageSpan) * innerW
    const toY = (val: number) => PAD.top + innerH - (val / maxVal) * innerH

    // Y-axis ticks (3 ticks for compact view)
    const yTicks = [0, 0.5, 1.0].map(f => ({ val: maxVal * f, y: toY(maxVal * f) }))
    // X-axis age ticks
    const xStep = ageSpan <= 40 ? 10 : 20
    const xTicks: number[] = []
    for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge; a += xStep) xTicks.push(a)

    const fireX = fireAgeFractional != null ? toX(fireAgeFractional) : null

    // Row-stacking for event labels
    const MIN_X_GAP = 22
    const ROW_H = 7
    const evtXs = events.map(e => toX(e.targetAge!))
    const rows: number[] = []
    for (let i = 0; i < events.length; i++) {
      let row = 0
      for (let j = 0; j < i; j++) {
        if (rows[j] === row && Math.abs(evtXs[i] - evtXs[j]) < MIN_X_GAP) { row++; j = -1 }
      }
      rows.push(row)
    }

    return (
      <WidgetShell module="horizon" size={size} kicker="Levensgebeurtenissen" href={href}>
        <div ref={ref} className="mt-0.5">
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible" aria-label="Levensgebeurtenissen vermogenspad">
            {/* Grid */}
            {yTicks.map(({ val, y }) => (
              <line key={val} x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y}
                stroke="var(--border-ed)" strokeWidth="0.5" strokeDasharray="3 3" />
            ))}
            {/* Y-axis labels */}
            {yTicks.filter(t => t.val > 0).map(({ val, y }) => (
              <text key={val} x={PAD.left - 2} y={y + 2.5} textAnchor="end" fontSize="5"
                fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">
                {fmtCompact(val)}
              </text>
            ))}
            {/* X-axis labels */}
            {xTicks.map(age => (
              <text key={age} x={toX(age)} y={H - 2} textAnchor="middle" fontSize="5"
                fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">
                {age}
              </text>
            ))}
            {/* Zero baseline */}
            <line x1={PAD.left} x2={PAD.left + innerW} y1={toY(0)} y2={toY(0)}
              stroke="var(--border-md)" strokeWidth="1" />

            {/* Accumulation path */}
            {accPts.length > 1 && (
              <path d={pointsToPath(accPts, toX, toY)} fill="none"
                stroke={COLOR_OPBOUW} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                pathLength={1} strokeDasharray="1" strokeDashoffset={hasEntered ? 0 : 1}
                style={{ transition: hasEntered ? 'stroke-dashoffset 800ms cubic-bezier(.22,1,.36,1)' : 'none' }}
              />
            )}
            {/* Decumulation path */}
            {decPts.length > 1 && (
              <path d={pointsToPath(decPts, toX, toY)} fill="none"
                stroke={COLOR_AFBOUW} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                pathLength={1} strokeDasharray="1" strokeDashoffset={hasEntered ? 0 : 1}
                style={{ transition: hasEntered ? 'stroke-dashoffset 800ms cubic-bezier(.22,1,.36,1) 0.1s' : 'none' }}
              />
            )}
            {/* No FIRE: grey single line */}
            {fireIdx === -1 && allPts.length > 1 && (
              <path d={pointsToPath(allPts, toX, toY)} fill="none"
                stroke="var(--ink-3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                pathLength={1} strokeDasharray="1" strokeDashoffset={hasEntered ? 0 : 1}
                style={{ transition: hasEntered ? 'stroke-dashoffset 800ms cubic-bezier(.22,1,.36,1)' : 'none' }}
              />
            )}

            {/* FIRE vertical + dot */}
            {fireX != null && fireAgeFractional != null && (
              <>
                <line x1={fireX} y1={PAD.top} x2={fireX} y2={PAD.top + innerH}
                  stroke={COLOR_OPBOUW} strokeWidth="1" strokeDasharray="2.5 2"
                  style={{ opacity: hasEntered ? 0.7 : 0, transition: 'opacity 300ms ease 700ms' }}
                />
                <circle cx={fireX} cy={toY(interpAt(simRows, fireAgeFractional) ?? 0)}
                  r="3" fill={COLOR_OPBOUW} stroke="white" strokeWidth="0.8"
                  style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 300ms ease 750ms' }}
                />
              </>
            )}

            {/* Event markers */}
            {events.map((evt, i) => {
              const portfolio = interpAt(simRows, evt.targetAge!)
              if (portfolio == null) return null
              const cx = toX(evt.targetAge!)
              const cy = toY(portfolio)
              const row = rows[i] ?? 0
              const name = evt.name.length > 8 ? evt.name.slice(0, 7) + '…' : evt.name
              return (
                <g key={evt.id} style={{
                  opacity: hasEntered ? 1 : 0,
                  transition: `opacity 200ms ease ${700 + i * 80}ms`,
                }}>
                  <circle cx={cx} cy={cy} r="3" fill="white" />
                  <circle cx={cx} cy={cy} r="2.4"
                    fill={evt.impactType === 'positive' ? COLOR_POS : COLOR_NEG} />
                  <text x={cx} y={cy + 7 + row * ROW_H} textAnchor="middle" fontSize="5"
                    fontWeight="500" fill="var(--ink-3)" fontFamily="var(--font-inter, sans-serif)">
                    {name}
                  </text>
                </g>
              )
            })}
          </svg>
          <div className="flex items-center justify-between">
            <p className="text-[9px] text-[var(--ink-4)] font-mono">{minAge}j — {maxAge}j</p>
            {fireAgeFractional != null && (
              <p className="text-[9px] font-mono font-semibold" style={{ color: COLOR_OPBOUW }}>
                FIRE {Math.round(fireAgeFractional)}j
              </p>
            )}
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full: detailed chart matching SimChart style ─────────
  const W = 280
  const H = 130
  const PAD = { top: 10, right: 8, bottom: 16, left: 34 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const toX = (age: number) => PAD.left + ((age - minAge) / ageSpan) * innerW
  const toY = (val: number) => PAD.top + innerH - (val / maxVal) * innerH

  // Y-axis (4 ticks like SimChart)
  const yTicks = [0, 0.33, 0.66, 1.0].map(f => ({ val: maxVal * f, y: toY(maxVal * f) }))
  // X-axis
  const xStep = ageSpan <= 40 ? 10 : 20
  const xTicks: number[] = []
  for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge; a += xStep) xTicks.push(a)

  const fireX = fireAgeFractional != null ? toX(fireAgeFractional) : null

  // Row-stacking for event labels (above markers)
  const MIN_X_GAP = 32
  const ROW_H = 10
  const evtXs = events.map(e => toX(e.targetAge!))
  const rows: number[] = []
  for (let i = 0; i < events.length; i++) {
    let row = 0
    for (let j = 0; j < i; j++) {
      if (rows[j] === row && Math.abs(evtXs[i] - evtXs[j]) < MIN_X_GAP) { row++; j = -1 }
    }
    rows.push(row)
  }

  // Cumulative impact
  const cumulativeImpact = topLifeEvents.reduce((sum, evt) => {
    if (evt.estimatedImpact == null) return sum
    return sum + (evt.impactType === 'positive' ? evt.estimatedImpact : -evt.estimatedImpact)
  }, 0)

  return (
    <WidgetShell module="horizon" size={size} kicker="Levensgebeurtenissen" href={href}>
      <div ref={ref} className="mt-1">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible"
          aria-label="Levensgebeurtenissen op vermogenspad">
          {/* Grid (dashed, matching SimChart) */}
          {yTicks.map(({ val, y }) => (
            <line key={val} x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y}
              stroke="var(--border-ed)" strokeWidth="0.5" strokeDasharray="3 3" />
          ))}
          {/* Y-axis labels */}
          {yTicks.filter(t => t.val > 0).map(({ val, y }) => (
            <text key={val} x={PAD.left - 3} y={y + 3} textAnchor="end" fontSize="6"
              fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">
              {fmtCompact(val)}
            </text>
          ))}
          {/* X-axis labels */}
          {xTicks.map(age => (
            <text key={age} x={toX(age)} y={H - 2} textAnchor="middle" fontSize="6"
              fill="var(--ink-4)" fontFamily="var(--font-dm-mono, monospace)">
              {age}
            </text>
          ))}
          {/* Zero baseline */}
          <line x1={PAD.left} x2={PAD.left + innerW} y1={toY(0)} y2={toY(0)}
            stroke="var(--border-md)" strokeWidth="1" />

          {/* Accumulation path */}
          {accPts.length > 1 && (
            <path d={pointsToPath(accPts, toX, toY)} fill="none"
              stroke={COLOR_OPBOUW} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              pathLength={1} strokeDasharray="1" strokeDashoffset={hasEntered ? 0 : 1}
              style={{ transition: hasEntered ? 'stroke-dashoffset 800ms cubic-bezier(.22,1,.36,1)' : 'none' }}
            />
          )}
          {/* Decumulation path */}
          {decPts.length > 1 && (
            <path d={pointsToPath(decPts, toX, toY)} fill="none"
              stroke={COLOR_AFBOUW} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              pathLength={1} strokeDasharray="1" strokeDashoffset={hasEntered ? 0 : 1}
              style={{ transition: hasEntered ? 'stroke-dashoffset 800ms cubic-bezier(.22,1,.36,1) 0.1s' : 'none' }}
            />
          )}
          {/* No FIRE: grey single line */}
          {fireIdx === -1 && allPts.length > 1 && (
            <path d={pointsToPath(allPts, toX, toY)} fill="none"
              stroke="var(--ink-3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              pathLength={1} strokeDasharray="1" strokeDashoffset={hasEntered ? 0 : 1}
              style={{ transition: hasEntered ? 'stroke-dashoffset 800ms cubic-bezier(.22,1,.36,1)' : 'none' }}
            />
          )}

          {/* FIRE dashed vertical + dot + label */}
          {fireX != null && fireAgeFractional != null && (
            <>
              <line x1={fireX} y1={PAD.top} x2={fireX} y2={PAD.top + innerH}
                stroke={COLOR_OPBOUW} strokeWidth="1" strokeDasharray="2.5 2"
                style={{ opacity: hasEntered ? 0.75 : 0, transition: 'opacity 300ms ease 700ms' }}
              />
              <circle cx={fireX} cy={toY(interpAt(simRows, fireAgeFractional) ?? 0)}
                r="4" fill={COLOR_OPBOUW} stroke="white" strokeWidth="1.2"
                style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 300ms ease 750ms' }}
              />
              <text x={fireX + 3} y={PAD.top + 10} fontSize="6" fontWeight="600"
                fill={COLOR_OPBOUW} fontFamily="var(--font-inter, sans-serif)"
                style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 300ms ease 800ms' }}>
                FIRE {fireAgeFractional.toFixed(1)}
              </text>
            </>
          )}

          {/* Event markers on path */}
          {events.map((evt, i) => {
            const portfolio = interpAt(simRows, evt.targetAge!)
            if (portfolio == null) return null
            const cx = toX(evt.targetAge!)
            const cy = toY(portfolio)
            const row = rows[i] ?? 0
            const isPos = evt.impactType === 'positive'
            const name = evt.name.length > 10 ? evt.name.slice(0, 9) + '…' : evt.name
            const impactLabel = evt.estimatedImpact != null && evt.estimatedImpact > 0
              ? `${isPos ? '+' : '−'}${fmtCompact(evt.estimatedImpact)}`
              : null

            return (
              <g key={evt.id} style={{
                opacity: hasEntered ? 1 : 0,
                transition: `opacity 200ms ease ${750 + i * 80}ms`,
              }}>
                {/* White border dot */}
                <circle cx={cx} cy={cy} r="4" fill="white" />
                <circle cx={cx} cy={cy} r="3.2"
                  fill={isPos ? COLOR_POS : COLOR_NEG} />
                {/* Name label above */}
                <text x={cx} y={cy - 8 - row * ROW_H} textAnchor="middle" fontSize="5.5"
                  fontWeight="500" fill="var(--ink-2)" fontFamily="var(--font-inter, sans-serif)">
                  {name}
                </text>
                {/* Impact amount above name */}
                {impactLabel && (
                  <text x={cx} y={cy - 15 - row * ROW_H} textAnchor="middle" fontSize="5"
                    fontWeight="600" fill={isPos ? COLOR_POS : COLOR_NEG}
                    fontFamily="var(--font-dm-mono, monospace)">
                    {impactLabel}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Cumulative impact summary */}
        {topLifeEvents.length > 0 && cumulativeImpact !== 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-[var(--border-ed)] flex items-baseline justify-between">
            <p className="text-[11px] text-[var(--ink-3)]">Cumulatieve impact</p>
            <p className={`font-mono text-xs font-semibold tabular-nums ${cumulativeImpact > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {cumulativeImpact > 0 ? '+' : '−'}{formatCurrency(Math.abs(cumulativeImpact))}
            </p>
          </div>
        )}

        {events.length === 0 && topLifeEvents.length === 0 && (
          <p className="mt-1.5 text-xs text-[var(--ink-3)]">Geen life events gepland</p>
        )}
      </div>
    </WidgetShell>
  )
})

// ── Text fallback (no simRows available) ──────────────────
function TextFallback({
  size,
  lifeEvents,
  topLifeEvents,
  href,
}: {
  size: WidgetSize
  lifeEvents: number
  topLifeEvents: TopLifeEvent[]
  href?: string
}) {
  if (size === 'quarter') {
    return (
      <WidgetShell module="horizon" size={size} kicker="Levensgebeurtenissen" href={href}>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-horizon-500 shrink-0" />
          <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">{lifeEvents}</p>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
          {lifeEvents === 1 ? 'life event' : 'life events'} gepland
        </p>
        {topLifeEvents?.[0] && (
          <p className="mt-1 text-[11px] font-medium text-[var(--ink-2)] truncate">
            Volgende: {topLifeEvents[0].name}
          </p>
        )}
      </WidgetShell>
    )
  }

  if (size === 'half') {
    const evts = topLifeEvents?.slice(0, 3) ?? []
    return (
      <WidgetShell module="horizon" size={size} kicker="Levensgebeurtenissen" href={href}>
        {evts.length > 0 ? (
          <div className="relative pl-4">
            <div className="absolute left-[5px] top-1 bottom-1 w-px bg-horizon-300/50" />
            <div className="flex flex-col gap-1.5">
              {evts.map(evt => (
                <div key={evt.id} className="relative flex items-center gap-2">
                  <div className="absolute -left-4 top-1 h-2 w-2 rounded-full border-2 border-horizon-400 bg-[var(--paper)]" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {evt.year && (
                        <span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">{evt.year}</span>
                      )}
                      <span className="text-[11px] font-medium text-[var(--ink-2)] truncate">{evt.name}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 text-[11px] font-semibold ${evt.impactType === 'positive' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {evt.impactType === 'positive' ? '↑' : '↓'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--ink-3)]">Geen life events gepland</p>
        )}
        <p className="mt-1 text-[10px] text-[var(--ink-3)]">
          {lifeEvents} {lifeEvents === 1 ? 'life event' : 'life events'} totaal
        </p>
      </WidgetShell>
    )
  }

  // Full text fallback
  const allEvents = topLifeEvents?.slice(0, 5) ?? []
  const cumulativeImpact = allEvents.reduce((sum, evt) => {
    if (evt.estimatedImpact == null) return sum
    return sum + (evt.impactType === 'positive' ? evt.estimatedImpact : -evt.estimatedImpact)
  }, 0)

  return (
    <WidgetShell module="horizon" size={size} kicker="Levensgebeurtenissen" href={href}>
      <div className="flex items-center gap-2 mb-3">
        <Calendar className="h-4 w-4 text-horizon-500 shrink-0" />
        <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">{lifeEvents}</p>
        <p className="text-sm text-[var(--ink-3)]">
          {lifeEvents === 1 ? 'life event' : 'life events'} gepland
        </p>
      </div>
      {allEvents.length > 0 ? (
        <div className="relative pl-4">
          <div className="absolute left-[5px] top-1 bottom-1 w-px bg-horizon-300/40" />
          <div className="flex flex-col gap-3">
            {allEvents.map(evt => {
              const isPos = evt.impactType === 'positive'
              return (
                <div key={evt.id} className="relative flex items-start gap-2">
                  <div className={`absolute -left-4 top-1 h-2.5 w-2.5 rounded-full border-2 ${isPos ? 'border-emerald-500 bg-emerald-100' : 'border-red-400 bg-red-100'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {evt.year && (
                        <span className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">{evt.year}</span>
                      )}
                      <span className="text-xs font-medium text-[var(--ink-2)] truncate">{evt.name}</span>
                    </div>
                    {evt.estimatedImpact != null && evt.estimatedImpact > 0 && (
                      <p className={`mt-0.5 font-mono text-[11px] tabular-nums ${isPos ? 'text-emerald-600' : 'text-red-500'}`}>
                        {isPos ? '+' : '−'}{formatCurrency(evt.estimatedImpact)}
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${isPos ? 'text-emerald-600' : 'text-red-500'}`}>
                    {isPos ? '↑' : '↓'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--ink-3)]">Geen life events gepland</p>
      )}
      {allEvents.length > 0 && cumulativeImpact !== 0 && (
        <div className="mt-3 pt-2 border-t border-[var(--border-ed)]">
          <p className="text-[11px] text-[var(--ink-3)]">Cumulatieve impact op FIRE</p>
          <p className={`font-mono text-sm font-semibold tabular-nums ${cumulativeImpact > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {cumulativeImpact > 0 ? '+' : '−'}{formatCurrency(Math.abs(cumulativeImpact))}
          </p>
        </div>
      )}
    </WidgetShell>
  )
}

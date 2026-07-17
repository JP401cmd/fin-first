'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData, TopLifeEvent } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { MaskedAmount } from '@/components/app/masked-amount'
import { Calendar, TrendingUp, Heart, ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// ── Colors matching SimChart ──────────────────────────────────────────────────
const COLOR_OPBOUW = 'var(--color-horizon-700)'
const COLOR_POS = 'var(--positive)'
const COLOR_NEG = 'var(--negative)'

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
                  stroke="var(--paper)"
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
                stroke="var(--paper)"
                strokeWidth="1"
                style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 300ms ease 500ms' }}
              />
            )}
          </svg>
          <p className="text-[10px] text-[var(--ink-3)] mt-0.5">
            {events.length} {events.length === 1 ? 'gebeurtenis' : 'gebeurtenissen'}
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── Split events by impact type for two-column layouts ──
  const opbouwEvents = topLifeEvents.filter(e => e.impactType === 'positive')
  const investerenEvents = topLifeEvents.filter(e => e.impactType === 'negative')

  // ── Half: two-column opbouwen/investeren ──────────────
  if (size === 'half') {
    const opSlice = opbouwEvents.slice(0, 3)
    const invSlice = investerenEvents.slice(0, 3)
    const opTotal = opSlice.reduce((s, e) => s + (e.estimatedImpact ?? 0), 0)
    const invTotal = invSlice.reduce((s, e) => s + (e.estimatedImpact ?? 0), 0)

    return (
      <WidgetShell module="horizon" size={size} kicker="Levensgebeurtenissen" href={href}>
        <div ref={ref} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Opbouwen column */}
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <ArrowUpRight className="h-3 w-3 text-positive" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-positive">Opbouwen</span>
            </div>
            {opSlice.length > 0 ? (
              <div className="space-y-1">
                {opSlice.map(evt => (
                  <div key={evt.id} className="flex items-baseline justify-between gap-1 min-h-[44px] sm:min-h-0">
                    <span className="text-[11px] text-[var(--ink-2)] truncate">{evt.name}</span>
                    {evt.estimatedImpact != null && evt.estimatedImpact > 0 && (
                      <span className="shrink-0 font-mono text-[11px] sm:text-xs tabular-nums text-positive">
                        +{fmtCompact(evt.estimatedImpact)}
                      </span>
                    )}
                  </div>
                ))}
                {opTotal > 0 && (
                  <div className="pt-1 border-t border-positive/40">
                    <span className="font-mono text-[11px] sm:text-xs tabular-nums font-semibold text-positive">
                      +{fmtCompact(opTotal)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-[var(--ink-4)] italic">Geen events</p>
            )}
          </div>
          {/* Investeren column */}
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <ArrowDownRight className="h-3 w-3 text-negative" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-negative">Investeren</span>
            </div>
            {invSlice.length > 0 ? (
              <div className="space-y-1">
                {invSlice.map(evt => (
                  <div key={evt.id} className="flex items-baseline justify-between gap-1 min-h-[44px] sm:min-h-0">
                    <span className="text-[11px] text-[var(--ink-2)] truncate">{evt.name}</span>
                    {evt.estimatedImpact != null && evt.estimatedImpact > 0 && (
                      <span className="shrink-0 font-mono text-[11px] sm:text-xs tabular-nums text-negative">
                        -{fmtCompact(evt.estimatedImpact)}
                      </span>
                    )}
                  </div>
                ))}
                {invTotal > 0 && (
                  <div className="pt-1 border-t border-negative/40">
                    <span className="font-mono text-[11px] sm:text-xs tabular-nums font-semibold text-negative">
                      -{fmtCompact(invTotal)}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-[var(--ink-4)] italic">Geen events</p>
            )}
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full: rich two-column opbouwen/investeren ──────────
  const opSliceFull = opbouwEvents.slice(0, 4)
  const invSliceFull = investerenEvents.slice(0, 4)
  const opTotalFull = opbouwEvents.reduce((s, e) => s + (e.estimatedImpact ?? 0), 0)
  const invTotalFull = investerenEvents.reduce((s, e) => s + (e.estimatedImpact ?? 0), 0)

  return (
    <WidgetShell module="horizon" size={size} kicker="Levensgebeurtenissen" href={href}>
      <div ref={ref} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Opbouwen column */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <ArrowUpRight className="h-3.5 w-3.5 text-positive" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-positive">Vrijheid opbouwen</span>
          </div>
          {opTotalFull > 0 && (
            <p className="text-positive mb-2">
              <MaskedAmount value={opTotalFull} signPrefix="+" tone="horizon" className="text-sm font-semibold" />
            </p>
          )}
          {opSliceFull.length > 0 ? (
            <div className="space-y-1.5">
              {opSliceFull.map(evt => (
                <div key={evt.id} className="flex items-start gap-1.5 min-h-[44px] md:min-h-0">
                  <div className="mt-1 h-1.5 w-1.5 rounded-full bg-positive shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[11px] sm:text-xs text-[var(--ink-2)] font-medium truncate">{evt.name}</span>
                      {evt.targetAge != null && (
                        <span className="shrink-0 font-mono text-[10px] sm:text-[11px] tabular-nums text-[var(--ink-4)]">{evt.targetAge}j</span>
                      )}
                    </div>
                    {evt.estimatedImpact != null && evt.estimatedImpact > 0 && (
                      <p className="font-mono text-[11px] sm:text-xs tabular-nums text-positive">
                        +{fmtCompact(evt.estimatedImpact)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {opbouwEvents.length > 4 && (
                <p className="text-[10px] text-[var(--ink-4)] pl-3">+{opbouwEvents.length - 4} meer</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-md border border-dashed border-positive/40 bg-positive/10 py-3 px-2 text-center">
              <TrendingUp className="h-4 w-4 text-positive/40 mb-1" />
              <p className="text-[10px] text-positive/60">Geen opbouw-events</p>
              <p className="text-[8px] text-[var(--ink-4)] mt-0.5">erfenis, AOW, pensioen</p>
            </div>
          )}
        </div>
        {/* Investeren column */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <ArrowDownRight className="h-3.5 w-3.5 text-negative" />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-negative">Vrijheid investeren</span>
          </div>
          {invTotalFull > 0 && (
            <p className="text-negative mb-2">
              <MaskedAmount value={invTotalFull} signPrefix="-" tone="horizon" className="text-sm font-semibold" />
            </p>
          )}
          {invSliceFull.length > 0 ? (
            <div className="space-y-1.5">
              {invSliceFull.map(evt => (
                <div key={evt.id} className="flex items-start gap-1.5 min-h-[44px] md:min-h-0">
                  <div className="mt-1 h-1.5 w-1.5 rounded-full bg-negative shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-[11px] sm:text-xs text-[var(--ink-2)] font-medium truncate">{evt.name}</span>
                      {evt.targetAge != null && (
                        <span className="shrink-0 font-mono text-[10px] sm:text-[11px] tabular-nums text-[var(--ink-4)]">{evt.targetAge}j</span>
                      )}
                    </div>
                    {evt.estimatedImpact != null && evt.estimatedImpact > 0 && (
                      <p className="font-mono text-[11px] sm:text-xs tabular-nums text-negative">
                        -{fmtCompact(evt.estimatedImpact)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {investerenEvents.length > 4 && (
                <p className="text-[10px] text-[var(--ink-4)] pl-3">+{investerenEvents.length - 4} meer</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-md border border-dashed border-negative/40 bg-negative/10 py-3 px-2 text-center">
              <Heart className="h-4 w-4 text-negative/40 mb-1" />
              <p className="text-[10px] text-negative/60">Geen investeringen</p>
              <p className="text-[8px] text-[var(--ink-4)] mt-0.5">kinderen, verbouwing, reis</p>
            </div>
          )}
        </div>
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
          {lifeEvents === 1 ? 'gebeurtenis' : 'gebeurtenissen'} gepland
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
                  <span className={`shrink-0 text-[11px] font-semibold ${evt.impactType === 'positive' ? 'text-positive' : 'text-negative'}`}>
                    {evt.impactType === 'positive' ? '↑' : '↓'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex flex-col items-center rounded-md border border-dashed border-positive/40 bg-positive/10 py-3 px-2 text-center">
              <TrendingUp className="h-4 w-4 text-positive/40 mb-1" />
              <p className="text-[10px] text-positive/60 leading-tight">Geen opbouw-events</p>
              <p className="text-[8px] text-[var(--ink-4)] mt-0.5">erfenis, AOW, pensioen</p>
            </div>
            <div className="flex flex-col items-center rounded-md border border-dashed border-negative/40 bg-negative/10 py-3 px-2 text-center">
              <Heart className="h-4 w-4 text-negative/40 mb-1" />
              <p className="text-[10px] text-negative/60 leading-tight">Geen investeringen</p>
              <p className="text-[8px] text-[var(--ink-4)] mt-0.5">kinderen, verbouwing, reis</p>
            </div>
          </div>
        )}
        <p className="mt-1 text-[10px] text-[var(--ink-3)]">
          {lifeEvents} {lifeEvents === 1 ? 'gebeurtenis' : 'gebeurtenissen'} totaal
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
          {lifeEvents === 1 ? 'gebeurtenis' : 'gebeurtenissen'} gepland
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
                  <div className={`absolute -left-4 top-1 h-2.5 w-2.5 rounded-full border-2 ${isPos ? 'border-positive bg-positive/20' : 'border-negative bg-negative/20'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {evt.year && (
                        <span className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">{evt.year}</span>
                      )}
                      <span className="text-xs font-medium text-[var(--ink-2)] truncate">{evt.name}</span>
                    </div>
                    {evt.estimatedImpact != null && evt.estimatedImpact > 0 && (
                      <p className={`mt-0.5 ${isPos ? 'text-positive' : 'text-negative'}`}>
                        <MaskedAmount
                          value={evt.estimatedImpact}
                          signPrefix={isPos ? '+' : '-'}
                          tone="horizon"
                          className="text-[11px]"
                        />
                      </p>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs font-semibold ${isPos ? 'text-positive' : 'text-negative'}`}>
                    {isPos ? '↑' : '↓'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col items-center rounded-lg border border-dashed border-positive/40 bg-positive/10 py-4 px-3 text-center">
            <TrendingUp className="h-5 w-5 text-positive/40 mb-1.5" />
            <p className="text-xs text-positive/60">Geen opbouw-events gepland</p>
            <p className="text-[10px] text-[var(--ink-4)] mt-1">erfenis, AOW, pensioenuitkering, verkoop woning</p>
          </div>
          <div className="flex flex-col items-center rounded-lg border border-dashed border-negative/40 bg-negative/10 py-4 px-3 text-center">
            <Heart className="h-5 w-5 text-negative/40 mb-1.5" />
            <p className="text-xs text-negative/60">Geen investeringen gepland</p>
            <p className="text-[10px] text-[var(--ink-4)] mt-1">kinderen, verbouwing, wereldreis, studie</p>
          </div>
        </div>
      )}
      {allEvents.length > 0 && cumulativeImpact !== 0 && (
        <div className="mt-3 pt-2 border-t border-[var(--border-ed)]">
          <p className="text-[11px] text-[var(--ink-3)]">Cumulatieve impact op je vrijheidsmoment</p>
          <p className={cumulativeImpact > 0 ? 'text-positive' : 'text-negative'}>
            <MaskedAmount
              value={Math.abs(cumulativeImpact)}
              signPrefix={cumulativeImpact > 0 ? '+' : '-'}
              tone="horizon"
              className="text-sm font-semibold"
            />
          </p>
        </div>
      )}
    </WidgetShell>
  )
}

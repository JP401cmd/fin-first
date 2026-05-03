'use client'

import { useState, useEffect, useRef } from 'react'
import type { LifeEvent } from '@/lib/horizon-data'
import { formatCurrency } from '@/lib/format'
import { CHART_PAD } from '@/lib/chart-constants'
import { EVENT_ICONS } from './log-timeline'

// ── EventsTimeline ──────────────────────────────────────────────────────────
// Compact timeline below SimChart showing life events on the same linear age axis.
// Kern = cost/expense events, Wil = income/positive events.

export function EventsTimeline({
  events,
  currentAge,
  endAge,
  visibleMinAge,
  visibleMaxAge,
  scenarioEvents,
  scenarioColor,
}: {
  events: LifeEvent[]
  currentAge: number
  endAge: number
  /** Zoomed visible range (optional — defaults to full range) */
  visibleMinAge?: number
  visibleMaxAge?: number
  scenarioEvents?: Array<{ name: string; target_age: number | null; event_type: string }>
  scenarioColor?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(600)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerW(Math.round(w))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Use zoomed range if provided, else full range
  const rangeMin = visibleMinAge ?? currentAge
  const rangeMax = visibleMaxAge ?? endAge

  // Filter to events with a target_age within visible range
  const visibleEvents = events
    .filter(e => e.target_age != null && e.target_age >= rangeMin && e.target_age <= rangeMax)
    .sort((a, b) => (a.target_age ?? 0) - (b.target_age ?? 0))

  const hasScenarioEvents = scenarioEvents?.some(
    e => e.target_age != null && e.target_age >= rangeMin && e.target_age <= rangeMax
  ) ?? false

  if (visibleEvents.length === 0 && !hasScenarioEvents) return null

  // Uses shared CHART_PAD to match SimChart's padding exactly
  const W = containerW
  const PAD = CHART_PAD
  const innerW = W - PAD.left - PAD.right
  const H = 52 // compact height
  const Y_LINE = 26

  const xScale = (age: number) =>
    rangeMax > rangeMin ? PAD.left + ((age - rangeMin) / (rangeMax - rangeMin)) * innerW : PAD.left

  // Determine if event is net positive (income) or net negative (cost)
  function eventDirection(ev: LifeEvent): 'income' | 'expense' {
    const totalPositive = (ev.monthly_income_change * ev.duration_months) + Math.max(-ev.one_time_cost, 0)
    const totalNegative = (ev.monthly_cost_change * ev.duration_months) + Math.max(ev.one_time_cost, 0)
    return totalPositive > totalNegative ? 'income' : 'expense'
  }

  /** Build tooltip lines for each non-zero financial impact */
  function eventAmountLines(ev: LifeEvent): { label: string; color: string }[] {
    const lines: { label: string; color: string }[] = []
    if (ev.one_time_cost > 0) {
      lines.push({ label: `−${formatCurrency(ev.one_time_cost)} eenmalig`, color: '#ef4444' })
    } else if (ev.one_time_cost < 0) {
      lines.push({ label: `+${formatCurrency(Math.abs(ev.one_time_cost))} eenmalig`, color: '#10b981' })
    }
    if (ev.monthly_cost_change > 0) {
      lines.push({ label: `−${formatCurrency(ev.monthly_cost_change)}/mnd · ${ev.duration_months} mnd`, color: '#ef4444' })
    }
    if (ev.monthly_income_change > 0) {
      lines.push({ label: `+${formatCurrency(ev.monthly_income_change)}/mnd · ${ev.duration_months} mnd`, color: '#10b981' })
    }
    return lines
  }

  // Prevent overlapping labels: assign y-offset rows for close events
  const ROW_HEIGHT = 18
  const MIN_X_GAP = 40
  const rows: number[] = []
  const xPositions = visibleEvents.map(ev => xScale(ev.target_age!))

  for (let i = 0; i < visibleEvents.length; i++) {
    let row = 0
    // Check previous events for x-overlap at the same row
    for (let j = 0; j < i; j++) {
      if (rows[j] === row && Math.abs(xPositions[i] - xPositions[j]) < MIN_X_GAP) {
        row++
        j = -1 // restart check with new row
      }
    }
    rows.push(row)
  }

  const maxRow = Math.max(0, ...rows)
  const totalH = H + maxRow * ROW_HEIGHT

  // Module-kleuren: Horizon voor positief/inkomen (toekomstige cashflow), Kern voor negatief/uitgaven
  const COLOR_INCOME = 'var(--color-horizon, #c4a06b)'
  const COLOR_EXPENSE = 'var(--color-kern, #6b4339)'

  return (
    <div ref={containerRef} className="relative w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${totalH}`}
        className="w-full"
        style={{ maxHeight: totalH, minHeight: 40 }}
        aria-label="Levensgebeurtenissen tijdlijn"
        role="img"
      >
        {/* Horizontal timeline axis */}
        <line
          x1={PAD.left} x2={PAD.left + innerW}
          y1={Y_LINE} y2={Y_LINE}
          stroke="var(--border-ed)" strokeWidth={1}
        />

        {/* Event markers */}
        {visibleEvents.map((ev, i) => {
          const age = ev.target_age!
          const cx = xPositions[i]
          const dir = eventDirection(ev)
          const color = dir === 'income' ? COLOR_INCOME : COLOR_EXPENSE
          const isHovered = hoveredId === ev.id
          const row = rows[i]
          const labelY = Y_LINE + 14 + row * ROW_HEIGHT

          return (
            <g
              key={ev.id}
              onMouseEnter={() => setHoveredId(ev.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ cursor: 'default' }}
            >
              {/* Vertical tick from axis to icon */}
              <line
                x1={cx} x2={cx}
                y1={Y_LINE - 10} y2={Y_LINE + 2}
                stroke={color} strokeWidth={1.5} opacity={0.6}
              />

              {/* Icon circle */}
              <circle
                cx={cx} cy={Y_LINE - 14}
                r={isHovered ? 10 : 8}
                fill={color} opacity={isHovered ? 0.25 : 0.15}
                stroke={color} strokeWidth={1}
                style={{ transition: 'r 150ms ease, opacity 150ms ease' }}
              />

              {/* Icon (rendered as foreign object for React icons) */}
              <foreignObject x={cx - 8} y={Y_LINE - 22} width={16} height={16}>
                <div className="flex h-4 w-4 items-center justify-center" style={{ color }}>
                  {EVENT_ICONS[ev.icon] || EVENT_ICONS['Calendar']}
                </div>
              </foreignObject>

              {/* Label below axis */}
              <text
                x={cx} y={labelY}
                textAnchor="middle" fontSize={8} fontWeight={500}
                fill={color}
                fontFamily="var(--font-inter, sans-serif)"
              >
                {ev.name.length > 10 ? ev.name.slice(0, 9) + '…' : ev.name}
              </text>

              {/* Age label */}
              <text
                x={cx} y={labelY + 10}
                textAnchor="middle" fontSize={7}
                fill="var(--ink-4)"
                fontFamily="var(--font-dm-mono, monospace)"
              >
                {age}j
              </text>

              {/* Hover tooltip — amount lines per financial impact */}
              {isHovered && (() => {
                const lines = eventAmountLines(ev)
                const tooltipH = 14 + lines.length * 11
                const tooltipW = 140
                const tx = Math.max(PAD.left, Math.min(cx - tooltipW / 2, W - PAD.right - tooltipW))
                const txCenter = Math.max(PAD.left + tooltipW / 2, Math.min(cx, W - PAD.right - tooltipW / 2))
                return (
                  <g>
                    <rect
                      x={tx} y={0}
                      width={tooltipW} height={tooltipH}
                      rx={4}
                      fill="var(--ink)" opacity={0.92}
                    />
                    <text
                      x={txCenter} y={11}
                      textAnchor="middle" fontSize={8} fontWeight={600}
                      fill="var(--paper)"
                      fontFamily="var(--font-inter, sans-serif)"
                    >
                      {ev.name}
                    </text>
                    {lines.map((line, li) => (
                      <text
                        key={li}
                        x={txCenter} y={22 + li * 11}
                        textAnchor="middle" fontSize={7}
                        fill={line.color}
                        fontFamily="var(--font-dm-mono, monospace)"
                      >
                        {line.label}
                      </text>
                    ))}
                  </g>
                )
              })()}
            </g>
          )
        })}

        {/* Scenario overlay events (ghost markers) */}
        {scenarioEvents && scenarioColor && scenarioEvents
          .filter(e => e.target_age != null && e.target_age >= rangeMin && e.target_age <= rangeMax)
          .map((ev, i) => {
            const cx = xScale(ev.target_age!)
            // Offset vertically if overlapping with a real event at same age
            const hasRealOverlap = visibleEvents.some(
              re => re.target_age != null && Math.abs(re.target_age - ev.target_age!) < 1
            )
            const cy = hasRealOverlap ? Y_LINE - 14 : Y_LINE

            return (
              <g key={`scenario-${i}`} opacity={0.6}>
                <circle
                  cx={cx} cy={cy} r={6}
                  fill={scenarioColor} fillOpacity={0.3}
                  stroke={scenarioColor} strokeWidth={1.5}
                  strokeDasharray="3 2"
                />
                <rect
                  x={cx + 8} y={cy - 3} width={6} height={6}
                  fill={scenarioColor}
                />
                <text
                  x={cx} y={cy + 18}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--ink-4)"
                  fontFamily="var(--font-inter, sans-serif)"
                  fontStyle="italic"
                >
                  {ev.name}
                </text>
              </g>
            )
          })
        }
      </svg>
    </div>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import type { LifeEvent } from '@/lib/horizon-data'
import { formatCurrency } from '@/lib/format'
import { EVENT_ICONS } from './log-timeline'

// ── EventsTimeline ──────────────────────────────────────────────────────────
// Compact timeline below SimChart showing life events on the same linear age axis.
// Red = cost/expense events, green = income/positive events.

export function EventsTimeline({
  events,
  currentAge,
  endAge,
}: {
  events: LifeEvent[]
  currentAge: number
  endAge: number
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

  // Filter to events with a target_age within chart range
  const visibleEvents = events
    .filter(e => e.target_age != null && e.target_age >= currentAge && e.target_age <= endAge)
    .sort((a, b) => (a.target_age ?? 0) - (b.target_age ?? 0))

  if (visibleEvents.length === 0) return null

  // Must match SimChart's padding exactly
  const W = containerW
  const PAD = { left: 60, right: 16 }
  const innerW = W - PAD.left - PAD.right
  const H = 52 // compact height
  const Y_LINE = 26

  const xScale = (age: number) =>
    endAge > currentAge ? PAD.left + ((age - currentAge) / (endAge - currentAge)) * innerW : PAD.left

  // Determine if event is net positive (income) or net negative (cost)
  function eventDirection(ev: LifeEvent): 'income' | 'expense' {
    const totalPositive = (ev.monthly_income_change * ev.duration_months) + Math.max(-ev.one_time_cost, 0)
    const totalNegative = (ev.monthly_cost_change * ev.duration_months) + Math.max(ev.one_time_cost, 0)
    return totalPositive > totalNegative ? 'income' : 'expense'
  }

  function eventTotalAmount(ev: LifeEvent): number {
    return Math.abs(ev.one_time_cost)
      + Math.abs(ev.monthly_cost_change) * ev.duration_months
      + Math.abs(ev.monthly_income_change) * ev.duration_months
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

  const COLOR_INCOME = '#10b981' // emerald-500
  const COLOR_EXPENSE = '#ef4444' // red-500

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

              {/* Hover tooltip — amount and duration */}
              {isHovered && (
                <g>
                  {/* Tooltip background */}
                  <rect
                    x={cx - 60} y={Y_LINE - 52}
                    width={120} height={30}
                    rx={4}
                    fill="var(--ink)" opacity={0.92}
                  />
                  {/* Tooltip text: name */}
                  <text
                    x={cx} y={Y_LINE - 39}
                    textAnchor="middle" fontSize={8} fontWeight={600}
                    fill="var(--paper)"
                    fontFamily="var(--font-inter, sans-serif)"
                  >
                    {ev.name}
                  </text>
                  {/* Tooltip text: amount + duration */}
                  <text
                    x={cx} y={Y_LINE - 28}
                    textAnchor="middle" fontSize={7}
                    fill="var(--paper)"
                    fontFamily="var(--font-dm-mono, monospace)"
                  >
                    {formatCurrency(eventTotalAmount(ev))}
                    {ev.duration_months > 0 ? ` · ${ev.duration_months} mnd` : ''}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

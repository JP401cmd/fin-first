'use client'

import { useState, useEffect, memo, useCallback } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { StackedRow, WealthGroup } from '@/lib/wealth-composition'
import {
  WEALTH_GROUP_LABELS,
  WEALTH_GROUP_COLORS,
  DEBT_LAYER_COLOR,
  DEBT_LAYER_LABEL,
} from '@/lib/wealth-composition'

// ── Constants (match SimChart) ──────────────────────────────

const PAD = { top: 16, right: 16, bottom: 28, left: 60 }

const ALL_GROUPS: WealthGroup[] = ['spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig']

// ── Helpers ─────────────────────────────────────────────────

function fmtEuro(val: number): string {
  const abs = Math.abs(val)
  if (abs >= 1_000_000) return `€${(val / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `€${Math.round(val / 1_000)}k`
  return `€${Math.round(val)}`
}

function pctStr(part: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round((part / total) * 100)}%`
}

// ── Component ───────────────────────────────────────────────

export const WealthCompositionChart = memo(function WealthCompositionChart({
  stackedRows,
  currentAge,
  endAge,
  visibleMinAge,
  visibleMaxAge,
  fireAge,
  forModal,
  planningMode = 'fire',
  aowAgeFractional,
}: {
  stackedRows: StackedRow[]
  currentAge: number
  endAge: number
  visibleMinAge?: number
  visibleMaxAge?: number
  fireAge?: number | null
  forModal?: boolean
  /** Planning mode: 'fire' (default) uses FIRE age as split point, 'pensioen' uses AOW age */
  planningMode?: 'fire' | 'pensioen'
  /** AOW pension age as fractional value (e.g. 67.25 for 67j+3m) */
  aowAgeFractional?: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1200, forModal })
  const [hoveredAge, setHoveredAge] = useState<number | null>(null)

  // ResizeObserver for responsive width (same pattern as SimChart)
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
  const H = isDesktop ? 260 : 180
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const minAge = visibleMinAge ?? currentAge
  const maxAge = visibleMaxAge ?? endAge

  // Filter rows to visible range
  const visibleRows = stackedRows.filter(r => r.age >= minAge && r.age <= maxAge)

  // Compute Y range (positive max + negative min for debt layer)
  let yMax = 0
  let yMin = 0
  for (const row of visibleRows) {
    const positiveTotal = row.spaargeld + row.beleggingen + row.pensioen + row.vastgoed + row.overig
    if (positiveTotal > yMax) yMax = positiveTotal
    if (row.schulden < yMin) yMin = row.schulden // schulden is already negative
  }
  // Add 8% padding
  yMax = Math.max(yMax, 1) * 1.08
  yMin = yMin < 0 ? yMin * 1.08 : 0

  const yRange = yMax - yMin

  // Scales
  const xScale = (age: number) =>
    maxAge > minAge ? ((age - minAge) / (maxAge - minAge)) * innerW : 0

  const yearStep = innerW / Math.max(maxAge - minAge, 1)
  const barWidth = Math.max(2, yearStep * (isDesktop ? 0.85 : 0.75))

  const yScale = (val: number) =>
    PAD.top + ((yMax - val) / yRange) * innerH

  const yZero = yScale(0)

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map(f => {
    const val = yMin + yRange * (1 - f)
    return { val, y: PAD.top + innerH * f }
  }).filter(t => Math.abs(t.val) > yRange * 0.02 || t.val === 0)

  // X-axis ticks
  const totalAgeSpan = maxAge - minAge
  const xStep = totalAgeSpan <= 10 ? 1 : totalAgeSpan <= 20 ? 2 : totalAgeSpan <= 40 ? 5 : 10
  const xTickAges: number[] = []
  for (let a = Math.ceil(minAge / xStep) * xStep; a <= maxAge; a += xStep) {
    xTickAges.push(a)
  }

  // Hover handler (hooks must be called unconditionally)
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * W - PAD.left
    if (mouseX < 0 || mouseX > innerW) { setHoveredAge(null); return }
    const age = Math.round((mouseX / innerW) * (maxAge - minAge) + minAge)
    const clamped = Math.max(minAge, Math.min(maxAge, age))
    setHoveredAge(clamped)
  }, [W, innerW, minAge, maxAge])

  const handleMouseLeave = useCallback(() => setHoveredAge(null), [])

  // Early return AFTER all hooks
  if (visibleRows.length === 0) {
    return (
      <div ref={ref} className="flex items-center justify-center py-8 text-sm text-[var(--ink-4)]">
        Geen gegevens beschikbaar
      </div>
    )
  }

  // Planning mode logic
  const isPensioenMode = planningMode === 'pensioen'

  // Determine which age to use as the split/reference line
  const refAge = isPensioenMode
    ? (aowAgeFractional != null ? Math.ceil(aowAgeFractional) : null)
    : fireAge

  // FIRE vertical line X position (hidden in pensioen mode)
  const xFire = !isPensioenMode && fireAge != null && fireAge >= minAge && fireAge <= maxAge
    ? PAD.left + xScale(fireAge)
    : null

  // AOW vertical line X position (promoted in pensioen mode)
  const xAow = isPensioenMode && aowAgeFractional != null && aowAgeFractional >= minAge && aowAgeFractional <= maxAge
    ? PAD.left + xScale(aowAgeFractional)
    : null

  // Tooltip data
  const tooltipRow = hoveredAge != null ? visibleRows.find(r => r.age === hoveredAge) : null
  const tooltipX = hoveredAge != null ? PAD.left + xScale(hoveredAge) : 0
  const tooltipPositiveTotal = tooltipRow
    ? tooltipRow.spaargeld + tooltipRow.beleggingen + tooltipRow.pensioen + tooltipRow.vastgoed + tooltipRow.overig
    : 0

  return (
    <div ref={ref}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        overflow="visible"
        aria-hidden="true"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Horizontal grid lines */}
        {yTicks.map(({ val, y }) => (
          <line
            key={val}
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={y}
            y2={y}
            stroke="var(--border-ed)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        ))}

        {/* Zero line (emphasized when debts exist) */}
        {yMin < 0 && (
          <line
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={yZero}
            y2={yZero}
            stroke="var(--border-md)"
            strokeWidth={1.5}
          />
        )}

        {/* Y-axis labels */}
        {yTicks.map(({ val, y }) => (
          <text
            key={val}
            x={PAD.left - 5}
            y={y + 4}
            textAnchor="end"
            fontSize={9}
            fill="var(--ink-4)"
            fontFamily="var(--font-dm-mono, monospace)"
          >
            {fmtEuro(val)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTickAges.map(age => (
          <text
            key={age}
            x={PAD.left + xScale(age)}
            y={H - 4}
            textAnchor="middle"
            fontSize={9}
            fill="var(--ink-4)"
            fontFamily="var(--font-dm-mono, monospace)"
          >
            {age}
          </text>
        ))}

        {/* Stacked bars */}
        {visibleRows.map(row => {
          const x = PAD.left + xScale(row.age) - barWidth / 2
          const isHovered = hoveredAge === row.age

          // Positive layers stacked upward from zero
          const layers: { group: WealthGroup; value: number; color: string }[] = ALL_GROUPS
            .map(g => ({ group: g, value: row[g], color: WEALTH_GROUP_COLORS[g] }))
            .filter(l => l.value > 0)

          let cumY = yZero
          const positiveBars = layers.map(layer => {
            const barH = (layer.value / yRange) * innerH
            cumY -= barH
            return {
              ...layer,
              y: cumY,
              height: barH,
            }
          })

          // Debt bar (negative, below zero line)
          const debtValue = Math.abs(row.schulden)
          const debtBarH = debtValue > 0 ? (debtValue / yRange) * innerH : 0

          // Animation: bars grow from zero line
          const animProgress = hasEntered ? 1 : 0

          return (
            <g key={row.age} opacity={hasEntered ? 1 : 0} style={{
              transition: hasEntered ? `opacity 0.4s ease ${Math.min((row.age - minAge) * 0.02, 0.5)}s` : 'none',
            }}>
              {/* Positive stacked bars */}
              {positiveBars.map(bar => (
                <rect
                  key={bar.group}
                  x={x}
                  y={yZero - (yZero - bar.y) * animProgress}
                  width={barWidth}
                  height={bar.height * animProgress}
                  fill={bar.color}
                  opacity={isHovered ? 1 : 0.85}
                  rx={barWidth > 4 ? 1 : 0}
                  style={{ transition: 'opacity 150ms ease, y 0.8s cubic-bezier(.22,1,.36,1), height 0.8s cubic-bezier(.22,1,.36,1)' }}
                />
              ))}

              {/* Debt bar (below zero line) */}
              {debtBarH > 0 && (
                <rect
                  x={x}
                  y={yZero}
                  width={barWidth}
                  height={debtBarH * animProgress}
                  fill={DEBT_LAYER_COLOR}
                  opacity={isHovered ? 1 : 0.85}
                  rx={barWidth > 4 ? 1 : 0}
                  style={{ transition: 'opacity 150ms ease, height 0.8s cubic-bezier(.22,1,.36,1)' }}
                />
              )}
            </g>
          )
        })}

        {/* FIRE age vertical dashed line (hidden in pensioen mode) */}
        {xFire !== null && (
          <line
            x1={xFire}
            x2={xFire}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="var(--hor-t, #8a6e42)"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            opacity={0.85}
          />
        )}

        {/* FIRE label (hidden in pensioen mode) */}
        {xFire !== null && fireAge != null && (
          <text
            x={xFire + 4}
            y={PAD.top + 12}
            fontSize={8}
            fill="var(--hor-t, #8a6e42)"
            fontFamily="var(--font-inter, sans-serif)"
            fontWeight={600}
          >
            FIRE {fireAge}
          </text>
        )}

        {/* AOW pensioenleeftijd vertical dashed line (promoted in pensioen mode) */}
        {xAow !== null && aowAgeFractional != null && (
          <g>
            <line
              x1={xAow}
              x2={xAow}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--hor-t, #8a6e42)"
              strokeWidth={1.8}
              strokeDasharray="4 2"
              opacity={0.85}
            />
            <text
              x={xAow - 4}
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
              x={xAow - 4}
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

        {/* Hover tooltip */}
        {tooltipRow && hoveredAge != null && (() => {
          const tooltipW = 150
          const tooltipH = 100
          // Position tooltip to left or right of bar depending on space
          const rawX = tooltipX - tooltipW / 2
          const clampedX = Math.max(PAD.left, Math.min(rawX, W - PAD.right - tooltipW))
          const tooltipY = Math.max(PAD.top, PAD.top + 10)

          const items: { label: string; value: number; color: string }[] = [
            ...ALL_GROUPS
              .filter(g => tooltipRow[g] > 0)
              .map(g => ({ label: WEALTH_GROUP_LABELS[g], value: tooltipRow[g], color: WEALTH_GROUP_COLORS[g] })),
            ...(tooltipRow.schulden < 0
              ? [{ label: DEBT_LAYER_LABEL, value: tooltipRow.schulden, color: DEBT_LAYER_COLOR }]
              : []),
          ]
          const netWorth = tooltipPositiveTotal + tooltipRow.schulden
          const lineH = 13
          const actualH = 32 + items.length * lineH + 14

          return (
            <g>
              {/* Tooltip background */}
              <rect
                x={clampedX}
                y={tooltipY}
                width={tooltipW}
                height={actualH}
                rx={5}
                fill="var(--ink)"
                opacity={0.94}
              />
              {/* Age header */}
              <text
                x={clampedX + 8}
                y={tooltipY + 14}
                fontSize={9}
                fontWeight={700}
                fill="var(--paper)"
                fontFamily="var(--font-inter, sans-serif)"
              >
                Leeftijd {hoveredAge}
              </text>
              {/* Breakdown items */}
              {items.map((item, i) => (
                <g key={item.label}>
                  <rect
                    x={clampedX + 8}
                    y={tooltipY + 22 + i * lineH}
                    width={6}
                    height={6}
                    rx={1}
                    fill={item.color}
                  />
                  <text
                    x={clampedX + 18}
                    y={tooltipY + 28 + i * lineH}
                    fontSize={8}
                    fill="var(--paper)"
                    fontFamily="var(--font-inter, sans-serif)"
                  >
                    {item.label}
                  </text>
                  <text
                    x={clampedX + tooltipW - 8}
                    y={tooltipY + 28 + i * lineH}
                    textAnchor="end"
                    fontSize={8}
                    fill="var(--paper)"
                    fontFamily="var(--font-dm-mono, monospace)"
                  >
                    {fmtEuro(item.value)}
                    {item.value > 0 ? ` (${pctStr(item.value, tooltipPositiveTotal)})` : ''}
                  </text>
                </g>
              ))}
              {/* Net worth total */}
              <line
                x1={clampedX + 8}
                x2={clampedX + tooltipW - 8}
                y1={tooltipY + 24 + items.length * lineH}
                y2={tooltipY + 24 + items.length * lineH}
                stroke="var(--paper)"
                strokeWidth={0.5}
                opacity={0.3}
              />
              <text
                x={clampedX + 8}
                y={tooltipY + 36 + items.length * lineH}
                fontSize={8}
                fontWeight={700}
                fill="var(--paper)"
                fontFamily="var(--font-inter, sans-serif)"
              >
                Netto vermogen
              </text>
              <text
                x={clampedX + tooltipW - 8}
                y={tooltipY + 36 + items.length * lineH}
                textAnchor="end"
                fontSize={8}
                fontWeight={700}
                fill="var(--paper)"
                fontFamily="var(--font-dm-mono, monospace)"
              >
                {fmtEuro(netWorth)}
              </text>
            </g>
          )
        })()}
      </svg>

      {/* Legend */}
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4">
        {ALL_GROUPS.map(g => {
          // Only show groups that appear in data
          const hasData = stackedRows.some(r => r[g] > 0)
          if (!hasData) return null
          return (
            <div key={g} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: WEALTH_GROUP_COLORS[g] }}
              />
              <span className="text-[10px] font-medium text-[var(--ink-3)]">
                {WEALTH_GROUP_LABELS[g]}
              </span>
            </div>
          )
        })}
        {stackedRows.some(r => r.schulden < 0) && (
          <div className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: DEBT_LAYER_COLOR }}
            />
            <span className="text-[10px] font-medium text-[var(--ink-3)]">
              {DEBT_LAYER_LABEL}
            </span>
          </div>
        )}
      </div>
    </div>
  )
})

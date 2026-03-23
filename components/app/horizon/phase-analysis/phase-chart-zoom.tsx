'use client'

import { memo } from 'react'
import { useModalAnimation } from '@/lib/hooks/use-modal-animation'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'

// ── Types ────────────────────────────────────────────────────────────────────

interface PhaseChartZoomProps {
  /** ALL rows from the full projection */
  allRows: UnifiedProjectionRow[]
  /** Which phase to highlight */
  phaseFilter: 'accumulation' | 'transition' | 'withdrawal'
  /** Accent color for highlighted phase (CSS value) */
  accentColor: string
  /** Optional annotations (e.g. FIRE age marker, AOW marker) */
  annotations?: { age: number; label: string; color?: string }[]
}

// ── Constants ────────────────────────────────────────────────────────────────

const CHART_W = 360
const CHART_H = 140
const PAD = { top: 16, right: 16, bottom: 24, left: 56 }

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a value for the Y-axis: €1.2M, €350k, or €0 */
function formatYLabel(val: number): string {
  if (val >= 1_000_000) return `\u20AC${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `\u20AC${Math.round(val / 1_000)}k`
  return `\u20AC${Math.round(val)}`
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Zoomed-in net worth chart showing the current phase highlighted against
 * the full trajectory. The full trajectory renders as a light gray line,
 * while the filtered phase is shown with the accent color (thicker line + area fill).
 *
 * Optional milestone annotations render as vertical dotted lines with labels.
 * Uses `useModalAnimation` for entrance animation.
 */
export const PhaseChartZoom = memo(function PhaseChartZoom({
  allRows,
  phaseFilter,
  accentColor,
  annotations = [],
}: PhaseChartZoomProps) {
  const { hasEntered } = useModalAnimation({ delay: 150, duration: 700 })

  if (allRows.length < 2) return null

  const chartW = CHART_W - PAD.left - PAD.right
  const chartH = CHART_H - PAD.top - PAD.bottom

  // Y range: use absolute net worth, clamped to 0 minimum for the chart floor
  const allNetWorths = allRows.map((r) => r.netWorth)
  const maxVal = Math.max(...allNetWorths, 1)
  const minVal = Math.min(0, ...allNetWorths)
  const range = maxVal - minVal || 1

  const minAge = allRows[0].age
  const maxAge = allRows[allRows.length - 1].age
  const ageSpan = maxAge - minAge || 1

  // Coordinate transforms
  const x = (age: number) => PAD.left + ((age - minAge) / ageSpan) * chartW
  const y = (val: number) =>
    PAD.top + chartH - ((val - minVal) / range) * chartH

  // ── Phase rows ─────────────────────────────────────────────
  const phaseRows = allRows.filter((r) => r.phase === phaseFilter)

  // ── Full trajectory path (light gray) ──────────────────────
  const fullPoints = allRows.map((r) => `${x(r.age)},${y(r.netWorth)}`)
  const fullLinePath = `M${fullPoints.join(' L')}`

  // ── Highlighted phase area + line ──────────────────────────
  let phaseLinePath = ''
  let phaseAreaPath = ''
  if (phaseRows.length >= 2) {
    const phasePoints = phaseRows.map((r) => `${x(r.age)},${y(r.netWorth)}`)
    phaseLinePath = `M${phasePoints.join(' L')}`

    const firstAge = phaseRows[0].age
    const lastAge = phaseRows[phaseRows.length - 1].age
    phaseAreaPath = `${phaseLinePath} L${x(lastAge)},${y(minVal)} L${x(firstAge)},${y(minVal)} Z`
  }

  // ── Axis ticks ─────────────────────────────────────────────
  const yTicks = [0, 0.5, 1.0].map((f) => ({
    val: minVal + range * f,
    yPos: y(minVal + range * f),
  }))

  const xStep = ageSpan <= 10 ? 2 : ageSpan <= 20 ? 5 : 10
  const xTicks: number[] = []
  for (
    let a = Math.ceil(minAge / xStep) * xStep;
    a <= maxAge;
    a += xStep
  ) {
    xTicks.push(a)
  }

  // Phase boundary net worth labels
  const phaseStartNw = phaseRows.length > 0 ? phaseRows[0].startNetWorth : 0
  const phaseEndNw =
    phaseRows.length > 0 ? phaseRows[phaseRows.length - 1].netWorth : 0

  const animProgress = hasEntered ? 1 : 0

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full"
      role="img"
      aria-label={`Vermogensontwikkeling – ${phaseFilter} fase`}
    >
      {/* Grid lines */}
      {yTicks.map((t) => (
        <g key={t.val}>
          <line
            x1={PAD.left}
            x2={CHART_W - PAD.right}
            y1={t.yPos}
            y2={t.yPos}
            stroke="var(--border-ed, #e5e5e5)"
            strokeWidth={0.5}
          />
          <text
            x={PAD.left - 6}
            y={t.yPos + 3}
            textAnchor="end"
            className="fill-[var(--ink-4)]"
            style={{ fontSize: 8, fontFamily: 'var(--font-mono, monospace)' }}
          >
            {formatYLabel(t.val)}
          </text>
        </g>
      ))}

      {/* X-axis ticks */}
      {xTicks.map((age) => (
        <text
          key={age}
          x={x(age)}
          y={CHART_H - 4}
          textAnchor="middle"
          className="fill-[var(--ink-4)]"
          style={{ fontSize: 8, fontFamily: 'var(--font-mono, monospace)' }}
        >
          {age}
        </text>
      ))}

      {/* Full trajectory: dimmed gray line */}
      <path
        d={fullLinePath}
        fill="none"
        stroke="var(--ink-4, #ccc)"
        strokeWidth={1}
        opacity={0.15}
        style={{
          transition: 'opacity 700ms ease-out',
          opacity: animProgress * 0.15,
        }}
      />

      {/* Highlighted phase: area fill */}
      {phaseAreaPath && (
        <path
          d={phaseAreaPath}
          fill={accentColor}
          style={{
            transition: 'opacity 700ms ease-out',
            opacity: animProgress * 0.12,
          }}
        />
      )}

      {/* Highlighted phase: line */}
      {phaseLinePath && (
        <path
          d={phaseLinePath}
          fill="none"
          stroke={accentColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: 1 - animProgress,
            transition: 'stroke-dashoffset 700ms ease-out',
          }}
        />
      )}

      {/* Phase start label */}
      {phaseRows.length > 0 && (
        <text
          x={x(phaseRows[0].age)}
          y={y(phaseStartNw) - 6}
          textAnchor="start"
          className="fill-[var(--ink-3)]"
          style={{
            fontSize: 7,
            fontFamily: 'var(--font-mono, monospace)',
            transition: 'opacity 400ms ease-out 400ms',
            opacity: animProgress,
          }}
        >
          {formatYLabel(phaseStartNw)}
        </text>
      )}

      {/* Phase end label */}
      {phaseRows.length > 0 && (
        <text
          x={x(phaseRows[phaseRows.length - 1].age)}
          y={y(phaseEndNw) - 6}
          textAnchor="end"
          className="fill-[var(--ink-3)]"
          style={{
            fontSize: 7,
            fontFamily: 'var(--font-mono, monospace)',
            transition: 'opacity 400ms ease-out 400ms',
            opacity: animProgress,
          }}
        >
          {formatYLabel(phaseEndNw)}
        </text>
      )}

      {/* Milestone annotations: vertical dotted lines */}
      {annotations.map((a) => {
        const ax = x(a.age)
        // Only render if the age falls within the chart range
        if (a.age < minAge || a.age > maxAge) return null
        return (
          <g key={`${a.age}-${a.label}`}>
            <line
              x1={ax}
              x2={ax}
              y1={PAD.top}
              y2={CHART_H - PAD.bottom}
              stroke={a.color ?? 'var(--ink-3, #999)'}
              strokeWidth={1}
              strokeDasharray="3 2"
              style={{
                transition: 'opacity 400ms ease-out 500ms',
                opacity: animProgress,
              }}
            />
            <text
              x={ax}
              y={PAD.top - 4}
              textAnchor="middle"
              fill={a.color ?? 'var(--ink-3, #999)'}
              style={{
                fontSize: 7,
                fontFamily: 'var(--font-mono, monospace)',
                transition: 'opacity 400ms ease-out 500ms',
                opacity: animProgress,
              }}
            >
              {a.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
})

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { SimRow } from '@/lib/fire-simulation'
import { CHART_PAD } from '@/lib/chart-constants'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

/**
 * Mini SVG-grafiek die het FIRE-pad van een baseline en een draft-event-scenario
 * over elkaar legt. Geen recharts — directe SVG, consistent met SimChart
 * en EventsTimeline.
 */
export function EventImpactPreview({
  baselineRows,
  draftRows,
  baselineFireAge,
  draftFireAge,
  height = 140,
  legendLabels = { draft: 'met deze gebeurtenis', baseline: 'zonder' },
}: {
  baselineRows: SimRow[]
  draftRows: SimRow[]
  baselineFireAge: number | null
  draftFireAge: number | null
  height?: number
  /** Legenda-teksten — pas aan voor niet-event-context (bv. "deze keuze" / "huidige instelling"). */
  legendLabels?: { draft: string; baseline: string }
}) {
  const { masked } = useMaskedAmounts()
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(560)
  const [hoveredAge, setHoveredAge] = useState<number | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerW(Math.round(w))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const W = containerW
  const H = height
  const PAD = CHART_PAD
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const { minAge, maxAge, maxValue, minValue } = useMemo(() => {
    const allRows = [...baselineRows, ...draftRows]
    if (allRows.length === 0) {
      return { minAge: 30, maxAge: 90, maxValue: 100000, minValue: 0 }
    }
    let minA = Infinity
    let maxA = -Infinity
    let maxV = -Infinity
    let minV = Infinity
    for (const r of allRows) {
      if (r.age < minA) minA = r.age
      if (r.age > maxA) maxA = r.age
      if (r.endPortfolio > maxV) maxV = r.endPortfolio
      if (r.endPortfolio < minV) minV = r.endPortfolio
    }
    return {
      minAge: minA,
      maxAge: maxA,
      maxValue: Math.max(maxV, 1000),
      minValue: Math.min(minV, 0),
    }
  }, [baselineRows, draftRows])

  const xScale = (age: number) =>
    maxAge > minAge ? PAD.left + ((age - minAge) / (maxAge - minAge)) * innerW : PAD.left
  const yScale = (val: number) => {
    const range = maxValue - minValue || 1
    return PAD.top + innerH - ((val - minValue) / range) * innerH
  }

  function rowsToPath(rows: SimRow[]): string {
    if (rows.length === 0) return ''
    return rows
      .map((r, i) => `${i === 0 ? 'M' : 'L'} ${xScale(r.age).toFixed(2)} ${yScale(r.endPortfolio).toFixed(2)}`)
      .join(' ')
  }

  const baselinePath = rowsToPath(baselineRows)
  const draftPath = rowsToPath(draftRows)

  const fireDeltaMonths =
    baselineFireAge != null && draftFireAge != null
      ? Math.round((draftFireAge - baselineFireAge) * 12)
      : null

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svgRect = e.currentTarget.getBoundingClientRect()
    const xRel = ((e.clientX - svgRect.left) / svgRect.width) * W - PAD.left
    if (xRel < 0 || xRel > innerW) {
      setHoveredAge(null)
      return
    }
    const age = minAge + (xRel / innerW) * (maxAge - minAge)
    setHoveredAge(Math.round(age))
  }

  const hoverBaseline = hoveredAge != null ? baselineRows.find(r => r.age === hoveredAge) : null
  const hoverDraft = hoveredAge != null ? draftRows.find(r => r.age === hoveredAge) : null
  const hoverDelta =
    hoverBaseline && hoverDraft ? hoverDraft.endPortfolio - hoverBaseline.endPortfolio : null

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: H }}
        aria-label="Impact-grafiek"
        role="img"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredAge(null)}
      >
        {/* Zero-line */}
        {minValue < 0 && (
          <line
            x1={PAD.left}
            x2={PAD.left + innerW}
            y1={yScale(0)}
            y2={yScale(0)}
            stroke="var(--border-ed)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
        )}

        {/* Baseline (grijze dunne lijn) */}
        {baselinePath && (
          <path
            d={baselinePath}
            fill="none"
            stroke="var(--ink-4)"
            strokeWidth={1.25}
            strokeDasharray="3 3"
          />
        )}

        {/* Draft (horizon-accent dik) */}
        {draftPath && (
          <path
            d={draftPath}
            fill="none"
            stroke="var(--module-active-700, var(--color-horizon, #c4a06b))"
            strokeWidth={2}
          />
        )}

        {/* FIRE-leeftijd verticale lijnen */}
        {baselineFireAge != null && (
          <line
            x1={xScale(baselineFireAge)}
            x2={xScale(baselineFireAge)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="var(--ink-4)"
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.6}
          />
        )}
        {draftFireAge != null && (
          <line
            x1={xScale(draftFireAge)}
            x2={xScale(draftFireAge)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            stroke="var(--module-active-700, var(--color-horizon, #c4a06b))"
            strokeWidth={1.5}
            opacity={0.7}
          />
        )}

        {/* Y-as labels — alleen min/max */}
        <text
          x={PAD.left - 4}
          y={PAD.top + 8}
          textAnchor="end"
          fontSize={9}
          fill="var(--ink-4)"
          fontFamily="var(--font-dm-mono, monospace)"
        >
          {formatMaskedCurrency(maxValue, masked)}
        </text>
        {minValue < 0 && (
          <text
            x={PAD.left - 4}
            y={yScale(0) + 3}
            textAnchor="end"
            fontSize={9}
            fill="var(--ink-4)"
            fontFamily="var(--font-dm-mono, monospace)"
          >
            0
          </text>
        )}

        {/* X-as labels */}
        <text
          x={PAD.left}
          y={H - 6}
          fontSize={9}
          fill="var(--ink-4)"
          fontFamily="var(--font-dm-mono, monospace)"
        >
          {Math.round(minAge)}j
        </text>
        <text
          x={PAD.left + innerW}
          y={H - 6}
          textAnchor="end"
          fontSize={9}
          fill="var(--ink-4)"
          fontFamily="var(--font-dm-mono, monospace)"
        >
          {Math.round(maxAge)}j
        </text>

        {/* Hover tooltip */}
        {hoveredAge != null && hoverDraft && (
          <g>
            <line
              x1={xScale(hoveredAge)}
              x2={xScale(hoveredAge)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--ink-3)"
              strokeWidth={0.75}
              strokeDasharray="2 2"
            />
            <circle
              cx={xScale(hoveredAge)}
              cy={yScale(hoverDraft.endPortfolio)}
              r={3}
              fill="var(--module-active-700, var(--color-horizon, #c4a06b))"
            />
          </g>
        )}
      </svg>

      {/* Legend + delta-badge */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--ink-3)] font-mono">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-[2px] w-3"
              style={{ background: 'var(--module-active-700, #c4a06b)' }}
              aria-hidden
            />
            {legendLabels.draft}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-[2px] w-3 border-t border-dashed border-[var(--ink-4)]"
              aria-hidden
            />
            {legendLabels.baseline}
          </span>
        </div>
        {fireDeltaMonths != null && fireDeltaMonths !== 0 && (
          <span
            className="px-1.5 py-0.5 rounded font-semibold"
            style={{
              background:
                fireDeltaMonths > 0
                  ? 'color-mix(in oklch, var(--negative) 12%, transparent)'
                  : 'color-mix(in oklch, var(--positive) 12%, transparent)',
              color:
                fireDeltaMonths > 0 ? 'var(--negative)' : 'var(--positive)',
            }}
            aria-live="polite"
          >
            {fireDeltaMonths > 0 ? '+' : '−'}
            {Math.abs(fireDeltaMonths)} mnd FIRE
          </span>
        )}
        {hoveredAge != null && hoverDelta != null && Math.abs(hoverDelta) > 1 && (
          <span className="font-semibold text-[var(--ink-2)]">
            op {hoveredAge}j: {hoverDelta > 0 ? '+' : ''}
            {formatMaskedCurrency(Math.round(hoverDelta), masked)}
          </span>
        )}
      </div>
    </div>
  )
}

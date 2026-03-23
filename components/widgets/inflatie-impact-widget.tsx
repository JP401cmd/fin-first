import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { formatCurrency } from '@/lib/format'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

/**
 * Calculates purchasing power points over a range of years,
 * showing how inflation erodes the value of €1.000 over time.
 */
function buildPurchasingPowerPoints(inflationRate: number, years: number) {
  const points: { x: number; y: number }[] = []
  for (let year = 0; year <= years; year++) {
    const value = 1000 * Math.pow(1 - inflationRate, year)
    points.push({ x: year, y: value })
  }
  return points
}

/** Builds an SVG path string from purchasing power data points */
function buildSvgPath(
  points: { x: number; y: number }[],
  width: number,
  height: number,
  maxYears: number,
) {
  const scaled = points.map(p => ({
    x: (p.x / maxYears) * width,
    y: height - (p.y / 1000) * height,
  }))
  const pathD = scaled
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
  const fillD = pathD + ` L${width},${height} L0,${height} Z`
  return { pathD, fillD }
}

export const InflatieImpactWidget = memo(function InflatieImpactWidget({ size, data, href }: Props) {
  const inflationRate = data.inflationRate || 0.02

  // ── Mini: inflation percentage only ────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="horizon" size="mini" kicker="Inflatie" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {(inflationRate * 100).toFixed(1)}%
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: percentage + 10-year purchasing power loss ────
  if (size === 'quarter') {
    const futureValue = 1000 * Math.pow(1 - inflationRate, 10)
    return (
      <WidgetShell module="horizon" size={size} kicker="Inflatie-impact" href={href}>
        <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
          {(inflationRate * 100).toFixed(1)}%
        </p>
        <span className="text-[10px] text-[var(--ink-3)]">/jaar</span>
        <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)]">
          Over 10 jaar is &euro;1.000 nog maar {formatCurrency(futureValue)} waard
        </p>
      </WidgetShell>
    )
  }

  // ── Full: curve + table + FIRE impact ──────────────────────
  if (size === 'full') {
    const svgWidth = 300
    const svgHeight = 120
    const maxYears = 30
    const points = buildPurchasingPowerPoints(inflationRate, maxYears)
    const { pathD, fillD } = buildSvgPath(points, svgWidth, svgHeight, maxYears)

    const tableYears = [5, 10, 20, 30]
    const fireTarget = data.fireTarget

    return (
      <WidgetShell module="horizon" size={size} kicker="Inflatie-impact" href={href}>
        {/* Header */}
        <div className="flex items-baseline gap-1.5">
          <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
            {(inflationRate * 100).toFixed(1)}%
          </p>
          <span className="text-xs text-[var(--ink-3)]">/jaar</span>
        </div>
        <p className="mt-0.5 text-xs text-[var(--ink-3)]">
          Koopkrachtverlies door inflatie
        </p>

        {/* SVG curve */}
        <div className="mt-3">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            width="100%"
            className="overflow-visible"
            aria-hidden="true"
          >
            <path d={fillD} fill="var(--horizon-100, #e0f2fe)" opacity={0.5} />
            <path d={pathD} fill="none" stroke="var(--horizon-500, #0ea5e9)" strokeWidth={2} />
          </svg>
        </div>

        {/* Table */}
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)] mb-1.5">
            Koopkracht van &euro;1.000
          </p>
          <div className="space-y-1">
            {tableYears.map(year => {
              const futureVal = 1000 * Math.pow(1 - inflationRate, year)
              const loss = 1000 - futureVal
              const fireExtra =
                fireTarget > 0
                  ? fireTarget * (Math.pow(1 + inflationRate, year) - 1)
                  : null

              return (
                <div key={year} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--ink-3)] w-12">Jaar {year}</span>
                  <span className="font-mono tabular-nums text-[var(--ink)]">
                    {formatCurrency(futureVal)}
                  </span>
                  <span className="font-mono tabular-nums text-[var(--ink-3)]">
                    -{formatCurrency(loss)}
                  </span>
                  {fireExtra != null && (
                    <span className="font-mono tabular-nums text-horizon-700 text-right">
                      +{formatCurrency(fireExtra)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Column headers legend */}
          {fireTarget > 0 && (
            <p className="mt-1.5 text-[10px] text-[var(--ink-4)]">
              Laatste kolom: extra FIRE-vermogen nodig door inflatie
            </p>
          )}
        </div>

        <p className="mt-3 pt-2 border-t border-[var(--border-ed)] font-serif italic text-[11px] text-[var(--ink-3)]">
          Uitgaande van {(inflationRate * 100).toFixed(1)}% jaarlijkse inflatie
        </p>
      </WidgetShell>
    )
  }

  // ── Half (default): SVG curve with inline labels ──────────
  const svgWidth = 240
  const svgHeight = 90
  const maxYears = 30
  const points = buildPurchasingPowerPoints(inflationRate, maxYears)
  const { pathD, fillD } = buildSvgPath(points, svgWidth, svgHeight, maxYears)

  const milestones = [
    { year: 0, label: '€1.000' },
    { year: 10, label: formatCurrency(1000 * Math.pow(1 - inflationRate, 10)) },
    { year: 20, label: formatCurrency(1000 * Math.pow(1 - inflationRate, 20)) },
    { year: 30, label: formatCurrency(1000 * Math.pow(1 - inflationRate, 30)) },
  ]

  return (
    <WidgetShell module="horizon" size={size} kicker="Inflatie-impact" href={href}>
      {/* Main stat */}
      <div className="flex items-baseline gap-1.5">
        <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
          {(inflationRate * 100).toFixed(1)}%
        </p>
        <span className="text-[10px] text-[var(--ink-3)]">/jaar</span>
      </div>

      {/* SVG declining curve with value labels */}
      <div className="mt-2">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          width="100%"
          className="overflow-visible"
          aria-hidden="true"
        >
          <path d={fillD} fill="var(--horizon-100, #e0f2fe)" opacity={0.5} />
          <path d={pathD} fill="none" stroke="var(--horizon-500, #0ea5e9)" strokeWidth={2} />
          {/* Milestone dots and labels on the curve */}
          {milestones.map(({ year, label }) => {
            const cx = (year / maxYears) * svgWidth
            const val = 1000 * Math.pow(1 - inflationRate, year)
            const cy = svgHeight - (val / 1000) * svgHeight
            const isFirst = year === 0
            const isLast = year === maxYears
            // Position label above curve, except last point which goes below
            const labelY = isLast ? Math.min(cy + 12, svgHeight) : Math.max(cy - 6, 8)
            return (
              <g key={year}>
                <circle cx={cx} cy={cy} r={2.5} fill="var(--horizon-500, #0ea5e9)" />
                <text
                  x={isFirst ? cx + 4 : isLast ? cx : cx}
                  y={labelY}
                  fontSize={8}
                  fontFamily="var(--font-mono, ui-monospace, monospace)"
                  fontWeight={isFirst || isLast ? 600 : 400}
                  fill={isFirst ? 'var(--ink)' : isLast ? 'var(--horizon-700, #0369a1)' : 'var(--ink-3)'}
                  textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
                >
                  {label}
                </text>
                {!isFirst && (
                  <text
                    x={isLast ? cx : cx}
                    y={labelY + 9}
                    fontSize={7}
                    fill="var(--ink-4)"
                    textAnchor={isLast ? 'end' : 'middle'}
                  >
                    {year}j
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Footnote */}
      <p className="mt-1.5 font-serif italic text-[10px] text-[var(--ink-4)]">
        Koopkracht van €1.000 over {maxYears} jaar
      </p>
    </WidgetShell>
  )
})

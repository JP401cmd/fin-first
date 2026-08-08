'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { formatCurrency } from '@/lib/format'
import { INFLATION } from '@/lib/constants'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// euro-view: exempt — deze widget deflateert bewust zélf: het koopkrachtverlies
// ÍS de boodschap (een didactische €1.000-curve, geen projectiebedrag). Hij volgt
// daarom niet de globale euro-weergave; dat zou de erosie juist wegpoetsen.

/**
 * Reële (koopkracht-gecorrigeerde) waarde van €1.000 na `year` jaar inflatie.
 * Canonieke discontering: reële waarde = nominaal / (1 + inflatie)^jaar — dezelfde
 * grondslag als de reële-rendementsformule elders (lib/check/build-report.ts).
 * NIET (1 − inflatie)^jaar: dat overdrijft het koopkrachtverlies.
 * Eén bron binnen deze widget zodat curve, mijlpalen en tabel niet uiteenlopen.
 */
function purchasingPower(inflationRate: number, year: number) {
  return 1000 / Math.pow(1 + inflationRate, year)
}

/**
 * Calculates purchasing power points over a range of years,
 * showing how inflation erodes the value of €1.000 over time.
 */
function buildPurchasingPowerPoints(inflationRate: number, years: number) {
  const points: { x: number; y: number }[] = []
  for (let year = 0; year <= years; year++) {
    points.push({ x: year, y: purchasingPower(inflationRate, year) })
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

interface Milestone {
  year: number
  label: string
}

/** Breedte waarop de curve rendert tot de ResizeObserver de echte tegelbreedte meet (SSR/jsdom). */
const CURVE_FALLBACK_WIDTH = 280

/**
 * Koopkracht-curve met VASTE pixelhoogte.
 *
 * De SVG-hoogte volgde eerder uit breedte × viewBox-aspect (`width="100%"` +
 * onbegrensde hoogte). Op brede tegels (half=M, full=L, en de brede
 * aanpassen-menu-preview) werd de SVG dáárdoor hóger dan de vaste tegelhoogte, en
 * knipte de `overflow-hidden` van de WidgetShell de onderkant van de curve + de
 * laagste mijlpaallabels (jaar-30) weg — precies het M/L-defect uit W24.
 *
 * We meten nu de containerbreedte (ResizeObserver — zelfde patroon als
 * budgetten-widget) en geven de SVG een viewBox in échte pixels (1 eenheid = 1px)
 * met een vaste hoogte + expliciete `height`. Zo vult de curve de volle breedte,
 * blijft de tekst scherp (geen `preserveAspectRatio="none"`-vervorming) en loopt
 * niets over — ongeacht hoe breed de tegel wordt.
 */
function InflationCurve({
  inflationRate,
  maxYears,
  height,
  milestones = [],
}: {
  inflationRate: number
  maxYears: number
  height: number
  milestones?: Milestone[]
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(CURVE_FALLBACK_WIDTH)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      if (w > 0) setWidth(w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const points = buildPurchasingPowerPoints(inflationRate, maxYears)
  const { pathD, fillD } = buildSvgPath(points, width, height, maxYears)

  return (
    <div ref={ref} className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        className="overflow-visible"
        aria-hidden="true"
      >
        <path d={fillD} fill="var(--color-horizon-100)" opacity={0.5} />
        <path d={pathD} fill="none" stroke="var(--color-horizon-500)" strokeWidth={2} />
        {/* Milestone dots and labels on the curve (alleen half) */}
        {milestones.map(({ year, label }) => {
          const cx = (year / maxYears) * width
          const val = purchasingPower(inflationRate, year)
          const cy = height - (val / 1000) * height
          const isFirst = year === 0
          const isLast = year === maxYears
          // Label boven de curve, behalve het laatste punt (eronder). Clamp op
          // [8, height-9] zodat de label + de jaar-sublabel (labelY+9) binnen de
          // vaste hoogte blijven en niet meer worden weggeknipt.
          const labelY = isLast ? Math.min(cy + 12, height - 9) : Math.max(cy - 6, 8)
          return (
            <g key={year}>
              <circle cx={cx} cy={cy} r={2.5} fill="var(--color-horizon-500)" />
              <text
                x={isFirst ? cx + 4 : cx}
                y={labelY}
                fontSize={8}
                fontFamily="var(--font-mono, ui-monospace, monospace)"
                fontWeight={isFirst || isLast ? 600 : 400}
                fill={isFirst ? 'var(--ink)' : isLast ? 'var(--color-horizon-700)' : 'var(--ink-3)'}
                textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
              >
                {label}
              </text>
              {!isFirst && (
                <text
                  x={cx}
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
  )
}

export const InflatieImpactWidget = memo(function InflatieImpactWidget({ size, data, href }: Props) {
  // ?? (niet ||): een bewust ingestelde 0%-inflatie is een geldige waarde en
  // mag niet stilzwijgend terugvallen op de 2%-default.
  const inflationRate = data.inflationRate ?? INFLATION

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
    const futureValue = purchasingPower(inflationRate, 10)
    return (
      <WidgetShell module="horizon" size={size} kicker="Inflatie-impact" href={href}>
        <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
          {(inflationRate * 100).toFixed(1)}%
        </p>
        <span className="text-[10px] text-[var(--ink-3)]">/jaar</span>
        <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)]">
          Over 10 jaar is €1.000 nog maar {formatCurrency(futureValue)} waard
        </p>
      </WidgetShell>
    )
  }

  // ── Full: curve + table ────────────────────────────────────
  if (size === 'full') {
    const maxYears = 30
    const tableYears = [5, 10, 20, 30]

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

        {/* SVG curve — vaste pixelhoogte, meet-gebaseerde breedte (geen overflow) */}
        <div className="mt-3">
          <InflationCurve inflationRate={inflationRate} maxYears={maxYears} height={96} />
        </div>

        {/* Table */}
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)] mb-1.5">
            Koopkracht van €1.000
          </p>
          <div className="space-y-1">
            {tableYears.map(year => {
              const futureVal = purchasingPower(inflationRate, year)
              const loss = 1000 - futureVal

              return (
                <div key={year} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--ink-3)] w-12">Jaar {year}</span>
                  <span className="font-mono tabular-nums text-[var(--ink)]">
                    {formatCurrency(futureVal)}
                  </span>
                  <span className="font-mono tabular-nums text-[var(--ink-3)]">
                    -{formatCurrency(loss)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <p className="mt-3 pt-2 border-t border-[var(--border-ed)] font-serif italic text-[11px] text-[var(--ink-3)]">
          Uitgaande van {(inflationRate * 100).toFixed(1)}% jaarlijkse inflatie
        </p>
      </WidgetShell>
    )
  }

  // ── Half (default): SVG curve with inline labels ──────────
  const maxYears = 30

  const milestones: Milestone[] = [
    { year: 0, label: '€1.000' },
    { year: 10, label: formatCurrency(purchasingPower(inflationRate, 10)) },
    { year: 20, label: formatCurrency(purchasingPower(inflationRate, 20)) },
    { year: 30, label: formatCurrency(purchasingPower(inflationRate, 30)) },
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

      {/* SVG declining curve with value labels — vaste pixelhoogte, meet-gebaseerde breedte */}
      <div className="mt-2">
        <InflationCurve
          inflationRate={inflationRate}
          maxYears={maxYears}
          height={64}
          milestones={milestones}
        />
        {/* Tekstalternatief: de curve is aria-hidden; geef de schermlezer de
            concrete eroderende mijlpaalwaarden die anders alleen in de SVG staan. */}
        <p className="sr-only">
          Koopkracht van €1.000 bij {(inflationRate * 100).toFixed(1)}% jaarlijkse inflatie:{' '}
          {milestones
            .filter(m => m.year > 0)
            .map(m => `na ${m.year} jaar nog ${m.label}`)
            .join(', ')}
          .
        </p>
      </div>

      {/* Footnote */}
      <p className="mt-1.5 font-serif italic text-[10px] text-[var(--ink-4)]">
        Koopkracht van €1.000 over {maxYears} jaar
      </p>
    </WidgetShell>
  )
})

'use client'

import { memo, useMemo } from 'react'

/**
 * ForecastSparkline — mini-lijn over het cumulatieve saldo van de
 * 6-maands-vooruitblik. Gebruikt door `CashflowForecast` in de weergavemodus
 * "Eenvoudig", waar de tabel plaatsmaakt voor één eindregel + deze lijn
 * (voorstel FC-1, docs/eenvoudige-weergave-audit.md §7).
 *
 * WAAROM EEN EIGEN LIJN EN NIET EEN BESTAANDE SPARKLINE — bewuste afweging,
 * niet uit onwetendheid:
 *
 *  · `BudgetSparkline` (components/app/budget-sparkline.tsx) schaalt met
 *    `minVal = Math.min(...values.filter(v => v > 0), 0)`. Dat klopt voor een
 *    uitgavenreeks (die hoort vanaf nul gelezen te worden), maar niet voor een
 *    SALDO-reeks: bij een reeks die volledig negatief is blijft het filter leeg
 *    en valt `minVal` op 0 terug, waarna de punten buiten het canvas belanden;
 *    bij een positieve reeks met kleine relatieve variatie (7.000 → 12.000)
 *    wordt de lijn vrijwel vlak omdat de as bij nul begint. Het is dus geen
 *    bug in die component maar een andere grootheid.
 *  · `CryptoSparkline` schaalt wél correct op min/max, maar hangt aan het
 *    `CryptoSparklinePoint`-datacontract uit de crypto-holdings-app. Een
 *    cashflow-vooruitblik daaraan koppelen zou een domeinafhankelijkheid
 *    introduceren die er niet hoort.
 *
 * Deze variant neemt daarom een kaal `number[]` en schaalt op de echte min/max
 * van de reeks — negatieve saldi inbegrepen. Geen as, geen labels: de eindregel
 * ernaast draagt het cijfer, de lijn draagt alleen de richting.
 */

export type ForecastTrend = 'up' | 'down' | 'flat'

/** Richting op basis van eerste vs. laatste punt — zes maanden is te kort voor
 *  een zinvolle regressie, en de gebruiker leest hier "loopt het op of af?". */
function detectTrend(values: number[]): ForecastTrend {
  if (values.length < 2) return 'flat'
  const first = values[0]
  const last = values[values.length - 1]
  if (!Number.isFinite(first) || !Number.isFinite(last)) return 'flat'
  // Drempel van 0,5% van de grootste absolute waarde, zodat ruis geen richting krijgt.
  const scale = Math.max(Math.abs(first), Math.abs(last), 1)
  const delta = (last - first) / scale
  if (delta > 0.005) return 'up'
  if (delta < -0.005) return 'down'
  return 'flat'
}

function trendColorClass(trend: ForecastTrend): string {
  // Semantiek blijft semantisch (CLAUDE.md): een oplopend saldo is positief,
  // een aflopend negatief — dit volgt de accentkleurkeuze bewust NIET.
  if (trend === 'up') return 'text-positive'
  if (trend === 'down') return 'text-negative'
  return 'text-[var(--ink-4)]'
}

export const ForecastSparkline = memo(function ForecastSparkline({
  values,
  width = 96,
  height = 28,
  className = '',
  testId,
}: {
  /** Cumulatief saldo per maand, chronologisch (oudste eerst). Mag negatief zijn. */
  values: number[]
  width?: number
  height?: number
  className?: string
  testId?: string
}) {
  const { linePath, lastPoint, trend, hasData } = useMemo(() => {
    const finite = values.filter((v) => Number.isFinite(v))
    if (finite.length < 2) {
      return {
        linePath: '',
        lastPoint: null as { x: number; y: number } | null,
        trend: 'flat' as ForecastTrend,
        hasData: false,
      }
    }

    const padding = { top: 3, bottom: 3, left: 2, right: 2 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    const maxVal = Math.max(...finite)
    const minVal = Math.min(...finite)
    // Vlakke reeks → range 1 zodat elke punt op de middenlijn landt i.p.v. NaN.
    const range = maxVal - minVal || 1

    const points = finite.map((v, i) => ({
      x: padding.left + (i / (finite.length - 1)) * chartWidth,
      // Inverteer Y: hogere waarde = lagere y (boven in de SVG).
      y: padding.top + chartHeight - ((v - minVal) / range) * chartHeight,
    }))

    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`
    }

    return {
      linePath: path,
      lastPoint: points[points.length - 1],
      trend: detectTrend(finite),
      hasData: true,
    }
  }, [values, width, height])

  if (!hasData) {
    return (
      <div
        className={`inline-flex items-center text-[var(--ink-4)] ${className}`}
        data-testid={testId}
        data-trend="none"
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <line
            x1={4}
            y1={height / 2}
            x2={width - 4}
            y2={height / 2}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray="3 2"
            opacity={0.6}
          />
        </svg>
      </div>
    )
  }

  return (
    <div
      className={`inline-flex items-center ${trendColorClass(trend)} ${className}`}
      data-testid={testId}
      data-trend={trend}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        {/* Gestippeld: alle zes de punten zijn een doortrekking, geen historie. */}
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="3 2"
        />
        {lastPoint && (
          <circle cx={lastPoint.x} cy={lastPoint.y} r={2} fill="currentColor" />
        )}
      </svg>
    </div>
  )
})

'use client'

// crypto-sparkline.tsx — pure SVG mini-chart voor de tabel-view van de
// crypto Holdings-app. Toont de prijs-trend over een korte periode (default
// 7 dagen) als één-lijns sparkline, gekleurd naar richting:
//
//   - positief (eind > start)  → text-positive  (groen)
//   - negatief (eind < start)  → text-negative  (rood)
//   - plat / onbekend          → text-[var(--ink-4)]
//
// Bewuste keuzes:
//   - Geen as, geen labels — pure visual indicator naast de cijfer-kolommen.
//   - `currentColor` op de stroke + Tailwind text-color class → trend-kleur
//     volgt het container-element zonder fill-prop te hoeven proberen.
//   - useInViewAnimation met pathLength=1 + strokeDashoffset → draw-in van de
//     lijn wanneer de tabel in view komt (300ms cubic-bezier). Respecteert
//     prefers-reduced-motion via de hook.
//   - Subtiele eindpunt-dot voor visueel anker (helpt het scannen — oog landt
//     op de meest recente prijs).
//   - Bij <2 datapoints rendert een gestippelde horizontale streep — dezelfde
//     "geen data"-indicator als budget-sparkline, voor consistentie.

import { memo, useMemo } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { CryptoSparklinePoint } from '@/lib/crypto-holdings-data'

export type CryptoSparklineTrend = 'up' | 'down' | 'flat'

interface CryptoSparklineProps {
  /** Chronologisch gesorteerde datapunten (oudste eerst). */
  data: CryptoSparklinePoint[]
  /** SVG-breedte in px. Default: 64. */
  width?: number
  /** SVG-hoogte in px. Default: 20. */
  height?: number
  /** Optionele extra container-classes (bv. voor margin/alignment). */
  className?: string
  /** data-testid voor regression tests. */
  testId?: string
}

/**
 * Bepaalt de trend op basis van eerste vs. laatste punt — bewust simpel
 * (geen regressie zoals budget-sparkline) omdat 7 dagen te kort is voor een
 * statistisch zinvolle slope. De gebruiker leest "is het hoger of lager dan
 * een week geleden?" — dat is precies wat eerste-vs-laatste vertelt.
 */
function detectTrend(data: CryptoSparklinePoint[]): CryptoSparklineTrend {
  if (data.length < 2) return 'flat'
  const first = data[0].close
  const last = data[data.length - 1].close
  if (!isFinite(first) || !isFinite(last)) return 'flat'
  // Drempel van 0.1% om micro-bewegingen niet als trend te markeren.
  const delta = (last - first) / Math.max(Math.abs(first), 1e-9)
  if (delta > 0.001) return 'up'
  if (delta < -0.001) return 'down'
  return 'flat'
}

function trendColorClass(trend: CryptoSparklineTrend): string {
  if (trend === 'up') return 'text-positive'
  if (trend === 'down') return 'text-negative'
  return 'text-[var(--ink-4)]'
}

export const CryptoSparkline = memo(function CryptoSparkline({
  data,
  width = 64,
  height = 20,
  className = '',
  testId,
}: CryptoSparklineProps) {
  // Animatie: 300ms draw-in. Korte duration past bij de tabel-context waar
  // tientallen sparklines tegelijk in view komen — een trage animatie zou
  // de pagina rusteloos maken.
  const { ref, hasEntered } = useInViewAnimation({
    duration: 300,
    rootMargin: '0px 0px -20px 0px',
  })

  const { linePath, lastPoint, trend, hasData } = useMemo(() => {
    if (data.length < 2) {
      return {
        linePath: '',
        lastPoint: null as { x: number; y: number } | null,
        trend: 'flat' as CryptoSparklineTrend,
        hasData: false,
      }
    }

    const padding = { top: 3, bottom: 3, left: 2, right: 2 }
    const chartWidth = width - padding.left - padding.right
    const chartHeight = height - padding.top - padding.bottom

    const values = data.map((p) => p.close)
    const maxVal = Math.max(...values)
    const minVal = Math.min(...values)
    const range = maxVal - minVal || 1

    const points = values.map((v, i) => ({
      x: padding.left + (i / (values.length - 1)) * chartWidth,
      // Inverteer Y: hogere waarde = lagere y (boven in SVG).
      y: padding.top + chartHeight - ((v - minVal) / range) * chartHeight,
    }))

    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`
    }

    return {
      linePath: path,
      lastPoint: points[points.length - 1],
      trend: detectTrend(data),
      hasData: true,
    }
  }, [data, width, height])

  // Lege/sparse data — neutrale gestippelde streep, dezelfde stijl als de
  // budget-sparkline empty state. Geen animatie nodig, geen kleurinformatie.
  if (!hasData) {
    return (
      <div
        ref={ref}
        className={`inline-flex items-center text-[var(--ink-4)] ${className}`}
        data-testid={testId}
        data-trend="none"
        aria-label="Geen prijsverloop beschikbaar"
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
        >
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

  const colorClass = trendColorClass(trend)
  const lineAnim = hasEntered
    ? 'drawPath 300ms cubic-bezier(.22,1,.36,1) both'
    : 'none'

  return (
    <div
      ref={ref}
      className={`inline-flex items-center ${colorClass} ${className}`}
      data-testid={testId}
      data-trend={trend}
      aria-label={
        trend === 'up'
          ? 'Prijs gestegen over de weergegeven periode'
          : trend === 'down'
            ? 'Prijs gedaald over de weergegeven periode'
            : 'Prijs ongeveer gelijk over de weergegeven periode'
      }
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
      >
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={hasEntered ? 0 : 1}
          style={{
            // Inline transition i.p.v. Tailwind class voor exacte timing-controle
            // (duration matcht de useInViewAnimation duration boven).
            transition: hasEntered
              ? 'stroke-dashoffset 300ms cubic-bezier(.22,1,.36,1)'
              : 'none',
            animation: lineAnim,
          }}
        />
        {/* Eindpunt-dot — visueel anker op de meest recente prijs. Verschijnt
            net na de lijn-draw zodat het oog de animatie volgt naar het einde. */}
        {lastPoint && (
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={1.5}
            fill="currentColor"
            opacity={hasEntered ? 1 : 0}
            style={{
              transition: hasEntered ? 'opacity 120ms ease-out 280ms' : 'none',
            }}
          />
        )}
      </svg>
    </div>
  )
})

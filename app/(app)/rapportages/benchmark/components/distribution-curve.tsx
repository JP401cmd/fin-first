'use client'

/**
 * DistributionCurve — log-normale verdelingscurve voor een continue metric
 * (netto vermogen / inkomen) met verticale markers voor jou, de mediaan en
 * (alleen vermogen) het NL-gemiddelde.
 *
 * Pure presentatie: de curve-vorm komt uit `curve{mode,max,spread}` en de
 * marker-posities uit de ruwe waarden — niets wordt financieel herberekend.
 * De wiskunde is een 1-op-1 port van de `curve()`-renderer uit het bron-ontwerp.
 *
 * Draw-on animatie (stroke-dashoffset) bij in-view; respecteert reduced-motion
 * via `useInViewAnimation`.
 */

import { useMemo } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { VIZ } from './viz-palette'

export interface DistributionCurveProps {
  /** Vorm-parameters (log-normaal, gecentreerd op `mode`). */
  curve: { mode: number; max: number; spread: number }
  /** Jouw waarde (ink-marker). */
  you: number | null
  /** Mediaan/peer (purpleSoft, dashed). */
  peer: number | null
  /** NL-gemiddeld (gold, dashed) — alleen vermogen. */
  avg?: number | null
  /** Uniek id voor de gradient-def. */
  gradientId: string
  /** Privacy-masker: verbergt de €-sublabels onder de markers. */
  masked?: boolean
}

const W = 880
const H = 174
const PAD_X = 10
const PAD_TOP = 14
const PAD_BOT = 60
const N = 120

/** Compacte EUR-notatie voor de marker-sublabels (€127k / €58200). */
function fmtEur(v: number): string {
  return '€' + (v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v))
}

interface Marker {
  x: number
  color: string
  label: string
  sub: string
  dash: string
  yShift: number
}

export function DistributionCurve({ curve, you, peer, avg, gradientId, masked = false }: DistributionCurveProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1100, threshold: 0.2 })

  const geometry = useMemo(() => {
    const x0 = PAD_X
    const x1 = W - PAD_X
    const y0 = H - PAD_BOT
    const y1 = PAD_TOP
    const mu = curve.mode
    const sigma = curve.spread
    const max = curve.max
    const min = 0

    const f = (v: number) => {
      const z = (Math.log(v + 1) - Math.log(mu + 1)) / sigma
      return Math.exp(-0.5 * z * z)
    }

    const pts: [number, number][] = []
    let peak = 0
    for (let i = 0; i <= N; i++) {
      const v = min + (max - min) * (i / N)
      const y = f(v)
      if (y > peak) peak = y
      pts.push([v, y])
    }

    const sx = (v: number) => x0 + (x1 - x0) * ((v - min) / (max - min))
    const sy = (y: number) => y0 - (y0 - y1) * (y / peak)

    let area = `M ${sx(min)} ${y0}`
    pts.forEach(p => (area += ` L ${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`))
    area += ` L ${sx(max)} ${y0} Z`

    let stroke = `M ${sx(pts[0][0])} ${sy(pts[0][1])}`
    pts.forEach(p => (stroke += ` L ${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`))

    const near = (a: number, b: number) => Math.abs(sx(a) - sx(b)) < (x1 - x0) * 0.1

    const sub = (v: number) => (masked ? '' : fmtEur(v))

    const markers: Marker[] = []
    if (avg != null) {
      markers.push({ x: sx(avg), color: VIZ.gold, label: 'NL-gem.', sub: sub(avg), dash: '4 3', yShift: 0 })
    }
    if (peer != null) {
      markers.push({ x: sx(peer), color: VIZ.purpleSoft, label: 'mediaan', sub: sub(peer), dash: '4 3', yShift: 0 })
    }
    if (you != null) {
      const shiftYou = peer != null && near(you, peer) ? 26 : 0
      markers.push({ x: sx(you), color: VIZ.ink, label: 'jij', sub: sub(you), dash: '0', yShift: shiftYou })
    }

    return { area, stroke, x0, x1, y0, y1, markers }
  }, [curve, you, peer, avg, masked])

  return (
    <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={VIZ.purpleSoft} stopOpacity="0.45" />
            <stop offset="100%" stopColor={VIZ.purpleSoft} stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* gevulde oppervlakte */}
        <path
          d={geometry.area}
          fill={`url(#${gradientId})`}
          style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 1s ease .3s' }}
        />

        {/* curve-lijn met draw-on (pathLength normaliseert de dash-animatie) */}
        <path
          d={geometry.stroke}
          fill="none"
          stroke={VIZ.purple}
          strokeWidth="1.5"
          strokeOpacity="0.55"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={hasEntered ? 0 : 1}
          style={{ transition: 'stroke-dashoffset 1.1s ease' }}
        />

        {/* basislijn */}
        <line x1={geometry.x0} y1={geometry.y0} x2={geometry.x1} y2={geometry.y0} stroke={VIZ.line} strokeWidth="1" />

        {/* markers */}
        {geometry.markers.map((m, i) => {
          const baseY = geometry.y0 + 15 + m.yShift
          return (
            <g key={`${m.label}-${i}`}>
              <line
                x1={m.x}
                y1={geometry.y1 - 2}
                x2={m.x}
                y2={geometry.y0}
                stroke={m.color}
                strokeWidth="2"
                strokeDasharray={m.dash}
              />
              <text
                x={m.x}
                y={baseY}
                textAnchor="middle"
                fill={m.color}
                fontFamily="var(--font-dm-mono, monospace)"
                fontSize="10.5"
                fontWeight="600"
              >
                {m.label}
              </text>
              {m.sub && (
                <text
                  x={m.x}
                  y={baseY + 12}
                  textAnchor="middle"
                  fill={VIZ.muted}
                  fontFamily="var(--font-dm-mono, monospace)"
                  fontSize="9"
                >
                  {m.sub}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

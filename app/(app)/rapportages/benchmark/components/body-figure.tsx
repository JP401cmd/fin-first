'use client'

/**
 * BodyFigure — Sectie I van de benchmark-spiegel: "Jij — in beeld".
 *
 * Een redactionele lijn-tekening van een (vitaal, rechtop) menselijk lichaam met
 * de financiële gezondheid als kern-ring in de borst, en vier satelliet-cijfers
 * (vrijheidsleeftijd, spaarquote, netto vermogen, jaarinkomen) met dunne
 * verbindingslijntjes naar het lichaam.
 *
 * Pure consument: alle waarden komen uit `metrics[]` (via `/api/report/benchmark`).
 * Er wordt NIETS herberekend — de ring-sweep is louter `userValue/100`.
 *
 * Elk primair cijfer (de 4 satellieten + de borst-score) is klikbaar en opent
 * de gedeelde detail-sheet via `onMetricClick`.
 *
 * Reveal + ring-draw + satelliet-fade animeren bij in-view (useInViewAnimation),
 * en respecteren `prefers-reduced-motion`.
 */

import { useEffect, useRef, useState } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { BenchmarkMetric } from '@/lib/benchmark-report-data'
import { FinDots } from '@/components/app/fin-dots'
import { VIZ } from './viz-palette'

const RING_R = 60
const RING_CIRC = 2 * Math.PI * RING_R // ≈ 376.99
/** Verticale verschuiving (px) van de gezondheids-ring t.o.v. de oorspronkelijke
 *  borstpositie (cy=300) — iets lager op de borst (richting hart) gezet. */
const RING_DY = 30

/**
 * Fin-als-gezicht: de drie-stippen-avatar (knipperende ogen + mond, in de
 * module-accentkleuren) wordt als gezicht op het hoofd van de lijntekening
 * gezet — een speelse knipoog in de Spiegel. Coördinaten liggen op het gezicht
 * van de body-PNG (vierkant, beeld op x=28 y=42 560×560 → hoofd ≈ x 308, y 142).
 */
const FACE_CX = 308
const FACE_CY = 172
const FACE_SIZE = 78
/** Horizontale uitslag (px) van de speelse "kijk naar links/rechts"-beweging. */
const GLANCE_PX = 6

export interface BodyFigureProps {
  /** Alle metrics, op key opgezocht. */
  metrics: BenchmarkMetric[]
  /** Geformatteerde gebruikerswaarde per unit (eur masked-aware). */
  formatValue: (value: number | null, unit: BenchmarkMetric['unit']) => string
  /** Opent de detail-sheet voor de aangeklikte metric. */
  onMetricClick: (metric: BenchmarkMetric) => void
}

/** Vrijheidstijd-/peer-subregel afgeleid uit user − referentie. */
function subLine(m: BenchmarkMetric, fmt: BodyFigureProps['formatValue']): string {
  if (m.userValue == null || m.referenceValue == null) return ''
  const diff = m.userValue - m.referenceValue
  switch (m.unit) {
    case 'age': {
      // Lager is beter: positief verschil = later dan peer.
      const yrs = Math.abs(Math.round(diff))
      if (yrs === 0) return 'gelijk aan peer'
      return diff < 0 ? `${yrs} jaar eerder dan peer` : `${yrs} jaar later dan peer`
    }
    case 'pct': {
      return `peer ${Math.round(m.referenceValue)}%`
    }
    case 'eur': {
      const sign = diff >= 0 ? '+' : '−'
      // Inkomen is een geraamde referentie (equivalentiefactor), géén mediaan.
      const ref = m.key === 'income' ? 'referentie' : 'mediaan'
      return `${sign}${fmt(Math.abs(diff), 'eur')} vs ${ref}`
    }
    case 'score': {
      return `peer ${Math.round(m.referenceValue)}`
    }
  }
}

type BodyBand = 'low' | 'mid' | 'fit' | 'peak'

/**
 * Lichaamsbouw volgt het gezondheidscijfer (gevraagde banden):
 *   <40 verzwakt · 40–60 redelijk · 61–95 sterk · 95+ uitstekend.
 */
function bodyBand(score: number | null): BodyBand {
  if (score == null) return 'fit'
  if (score < 40) return 'low'
  if (score < 61) return 'mid'
  if (score < 95) return 'fit'
  return 'peak'
}

/**
 * Per gezondheidsband een eigen lijntekening-PNG (vervangt de eerder getekende
 * SVG-paden). De crème bron-achtergrond wordt weggemaskeerd via de SVG-filter
 * `#bfInkKnockout` zodat enkel de inkt-lijnen overblijven. Eén gedeelde
 * uitlijn-box voor alle vier de banden — het vormverschil zit in het beeld zelf.
 */
const BODY_SRC: Record<BodyBand, string> = {
  low: '/reports/benchmark/body-low.png',
  mid: '/reports/benchmark/body-mid.png',
  fit: '/reports/benchmark/body-fit.png',
  peak: '/reports/benchmark/body-peak.png',
}

export function BodyFigure({ metrics, formatValue, onMetricClick }: BodyFigureProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1200, threshold: 0.2 })

  // --- Speelse "kijk naar links/rechts"-beweging van het Fin-gezicht ---
  // Naast het knipperen + mondbeweging (in FinDots zelf) glijdt de héle avatar
  // af en toe een paar pixels opzij, zodat het lijkt of het hoofd rondkijkt.
  // Bewust lokaal in de Spiegel: FinDots blijft app-breed ongewijzigd.
  const [lookOffset, setLookOffset] = useState(0)
  const glanceTimers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    let cancelled = false
    const timers = glanceTimers.current

    function scheduleGlance() {
      if (cancelled) return
      // Rustige, willekeurige tussenpozen (4–9s) zodat het "af en toe" voelt.
      const delay = 4000 + Math.random() * 5000
      const t = setTimeout(() => {
        if (cancelled) return
        const dir = Math.random() < 0.5 ? -1 : 1
        setLookOffset(dir * GLANCE_PX)
        const t2 = setTimeout(() => {
          if (cancelled) return
          // ~40% kans: eerst de andere kant op kijken voordat het hoofd terugkomt.
          if (Math.random() < 0.4) {
            setLookOffset(-dir * GLANCE_PX)
            const t3 = setTimeout(() => {
              if (cancelled) return
              setLookOffset(0)
              scheduleGlance()
            }, 800)
            timers.push(t3)
          } else {
            setLookOffset(0)
            scheduleGlance()
          }
        }, 900)
        timers.push(t2)
      }, delay)
      timers.push(t)
    }

    scheduleGlance()

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      timers.length = 0
    }
  }, [])

  const byKey = (k: BenchmarkMetric['key']) => metrics.find(m => m.key === k) ?? null
  const health = byKey('health')
  const fireAge = byKey('fire_age')
  const savings = byKey('savings_rate')
  const netWorth = byKey('net_worth')
  const income = byKey('income')

  // Ring-geometrie uit de gezondheidsscore (0–100). Sweep ∝ userValue/100.
  const healthFrac =
    health?.userValue != null ? Math.max(0, Math.min(1, health.userValue / 100)) : 0
  const ringOffset = hasEntered ? RING_CIRC * (1 - healthFrac) : RING_CIRC
  const peerFrac =
    health?.referenceValue != null ? Math.max(0, Math.min(1, health.referenceValue / 100)) : null
  // Peer-marker: positie rond de ring (start bovenaan, met de klok mee).
  const peerAngle = peerFrac != null ? peerFrac * 360 : null

  const healthValue = formatValue(health?.userValue ?? null, 'score')
  const peerScoreLabel = health?.referenceValue != null ? Math.round(health.referenceValue) : null

  // Lichaamsbouw volgt het gezondheidscijfer (<40 verzwakt … 95+ atletisch).
  const band = bodyBand(health?.userValue ?? null)

  // Klik-helper: alleen klikbaar als de metric bestaat.
  const clickable = (m: BenchmarkMetric | null) =>
    m
      ? {
          role: 'button' as const,
          tabIndex: 0,
          style: { cursor: 'pointer' as const, outline: 'none' },
          onClick: () => onMetricClick(m),
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onMetricClick(m)
            }
          },
          'aria-label': `Toelichting bij ${m.label}`,
        }
      : {}

  // Satelliet-fade-vertraging per index (na de ring).
  const fadeStyle = (i: number): React.CSSProperties => ({
    opacity: hasEntered ? 1 : 0,
    transition: `opacity .6s ease ${0.4 + i * 0.12}s`,
  })

  return (
    <div
      ref={ref}
      className="relative mx-auto mt-2 w-full max-w-[760px]"
      style={{
        opacity: hasEntered ? 1 : 0,
        transform: hasEntered ? 'none' : 'translateY(14px)',
        transition: 'opacity .7s ease, transform .7s ease',
      }}
    >
      <svg
        viewBox="0 0 760 600"
        className="block h-auto w-full overflow-visible"
        fontFamily="var(--font-dm-mono, monospace)"
      >
        <defs>
          <radialGradient id="bfHealthGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={VIZ.purple} stopOpacity="0.18" />
            <stop offset="100%" stopColor={VIZ.purple} stopOpacity="0" />
          </radialGradient>
          {/*
           * Crème-knockout: zet elke pixel op inkt-kleur (#1c1814 = VIZ.ink) en
           * berekent alpha = 1 − lum/0.90, zodat de crème bron-achtergrond
           * transparant wordt en de donkere lijnen als inkt overblijven.
           *
           * Filter-regio EXACT op de bron (x=0 y=0 100%×100%, geen marge): de
           * +1.0-constante in de alpha-rij zou anders de transparante padding
           * buiten het beeld tot ondoorzichtig zwart maken (zwart kader rond de
           * figuur). De PNG is randdekkend crème, dus binnen de regio is er geen
           * transparante invoer en blijft het kader weg.
           */}
          <filter
            id="bfInkKnockout"
            x="0"
            y="0"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.110
                      0 0 0 0 0.094
                      0 0 0 0 0.078
                      -0.332 -0.652 -0.127 0 1.0"
            />
          </filter>
        </defs>

        {/* connector lines (achter het lichaam) */}
        <g stroke={VIZ.line} strokeWidth="1" fill="none">
          <path d="M214 234 Q188 184 168 152" style={fadeStyle(0)} />
          <path d={`M246 ${300 + RING_DY} L150 ${300 + RING_DY}`} style={fadeStyle(1)} />
          <path d="M402 234 Q468 184 540 152" style={fadeStyle(2)} />
          <path d="M402 344 L560 356" style={fadeStyle(3)} />
        </g>

        {/* ===== lichaam — lijntekening-PNG per band, crème weggemaskeerd ===== */}
        <image
          href={BODY_SRC[band]}
          x={28}
          y={42}
          width={560}
          height={560}
          preserveAspectRatio="xMidYMid meet"
          filter="url(#bfInkKnockout)"
          aria-hidden="true"
        />

        {/* ===== Fin-als-gezicht: drie-stippen-avatar op het hoofd ===== */}
        {/* Live SVG-avatar (knipperen + mond) via foreignObject; de wrapper-div
            schuift af en toe opzij (lookOffset) zodat het hoofd lijkt rond te
            kijken. Decoratief → geen pointer-events. */}
        <foreignObject
          x={FACE_CX - FACE_SIZE / 2}
          y={FACE_CY - FACE_SIZE / 2}
          width={FACE_SIZE}
          height={FACE_SIZE}
          aria-hidden="true"
          style={{ overflow: 'visible', pointerEvents: 'none' }}
        >
          <div
            aria-hidden="true"
            style={{
              width: FACE_SIZE,
              height: FACE_SIZE,
              transform: `translateX(${lookOffset}px)`,
              transition: 'transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <FinDots size={FACE_SIZE} state="idle" />
          </div>
        </foreignObject>

        {/* ===== borst-kern: financiële gezondheid (iets lager op de borst) ===== */}
        <g transform={`translate(0 ${RING_DY})`}>
        <circle cx="308" cy="300" r="98" fill="url(#bfHealthGlow)" />
        <circle cx="308" cy="300" r={RING_R} fill={VIZ.card} stroke={VIZ.line} strokeWidth="1" />
        <circle cx="308" cy="300" r={RING_R} fill="none" stroke="#e7dec9" strokeWidth="6" />
        {/* progress-arc — sweep ∝ healthFrac (draw-on via dashoffset) */}
        <circle
          cx="308"
          cy="300"
          r={RING_R}
          fill="none"
          stroke={VIZ.purple}
          strokeWidth="6"
          strokeLinecap="round"
          transform="rotate(-90 308 300)"
          strokeDasharray={RING_CIRC}
          strokeDashoffset={ringOffset}
          style={{ transition: 'stroke-dashoffset 1.2s ease .15s' }}
        />
        {/* peer-marker op de ring */}
        {peerAngle != null && (
          <g transform={`rotate(${peerAngle - 90} 308 300)`} style={fadeStyle(4)}>
            <circle
              cx={308 + RING_R}
              cy="300"
              r="4"
              fill={VIZ.purpleSoft}
              stroke={VIZ.card}
              strokeWidth="1.5"
            />
          </g>
        )}

        {/* borst-score — klikbaar */}
        <g {...clickable(health)}>
          {/* onzichtbaar groter klik-/focusvlak */}
          <circle cx="308" cy="300" r={RING_R} fill="transparent" />
          <text
            x="308"
            y="296"
            textAnchor="middle"
            fontFamily="var(--font-playfair, serif)"
            fontWeight="900"
            fontSize="50"
            fill={VIZ.ink}
          >
            {healthValue}
          </text>
          <text x="308" y="320" textAnchor="middle" fontSize="9" letterSpacing="2.2" fill={VIZ.muted}>
            GEZONDHEID
          </text>
          {peerScoreLabel != null && (
            <text x="308" y="404" textAnchor="middle" fontSize="9.5" fill={VIZ.purpleSoft}>
              ● peer {peerScoreLabel}
            </text>
          )}
        </g>
        </g>

        {/* ===== satelliet-cijfers ===== */}
        {/* Vrijheidsleeftijd (linksboven) */}
        {fireAge && (
          <g {...clickable(fireAge)} style={fadeStyle(0)} textAnchor="middle">
            <text
              x="158"
              y="120"
              fontFamily="var(--font-playfair, serif)"
              fontWeight="900"
              fontSize="38"
              fill={VIZ.ink}
            >
              {formatValue(fireAge.userValue, 'age')}
            </text>
            <text x="158" y="138" fontSize="9" letterSpacing="2" fill={VIZ.muted}>
              VRIJHEIDSLEEFTIJD
            </text>
            <text
              x="158"
              y="154"
              fontFamily="var(--font-source-serif, serif)"
              fontStyle="italic"
              fontSize="12"
              fill={VIZ.purple}
            >
              {subLine(fireAge, formatValue)}
            </text>
          </g>
        )}

        {/* Spaarquote (links) */}
        {savings && (
          <g {...clickable(savings)} style={fadeStyle(1)} textAnchor="middle">
            <text
              x="104"
              y="294"
              fontFamily="var(--font-playfair, serif)"
              fontWeight="900"
              fontSize="40"
              fill={VIZ.ink}
            >
              {formatValue(savings.userValue, 'pct')}
            </text>
            <text x="104" y="312" fontSize="9" letterSpacing="2" fill={VIZ.muted}>
              SPAARQUOTE
            </text>
            <text
              x="104"
              y="328"
              fontFamily="var(--font-source-serif, serif)"
              fontStyle="italic"
              fontSize="12"
              fill={VIZ.purple}
            >
              {subLine(savings, formatValue)}
            </text>
          </g>
        )}

        {/* Netto vermogen (rechtsboven) */}
        {netWorth && (
          <g {...clickable(netWorth)} style={fadeStyle(2)} textAnchor="middle">
            <text
              x="592"
              y="120"
              fontFamily="var(--font-playfair, serif)"
              fontWeight="900"
              fontSize="30"
              fill={VIZ.ink}
            >
              {formatValue(netWorth.userValue, 'eur')}
            </text>
            <text x="592" y="138" fontSize="9" letterSpacing="2" fill={VIZ.muted}>
              NETTO VERMOGEN
            </text>
            <text
              x="592"
              y="154"
              fontFamily="var(--font-source-serif, serif)"
              fontStyle="italic"
              fontSize="12"
              fill={VIZ.purple}
            >
              {subLine(netWorth, formatValue)}
            </text>
          </g>
        )}

        {/* Jaarinkomen (rechts) */}
        {income && (
          <g {...clickable(income)} style={fadeStyle(3)} textAnchor="middle">
            <text
              x="624"
              y="352"
              fontFamily="var(--font-playfair, serif)"
              fontWeight="900"
              fontSize="30"
              fill={VIZ.ink}
            >
              {formatValue(income.userValue, 'eur')}
            </text>
            <text x="624" y="370" fontSize="9" letterSpacing="2" fill={VIZ.muted}>
              JAARINKOMEN
            </text>
            <text
              x="624"
              y="386"
              fontFamily="var(--font-source-serif, serif)"
              fontStyle="italic"
              fontSize="12"
              fill={VIZ.purple}
            >
              {subLine(income, formatValue)}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}

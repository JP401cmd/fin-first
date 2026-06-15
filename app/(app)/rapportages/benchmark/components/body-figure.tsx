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

import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { BenchmarkMetric } from '@/lib/benchmark-report-data'
import { VIZ } from './viz-palette'

const RING_R = 60
const RING_CIRC = 2 * Math.PI * RING_R // ≈ 376.99

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
      return `${sign}${fmt(Math.abs(diff), 'eur')} vs mediaan`
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
 * De getekende torso per gezondheidsband. Hoofd, nek en sleutelbeen zijn gedeeld;
 * schouders, romp, armen en spierdefinitie variëren:
 *   low  — zwaar/rond, hangende schouders, buik breder dan borst (zachte plooien)
 *   mid  — gemiddeld, licht zachte middenpartij
 *   fit  — atletische V-taper, strakke taille, subtiele buikspieren
 *   peak — zeer gespierd, brede deltoïden, V-cut, zichtbare buikspieren
 *
 * De borst-kern-ring (cx308/cy300) blijft per band op zijn plek.
 */
function BodyOutline({ band }: { band: BodyBand }) {
  return (
    <>
      {/* gedeeld: hoofd, kaak, nek, sleutelbeen */}
      <ellipse cx="300" cy="90" rx="38" ry="45" />
      <path d="M282 130 Q300 149 318 130" />
      <path d="M291 145 Q289 159 290 172" />
      <path d="M309 145 Q311 159 310 172" />
      <path d="M254 196 Q300 184 346 196" strokeWidth="0.9" stroke={VIZ.brown} />

      {band === 'low' && (
        <>
          {/* hangende schouders → romp bolt uit naar een brede buik */}
          <path d="M290 172 Q256 180 224 200 Q200 218 192 256" />
          <path d="M310 172 Q344 180 376 200 Q400 218 408 256" />
          <path d="M192 256 Q176 340 178 408 Q182 452 214 476" />
          <path d="M408 256 Q424 340 422 408 Q418 452 386 476" />
          <path d="M214 476 Q300 498 386 476" />
          {/* dikke armen, weinig taper */}
          <path d="M192 256 Q166 342 170 446 Q172 460 182 466" />
          <path d="M408 256 Q434 342 430 446 Q428 460 418 466" />
          <path d="M182 466 Q196 474 214 470" strokeWidth="1.2" />
          <path d="M418 466 Q404 474 386 470" strokeWidth="1.2" />
          {/* zachte, hangende borst + buikplooi + navel */}
          <path d="M252 236 Q300 260 348 236" strokeWidth="0.8" stroke={VIZ.brown} />
          <path d="M246 414 Q300 404 354 414" strokeWidth="0.8" stroke={VIZ.brown} />
          <path d="M300 430 L300 438" strokeWidth="0.8" stroke={VIZ.brown} />
        </>
      )}

      {band === 'mid' && (
        <>
          {/* gemiddelde schouders, vrijwel rechte romp met zachte middenpartij */}
          <path d="M290 174 Q254 176 220 196 Q196 212 188 254" />
          <path d="M310 174 Q346 176 380 196 Q404 212 412 254" />
          <path d="M188 254 Q188 348 206 430 Q212 458 226 474" />
          <path d="M412 254 Q412 348 394 430 Q388 458 374 474" />
          <path d="M226 474 Q300 494 374 474" />
          <path d="M188 254 Q162 338 170 448 Q172 462 182 460" />
          <path d="M412 254 Q438 338 430 448 Q428 462 418 460" />
          <path d="M182 460 Q196 470 214 465" strokeWidth="1.2" />
          <path d="M418 460 Q404 470 386 465" strokeWidth="1.2" />
          {/* zachte borstlijn + lichte buik + navel */}
          <path d="M254 230 Q300 250 346 230" strokeWidth="0.8" stroke={VIZ.brown} />
          <path d="M260 406 Q300 398 340 406" strokeWidth="0.8" stroke={VIZ.brown} />
          <path d="M300 414 L300 421" strokeWidth="0.8" stroke={VIZ.brown} />
        </>
      )}

      {band === 'fit' && (
        <>
          {/* brede schouders, V-taper, strakke taille */}
          <path d="M290 172 Q252 171 220 190 Q190 206 180 246 Q178 257 180 268" />
          <path d="M310 172 Q348 171 380 190 Q410 206 420 246 Q422 257 420 268" />
          <path d="M180 268 Q192 342 220 396" />
          <path d="M420 268 Q408 342 380 396" />
          <path d="M220 396 Q204 438 232 472" />
          <path d="M380 396 Q396 438 368 472" />
          <path d="M232 472 Q300 492 368 472" />
          <path d="M180 246 Q156 320 164 416 Q166 432 176 444" />
          <path d="M420 246 Q444 320 436 416 Q434 432 424 444" />
          <path d="M176 444 Q190 454 210 449" strokeWidth="1.2" />
          <path d="M424 444 Q410 454 390 449" strokeWidth="1.2" />
          {/* borstspieren + borstbeen-as + subtiele buikspieren */}
          <path d="M256 228 Q278 242 300 240 Q322 242 344 228" strokeWidth="0.8" stroke={VIZ.brown} />
          <path d="M300 208 L300 238" strokeWidth="0.7" stroke={VIZ.brown} strokeDasharray="2 4" />
          <path d="M300 364 L300 434" strokeWidth="0.7" stroke={VIZ.brown} strokeDasharray="2 4" />
          <path d="M274 390 Q300 384 326 390" strokeWidth="0.7" stroke={VIZ.brown} />
          <path d="M276 412 Q300 407 324 412" strokeWidth="0.7" stroke={VIZ.brown} />
        </>
      )}

      {band === 'peak' && (
        <>
          {/* zeer brede deltoïden → scherpe V-taper → V-cut taille */}
          <path d="M289 168 Q242 162 204 180 Q170 198 156 248 Q154 260 158 272" />
          <path d="M311 168 Q358 162 396 180 Q430 198 444 248 Q446 260 442 272" />
          <path d="M158 272 Q178 336 228 392" />
          <path d="M442 272 Q422 336 372 392" />
          <path d="M228 392 Q244 432 300 474" />
          <path d="M372 392 Q356 432 300 474" />
          {/* gespierde armen */}
          <path d="M156 248 Q128 326 146 428 Q150 446 162 452" />
          <path d="M444 248 Q472 326 454 428 Q450 446 438 452" />
          <path d="M162 452 Q178 462 198 456" strokeWidth="1.2" />
          <path d="M438 452 Q422 462 402 456" strokeWidth="1.2" />
          {/* gedefinieerde borst + borstbeen + 6-pack + V-cut-lijnen */}
          <path d="M250 230 Q300 256 350 230" strokeWidth="0.85" stroke={VIZ.brown} />
          <path d="M300 206 L300 240" strokeWidth="0.7" stroke={VIZ.brown} strokeDasharray="2 4" />
          <path d="M300 362 L300 446" strokeWidth="0.7" stroke={VIZ.brown} strokeDasharray="2 4" />
          <path d="M268 382 Q300 376 332 382" strokeWidth="0.7" stroke={VIZ.brown} />
          <path d="M270 404 Q300 399 330 404" strokeWidth="0.7" stroke={VIZ.brown} />
          <path d="M274 426 Q300 421 326 426" strokeWidth="0.7" stroke={VIZ.brown} />
          <path d="M236 398 Q272 440 300 470" strokeWidth="0.8" stroke={VIZ.brown} />
          <path d="M364 398 Q328 440 300 470" strokeWidth="0.8" stroke={VIZ.brown} />
        </>
      )}
    </>
  )
}

export function BodyFigure({ metrics, formatValue, onMetricClick }: BodyFigureProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1200, threshold: 0.2 })

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
        </defs>

        {/* connector lines (achter het lichaam) */}
        <g stroke={VIZ.line} strokeWidth="1" fill="none">
          <path d="M214 234 Q188 184 168 152" style={fadeStyle(0)} />
          <path d="M246 300 L150 300" style={fadeStyle(1)} />
          <path d="M402 234 Q468 184 540 152" style={fadeStyle(2)} />
          <path d="M402 344 L560 356" style={fadeStyle(3)} />
        </g>

        {/* ===== lichaam — rechtop, vitaal, enkel-gewicht lijntekening ===== */}
        <g
          fill="none"
          stroke={VIZ.ink}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(8,0)"
        >
          <BodyOutline band={band} />
        </g>

        {/* ===== borst-kern: financiële gezondheid ===== */}
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

import type { CSSProperties } from 'react'

/**
 * TaxGauge — radiale donut-gauge voor belasting-grenzen.
 *
 * Toont een genormaliseerde 270°-boog die de verhouding `value / max`
 * weergeeft, met de werkelijke percentage-waarde in het midden. Bedoeld
 * voor heffingsvrij vermogen, jaarruimte, leengrens en soortgelijke
 * "hoeveel van de drempel benut je"-metrieken.
 *
 * Presentatie-only: geen data-fetching, geen state, geen hooks → server-
 * compatible (geen 'use client' nodig). De caller levert reeds-berekende
 * waarden en de module/box-kleur via `colorVar`.
 *
 * Filosofie-context: belasting-drempels zijn vrijheid-grenzen — hoe dichter
 * bij `max`, hoe meer ruimte je benut hebt. variant='danger' kleurt de boog
 * rood en toont "overschrijding" zodra `value > max`.
 *
 * Vormgeving — Editorial Finance: de percentage-waarde in het midden is een
 * Playfair-getal (font-display, font-black) zodat hij als waarde gelezen wordt;
 * label/sublabel in kicker- resp. mono-stijl. Boog met platte uiteinden
 * (butt-linecap) → scherp, editorial. Subtiele depth via track-haarlijn, geen
 * schaduw. De fill-boog tekent zich in via stroke-dashoffset met de canonieke
 * `drawPath`-keyframe (pathLength={1} JSX-attribuut), die door de globale
 * prefers-reduced-motion-regel wordt uitgezet.
 *
 * Boog-techniek: één <circle> als track + één <circle> als fill, beide met
 * `pathLength={1}` (JSX-attribuut, NIET in style) zodat de dash-rekenkunde
 * genormaliseerd is. De fill-lengte is `pct` (geclamped 0–1) van de
 * 270°-boog; track is altijd de volle boog.
 */

export interface TaxGaugeProps {
  /** Werkelijke waarde (bv. benut heffingsvrij vermogen). */
  value: number
  /** Bovengrens / drempel (bv. heffingsvrije voet). */
  max: number
  /** Hoofdlabel onder/in het midden (bv. "heffingsvrij benut"). */
  label: string
  /** Optionele subtekst onder het label (bv. bedrag-context). */
  sublabel?: string
  /** 'danger' kleurt rood + toont "overschrijding" bij value > max. */
  variant?: 'default' | 'danger'
  /** Optioneel label bij de drempel-markering (bv. "grens"). */
  thresholdLabel?: string
  /** CSS-kleurvariabele voor de boog (caller geeft box/module-kleur). */
  colorVar?: string
}

/* 270°-gauge: opening van 45° onderaan. Genormaliseerde dash-arithmetiek
   met pathLength=1 betekent dat de boog 0.75 van de omtrek beslaat. */
const ARC_FRACTION = 0.75
/* Rotatie zodat de opening symmetrisch onderaan zit. Een <circle> begint
   rechts (3 uur) en loopt met de klok mee; -225° plaatst het startpunt
   linksonder, waarna de 270°-boog rechtsonder eindigt. */
const ARC_ROTATION = -225

const PLAYFAIR = 'var(--font-display, Georgia, serif)'

export function TaxGauge({
  value,
  max,
  label,
  sublabel,
  variant = 'default',
  thresholdLabel,
  colorVar = 'var(--ink-2)',
}: TaxGaugeProps) {
  const size = 160
  const stroke = 11
  const cx = size / 2
  const cy = size / 2
  const r = (size - stroke) / 2

  const safeMax = max > 0 ? max : 0
  const ratio = safeMax > 0 ? value / safeMax : 0
  const isOver = variant === 'danger' && value > safeMax && safeMax > 0
  // Boog clampt op 0–100% voor de visuele vulling; het percentage in het
  // midden toont echter de werkelijke (mogelijk >100%) waarde.
  const clamped = Math.min(Math.max(ratio, 0), 1)
  const pct = safeMax > 0 ? Math.round(ratio * 100) : 0

  const activeColor = isOver ? 'var(--negative, var(--color-red-500))' : colorVar
  const trackColor = isOver
    ? 'color-mix(in srgb, var(--color-red-500) 12%, transparent)'
    : 'color-mix(in srgb, var(--ink) 8%, transparent)'

  // Genormaliseerde dash-waarden (pathLength=1). De track beslaat de volle
  // 270°-boog (ARC_FRACTION); de fill beslaat clamped × ARC_FRACTION.
  const trackDash: CSSProperties = {
    strokeDasharray: `${ARC_FRACTION} ${1 - ARC_FRACTION}`,
    stroke: trackColor,
  }
  // De fill tekent zich in: dasharray = fill-lengte, dashoffset animeert van
  // fillLen → 0 via een per-instance keyframe die de start-offset uit de
  // custom-prop (--tg-fill) leest. Het style-object wordt inline op de
  // <circle> gezet zodat het contextueel als CSSProperties typed wordt (de
  // computed string-key --tg-fill is daar toegestaan).
  const fillLen = clamped * ARC_FRACTION

  const ariaLabel = `${label}: ${pct}% van limiet benut${
    isOver ? ', overschrijding' : ''
  }`

  return (
    <div className="flex flex-col items-center">
      {/* Per-instance keyframe: animeer dashoffset van fill-lengte → 0.
          prefers-reduced-motion neutraliseert dit via de inline-animation-regel
          ([style*="animation: taxgauge-draw"] → none). */}
      <style>{`
        @keyframes taxgauge-draw {
          from { stroke-dashoffset: var(--tg-fill, 0); }
          to   { stroke-dashoffset: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="animation: taxgauge-draw"] {
            animation: none !important;
            stroke-dashoffset: 0 !important;
          }
        }
      `}</style>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          role="img"
          aria-label={ariaLabel}
          className="block"
          style={{ overflow: 'visible' }}
        >
          {/* Track — volle 270°-boog, platte uiteinden (editorial = scherp) */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="butt"
            pathLength={1}
            transform={`rotate(${ARC_ROTATION} ${cx} ${cy})`}
            style={trackDash}
          />
          {/* Fill — proportionele boog (geclamped 0–100%), tekent zich in */}
          {fillLen > 0 && (
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="butt"
              pathLength={1}
              transform={`rotate(${ARC_ROTATION} ${cx} ${cy})`}
              style={{
                strokeDasharray: `${fillLen} ${1 - fillLen}`,
                stroke: activeColor,
                strokeDashoffset: fillLen,
                animation: 'taxgauge-draw 800ms cubic-bezier(.22,1,.36,1) forwards',
                ['--tg-fill' as string]: `${fillLen}`,
              }}
            />
          )}
        </svg>

        {/* Midden: Playfair-percentage als waarde + kicker-label */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span
            className="font-black leading-none tabular-nums"
            style={{
              fontFamily: PLAYFAIR,
              fontSize: '2.1rem',
              letterSpacing: '-0.02em',
              color: isOver ? 'var(--negative, var(--color-red-500))' : 'var(--ink)',
            }}
          >
            {pct}%
          </span>
          <span className="mt-1.5 text-[9px] uppercase tracking-[0.16em] font-mono text-[var(--ink-3)]">
            {label}
          </span>
          {isOver ? (
            <span className="mt-1 text-[9px] font-mono font-semibold uppercase tracking-[0.16em] text-[var(--negative,var(--color-red-500))]">
              overschrijding
            </span>
          ) : sublabel ? (
            <span className="mt-1 font-mono tabular-nums text-[10px] text-[var(--ink-4)]">
              {sublabel}
            </span>
          ) : null}
        </div>
      </div>

      {thresholdLabel && (
        <div className="mt-2 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.16em] font-mono text-[var(--ink-4)]">
          <span
            className="inline-block h-[7px] w-[7px]"
            style={{
              backgroundColor: isOver ? 'var(--negative, var(--color-red-500))' : colorVar,
            }}
            aria-hidden="true"
          />
          {thresholdLabel}
        </div>
      )}
    </div>
  )
}

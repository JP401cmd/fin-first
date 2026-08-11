'use client'

/**
 * SpendLimitScoreRadar — de OPBOUW van de reeks-score als spinnenweb.
 *
 * euro-view: exempt (geen bedragen; dit zijn verhoudingen)
 *
 * ── WAAROM DIT BESTAAT ──────────────────────────────────────────────────────
 * Het cijfer alleen zegt "47" en verder niets. Drie assen laten in één oogopslag
 * zien wáár het zit: bleef je binnen je grens, hou je een reeks vast, en welke
 * kant ga je op. Een gebruiker die ziet dat alleen de reeks-as ingedeukt is,
 * weet meteen wat er te winnen valt — dat is de motivatie die een kaal getal
 * niet geeft.
 *
 * ── CONSUME, DON'T RECOMPUTE ────────────────────────────────────────────────
 * De drie waarden komen kant-en-klaar uit `report.score.components`
 * (lib/spend-limits/engine.ts) — exact dezelfde termen waarop het cijfer rust.
 * Hier wordt niets genormaliseerd, gewogen of afgeleid; de enige berekening is
 * GEOMETRIE (poolcoördinaten → pixels). Zou dit component de assen zelf
 * afleiden uit `hitRatePct` en de reeks-getallen, dan kan de grafiek stil gaan
 * afwijken van het cijfer ernaast — precies de drift die deze feature overal
 * vermijdt.
 *
 * ── MASKERING ───────────────────────────────────────────────────────────────
 * Er staat geen enkel bedrag in: assen zijn verhoudingen en percentages. Onder
 * bedragmaskering blijft dit dus volledig zichtbaar, net als de geometrie van de
 * verloopgrafiek (ADR 0091: geometrie blijft, bedragen verdwijnen).
 *
 * ── ANIMATIE ────────────────────────────────────────────────────────────────
 * Leeft in de prestatieweergave-pane (een overlay) en gebruikt daarom
 * `useModalAnimation` — `useInViewAnimation` triggert op scroll en zou in een
 * overlay nooit vuren. Spiegelt SpendLimitPeriodChart.
 */

import { useModalAnimation } from '@/lib/hooks/use-modal-animation'
import type { SpendLimitScore } from '@/lib/spend-limits/engine'
import {
  SPEND_LIMIT_SCORE_HIT_RATE_WEIGHT,
  SPEND_LIMIT_SCORE_STREAK_WEIGHT,
  SPEND_LIMIT_SCORE_TREND_BONUS,
} from '@/lib/spend-limits/engine'
import { SPEND_LIMIT_SCORE_COLOR_VAR } from '@/lib/spend-limits/status-display'

// ── Geometrie (viewBox-eenheden; de SVG schaalt naar zijn container) ────────

const SIZE = 200
const CX = SIZE / 2
const CY = SIZE / 2 + 6
const R = 62
/** Drie ringen: 1/3, 2/3 en de buitenrand. Meer ringen wordt ruis op dit formaat. */
const RINGS = [1 / 3, 2 / 3, 1]

/**
 * De drie assen, met de klok mee vanaf boven. De volgorde is niet willekeurig:
 * zwaarste term eerst, zodat de vorm van de driehoek leesbaar is als "waar zit
 * mijn gewicht". Het gewicht staat in het label, want een as van 0 tot 1 zegt
 * niet vanzelf dat de ene drie keer zo zwaar telt als de andere.
 */
const AXES = [
  {
    key: 'hitRate' as const,
    label: 'binnen je grens',
    weight: `${SPEND_LIMIT_SCORE_HIT_RATE_WEIGHT} pt`,
    angle: -90,
  },
  {
    key: 'streak' as const,
    label: 'reeks',
    weight: `${SPEND_LIMIT_SCORE_STREAK_WEIGHT} pt`,
    angle: 30,
  },
  {
    key: 'trend' as const,
    label: 'richting',
    weight: `± ${SPEND_LIMIT_SCORE_TREND_BONUS} pt`,
    angle: 150,
  },
]

function point(angleDeg: number, radius: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180
  return [CX + Math.cos(rad) * radius, CY + Math.sin(rad) * radius]
}

function polygon(radii: number[]): string {
  return AXES.map((a, i) => point(a.angle, radii[i] * R).join(',')).join(' ')
}

/** Wat de gebruiker over deze as moet weten, in gewone taal. */
function axisValueLabel(key: (typeof AXES)[number]['key'], v: number): string {
  if (key === 'trend') {
    return v > 0.5 ? 'minder dan daarvoor' : v < 0.5 ? 'meer dan daarvoor' : 'ongeveer gelijk'
  }
  return `${Math.round(v * 100)}%`
}

export function SpendLimitScoreRadar({ score }: { score: SpendLimitScore }) {
  // Hook vóór de vroege return: hooks mogen niet conditioneel draaien.
  const { hasEntered } = useModalAnimation({ duration: 800 })

  const c = score.components
  if (!c || score.score === null || score.label === null) return null

  const values = AXES.map((a) => c[a.key])
  const tint = SPEND_LIMIT_SCORE_COLOR_VAR[score.label]

  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-5">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-[168px] w-[168px] shrink-0"
        role="img"
        aria-label={`Opbouw van je score van ${score.score}: ${AXES.map(
          (a, i) => `${a.label} ${axisValueLabel(a.key, values[i])}`,
        ).join(', ')}`}
      >
        {/* Web: ringen + assen, in de zachte lijnkleur zodat de vorm voorop staat. */}
        {RINGS.map((r) => (
          <polygon
            key={r}
            points={polygon(AXES.map(() => r))}
            fill="none"
            stroke="var(--rule-soft)"
            strokeWidth={0.75}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {AXES.map((a) => {
          const [x, y] = point(a.angle, R)
          return (
            <line
              key={a.key}
              x1={CX}
              y1={CY}
              x2={x}
              y2={y}
              stroke="var(--rule-soft)"
              strokeWidth={0.75}
              vectorEffect="non-scaling-stroke"
            />
          )
        })}

        {/* De gemeten vorm. Groeit vanuit het midden bij openen van de pane. */}
        <polygon
          points={polygon(values)}
          fill={tint}
          fillOpacity={0.18}
          stroke={tint}
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          style={{
            transformOrigin: `${CX}px ${CY}px`,
            transform: hasEntered ? 'scale(1)' : 'scale(0)',
            opacity: hasEntered ? 1 : 0,
            transition: hasEntered
              ? 'transform 700ms cubic-bezier(.22,1,.36,1), opacity 250ms ease-out'
              : 'none',
          }}
        />
        {AXES.map((a, i) => {
          const [x, y] = point(a.angle, values[i] * R)
          return (
            <circle
              key={a.key}
              cx={x}
              cy={y}
              r={2.5}
              fill={tint}
              style={{
                opacity: hasEntered ? 1 : 0,
                transition: hasEntered ? `opacity 250ms ease-out ${455 + i * 60}ms` : 'none',
              }}
            />
          )
        })}

        {/* Aslabels net buiten de buitenring. */}
        {AXES.map((a) => {
          const [x, y] = point(a.angle, R + 16)
          return (
            <text
              key={a.key}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-[var(--ink-3)] text-[9px] uppercase tracking-[0.08em]"
            >
              {a.label}
            </text>
          )
        })}
      </svg>

      {/* De waarden ook als tekst: een spinnenweb is een vorm, geen aflezing —
          en een schermlezer heeft aan de polygon niets. */}
      <dl className="w-full space-y-1.5 text-xs">
        {AXES.map((a, i) => (
          <div key={a.key} className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--ink-2)]">
              {a.label}{' '}
              <span className="text-[10px] text-[var(--ink-4)]">{a.weight}</span>
            </dt>
            <dd className="font-mono tabular-nums text-[var(--ink)]">
              {axisValueLabel(a.key, values[i])}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

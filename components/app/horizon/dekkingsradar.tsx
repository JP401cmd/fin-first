'use client'

/**
 * Dekkingsradar — vierassige "haalbaarheid van je plan"-radar voor /toekomst.
 *
 * Presentational blok (INHOUD van een card-editorial; kicker+H2-kop levert de wiring
 * in horizon-client, net als LevensinkomenStrook). Links een SVG-radar
 * (4 assen), rechts de dimensielijst met stoplicht-badges + een cap-regel die
 * de zwakste bepaalbare as benoemt; een as zonder waarde toont zijn reden inline.
 * De assen worden ELDERS berekend
 * (`lib/horizon/dekkingsradar.ts#computeDekkingsradar`) en als prop doorgegeven.
 *
 * Kleur-conventie: de radarvulling is NEUTRAAL (ink-tint, lage opacity) — de
 * statussemantiek zit uitsluitend in de stippen (SVG) en badges (lijst), in
 * SEMANTISCHE stoplichtkleuren (emerald/amber/red), NIET het module-accent. Spiegelt
 * LevensinkomenStrook. Percentages zijn geen bedragen → geen masking.
 */

import type { RadarAs, RadarAsKey } from '@/lib/horizon/dekkingsradar'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { InlineInfoDisclosure } from '@/components/editorial'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

export interface DekkingsradarProps {
  /** De assen (berekend in lib/horizon/dekkingsradar.ts). */
  assen: RadarAs[]
}

// ── SVG-geometrie ────────────────────────────────────────────────────────────
const CENTER = 100
const MAX_RADIUS = 78
/** Vormclamp: uitschieters (pct > 150) blazen het raster niet op; échte pct blijft in de lijst. */
const SHAPE_MAX_PCT = 150
const RING_LEVELS = [50, 100, 150] as const

/** Hoek (graden) van as i: bovenaan starten, met de klok mee (360° ÷ aantal assen per stap). */
function axisAngleDeg(i: number, count: number): number {
  return -90 + (i * 360) / count
}

function polarPoint(radius: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: CENTER + radius * Math.cos(rad), y: CENTER + radius * Math.sin(rad) }
}

/** Punten-string voor een regelmatige veelhoek op een gegeven straal (raster-ring). */
function ringPoints(radius: number, count: number): string {
  return Array.from({ length: count }, (_, i) => {
    const p = polarPoint(radius, axisAngleDeg(i, count))
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
  }).join(' ')
}

// ── Stoplicht-tinten (SEMANTISCH — geen module-accent) ───────────────────────
// Groen/rood via de canonieke semantische tokens; amber heeft geen eigen token
// in de app — de stoplicht-amber is overal Tailwind `amber-500` (#f59e0b), zoals
// LevensinkomenStrook's `bg-amber-500` en de LEVERAGE_STATUS_DOT-mapping. SVG-fill
// vereist een echte kleurwaarde, dus hier expliciet die semantische status-hex.
const DOT_FILL: Record<NonNullable<RadarAs['status']>, string> = {
  groen: 'var(--positive)',
  amber: '#f59e0b',
  rood: 'var(--negative)',
}
const BADGE_TINT: Record<NonNullable<RadarAs['status']>, string> = {
  groen: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  rood: 'border-red-200 bg-red-50 text-red-700',
}

/** Per-as definitie voor de i-uitleg (eerlijk over de grove eerste-versie-keuzes). */
const AXIS_DEFINITIES: Record<RadarAsKey, string> = {
  'brug-tot-aow':
    'belegbaar vermogen op je stopmoment ÷ som van de bestedingsbehoefte over de brugjaren (stop→AOW). Geen brugperiode of geen eigen brug-behoefte: 100% (er valt niets te overbruggen).',
  pensioeninkomen:
    'gemiddelde dekkingsgraad (vaste inkomsten + veilige onttrekking ÷ besteding) over de jaren vanaf je AOW-leeftijd — of vanaf je stopleeftijd als die later ligt (werkjaren tellen niet mee).',
  wonen:
    'eerste versie op strategie-niveau — geen huis: n.v.t.; huis zonder geplande verkoop: 100%; geplande downsize: 95%; verkoop afgedwongen door de liquide stand: 85%.',
  eindstrategie:
    'verwacht eindvermogen t.o.v. je eind-doel (bij interen: is er aan het eind nog over) — let op: gerekend op je volledige netto vermogen inclusief woning.',
}

/** Zwakste BEPAALBARE as (laagste pct); null wanneer geen enkele as bepaalbaar is. */
function zwaksteAs(assen: RadarAs[]): RadarAs | null {
  let best: RadarAs | null = null
  for (const a of assen) {
    if (a.pct === null) continue
    if (best === null || a.pct < (best.pct as number)) best = a
  }
  return best
}

export function Dekkingsradar({ assen }: DekkingsradarProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })
  const count = assen.length
  const zwakste = zwaksteAs(assen)

  const dataPoints = assen
    .map((a, i) => {
      const clamped = Math.max(0, Math.min(SHAPE_MAX_PCT, a.pct ?? 0))
      const r = (clamped / SHAPE_MAX_PCT) * MAX_RADIUS
      return polarPoint(r, axisAngleDeg(i, count))
    })
  const dataPolygon = dataPoints.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')

  return (
    <div ref={ref}>
      <InlineInfoDisclosure label="Uitleg dekkingsradar">
        <div className="mb-1.5 font-semibold text-[var(--ink)]" style={{ fontFamily: PLAYFAIR }}>
          Hoe de percentages ontstaan
        </div>
        <p className="m-0 mb-2">
          elke as = behaald ÷ benodigd × 100%.{' '}
          <b className="text-emerald-700">≥100 groen</b> ·{' '}
          <b className="text-amber-700">90–99 amber</b> ·{' '}
          <b className="text-red-700">&lt;90 rood</b>. Een as die niet bepaalbaar is toont
          &ldquo;–&rdquo; met de reden eronder.
        </p>
        <ul className="m-0 list-none space-y-1.5 p-0">
          {assen.map((a) => (
            <li key={a.key}>
              <b className="text-[var(--ink)]">{a.label}:</b> {AXIS_DEFINITIES[a.key]}
            </li>
          ))}
        </ul>
      </InlineInfoDisclosure>

      <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-8">
        {/* Links — SVG-radar (ruit, 4 assen) */}
        <div className="mx-auto w-full max-w-[260px] shrink-0 md:mx-0 md:w-[260px]">
          <svg
            viewBox="0 0 200 200"
            className="h-auto w-full"
            role="img"
            aria-label={`Dekkingsradar over ${count} assen: ${assen
              .map((a) => `${a.label} ${a.pct === null ? 'niet bepaalbaar' : `${a.pct}%`}`)
              .join(', ')}.`}
          >
            {/* Raster: concentrische niveaulijnen (50/100/150) */}
            {RING_LEVELS.map((level) => (
              <polygon
                key={level}
                points={ringPoints((level / SHAPE_MAX_PCT) * MAX_RADIUS, count)}
                fill="none"
                stroke="var(--border-ed)"
                strokeWidth={1}
              />
            ))}
            {/* Assen-spaken naar elke vertex */}
            {assen.map((a, i) => {
              const p = polarPoint(MAX_RADIUS, axisAngleDeg(i, count))
              return (
                <line
                  key={a.key}
                  x1={CENTER}
                  y1={CENTER}
                  x2={p.x.toFixed(2)}
                  y2={p.y.toFixed(2)}
                  stroke="var(--border-ed)"
                  strokeWidth={0.75}
                />
              )
            })}

            {/* Data: gevulde polygon + status-stippen, in-view-animatie (schaal vanuit midden) */}
            <g
              style={{
                transformBox: 'view-box',
                transformOrigin: `${CENTER}px ${CENTER}px`,
                transform: hasEntered ? 'scale(1)' : 'scale(0.05)',
                opacity: hasEntered ? 1 : 0,
                transition: hasEntered
                  ? 'transform 700ms cubic-bezier(.22,1,.36,1), opacity 250ms ease-out'
                  : 'none',
              }}
            >
              <polygon
                points={dataPolygon}
                fill="var(--ink)"
                fillOpacity={0.07}
                stroke="var(--ink-3)"
                strokeOpacity={0.55}
                strokeWidth={1.25}
                strokeLinejoin="round"
              />
              {assen.map((a, i) => {
                const p = dataPoints[i]
                return (
                  <circle
                    key={a.key}
                    cx={p.x.toFixed(2)}
                    cy={p.y.toFixed(2)}
                    r={4}
                    fill={a.status === null ? 'var(--paper)' : DOT_FILL[a.status]}
                    stroke={a.status === null ? 'var(--ink-3)' : 'var(--paper)'}
                    strokeWidth={1.5}
                  />
                )
              })}
            </g>
          </svg>
        </div>

        {/* Rechts — dimensielijst */}
        <div className="min-w-0 flex-1">
          <ul className="m-0 list-none space-y-0 p-0">
            {assen.map((a) => (
              <li
                key={a.key}
                className="border-b border-[var(--border-ed)] py-2.5 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[13.5px] text-[var(--ink)]">{a.label}</span>
                  {a.status === null ? (
                    <span
                      className="shrink-0 text-[13px] font-semibold tabular-nums text-[var(--ink-4)]"
                      aria-label={`${a.label}: niet bepaalbaar`}
                    >
                      –
                    </span>
                  ) : (
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[12px] font-semibold tabular-nums ${BADGE_TINT[a.status]}`}
                    >
                      {a.pct}%
                    </span>
                  )}
                </div>
                {/* Niet bepaalbaar? De reden hoort in beeld, niet verstopt achter de i. */}
                {a.status === null && (
                  <p className="m-0 mt-1 text-[12px] leading-snug text-[var(--ink-4)]">{a.detail}</p>
                )}
              </li>
            ))}
          </ul>

          {/* Cap-regel: benoem de zwakste as alléén als er echt iets knelt (< 100%) —
              een conventie-100 ("geen brugperiode") tot zwakste plek kronen leest als
              een probleem dat er niet is. */}
          {zwakste && (
            <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--ink-3)]">
              {(zwakste.pct as number) < 100 ? (
                <>
                  <b className="text-[var(--ink)]">
                    {zwakste.label} ({zwakste.pct}%)
                  </b>{' '}
                  is de zwakste plek — {zwakste.detail}
                </>
              ) : (
                <>Alle bepaalbare assen zijn volledig gedekt (≥ 100%).</>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import type { ReportLifePath, ReportLifeEvent } from '@/lib/check/types'
import { useInViewOnce, useReducedMotion } from './hooks'
import {
  makeScale,
  niceMax,
  seriesMax,
  ageExtent,
  smoothPath,
  pathLength,
  euroAxisTicks,
  euroAxisLabel,
} from './chart-utils'

const VB_W = 800
const VB_H = 340
const PLOT = { x0: 70, y0: 56, x1: 780, y1: 300 }

// App-chart-signatuur (SimChart): opbouw = toekomst-PAARS (--horizon, nu violet),
// afbouw = kern-bruin, gesplitst op de FIRE-leeftijd. De FIRE-marker en de ±2%-band
// volgen het paarse opbouw-accent. Markers in app-stijl (paper-fill + accent-rand).
const COLOR_OPBOUW = 'var(--horizon)'
const COLOR_AFBOUW = 'var(--kern)'
const MONO = 'var(--font-ibm-plex-mono), monospace'
const SERIF = 'var(--font-playfair), serif'

const EVENT_TAG: Record<string, string> = {
  natuurlijk: 'neutral',
  leven: 'leven',
}

export function BlikOpToekomst({ lifePath }: { lifePath: ReportLifePath }) {
  const reduce = useReducedMotion()
  const { ref, inView } = useInViewOnce<HTMLDivElement>(0.2)
  const active = reduce || inView

  const points = lifePath.points

  // ── dynamische assen ──
  const { min: ageMin, max: ageMax } = ageExtent(points)
  const yMax = niceMax(seriesMax(points))
  const sx = makeScale(ageMin, ageMax, PLOT.x0, PLOT.x1)
  const sy = makeScale(0, yMax, PLOT.y1, PLOT.y0)

  const linePts = points.map((p) => ({ x: sx(p.age), y: sy(p.value) }))

  // ── opbouw/afbouw-splitsing op de FIRE-leeftijd (SimChart-signatuur) ──
  const fireAge = lifePath.fireAge
  const fireX = fireAge != null ? sx(fireAge) : null
  // Punt op de lijn op exact de FIRE-leeftijd, voor een naadloze kleurovergang.
  const fireY = fireAge != null ? sy(valueAtAge(points, fireAge)) : null
  const firePoint =
    fireX != null && fireY != null ? { x: fireX, y: fireY } : null

  const accPts =
    firePoint != null
      ? [...linePts.filter((p) => p.x < firePoint.x), firePoint]
      : linePts
  const decPts =
    firePoint != null
      ? [firePoint, ...linePts.filter((p) => p.x > firePoint.x)]
      : []

  const accLine = smoothPath(accPts)
  const decLine = decPts.length > 1 ? smoothPath(decPts) : ''
  const accDash = pathLength(accPts)
  const decDash = decPts.length > 1 ? pathLength(decPts) : 0

  const fullLine = smoothPath(linePts)
  const area =
    linePts.length > 0
      ? `${fullLine} L${linePts[linePts.length - 1].x},${PLOT.y1} L${linePts[0].x},${PLOT.y1} Z`
      : ''

  const yTicks = euroAxisTicks(yMax, 4)
  const xTickCount = 6
  const xTicks = Array.from({ length: xTickCount }, (_, i) =>
    Math.round(ageMin + ((ageMax - ageMin) * i) / (xTickCount - 1)),
  )

  // is er nog een illustratief voorbeeld tussen de mijlpalen? Bepaalt de copy.
  const hasIllustrative = lifePath.markers.some((m) => m.illustrative)

  // markers met afgeleide x/y; annotatie-label boven of onder de lijn afhankelijk
  // van ruimte (boven als er voldoende kop is, anders onder) én van botsingen met
  // buur-labels. Bij dicht op elkaar liggende leeftijden (kleine Δx) staggeren we:
  // we wisselen boven/onder af en stapelen labels in 'lanes' (oplopende verticale
  // offset) zodat elk label vrije ruimte krijgt. De stippellijn blijft het label
  // visueel aan zijn marker koppelen (zo nodig schuin).
  const markers = computeMarkerLayout(
    lifePath.markers.map((m) => ({
      ev: m,
      x: sx(m.age),
      y: sy(valueAtAge(points, m.age)),
      isFire: m.name.toLowerCase().includes('fire'),
    })),
  )

  // ── ±2% rendement-band rond de hele levenslijn (opbouw + afbouw) ──
  // Consume-only: de reeksen komen uit de DTO; we schalen ze enkel.
  const scenarios = (lifePath.scenarios ?? []).filter((s) => s.points.length > 0)
  const lowScenario = scenarios.find((s) => s.returnDeltaPct < 0)
  const highScenario = scenarios.find((s) => s.returnDeltaPct > 0)
  const lowPts = lowScenario
    ? lowScenario.points.map((p) => ({ x: sx(p.age), y: sy(p.value) }))
    : []
  const highPts = highScenario
    ? highScenario.points.map((p) => ({ x: sx(p.age), y: sy(p.value) }))
    : []
  const highLine = smoothPath(highPts)
  // Gevulde band: hoog-pad vooruit, dan met rechte segmenten langs laag terug.
  const bandPath =
    highPts.length > 0 && lowPts.length > 0
      ? `${highLine} ` +
        [...lowPts]
          .reverse()
          .map((p) => `L${p.x},${p.y}`)
          .join(' ') +
        ' Z'
      : ''
  const hasBand = bandPath !== ''

  return (
    <>
      <p className="lede" style={{ marginTop: 24 }}>
        De lijn stijgt in{' '}
        <span style={{ color: COLOR_OPBOUW, fontWeight: 600 }}>paars</span> terwijl
        je opbouwt en buigt in{' '}
        <span style={{ color: COLOR_AFBOUW, fontWeight: 600 }}>bruin</span> af zodra
        je ervan gaat leven — je vrijheidsmoment is de knik ertussen. Die knikken komen
        uit je eigen cijfers: je vrijheidsleeftijd, hypotheek, AOW en de gebeurtenissen die
        je zelf invulde.
        {hasBand && (
          <>
            {' '}
            De{' '}
            <span style={{ color: COLOR_OPBOUW, fontWeight: 600 }}>paarse band</span>{' '}
            toont wat 2% meer of minder rendement doet.
          </>
        )}
      </p>

      <div className="chart-card" ref={ref}>
        <div className="chart-head">
          <div>
            <div className="chart-title">Prognose netto vermogen</div>
            <div className="chart-sub">
              netto vermogen incl. huis · reëel · opnemen na je vrijheidsmoment · AOW &amp;
              pensioen verwerkt
            </div>
          </div>
          <div className="legend">
            <span>
              <i style={{ background: COLOR_OPBOUW }} />
              Opbouw
            </span>
            <span>
              <i style={{ background: COLOR_AFBOUW }} />
              Afbouw
            </span>
            {hasBand && (
              <span>
                <i style={{ background: COLOR_OPBOUW, opacity: 0.3 }} />
                −2% · +2% rendement
              </span>
            )}
            <span>
              <i style={{ background: 'var(--color-wil-500)', borderRadius: '50%' }} />
              Levenskeuze
            </span>
          </div>
        </div>

        <svg
          className="chart"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          role="img"
          aria-label="Prognose netto vermogen over een heel leven met mijlpalen"
        >
          <defs>
            <linearGradient id="fut-acc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--horizon)" stopOpacity=".18" />
              <stop offset="1" stopColor="var(--horizon)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* vrijheidszone vanaf FIRE — zachte paars-wash (toekomst-accent) */}
          {fireX != null && (
            <>
              <rect
                x={fireX}
                y={PLOT.y0}
                width={PLOT.x1 - fireX}
                height={PLOT.y1 - PLOT.y0}
                fill="var(--horizon)"
                opacity={active ? 0.06 : 0}
                style={{ transition: reduce ? undefined : 'opacity 1s .6s' }}
              />
              <text
                x={PLOT.x1 - 8}
                y={PLOT.y0 + 14}
                textAnchor="end"
                fill="var(--horizon)"
                style={{
                  opacity: 0.7,
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: '.14em',
                }}
              >
                ← VRIJHEIDSZONE
              </text>
            </>
          )}

          <g className="axis-lbl">
            {yTicks.map((t) => (
              <line
                key={t}
                className="grid-line"
                x1={PLOT.x0}
                y1={sy(t)}
                x2={PLOT.x1}
                y2={sy(t)}
              />
            ))}
            <line
              x1={PLOT.x0}
              y1={PLOT.y1}
              x2={PLOT.x1}
              y2={PLOT.y1}
              stroke="var(--border-md)"
              strokeWidth="1.5"
            />
            <line
              x1={PLOT.x0}
              y1={PLOT.y0}
              x2={PLOT.x0}
              y2={PLOT.y1}
              stroke="var(--border-md)"
              strokeWidth="1.5"
            />
            {yTicks.map((t) => (
              <text key={`yl-${t}`} x="6" y={sy(t) + 4}>
                {euroAxisLabel(t)}
              </text>
            ))}
            <text x="36" y={PLOT.y1 + 4}>
              €0
            </text>
            {xTicks.map((age, i) => (
              <text
                key={`xl-${age}`}
                x={sx(age) - (i === 0 ? 6 : 8)}
                y={PLOT.y1 + 18}
              >
                {age}
              </text>
            ))}
            <text x={PLOT.x1 - 36} y={PLOT.y1 + 32} fontSize="9">
              leeftijd
            </text>
          </g>

          {/* ±2% rendement-band — semitransparant PAARS over opbouw én afbouw,
              achter de basislijn. Verschijnt alleen als de scenario's er zijn. */}
          {hasBand && (
            <path
              d={bandPath}
              fill={COLOR_OPBOUW}
              stroke="none"
              style={{
                opacity: active ? 0.16 : 0,
                transition: reduce ? undefined : 'opacity 1.2s .4s',
              }}
            />
          )}

          {/* area onder de opbouw-fase */}
          <path
            d={area}
            fill="url(#fut-acc)"
            opacity={active ? 1 : 0}
            style={{ transition: reduce ? undefined : 'opacity 1.1s .3s' }}
          />

          {/* opbouw-lijn (paars — var(--horizon) = toekomst-accent) */}
          <path
            d={accLine}
            fill="none"
            stroke={COLOR_OPBOUW}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={accDash}
            strokeDashoffset={active ? 0 : accDash}
            style={{
              transition: reduce ? undefined : 'stroke-dashoffset 1.4s ease',
            }}
          />
          {/* afbouw-lijn (bruin) */}
          {decLine && (
            <path
              d={decLine}
              fill="none"
              stroke={COLOR_AFBOUW}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={decDash}
              strokeDashoffset={active ? 0 : decDash}
              style={{
                transition: reduce
                  ? undefined
                  : 'stroke-dashoffset 1.4s 1.2s ease',
              }}
            />
          )}

          {/* FIRE-knooppunt: dot op de splitsing */}
          {firePoint && (
            <circle
              cx={firePoint.x}
              cy={firePoint.y}
              r={active ? 5 : 0}
              fill="var(--paper)"
              stroke={COLOR_OPBOUW}
              strokeWidth="2.5"
              style={{
                transition: reduce
                  ? undefined
                  : 'r .45s 1.1s cubic-bezier(.2,.8,.2,1)',
              }}
            />
          )}

          {/* annotaties — gestaggerd boven/onder met lanes; de stippellijn loopt
              (zo nodig schuin) van de marker naar het verschoven label */}
          {markers.map((mk, i) => {
            const titleColor = mk.isFire ? COLOR_OPBOUW : 'var(--ink)'
            // Verticale ankers van het label-blok: titel + sub onder elkaar.
            // `labelY` is de baseline van de titel; de sub staat 12px daaronder.
            const titleY = mk.labelY
            const subY = titleY + 12
            // Connector loopt van net naast de markerstip naar de bovenkant
            // (bij 'onder' de onderkant) van het label-blok.
            const connectorStartY = mk.labelAbove ? mk.y - 8 : mk.y + 8
            const connectorEndY = mk.labelAbove ? subY + 4 : titleY - 11
            return (
              <g
                key={`anno-${i}`}
                style={{
                  opacity: active ? 1 : 0,
                  transition: reduce
                    ? undefined
                    : `opacity .5s ${1.52 + i * 0.15}s`,
                }}
              >
                <line
                  x1={mk.x}
                  y1={connectorStartY}
                  x2={mk.labelX}
                  y2={connectorEndY}
                  stroke={mk.isFire ? COLOR_OPBOUW : 'var(--ink-faint)'}
                  strokeWidth={mk.isFire ? 1.2 : 1}
                  strokeDasharray="2 2"
                  opacity={0.6}
                />
                <text
                  x={mk.labelX}
                  y={titleY}
                  textAnchor="middle"
                  fontWeight={mk.isFire ? 700 : 600}
                  fontSize={mk.isFire ? 13.5 : 12}
                  fill={titleColor}
                  style={{ fontFamily: SERIF }}
                >
                  {mk.ev.name}
                </text>
                <text
                  x={mk.labelX}
                  y={subY}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="var(--ink-faint)"
                  style={{ fontFamily: MONO }}
                >
                  {mk.ev.age} jr · {mk.ev.year}
                </text>
              </g>
            )
          })}

          {/* markers in app-stijl: paper-fill + accent-rand op de lijn */}
          {markers.map((mk, i) => {
            const r = mk.isFire ? 7 : 5.5
            const accent = mk.isFire
              ? COLOR_OPBOUW
              : mk.ev.type === 'leven'
                ? 'var(--color-wil-500)'
                : 'var(--ink-2)'
            return (
              <circle
                key={`mk-${i}`}
                cx={mk.x}
                cy={mk.y}
                r={active ? r : 0}
                fill="var(--paper)"
                stroke={accent}
                strokeWidth={1.8}
                style={{
                  transition: reduce
                    ? undefined
                    : `r .45s ${1.4 + i * 0.15}s cubic-bezier(.2,.8,.2,1)`,
                }}
              />
            )
          })}
        </svg>

        {lifePath.peakNote && (
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 12 }}>
            {lifePath.peakNote}
          </p>
        )}
      </div>

      {/* gebeurtenissen-tabel */}
      <h3 className="sub">De momenten die de lijn buigen</h3>
      <table className="data">
        <thead>
          <tr>
            <th>Gebeurtenis</th>
            <th>Type</th>
            <th className="r">Leeftijd</th>
            <th className="r">Effect</th>
          </tr>
        </thead>
        <tbody>
          {lifePath.markers.map((ev) => (
            <tr key={`${ev.name}-${ev.age}`}>
              <td>{ev.name}</td>
              <td>
                <span className={`tag ${tagForEvent(ev)}`}>{ev.type}</span>
              </td>
              <td className="num r">
                {ev.age} · {ev.year}
              </td>
              <td className="r">{ev.effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        className="mono"
        style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginTop: 10 }}
      >
        {hasIllustrative ? (
          <>
            ↳ Deze mijlpalen komen uit je eigen cijfers — je vrijheidsleeftijd,
            hypotheek, AOW — plus de gebeurtenissen die je invulde; een enkele is
            een illustratief voorbeeld. In de app sleep je ze op de tijdlijn, voeg
            je nieuwe toe (huwelijk, sabbatical, kind, erfenis, woningverkoop,
            grote aankoop) en herrekent de lijn live.
          </>
        ) : (
          <>
            ↳ Deze mijlpalen komen uit je eigen cijfers — je vrijheidsleeftijd,
            hypotheek, AOW — plus de gebeurtenissen die je zelf invulde. In de app
            sleep je ze op de tijdlijn, voeg je nieuwe toe (huwelijk, sabbatical,
            kind, erfenis, woningverkoop, grote aankoop) en herrekent de lijn
            live.
          </>
        )}
      </p>
    </>
  )
}

/** Waarde op het levenspad bij een gegeven leeftijd (nearest point). */
function valueAtAge(
  points: { age: number; value: number }[],
  age: number,
): number {
  let nearest = points[0]
  let bestDiff = Infinity
  for (const p of points) {
    const d = Math.abs(p.age - age)
    if (d < bestDiff) {
      bestDiff = d
      nearest = p
    }
  }
  return nearest ? nearest.value : 0
}

/** Houd annotatie-tekst binnen de viewBox-breedte. */
function clampX(x: number): number {
  return Math.max(60, Math.min(x, VB_W - 60))
}

type RawMarker = {
  ev: ReportLifeEvent
  x: number
  y: number
  isFire: boolean
}

type LaidOutMarker = RawMarker & {
  labelAbove: boolean
  labelX: number
  labelY: number
}

/**
 * Plaatst de annotatie-labels van de levensgebeurtenissen zónder dat ze over
 * elkaar heen vallen. Markers die dicht op elkaar liggen (kleine Δx) worden
 * gestaggerd: het label staat bij voorkeur boven de lijn (als er genoeg kop is),
 * en botsende labels schuiven naar oplopende 'lanes' (verticale offset). Past het
 * aan de voorkeurskant niet, dan wijkt het label naar de andere kant uit. De
 * stippellijn in de render koppelt elk label (zo nodig schuin) aan zijn marker.
 */
function computeMarkerLayout(raw: RawMarker[]): LaidOutMarker[] {
  const LABEL_HALF = 38 // horizontale halve breedte van een label (px)
  const LANE_GAP = 8 // minimale vrije ruimte tussen twee labels in één lane
  const LANE_STEP = 27 // verticale afstand tussen gestapelde lanes
  const ABOVE_BASE = 40 // titel-baseline-offset boven de marker
  const BELOW_BASE = 38 // titel-baseline-offset onder de marker
  const HEADROOM = 116 // minstens zoveel kop (y) nodig om 'boven' te kiezen

  // Van links naar rechts verwerken zodat buren naast elkaar staan.
  const order = raw.map((m, i) => ({ m, i })).sort((a, b) => a.m.x - b.m.x)

  // Per (kant, lane) bewaren we de rechterrand van het laatst geplaatste label.
  const lastRight = new Map<string, number>()
  const out = new Array<LaidOutMarker>(raw.length)

  for (const { m, i } of order) {
    const labelX = clampX(m.x)
    const left = labelX - LABEL_HALF
    const right = labelX + LABEL_HALF
    const prefer: 'above' | 'below' = m.y > HEADROOM ? 'above' : 'below'
    const other: 'above' | 'below' = prefer === 'above' ? 'below' : 'above'

    // Plek met de laagste verticale offset die niet botst: eerst de
    // voorkeurskant (lane 0..3), dan de andere kant (lane 0..3).
    const candidates: Array<['above' | 'below', number]> = []
    for (let l = 0; l < 4; l++) candidates.push([prefer, l])
    for (let l = 0; l < 4; l++) candidates.push([other, l])
    let side = prefer
    let lane = 0
    for (const [s, l] of candidates) {
      const r = lastRight.get(`${s}:${l}`)
      if (r == null || left >= r + LANE_GAP) {
        side = s
        lane = l
        break
      }
    }
    lastRight.set(`${side}:${lane}`, right)

    const labelAbove = side === 'above'
    const labelY = labelAbove
      ? Math.max(14, m.y - ABOVE_BASE - lane * LANE_STEP)
      : m.y + BELOW_BASE + lane * LANE_STEP
    out[i] = { ...m, labelAbove, labelX, labelY }
  }
  return out
}

/** FIRE-moment krijgt de gouden 'leven'-tag; rest volgt het type. */
function tagForEvent(ev: ReportLifeEvent): string {
  if (ev.name.toLowerCase().includes('fire')) return 'leven-gold'
  return EVENT_TAG[ev.type] ?? 'neutral'
}

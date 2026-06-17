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
const PLOT = { x0: 70, y0: 50, x1: 780, y1: 300 }

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
  const line = smoothPath(linePts)
  const area =
    linePts.length > 0
      ? `${line} L${linePts[linePts.length - 1].x},${PLOT.y1} L${linePts[0].x},${PLOT.y1} Z`
      : ''
  const dash = pathLength(linePts)

  const yTicks = euroAxisTicks(yMax, 4)
  const xTickCount = 6
  const xTicks = Array.from({ length: xTickCount }, (_, i) =>
    Math.round(ageMin + ((ageMax - ageMin) * i) / (xTickCount - 1)),
  )

  // vrijheidszone vanaf FIRE
  const fireX = lifePath.fireAge != null ? sx(lifePath.fireAge) : null

  // waarde op het levenspad bij een gegeven leeftijd (voor marker-y)
  const valueAtAge = (age: number): number => {
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

  // markers met afgeleide x/y; annotatie-label boven of onder de lijn afhankelijk
  // van ruimte (boven als er voldoende kop is, anders onder).
  const markers = lifePath.markers.map((m) => {
    const x = sx(m.age)
    const y = sy(valueAtAge(m.age))
    const isFire = m.name.toLowerCase().includes('fire')
    const labelAbove = y > 120 // genoeg ruimte boven de lijn
    return { ev: m, x, y, isFire, labelAbove }
  })

  return (
    <section id="s5">
      <div className="wrap">
        <div className="eyebrow">
          <span className="num">5</span> Blik op de toekomst{' '}
          <span className="swatch" style={{ background: 'var(--horizon)' }} />
        </div>
        <h2>Je vermogen over een heel leven</h2>
        <p className="lede">
          Eén lijn, van nu tot je {lifePath.endAge}ste. Hij stijgt terwijl je
          opbouwt en buigt zachtjes af zodra je ervan gaat leven. Een paar
          momenten zetten een knik in die lijn — sommige overkomen je{' '}
          <em>(natuurlijk)</em>, andere kies je zelf <em>(leven)</em>.
        </p>

        <div className="chart-card" ref={ref}>
          <div className="chart-head">
            <div>
              <div className="chart-title">Prognose netto vermogen</div>
              <div className="chart-sub">
                reëel · inclusief decumulatie na FIRE · AOW &amp; pensioen verwerkt
              </div>
            </div>
            <div className="legend">
              <span>
                <i
                  style={{
                    background: '#F4EFE6',
                    boxShadow: 'inset 0 0 0 2px #1E1A15',
                    borderRadius: '50%',
                  }}
                />
                Natuurlijk
              </span>
              <span>
                <i style={{ background: '#5B3A8C', borderRadius: '50%' }} />
                Leven
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
              <linearGradient id="fut" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#5B3A8C" stopOpacity=".22" />
                <stop offset="1" stopColor="#5B3A8C" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* vrijheidszone */}
            {fireX != null && (
              <>
                <rect
                  x={fireX}
                  y={PLOT.y0}
                  width={PLOT.x1 - fireX}
                  height={PLOT.y1 - PLOT.y0}
                  fill="#5B3A8C"
                  opacity={active ? 0.06 : 0}
                  style={{ transition: reduce ? undefined : 'opacity 1s .6s' }}
                />
                <text
                  x={PLOT.x1 - 8}
                  y={PLOT.y0 + 14}
                  textAnchor="end"
                  fill="#5B3A8C"
                  style={{
                    opacity: 0.6,
                    fontFamily: 'var(--font-ibm-plex-mono), monospace',
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
                stroke="#1E1A15"
                strokeWidth="1.5"
              />
              <line
                x1={PLOT.x0}
                y1={PLOT.y0}
                x2={PLOT.x0}
                y2={PLOT.y1}
                stroke="#1E1A15"
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

            {/* area + lijn */}
            <path
              d={area}
              fill="url(#fut)"
              opacity={active ? 1 : 0}
              style={{ transition: reduce ? undefined : 'opacity 1.1s .3s' }}
            />
            <path
              d={line}
              fill="none"
              stroke="#5B3A8C"
              strokeWidth="3"
              strokeDasharray={dash}
              strokeDashoffset={active ? 0 : dash}
              style={{
                transition: reduce ? undefined : 'stroke-dashoffset 2s ease',
              }}
            />

            {/* annotaties */}
            {markers.map((mk, i) => {
              const lineTop = mk.labelAbove ? mk.y - 23 : mk.y + 23
              const titleY = mk.labelAbove ? mk.y - 40 : mk.y + 38
              const subY = mk.labelAbove ? mk.y - 28 : mk.y + 50
              const titleColor = mk.isFire ? '#C99416' : '#1E1A15'
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
                    y1={mk.labelAbove ? mk.y - 8 : mk.y + 8}
                    x2={mk.x}
                    y2={lineTop}
                    stroke={mk.isFire ? '#C99416' : '#857B6B'}
                    strokeWidth={mk.isFire ? 1.2 : 1}
                  />
                  <text
                    x={clampX(mk.x)}
                    y={titleY}
                    textAnchor="middle"
                    fontWeight={mk.isFire ? 700 : 600}
                    fontSize={mk.isFire ? 13.5 : 12}
                    fill={titleColor}
                    style={{ fontFamily: 'var(--font-playfair), serif' }}
                  >
                    {mk.ev.name}
                  </text>
                  <text
                    x={clampX(mk.x)}
                    y={subY}
                    textAnchor="middle"
                    fontSize="9.5"
                    fill="#857B6B"
                    style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace' }}
                  >
                    {mk.ev.age} jr · {mk.ev.year}
                  </text>
                </g>
              )
            })}

            {/* markers bovenop */}
            {markers.map((mk, i) => {
              const r = mk.isFire ? 7 : 5
              const fill = mk.isFire
                ? '#E8B83A'
                : mk.ev.type === 'leven'
                  ? '#5B3A8C'
                  : '#F4EFE6'
              const stroke =
                mk.ev.type === 'leven' && !mk.isFire ? 'none' : '#1E1A15'
              return (
                <circle
                  key={`mk-${i}`}
                  cx={mk.x}
                  cy={mk.y}
                  r={active ? r : 0}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={mk.isFire ? 2 : 2.2}
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
          ↳ Sommige van deze gebeurtenissen zijn illustratief. In de app sleep je
          ze op de tijdlijn, voeg je eigen mijlpalen toe (kind, verbouwing,
          erfenis) en herrekent de lijn live.
        </p>
      </div>
    </section>
  )
}

/** Houd annotatie-tekst binnen de viewBox-breedte. */
function clampX(x: number): number {
  return Math.max(60, Math.min(x, VB_W - 60))
}

/** FIRE-moment krijgt de gouden 'leven'-tag; rest volgt het type. */
function tagForEvent(ev: ReportLifeEvent): string {
  if (ev.name.toLowerCase().includes('fire')) return 'leven-gold'
  return EVENT_TAG[ev.type] ?? 'neutral'
}

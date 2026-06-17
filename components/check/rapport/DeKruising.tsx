'use client'

import type { ReportKruising, ReportSavingsHistory } from '@/lib/check/types'
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

// viewBox-geometrie kruisingsgrafiek
const VB_W = 800
const VB_H = 320
const PLOT = { x0: 64, y0: 40, x1: 784, y1: 280 }

export function DeKruising({
  kruising,
  savingsHistory,
}: {
  kruising: ReportKruising
  savingsHistory: ReportSavingsHistory
}) {
  const reduce = useReducedMotion()
  const { ref, inView } = useInViewOnce<HTMLDivElement>(0.2)
  const active = reduce || inView

  // ── dynamische assen ──
  const { min: ageMin, max: ageMax } = ageExtent(kruising.vOp, kruising.vNodig)
  const rawMax = seriesMax(kruising.vOp, kruising.vNodig)
  const yMax = niceMax(rawMax)

  const sx = makeScale(ageMin, ageMax, PLOT.x0, PLOT.x1)
  const sy = makeScale(0, yMax, PLOT.y1, PLOT.y0)

  const vOpPts = kruising.vOp.map((p) => ({ x: sx(p.age), y: sy(p.value) }))
  const vNodigPts = kruising.vNodig.map((p) => ({ x: sx(p.age), y: sy(p.value) }))

  const vOpLine = smoothPath(vOpPts)
  const vOpArea =
    vOpPts.length > 0
      ? `${vOpLine} L${vOpPts[vOpPts.length - 1].x},${PLOT.y1} L${vOpPts[0].x},${PLOT.y1} Z`
      : ''
  const vNodigLine = smoothPath(vNodigPts)
  const vOpDash = pathLength(vOpPts)

  const yTicks = euroAxisTicks(yMax, 4)

  // x-as labels: ~5 leeftijdsmarkeringen
  const xTickCount = 5
  const xTicks = Array.from({ length: xTickCount }, (_, i) =>
    Math.round(ageMin + ((ageMax - ageMin) * i) / (xTickCount - 1)),
  )

  // kruispunt
  const cross = kruising.crossing
  const crossX = cross ? sx(cross.age) : null
  const crossY = cross ? sy(cross.value) : null

  return (
    <section id="s3">
      <div className="wrap">
        <div className="eyebrow">
          <span className="num">3</span> De kruising{' '}
          <span className="swatch" style={{ background: 'var(--horizon)' }} />
        </div>
        <h2>Twee lijnen die elkaar gaan raken</h2>
        <p className="lede">
          Geen vaste 4%-regel. We laten twee lijnen lopen: het vermogen dat je{' '}
          <em>opbouwt</em> en het vermogen dat je <em>nodig hebt</em>. Waar ze
          elkaar kruisen — dáár wordt werken een keuze.
        </p>

        <div className="chart-card" ref={ref}>
          <div className="chart-head">
            <div>
              <div className="chart-title">
                Projectie {kruising.startYear} — {kruising.endYear}
              </div>
              <div className="chart-sub">
                reëel rendement {kruising.realReturnPct}% · spaarquote{' '}
                {kruising.savingsRatePct}% · jaarlijks geïndexeerd
              </div>
            </div>
            <div className="legend">
              <span>
                <i style={{ background: 'var(--green)' }} />
                Opgebouwd
              </span>
              <span>
                <i style={{ background: 'var(--horizon)' }} />
                Benodigd
              </span>
            </div>
          </div>

          <svg
            className="chart"
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            role="img"
            aria-label="Lijngrafiek opgebouwd versus benodigd vermogen"
          >
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
              {/* assen */}
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
              <text x="30" y={PLOT.y1 + 4}>
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
              <text x={PLOT.x1 - 40} y={PLOT.y1 + 18} fontSize="9">
                leeftijd
              </text>
            </g>

            {/* V_op area + lijn */}
            <path
              d={vOpArea}
              fill="rgba(62,122,78,.14)"
              stroke="none"
              style={{
                opacity: active ? 1 : 0,
                transition: reduce ? undefined : 'opacity 1.2s .3s',
              }}
            />
            <path
              d={vOpLine}
              fill="none"
              stroke="#3E7A4E"
              strokeWidth="3"
              strokeDasharray={vOpDash}
              strokeDashoffset={active ? 0 : vOpDash}
              style={{
                transition: reduce
                  ? undefined
                  : 'stroke-dashoffset 1.8s .2s ease',
              }}
            />
            {/* V_nodig stippellijn */}
            <path
              d={vNodigLine}
              fill="none"
              stroke="#5B3A8C"
              strokeWidth="3"
              strokeDasharray="6 5"
            />

            {/* kruispunt */}
            {cross && crossX != null && crossY != null && (
              <>
                <line
                  x1={crossX}
                  y1={crossY}
                  x2={crossX}
                  y2={PLOT.y1}
                  stroke="#5B3A8C"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  style={{
                    opacity: active ? 1 : 0,
                    transition: reduce ? undefined : 'opacity .5s 1.8s',
                  }}
                />
                <circle
                  cx={crossX}
                  cy={crossY}
                  r={active ? 7 : 0}
                  fill="#fff"
                  stroke="#5B3A8C"
                  strokeWidth="3"
                  style={{
                    transition: reduce
                      ? undefined
                      : 'r .5s 1.7s cubic-bezier(.2,.7,.2,1)',
                  }}
                />
                <g
                  style={{
                    opacity: active ? 1 : 0,
                    transition: reduce ? undefined : 'opacity .5s 1.9s',
                  }}
                >
                  <rect
                    x={Math.min(crossX - 74, VB_W - 166)}
                    y={Math.max(crossY - 37, 6)}
                    width="156"
                    height="30"
                    rx="4"
                    fill="#5B3A8C"
                  />
                  <text
                    x={Math.min(crossX - 74, VB_W - 166) + 10}
                    y={Math.max(crossY - 37, 6) + 19}
                    fill="#fff"
                    fontSize="12"
                    style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace' }}
                  >
                    FIRE · {cross.age} jaar · {euroAxisLabel(cross.value)}
                  </text>
                </g>
              </>
            )}
          </svg>

          <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginTop: 12 }}>
            {cross ? (
              <>
                Op je {cross.age}e snijdt je opgebouwde vermogen (
                {euroAxisLabel(cross.value)}) de lijn van wat je nodig hebt. De
                benodigde lijn ligt vlak omdat je uitgaven stabiel zijn — het is
                je opbouw die het werk doet.
              </>
            ) : (
              <>
                Binnen deze projectie raken de lijnen elkaar nog niet — je opbouw
                blijft onder de benodigde lijn. In de app schuif je aan de knoppen
                om te zien wat het kruispunt naar voren haalt.
              </>
            )}
          </p>
        </div>

        {/* spaarquote-historie */}
        <h3 className="sub">Spaarquote — laatste 12 maanden</h3>
        <SavingsHistoryChart savingsHistory={savingsHistory} reduce={reduce} />
      </div>
    </section>
  )
}

// ── Spaarquote-staafdiagram ─────────────────────────────────────────────────
function SavingsHistoryChart({
  savingsHistory,
  reduce,
}: {
  savingsHistory: ReportSavingsHistory
  reduce: boolean
}) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>(0.2)
  const active = reduce || inView

  if (!savingsHistory.available || !savingsHistory.bars?.length) {
    return (
      <div className="chart-card" ref={ref}>
        <div className="chart-head">
          <div>
            <div className="chart-title">Nog geen maandhistorie</div>
            <div className="chart-sub">{savingsHistory.note}</div>
          </div>
        </div>
        <p style={{ fontSize: 14, color: 'var(--ink-soft)' }}>
          In de funnel meten we je spaarquote nog niet per maand. Zodra je in de
          app je rekeningen koppelt, vult deze grafiek zich met je echte maandlijn
          — doel: {savingsHistory.targetPct}%.
        </p>
      </div>
    )
  }

  const bars = savingsHistory.bars
  const target = savingsHistory.targetPct
  // dynamische y-top: net boven max(spaarquote, doel)
  const dataMax = Math.max(...bars.map((b) => b.pct), target)
  const yTop = Math.ceil((dataMax + 4) / 5) * 5

  const X0 = 44
  const X1 = 792
  const baseY = 150
  const topY = 20
  const h = baseY - topY
  const bw = (X1 - X0) / bars.length
  const pad = bw * 0.22

  const targetY = baseY - (target / yTop) * h

  return (
    <div className="chart-card" ref={ref}>
      <div className="chart-head">
        <div>
          <div className="chart-title">Hoeveel je maandelijks opzij zette</div>
          <div className="chart-sub">{savingsHistory.note}</div>
        </div>
      </div>
      <svg
        className="chart"
        viewBox="0 0 800 180"
        role="img"
        aria-label="Staafdiagram spaarquote per maand"
      >
        {/* assen */}
        <line x1={X0} y1={topY} x2={X0} y2={baseY} stroke="#1E1A15" strokeWidth="1.5" />
        <line x1={X0} y1={baseY} x2={X1} y2={baseY} stroke="#1E1A15" strokeWidth="1.5" />
        {/* doellijn + labels */}
        <line className="grid-line" x1={X0} y1={targetY} x2={X1} y2={targetY} />
        <text x="4" y={targetY + 4} className="axis-lbl">
          {target}%
        </text>
        <text x="4" y={topY + 4} className="axis-lbl">
          {yTop}%
        </text>
        <g>
          {bars.map((bar, i) => {
            const x = X0 + i * bw + pad
            const w = bw - pad * 2
            const bh = (bar.pct / yTop) * h
            const y = baseY - bh
            const fill = bar.pct >= target ? '#3E7A4E' : '#C99416'
            return (
              <g key={bar.month}>
                <rect
                  x={x}
                  width={w}
                  y={active ? y : baseY}
                  height={active ? bh : 0}
                  fill={fill}
                  rx="2"
                  style={{
                    transition: reduce
                      ? undefined
                      : `height .6s ${i * 0.055}s cubic-bezier(.2,.7,.2,1), y .6s ${i * 0.055}s cubic-bezier(.2,.7,.2,1)`,
                  }}
                />
                <text
                  x={x + w / 2}
                  y="168"
                  textAnchor="middle"
                  className="axis-lbl"
                >
                  {bar.month}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

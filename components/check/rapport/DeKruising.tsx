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

// App-chart-signatuur (SimChart): opbouw = horizon-goud, afbouw/benodigd = kern-bruin.
// IBM Plex Mono is in deze route de mono-stijl (zie rapport/layout.tsx).
const COLOR_OPBOUW = 'var(--horizon)'
const COLOR_NODIG = 'var(--kern)'
const MONO = 'var(--font-ibm-plex-mono), monospace'

/**
 * "De kruising" als INNER body (geen eigen <section>/eyebrow/<h2> — die bezit
 * de gedeelde `Toekomst`-sectie). Plot het LIQUIDE/FIRE-eligible vermogen:
 * V_op (opbouw) tegen V_nodig (benodigd). Eigen Y-as.
 */
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

  // ── rendement-scenario's (−2% / +2%) als bandbreedte rond vOp ──
  // Consume-only: de reeksen komen rechtstreeks uit de DTO; we schalen ze enkel.
  const scenarios = (kruising.scenarios ?? []).filter((s) => s.vOp.length > 0)
  const lowScenario = scenarios.find((s) => s.returnDeltaPct < 0)
  const highScenario = scenarios.find((s) => s.returnDeltaPct > 0)
  const lowPts = lowScenario
    ? lowScenario.vOp.map((p) => ({ x: sx(p.age), y: sy(p.value) }))
    : []
  const highPts = highScenario
    ? highScenario.vOp.map((p) => ({ x: sx(p.age), y: sy(p.value) }))
    : []
  const lowLine = smoothPath(lowPts)
  const highLine = smoothPath(highPts)
  // Gevulde band tussen hoog (boven) en laag (onder): smooth hoog-pad vooruit,
  // dan met rechte segmenten langs de laag-reeks terug en sluiten.
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
    <>
      <h3 className="sub" style={{ marginTop: 8 }}>
        De kruising — wanneer je opbouw je doel raakt
      </h3>
      <p className="lede">
        Geen vaste 4%-regel. We laten twee lijnen lopen: het vermogen dat je{' '}
        <em>opbouwt</em> en het vermogen dat je <em>nodig hebt</em>. Waar ze
        elkaar kruisen — dáár wordt werken een keuze. Deze grafiek toont je{' '}
        <span className="vt">liquide, vrij besteedbare</span> vermogen.
      </p>

      <div className="chart-card" ref={ref}>
        <div className="chart-head">
          <div>
            <div className="chart-title">
              Projectie {kruising.startYear} — {kruising.endYear}
            </div>
            <div className="chart-sub">
              liquide vermogen · reëel rendement {kruising.realReturnPct}% ·
              spaarquote {kruising.savingsRatePct}% · jaarlijks geïndexeerd
            </div>
          </div>
          <div className="legend">
            <span>
              <i style={{ background: COLOR_OPBOUW }} />
              Opgebouwd
            </span>
            <span>
              <i style={{ background: COLOR_NODIG }} />
              Benodigd
            </span>
            {hasBand && (
              <span>
                <i style={{ background: COLOR_OPBOUW, opacity: 0.35 }} />
                −2% · basis · +2% rendement
              </span>
            )}
          </div>
        </div>

        <svg
          className="chart"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          role="img"
          aria-label="Lijngrafiek opgebouwd versus benodigd liquide vermogen"
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
            {/* baseline + as */}
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
            <text x={PLOT.x1} y={PLOT.y1 + 32} fontSize="9" textAnchor="end">
              leeftijd
            </text>
          </g>

          {/* rendement-band (−2% … +2%) — semitransparante GOUD-vulling achter de basislijn */}
          {hasBand && (
            <>
              <path
                d={bandPath}
                fill={COLOR_OPBOUW}
                stroke="none"
                style={{
                  opacity: active ? 0.16 : 0,
                  transition: reduce ? undefined : 'opacity 1.2s .4s',
                }}
              />
              {highLine && (
                <path
                  d={highLine}
                  fill="none"
                  stroke={COLOR_OPBOUW}
                  strokeWidth="1.5"
                  strokeDasharray="2 4"
                  style={{
                    opacity: active ? 0.7 : 0,
                    transition: reduce ? undefined : 'opacity 1s .5s',
                  }}
                />
              )}
              {lowLine && (
                <path
                  d={lowLine}
                  fill="none"
                  stroke={COLOR_OPBOUW}
                  strokeWidth="1.5"
                  strokeDasharray="2 4"
                  style={{
                    opacity: active ? 0.7 : 0,
                    transition: reduce ? undefined : 'opacity 1s .5s',
                  }}
                />
              )}
            </>
          )}

          {/* V_op area + lijn (opbouw = goud) */}
          <path
            d={vOpArea}
            fill={COLOR_OPBOUW}
            stroke="none"
            style={{
              opacity: active ? 0.12 : 0,
              transition: reduce ? undefined : 'opacity 1.2s .3s',
            }}
          />
          <path
            d={vOpLine}
            fill="none"
            stroke={COLOR_OPBOUW}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={vOpDash}
            strokeDashoffset={active ? 0 : vOpDash}
            style={{
              transition: reduce ? undefined : 'stroke-dashoffset 1.8s .2s ease',
            }}
          />
          {/* V_nodig stippellijn (benodigd = bruin) */}
          <path
            d={vNodigLine}
            fill="none"
            stroke={COLOR_NODIG}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="6 5"
          />

          {/* kruispunt = verticale lijn + dot + label (SimChart-FIRE-signatuur, goud) */}
          {cross && crossX != null && crossY != null && (
            <>
              <line
                x1={crossX}
                y1={PLOT.y0}
                x2={crossX}
                y2={PLOT.y1}
                stroke={COLOR_OPBOUW}
                strokeWidth="1.5"
                strokeDasharray="6 3"
                style={{
                  opacity: active ? 0.6 : 0,
                  transition: reduce ? undefined : 'opacity .5s 1.8s',
                }}
              />
              <circle
                cx={crossX}
                cy={crossY}
                r={active ? 6 : 0}
                fill="var(--paper)"
                stroke={COLOR_OPBOUW}
                strokeWidth="2.5"
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
                  fill={COLOR_OPBOUW}
                />
                <text
                  x={Math.min(crossX - 74, VB_W - 166) + 10}
                  y={Math.max(crossY - 37, 6) + 19}
                  fill="var(--paper)"
                  fontSize="12"
                  style={{ fontFamily: MONO }}
                >
                  Vrij · {cross.age} jaar · {euroAxisLabel(cross.value)}
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
              benodigde lijn ligt vlak omdat je uitgaven stabiel zijn — het is je
              opbouw die het werk doet.
              {hasBand && (
                <>
                  {' '}
                  De band eromheen toont de marge: bij 2% lager rendement schuift
                  je kruispunt naar achteren, bij 2% hoger naar voren.
                </>
              )}
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
    </>
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
        <line x1={X0} y1={topY} x2={X0} y2={baseY} stroke="var(--border-md)" strokeWidth="1.5" />
        <line x1={X0} y1={baseY} x2={X1} y2={baseY} stroke="var(--border-md)" strokeWidth="1.5" />
        {/* doellijn + labels (goud = doel) */}
        <line
          x1={X0}
          y1={targetY}
          x2={X1}
          y2={targetY}
          stroke={COLOR_OPBOUW}
          strokeWidth="1.5"
          strokeDasharray="6 3"
          opacity="0.6"
        />
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
            // op/boven doel = horizon-goud, eronder = kern-bruin (gedempt)
            const fill = bar.pct >= target ? COLOR_OPBOUW : COLOR_NODIG
            return (
              <g key={bar.month}>
                <rect
                  x={x}
                  width={w}
                  y={active ? y : baseY}
                  height={active ? bh : 0}
                  fill={fill}
                  opacity={bar.pct >= target ? 0.95 : 0.55}
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

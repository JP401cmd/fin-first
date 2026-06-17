'use client'

import type { ReactNode } from 'react'
import type { ReportHealth, ReportBenchmark } from '@/lib/check/types'
import { useInViewOnce, useReducedMotion, useCountUp } from './hooks'

/**
 * Veilige mini-renderer: zet ALLEEN `<em>…</em>`-cursief om naar React-nodes en
 * behandelt al het overige als platte tekst. Geen `dangerouslySetInnerHTML` →
 * geen XSS-oppervlak, ook niet als de copy (deels) AI-gegenereerd is.
 */
function renderEmphasis(text: string): ReactNode[] {
  const parts = text.split(/(<em>.*?<\/em>)/g)
  return parts.map((part, i) => {
    const m = /^<em>(.*?)<\/em>$/.exec(part)
    if (m) return <em key={i}>{m[1]}</em>
    return <span key={i}>{part}</span>
  })
}

const GAUGE_CIRC = 502.6 // 2πr, r=80

const STATUS_DOT: Record<string, string> = {
  green: 'sl-green',
  amber: 'sl-amber',
  red: 'sl-red',
  grey: 'sl-grey',
}

/**
 * Publieke weergavenaam per pijler. We leiden in dit rapport bewust met
 * "vrijheid" i.p.v. "FIRE" (#7) — de DTO blijft ongemoeid; alleen het label
 * dat de lezer ziet wordt verzacht. Overige pijlers gebruiken hun DTO-naam.
 */
const PILLAR_DISPLAY_NAME: Record<string, string> = {
  fire_progress: 'Vrijheidsvoortgang',
}

function pillarDisplayName(id: string, name: string): string {
  if (PILLAR_DISPLAY_NAME[id]) return PILLAR_DISPLAY_NAME[id]
  // Vangnet: ook als de id ooit wijzigt maar de naam nog "FIRE" bevat.
  if (/\bFIRE\b/i.test(name)) return name.replace(/\bFIRE[- ]?voortgang\b/i, 'Vrijheidsvoortgang')
  return name
}

const PILLAR_BAR_COLOR: Record<string, string> = {
  green: 'var(--green)',
  // Amber-status = échte amber/oranje (box1-token), gelijk aan de stoplicht-dot
  // (.sl-amber) — NOOIT paars. Paars is in dit rapport voorbehouden aan
  // toekomst/projectie; een gezondheids-"aandacht"-balk hoort stoplicht-amber.
  amber: 'var(--color-box1-500, #f59e0b)',
  red: 'var(--red)',
  grey: 'var(--rule)',
}

/** Gauge-kleur op de stoplicht-status van de totaalscore (>=70 groen etc.). */
function gaugeLabelColor(score: number): string {
  if (score >= 70) return 'var(--green)'
  // Midden-band = stoplicht-amber, consistent met de pijler-dots/-balken. De
  // donkere box1-700-tint i.p.v. -500 omdat dit label WITTE tekst draagt
  // (#fff op box1-500 zou ~2:1 contrast geven; box1-700 ≈ 4.9:1, AA-veilig).
  if (score >= 50) return 'var(--color-box1-700, #b45309)'
  return 'var(--red)'
}

/** Bar-breedte (in px binnen de 800-brede viewBox) voor de benchmark-rijen. */
const BENCH_TRACK_X = 230
const BENCH_TRACK_MAX = 320 // max px-breedte voor "jouw" balk

export function Gezondheidsgetal({
  health,
  benchmark,
}: {
  health: ReportHealth
  benchmark: ReportBenchmark
}) {
  const reduce = useReducedMotion()
  const { ref, inView } = useInViewOnce<HTMLElement>(0.2)

  const scoreText = useCountUp(health.score, inView, { reduce, durationMs: 1400 })
  const active = reduce || inView

  const arcOffset = active
    ? GAUGE_CIRC - (GAUGE_CIRC * health.score) / 100
    : GAUGE_CIRC

  // Benchmark-balken: per rij normaliseren op het maximum van jou/gemiddelde
  // (zo schalen de breedtes op de échte DTO-waarden, niet op hardcoded px).
  const benchRows = benchmark.rows.map((row) => {
    const rowMax = Math.max(row.you, row.average, 1)
    const youW = (row.you / rowMax) * BENCH_TRACK_MAX
    const avgW = (row.average / rowMax) * (BENCH_TRACK_MAX * 0.82)
    return { ...row, youW, avgW }
  })

  const rowH = 52
  const svgH = benchRows.length * rowH + 6

  return (
    <section id="s2" ref={ref}>
      <div className="wrap">
        <div className="eyebrow">
          <span className="num">2</span> Je gezondheidsgetal{' '}
          <span
            className="swatch"
            style={{
              background:
                'linear-gradient(90deg,var(--kern),var(--wil),var(--vrijgekocht))',
            }}
          />
        </div>
        <h2>
          {health.score} van de 100
        </h2>
        <p className="lede">
          Eén getal dat een paar vragen samenvat: kom je rond, heb je een buffer,
          zit je niet te zwaar in schuld, en groei je richting vrijheid? Hieronder
          zie je dezelfde pijlers als je gezondheidsgetal in de app.
        </p>

        {/* gauge */}
        <div className="gauge-row">
          <div className="gauge">
            <svg width="190" height="190" viewBox="0 0 190 190">
              <circle
                cx="95"
                cy="95"
                r="80"
                fill="none"
                stroke="var(--paper-3)"
                strokeWidth="18"
              />
              <circle
                cx="95"
                cy="95"
                r="80"
                fill="none"
                stroke="url(#gg)"
                strokeWidth="18"
                strokeLinecap="round"
                strokeDasharray={GAUGE_CIRC}
                strokeDashoffset={arcOffset}
                style={{
                  transition: reduce
                    ? undefined
                    : 'stroke-dashoffset 1.6s cubic-bezier(.2,.7,.2,1)',
                }}
              />
              <defs>
                {/* Score-sweep: kern-bruin → goud → positief-groen. */}
                <linearGradient id="gg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="var(--kern)" />
                  <stop offset=".5" stopColor="var(--vrijgekocht)" />
                  <stop offset="1" stopColor="var(--green)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="gauge-center">
              <div>
                <div className="gauge-num">{scoreText}</div>
                <div className="gauge-of">/ 100</div>
                <div
                  className="gauge-label"
                  style={{ background: gaugeLabelColor(health.score) }}
                >
                  {health.label}
                </div>
              </div>
            </div>
          </div>
          <div className="gauge-copy">
            <p>{renderEmphasis(health.copy)}</p>
          </div>
        </div>

        {/* pillars */}
        <div className="pillars">
          {health.pillars.map((p) => (
            <div className="pillar" key={p.id}>
              <div className="pillar-head">
                <span className="pillar-name">{pillarDisplayName(p.id, p.name)}</span>
                <span className="pillar-score">
                  {p.score != null ? p.score : '—'}
                  <span
                    className={`stoplight ${STATUS_DOT[p.status] ?? 'sl-grey'}`}
                  />
                </span>
              </div>
              <div className="pillar-bar">
                <i
                  style={{
                    width: active && p.score != null ? `${p.score}%` : 0,
                    background: PILLAR_BAR_COLOR[p.status] ?? 'var(--rule)',
                  }}
                />
              </div>
              <div className="pillar-note">{p.note}</div>
            </div>
          ))}
        </div>

        {/* benchmark */}
        <h3 className="sub">Hoe je je verhoudt</h3>
        <div className="chart-card">
          <div className="chart-head">
            <div>
              <div className="chart-title">Jij vs. Nederlandse benchmark</div>
              <div className="chart-sub">
                jouw waarde (kleur) tegenover het landelijk gemiddelde (grijs) ·{' '}
                {benchmark.sourceBadge}
              </div>
            </div>
          </div>
          <svg
            className="chart"
            viewBox={`0 0 800 ${svgH}`}
            role="img"
            aria-label="Vergelijkende balken jij versus gemiddelde"
          >
            <g
              fontSize="12"
              style={{ fontFamily: 'var(--font-ibm-plex-mono), monospace' }}
            >
              {benchRows.map((row, i) => {
                const baseY = 18 + i * rowH
                const youBarY = baseY
                const avgBarY = baseY + 18
                const youColor = row.better ? 'var(--green)' : 'var(--red)'
                return (
                  <g key={row.label}>
                    <text x="0" y={baseY + 12} fill="var(--ink-soft)">
                      {row.label}
                    </text>
                    <rect
                      x={BENCH_TRACK_X}
                      y={youBarY}
                      height="14"
                      width={active ? row.youW : 0}
                      fill={youColor}
                      style={{
                        transition: reduce
                          ? undefined
                          : `width 1s cubic-bezier(.2,.7,.2,1) ${i * 0.12}s`,
                      }}
                    />
                    <text
                      x={BENCH_TRACK_X + row.youW + 14}
                      y={youBarY + 11}
                      fill="var(--ink)"
                    >
                      {row.youDisplay}
                    </text>
                    <rect
                      x={BENCH_TRACK_X}
                      y={avgBarY}
                      height="9"
                      width={row.avgW}
                      fill="var(--paper-3)"
                    />
                    <text
                      x={BENCH_TRACK_X + row.avgW + 8}
                      y={avgBarY + 8}
                      fill="var(--ink-soft)"
                      fontSize="10"
                    >
                      {row.averageDisplay}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
        </div>
      </div>
    </section>
  )
}

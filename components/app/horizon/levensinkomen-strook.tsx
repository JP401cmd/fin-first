'use client'

/**
 * LevensinkomenStrook — dekkingsgraad% per leeftijd als stoplicht-stippen die
 * meebewegen met de levenslijn (de dichtstbijzijnde knoop licht op bij de
 * actieve hover/playback-leeftijd). Puur presentational; data komt uit
 * `buildCoverageStrip` (lib/horizon/coverage-strip.ts).
 *
 * Stoplichtkleuren = SEMANTISCHE status (emerald/amber/red), niet het
 * module-accent — consistent met lib/leverage-status.ts.
 */

import { useState } from 'react'

export interface CoverageNodeView {
  age: number
  coveragePct: number
  status: 'green' | 'amber' | 'red'
}

export interface LevensinkomenStrookProps {
  nodes: CoverageNodeView[]
  /** Actieve leeftijd (hover/playback); highlight de dichtstbijzijnde knoop. Null = geen. */
  activeAge: number | null
  /** Legendabalk: opbouw / brug / onttrekking (kleur = CSS-kleurwaarde, width in %). */
  segments?: { label: string; color: string; widthPct: number }[]
}

const DOT_BG: Record<CoverageNodeView['status'], string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
}
const PCT_TEXT: Record<CoverageNodeView['status'], string> = {
  green: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
}

function nearestAge(nodes: CoverageNodeView[], age: number): number | null {
  if (!nodes.length) return null
  let best = nodes[0].age
  let bestDiff = Math.abs(nodes[0].age - age)
  for (const n of nodes) {
    const d = Math.abs(n.age - age)
    if (d < bestDiff) {
      bestDiff = d
      best = n.age
    }
  }
  return best
}

export function LevensinkomenStrook({ nodes, activeAge, segments }: LevensinkomenStrookProps) {
  const [info, setInfo] = useState(false)
  const activeNode = activeAge == null ? null : nearestAge(nodes, activeAge)

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setInfo(v => !v)}
          aria-label="Uitleg dekkingsgraad"
          aria-expanded={info}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[12px] italic text-[var(--ink-3)] transition hover:border-[var(--color-horizon-500)] hover:text-[var(--color-horizon-600)]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          i
        </button>
      </div>

      {info && (
        <div className="mb-4 rounded-md border border-[var(--border-ed)] border-l-[3px] border-l-[var(--color-horizon-500)] bg-[var(--subtle)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--ink-3)]">
          <div className="mb-1.5 font-semibold text-[var(--ink)]" style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}>
            Zo werkt de dekkingsgraad
          </div>
          <p className="m-0">
            dekkingsgraad = (vaste inkomsten + veilige onttrekking) ÷ gewenste besteding × 100%. 100% = volledig gedekt
            zonder extra in te teren. <b className="text-[var(--ink)]">Groen ≥ 100%</b> — inkomen + veilige onttrekking
            dekken je besteding. <b className="text-[var(--ink)]">Amber 90–99%</b> — klein tekort, je teert licht in.{' '}
            <b className="text-[var(--ink)]">Rood &lt; 90%</b> — structureel tekort dat jaar; bijsturen. Waarom het dipt:
            in de brugjaren (tussen FIRE en AOW) is er nog geen AOW/pensioen, dus alles komt uit vermogen → onder 100%.
            Vanaf AOW tillen AOW + pensioen je er weer boven.
          </p>
        </div>
      )}

      <div className="flex gap-1">
        {nodes.map(n => {
          const active = n.age === activeNode
          return (
            <div
              key={n.age}
              className={`flex-1 rounded-lg px-1 py-1.5 text-center transition ${
                active ? 'bg-[var(--subtle)] -translate-y-0.5 shadow-sm' : ''
              }`}
            >
              <div className="text-[11px] font-semibold text-[var(--ink-3)]">{n.age}</div>
              <div className={`mx-auto my-1 h-5 w-5 rounded-full ${DOT_BG[n.status]}`} />
              <div className={`text-[12px] font-semibold tabular-nums ${PCT_TEXT[n.status]}`}>{n.coveragePct}%</div>
            </div>
          )
        })}
      </div>

      {segments && segments.length > 0 && (
        <>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full">
            {segments.map(s => (
              <div key={s.label} style={{ width: `${s.widthPct}%`, background: s.color }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--ink-3)]">
            {segments.map(s => (
              <span key={s.label} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

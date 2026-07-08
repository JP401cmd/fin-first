'use client'

/**
 * GuardrailKompas — horizontale gekleurde balk met vier bestedingsgrenzen
 * (te weinig · veilig · gepland · meevaller) en een "jij"-marker. Toont bij
 * welk maandbedrag je meer/minder kunt uitgeven. Puur presentational; de vier
 * niveaus komen uit `computeGuardrailBounds` (lib/horizon/guardrail-bounds.ts).
 *
 * Verloop = SEMANTISCHE stoplichtkleuren (te weinig rood → ruimte groen),
 * niet het module-accent. "Jij"-marker in het horizon-accent.
 */

import { useState } from 'react'
import { formatCurrency } from '@/lib/format'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

export interface GuardrailKompasProps {
  /** €/maand-niveaus. */
  levels: { teWeinig: number; veilig: number; gepland: number; meevaller: number }
  /** Marker-positie (meestal === gepland). */
  you: number
  /** Optioneel: bv. "op leeftijd 64". */
  referenceAgeLabel?: string
}

const TICKS = [
  { key: 'teWeinig', label: 'te weinig' },
  { key: 'veilig', label: 'veilig' },
  { key: 'gepland', label: 'gepland' },
  { key: 'meevaller', label: 'meevaller' },
] as const

/** % padding aan weerszijden zodat de eind-ticks niet tegen de rand plakken. */
const EDGE_PAD = 8

export function GuardrailKompas({ levels, you, referenceAgeLabel }: GuardrailKompasProps) {
  const [info, setInfo] = useState(false)
  const vals = [levels.teWeinig, levels.veilig, levels.gepland, levels.meevaller, you]
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const posOf = (v: number) => EDGE_PAD + ((v - min) / span) * (100 - 2 * EDGE_PAD)

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setInfo(v => !v)}
          aria-label="Uitleg guardrail-kompas"
          aria-expanded={info}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[12px] italic text-[var(--ink-3)] transition hover:border-[var(--color-horizon-500)] hover:text-[var(--color-horizon-600)]"
          style={{ fontFamily: PLAYFAIR }}
        >
          i
        </button>
      </div>

      {info && (
        <div className="mb-4 rounded-md border border-[var(--border-ed)] border-l-[3px] border-l-[var(--color-horizon-500)] bg-[var(--subtle)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--ink-3)]">
          <div className="mb-1.5 font-semibold text-[var(--ink)]" style={{ fontFamily: PLAYFAIR }}>
            De data achter de grenzen
          </div>
          <p className="m-0">
            Je besteding wordt dynamisch begrensd op basis van je vermogen t.o.v. het pad (guardrail-methode).{' '}
            <b className="text-[var(--ink)]">Gepland</b> = je basis-bestedingsdoel.{' '}
            <b className="text-[var(--ink)]">Veilig</b> = hoogste niveau dat óók in een pessimistisch marktpad houdbaar
            blijft. <b className="text-[var(--ink)]">Te weinig</b> = hieronder geef je minder uit dan hoeft (over-sparen).{' '}
            <b className="text-[var(--ink)]">Meevaller</b> = komt je vermogen boven het pad uit, dan mag je tot hier
            opschalen — of eerder stoppen/schenken.
          </p>
        </div>
      )}

      <div className="relative mb-2 mt-9">
        {/* Gekleurde balk: te weinig (rood) → veilig (amber) → ruimte (groen) */}
        <div
          className="h-3.5 rounded-full"
          style={{ background: 'linear-gradient(90deg, var(--negative), var(--color-horizon-400) 42%, var(--positive) 78%)' }}
        />

        {/* Tick-labels boven de balk */}
        {TICKS.map(t => {
          const v = levels[t.key]
          return (
            <div
              key={t.key}
              className="absolute -top-8 -translate-x-1/2 text-center"
              style={{ left: `${posOf(v)}%` }}
            >
              <div className="text-[13px] font-semibold tabular-nums text-[var(--ink)]" style={{ fontFamily: PLAYFAIR }}>
                {formatCurrency(v)}
              </div>
              <div className="text-[10px] uppercase tracking-[0.05em] text-[var(--ink-3)]">{t.label}</div>
            </div>
          )
        })}

        {/* "Jij"-marker */}
        <div
          className="absolute top-[-2px] h-[18px] w-[18px] -translate-x-1/2 rounded-full border-[3px] bg-[var(--paper)]"
          style={{ left: `${posOf(you)}%`, borderColor: 'var(--color-horizon-600)' }}
          title="Jij"
          aria-label={`Jouw besteding: ${formatCurrency(you)} per maand`}
        />
      </div>

      {referenceAgeLabel && (
        <div className="mt-1 text-[11px] text-[var(--ink-3)]">Referentie: {referenceAgeLabel}</div>
      )}
    </div>
  )
}

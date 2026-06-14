'use client'

/**
 * uitleg-chapter.tsx — herbruikbare hoofdstuk-shell voor de
 * "Zo werkt jouw grafiek"-walkthrough.
 *
 * Eén hoofdstuk = genummerde kop + leek-zin + "jouw getallen"-rij + beeld-slot.
 * Editorial-stijl, horizon-accenten. Geen eigen berekening — krijgt alles via props.
 */

import type { ReactNode } from 'react'

export interface JouwGetal {
  label: string
  /** Hoofdwaarde (bv. een bedrag of leeftijd) — font-mono tabular-nums. */
  value: string
  /** Optionele subregel onder de waarde (bv. vrijheidstijd-framing). */
  sub?: string
}

export interface UitlegChapterProps {
  /** Hoofdstuknummer (1–4). */
  number: number
  /** Korte titel, bv. "Opbouw". */
  title: string
  /** Eén zin leek-uitleg. */
  lead: string
  /** "Jouw getallen"-rij — 0..n cellen. */
  figures: JouwGetal[]
  /** Beeld-slot: uitgelicht curve-stuk en/of concept-diagram. */
  children?: ReactNode
}

export function UitlegChapter({ number, title, lead, figures, children }: UitlegChapterProps) {
  return (
    <section
      aria-labelledby={`uitleg-hoofdstuk-${number}`}
      className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5"
    >
      {/* Kop: nummer + titel */}
      <div className="mb-3 flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-horizon-50 font-mono text-[13px] font-bold text-horizon-700"
        >
          {number}
        </span>
        <h3
          id={`uitleg-hoofdstuk-${number}`}
          className="text-base font-bold text-[var(--ink)] sm:text-lg"
        >
          {title}
        </h3>
      </div>

      {/* Leek-zin */}
      <p className="mb-4 text-sm leading-relaxed text-[var(--ink-2)]">{lead}</p>

      {/* Beeld-slot */}
      {children && <div className="mb-4">{children}</div>}

      {/* "Jouw getallen"-rij */}
      {figures.length > 0 && (
        <div>
          <p className="label-editorial mb-2 text-[var(--ink-4)]">JOUW GETALLEN</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {figures.map((f, i) => (
              <div
                key={i}
                className="rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--subtle)]/60 p-2.5"
              >
                <p className="font-sans text-[10px] leading-tight text-[var(--ink-4)]">{f.label}</p>
                <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {f.value}
                </p>
                {f.sub && (
                  <p className="mt-0.5 font-sans text-[10px] leading-tight text-horizon-700">
                    {f.sub}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

'use client'

import type { ReactNode } from 'react'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import type { PageInfoContent } from '@/lib/page-info-content'

/**
 * RegimeKaart — gedeeld presentational blok voor de "regime-drieluik"-inhoud
 * in de drie fase-analyse-modals (opbouw / overgang / onttrekking).
 *
 * Ronde-3-mockup, element ⑧ ("Drie fasen, drie regimes"): per fase een kaart
 * met rijen [label · mini-balk (relatief gewicht) · waarde], een voetnoot en
 * een i-uitleg. De balk toont het *relatieve* gewicht van elke hefboom/bron
 * t.o.v. de zwaarste rij in de kaart — geen absolute euro-schaal.
 *
 * Kleurregels (CLAUDE.md): bronnen dragen géén module-accent-identiteit maar
 * neutrale/semantische tonen —
 *   - `income`  = vaste/zekere inkomsten (AOW, pensioen, werk, sparen) → --positive
 *   - `wealth`  = vermogen / onttrekking (de "druk op je vermogen")     → horizon-token
 *   - `neutral` = kosten, buffer, kwalitatief-laag                      → --ink-3
 *   - `zero`    = bron die (nog) niets bijdraagt (AOW/pensioen €0)      → --ink-4
 * De horizon-token is de enige module-kleur — deze modals zijn Horizon-gekleurd
 * en "vermogen" ís het Horizon-domein.
 */

/**
 * Exacte inkomstensplitsing over een set jaarrijen — leest de read-only
 * `grossIncomeBySource`-velden (CF!D salaris vs. CF!H gebeurtenisBaten =
 * AOW + pensioen) i.p.v. een heuristiek op `grossIncome`.
 *
 * - `salaris` en `gebeurtenisBaten` komen EXACT uit de projectie.
 * - AOW vs. pensioen kan de bron niet apart leveren; we splitsen de EXACTE
 *   `gebeurtenisBaten`-pool met `yearlyAowIncome` als AOW-cap (salaris lekt hier
 *   dus NIET meer in, anders dan de oude `min(grossIncome, aow)`-heuristiek).
 * - Ontbreekt `grossIncomeBySource` op een rij (niet-kernel-pad), dan valt die
 *   rij terug op de oude heuristiek op `grossIncome`, zodat het gedrag niet
 *   regresseert wanneer het exacte veld nog niet beschikbaar is.
 *
 * Pure functie (geen React) — testbaar en zonder neveneffecten.
 */
export function sumIncomeBySource(
  rows: {
    grossIncome: number
    grossIncomeBySource?: { salaris: number; gebeurtenisBaten: number }
  }[],
  yearlyAowIncome: number,
): { salaris: number; aow: number; pensioen: number; gebeurtenisBaten: number } {
  const aowCap = Math.max(yearlyAowIncome, 0)
  let salaris = 0
  let gebeurtenisBaten = 0
  let aow = 0
  let pensioen = 0
  for (const r of rows) {
    const src = r.grossIncomeBySource
    if (src) {
      // Exacte weg: gebeurtenisBaten = AOW + pensioen, salaris apart.
      salaris += src.salaris
      const g = Math.max(src.gebeurtenisBaten, 0)
      gebeurtenisBaten += g
      const rowAow = Math.min(g, aowCap)
      aow += rowAow
      pensioen += Math.max(g - rowAow, 0)
    } else {
      // Fallback: exacte splitsing ontbreekt → oude heuristiek op grossIncome.
      const gi = Math.max(r.grossIncome, 0)
      gebeurtenisBaten += gi
      const rowAow = Math.min(gi, aowCap)
      aow += rowAow
      pensioen += Math.max(gi - rowAow, 0)
    }
  }
  return { salaris, aow, pensioen, gebeurtenisBaten }
}

export type RegimeTone = 'income' | 'wealth' | 'neutral' | 'zero'

const TONE_COLOR: Record<RegimeTone, string> = {
  income: 'var(--positive)',
  wealth: 'var(--color-horizon-500)',
  neutral: 'var(--ink-3)',
  zero: 'var(--ink-4)',
}

export interface RegimeKaartRow {
  /** Naam van de hefboom of bron, bv. "Vermogen" of "Sparen". */
  label: string
  /**
   * Relatief gewicht voor de balklengte — een euro-bedrag (dekkings-/inkomens-
   * aandeel) of een kwalitatieve score (0..1). Altijd ≥ 0; de balk normaliseert
   * intern t.o.v. de zwaarste rij in de kaart.
   */
  weight: number
  /** Rechter waarde: kwalitatief woord ("Hoog") of een <MaskedAmount>. */
  value: ReactNode
  /** Toon-token voor de mini-balk (default: neutral). */
  tone?: RegimeTone
  /** Optionele subtekst onder het label, bv. "geoormerkt bruggeld". */
  hint?: string
}

export interface RegimeKaartProps {
  /** Editorial titel, bv. "Waar de dekking vandaan komt". */
  title: string
  /** Korte mono-kicker boven de titel, bv. "BRUG · DEKKING". */
  kicker?: string
  rows: RegimeKaartRow[]
  /** Voetnoot (serif italic) onder de rijen. */
  footnote: ReactNode
  /** i-uitleg ("Wat betekent dit?"). */
  infoContent: PageInfoContent
  /** Optionele status-pill rechtsboven (stoplicht-semantiek, geen accent). */
  statusPill?: { label: string; tone: 'good' | 'warn' | 'bad' }
  className?: string
}

const PILL_STYLE: Record<'good' | 'warn' | 'bad', string> = {
  good: 'border-[var(--positive)] text-[var(--positive)]',
  warn: 'border-amber-500 text-amber-600',
  bad: 'border-[var(--negative)] text-[var(--negative)]',
}

export function RegimeKaart({
  title,
  kicker,
  rows,
  footnote,
  infoContent,
  statusPill,
  className = '',
}: RegimeKaartProps) {
  // Normaliseer de balklengte t.o.v. de zwaarste rij (relatief gewicht).
  const maxWeight = rows.reduce((m, r) => Math.max(m, r.weight), 0)

  return (
    <div
      className={`relative rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 ${className}`}
    >
      {/* i-uitleg rechtsboven — zelfde patroon als PhaseIntro */}
      <PageInfoButton
        label="Wat betekent dit?"
        content={infoContent}
        className="absolute right-3 top-3"
      />

      {/* Header */}
      <div className="mb-3 pr-9">
        {kicker && (
          <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-3)]">
            {kicker}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h4
            className="text-[15px] font-bold leading-tight text-[var(--ink)] sm:text-base"
            style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
          >
            {title}
          </h4>
          {statusPill && (
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${PILL_STYLE[statusPill.tone]}`}
            >
              {statusPill.label}
            </span>
          )}
        </div>
      </div>

      {/* Rijen: [label · waarde] over [balk] */}
      <div className="space-y-2.5">
        {rows.map((row, i) => {
          const tone = row.tone ?? 'neutral'
          const barPct = maxWeight > 0 ? Math.round((row.weight / maxWeight) * 100) : 0
          return (
            <div key={`${row.label}-${i}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 shrink font-sans text-xs text-[var(--ink-2)] sm:text-sm">
                  {row.label}
                  {row.hint && (
                    <span className="ml-1.5 font-serif text-[11px] italic text-[var(--ink-3)]">
                      {row.hint}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink)]">
                  {row.value}
                </span>
              </div>
              {/* Mini-balk — relatief gewicht t.o.v. de zwaarste rij */}
              <div
                className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]"
                role="presentation"
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${barPct}%`, backgroundColor: TONE_COLOR[tone] }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Voetnoot */}
      <p className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2.5 font-serif text-[11px] italic leading-relaxed text-[var(--ink-3)] sm:text-xs">
        {footnote}
      </p>
    </div>
  )
}

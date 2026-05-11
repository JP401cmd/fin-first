'use client'

import type { ReactNode } from 'react'

/**
 * Bewijs-paneel (facts-panel) voor de editorial split-onboarding.
 *
 * Toont een figures-strip-achtige cel met:
 *   1. Kicker "FEITEN" + 28×1px module-streep (per ui-ux skill patroon-kaart
 *      *Kicker-streep*)
 *   2. Grote Playfair-black stat (uitzondering op DM Mono: figures-strip
 *      gebruikt Playfair, zie patroon-kaart *Figures-strip*)
 *   3. Italic Source Serif source-citation in `--ink-3`
 *
 * Op stap 4 (Bezittingen) wordt het paneel dynamisch: dan zit er een
 * cumulatief netto-vermogen-bedrag in de `evolution`-slot dat met
 * `useFlashChange` flasht (groen bij toename, rood bij afname). Op de
 * overige stappen blijft de slot leeg.
 *
 * **Renderstrategie**:
 * - Desktop (≥lg): rendert als rechter kolom van de split — wrapper levert
 *   eigen padding via parent (`OnboardingShell.aside`).
 * - Mobile (<lg): rendert als border-l-callout onder de input — zelfde
 *   typografie, smallere padding, en zonder de uppercase tracking-divergentie
 *   die desktop heeft. We renderen één markup en laten Tailwind classes
 *   per breakpoint variëren — zo voorkomen we duplicate JSX en SEO/DOM-drift.
 *
 * **Tinten**: gebruikt `--module-active-*`-tokens. Onboarding wrapper zet
 * deze op kern-shades (zie `OnboardingShell` voor de scoping), dus dit
 * component blijft module-onafhankelijk — bruikbaar in andere contexts later.
 */
export interface FactsPanelProps {
  /** Hoofdcijfer of -waarde (bv. "68%", "€3.350", "81"). */
  stat: string
  /** Subtekst onder de stat (bv. "van Nederlanders wil eerder stoppen met werken"). */
  sub: string
  /** Bron-citatie (bv. "CBS Inkomensstatistiek, 2024"). */
  source: string
  /**
   * Optionele dynamische uitbreiding (bv. cumulatief vermogen op stap 4).
   * Verschijnt onder de bron-citatie, gescheiden door een dotted rule.
   * Pas verschijnen wanneer de gebruiker daadwerkelijk iets gewijzigd heeft —
   * caller is verantwoordelijk voor null/undefined-handling.
   */
  evolution?: ReactNode
  /** Optionele extra classes voor de wrapper. */
  className?: string
}

export function FactsPanel({ stat, sub, source, evolution, className = '' }: FactsPanelProps) {
  return (
    <div
      className={`
        border-l-2 pl-4 py-1
        lg:border-l-0 lg:pl-0 lg:py-0
        ${className}
      `.trim()}
      style={{ borderLeftColor: 'var(--module-active-500)' }}
    >
      {/* Kicker: 28×1px streep + UPPERCASE label */}
      <div className="flex items-center gap-2.5 mb-3">
        <span
          aria-hidden
          className="inline-block w-7 h-px shrink-0"
          style={{ background: 'var(--module-active-500)' }}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--module-active-700)]">
          Feiten
        </span>
      </div>

      {/* Stat: Playfair black, groot.
          Op mobile iets kleiner zodat hij naast de input-kolom past wanneer
          het paneel als border-l-callout onderaan staat. */}
      <div
        className="font-black leading-none tracking-[-0.025em] text-[var(--ink)] text-[28px] sm:text-[32px] lg:text-[36px] tabular-nums"
        style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
      >
        {stat}
      </div>

      {/* Sub-tekst: kort + leesbaar. Source Serif zorgt voor warmth, italic
          niet — sub moet snel scanbaar zijn. */}
      <p
        className="mt-3 text-sm leading-snug text-[var(--ink-2)] max-w-[36ch]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {sub}
      </p>

      {/* Bron-citatie: italic, klein, in ink-3. Em-dash prefix als typografisch
          "attribution" — zelfde patroon als pull-quote source-line in
          kassabonnen. */}
      <p
        className="mt-2 italic text-[11px] leading-tight text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        &mdash; {source}
      </p>

      {/* Dynamic evolution slot — bv. cumulatief vermogen op stap 4.
          Gescheiden door een dotted rule om als "live data" te onderscheiden
          van de statische bron-stat. */}
      {evolution && (
        <div className="mt-5 pt-4 border-t border-dotted border-[var(--rule-soft)]">
          {evolution}
        </div>
      )}
    </div>
  )
}

'use client'

import type { ReactNode } from 'react'

/**
 * Sticky 1px voortgangsbalk bovenaan een onboarding-stap.
 *
 * Volgt page-type 7 (Wizard) uit de ui-ux-skill: dunne progress-bar met
 * module-active fill op het gevulde deel, en een rule-soft achtergrond voor
 * het resterende deel. De balk wordt boven beide kolommen van de editorial
 * split gerenderd (links de form-kolom, rechts het facts-paneel) en blijft
 * sticky bij scrollen.
 *
 * Een optionele `backSlot` rendert een terug-affordance links van de balk —
 * gebruikt voor de "← Terug"-tekstlink in het sticky top-bar gebied (mobile)
 * of als 44×44 icon-button (desktop). De slot is altijd opt-in zodat de
 * voortgangsbalk ook standalone ingezet kan worden.
 *
 * Accessibility: rendert als `role="progressbar"` met `aria-valuenow` /
 * `aria-valuemin` / `aria-valuemax` zodat schermlezers de voortgang
 * aankondigen. Respecteert `prefers-reduced-motion` door de transition op
 * `width` alleen toe te passen wanneer reduce niet actief is — Tailwind's
 * `motion-safe:` modifier doet dit voor ons.
 */
export interface OnboardingProgressBarProps {
  /** 1-indexed huidige stap (1..total). Boven `total` clampen we naar `total`. */
  current: number
  /** Totaal aantal content-stappen (exclusief saving/success). */
  total: number
  /** Optionele terug-affordance, links van de balk. */
  backSlot?: ReactNode
  /**
   * Optionele tweede regel ONDER de balk, binnen dezelfde sticky wrapper —
   * gebruikt voor de meelopende vrijheidstijd-teller. Bewust een eigen regel
   * en geen extra kolom in de balk-rij: op mobiel staan daar al de
   * terug-link, de balk en de stap-indicator, en een vierde element zou de
   * balk tot een streepje persen.
   */
  tickerSlot?: ReactNode
  /** Optioneel: extra Tailwind classes voor de buitenste wrapper. */
  className?: string
}

export function OnboardingProgressBar({
  current,
  total,
  backSlot,
  tickerSlot,
  className = '',
}: OnboardingProgressBarProps) {
  // Clamp om out-of-range-waardes (off-by-one bij dynamische step-orders)
  // niet door te laten lekken naar `aria-valuenow` / width%.
  const safeTotal = Math.max(total, 1)
  const safeCurrent = Math.min(Math.max(current, 0), safeTotal)
  const pct = Math.round((safeCurrent / safeTotal) * 100)

  return (
    <div
      className={`sticky top-0 z-30 -mx-4 sm:-mx-6 bg-[var(--bg)]/95 backdrop-blur-sm border-b border-[var(--border-ed)] ${className}`}
    >
      <div className="mx-auto flex max-w-[1080px] items-center gap-3 px-4 sm:px-6 py-2 sm:py-2.5">
        {backSlot && <div className="shrink-0">{backSlot}</div>}

        {/* De balk zelf: 1px hoog, vol-breed binnen z'n parent.
            We gebruiken een wrapper-div met de "rest"-achtergrond, en een
            inner-div met de gevulde breedte en module-active-500 als fill. */}
        <div
          role="progressbar"
          aria-valuenow={safeCurrent}
          aria-valuemin={0}
          aria-valuemax={safeTotal}
          aria-label={`Stap ${safeCurrent} van ${safeTotal}`}
          className="relative flex-1 h-px bg-[var(--rule-soft)] overflow-hidden"
        >
          <div
            className="absolute inset-y-0 left-0 motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-out"
            style={{
              width: `${pct}%`,
              backgroundColor: 'var(--module-active-500)',
            }}
          />
        </div>

        {/* Mono-stap-indicator rechts — 9px UPPERCASE met tabular-nums zodat
            "1/5" en "5/5" exact dezelfde breedte hebben en de balk niet
            jumpt bij stap-overgang. */}
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] tabular-nums text-[var(--ink-3)]">
          {safeCurrent}/{safeTotal}
        </span>
      </div>

      {/* Tweede regel: meelopende teller. Alleen gerenderd wanneer de caller
          er één levert — zonder teller blijft de kop exact zoals hij was. */}
      {tickerSlot && (
        <div className="mx-auto max-w-[1080px] px-4 sm:px-6">{tickerSlot}</div>
      )}
    </div>
  )
}

'use client'

import type { ReactNode } from 'react'

/**
 * Voortgangsrij van een onboarding-stap: terug-knop · balk · stand,
 * met optioneel de vrijheidsteller op een tweede regel.
 *
 * Volgt page-type 7 (Wizard) uit de ui-ux-skill: dunne progress-bar met
 * module-active fill op het gevulde deel, en een rule-soft achtergrond voor
 * het resterende deel. **Afwijking op de blueprint-volgorde, 17 sep 2026
 * (eigenaarswens):** de rij staat ONDER de vraag in plaats van erboven en is
 * niet langer full-bleed — hij leeft binnen de form-kolom, onder het deck.
 * De blueprint zet 'm op plek 1; hier is de vraag plek 1.
 *
 * Sticky-gedrag bepaalt de caller via `className` (de shell zet het aan). Doe
 * dat niet weg: de `backSlot` is de enige stap-terug die de onboarding heeft,
 * dus een niet-plakkende rij laat de gebruiker op een lange stap zonder
 * zichtbare uitgang achter.
 *
 * De fill en de stand-indicator dragen `--module-active-*`, dus de rij kleurt
 * mee met het accent dat de onboarding-pagina per stapgroep zet.
 *
 * Een optionele `backSlot` rendert een terug-affordance links van de balk.
 * De slot is altijd opt-in zodat de voortgangsrij ook standalone ingezet kan
 * worden.
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
    <div className={className}>
      <div className="flex items-center gap-3">
        {backSlot && <div className="-ml-1 shrink-0">{backSlot}</div>}

        {/* De balk zelf: 1px hoog, vol-breed binnen z'n parent.
            We gebruiken een wrapper-div met de "rest"-achtergrond, en een
            inner-div met de gevulde breedte en module-active-500 als fill. */}
        <div
          role="progressbar"
          aria-valuenow={safeCurrent}
          aria-valuemin={0}
          aria-valuemax={safeTotal}
          aria-label={`Stap ${safeCurrent} van ${safeTotal}`}
          className="relative flex-1 h-0.5 bg-[var(--rule-soft)] overflow-hidden"
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
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] tabular-nums text-[var(--module-active-700)]">
          {safeCurrent}/{safeTotal}
        </span>
      </div>

      {/* Tweede regel: meelopende teller. Alleen gerenderd wanneer de caller
          er één levert — zonder teller blijft de rij exact zoals hij was. */}
      {tickerSlot && <div className="mt-1">{tickerSlot}</div>}
    </div>
  )
}

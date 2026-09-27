'use client'

import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

/**
 * De keuze-tegel van de onboarding: icoon + label + sublabel, aan/uit.
 *
 * Stond tot ADR 0133 privé in `onboarding-eindstrategie.tsx` (stap "Jouw plan",
 * ADR 0129). De woning-keuze (stap iii-a) stelt exact dezelfde vraagvorm — een
 * A/B-keuze in gewone taal — dus is de tegel hierheen verhuisd in plaats van
 * gekopieerd. Eén tegel-component betekent: één focus-ring, één actief-staat,
 * één hover — en geen twee versies die uit elkaar groeien zodra er één wordt
 * bijgeschaafd.
 *
 * Gemodelleerd naar de `ModeTile` in `onboarding-pensioen.tsx` — zelfde
 * editorial A/B-tegel (border-2, module-accent-active, Playfair-label + italic
 * Source Serif sublabel).
 *
 * Toegankelijkheid: een echte `<button>` met `aria-pressed` (aan/uit-knop, geen
 * radio) — de omliggende `role="group"` met `aria-labelledby` naar de vraagkop
 * levert de context. Het icoon is `aria-hidden`: het herhaalt het label.
 *
 * Module-identiteit uitsluitend via `--module-active-*` (CLAUDE.md): de
 * onboarding-wrapper zet die op kern-shades, dus deze tegel is
 * module-onafhankelijk en bevat geen enkele Tailwind-standaardkleur.
 */
export interface StrategyTileProps {
  icon: ReactNode
  label: string
  sublabel: string
  active: boolean
  onClick: () => void
  /** Optionele keuzehulp-regel onder het sublabel (bv. "Past bij jou als …"). */
  hint?: string
  /**
   * Optionele i-knop rechtsboven (B-064). Die staat bewust NAAST de tegel —
   * de tegel is zelf een `<button>` en een knop in een knop is ongeldige HTML.
   * Met `onInfo` rendert de tegel in een `relative`-wrapper met de i-knop als
   * sibling; zonder blijft de markup exact zoals hij was.
   */
  onInfo?: () => void
  /** Toegankelijke naam van de i-knop. Verplicht zodra `onInfo` gezet is. */
  infoLabel?: string
}

export function StrategyTile({ icon, label, sublabel, active, onClick, hint, onInfo, infoLabel }: StrategyTileProps) {
  const tile = (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group flex min-h-[112px] flex-col items-start gap-2 border-2 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
        onInfo ? 'h-full w-full pr-12' : ''
      } ${
        active
          ? 'border-[var(--module-active-500)] bg-[var(--module-active-50)]/50'
          : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--module-active-400)] hover:bg-[var(--module-active-50)]/30'
      }`}
    >
      <span
        aria-hidden
        className="flex h-7 w-7 items-center justify-center text-[var(--module-active-700)]"
      >
        {icon}
      </span>
      <p
        className="font-serif text-[15px] leading-tight text-[var(--ink)] sm:text-base"
        style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
      >
        {label}
      </p>
      <p
        className="font-serif text-xs italic leading-snug text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        {sublabel}
      </p>
      {hint && <p className="text-xs leading-snug text-[var(--ink-2)]">{hint}</p>}
    </button>
  )

  if (!onInfo) return tile

  return (
    <div className="relative">
      {tile}
      <button
        type="button"
        onClick={onInfo}
        aria-label={infoLabel ?? `Meer over ${label}`}
        className="group/info absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        {/* Raakgebied 44×44 (M19); de zichtbare cirkel blijft 28×28 op dezelfde plek. */}
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] transition-colors group-hover/info:border-[var(--module-active-400)] group-hover/info:text-[var(--module-active-700)]">
          <Info className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </span>
      </button>
    </div>
  )
}

'use client'

import type { ReactNode } from 'react'

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
}

export function StrategyTile({ icon, label, sublabel, active, onClick }: StrategyTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group flex min-h-[112px] flex-col items-start gap-2 border-2 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] ${
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
    </button>
  )
}

'use client'

import Link from 'next/link'
import { ArrowRight, Plus } from 'lucide-react'

interface SectionHeaderProps {
  /** Sectie-titel — UPPERCASE krant-rubriek, sentence case in de prop. */
  kicker: string
  /** Optionele "Alle →" link met zijn href. */
  allHref?: string
  /** Tekst van de "Alle →" link. Default "Alle". */
  allLabel?: string
  /** Klik-handler voor de [+] knop. Bij weglating verschijnt geen knop. */
  onAddClick?: () => void
  /** Toegankelijke beschrijving voor de [+] knop. */
  addAriaLabel?: string
  /** Extra classes (bv. `mt-8` op landing-secties). */
  className?: string
}

/**
 * Sectie-kop voor "Bezittingen" en "Schulden" op de Kern-landing.
 *
 * Design (UX-skill):
 * - Kicker UPPERCASE 11px met `tracking-[0.08em]` en `text-[var(--ink-3)]`.
 * - Rechts: `[Alle →]` als `<Link>` (arrow-icoon transitionend op hover) en
 *   `[+]` als `<button>` met 44×44 touch target.
 * - Onder de header een dunne `border-b` voor de scheiding van het grid.
 */
export function SectionHeader({
  kicker,
  allHref,
  allLabel = 'Alle',
  onAddClick,
  addAriaLabel,
  className = '',
}: SectionHeaderProps) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 border-b border-[var(--border-ed)] pb-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {kicker}
      </h2>

      <div className="flex items-center gap-1">
        {allHref && (
          <Link
            href={allHref}
            className="group inline-flex h-11 items-center gap-1 px-2 text-xs font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            <span>{allLabel}</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}

        {onAddClick && (
          <button
            type="button"
            onClick={onAddClick}
            aria-label={addAriaLabel ?? 'Nieuw item toevoegen'}
            className="inline-flex h-11 w-11 items-center justify-center text-[var(--ink-2)] transition-colors hover:bg-kern-50 hover:text-kern-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

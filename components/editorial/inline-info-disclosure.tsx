'use client'

/**
 * InlineInfoDisclosure — de gedeelde "i"-uitklapknop + inline uitleg-paneel voor de
 * duidingsblokken op /toekomst (dekkingsradar, scenario-kaarten, vrijheidsas,
 * guardrail-kompas, levensinkomenstrook). Eén bron voor de vijf voorheen gedupliceerde
 * kopieën: een ronde "i"-knop rechtsboven (aria-expanded) die een inline paneel met de
 * `children` open/dicht klapt.
 *
 * De knop draagt — anders dan de oude kopieën — een expliciete focus-ring
 * (`focus-visible:outline`), zodat toetsenbord-focus zichtbaar is. Kleur en typografie
 * zijn verder byte-identiek aan de vervangen kopieën, zodat de vervanging visueel
 * niets verandert. De `children` zijn de ongewijzigde paneel-inhoud (kop + tekst).
 */

import { useState, type ReactNode } from 'react'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

export interface InlineInfoDisclosureProps {
  /** aria-label van de i-knop, bv. "Uitleg dekkingsradar". */
  label: string
  /** Paneel-inhoud (kop + tekst) — ongewijzigd t.o.v. het oude inline paneel. */
  children: ReactNode
  /** Paneel initieel open? Default dicht — spiegelt de oude `useState(false)`. */
  defaultOpen?: boolean
  /** Extra classes op de knop-rij. Default leeg → byte-identiek aan de kopieën. */
  className?: string
}

export function InlineInfoDisclosure({
  label,
  children,
  defaultOpen = false,
  className = '',
}: InlineInfoDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <>
      <div className={`mb-2 flex justify-end${className ? ` ${className}` : ''}`}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label={label}
          aria-expanded={open}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[12px] italic text-[var(--ink-3)] transition hover:border-[var(--color-horizon-500)] hover:text-[var(--color-horizon-600)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          style={{ fontFamily: PLAYFAIR }}
        >
          i
        </button>
      </div>

      {open && (
        <div className="mb-4 rounded-md border border-[var(--border-ed)] border-l-[3px] border-l-[var(--color-horizon-500)] bg-[var(--subtle)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--ink-3)]">
          {children}
        </div>
      )}
    </>
  )
}

/**
 * ToekomstSubpageShell — gedeelde header voor de vier /toekomst-subpagina's
 * (Doelen, Gebeurtenissen, Voorkeuren, Rekenhulp).
 *
 * Zorgt voor een consistente terugweg naar de tijdas-landing en een
 * editorial-header (kicker + serif-titel) in dezelfde stijl als de views zelf
 * (zie components/future/doelen-view.tsx). Optionele rechter-acties komen via
 * `children` (bv. een Plannen-modus knop of print-actie).
 *
 * Server component — geen 'use client', geen hooks.
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export function ToekomstSubpageShell({
  kicker,
  title,
  children,
}: {
  kicker: string
  title: string
  /** Optionele rechter-acties naast de titel. */
  children?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-4">
      <Link
        href="/toekomst"
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Terug naar tijdas
      </Link>

      <header className="mt-3 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            {kicker}
          </div>
          <h1 className="font-serif text-xl text-[var(--ink)] mt-1">{title}</h1>
        </div>
        {children}
      </header>
    </div>
  )
}

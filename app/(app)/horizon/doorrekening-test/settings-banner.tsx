'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/**
 * Subtle banner that points users to the centralized settings on /overzicht.
 * Shown at the top of every doorrekening-test sub-page (opbouw / afbouw /
 * gebeurtenissen) so that we only show strategy pickers in one place.
 */
export function SettingsBanner() {
  return (
    <div className="flex items-center justify-between gap-3 border border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-2.5 text-[11px] text-[var(--ink-3)]">
      <span className="uppercase tracking-[0.08em]">
        Wijzig instellingen op Overzicht. Deze pagina rekent met dezelfde scenario-keuzes.
      </span>
      <Link
        href="/horizon/doorrekening-test/overzicht"
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-horizon-700 hover:text-horizon-800"
      >
        Naar overzicht
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  )
}

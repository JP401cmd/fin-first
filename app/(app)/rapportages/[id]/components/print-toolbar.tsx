'use client'

/**
 * Fase 3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §2.1 (shell-agnostische content)
 * Eigen back-knop verwijderd; shell levert deze via TopBar (mobile) of pane-header.
 * Print-actie blijft — page-eigen content-actie, geen navigatie-chrome.
 */

import { Printer } from 'lucide-react'

interface PrintToolbarProps {
  /**
   * Staat er nog iets te verschijnen dat ín de PDF hoort? Zolang dit waar is,
   * is afdrukken uitgeschakeld. Concreet: de on-device geschreven
   * rapport-inleiding (privé-modus) komt na het rapport binnen; wie halverwege
   * afdrukt, krijgt anders een lege redactie-callout in het document.
   */
  pending?: boolean
}

export function PrintToolbar({ pending = false }: PrintToolbarProps) {
  return (
    <div data-print-hide className="mb-6 flex items-center justify-end">
      <button
        type="button"
        onClick={() => window.print()}
        disabled={pending}
        aria-busy={pending || undefined}
        title={pending ? 'Even wachten — de inleiding wordt nog geschreven' : undefined}
        className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink)] shadow-[var(--s0)] transition-all hover:shadow-[var(--s1)] hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-[var(--s0)] disabled:hover:translate-y-0"
      >
        <Printer className="h-4 w-4" />
        {pending ? 'Even wachten…' : 'Afdrukken als PDF'}
      </button>
    </div>
  )
}

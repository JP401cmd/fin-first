'use client'

/**
 * Fase 3 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §2.1 (shell-agnostische content)
 * Eigen back-knop verwijderd; shell levert deze via TopBar (mobile) of pane-header (desktop).
 * Print-actie blijft — page-eigen content-actie, geen navigatie-chrome.
 */

import { Printer } from 'lucide-react'

export function PrintToolbar() {
  return (
    <div data-print-hide className="mb-6 flex items-center justify-end">
      <button
        type="button"
        onClick={() => window.print()}
        className="flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink)] shadow-[var(--s0)] transition-all hover:shadow-[var(--s1)] hover:-translate-y-px"
      >
        <Printer className="h-4 w-4" />
        Afdrukken als PDF
      </button>
    </div>
  )
}

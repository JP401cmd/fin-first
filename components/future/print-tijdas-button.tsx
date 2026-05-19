'use client'

import { Printer } from 'lucide-react'

/**
 * PrintTijdasButton — plan F-6: "Tijdas deelbaar als read-only-link
 * voor financieel adviseur of partner." MVP via `window.print()` zodat
 * de OS-print-dialog een PDF kan genereren.
 *
 * In print-mode worden chrome-elementen (TopBar, Sidebar, Bewerken-
 * knoppen, tabs) verborgen via `@media print` CSS in app-layout.
 * Resultaat: clean A4-pagina met alleen de tijdas + scenario-context
 * geschikt voor delen of archiveren.
 *
 * Toekomstige iteratie: echte read-only-link via DB-token + public
 * route `/share/[token]`, plus gegenereerde PDF-export via server-
 * side rendering. Voor MVP is print → save-as-PDF voldoende
 * functioneel.
 */
export function PrintTijdasButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors"
      aria-label="Tijdas afdrukken of als PDF opslaan"
      title="Afdrukken (Cmd/Ctrl + P)"
    >
      <Printer className="w-3.5 h-3.5" aria-hidden="true" />
      Delen / Afdrukken
    </button>
  )
}

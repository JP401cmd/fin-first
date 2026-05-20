'use client'

import { Printer } from 'lucide-react'

/**
 * PrintOverzichtButton — laat user zijn /overzicht-pagina printen of
 * als PDF opslaan via window.print().
 *
 * Plan F-6 + Tier-3 #16: "Persoonlijk plan PDF-export". Bestaande
 * globale `@media print` CSS in app/globals.css verbergt automatisch
 * de TopBar, Sidebar, BottomNav, chat-FAB en alle [data-print-hide]
 * elementen. Resultaat: clean A4-portret met:
 *  - Begroeting + datum
 *  - 4 hefboom-tegels
 *  - Health Score + Netto-vermogen-grafiek
 *  - Voortgang doelen + Vrijheidsstrip
 *  - Briefing-cards
 *  - Compound-insight (indien zichtbaar)
 *
 * Compacte knop met Printer-icoon. `print:hidden` zodat hij niet op
 * de PDF-export terechtkomt (consistent met PrintTijdasButton).
 */
export function PrintOverzichtButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center justify-center w-8 h-8 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
      aria-label="Overzicht afdrukken of als PDF opslaan"
      title="Afdrukken (Cmd/Ctrl + P)"
    >
      <Printer className="w-3.5 h-3.5" aria-hidden="true" />
    </button>
  )
}

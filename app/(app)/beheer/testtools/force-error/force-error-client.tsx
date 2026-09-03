'use client'

// Client-shell voor /beheer/testtools/force-error.
//
// DATALOOS, THROW-ONLY. Deze pagina leest geen enkel gegeven, muteert niets en
// heeft geen side-effects — de ADR 0044-envelope is hier n.v.t. (geen API).
// Ze bestaat uitsluitend om `app/(app)/error.tsx` live te kunnen verifiëren
// (UAT WF-NAV-26) zonder tijdelijk broncode aan te passen, wat de UAT-regels
// tijdens een live-run verbieden. Laat dit GEEN precedent worden voor
// debugroutes mét data of side-effects.
//
// Beheerpagina-conventie (zie versie/jobs/integraties): neutrale ink/border/
// subtle-tokens, GEEN module-accentkleuren en GEEN vrijheidstijd-framing.
// Het rood hieronder is risico-semantiek (stoplicht), geen accent.

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'

/** Tekst van de bewust getriggerde fout — herkenbaar terug in de console-log. */
const FORCE_ERROR_MESSAGE =
  'UAT force-error: bewust getriggerde renderfout (WF-NAV-26)'

export function ForceErrorClient() {
  const [boom, setBoom] = useState(false)

  // De throw MOET tijdens de render gebeuren, niet in de onClick-handler:
  // React error boundaries vangen géén fouten uit event-handlers. De knop zet
  // dus alleen state; de eerstvolgende render gooit, en die fout borrelt op
  // naar de dichtstbijzijnde segment-boundary — hier `app/(app)/error.tsx`.
  if (boom) {
    throw new Error(FORCE_ERROR_MESSAGE)
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-[var(--ink)]">
        Foutpagina forceren
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--ink-3)]">
        Deze knop gooit bewust een renderfout op, zodat de app-brede
        foutpagina (&ldquo;Er ging iets mis&rdquo; met &ldquo;Probeer
        opnieuw&rdquo; en de module-terugkeerlink) live te controleren is.
        Er wordt niets gelezen, opgeslagen of verstuurd; met &ldquo;Probeer
        opnieuw&rdquo; keert deze pagina in haar normale staat terug.
      </p>

      <div className="mt-6 flex items-start gap-3 border border-red-300 bg-red-50 p-4">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-red-700"
          aria-hidden="true"
        />
        <p className="text-sm leading-relaxed text-red-800">
          Alleen bedoeld voor de UAT-controle van de foutafhandeling. De fout is
          niet echt: er raakt geen enkel gegeven kwijt.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setBoom(true)}
        className="mt-6 inline-flex min-h-11 items-center justify-center bg-[var(--ink)] px-5 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
      >
        Fout forceren
      </button>
    </div>
  )
}

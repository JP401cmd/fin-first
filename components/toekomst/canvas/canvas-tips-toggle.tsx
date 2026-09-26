// Verplaatst uit components/app/horizon/horizon-client.tsx r5814–5829 @ c1b4849eb (fase 1, ADR 0179).
'use client'

/**
 * Tips-toggle van de toekomstgrafiek (blok A, alleen de knop). Kicker, dode i en
 * dode h1 uit dezelfde kop vervallen (stroom A1); de knop verhuist naar de
 * canvas-kopregel (kaart V11). Presentational: exit-/persist-handlers komen van de host.
 */

import { Lightbulb } from 'lucide-react'

export interface CanvasTipsToggleProps {
  overlayVisible: boolean
  handleOverlayExit: () => void
  persistOverlayVisible: (val: boolean) => void
}

export function CanvasTipsToggle({ overlayVisible, handleOverlayExit, persistOverlayVisible }: CanvasTipsToggleProps) {
  return (
    <>
          {/* STEP 3b: overlay-toggle naast de "i" — wijst-tips aan/uit. */}
          <button
            type="button"
            onClick={() => { if (overlayVisible) handleOverlayExit(); else persistOverlayVisible(true) }}
            aria-pressed={overlayVisible}
            aria-label={overlayVisible ? 'Aanscherp-tips verbergen' : 'Aanscherp-tips tonen'}
            title={overlayVisible ? 'Tips verbergen' : 'Tips tonen'}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
              overlayVisible
                ? 'border-[var(--module-active-300)] bg-[var(--module-active-50)] text-[var(--module-active-700)]'
                : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            <Lightbulb className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Tips</span>
          </button>
    </>
  )
}

// Verplaatst uit components/app/horizon/horizon-client.tsx r5814–5829 @ c1b4849eb (fase 1, ADR 0179).
'use client'

/**
 * Schakelaar van de tips-ballonnen op de toekomstgrafiek (blok A, alleen de knop).
 *
 * Fase 2 (ADR 0179, spec §4.9): de ballonnen staan achter de canvas-i en niet
 * standaard aan. Deze knop is daarom geen losse pil boven de grafiek meer, maar de
 * onderste regel van de "Zo werkt je grafiek"-popover (`ChartTips footer`).
 * Presentational: exit-/persist-handlers komen van de host.
 */

import { Lightbulb } from 'lucide-react'

export interface CanvasTipsToggleProps {
  overlayVisible: boolean
  handleOverlayExit: () => void
  persistOverlayVisible: (val: boolean) => void
}

export function CanvasTipsToggle({ overlayVisible, handleOverlayExit, persistOverlayVisible }: CanvasTipsToggleProps) {
  return (
    <button
      type="button"
      onClick={() => { if (overlayVisible) handleOverlayExit(); else persistOverlayVisible(true) }}
      aria-pressed={overlayVisible}
      aria-label={overlayVisible ? 'Aanscherp-tips verbergen' : 'Aanscherp-tips tonen'}
      className="inline-flex min-h-[44px] w-full items-center gap-2 text-left font-sans text-[12px] font-medium text-[var(--module-active-700)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
    >
      <Lightbulb className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {overlayVisible ? 'Tips verbergen' : 'Tips tonen'}
    </button>
  )
}

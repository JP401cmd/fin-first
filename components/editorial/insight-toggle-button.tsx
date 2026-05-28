'use client'

import { Lightbulb } from 'lucide-react'
import { useHiddenInsights } from '@/lib/hooks/use-insight-visibility'

/**
 * InsightToggleButton — knop die naast PageInfoButton ('i') op de pagina-
 * header verschijnt wanneer de gebruiker één of meer Insight Cards heeft
 * geminimaliseerd. Klik = alle verborgen cards op deze pagina weer tonen.
 *
 * Styling matched PageInfoButton 1-op-1 (h-7 w-7 rounded-full, zelfde
 * border + module-active hover), zodat de twee knoppen visueel een
 * koppel vormen rechtsboven op de hoofdpagina.
 */

interface InsightToggleButtonProps {
  /** Insight-card-id's die op deze pagina kunnen verschijnen. */
  ids: string[]
  /** Extra CSS-classes op de wrapper (bijv. voor absolute positie). */
  className?: string
}

export function InsightToggleButton({ ids, className = '' }: InsightToggleButtonProps) {
  const { mounted, hiddenCount, restoreAll } = useHiddenInsights(ids)

  // SSR-safe: vóór mount of zonder verborgen cards = niets renderen.
  // Zorgt dat header niet "springt" als de hydration de hidden-set inleest.
  if (!mounted || hiddenCount === 0) return null

  const label =
    hiddenCount === 1 ? 'Toon geminimaliseerd inzicht' : `Toon ${hiddenCount} geminimaliseerde inzichten`

  return (
    <div className={className}>
      <button
        type="button"
        onClick={restoreAll}
        aria-label={label}
        title={label}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] transition-all hover:border-[var(--module-active-500)] hover:text-[var(--module-active-700)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

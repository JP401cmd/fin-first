'use client'

import { BesprekMetWillButton } from '@/components/app/chat/bespreek-met-will-button'

/**
 * PhaseDiscussButton — top-level "Bespreek je [fase] met Will"-knop bij de
 * fase-header van elke fase-modal (opbouw / overgang / onttrekking).
 *
 * Dunne wrapper rond {@link BesprekMetWillButton} die de hele-fase-samenvatting
 * (`summary`) als chatcontext meegeeft, zodat de gebruiker met Will over de fase
 * als geheel kan sparren. Eén conventie voor alle drie de fases.
 */
export function PhaseDiscussButton({
  onderwerp,
  summary,
  className = '',
}: {
  /** Bijv. "Mijn opbouwfase" — gaat als onderwerp naar Will. */
  onderwerp: string
  /** Hele-fase-samenvatting met de echte cijfers (start→eind vermogen, jaren, etc.). */
  summary: string
  className?: string
}) {
  return (
    <BesprekMetWillButton
      onderwerp={onderwerp}
      detail={summary}
      vraag="Wat valt je op aan deze fase, en wat kan ik hier verbeteren?"
      className={className}
    />
  )
}

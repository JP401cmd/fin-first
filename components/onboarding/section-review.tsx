'use client'

import type { ReactNode } from 'react'
import { OnboardingShell } from './onboarding-shell'

/**
 * Herbruikbaar afsluitend overzichtsscherm voor de begeleide
 * bezittingen- en schulden-enumeratie (`onboarding-bezittingen.tsx` +
 * `onboarding-schulden.tsx`).
 *
 * Toont — ná de laatste "nee" — een rustig bevestigend overzicht van de
 * reeds-verzamelde posten (de lopende lijst die de sectie al rendert) plus
 * twee gelijkwaardige acties: doorgaan ("Klopt het? → ga door") of terug naar
 * de picker om nog iets toe te voegen ("Voeg nog iets toe").
 *
 * Bewust *presentational*: geen eigen flow-state. De sectie geeft de lijst als
 * `children` mee en bepaalt wat doorgaan/toevoegen doen. Geen nieuwe data —
 * puur presentatie van al-verzamelde `quickAssets`/`quickDebts`.
 */
export interface SectionReviewProps {
  kicker: string
  romanNum?: string
  /** Headline — bv. "Dit zijn je bezittingen". */
  title: ReactNode
  /** Editorial deck onder de headline. */
  deck: string
  /** Het lopende overzicht (de reeds-getoonde runningList). */
  children: ReactNode
  factsPanel?: ReactNode
  /** Doorgaan naar de volgende groep. */
  onConfirm: () => void
  /** Terug naar de picker om nog iets toe te voegen. */
  onAddMore: () => void
  /** Label voor de toevoeg-actie (default "Voeg nog iets toe"). */
  addMoreLabel?: string
  currentStep: number
  totalSteps: number
  onBack?: () => void
}

export function SectionReview({
  kicker,
  romanNum,
  title,
  deck,
  children,
  factsPanel,
  onConfirm,
  onAddMore,
  addMoreLabel = 'Voeg nog iets toe',
  currentStep,
  totalSteps,
  onBack,
}: SectionReviewProps) {
  return (
    <OnboardingShell
      kicker={kicker}
      romanNum={romanNum}
      title={title}
      deck={deck}
      factsPanel={factsPanel ?? null}
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={onBack}
      footer={
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onAddMore}
            className="min-h-11 border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-3 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            {addMoreLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            Klopt het? → ga door
          </button>
        </div>
      }
    >
      {children ? <div className="space-y-6">{children}</div> : <div className="min-h-2" />}
    </OnboardingShell>
  )
}

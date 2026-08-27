'use client'

import type { ReactNode } from 'react'
import { OnboardingShell } from './onboarding-shell'

/**
 * Herbruikbaar één-vraag-tegelijk ja/nee-scherm (Boldin-stijl begeleide flow).
 *
 * Dit is bewust een *presentational* component: het bezit geen eigen flow-state.
 * De begeleide enumeratie-loops voor bezittingen (`onboarding-bezittingen.tsx`)
 * en schulden (`onboarding-schulden.tsx`) drijven 'm aan en bepalen wat "ja",
 * "nee" en een eventuele sectie-uitgang doen.
 *
 * Layout volgt het Editorial Finance-patroon via `OnboardingShell`: één rustige
 * vraag als headline, twee *gelijkwaardige* keuzeknoppen in de footer, en een
 * optionele drempelloze sectie-uitgang eronder ("Ik heb (verder) geen
 * schulden" / "Sla bezittingen over"). Minder overload dan een leeg formulier.
 *
 * De voortgang loopt PER GROEP (`currentStep`/`totalSteps` = groep-index), niet
 * per micro-vraag — de ja/nee-loops maken het aantal vragen variabel, dus een
 * "3/27" zou misleidend zijn. Het groepslabel staat in de `kicker`.
 */
export interface OnboardingVraagProps {
  /** Groepslabel (UPPERCASE kicker) — bv. "Bezittingen", "Schulden". */
  kicker: string
  romanNum?: string
  /** De vraag als headline (mag JSX met inline italic-em bevatten). */
  title: ReactNode
  /** Editorial deck onder de headline. */
  deck: string
  /** Facts-paneel content (optioneel — bv. een lopend overzicht of CBS-feit). */
  factsPanel?: ReactNode
  /** Optionele inhoud boven de knoppen (bv. een lopende lijst van toegevoegde posten). */
  children?: ReactNode
  /** Ja-knop label (default "Ja"). */
  yesLabel?: string
  /** Nee-knop label (default "Nee"). */
  noLabel?: string
  onYes: () => void
  onNo: () => void
  /** Drempelloze sectie-uitgang onder de knoppen (bv. "Ik heb (verder) geen schulden"). */
  exitLabel?: string
  onExit?: () => void
  /** Groep-index (1-indexed) voor de voortgangsbalk. */
  currentStep: number
  /** Totaal aantal groepen. */
  totalSteps: number
  onBack?: () => void
}

export function OnboardingVraag({
  kicker,
  romanNum,
  title,
  deck,
  factsPanel,
  children,
  yesLabel = 'Ja',
  noLabel = 'Nee',
  onYes,
  onNo,
  exitLabel,
  onExit,
  currentStep,
  totalSteps,
  onBack,
}: OnboardingVraagProps) {
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
        <div className="flex w-full flex-col gap-2.5">
          {/* Twee gelijkwaardige keuzeknoppen — gelijke breedte zodat geen
              van beide zich als "het juiste antwoord" presenteert. */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onYes}
              className="min-h-11 bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              {yesLabel}
            </button>
            <button
              type="button"
              onClick={onNo}
              className="min-h-11 border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-3 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              {noLabel}
            </button>
          </div>

          {/* Drempelloze sectie-uitgang — altijd bereikbaar, nooit een
              bevestig-stap (onboarding-input is transient). */}
          {exitLabel && onExit && (
            <button
              type="button"
              onClick={onExit}
              className="min-h-11 text-xs italic text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink-2)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              {exitLabel}
            </button>
          )}
        </div>
      }
    >
      {children ? <div className="space-y-6">{children}</div> : <div className="min-h-2" />}
    </OnboardingShell>
  )
}

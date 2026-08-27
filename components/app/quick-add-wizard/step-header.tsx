'use client'

import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

/**
 * Gedeelde header voor elke wizard-stap binnen de BottomSheet.
 *
 * Levert de editorial-krant-visuele-hiërarchie:
 *   · label-editorial kicker met "Stap N van M"
 *   · Playfair italic titel
 *   · optionele back-pijl (44×44 touch-target) als `onBack` is meegegeven
 *   · optioneel type-icoon rechts — gebruikt bij stap 3 om de context
 *     (gekozen type + kleur) vast te houden zonder typografische schreeuw.
 *
 * De sheet zelf (`BottomSheet`) heeft al `role="dialog"` + `aria-labelledby`;
 * we herhalen die ARIA-structuur hier niet.
 */

export interface StepHeaderProps {
  step: number
  total: number
  title: string
  /** Extra label naast het stap-nummer (bv. "Bezitting toevoegen"). */
  kicker?: string
  /**
   * Toon de "Stap N van M"-telling. Default `true`.
   *
   * Zet op `false` wanneer de wizard binnen een flow draait die zélf al een
   * voortgangsteller toont. In de onboarding blijft de sticky
   * `OnboardingProgressBar` ("3/8") door de half-transparante
   * BottomSheet-backdrop heen zichtbaar; de modal-telling ("Stap 1 van 2")
   * loopt op een heel andere schaal en leverde zo twee tot drie
   * voortgangsverhalen tegelijk op (bevinding M12). Zonder telling blijft de
   * kicker over als niet-nummerende naam van de stap ("Gegevens", "Extra").
   */
  showStepCount?: boolean
  onBack?: () => void
  icon?: ReactNode
  iconColor?: string
}

export function StepHeader({
  step,
  total,
  title,
  kicker,
  showStepCount = true,
  onBack,
  icon,
  iconColor,
}: StepHeaderProps) {
  const progress = showStepCount ? `Stap ${step} van ${total}` : null
  // Zonder telling én zonder kicker blijft er niets over voor de meta-regel —
  // dan vervalt de regel helemaal in plaats van als lege ruimte te blijven staan.
  const hasMeta = progress !== null || Boolean(kicker)

  return (
    <div className="mb-5 flex items-start gap-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Terug"
          className="touch-target -ml-2 shrink-0 text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" strokeWidth={1.75} />
        </button>
      )}

      <div className="min-w-0 flex-1">
        {hasMeta && (
          <p className="label-editorial text-[var(--ink-3)]">
            {progress}
            {kicker ? (
              progress ? (
                <span className="text-[var(--ink-4)]"> · {kicker}</span>
              ) : (
                kicker
              )
            ) : null}
          </p>
        )}
        <h3
          tabIndex={-1}
          className={`font-serif text-xl italic text-[var(--ink)] leading-tight${
            hasMeta ? ' mt-1' : ''
          }`}
        >
          {title}
        </h3>
      </div>

      {icon && (
        <div
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--subtle)]"
          style={{ color: iconColor ?? 'var(--ink-2)' }}
        >
          {icon}
        </div>
      )}
    </div>
  )
}

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
  onBack?: () => void
  icon?: ReactNode
  iconColor?: string
}

export function StepHeader({
  step,
  total,
  title,
  kicker,
  onBack,
  icon,
  iconColor,
}: StepHeaderProps) {
  const progress = `Stap ${step} van ${total}`

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
        <p className="label-editorial text-[var(--ink-3)]">
          {progress}
          {kicker ? <span className="text-[var(--ink-4)]"> · {kicker}</span> : null}
        </p>
        <h3
          tabIndex={-1}
          className="mt-1 font-serif text-xl italic text-[var(--ink)] leading-tight"
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

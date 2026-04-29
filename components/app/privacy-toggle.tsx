'use client'

/**
 * Eye-icon toggle that masks/unmasks monetary amounts across TriFinity.
 *
 * Lives in the app-header next to the profile dropdown so it is always
 * reachable on every authenticated screen — the design-bible positions
 * privacy as a persistent affordance, not a buried setting.
 *
 * Accessibility:
 *  - `aria-pressed` exposes the boolean state to screenreaders.
 *  - `aria-label` is Dutch and flips wording based on current state so it
 *    describes the action the user will perform, not the current state.
 *  - 44×44 touch target (h-11 w-11) meets the bible's "Navigatie" minimum.
 *  - Sharp corners — no `rounded-*` aside from none, matching krant-esthetiek.
 */

import { Eye, EyeOff } from 'lucide-react'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

export function PrivacyToggle() {
  const { masked, toggle } = useMaskedAmounts()

  // Icon flips: closed eye = "currently hidden", open eye = "currently visible".
  const Icon = masked ? EyeOff : Eye

  // Action-oriented label: tells the user what clicking will DO, not what IS.
  const actionLabel = masked ? 'Bedragen tonen' : 'Bedragen maskeren'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={masked}
      aria-label={actionLabel}
      title={actionLabel}
      className="flex h-11 w-11 items-center justify-center text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ink)]"
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  )
}

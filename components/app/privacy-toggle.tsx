'use client'

/**
 * Eye-icon toggle that masks/unmasks monetary amounts across TriFinity.
 *
 * Lives in the TopBar (mobile) and Sidebar (desktop) so it is always
 * reachable on every authenticated screen — the design-bible positions
 * privacy as a persistent affordance, not a buried setting.
 *
 * Accessibility:
 *  - `aria-pressed` exposes the boolean state to screenreaders.
 *  - `aria-label` is Dutch and flips wording based on current state so it
 *    describes the action the user will perform, not the current state.
 *  - Raakgebied ≥44px. De responsive-richting stond eerder omgekeerd
 *    (28×28 op mobiel, 44×44 op desktop) — precies de verkeerde kant op, want
 *    tap-precisie is een mobiel probleem, niet een muis-probleem (M19). Nu:
 *    op mobiel 36×36 zichtbaar (uniform met de rest van de TopBar-cluster) met
 *    een verticaal opgerekt raakgebied van 44px; op desktop onveranderd 44×44.
 *  - Sharp corners — no `rounded-*` aside from none, matching krant-esthetiek.
 */

import { Eye, EyeOff } from 'lucide-react'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { TAP_TARGET_EXTEND_BLOCK } from '@/components/editorial/tap-target'

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
      className={`flex h-9 w-9 items-center justify-center transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-[var(--ink)] md:h-11 md:w-11 ${TAP_TARGET_EXTEND_BLOCK} ${
        masked
          ? 'text-[var(--module-active-500)] hover:text-[var(--module-active-600)]'
          : 'text-[var(--ink-3)] hover:text-[var(--ink)]'
      }`}
    >
      <Icon className="h-4 w-4 md:h-5 md:w-5" aria-hidden="true" />
    </button>
  )
}

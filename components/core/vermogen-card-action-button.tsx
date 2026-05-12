'use client'

/**
 * Compacte icon-only actie-knop voor de actie-rij op `<VermogenAssetCard>`
 * en `<VermogenDebtCard>`. Spiegelt het patroon van de bewerk-knop op
 * levensgebeurtenissen (zie `whatif-events.tsx` r283-289): vierkant
 * `h-8 w-8` icon-target met `title` als tooltip — geen zichtbare tekst.
 *
 * Houdt de actie-rij visueel licht (geen tekst-ruis op de kaart) en past
 * binnen de krant-esthetiek: scherpe hoeken, monochroom idle, subtiele
 * hover-state met module-tinten via de `--module-active-*` tokens.
 */

import type { LucideIcon } from 'lucide-react'

interface VermogenCardActionButtonProps {
  icon: LucideIcon
  /** Tooltip-tekst + accessible name. Geen zichtbare label. */
  label: string
  onClick: () => void
  /** Toont een draaiend icon en disabled de knop — voor async-acties zoals sync. */
  spinning?: boolean
  disabled?: boolean
  /** Optionele aria-label override; default = `label`. */
  ariaLabel?: string
}

export function VermogenCardActionButton({
  icon: Icon,
  label,
  onClick,
  spinning = false,
  disabled = false,
  ariaLabel,
}: VermogenCardActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || spinning}
      aria-label={ariaLabel ?? label}
      title={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center text-[var(--ink-4)] transition-colors hover:bg-[var(--module-active-50)] hover:text-[var(--module-active-700)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Icon
        className={`h-3.5 w-3.5 ${spinning ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
    </button>
  )
}

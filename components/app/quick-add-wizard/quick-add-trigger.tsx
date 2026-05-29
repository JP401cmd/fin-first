'use client'

import { Wallet, CreditCard } from 'lucide-react'

/**
 * CTA-strip voor Mission Control (`/core`). Twee knoppen naast elkaar op
 * desktop, gestapeld op mobiel. Elke knop is een compacte variant van de
 * stap-1 kaart in `StepChoice` — zelfde kleur-taal, zelfde hiërarchie,
 * maar met een kleinere min-height en vier typografische elementen
 * (kicker + label + subtitel + icoon-chip).
 *
 * Als de gebruiker klikt wordt `onOpenAsset` / `onOpenDebt` aangeroepen —
 * de consumer opent `QuickAddWizard` met de juiste `initialIntent` zodat
 * stap 1 wordt overgeslagen.
 */

export interface QuickAddTriggerProps {
  onOpenAsset: () => void
  onOpenDebt: () => void
  className?: string
}

export function QuickAddTrigger({
  onOpenAsset,
  onOpenDebt,
  className,
}: QuickAddTriggerProps) {
  return (
    <div
      className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${className ?? ''}`}
    >
      <button
        type="button"
        onClick={onOpenAsset}
        className="group flex min-h-[72px] items-start gap-3 border border-[var(--border-ed)] bg-[var(--color-kern-50)] p-4 text-left transition-all hover:-translate-y-px hover:border-[var(--color-kern-500)] hover:shadow-[var(--s1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-kern-500)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--color-kern-100)] text-[var(--color-kern-700)]">
          <Wallet className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="label-editorial text-[var(--color-kern-700)]">
            Overzicht
          </span>
          <span className="text-sm font-medium text-[var(--ink)] leading-tight">
            Bezitting toevoegen
          </span>
          <span className="text-[11px] text-[var(--ink-3)] leading-snug">
            Spaargeld, woning, beleggingen…
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={onOpenDebt}
        className="group flex min-h-[72px] items-start gap-3 border border-[var(--border-ed)] bg-[var(--color-debt-50)] p-4 text-left transition-all hover:-translate-y-px hover:border-[var(--color-debt-500)] hover:shadow-[var(--s1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-debt-500)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--color-debt-100)] text-[var(--color-debt-700)]">
          <CreditCard className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="label-editorial text-[var(--color-debt-700)]">
            Overzicht
          </span>
          <span className="text-sm font-medium text-[var(--ink)] leading-tight">
            Schuld toevoegen
          </span>
          <span className="text-[11px] text-[var(--ink-3)] leading-snug">
            Hypotheek, lening, creditcard…
          </span>
        </span>
      </button>
    </div>
  )
}

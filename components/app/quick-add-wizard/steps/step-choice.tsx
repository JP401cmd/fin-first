'use client'

import { Wallet, CreditCard } from 'lucide-react'
import type { QuickAddIntent } from '@/lib/quick-add/types'

/**
 * Stap 1 — intentie-keuze. Twee grote kaarten (kern-tinten voor bezitting,
 * debt-tinten voor schuld). Gebruikers die via de CTA-strip op `/core`
 * binnenkomen zien deze stap nooit (de wizard wordt met `initialIntent`
 * geopend en skipt direct naar stap 2).
 *
 * Elke kaart heeft drie regels: kicker ("Overzicht"), label, subtitel met
 * concrete voorbeelden. Min-h 120px om de touch-target-eis ruim te halen
 * én visueel gewicht te geven aan de keuze.
 */

export interface StepChoiceProps {
  onSelect: (intent: QuickAddIntent) => void
}

export function StepChoice({ onSelect }: StepChoiceProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onSelect('asset')}
        className="group flex min-h-[120px] flex-col items-start gap-2 border border-[var(--border-ed)] bg-[var(--color-kern-50)] p-5 text-left transition-all hover:-translate-y-px hover:border-[var(--color-kern-500)] hover:shadow-[var(--s1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-kern-500)]"
      >
        <span className="flex h-10 w-10 items-center justify-center bg-[var(--color-kern-100)] text-[var(--color-kern-700)]">
          <Wallet className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="label-editorial text-[var(--color-kern-700)]">Bezitting</span>
        <span className="font-serif text-lg italic text-[var(--ink)]">Wat je hebt</span>
        <span className="text-xs text-[var(--ink-3)] leading-relaxed">
          Spaargeld, woning, beleggingen…
        </span>
      </button>

      <button
        type="button"
        onClick={() => onSelect('debt')}
        className="group flex min-h-[120px] flex-col items-start gap-2 border border-[var(--border-ed)] bg-[var(--color-debt-50)] p-5 text-left transition-all hover:-translate-y-px hover:border-[var(--color-debt-500)] hover:shadow-[var(--s1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-debt-500)]"
      >
        <span className="flex h-10 w-10 items-center justify-center bg-[var(--color-debt-100)] text-[var(--color-debt-700)]">
          <CreditCard className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="label-editorial text-[var(--color-debt-700)]">Schuld</span>
        <span className="font-serif text-lg italic text-[var(--ink)]">Wat je moet aflossen</span>
        <span className="text-xs text-[var(--ink-3)] leading-relaxed">
          Hypotheek, lening, creditcard…
        </span>
      </button>
    </div>
  )
}

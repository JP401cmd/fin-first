'use client'

import { Wallet, CreditCard } from 'lucide-react'
import type { QuickAddIntent } from '@/lib/quick-add/types'

/**
 * Gedeelde first-use empty state voor `/core/assets` en `/core/debts`.
 *
 * Volgt het editorial empty-state patroon uit `ui-ux.md` §"Empty states":
 *   · grote outline-icoon (h-16), `--ink-3` voor rustige aanwezigheid
 *   · Playfair italic kop
 *   · Source Serif subtekst die uitlegt wat de feature oplevert
 *   · 1 primaire CTA, kleur-gecoördineerd met het intent (kern/debt)
 *
 * Voldoet aan de bijbel-regel "Geen CTA = doodlopend" omdat `onAdd` een
 * verplichte prop is; de parent-pagina haakt die aan de gedeelde
 * `QuickAddWizard` zodat de user hier onboarding + implementatie in
 * één klik kan doen.
 */

export interface EmptyStateProps {
  intent: QuickAddIntent
  onAdd: () => void
}

export function EmptyState({ intent, onAdd }: EmptyStateProps) {
  const isAsset = intent === 'asset'
  const Icon = isAsset ? Wallet : CreditCard
  const heading = isAsset ? 'Nog geen bezittingen' : 'Nog geen schulden'
  const description = isAsset
    ? 'Houd een spaargeld-rekening, woning of beleggingsportefeuille bij, dan berekent TriFinity automatisch je vermogen.'
    : 'Houd je leningen bij, dan berekent TriFinity automatisch hoelang aflossen duurt.'
  const ctaLabel = isAsset ? 'Voeg je eerste bezitting toe' : 'Voeg je eerste schuld toe'

  const buttonClasses = isAsset
    ? 'bg-[var(--color-kern-600)] hover:bg-[var(--color-kern-700)] active:bg-[var(--color-kern-800)] focus-visible:outline-[var(--color-kern-500)]'
    : 'bg-[var(--color-debt-600)] hover:bg-[var(--color-debt-700)] active:bg-[var(--color-debt-800)] focus-visible:outline-[var(--color-debt-500)]'

  return (
    <div
      data-variant="first-use"
      className="flex flex-col items-center justify-center gap-5 px-6 py-16 text-center"
    >
      <Icon
        className="h-16 w-16 text-[var(--ink-3)]"
        strokeWidth={1.25}
        aria-hidden="true"
      />

      <div className="space-y-2">
        <h3
          tabIndex={-1}
          className="font-serif text-2xl italic text-[var(--ink)] leading-tight"
        >
          {heading}
        </h3>
        <p className="mx-auto max-w-[42ch] text-sm text-[var(--ink-2)] leading-relaxed">
          {description}
        </p>
      </div>

      <button
        type="button"
        onClick={onAdd}
        className={`inline-flex min-h-[44px] items-center justify-center px-5 py-2.5 text-sm font-medium text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${buttonClasses}`}
      >
        {ctaLabel}
      </button>
    </div>
  )
}

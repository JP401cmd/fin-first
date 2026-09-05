'use client'

import { ArrowLeftRight } from 'lucide-react'

type PendingTransferBannerProps = {
  /** Het werkelijke aantal herkende kandidaten in deze maand. */
  count: number
  /**
   * Hoeveel er in één controle-ronde meegaan. Ligt dit lager dan `count`, dan
   * zegt de banner dat er meer zijn — anders zou de gebruiker na de ronde
   * denken dat de rest al goed staat. Weglaten = alles gaat mee.
   */
  reviewCount?: number
  onReview: () => void
}

export function PendingTransferBanner({ count, reviewCount, onReview }: PendingTransferBannerProps) {
  if (count === 0) return null
  const capped = typeof reviewCount === 'number' && reviewCount < count

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--hor-m)] bg-[var(--hor-l)] px-4 py-3 flex items-start gap-3">
      <ArrowLeftRight className="h-4 w-4 text-[var(--hor-t)] mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--ink-2)]">
          {count} mogelijke eigen {count === 1 ? 'overboeking' : 'overboekingen'} herkend
        </p>
        <p className="text-xs italic text-[var(--ink-3)] font-[var(--font-source-serif)]">
          Deze transacties tellen nu mee als uitgave. Bevestig ze als overboeking om ze uit je
          uitgaven en spaarquote te halen.
          {capped ? ` Je loopt de eerste ${reviewCount} nu na; de rest blijft hier staan.` : ''}
        </p>
      </div>
      <button
        onClick={onReview}
        className="shrink-0 text-xs font-medium text-[var(--hor-t)] hover:underline"
      >
        Controleren →
      </button>
    </div>
  )
}

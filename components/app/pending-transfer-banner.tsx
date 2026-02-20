'use client'

import { ArrowLeftRight } from 'lucide-react'

type PendingTransferBannerProps = {
  count: number
  onReview: () => void
}

export function PendingTransferBanner({ count, onReview }: PendingTransferBannerProps) {
  if (count === 0) return null

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--hor-m)] bg-[var(--hor-l)] px-4 py-3 flex items-start gap-3">
      <ArrowLeftRight className="h-4 w-4 text-[var(--hor-t)] mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--ink-2)]">
          {count} mogelijke eigen {count === 1 ? 'overboeking' : 'overboekingen'} herkend
        </p>
        <p className="text-xs italic text-[var(--ink-3)] font-[var(--font-source-serif)]">
          Deze transacties tellen nu mee in budgetten. Bevestig ze als overboeking om ze uit te sluiten.
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

'use client'

import { Heart, Copy } from 'lucide-react'

/**
 * OwnerStatsBadge — kleine sticker die de auteur op zijn eigen kaart
 * ziet zodra de rekenhulp publiek staat. Toont aantal likes, hoe vaak
 * hij is gedupliceerd, en sinds wanneer de publicatie loopt.
 *
 * Bewust subtiel: één pill-rijtje, geen prominent CTA. Niet renderen
 * als de calculator privé is — de auteur ziet alleen feedback nadat hij
 * actief publiceert.
 */
export function OwnerStatsBadge({
  likeCount,
  duplicateCount,
  isPublic,
  publishedAt,
}: {
  likeCount: number
  duplicateCount: number
  isPublic: boolean
  publishedAt: string | null
}) {
  if (!isPublic) return null

  const sinceLabel = publishedAt ? formatSince(publishedAt) : null

  return (
    <span
      className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] px-2.5 py-0.5 text-[11px] text-[var(--ink-3)]"
      aria-label={`Publieke statistieken: ${likeCount} likes, ${duplicateCount} keer gekopieerd${sinceLabel ? `, gepubliceerd ${sinceLabel}` : ''}`}
    >
      <span className="inline-flex items-center gap-1">
        <Heart className="w-3 h-3" aria-hidden="true" />
        <span className="tabular-nums">{likeCount}</span>
      </span>
      <span aria-hidden="true" className="text-[var(--ink-3)]/50">·</span>
      <span className="inline-flex items-center gap-1">
        <Copy className="w-3 h-3" aria-hidden="true" />
        <span className="tabular-nums">{duplicateCount}</span>
        <span className="hidden sm:inline">keer gekopieerd</span>
      </span>
      {sinceLabel && (
        <>
          <span aria-hidden="true" className="text-[var(--ink-3)]/50">·</span>
          <span>sinds {sinceLabel}</span>
        </>
      )}
    </span>
  )
}

/**
 * Format the published_at timestamp als korte NL-datum. We tonen
 * "vandaag" / "gisteren" voor de laatste twee dagen omdat anders een
 * "sinds 29 mei" een uur na publicatie raar aanvoelt.
 */
function formatSince(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return 'vandaag'
  if (diffDays === 1) return 'gisteren'

  // Voor de rest: "3 mei" of "3 mei 2025" als het al een ander jaar is.
  const formatter = new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
  return formatter.format(date)
}

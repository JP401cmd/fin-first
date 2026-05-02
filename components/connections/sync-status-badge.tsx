'use client'

import type { FreshnessStatus } from '@/lib/connections-data'

interface SyncStatusBadgeProps {
  status: FreshnessStatus
  lastSyncedAt?: Date | string | null
}

const STATUS_LABEL: Record<FreshnessStatus, string> = {
  fresh: 'Actueel',
  stale: 'Verouderd',
  error: 'Foutmelding',
  never: 'Nog niet gesynchroniseerd',
}

const DOT_CLASS: Record<FreshnessStatus, string> = {
  fresh: 'bg-emerald-500',
  stale: 'bg-amber-500',
  error: 'bg-red-500',
  never: 'bg-[var(--ink-4)]',
}

const TEXT_CLASS: Record<FreshnessStatus, string> = {
  fresh: 'text-emerald-700',
  stale: 'text-amber-700',
  error: 'text-red-700',
  never: 'text-[var(--ink-3)]',
}

// Newspaper-style date: "HH:mm" today, "d MMM" this year, "d MMM yyyy" older.
function formatLastSync(date: Date): string {
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) {
    return new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(date)
  }
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
}

export function SyncStatusBadge({ status, lastSyncedAt }: SyncStatusBadgeProps) {
  const date = lastSyncedAt ? (lastSyncedAt instanceof Date ? lastSyncedAt : new Date(lastSyncedAt)) : null
  const dateValid = date && !Number.isNaN(date.getTime())

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${DOT_CLASS[status]}`}
      />
      <span className={`font-medium ${TEXT_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
      {dateValid && status !== 'never' && (
        <span className="font-mono tabular-nums text-[var(--ink-4)]">
          · Bijgewerkt {formatLastSync(date)}
        </span>
      )}
    </span>
  )
}

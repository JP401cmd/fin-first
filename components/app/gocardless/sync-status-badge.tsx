'use client'

import { Clock, CheckCircle2, AlertTriangle } from 'lucide-react'

type SyncStatusBadgeProps = {
  lastSyncedAt: string | null
  dailyRequests: number
  expiresAt?: string | null
}

export function SyncStatusBadge({ lastSyncedAt, dailyRequests, expiresAt }: SyncStatusBadgeProps) {
  const now = new Date()

  // Check expiry warning
  if (expiresAt) {
    const expiry = new Date(expiresAt)
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntilExpiry < 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
          <AlertTriangle className="h-3 w-3" />
          Verlopen
        </span>
      )
    }
    if (daysUntilExpiry <= 14) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">
          <AlertTriangle className="h-3 w-3" />
          Verloopt over {daysUntilExpiry}d
        </span>
      )
    }
  }

  if (!lastSyncedAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-[var(--ink-3)]">
        <Clock className="h-3 w-3" />
        Nog niet gesynchroniseerd
      </span>
    )
  }

  const syncDate = new Date(lastSyncedAt)
  const hoursAgo = Math.floor((now.getTime() - syncDate.getTime()) / (1000 * 60 * 60))

  const timeLabel = hoursAgo < 1
    ? 'Zojuist'
    : hoursAgo < 24
      ? `${hoursAgo}u geleden`
      : `${Math.floor(hoursAgo / 24)}d geleden`

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3 w-3" />
        {timeLabel}
      </span>
      <span className="text-xs text-[var(--ink-3)]">{dailyRequests}/10</span>
    </div>
  )
}

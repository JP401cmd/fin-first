'use client'

import { RefreshCw } from 'lucide-react'
import { formatTimestamp } from '@/lib/format'
import type { BriefingCadence } from '@/lib/briefing/user-preferences'
import { getStaleThresholdMs } from '@/lib/briefing/user-preferences'

interface BriefingStaleBannerProps {
  composedAt: string
  dataChanged: boolean
  onRefresh: () => void
  refreshing: boolean
  cadence: BriefingCadence
}

function isStale(composedAt: string, cadence: BriefingCadence): boolean {
  const ms = Date.now() - new Date(composedAt).getTime()
  return ms >= getStaleThresholdMs(cadence)
}

export function BriefingStaleBanner({ composedAt, dataChanged, onRefresh, refreshing, cadence }: BriefingStaleBannerProps) {
  if (!isStale(composedAt, cadence)) return null

  const label = formatTimestamp(composedAt)

  return (
    <div className="animate-fade-up mb-4 flex items-center gap-3 rounded-[var(--r)] border-l-[3px] border-[var(--wil)] bg-[var(--wil-l)] px-4 py-3">
      <RefreshCw className="h-4 w-4 shrink-0 text-[var(--wil-t)]" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[var(--ink-2)]">
          Je briefing is van {label}.
          {dataChanged && <span className="ml-1 text-[var(--ink-3)]">Je financiele gegevens zijn gewijzigd.</span>}
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-[var(--r)] text-xs font-medium text-[var(--wil-t)] transition-colors hover:text-[var(--wil)] disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        <span>Vernieuw</span>
      </button>
    </div>
  )
}

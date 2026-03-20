'use client'

import { RefreshCw } from 'lucide-react'
import { formatTimestamp } from '@/lib/format'

interface Props {
  composedAt: string
  source: 'ai'
  onRefresh?: () => void
  refreshing?: boolean
}

export function BriefingFooter({ composedAt, onRefresh, refreshing }: Props) {
  const label = formatTimestamp(composedAt)

  return (
    <footer className="mt-6 sm:mt-8 border-t border-[var(--border-ed)] pt-3">
      <div className="flex items-center justify-center gap-3">
        <p className="text-[10px] text-[var(--ink-4)] tracking-wide">
          Samengesteld door Will &middot; {label}
        </p>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 text-[10px] text-[var(--ink-4)] hover:text-[var(--ink-3)] transition-colors disabled:opacity-50"
            title="Briefing vernieuwen"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Vernieuw</span>
          </button>
        )}
      </div>
    </footer>
  )
}

'use client'

import { RefreshCw } from 'lucide-react'
import { formatTimestamp } from '@/lib/format'
import type { BriefingCadence } from '@/lib/briefing/user-preferences'

interface Props {
  composedAt: string
  source: 'ai'
  onRefresh?: () => void
  refreshing?: boolean
  cadence: BriefingCadence
  onCadenceChange: (cadence: BriefingCadence) => void
}

export function BriefingFooter({ composedAt, onRefresh, refreshing, cadence, onCadenceChange }: Props) {
  const label = formatTimestamp(composedAt)

  return (
    <footer className="mt-6 sm:mt-8 border-t border-[var(--border-ed)] pt-3">
      <div className="flex items-center justify-center gap-3 flex-wrap">
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

        {/* Cadence toggle */}
        <div
          className="flex rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] p-0.5"
          role="radiogroup"
          aria-label="Briefing frequentie"
        >
          <button
            type="button"
            role="radio"
            aria-checked={cadence === 'daily'}
            onClick={() => onCadenceChange('daily')}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-all ${
              cadence === 'daily'
                ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                : 'text-[var(--ink-4)] hover:text-[var(--ink-3)]'
            }`}
          >
            Dagelijks
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={cadence === 'weekly'}
            onClick={() => onCadenceChange('weekly')}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-all ${
              cadence === 'weekly'
                ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                : 'text-[var(--ink-4)] hover:text-[var(--ink-3)]'
            }`}
          >
            Wekelijks
          </button>
        </div>
      </div>
    </footer>
  )
}

'use client'

import { Calendar, Clock } from 'lucide-react'
import { BriefingCard } from '../briefing-card'
import type { LifeEventCardSpec } from '@/lib/briefing/types'

interface Props {
  spec: LifeEventCardSpec
}

function countdownLabel(days: number): string {
  if (days <= 0) return 'Vandaag'
  if (days === 1) return 'Morgen'
  if (days < 30) return `Over ${days} dagen`
  const months = Math.round(days / 30)
  if (months === 1) return 'Over 1 maand'
  if (months < 12) return `Over ${months} maanden`
  const years = Math.round(days / 365)
  if (years === 1) return 'Over 1 jaar'
  return `Over ${years} jaar`
}

export function LifeEventCard({ spec }: Props) {
  const isImminent = spec.daysUntil <= 30

  return (
    <BriefingCard module={spec.module}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isImminent
            ? 'bg-amber-100 dark:bg-amber-900/40'
            : 'bg-purple-100 dark:bg-purple-900/40'
        }`}>
          <Calendar className={`h-4 w-4 ${
            isImminent ? 'text-amber-500' : 'text-purple-500'
          }`} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm text-[var(--ink)] line-clamp-1">{spec.name}</p>

          {/* Countdown */}
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="h-3 w-3 text-[var(--ink-4)]" />
            <span className={`text-xs font-mono tabular-nums ${
              isImminent ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-[var(--ink-3)]'
            }`}>
              {countdownLabel(spec.daysUntil)}
            </span>
          </div>

          {/* Financial impact */}
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-lg font-bold font-mono tabular-nums text-[var(--ink)]">
              {spec.amount}
            </span>
            <span className="text-[10px] text-[var(--ink-4)] uppercase tracking-wide">
              {spec.amountType}
            </span>
          </div>

          {/* Freedom time */}
          {spec.freedomStr && (
            <p className="text-[11px] font-serif italic text-[var(--ink-4)] mt-0.5">
              = {spec.freedomStr} vrijheid
            </p>
          )}
        </div>
      </div>
    </BriefingCard>
  )
}

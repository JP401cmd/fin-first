'use client'

import { BriefingCard } from '../briefing-card'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { BudgetBarCardSpec } from '@/lib/briefing/types'

interface Props {
  spec: BudgetBarCardSpec
}

const STATUS_COLOR: Record<string, string> = {
  healthy: 'bg-emerald-500',
  warning: 'bg-amber-500',
  over: 'bg-rose-500',
}

export function BudgetBarCard({ spec }: Props) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1000 })
  const pct = Math.min(Math.max(spec.percentage, 0), 120)
  const barWidth = Math.min(pct, 100)

  return (
    <BriefingCard module="kern" href={spec.href}>
      <div ref={ref}>
        <p className="text-sm font-semibold text-[var(--ink)] mb-1 line-clamp-1">{spec.name}</p>

        <div className="flex items-baseline justify-between text-xs text-[var(--ink-3)] mb-1.5">
          <span className="font-mono tabular-nums">{spec.spent}</span>
          <span className="font-mono tabular-nums">{spec.limit}</span>
        </div>

        {/* Budget bar */}
        <div className="h-2 w-full rounded-full bg-[var(--subtle)] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-[800ms] ${STATUS_COLOR[spec.status] ?? STATUS_COLOR.healthy}`}
            style={{
              width: hasEntered ? `${barWidth}%` : '0%',
              transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)',
            }}
          />
        </div>

        {spec.remainingDays != null && (
          <p className="text-xs text-[var(--ink-3)] mt-1.5">
            {spec.remainingDays} {spec.remainingDays === 1 ? 'dag' : 'dagen'} resterend
          </p>
        )}
      </div>
    </BriefingCard>
  )
}

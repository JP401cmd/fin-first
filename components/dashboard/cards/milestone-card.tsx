'use client'

import { BriefingCard } from '../briefing-card'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { MilestoneCardSpec } from '@/lib/briefing/types'

interface Props {
  spec: MilestoneCardSpec
}

export function MilestoneCard({ spec }: Props) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1000 })
  const pct = Math.min(Math.max(spec.percentage, 0), 100)

  return (
    <BriefingCard module={spec.module ?? 'horizon'}>
      <div ref={ref}>
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-sm font-semibold text-[var(--ink)]">{spec.label}</p>
          {spec.freedomStr && (
            <p className="text-xs text-[var(--ink-3)]">{spec.freedomStr}</p>
          )}
        </div>

        <div className="flex items-baseline justify-between text-xs text-[var(--ink-3)] mb-1.5">
          <span className="font-mono tabular-nums">{spec.current}</span>
          <span className="font-mono tabular-nums">{spec.target}</span>
        </div>

        {/* Progress bar */}
        <div className="h-3 w-full rounded-full bg-[var(--subtle)] overflow-hidden">
          <div
            className="h-full rounded-full bg-horizon-500 transition-all duration-[800ms]"
            style={{
              width: hasEntered ? `${pct}%` : '0%',
              transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)',
            }}
          />
        </div>

        <p className="mt-1.5 text-right text-xs font-mono tabular-nums text-[var(--ink-3)]">
          {Math.round(pct)}%
        </p>
      </div>
    </BriefingCard>
  )
}

'use client'

import { BriefingCard } from '../briefing-card'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { GoalProgressCardSpec } from '@/lib/briefing/types'

interface Props {
  spec: GoalProgressCardSpec
}

export function GoalProgressCard({ spec }: Props) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1000 })
  const pct = Math.min(Math.max(spec.percentage, 0), 100)

  return (
    <BriefingCard module={spec.module} href={spec.href}>
      <div ref={ref}>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-sm font-semibold text-[var(--ink)] line-clamp-1">{spec.name}</p>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            spec.onTrack
              ? 'bg-positive/10 text-positive'
              : 'bg-negative/10 text-negative'
          }`}>
            {spec.onTrack ? 'On track' : 'Achter'}
          </span>
        </div>

        <div className="flex items-baseline gap-1 text-xs text-[var(--ink-3)] mb-1.5">
          <span className="font-mono tabular-nums">{spec.current}</span>
          <span>/</span>
          <span className="font-mono tabular-nums">{spec.target}</span>
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-[var(--subtle)] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-[800ms] ${
              spec.onTrack ? 'bg-positive' : 'bg-negative'
            }`}
            style={{
              width: hasEntered ? `${pct}%` : '0%',
              transitionTimingFunction: 'cubic-bezier(.22,1,.36,1)',
            }}
          />
        </div>

        {spec.targetDate && (
          <p className="text-xs text-[var(--ink-3)] mt-1.5">{spec.targetDate}</p>
        )}
      </div>
    </BriefingCard>
  )
}

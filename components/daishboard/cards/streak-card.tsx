'use client'

import { Flame } from 'lucide-react'
import { BriefingCard } from '../briefing-card'
import type { StreakCardSpec } from '@/lib/briefing/types'

interface Props {
  spec: StreakCardSpec
}

export function StreakCard({ spec }: Props) {
  return (
    <BriefingCard module={spec.module}>
      <div className="flex items-center gap-2 mb-1">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <Flame className="h-4 w-4 text-amber-500" />
        </div>
        <p className="label-editorial text-[var(--ink-3)]">{spec.label}</p>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold font-mono tabular-nums text-[var(--ink)]">
          {spec.count}
        </span>
        <span className="text-sm text-[var(--ink-3)]">
          {spec.unit}
        </span>
      </div>
      <p className="text-xs text-[var(--ink-4)] mt-1 line-clamp-2">{spec.description}</p>
    </BriefingCard>
  )
}

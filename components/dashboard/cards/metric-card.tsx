'use client'

import { BriefingCard } from '../briefing-card'
import { ArrowUp, ArrowDown } from 'lucide-react'
import type { MetricCardSpec } from '@/lib/briefing/types'

interface Props {
  spec: MetricCardSpec
}

export function MetricCard({ spec }: Props) {
  return (
    <BriefingCard module={spec.module} href={spec.href}>
      <p className="label-editorial text-[var(--ink-3)] mb-1">{spec.label}</p>
      <p className="text-lg font-bold font-mono tabular-nums text-[var(--ink)]">
        {spec.value}
      </p>
      {spec.freedomStr && (
        <p className="text-xs text-[var(--ink-3)] mt-0.5">{spec.freedomStr}</p>
      )}
      {spec.delta && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          {spec.delta.startsWith('+') ? (
            <ArrowUp className="h-4 w-4 text-positive" />
          ) : spec.delta.startsWith('-') ? (
            <ArrowDown className="h-4 w-4 text-negative" />
          ) : null}
          <span className="font-mono tabular-nums text-[var(--ink-2)]">{spec.delta}</span>
          {spec.deltaLabel && (
            <span className="text-[var(--ink-4)]">{spec.deltaLabel}</span>
          )}
        </div>
      )}
    </BriefingCard>
  )
}

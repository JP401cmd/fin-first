'use client'

import { BriefingCard } from '../briefing-card'
import type { CountdownCardSpec } from '@/lib/briefing/types'

interface Props {
  spec: CountdownCardSpec
  delay: number
}

export function CountdownCard({ spec, delay }: Props) {
  return (
    <BriefingCard module={spec.module} href={spec.href} delay={delay}>
      <p className="label-editorial text-[var(--ink-3)] mb-1">{spec.label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold font-mono tabular-nums text-[var(--ink)]">
          {spec.days}
        </span>
        <span className="text-sm text-[var(--ink-3)]">
          {spec.days === 1 ? 'dag' : 'dagen'}
        </span>
      </div>
      {spec.sublabel && (
        <p className="text-xs text-[var(--ink-4)] mt-1">{spec.sublabel}</p>
      )}
    </BriefingCard>
  )
}

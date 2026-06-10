'use client'

import { BriefingCard } from '../briefing-card'
import type { ComparisonCardSpec } from '@/lib/briefing/types'

interface Props {
  spec: ComparisonCardSpec
}

export function ComparisonCard({ spec }: Props) {
  const isPositive = spec.delta.startsWith('+')
  const isNegative = spec.delta.startsWith('-')

  return (
    <BriefingCard module="kern" href={spec.href}>
      <p className="label-editorial text-[var(--ink-3)] mb-2">{spec.label}</p>

      <div className="flex items-center gap-4">
        {/* Left side */}
        <div className="flex-1 text-center">
          <p className="text-xs text-[var(--ink-4)] mb-0.5">{spec.leftLabel}</p>
          <p className="text-sm font-bold font-mono tabular-nums text-[var(--ink)]">{spec.leftValue}</p>
        </div>

        {/* Arrow + delta */}
        <div className="flex flex-col items-center">
          <span className="text-[var(--ink-4)]">&rarr;</span>
          <span className={`text-xs font-mono tabular-nums font-semibold ${
            isPositive ? 'text-positive' : isNegative ? 'text-negative' : 'text-[var(--ink-3)]'
          }`}>
            {spec.delta}
          </span>
          {spec.freedomDays != null && (
            <span className="text-xs text-[var(--ink-3)]">
              {Math.abs(spec.freedomDays)}d vrijheid
            </span>
          )}
        </div>

        {/* Right side */}
        <div className="flex-1 text-center">
          <p className="text-xs text-[var(--ink-4)] mb-0.5">{spec.rightLabel}</p>
          <p className="text-sm font-bold font-mono tabular-nums text-[var(--ink)]">{spec.rightValue}</p>
        </div>
      </div>
    </BriefingCard>
  )
}

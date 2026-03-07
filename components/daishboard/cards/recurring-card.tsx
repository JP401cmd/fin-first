'use client'

import { BriefingCard } from '../briefing-card'
import { Repeat } from 'lucide-react'
import type { RecurringCardSpec } from '@/lib/briefing/types'

interface Props {
  spec: RecurringCardSpec
}

export function RecurringCard({ spec }: Props) {
  return (
    <BriefingCard module="kern" href={spec.href}>
      <div className="flex items-center gap-2 mb-3">
        <Repeat className="h-4 w-4 text-[var(--kern-accent)]" />
        <p className="text-sm font-semibold text-[var(--ink)]">{spec.title}</p>
      </div>

      <ul className="space-y-2 mb-3">
        {spec.items.map((item, i) => (
          <li key={i} className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-[var(--ink-2)] truncate">{item.name}</span>
            <div className="flex items-baseline gap-1.5 shrink-0">
              <span className="text-xs font-mono tabular-nums font-semibold text-[var(--ink)]">
                {item.amount}
              </span>
              {item.freedomStr && (
                <span className="text-[10px] text-[var(--ink-4)]">
                  {item.freedomStr}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Total row */}
      <div className="border-t border-[var(--border-ed)] pt-2 flex items-baseline justify-between">
        <span className="text-xs font-medium text-[var(--ink-3)]">Totaal /mnd</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-mono tabular-nums font-bold text-[var(--ink)]">
            {spec.totalAmount}
          </span>
          {spec.totalFreedomStr && (
            <span className="text-[10px] text-[var(--ink-4)]">
              {spec.totalFreedomStr}
            </span>
          )}
        </div>
      </div>
    </BriefingCard>
  )
}

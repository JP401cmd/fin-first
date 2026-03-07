'use client'

import { ArrowRight } from 'lucide-react'
import { BriefingCard } from '../briefing-card'
import type { NextStepCardSpec } from '@/lib/briefing/types'

const MODULE_BADGE: Record<string, string> = {
  kern: 'bg-kern-100 text-kern-700',
  wil: 'bg-wil-100 text-wil-700',
  horizon: 'bg-horizon-100 text-horizon-700',
  cross: 'bg-zinc-100 text-zinc-700',
}

interface Props {
  spec: NextStepCardSpec
}

export function NextStepBriefingCard({ spec }: Props) {
  const badgeClass = MODULE_BADGE[spec.module] ?? MODULE_BADGE.cross

  return (
    <BriefingCard module={spec.module} href={spec.href}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeClass}`}>
          Volgende Stap
        </span>
      </div>
      <p className="text-sm font-semibold text-[var(--ink)] line-clamp-2">{spec.title}</p>
      <p className="text-xs text-[var(--ink-3)] mt-1 line-clamp-2">{spec.description}</p>
      <div className="flex items-center gap-1 text-xs font-medium text-[var(--ink-4)] mt-2">
        <ArrowRight className="h-3.5 w-3.5" />
        <span>Ga aan de slag</span>
      </div>
    </BriefingCard>
  )
}

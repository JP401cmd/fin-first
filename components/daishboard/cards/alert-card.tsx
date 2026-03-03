'use client'

import { BriefingCard } from '../briefing-card'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import type { AlertCardSpec } from '@/lib/briefing/types'

interface Props {
  spec: AlertCardSpec
  delay: number
}

export function AlertCard({ spec, delay }: Props) {
  const isUrgent = spec.severity === 'urgent'

  return (
    <BriefingCard href={spec.href} delay={delay} className={isUrgent ? 'border-rose-200' : 'border-amber-200'}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isUrgent ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${isUrgent ? 'text-rose-700' : 'text-amber-700'}`}>
            {spec.title}
          </p>
          <p className="text-xs text-[var(--ink-3)] mt-1">{spec.message}</p>
          {spec.actionLabel && (
            <div className="mt-2 flex items-center gap-1 text-xs font-medium text-[var(--ink-2)]">
              {spec.actionLabel} <ArrowRight className="h-3 w-3" />
            </div>
          )}
        </div>
      </div>
    </BriefingCard>
  )
}

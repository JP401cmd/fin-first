'use client'

import { useCallback } from 'react'
import { Compass, ArrowRight } from 'lucide-react'
import { BriefingCard } from '../briefing-card'
import type { DiscoverCardSpec } from '@/lib/briefing/types'

const MODULE_BADGE: Record<string, string> = {
  kern: 'bg-kern-100 text-kern-700',
  wil: 'bg-wil-100 text-wil-700',
  horizon: 'bg-horizon-100 text-horizon-700',
  cross: 'bg-zinc-100 text-zinc-700',
}

const MODULE_BORDER: Record<string, string> = {
  kern: 'border-kern-300/50',
  wil: 'border-wil-300/50',
  horizon: 'border-horizon-300/50',
  cross: 'border-zinc-300/50',
}

interface Props {
  spec: DiscoverCardSpec
}

export function DiscoverCard({ spec }: Props) {
  const badgeClass = MODULE_BADGE[spec.module] ?? MODULE_BADGE.cross
  const borderClass = MODULE_BORDER[spec.module] ?? MODULE_BORDER.cross

  const trackVisit = useCallback(() => {
    // Fire-and-forget: record the feature visit for tracking
    fetch('/api/feature-visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_slug: spec.featureId }),
    }).catch(() => {
      // Silent fail — visit tracking is non-critical
    })
  }, [spec.featureId])

  return (
    <BriefingCard
      module={spec.module}
      href={spec.href}
      onEngage={trackVisit}
      className={`border-dashed ${borderClass}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--subtle)]">
          <Compass className="h-4 w-4 text-[var(--ink-3)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${badgeClass}`}>
              Ontdek
            </span>
          </div>
          <p className="text-xs font-medium text-[var(--ink-3)] italic">{spec.teaser}</p>
          <p className="text-sm font-semibold text-[var(--ink)] mt-1">{spec.label}</p>
          <p className="text-xs text-[var(--ink-3)] mt-1 line-clamp-2">{spec.description}</p>
          <div className="flex items-center gap-1 text-xs font-medium text-[var(--ink-4)] mt-2 min-h-[44px] sm:min-h-0">
            <ArrowRight className="h-3.5 w-3.5" />
            <span>Ontdek meer</span>
          </div>
        </div>
      </div>
    </BriefingCard>
  )
}

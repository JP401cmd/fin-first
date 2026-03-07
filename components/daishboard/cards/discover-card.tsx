'use client'

import { useCallback } from 'react'
import { ArrowRight } from 'lucide-react'
import { BriefingCard } from '../briefing-card'
import { markFeatureVisitedLocal } from '@/components/app/discover-carousel'
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
    const payload = JSON.stringify({ feature_slug: spec.featureId })

    // Update localStorage immediately so next briefing excludes this feature
    markFeatureVisitedLocal(spec.featureId)

    // Use sendBeacon for reliable delivery during navigation (won't be cancelled)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(
        '/api/feature-visits',
        new Blob([payload], { type: 'application/json' }),
      )
    } else {
      // Fallback: fire-and-forget fetch
      fetch('/api/feature-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(() => {
        // Silent fail — visit tracking is non-critical
      })
    }
  }, [spec.featureId])

  return (
    <BriefingCard
      module={spec.module}
      href={spec.href}
      onEngage={trackVisit}
      className={`border-dashed ${borderClass}`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${badgeClass}`}>
              Ontdek
            </span>
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)] italic">{spec.teaser}</p>
          <p className="text-sm font-semibold text-[var(--ink)] mt-1">{spec.label}</p>
          <p className="text-xs sm:text-sm text-[var(--ink-3)] mt-1 line-clamp-2">{spec.description}</p>
        </div>
        <div className="flex shrink-0 items-center justify-center h-10 w-10 rounded-full bg-[var(--subtle)]">
          <ArrowRight className="h-4 w-4 text-[var(--ink-3)]" />
        </div>
      </div>
    </BriefingCard>
  )
}

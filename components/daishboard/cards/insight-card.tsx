'use client'

import Link from 'next/link'
import { BriefingCard } from '../briefing-card'
import type { InsightCardSpec } from '@/lib/briefing/types'
import { ArrowRight } from 'lucide-react'

interface Props {
  spec: InsightCardSpec
}

const EMPHASIS_STYLES: Record<string, { border: string; bg: string; label: string }> = {
  greeting: { border: '', bg: '', label: '' },
  observation: { border: 'border-l-2 border-l-wil-300', bg: 'bg-wil-50/30', label: 'Observatie' },
  celebration: { border: 'border-l-2 border-l-emerald-400', bg: 'bg-emerald-50/30', label: '' },
  tip: { border: 'border-l-2 border-l-amber-400', bg: 'bg-amber-50/30', label: 'Tip' },
}

export function InsightCard({ spec }: Props) {
  const emphasis = spec.emphasis ?? 'observation'
  const styles = EMPHASIS_STYLES[emphasis] ?? EMPHASIS_STYLES.observation

  // When there's a ctaLabel but no href, link to /core/assets as default
  const ctaHref = spec.href ?? (spec.ctaLabel ? '/core/assets' : undefined)

  return (
    <BriefingCard module={spec.module ?? 'wil'} href={!spec.ctaLabel ? spec.href : undefined}>
      <div className={`${styles.border} ${styles.bg} ${styles.border ? 'pl-3 py-1' : ''}`}>
        {styles.label && (
          <p className="label-editorial text-[var(--ink-4)] mb-1">{styles.label}</p>
        )}
        <p className="font-serif italic text-base leading-relaxed text-[var(--ink-2)]">
          {spec.text}
        </p>
        {spec.ctaLabel && ctaHref && (
          <Link
            href={ctaHref}
            className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors group/cta"
          >
            <span className="underline decoration-[var(--border-md)] underline-offset-2 group-hover/cta:decoration-[var(--ink-2)]">
              {spec.ctaLabel}
            </span>
            <ArrowRight className="h-3 w-3 transition-transform group-hover/cta:translate-x-0.5" />
          </Link>
        )}
      </div>
    </BriefingCard>
  )
}

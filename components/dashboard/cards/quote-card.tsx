'use client'

import { BriefingCard } from '../briefing-card'
import type { QuoteCardSpec } from '@/lib/briefing/types'

interface Props {
  spec: QuoteCardSpec
}

export function QuoteCard({ spec }: Props) {
  return (
    <BriefingCard module={spec.module ?? 'wil'}>
      <div className="bg-wil-50/20 rounded-lg px-4 py-3 border-l-2 border-l-wil-400/60">
        <p className="font-serif italic text-base leading-relaxed text-[var(--ink)] tracking-tight">
          &ldquo;{spec.text}&rdquo;
        </p>
        {spec.attribution && (
          <p className="mt-2 text-xs text-[var(--ink-3)] font-sans tracking-wide uppercase">
            &mdash; {spec.attribution}
          </p>
        )}
      </div>
    </BriefingCard>
  )
}

'use client'

import { BriefingCard } from '../briefing-card'
import type { InsightCardSpec } from '@/lib/briefing/types'

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

  return (
    <BriefingCard module={spec.module ?? 'wil'}>
      <div className={`${styles.border} ${styles.bg} ${styles.border ? 'pl-3 py-1' : ''}`}>
        {styles.label && (
          <p className="label-editorial text-[var(--ink-4)] mb-1">{styles.label}</p>
        )}
        <p className="font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          {spec.text}
        </p>
      </div>
    </BriefingCard>
  )
}

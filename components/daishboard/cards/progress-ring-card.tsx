'use client'

import { BriefingCard } from '../briefing-card'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { ProgressRingCardSpec } from '@/lib/briefing/types'

interface Props {
  spec: ProgressRingCardSpec
  delay: number
}

const SIZE = 80
const STROKE = 8
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ProgressRingCard({ spec, delay }: Props) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1000 })
  const offset = CIRCUMFERENCE - (Math.min(spec.percentage, 100) / 100) * CIRCUMFERENCE

  const MODULE_STROKE: Record<string, string> = {
    kern: 'var(--color-kern-500)',
    wil: 'var(--color-wil-500)',
    horizon: 'var(--color-horizon-500)',
    cross: 'var(--ink-3)',
  }

  return (
    <BriefingCard module={spec.module} href={spec.href} delay={delay}>
      <div ref={ref} className="flex items-center gap-3">
        <svg width={SIZE} height={SIZE} className="shrink-0 -rotate-90">
          {/* Track */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
            fill="none"
            stroke="var(--border-ed)"
            strokeWidth={STROKE}
          />
          {/* Progress */}
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
            fill="none"
            stroke={MODULE_STROKE[spec.module] ?? MODULE_STROKE.cross}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={hasEntered ? offset : CIRCUMFERENCE}
            style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(.22,1,.36,1)' }}
          />
        </svg>
        <div className="min-w-0">
          <p className="label-editorial text-[var(--ink-3)]">{spec.label}</p>
          <p className="text-base font-bold font-mono tabular-nums text-[var(--ink)]">{spec.value}</p>
          {spec.total && (
            <p className="text-xs text-[var(--ink-4)]">{spec.total}</p>
          )}
        </div>
      </div>
    </BriefingCard>
  )
}

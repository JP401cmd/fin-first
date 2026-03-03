'use client'

import { useMemo } from 'react'
import { BriefingCard } from '../briefing-card'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import type { SparklineCardSpec } from '@/lib/briefing/types'
import type { DashboardData } from '@/components/widgets/widget-renderer'

interface Props {
  spec: SparklineCardSpec
  data: DashboardData
  delay: number
}

const W = 180
const H = 48
const PAD = { top: 4, bottom: 4, left: 0, right: 0 }

export function SparklineCard({ spec, data, delay }: Props) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 1000 })

  const history = data[spec.dataKey] ?? []

  const pathData = useMemo(() => {
    if (history.length < 2) return null
    const values = history.map(h => h.value)
    const min = Math.min(...values, 0)
    const max = Math.max(...values)
    const range = max - min || 1
    const chartW = W - PAD.left - PAD.right
    const chartH = H - PAD.top - PAD.bottom

    const points = values.map((v, i) => ({
      x: PAD.left + (i / (values.length - 1)) * chartW,
      y: PAD.top + chartH - ((v - min) / range) * chartH,
    }))

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    const fill = `${line} L ${points[points.length - 1].x.toFixed(1)} ${(PAD.top + chartH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(PAD.top + chartH).toFixed(1)} Z`

    return { line, fill }
  }, [history])

  const MODULE_COLOR: Record<string, string> = {
    kern: 'var(--color-kern-500)',
    wil: 'var(--color-wil-500)',
    horizon: 'var(--color-horizon-500)',
    cross: 'var(--ink-3)',
  }
  const color = MODULE_COLOR[spec.module] ?? MODULE_COLOR.cross

  return (
    <BriefingCard module={spec.module} delay={delay}>
      <p className="label-editorial text-[var(--ink-3)] mb-1">{spec.label}</p>
      <p className="text-base font-bold font-mono tabular-nums text-[var(--ink)] mb-2">{spec.value}</p>
      <div ref={ref}>
        {pathData ? (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
            <path
              d={pathData.fill}
              fill={color}
              opacity={0.1}
            />
            <path
              d={pathData.line}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={hasEntered ? 0 : 1}
              style={{ transition: 'stroke-dashoffset 800ms cubic-bezier(.22,1,.36,1)' }}
            />
          </svg>
        ) : (
          <div className="h-12 flex items-center justify-center text-xs text-[var(--ink-4)]">
            Nog geen historie
          </div>
        )}
      </div>
    </BriefingCard>
  )
}

'use client'

import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function SimVermogenspadWidget({ size, data, href }: Props) {
  const { simRows, fireAgeFractional } = data
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })

  if (!simRows || simRows.length === 0) {
    return (
      <WidgetShell module="horizon" size={size} kicker="Vermogenspad" href={href}>
        <p className="text-xs text-[var(--ink-3)]">Bezoek /horizon om simulatie te activeren</p>
      </WidgetShell>
    )
  }

  const W = 240
  const H = size === 'full' ? 100 : 72
  const pad = 4
  const maxVal = Math.max(...simRows.map(r => r.endPortfolio), 1)
  const minAge = simRows[0].age
  const maxAge = simRows[simRows.length - 1].age
  const ageSpan = maxAge - minAge || 1

  const toX = (age: number) => pad + ((age - minAge) / ageSpan) * (W - pad * 2)
  const toY = (val: number) => H - pad - (Math.max(val, 0) / maxVal) * (H - pad * 2)

  const accumulationRows = simRows.filter(r => r.phase === 'accumulation')
  const retirementRows = simRows.filter(r => r.phase === 'retirement')

  const buildPath = (rows: typeof simRows) => {
    if (rows.length === 0) return ''
    return rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${toX(r.age).toFixed(1)},${toY(r.endPortfolio).toFixed(1)}`).join(' ')
  }

  const fireX = fireAgeFractional != null ? toX(fireAgeFractional) : null

  return (
    <WidgetShell module="horizon" size={size} kicker="Vermogenspad" href={href}>
      <div ref={ref} className="mt-2">
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          className="overflow-visible"
          aria-label="Gesimuleerd vermogenspad"
        >
          {/* Grid lijnen */}
          {[0.25, 0.5, 0.75].map(frac => (
            <line
              key={frac}
              x1={pad}
              y1={toY(maxVal * frac)}
              x2={W - pad}
              y2={toY(maxVal * frac)}
              stroke="var(--border-ed)"
              strokeWidth="0.5"
            />
          ))}

          {/* Opbouw pad (horizon-kleur) */}
          {accumulationRows.length > 1 && (
            <path
              d={buildPath(accumulationRows)}
              fill="none"
              stroke="var(--horizon-500, #c4a06b)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              style={{
                strokeDasharray: '1',
                strokeDashoffset: hasEntered ? '0' : '1',
                transition: hasEntered
                  ? 'stroke-dashoffset 500ms cubic-bezier(.22,1,.36,1)'
                  : 'none',
              }}
            />
          )}

          {/* Pensioen pad (gedempte kleur) */}
          {retirementRows.length > 1 && (
            <path
              d={buildPath(retirementRows)}
              fill="none"
              stroke="var(--ink-4)"
              strokeWidth="1.2"
              strokeDasharray="3 2"
              strokeLinecap="round"
              style={{
                opacity: hasEntered ? 1 : 0,
                transition: hasEntered ? 'opacity 300ms ease 500ms' : 'none',
              }}
            />
          )}

          {/* FIRE-leeftijd verticale markering */}
          {fireX != null && (
            <>
              <line
                x1={fireX}
                y1={pad}
                x2={fireX}
                y2={H - pad}
                stroke="var(--horizon-600, #a07840)"
                strokeWidth="1"
                strokeDasharray="2 2"
                style={{ opacity: hasEntered ? 0.8 : 0, transition: 'opacity 300ms ease 600ms' }}
              />
              <circle
                cx={fireX}
                cy={toY(accumulationRows.at(-1)?.endPortfolio ?? 0)}
                r="3"
                fill="var(--horizon-600, #a07840)"
                style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 300ms ease 650ms' }}
              />
            </>
          )}
        </svg>

        <div className="mt-1 flex items-center justify-between">
          <p className="text-[10px] text-[var(--ink-4)] font-mono">{minAge}j</p>
          {fireAgeFractional != null && (
            <p className="text-[10px] text-horizon-600 font-mono font-semibold">
              FIRE {fireAgeFractional.toFixed(1)}j
            </p>
          )}
          <p className="text-[10px] text-[var(--ink-4)] font-mono">90j</p>
        </div>
      </div>
    </WidgetShell>
  )
}

'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatCurrency } from '@/lib/format'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const SimVermogenspadWidget = memo(function SimVermogenspadWidget({ size, data, href }: Props) {
  const { simRows, fireAgeFractional } = data
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })

  // ── Mini-size: FIRE portfolio amount ────────────────────
  if (size === 'mini') {
    const fireRow = simRows && fireAgeFractional != null
      ? simRows.find(r => r.age >= fireAgeFractional)
      : null
    const firePortfolio = fireRow?.endPortfolio
    return (
      <WidgetShell module="horizon" size="mini" kicker="Vermogenspad" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {firePortfolio != null ? formatCurrency(firePortfolio) : '—'}
        </p>
      </WidgetShell>
    )
  }

  if (!simRows || simRows.length === 0) {
    if (size === 'quarter') {
      return (
        <WidgetShell module="horizon" size={size} kicker="Vermogenspad" href={href}>
          <p className="text-[10px] text-[var(--ink-3)]">Geen simulatie</p>
        </WidgetShell>
      )
    }
    return (
      <WidgetShell module="horizon" size={size} kicker="Vermogenspad" href={href}>
        <p className="text-xs text-[var(--ink-3)]">Bezoek /horizon om simulatie te activeren</p>
      </WidgetShell>
    )
  }

  /* ── quarter-size: mini sparkline + FIRE age ── */
  if (size === 'quarter') {
    const qW = 120
    const qH = 40
    const qPad = 2
    const qMaxVal = Math.max(...simRows.map(r => r.endPortfolio), 1)
    const qMinAge = simRows[0].age
    const qMaxAge = simRows[simRows.length - 1].age
    const qAgeSpan = qMaxAge - qMinAge || 1
    const qToX = (age: number) => qPad + ((age - qMinAge) / qAgeSpan) * (qW - qPad * 2)
    const qToY = (val: number) => qH - qPad - (Math.max(val, 0) / qMaxVal) * (qH - qPad * 2)

    const accRows = simRows.filter(r => r.phase === 'accumulation')
    const qPath = accRows.length > 1
      ? accRows.map((r, i) => `${i === 0 ? 'M' : 'L'}${qToX(r.age).toFixed(1)},${qToY(r.endPortfolio).toFixed(1)}`).join(' ')
      : ''

    const qFireX = fireAgeFractional != null ? qToX(fireAgeFractional) : null
    const qFireY = fireAgeFractional != null && accRows.length > 0
      ? qToY(accRows[accRows.length - 1].endPortfolio)
      : null

    return (
      <WidgetShell module="horizon" size={size} kicker="Vermogenspad" href={href}>
        <div ref={ref}>
          <svg
            width="100%"
            viewBox={`0 0 ${qW} ${qH}`}
            className="overflow-visible"
            aria-label="Vermogenspad sparkline"
          >
            {qPath && (
              <path
                d={qPath}
                fill="none"
                stroke="var(--horizon-500, #c4a06b)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                style={{
                  strokeDasharray: '1',
                  strokeDashoffset: hasEntered ? '0' : '1',
                  transition: hasEntered
                    ? 'stroke-dashoffset 400ms cubic-bezier(.22,1,.36,1)'
                    : 'none',
                }}
              />
            )}
            {qFireX != null && qFireY != null && (
              <circle
                cx={qFireX}
                cy={qFireY}
                r="2.5"
                fill="var(--horizon-600, #a07840)"
                style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 300ms ease 400ms' }}
              />
            )}
          </svg>
          <div className="mt-0.5 flex items-center justify-between">
            <p className="font-mono text-[11px] font-semibold tabular-nums text-[var(--ink)]">
              {formatCurrency(simRows[simRows.length - 1].endPortfolio)}
            </p>
            {fireAgeFractional != null && (
              <p className="text-[10px] text-horizon-600 font-mono font-semibold">
                FIRE {Math.round(fireAgeFractional)}j
              </p>
            )}
          </div>
        </div>
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

  /* ── full-size enrichments: peak, end labels, age axis markers ── */
  const allRows = [...accumulationRows, ...retirementRows]
  const peakRow = allRows.reduce((best, r) => r.endPortfolio > best.endPortfolio ? r : best, allRows[0])
  const endRow = allRows[allRows.length - 1]
  const ageMarkers = size === 'full'
    ? [40, 50, 60, 70, 80].filter(a => a >= minAge && a <= maxAge)
    : []

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

          {/* Leeftijdsas markers (full-size only) */}
          {ageMarkers.map(age => (
            <g key={age}>
              <line
                x1={toX(age)}
                y1={H - pad}
                x2={toX(age)}
                y2={H - pad + 3}
                stroke="var(--ink-4)"
                strokeWidth="0.5"
              />
              <text
                x={toX(age)}
                y={H + 6}
                textAnchor="middle"
                fontSize="5"
                fill="var(--ink-4)"
                fontFamily="monospace"
              >
                {age}
              </text>
            </g>
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

          {/* Piekwaarde label (full-size only) */}
          {size === 'full' && peakRow && (
            <text
              x={Math.min(toX(peakRow.age) + 4, W - 40)}
              y={Math.max(toY(peakRow.endPortfolio) - 4, 10)}
              fontSize="5"
              fill="var(--horizon-600, #a07840)"
              fontFamily="monospace"
              fontWeight="600"
              style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 300ms ease 700ms' }}
            >
              {formatCurrency(peakRow.endPortfolio)}
            </text>
          )}

          {/* Eindsaldo label (full-size only) */}
          {size === 'full' && endRow && endRow !== peakRow && (
            <text
              x={Math.max(toX(endRow.age) - 4, 40)}
              y={Math.max(toY(endRow.endPortfolio) - 4, 10)}
              fontSize="5"
              fill="var(--ink-3)"
              fontFamily="monospace"
              textAnchor="end"
              style={{ opacity: hasEntered ? 1 : 0, transition: 'opacity 300ms ease 750ms' }}
            >
              {formatCurrency(endRow.endPortfolio)}
            </text>
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
})

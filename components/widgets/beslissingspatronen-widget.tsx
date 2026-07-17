'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { RECOMMENDATION_TYPE_LABELS, OVERIG_TYPE_LABEL } from '@/lib/recommendation-data'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// Eén bron van waarheid: consumeer de canonieke advies-labels (gelijk aan
// Tips/Briefing). Niet-gekoppelde acties komen uit de loader op bucket 'overig'.
function typeLabel(type: string): string {
  if (type === 'overig') return OVERIG_TYPE_LABEL
  return (RECOMMENDATION_TYPE_LABELS as Record<string, string>)[type] ?? OVERIG_TYPE_LABEL
}

export const BeslissingspatronenWidget = memo(function BeslissingspatronenWidget({ size, data, href }: Props) {
  const { decisionPatterns } = data

  // Sort descending by days won
  const sorted = [...decisionPatterns].sort((a, b) => b.days - a.days)
  const maxDays = sorted.length > 0 ? sorted[0].days : 0

  // ── Empty state ───────────────────────────────────────────
  if (sorted.length === 0) {
    return (
      <WidgetShell module="wil" size={size} kicker="Beslissingspatronen" href={href}>
        <div className="flex flex-col items-center justify-center h-full text-center">
          <p className="text-sm text-[var(--ink-3)]">Nog geen patronen</p>
          <p className="font-serif italic text-[11px] text-[var(--ink-4)] mt-1">
            Rond acties af om patronen te zien
          </p>
        </div>
      </WidgetShell>
    )
  }

  // ── Mini size ───────────────────────────────────────────────
  if (size === 'mini') {
    const totalDays = sorted.reduce((sum, p) => sum + p.days, 0)
    return (
      <WidgetShell module="wil" size="mini" kicker="Beslissingspatronen" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          +{Math.round(totalDays)}d
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter size: summary only ────────────────────────────
  if (size === 'quarter') {
    const totalDays = sorted.reduce((sum, p) => sum + p.days, 0)
    const topType = sorted[0]
    return (
      <WidgetShell module="wil" size={size} kicker="Beslissingspatronen" href={href}>
        <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
          {Math.round(totalDays)}d
        </p>
        <p className="mt-1 text-xs text-[var(--ink-3)]">
          {sorted.length} {sorted.length === 1 ? 'patroon' : 'patronen'}
        </p>
        <p className="mt-1 font-serif italic text-[11px] text-[var(--ink-3)] truncate">
          Top: {typeLabel(topType.type)}
        </p>
      </WidgetShell>
    )
  }

  // ── Half / Full: horizontal bar chart ─────────────────────
  const maxBars = size === 'full' ? sorted.length : Math.min(sorted.length, 4)
  const bars = sorted.slice(0, maxBars)

  return (
    <WidgetShell module="wil" size={size} kicker="Beslissingspatronen" href={href}>
      <div className="flex flex-col gap-2">
        {bars.map((pattern) => {
          const pct = maxDays > 0 ? (pattern.days / maxDays) * 100 : 0
          return (
            <div key={pattern.type}>
              <div className="flex items-baseline justify-between mb-0.5 gap-2">
                <span className="text-xs text-[var(--ink-2)] truncate min-w-0">
                  {typeLabel(pattern.type)}
                  {size === 'full' && pattern.count > 0 && (
                    <span className="ml-1.5 text-[10px] tabular-nums text-[var(--ink-4)]">
                      {pattern.count} {pattern.count === 1 ? 'actie' : 'acties'}
                    </span>
                  )}
                </span>
                <span className="font-mono text-xs tabular-nums text-wil-700 shrink-0">
                  +{Math.round(pattern.days)}d
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-[var(--subtle)]">
                <div
                  className="h-2 rounded-full bg-wil-400 transition-all duration-500"
                  style={{ width: `${Math.max(pct, 4)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </WidgetShell>
  )
})

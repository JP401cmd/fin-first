'use client'

import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const TYPE_LABELS: Record<string, string> = {
  budget_optimization: 'Budgetoptimalisatie',
  asset_reallocation: 'Vermogensherordening',
  debt_acceleration: 'Schuldversnelling',
  income_increase: 'Inkomensverhoging',
  savings_boost: 'Spaarversnelling',
  manual: 'Handmatig',
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}

export function BeslissingspatronenWidget({ size, data, href }: Props) {
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
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-[var(--ink-2)] truncate">
                  {typeLabel(pattern.type)}
                </span>
                <span className="font-mono text-xs tabular-nums text-wil-700 shrink-0 ml-2">
                  +{Math.round(pattern.days)}d
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-wil-50">
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
}

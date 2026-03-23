import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { DashboardData } from './widget-renderer'

const ASSET_COLORS: Record<string, string> = {
  savings:     '#3b82f6',
  investment:  '#10b981',
  retirement:  '#8b5cf6',
  eigen_huis:  '#d97706',
  real_estate: '#f59e0b',
  crypto:      '#f97316',
  vehicle:     '#6366f1',
  physical:    '#ec4899',
  other:       '#71717a',
}

const ASSET_LABELS: Record<string, string> = {
  savings:     'Spaargeld',
  investment:  'Beleggingen',
  retirement:  'Pensioen',
  eigen_huis:  'Eigen woning',
  real_estate: 'Vastgoed',
  crypto:      'Crypto',
  vehicle:     'Voertuig',
  physical:    'Fysiek',
  other:       'Overig',
}

const INVESTMENT_TYPES = new Set(['investment', 'retirement', 'crypto'])

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const HoldingsWidget = memo(function HoldingsWidget({ size, data, href }: Props) {
  const { assetsByType, monthlyExpenses, monthlyContributions } = data

  const investmentAssets = assetsByType.filter(a => INVESTMENT_TYPES.has(a.type))
  const totalInvestments = investmentAssets.reduce((s, a) => s + a.value, 0)

  // Investment-only monthly contributions: approximate by proportion of total assets
  const totalAllAssets = assetsByType.reduce((s, a) => s + a.value, 0)
  const investmentProportion = totalAllAssets > 0 ? totalInvestments / totalAllAssets : 0
  const investmentContributions = Math.round(monthlyContributions * investmentProportion)

  const dailyExp = monthlyExpenses / 30
  const ft = dailyExp > 0 && totalInvestments > 0 ? calculateFreedomTime(totalInvestments, dailyExp) : null
  const ftStr = ft ? formatFreedomTimeString(ft, 'short') : null

  // Count of investment-type asset entries (approximated as number of types present)
  const positionCount = investmentAssets.length

  // Weighted average expected return
  const weightedReturn = totalInvestments > 0
    ? investmentAssets.reduce((s, a) => s + a.value * (a.expectedReturn ?? 0), 0) / totalInvestments
    : null

  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Beleggingen" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {formatCurrency(totalInvestments)}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size: compact amount + positions + freedom time + return ────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Beleggingen" href={href}>
        <div>
          <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
            {formatCurrency(totalInvestments)}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
            {positionCount > 0
              ? `${positionCount} ${positionCount === 1 ? 'positie' : 'posities'}`
              : 'Geen beleggingsactiva'}
          </p>
          {ftStr && (
            <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
              ≈ {ftStr} vrijheid
            </p>
          )}
          {weightedReturn != null && weightedReturn > 0 && (
            <p className="mt-1 font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
              Verwacht {(weightedReturn * 100).toFixed(1)}%/j
            </p>
          )}
        </div>
      </WidgetShell>
    )
  }

  // ── Half-size: horizontal layout — left metric, right breakdown ──
  if (size === 'half') {
    const sorted = [...investmentAssets].sort((a, b) => b.value - a.value)
    const top2 = sorted.slice(0, 2)
    return (
      <WidgetShell module="kern" size={size} kicker="Beleggingen" href={href}>
        <div className="flex gap-3 h-full">
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
              {formatCurrency(totalInvestments)}
            </p>
            {ftStr && (
              <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
                ≈ {ftStr} vrijheid
              </p>
            )}
            <p className="mt-1.5 text-[11px] text-[var(--ink-3)]">
              {positionCount > 0
                ? `${positionCount} ${positionCount === 1 ? 'positie' : 'posities'}`
                : 'Geen beleggingsactiva'}
            </p>
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            {top2.map(a => {
              const pct = totalInvestments > 0 ? (a.value / totalInvestments) * 100 : 0
              const color = ASSET_COLORS[a.type] ?? '#71717a'
              return (
                <div key={a.type} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[var(--ink-2)] truncate">{ASSET_LABELS[a.type] ?? a.type}</span>
                  </div>
                  <span className="font-mono tabular-nums text-[var(--ink-3)] shrink-0 ml-1">{Math.round(pct)}%</span>
                </div>
              )
            })}
            {weightedReturn != null && weightedReturn > 0 && (
              <p className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
                Rendement: {(weightedReturn * 100).toFixed(1)}% p.j.
              </p>
            )}
            {investmentContributions > 0 && (
              <p className="font-mono text-[11px] text-emerald-700 tabular-nums">
                +{formatCurrency(investmentContributions)}/mnd
              </p>
            )}
          </div>
        </div>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="kern" size={size} kicker="Beleggingen" href={href}>
      {/* Primary value */}
      <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
        {formatCurrency(totalInvestments)}
      </p>
      {ftStr && (
        <p className="mt-0.5 font-serif italic text-[12px] text-[var(--ink-3)]">
          ≈ {ftStr} vrijheid
        </p>
      )}

      <p className="mt-2 text-xs text-[var(--ink-3)]">
        {positionCount > 0
          ? `${positionCount} ${positionCount === 1 ? 'positie' : 'posities'}`
          : 'Geen beleggingsactiva'}
      </p>
      {investmentContributions > 0 && (
        <p className="font-mono text-sm text-emerald-700 tabular-nums">
          +{formatCurrency(investmentContributions)} / maand
        </p>
      )}

      {/* Full-size: top 3 per-type rows + overig + weighted return */}
      {size === 'full' && investmentAssets.length > 0 && (() => {
        const sorted = [...investmentAssets].sort((a, b) => b.value - a.value)
        const top3 = sorted.slice(0, 3)
        const rest = sorted.slice(3)
        const overigValue = rest.reduce((s, a) => s + a.value, 0)
        const displayRows = overigValue > 0
          ? [...top3, { type: 'overig' as string, value: overigValue, expectedReturn: undefined }]
          : top3

        return (
          <div className="mt-3 space-y-1 border-t border-dashed border-[var(--border-ed)] pt-3">
            {displayRows.map(a => {
              const pct = totalInvestments > 0 ? (a.value / totalInvestments) * 100 : 0
              const color = ASSET_COLORS[a.type] ?? '#71717a'
              return (
                <div key={a.type}>
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[var(--ink-2)] truncate">
                        {ASSET_LABELS[a.type] ?? (a.type === 'overig' ? 'Overig' : a.type)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono tabular-nums text-[var(--ink)]">
                        {formatCurrency(a.value)}
                      </span>
                      <span className="w-8 text-right text-[var(--ink-4)]">
                        {Math.round(pct)}%
                      </span>
                    </div>
                  </div>
                  {/* Allocatie mini bar */}
                  <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              )
            })}

            {/* Weighted expected return */}
            {weightedReturn != null && weightedReturn > 0 && (
              <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-[var(--border-ed)] pt-2 text-[11px]">
                <span className="text-[var(--ink-3)]">Verwacht rendement</span>
                <span className="font-mono tabular-nums text-[var(--ink-2)]">
                  {(weightedReturn * 100).toFixed(1)}% p.j.
                </span>
              </div>
            )}
          </div>
        )
      })()}
    </WidgetShell>
  )
})

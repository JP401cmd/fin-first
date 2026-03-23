import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import type { DashboardData } from './widget-renderer'
import { Landmark } from 'lucide-react'

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

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const AssetsWidget = memo(function AssetsWidget({ size, data, href }: Props) {
  const { totalAssets, monthlyContributions, monthlyExpenses, assetsByType, totalPurchaseValue } = data

  if (totalAssets === 0 && assetsByType.length === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker="Vermogen" href={href}>
        <WidgetEmpty icon={Landmark} message="Voeg je eerste bezitting toe om je vermogensverdeling te zien." />
      </WidgetShell>
    )
  }

  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="Vermogen" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {formatCurrency(totalAssets)}
        </p>
      </WidgetShell>
    )
  }

  const dailyExp = monthlyExpenses / 30
  const ft = dailyExp > 0 && totalAssets > 0 ? calculateFreedomTime(totalAssets, dailyExp) : null
  const ftStr = ft ? formatFreedomTimeString(ft, 'short') : null

  // ── Quarter-size: compact total + freedom time + stacked bar ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Vermogen" href={href}>
        <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
          {formatCurrency(totalAssets)}
        </p>
        {ftStr && (
          <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
            {ftStr} vrijheid
          </p>
        )}
        {/* Compact stacked bar */}
        {assetsByType.length > 0 && totalAssets > 0 && (
          <div className="mt-1.5 h-[4px] w-full flex overflow-hidden rounded-full bg-[var(--border-ed)]">
            {assetsByType.map(a => (
              <div
                key={a.type}
                style={{
                  width: `${(a.value / totalAssets) * 100}%`,
                  backgroundColor: ASSET_COLORS[a.type] ?? '#71717a',
                }}
                title={`${ASSET_LABELS[a.type] ?? a.type}: ${formatCurrency(a.value)}`}
              />
            ))}
          </div>
        )}
      </WidgetShell>
    )
  }

  const unrealizedGain = totalPurchaseValue > 0 ? totalAssets - totalPurchaseValue : null
  const unrealizedPct  = unrealizedGain != null && totalPurchaseValue > 0
    ? (unrealizedGain / totalPurchaseValue) * 100
    : null

  // ── Half-size: horizontal layout — left metric, right breakdown ──
  if (size === 'half') {
    const sorted = [...assetsByType].sort((a, b) => b.value - a.value)
    const top2 = sorted.slice(0, 2)
    return (
      <WidgetShell module="kern" size={size} kicker="Vermogen" href={href}>
        <div className="flex gap-3 h-full">
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
              {formatCurrency(totalAssets)}
            </p>
            {ftStr && (
              <p className="mt-0.5 font-serif italic text-[11px] text-[var(--ink-3)]">
                ≈ {ftStr} vrijheid
              </p>
            )}
            <p className="mt-1.5 text-[11px] text-[var(--ink-3)]">
              Totaal actief vermogen
            </p>
            {monthlyContributions > 0 && (
              <p className="font-mono text-xs text-emerald-700 tabular-nums">
                +{formatCurrency(monthlyContributions)}/mnd
              </p>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            {/* Stacked bar */}
            {assetsByType.length > 0 && totalAssets > 0 && (
              <div className="h-[5px] w-full flex overflow-hidden rounded-full border border-[var(--border-ed)] bg-[var(--subtle)]">
                {assetsByType.map(a => (
                  <div
                    key={a.type}
                    style={{
                      width: `${(a.value / totalAssets) * 100}%`,
                      backgroundColor: ASSET_COLORS[a.type] ?? '#71717a',
                    }}
                    title={`${ASSET_LABELS[a.type] ?? a.type}: ${formatCurrency(a.value)}`}
                  />
                ))}
              </div>
            )}
            {/* Top 2 asset types */}
            {top2.map(a => {
              const pct = totalAssets > 0 ? (a.value / totalAssets) * 100 : 0
              return (
                <div key={a.type} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: ASSET_COLORS[a.type] ?? '#71717a' }} />
                    <span className="text-[var(--ink-2)] truncate">{ASSET_LABELS[a.type] ?? a.type}</span>
                  </div>
                  <span className="font-mono tabular-nums text-[var(--ink-3)] shrink-0 ml-1">{Math.round(pct)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      </WidgetShell>
    )
  }

  return (
    <WidgetShell module="kern" size={size} kicker="Vermogen" href={href}>
      {/* Primary value */}
      <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
        {formatCurrency(totalAssets)}
      </p>
      {ftStr && (
        <p className="mt-0.5 font-serif italic text-[12px] text-[var(--ink-3)]">
          ≈ {ftStr} vrijheid
        </p>
      )}

      {/* Stacked bar */}
      {assetsByType.length > 0 && totalAssets > 0 && (
        <div className="mt-3 h-[5px] w-full flex overflow-hidden rounded-full border border-[var(--border-ed)] bg-[var(--subtle)]">
          {assetsByType.map(a => (
            <div
              key={a.type}
              style={{
                width: `${(a.value / totalAssets) * 100}%`,
                backgroundColor: ASSET_COLORS[a.type] ?? '#71717a',
              }}
              title={`${ASSET_LABELS[a.type] ?? a.type}: ${formatCurrency(a.value)}`}
            />
          ))}
        </div>
      )}

      <p className="mt-2 text-xs text-[var(--ink-3)]">
        Totaal actief vermogen
      </p>
      {monthlyContributions > 0 && (
        <p className="font-mono text-sm text-emerald-700 tabular-nums">
          +{formatCurrency(monthlyContributions)} / maand
        </p>
      )}

      {/* Full-size: extra breakdown rows — top 3 + overig */}
      {size === 'full' && assetsByType.length > 0 && (() => {
        const sorted = [...assetsByType].sort((a, b) => b.value - a.value)
        const top3 = sorted.slice(0, 3)
        const rest = sorted.slice(3)
        const overigValue = rest.reduce((s, a) => s + a.value, 0)
        const displayRows = overigValue > 0
          ? [...top3, { type: 'overig' as string, value: overigValue, expectedReturn: undefined }]
          : top3

        return (
          <div className="mt-3 space-y-1 border-t border-dashed border-[var(--border-ed)] pt-3">
            {/* Ongerealiseerde winst */}
            {unrealizedGain != null && (
              <div className="mb-1 flex items-baseline justify-between text-[11px]">
                <span className="text-[var(--ink-3)]">Ongerealiseerde winst</span>
                <span
                  className={`font-mono font-semibold tabular-nums ${unrealizedGain >= 0 ? 'text-emerald-700' : 'text-red-600'}`}
                >
                  {unrealizedGain >= 0 ? '+' : ''}
                  {formatCurrency(unrealizedGain)}
                  {unrealizedPct != null && (
                    <span className="ml-1 font-normal text-[var(--ink-3)]">
                      ({unrealizedPct >= 0 ? '+' : ''}{unrealizedPct.toFixed(1)}%)
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Per-type rows — max 3 + overig */}
            {displayRows.map(a => {
              const pct = totalAssets > 0 ? (a.value / totalAssets) * 100 : 0
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
                  {/* Mini bar */}
                  <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}
    </WidgetShell>
  )
})

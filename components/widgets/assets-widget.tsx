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

export function AssetsWidget({ size, data, href }: Props) {
  const { totalAssets, monthlyContributions, monthlyExpenses, assetsByType, totalPurchaseValue } = data

  if (totalAssets === 0 && assetsByType.length === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker="Vermogen" href={href}>
        <WidgetEmpty icon={Landmark} message="Voeg je eerste bezitting toe om je vermogensverdeling te zien." />
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
          <div className="mt-2 h-[4px] w-full flex overflow-hidden rounded-full bg-[var(--border-ed)]">
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

      {/* Full-size: extra breakdown rows */}
      {size === 'full' && assetsByType.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-dashed border-[var(--border-ed)] pt-4">
          {/* Ongerealiseerde winst */}
          {unrealizedGain != null && (
            <div className="mb-3 flex items-baseline justify-between text-xs">
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

          {/* Per-type rows */}
          {assetsByType.map(a => {
            const pct = totalAssets > 0 ? (a.value / totalAssets) * 100 : 0
            const color = ASSET_COLORS[a.type] ?? '#71717a'
            return (
              <div key={a.type}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="inline-block h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[var(--ink-2)] truncate">
                      {ASSET_LABELS[a.type] ?? a.type}
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
                <div className="h-[4px] w-full overflow-hidden rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </WidgetShell>
  )
}

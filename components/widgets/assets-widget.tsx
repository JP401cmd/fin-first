import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatMaskedCurrency, calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { MaskedAmount } from '@/components/app/masked-amount'
import { ASSET_TYPE_COLORS, ASSET_TYPE_LABELS, type AssetType } from '@/lib/asset-data'
import type { DashboardData } from './widget-renderer'
import { Landmark } from 'lucide-react'

// Onderscheid tussen klasses gebeurt via labels naast kleur-dots — kleur-as is
// luminantie binnen kern-bruin (zie lib/asset-data.ts). 'overig' is geen
// AssetType maar een aggregate-bucket die altijd de fallback-tint krijgt.
const getAssetColor = (type: string): string =>
  ASSET_TYPE_COLORS[type as AssetType] ?? ASSET_TYPE_COLORS.other
const getAssetLabel = (type: string): string =>
  ASSET_TYPE_LABELS[type as AssetType] ?? (type === 'overig' ? 'Overig' : type)

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const AssetsWidget = memo(function AssetsWidget({ size, data, href }: Props) {
  const { totalAssets, monthlyContributions, monthlyExpenses, assetsByType, totalPurchaseValue } = data
  // Privacy-toggle proof-of-concept — mini hero amount respects the masking flag.
  const { masked } = useMaskedAmounts()

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
          {formatMaskedCurrency(totalAssets, masked)}
        </p>
      </WidgetShell>
    )
  }

  const dailyExp = dailyExpenseRate(monthlyExpenses)
  const ft = dailyExp > 0 && totalAssets > 0 ? calculateFreedomTime(totalAssets, dailyExp) : null
  const ftStr = ft ? formatFreedomTimeString(ft, 'short') : null

  // ── Quarter-size: compact total + freedom time + stacked bar ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="Vermogen" href={href}>
        <p className="text-[var(--ink)]">
          <MaskedAmount value={totalAssets} tone="kern" className="text-lg font-semibold" />
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
                  backgroundColor: getAssetColor(a.type),
                }}
                title={`${getAssetLabel(a.type)}: ${formatMaskedCurrency(a.value, masked)}`}
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
            <p className="text-[var(--ink)]">
              <MaskedAmount value={totalAssets} tone="kern" className="text-xl font-semibold" />
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
              <p className="text-positive">
                <MaskedAmount value={monthlyContributions} signPrefix="+" tone="kern" className="text-xs" />/mnd
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
                      backgroundColor: getAssetColor(a.type),
                    }}
                    title={`${getAssetLabel(a.type)}: ${formatMaskedCurrency(a.value, masked)}`}
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
                    <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: getAssetColor(a.type) }} />
                    <span className="text-[var(--ink-2)] truncate">{getAssetLabel(a.type)}</span>
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
      <p className="text-[var(--ink)]">
        <MaskedAmount value={totalAssets} tone="kern" className="text-2xl font-semibold" />
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
                backgroundColor: getAssetColor(a.type),
              }}
              title={`${getAssetLabel(a.type)}: ${formatMaskedCurrency(a.value, masked)}`}
            />
          ))}
        </div>
      )}

      <p className="mt-2 text-xs text-[var(--ink-3)]">
        Totaal actief vermogen
      </p>
      {monthlyContributions > 0 && (
        <p className="text-positive">
          <MaskedAmount value={monthlyContributions} signPrefix="+" tone="kern" className="text-sm" /> / maand
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
                <span className={unrealizedGain >= 0 ? 'text-positive' : 'text-negative'}>
                  <MaskedAmount
                    value={unrealizedGain}
                    signPrefix={unrealizedGain >= 0 ? '+' : ''}
                    tone="kern"
                    className="font-semibold"
                  />
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
              const color = getAssetColor(a.type)
              return (
                <div key={a.type}>
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[var(--ink-2)] truncate">
                        {getAssetLabel(a.type)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[var(--ink)]">
                        <MaskedAmount value={a.value} tone="kern" />
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

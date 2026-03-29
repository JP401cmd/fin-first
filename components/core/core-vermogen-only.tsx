'use client'

// ── Core Vermogen-Only Layout ────────────────────────────────
// Renders when only 'vermogensregistratie' is active (no 'budgetteren').
// Shows all assets and debts as individual cards grouped by wealth layer.

import { useMemo } from 'react'
import { Pencil, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { useFlashChange } from '@/lib/hooks/use-flash-change'
import type { Asset, AssetType } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { WealthGroup } from '@/lib/wealth-composition'
import { WEALTH_GROUPS, WEALTH_GROUP_LABELS } from '@/lib/wealth-composition'
import type { SavingsRateMethod } from '@/lib/core-metrics'
import type { NetWorthSnapshot } from '@/lib/net-worth-data'
import { SectionDivider } from '@/components/app/section-divider'
import { VermogenAssetCard } from './vermogen-asset-card'
import { VermogenDebtCard } from './vermogen-debt-card'
import { VermogenWealthGroup } from './vermogen-wealth-group'

// ── Types ──────────────────────────────────────────────────

/** Balance history entry for computing monthly change per asset */
export interface EntityBalance {
  entity_id: string
  snapshots: { date: string; value: number }[]
}

interface CoreVermogenOnlyProps {
  // Net worth metrics
  effectiveNetWorth: number
  effectiveTotalAssets: number
  effectiveTotalDebts: number
  // Full entity data
  fullAssets: Asset[]
  fullDebts: Debt[]
  // Savings rate
  savingsRate6m: number
  savingsRateMethod: SavingsRateMethod
  // Asset growth direction
  assetGrowthDirection: 'up' | 'down' | 'flat'
  // Net worth snapshots (for sparkline/trend)
  snapshots: NetWorthSnapshot[]
  // Callbacks
  onShowNetWorthReceipt: () => void
  onShowSavingsReceipt: () => void
  onShowEstimatesModal: () => void
  onOpenAssetModal: (assetId?: string) => void
  onOpenDebtModal: (debtId?: string) => void
}

// ── Wealth layer ordering ───────────────────────────────────

const LAYER_ORDER: WealthGroup[] = [
  'spaargeld',
  'beleggingen',
  'pensioen',
  'vastgoed',
  'overig',
]

// ── Helpers ─────────────────────────────────────────────────

const SAVINGS_METHOD_LABELS: Record<SavingsRateMethod, string> = {
  transaction: '6m transacties',
  estimate: 'profiel-schatting',
  net_worth_delta: 'vermogensdelta',
}

// ── Component ───────────────────────────────────────────────

export function CoreVermogenOnly({
  effectiveNetWorth,
  effectiveTotalAssets,
  effectiveTotalDebts,
  fullAssets,
  fullDebts,
  savingsRate6m,
  savingsRateMethod,
  assetGrowthDirection,
  snapshots,
  onShowNetWorthReceipt,
  onShowSavingsReceipt,
  onShowEstimatesModal,
  onOpenAssetModal,
  onOpenDebtModal,
}: CoreVermogenOnlyProps) {
  const { flashClass: assetFlash } = useFlashChange(effectiveTotalAssets)
  const { flashClass: debtFlash } = useFlashChange(effectiveTotalDebts)

  // Group active assets by wealth layer
  const groupedAssets = useMemo(() => {
    const groups: Record<WealthGroup, Asset[]> = {
      spaargeld: [],
      beleggingen: [],
      pensioen: [],
      vastgoed: [],
      overig: [],
    }
    for (const asset of fullAssets) {
      if (!asset.is_active) continue
      const layer = WEALTH_GROUPS[asset.asset_type as AssetType]
      if (layer) groups[layer].push(asset)
    }
    return groups
  }, [fullAssets])

  // Compute monthly net worth change from snapshots
  const monthlyNetWorthChange = useMemo(() => {
    if (snapshots.length < 2) return null
    const sorted = [...snapshots].sort((a, b) =>
      a.snapshot_date.localeCompare(b.snapshot_date),
    )
    const latest = sorted[sorted.length - 1]
    const prev = sorted[sorted.length - 2]
    return latest.net_worth - prev.net_worth
  }, [snapshots])

  // Active debts only
  const activeDebts = useMemo(
    () => fullDebts.filter((d) => d.is_active),
    [fullDebts],
  )

  // Stagger index counter across all groups
  let assetStagger = 0

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ── Summary Stat Row ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* Total Assets */}
        <button
          type="button"
          onClick={() => onOpenAssetModal()}
          className="card-editorial p-3 text-left"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Bezittingen
          </p>
          <p
            className={`mt-1 font-mono text-lg font-bold tabular-nums text-[var(--ink)] ${assetFlash}`}
          >
            {formatCurrency(effectiveTotalAssets)}
          </p>
          {assetGrowthDirection !== 'flat' && (
            <span
              className={`mt-0.5 flex items-center gap-0.5 text-[10px] font-medium ${
                assetGrowthDirection === 'up'
                  ? 'text-positive'
                  : 'text-negative'
              }`}
            >
              {assetGrowthDirection === 'up' ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {assetGrowthDirection === 'up' ? 'Stijgend' : 'Dalend'}
            </span>
          )}
        </button>

        {/* Total Debts */}
        <button
          type="button"
          onClick={() => onOpenDebtModal()}
          className="card-editorial p-3 text-left"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Schulden
          </p>
          <p
            className={`mt-1 font-mono text-lg font-bold tabular-nums text-negative ${debtFlash}`}
          >
            {effectiveTotalDebts > 0
              ? formatCurrency(-effectiveTotalDebts)
              : formatCurrency(0)}
          </p>
        </button>

        {/* Savings Rate */}
        <button
          type="button"
          onClick={onShowSavingsReceipt}
          className="col-span-2 card-editorial p-3 text-left sm:col-span-1"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Spaarquote
          </p>
          <p
            className={`mt-1 font-mono text-lg font-bold tabular-nums ${
              savingsRate6m >= 0 ? 'text-[var(--ink)]' : 'text-negative'
            }`}
          >
            {savingsRate6m.toFixed(1)}%
          </p>
          <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
            o.b.v. {SAVINGS_METHOD_LABELS[savingsRateMethod]}
          </p>
        </button>
      </div>

      {/* Estimates adjustment link (non-transaction methods) */}
      {savingsRateMethod !== 'transaction' && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onShowEstimatesModal}
            className="flex items-center gap-1.5 border border-kern-200 px-2.5 py-1.5 text-xs font-medium text-kern-600 transition-colors hover:bg-kern-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Schattingen aanpassen
          </button>
        </div>
      )}

      {/* ── Net Worth Summary ── */}
      <button
        type="button"
        onClick={onShowNetWorthReceipt}
        className="card-editorial w-full text-left"
      >
        <div className="h-[3px] bg-kern-500" />
        <div className="flex items-baseline justify-between p-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Netto Vermogen
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-[var(--ink)]">
              {formatCurrency(effectiveNetWorth)}
            </p>
          </div>
          {monthlyNetWorthChange != null && monthlyNetWorthChange !== 0 && (
            <span
              className={`flex items-center gap-1 font-mono text-sm font-medium tabular-nums ${
                monthlyNetWorthChange > 0 ? 'text-positive' : 'text-negative'
              }`}
            >
              {monthlyNetWorthChange > 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {monthlyNetWorthChange > 0 ? '+' : ''}
              {formatCurrency(monthlyNetWorthChange)}
            </span>
          )}
          {monthlyNetWorthChange != null && monthlyNetWorthChange === 0 && (
            <span className="flex items-center gap-1 font-mono text-sm font-medium tabular-nums text-[var(--ink-4)]">
              <Minus className="h-4 w-4" />
              Ongewijzigd
            </span>
          )}
        </div>
      </button>

      <SectionDivider variant="line" />

      {/* ── Assets by Wealth Layer ── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-kern-500" />
          <h2 className="label-editorial text-[var(--ink-2)]">
            Bezittingen
          </h2>
        </div>

        <div className="space-y-5">
          {LAYER_ORDER.map((layer, layerIdx) => {
            const assets = groupedAssets[layer]
            if (assets.length === 0) return null

            const layerTotal = assets.reduce(
              (sum, a) => sum + a.current_value,
              0,
            )
            const startStagger = assetStagger
            assetStagger += assets.length

            return (
              <VermogenWealthGroup
                key={layer}
                layer={layer}
                totalValue={layerTotal}
                count={assets.length}
                defaultOpen={layerIdx === 0 || assets.length <= 3}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {assets.map((asset, i) => (
                    <VermogenAssetCard
                      key={asset.id}
                      asset={asset}
                      onClick={(id) => onOpenAssetModal(id)}
                      staggerIndex={startStagger + i}
                    />
                  ))}
                </div>
              </VermogenWealthGroup>
            )
          })}

          {fullAssets.filter((a) => a.is_active).length === 0 && (
            <div className="py-8 text-center">
              <p className="text-sm text-[var(--ink-3)]">
                Nog geen bezittingen geregistreerd.
              </p>
              <button
                type="button"
                onClick={() => onOpenAssetModal()}
                className="mt-2 text-sm font-medium text-kern-600 hover:text-kern-700"
              >
                Voeg je eerste bezitting toe
              </button>
            </div>
          )}
        </div>
      </section>

      <SectionDivider variant="line" />

      {/* ── Debts ── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-red-500" />
          <h2 className="label-editorial text-[var(--ink-2)]">Schulden</h2>
        </div>

        {activeDebts.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeDebts.map((debt, i) => (
              <VermogenDebtCard
                key={debt.id}
                debt={debt}
                onClick={(id) => onOpenDebtModal(id)}
                staggerIndex={i}
              />
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--ink-3)]">
              Geen schulden geregistreerd.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

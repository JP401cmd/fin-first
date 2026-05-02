'use client'

import { useFlashChange } from '@/lib/hooks/use-flash-change'
import { formatCurrency } from '@/lib/format'
import {
  type Asset,
  type AssetType,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_COLORS,
} from '@/lib/asset-data'
import {
  Wallet,
  PiggyBank,
  TrendingUp,
  Vault,
  Home,
  Building,
  Bitcoin,
  Car,
  Gem,
  Building2,
  Shield,
  HandCoins,
  Briefcase,
  type LucideIcon,
} from 'lucide-react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { findDeepenings } from './category-deepening-registry'
import { AssetAppChip } from './asset-app-chip'
import { CardKpiStrip } from './card-kpi-strip'
import { ConnectionIndicator } from './connection-indicator'
import type { KpiPair } from '@/lib/asset-kpi'
import type { AssetConnectionSummary } from '@/lib/connections-data'

// ── Icon mapping ────────────────────────────────────────────

const ASSET_ICONS: Record<AssetType, LucideIcon> = {
  cash: Wallet,
  savings: PiggyBank,
  investment: TrendingUp,
  retirement: Vault,
  eigen_huis: Home,
  real_estate: Building,
  crypto: Bitcoin,
  vehicle: Car,
  physical: Gem,
  deelneming: Building2,
  levensverzekering: Shield,
  vordering: HandCoins,
  other: Briefcase,
}

// ── Props ───────────────────────────────────────────────────

interface VermogenAssetCardProps {
  asset: Asset
  /**
   * KPI-paar voor de strip onder de hoofdregel. Wanneer beide slots leeg
   * zijn rendert de strip niets (geen divider). Caller berekent dit via
   * `computeAssetKpi(asset, ctx)` uit `lib/asset-kpi.ts`.
   */
  kpiPair?: KpiPair
  /**
   * Click-handler ontvangt het volledige asset-object — niet alleen het ID.
   * Reden: de caller (bv. `<AssetCategoryPage>` voor cash) moet kunnen
   * beslissen op basis van velden als `has_budget_tracking` welke flow er
   * geopend wordt (cash-detail-pagina vs. asset-detail-sheet).
   */
  onClick: (asset: Asset) => void
  /**
   * Optionele actieve externe koppeling — rendert een klein `Plug`-symbool
   * naast de naam-regel om aan te geven dat deze post automatisch via een
   * API wordt bijgewerkt. Caller laadt dit via `loadConnectionsByAssetIds()`
   * voor de hele lijst en geeft per kaart het asset-specifieke summary mee.
   */
  connection?: AssetConnectionSummary
  staggerIndex?: number
}

// ── Component ───────────────────────────────────────────────

export function VermogenAssetCard({
  asset,
  kpiPair,
  onClick,
  connection,
  staggerIndex = 0,
}: VermogenAssetCardProps) {
  const { flashClass } = useFlashChange(asset.current_value)
  const { activeModules } = useFeatureAccess()
  const Icon = ASSET_ICONS[asset.asset_type]
  const accentColor = ASSET_TYPE_COLORS[asset.asset_type]

  // App-koppeling — leest direct uit de asset zelf via de registry-helper.
  // Geen separate state, geen junction-tabel: het bezit bepaalt de app-status.
  //
  // Multi-app: bij een categorie met meerdere apps (mortgage, real_estate)
  // tonen we voor MVP slechts één chip. Voorkeur: de eerste app waarvoor
  // het item al getracked is (concrete, leesbare status). Vinden we geen
  // tracked-app, dan vallen we terug op de eerste registry-entry — zo blijft
  // de chip-area stabiel en kan de gebruiker tenminste één app-label zien.
  const deepenings = findDeepenings(asset.asset_type, 'asset')
  const trackedDeepening = deepenings.find((d) => d.isItemTracked?.(asset))
  const displayDeepening = trackedDeepening ?? deepenings[0]
  const moduleActive = displayDeepening
    ? activeModules.includes(displayDeepening.moduleId)
    : false
  const tracked = displayDeepening?.isItemTracked?.(asset) ?? false

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(asset) }}
      className="card-editorial animate-fade-up w-full text-left"
      style={
        { '--stagger': `${staggerIndex * 60}ms` } as React.CSSProperties
      }
    >
      {/* 3px top accent bar */}
      <div className="h-[3px] w-full" style={{ backgroundColor: accentColor }} />

      <div className="flex items-center gap-3 p-3 sm:p-4">
        {/* Left: icon + name + institution */}
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--subtle)]"
        >
          <Icon className="h-4 w-4" style={{ color: accentColor }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-[var(--ink)]">
              {asset.name}
            </p>
            {connection && <ConnectionIndicator connection={connection} />}
          </div>
          <p className="truncate text-[10px] text-[var(--ink-4)]">
            {ASSET_TYPE_LABELS[asset.asset_type]}
            {asset.institution ? ` · ${asset.institution}` : ''}
          </p>
          {displayDeepening && (
            <AssetAppChip
              tracked={tracked}
              appLabel={displayDeepening.label}
              moduleActive={moduleActive}
            />
          )}
        </div>

        {/* Right: value */}
        <div className="shrink-0 text-right">
          <p
            className={`font-mono text-sm font-bold tabular-nums text-[var(--ink)] ${flashClass}`}
          >
            {formatCurrency(asset.current_value)}
          </p>
        </div>
      </div>

      {kpiPair && <CardKpiStrip pair={kpiPair} variant="item" />}
    </button>
  )
}

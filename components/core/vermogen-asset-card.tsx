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
  TrendingDown,
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
  monthlyChange?: number | null
  onClick: (assetId: string) => void
  staggerIndex?: number
}

// ── Component ───────────────────────────────────────────────

export function VermogenAssetCard({
  asset,
  monthlyChange,
  onClick,
  staggerIndex = 0,
}: VermogenAssetCardProps) {
  const { flashClass } = useFlashChange(asset.current_value)
  const Icon = ASSET_ICONS[asset.asset_type]
  const accentColor = ASSET_TYPE_COLORS[asset.asset_type]

  // Determine delta direction for styling
  const hasDelta = monthlyChange != null && monthlyChange !== 0
  const isPositiveDelta = hasDelta && monthlyChange! > 0

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(asset.id) }}
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
          className="flex h-7 w-7 shrink-0 items-center justify-center"
          style={{ backgroundColor: `${accentColor}26` }}
        >
          <Icon className="h-4 w-4" style={{ color: accentColor }} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--ink)]">
            {asset.name}
          </p>
          <p className="truncate text-[10px] text-[var(--ink-4)]">
            {ASSET_TYPE_LABELS[asset.asset_type]}
            {asset.institution ? ` · ${asset.institution}` : ''}
          </p>
        </div>

        {/* Right: value + delta */}
        <div className="shrink-0 text-right">
          <p
            className={`font-mono text-sm font-bold tabular-nums text-[var(--ink)] ${flashClass}`}
          >
            {formatCurrency(asset.current_value)}
          </p>
          {hasDelta && (
            <span
              className={`flex items-center justify-end gap-0.5 font-mono text-[10px] font-medium tabular-nums ${
                isPositiveDelta ? 'text-positive' : 'text-negative'
              }`}
            >
              {isPositiveDelta ? (
                <TrendingUp className="h-2.5 w-2.5" />
              ) : (
                <TrendingDown className="h-2.5 w-2.5" />
              )}
              {isPositiveDelta ? '+' : ''}
              {formatCurrency(monthlyChange!)}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFlashChange } from '@/lib/hooks/use-flash-change'
import { MaskedAmount } from '@/components/app/masked-amount'
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
  RefreshCw,
  Pencil,
  type LucideIcon,
} from 'lucide-react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { useToast } from '@/components/app/toast-provider'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { triggerAssetSync } from '@/lib/integrations/trigger-sync'
import { findDeepenings } from './category-deepening-registry'
import { AssetAppChip } from './asset-app-chip'
import { CardKpiStrip } from './card-kpi-strip'
import { ConnectionIndicator } from './connection-indicator'
import { CardTintOverlay } from './card-tint-overlay'
import { VermogenCardActionButton } from './vermogen-card-action-button'
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
  /**
   * 6 maandwaarden voor de achtergrond-sparkline ("breuklijn") die de
   * tinted boven/onder zones scheidt. Bij `undefined` of <2 punten valt
   * de overlay terug op een rechte horizontale scheiding op het midden.
   */
  sparklineValues?: number[]
  staggerIndex?: number
  /** Opent de detail-pane direct in edit-mode (URL: `?asset=<id>&edit=1`). */
  onEditClick: (asset: Asset) => void
  /** Opent de detail-pane met de ValuationModal direct open (URL: `?asset=<id>&via=revalue`). */
  onRevalueClick: (asset: Asset) => void
}

// ── Component ───────────────────────────────────────────────

export function VermogenAssetCard({
  asset,
  kpiPair,
  onClick,
  connection,
  sparklineValues,
  staggerIndex = 0,
  onEditClick,
  onRevalueClick,
}: VermogenAssetCardProps) {
  const router = useRouter()
  const { addToast } = useToast()
  const { masked } = useMaskedAmounts()
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

  // Sync-state — actief alleen wanneer er een live-koppeling is.
  const hasActiveConnection = !!(connection?.exchange?.id || connection?.wallet?.id)
  const [syncing, setSyncing] = useState(false)

  const handleSync = useCallback(async () => {
    if (!connection || syncing) return
    setSyncing(true)
    try {
      const result = await triggerAssetSync(connection)
      if (!result.ok) {
        addToast({
          type: 'error',
          title: 'Sync-fout',
          message: result.error ?? 'Synchronisatie mislukt.',
        })
        return
      }
      const totalEur =
        typeof result.totalEur === 'number'
          ? formatMaskedCurrency(result.totalEur, masked)
          : null
      addToast({
        type: 'success',
        title: 'Bijgewerkt',
        message: totalEur ? `Saldo opgehaald — ${totalEur}.` : `${asset.name} is bijgewerkt.`,
      })
      router.refresh()
    } finally {
      setSyncing(false)
    }
  }, [connection, syncing, addToast, masked, asset.name, router])

  return (
    <div
      className="card-editorial animate-fade-up relative w-full"
      style={{ '--stagger': `${staggerIndex * 60}ms` } as React.CSSProperties}
    >
      <CardTintOverlay variant="asset" sparklineValues={sparklineValues} />

      {/* 3px top accent bar */}
      <div className="relative z-10 h-[3px] w-full" style={{ backgroundColor: accentColor }} />

      {/* Hoofdregel — eigen <button>, opent de detail-pane in view-mode */}
      <button
        type="button"
        onClick={() => onClick(asset)}
        aria-label={`${asset.name} openen`}
        className="relative z-10 flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[var(--subtle)]/30 sm:p-4"
      >
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
          {/* Sub-meta in italic Source Serif (mini-artikel-blueprint) */}
          <p
            className="truncate text-[11px] italic text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
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

        {/* Right: value met halve transparante streep (highlight-marker) */}
        <div className="shrink-0 text-right">
          <p className={`text-[var(--ink)] ${flashClass}`}>
            <span
              className="inline px-1"
              style={{
                backgroundImage:
                  'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
              }}
            >
              <MaskedAmount value={asset.current_value} tone="kern" className="text-sm font-bold" />
            </span>
          </p>
        </div>
      </button>

      {/* Actie-rij — tussen hoofdregel en KPI-strip. Eigen interactieve regio
          met aparte <button>s — geen nested buttons (a11y). */}
      <div
        role="group"
        aria-label={`Acties voor ${asset.name}`}
        className="relative z-10 flex items-center justify-end gap-2 border-t border-[var(--border-md)]/40 px-3 py-2 sm:px-4"
      >
        {hasActiveConnection ? (
          <VermogenCardActionButton
            icon={RefreshCw}
            label="Synchroniseren"
            onClick={handleSync}
            spinning={syncing}
            ariaLabel={`${asset.name} synchroniseren`}
          />
        ) : (
          <VermogenCardActionButton
            icon={RefreshCw}
            label="Herwaarderen"
            onClick={() => onRevalueClick(asset)}
            ariaLabel={`${asset.name} herwaarderen`}
          />
        )}
        <VermogenCardActionButton
          icon={Pencil}
          label="Bewerken"
          onClick={() => onEditClick(asset)}
          ariaLabel={`${asset.name} bewerken`}
        />
      </div>

      {kpiPair && (kpiPair.primary || kpiPair.secondary) ? (
        <div className="relative z-10">
          <CardKpiStrip pair={kpiPair} variant="item" />
        </div>
      ) : null}
    </div>
  )
}

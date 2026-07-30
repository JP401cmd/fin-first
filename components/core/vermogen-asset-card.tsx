'use client'

import { memo, useCallback, useState } from 'react'
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
  Unlink,
  Link2,
  type LucideIcon,
} from 'lucide-react'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { useToast } from '@/components/app/toast-provider'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { triggerAssetSync } from '@/lib/integrations/trigger-sync'
import { OwnershipBadge } from '@/components/app/ownership-toggle'
import { formatOwnershipSubline, type Perspective, type Provenance } from '@/lib/household-data'
import { findDeepenings } from './category-deepening-registry'
import { AssetAppChip } from './asset-app-chip'
import { CardKpiStrip } from './card-kpi-strip'
import { ConnectionIndicator } from './connection-indicator'
import { AccountSourceIcon, accountSourceSuffix } from './account-source-icon'
import { CardTintOverlay } from './card-tint-overlay'
import { VermogenCardActionButton } from './vermogen-card-action-button'
import type { KpiPair } from '@/lib/asset-kpi'
import type { AssetConnectionSummary } from '@/lib/connections-data'
import type { BankLinkState } from '@/lib/bank-connection-status'

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
   * Koppeltoestand van een BANKREKENING, uit `deriveBankLinkState`
   * (`lib/bank-connection-status.ts`) via de server-loader — deze kaart leidt
   * niets zelf af.
   *
   * Laat `undefined` (default) wanneer herkomst niet van toepassing is: dan
   * rendert er niets en blijft de kaart exact zoals voorheen. Dat geldt voor de
   * bezittingen-pagina, voor aggregaatrijen (partner-totaal, geen echte
   * rekening) én — besluit B4 — voor een puur handmatige rekening: handmatig
   * bijhouden is de normale toestand en verdient geen markering. `'manual'` is
   * hier dus wél renderbaar (de filterchips op Transacties houden hun bestaande
   * gedrag), maar de cashflow-kaarten geven daarvoor `undefined` mee.
   */
  bankLink?: BankLinkState
  /**
   * Herstelactie bij `bankLink === 'linked-broken'`: start een herkoppeling met
   * déze rekening als doelrekening. Zonder handler rendert de herstelband niet —
   * een kwijtgeraakte verbinding melden zonder uitweg is erger dan hem alleen
   * met het symbool markeren.
   *
   * Ontvangt het asset (zoals `onClick`/`onEditClick`) zodat de caller één
   * stabiele `useCallback` kan doorgeven en de `memo()` van deze kaart blijft
   * werken. Wát de handeling doet — een overlay openen, een route starten — is aan
   * de caller; deze kaart doet zelf geen `fetch` en kent geen koppel-API.
   */
  onReconnect?: (asset: Asset) => void
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
  // ── Huishoud-perspectief (optioneel; solo-gedrag identiek aan voorheen) ──
  /** Actief perspectief — bepaalt of de waarde op aandeel of vol getoond wordt. */
  perspective?: Perspective
  /** Naam van de partner voor de OwnershipBadge (provenance='partner'). */
  partnerName?: string | null
  /** Herkomst van het item ('eigen'|'partner'|'gezamenlijk') uit de loader. */
  provenance?: Provenance
  /** Aandeel-fractie (0-1) van dit item in dit perspectief (gedeelde items). */
  shareFraction?: number
  /**
   * Aggregaatrij (privacy='totalen'): rendert als één niet-bewerkbare
   * "Partner vermogen (totaal)"-kaart, zonder bewerk-/herwaardeer-acties.
   */
  aggregated?: boolean
  /** Verberg de bewerk-/herwaardeer-actierij (bv. cash op bezittingen — beheer loopt via cashflow). */
  hideActions?: boolean
}

// ── Component ───────────────────────────────────────────────

// memo(): de kaart wordt per lijst in grote aantallen gerenderd. Alle props uit
// de host (assets-client / asset-category-page) zijn stabiel — asset uit een
// useMemo-groepering, kpiPair uit een Map-lookup, onClick/onEditClick/
// onRevalueClick via useCallback, rest primitieven/keyed-lookups — dus de memo
// slaat ongerelateerde host-herrenders effectief over.
export const VermogenAssetCard = memo(function VermogenAssetCard({
  asset,
  kpiPair,
  onClick,
  connection,
  bankLink,
  onReconnect,
  sparklineValues,
  staggerIndex = 0,
  onEditClick,
  onRevalueClick,
  perspective = 'personal',
  partnerName,
  provenance,
  shareFraction,
  aggregated = false,
  hideActions = false,
}: VermogenAssetCardProps) {
  const router = useRouter()
  const { addToast } = useToast()
  const { masked } = useMaskedAmounts()
  const { flashClass } = useFlashChange(asset.current_value)
  const { activeModules } = useFeatureAccess()
  // Aggregaatrijen (privacy='totalen', partner-totaal) hebben géén asset_type;
  // val dan terug op een veilig icoon/kleur zodat de kaart niet crasht.
  const Icon = ASSET_ICONS[asset.asset_type] ?? Wallet
  const accentColor = ASSET_TYPE_COLORS[asset.asset_type] ?? ASSET_TYPE_COLORS.other

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

  // Perspectief-correcte waarde: gedeeld item buiten huishouden → aandeel.
  // (Inclusiepercentage is door de caller al niet apart toegepast op deze
  // kaartwaarde; we tonen de volledige item-waarde × aandeel, consistent met
  // de subline uit `formatOwnershipSubline`.)
  const rawValue = Number(asset.current_value) || 0
  const isShared = asset.ownership === 'shared'
  const displayValue =
    isShared && perspective !== 'household' ? rawValue * (shareFraction ?? 1) : rawValue
  const ownershipSubline = formatOwnershipSubline(
    { ownership: asset.ownership, _myShareFraction: shareFraction },
    perspective,
    rawValue,
  )

  // ── Aggregaatrij (privacy='totalen') ─────────────────────────
  // Eén niet-bewerkbare "Partner vermogen (totaal)"-kaart: geen klik-flow,
  // geen bewerk-/herwaardeer-acties, geen KPI-strip. Toont alleen het totaal.
  if (aggregated) {
    return (
      <div
        className="card-editorial animate-fade-up relative w-full"
        style={{ '--stagger': `${staggerIndex * 60}ms` } as React.CSSProperties}
        data-testid="asset-card-aggregated"
      >
        <div className="relative z-10 h-[3px] w-full" style={{ backgroundColor: accentColor }} />
        <div className="relative z-10 flex w-full items-center gap-3 p-3 text-left sm:p-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--subtle)]">
            <Icon className="h-4 w-4" style={{ color: accentColor }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-[var(--ink)]">{asset.name}</p>
              <OwnershipBadge provenance="partner" partnerName={partnerName} perspective={perspective} />
            </div>
            <p
              className="truncate text-[11px] italic text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Totaal — privé samengevat
            </p>
          </div>
          <div className="shrink-0 text-right">
            <MaskedAmount value={rawValue} tone="kern" className="text-sm font-bold" />
          </div>
        </div>
      </div>
    )
  }

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
        // Herkomst hoort IN deze naam: het symbool in de naam-regel is
        // aria-hidden, want een eigen aria-label daarbinnen wordt door dit
        // button-label overstemd en zou nooit voorgelezen worden.
        aria-label={
          bankLink === undefined
            ? `${asset.name} openen`
            : `${asset.name} openen — ${accountSourceSuffix(bankLink)}`
        }
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
            {/* Herkomst-symbool voor bankrekeningen — visueel signaal; de
                betekenis zit in het aria-label van deze knop (zie hierboven).
                Zelfde iconentaal als de rekening-filterpills op
                /overzicht/transacties. Wélke toestanden hier langskomen bepaalt
                de caller (B4: cashflow stuurt geen `'manual'` mee). */}
            {bankLink !== undefined && <AccountSourceIcon state={bankLink} />}
            <OwnershipBadge
              provenance={provenance}
              ownership={provenance ? undefined : asset.ownership}
              partnerName={partnerName}
              perspective={perspective}
            />
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
              <MaskedAmount value={displayValue} tone="kern" className="text-sm font-bold" />
            </span>
          </p>
          {ownershipSubline && (
            <p
              className="mt-0.5 text-[10px] italic text-[var(--ink-4)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              data-testid="asset-ownership-subline"
            >
              {ownershipSubline}
            </p>
          )}
        </div>
      </button>

      {/* Herstelband — de énige koppeltoestand die om een handeling vraagt.
          BUITEN de hoofdregel-<button> hierboven: een knop binnen een knop is
          ongeldige HTML en onbereikbaar per toetsenbord (zelfde reden als de
          actie-rij hieronder).

          Direct ónder de naam-regel, zodat de band het `Unlink`-symbool dat daar
          staat uitlegt in plaats van het elders te herhalen — vandaar hetzelfde
          glyph en niet de `AlertTriangle` van de waarschuwings-alinea's in de
          bank-connect-wizard: die markeren een voorbehoud, dit markeert een
          verbroken schakel.

          Kleur uitsluitend via de `--warning`-tokens: aandacht, geen verlies. De
          autorisatie verloopt elk kwartaal — dat is verwacht onderhoud, geen
          fout, dus geen risico-rood. Copy bewust NEUTRAAL over de oorzaak
          (`bank_connections.status` kent `expired` én `revoked`, maar geen enkel
          codepad schrijft ooit `revoked`; "ingetrokken door je bank" zou een
          detectie suggereren die de app niet heeft). */}
      {bankLink === 'linked-broken' && onReconnect && (
        <div
          /* `flex-col sm:flex-row` en niet `flex-wrap`: op 360px moest de tekst
             zich naast een 44px-knop in drie regels wringen. Zelfde patroon als de
             herstelband op `ConnectedAccountCard` — één systeem, twee
             oppervlakken. Het symbool blijft bij zijn tekst (samen in de <p>),
             anders staat het glyph los boven de regel. */
          className="relative z-10 flex flex-col items-start gap-1.5 border-t border-warning/30 bg-warning-bg px-3 py-2 sm:flex-row sm:items-center sm:gap-2 sm:px-4"
          data-testid="asset-card-reconnect-band"
        >
          <p className="flex min-w-0 flex-1 items-start gap-2 text-[11px] leading-snug text-[var(--ink-2)]">
            <Unlink aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
            <span>Verbinding kwijt — je transacties komen niet meer binnen.</span>
          </p>
          <button
            type="button"
            onClick={() => onReconnect(asset)}
            aria-label={`Bankverbinding voor ${asset.name} opnieuw maken`}
            /* Inkt op papier, niet `text-warning` op `bg-warning-bg`: die
               combinatie haalt ~4,4:1 en blijft daarmee onder AA voor tekst. De
               warning-tint zit in de band (rand, vlak, icoon); de knop hoort
               leesbaar te zijn. Zelfde behandeling als de herstelknop op
               `ConnectedAccountCard`, zodat de twee oppervlakken één systeem
               vormen. */
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 bg-[var(--paper)] px-2.5 text-xs font-medium text-[var(--ink)] shadow-[var(--s0)] transition-colors hover:bg-[var(--subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            <Link2 aria-hidden className="h-3 w-3 text-warning" />
            Verbind opnieuw
          </button>
        </div>
      )}

      {/* Actie-rij — tussen hoofdregel en KPI-strip. Eigen interactieve regio
          met aparte <button>s — geen nested buttons (a11y).
          Cash-rekeningen hebben geen edit/revalue acties: beheer loopt via
          de cashflow-pagina. */}
      {!hideActions && (
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
      )}

      {kpiPair && (kpiPair.primary || kpiPair.secondary) ? (
        <div className="relative z-10">
          <CardKpiStrip pair={kpiPair} variant="item" />
        </div>
      ) : null}
    </div>
  )
})

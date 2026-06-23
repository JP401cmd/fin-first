'use client'

import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import {
  Plus, Trash2, Edit3, X, TrendingUp, RefreshCw, Loader2, BarChart3, ChevronDown, ChevronUp, Briefcase, AlertCircle, AlertTriangle, LinkIcon, ExternalLink, Users,
} from 'lucide-react'
import Link from 'next/link'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { Kicker, EditorialHeadline, EditorialDeck, FiguresStrip, PageInfoButton, GlossaryTerm } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { AssetPane } from '@/components/app/core/assets/asset-pane'
import { createClient } from '@/lib/supabase/client'
import { syncBudgetingActive } from '@/lib/budgeting-active'
import { upsertSingleBalanceSnapshot } from '@/lib/balance-snapshot'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
import { calculateFreedomTime, formatFreedomTimeString, formatMaskedCurrency, dailyExpenseRate } from '@/lib/format'
import { localMonthBounds } from '@/lib/month-range'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'

/**
 * Masked-aware EUR formatter hook used across this file's many sub-views.
 * Each call site invokes `useFc()` so masking propagates through the
 * privacy-toggle context. We keep `formatCurrency` available for any
 * non-display sites (CSV, sorting, intermediate math).
 */
function useFc() {
  const { masked } = useMaskedAmounts()
  return useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
}

/**
 * Wrapper die `BottomSheet` rendert in standalone-mode en alleen children
 * teruggeeft in embedded-mode. Hergebruikt door `AssetDetailModal`,
 * `AssetForm` en `ValuationModal` zodat ze in een `<ShellOverlay kind="pane">`
 * embedbaar zijn zonder code-duplicatie. Geen render-overhead in standalone-
 * mode (1 component-laag identiek aan voorheen).
 */
function MaybeBottomSheet({
  embedded,
  onClose,
  title,
  size,
  children,
}: {
  embedded: boolean
  onClose: () => void
  title: string
  size: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  children: ReactNode
}) {
  if (embedded) return <>{children}</>
  return (
    <BottomSheet open={true} onClose={onClose} title={title} size={size}>
      {children}
    </BottomSheet>
  )
}
import { OwnershipToggle, OwnershipBadge, useHouseholdStatus, type OwnershipType } from '@/components/app/ownership-toggle'
import { usePerspective, usePerspectiveAbort, type Perspective } from '@/components/app/perspective-provider'
import { PerspectiveContextLabel } from '@/components/app/perspective-context-label'
import { PrivacyHiddenNotice } from '@/components/app/privacy-hidden-notice'
import { loadPerspectiveData } from '@/lib/household/perspective-loader'
import {
  type Asset,
  type AssetType,
  type RiskProfile,
  type RetirementProviderType,
  ASSET_TYPE_LABELS,
  ASSET_TYPE_ICONS,
  ASSET_TYPE_COLORS,
  TYPICAL_RETURNS,
  ASSET_SUBTYPE_LABELS,
  ASSET_SUBTYPE_DEFAULTS,
  ASSET_TYPE_FIELDS,
  RISK_PROFILE_LABELS,
  RETIREMENT_PROVIDER_LABELS,
  projectPortfolio,
} from '@/lib/asset-data'
import {
  type SaleConfig,
  type SaleStand,
  parseSaleConfig,
} from '@/lib/sale-config'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
import { StepLinkDebt } from '@/components/app/quick-add-wizard/steps/step-link-debt'
import { EmptyState as QuickAddEmptyState } from '@/components/app/quick-add-wizard/empty-state'
import { AangifteImportPane } from '@/components/onboarding/aangifte-import-pane'
import { AssetEditConnectionSection } from './asset-edit-connection-section'
import { AssetEditBrokerSection } from './asset-edit-broker-section'
import { CryptoHoldingCard } from '@/components/holdings/crypto-holding-card'
import { InvestmentHoldingCard } from '@/components/holdings/investment-holding-card'
import { VermogenAssetCard } from './vermogen-asset-card'
import { AddCategoryCard } from './add-category-card'
import { CategoryGroupHeader } from './category-group-header'
import { EenvoudigPillList, type PillItem } from '@/components/overview/eenvoudig-pill-list'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import { buildKpiContext } from '@/lib/kpi-context'
import { computeAssetKpi, type KpiPair } from '@/lib/asset-kpi'
import { loadEntitySparklines } from '@/lib/load-entity-sparklines'
import { loadConnectionsByAssetIds, type AssetConnectionSummary } from '@/lib/connections-data'
import type { AssetsPageData, AssetsPerspectiveContext } from '@/lib/assets-data-loader'
import type { Provenance } from '@/lib/household-data'

type Mortgage = { id: string; name: string; current_balance: number; linked_asset_id: string | null }

/**
 * Asset zoals geleverd door de perspectief-loader: het ruwe DB-record plus de
 * huishoud-stempels (`_provenance`, `_myShareFraction`, optioneel `_aggregated`
 * voor een privacy-'totalen'-aggregaatrij). De loader past ownership-/privacy-
 * filtering al toe; deze component leest alleen de stempels uit.
 */
type PerspectiveAsset = Asset & {
  _provenance?: Provenance
  _myShareFraction?: number
  _aggregated?: boolean
  _aggregatedCount?: number
}

const SOLO_ASSETS_CONTEXT: AssetsPerspectiveContext = {
  userId: '',
  hasHousehold: false,
  partnerId: null,
  partnerName: null,
  mySharePct: 100,
}

/**
 * Perspectief-correcte waarde van een asset: bij een gedeeld item buiten het
 * huishoud-perspectief telt alleen het aandeel-fractie (`_myShareFraction`)
 * mee; in huishoud-perspectief telt een gedeeld item één keer op volle waarde.
 *
 * NB: deze overzicht-pagina toont (net als voorheen) de volledige
 * `current_value` — `net_worth_inclusion_pct` wordt hier bewust NIET toegepast
 * (dat is een netto-vermogen-concept op /core, niet op de bezittingenlijst).
 * Zo blijft het solo-gedrag byte-identiek aan voorheen.
 */
function perspectiveAssetValue(asset: PerspectiveAsset, perspective: Perspective): number {
  const raw = Number(asset.current_value) || 0
  if (asset.ownership === 'shared' && perspective !== 'household') {
    return raw * (asset._myShareFraction ?? 1)
  }
  return raw
}

const ASSET_ITEM_NOUN: Record<AssetType, [string, string]> = {
  cash: ['rekening', 'rekeningen'],
  savings: ['rekening', 'rekeningen'],
  investment: ['positie', 'posities'],
  retirement: ['regeling', 'regelingen'],
  eigen_huis: ['woning', 'woningen'],
  real_estate: ['object', 'objecten'],
  crypto: ['positie', 'posities'],
  vehicle: ['voertuig', 'voertuigen'],
  physical: ['item', 'items'],
  deelneming: ['deelneming', 'deelnemingen'],
  levensverzekering: ['polis', 'polissen'],
  vordering: ['vordering', 'vorderingen'],
  other: ['item', 'items'],
}

function addAssetCta(type: AssetType): string {
  return `Voeg ${ASSET_ITEM_NOUN[type][0]} toe`
}

type AssetsPageProps = {
  initialAssetId?: string
  initialData?: AssetsPageData
  /** Filter-control die naast de Herwaarderen/Bezitting-toevoegen-knoppen
   *  rendert. Doorgegeven vanaf `/overzicht/bezittingen` zodat de filter
   *  visueel bij de toolbar zit (i.p.v. los daarboven). Optioneel zodat
   *  `/core/assets` zonder filter blijft werken. */
  toolbarFilter?: ReactNode
  /** Inspiratie-blokken (CompoundInsightCard, FeeImpactCard) die direct
   *  onder de toolbar rendert. Drempel-logica leeft op de page-server zodat
   *  deze component pure render-laag blijft. */
  inspirationCards?: ReactNode
  /** Wanneer gezet: client-side filter op asset-type. Verbergt alle
   *  categorie-groepen behalve die met het gefilterde type. Wordt
   *  gecontroleerd door de page-wrapper die ook `toolbarFilter` rendert
   *  zodat dropdown en lijst in sync blijven. */
  assetTypeFilter?: AssetType | null
}

export default function AssetsPage({ initialAssetId, initialData, toolbarFilter, inspirationCards, assetTypeFilter }: AssetsPageProps = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  // Show juiste PAGE_INFO afhankelijk van canonieke route: /overzicht/bezittingen
  // krijgt nieuwe overzicht-tekst; legacy /core/assets blijft fallback.
  const pageInfoText = (pathname && PAGE_INFO[pathname]) || PAGE_INFO['/core/assets']
  const fc = useFc()
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [aangifteImportOpen, setAangifteImportOpen] = useState(false)
  const [quickAddInitialType, setQuickAddInitialType] = useState<AssetType | null>(null)
  // Hypotheek-vervolgvraag bij een NIEUW aangemaakte eigen woning (part B):
  // `mortgageLinkPrompt` toont de "Heeft deze woning een hypotheek?"-CTA;
  // bij "Ja" opent `mortgageWizardAssetId` de hypotheek-quick-add met het
  // verse asset-id voor-ingevuld als linked_asset_id.
  const [mortgageLinkPrompt, setMortgageLinkPrompt] = useState<{ assetId: string; assetName: string } | null>(null)
  const [mortgageWizardAssetId, setMortgageWizardAssetId] = useState<string | null>(null)
  // Filter-state: lege Set = alles tonen, niet-leeg = alleen geselecteerde
  // types tonen in de cards-grid en in de projection-chart. Wordt aangestuurd
  // door klikken op rijen in de Verdeling-tabel onderaan.
  const [selectedTypes, setSelectedTypes] = useState<Set<AssetType>>(new Set())
  const [assets, setAssets] = useState<PerspectiveAsset[]>(() => {
    if (!initialData) return []
    const rawAssets = initialData.assets as unknown as PerspectiveAsset[]
    // Sync cash asset values with bank_account balances (bank_account is more up-to-date)
    if (initialData.linkedBankAccounts.length > 0) {
      const balanceMap = new Map(initialData.linkedBankAccounts.map(ba => [ba.linked_asset_id, Number(ba.balance)]))
      return rawAssets.map(a => {
        if (a.asset_type === 'cash' && balanceMap.has(a.id)) {
          return { ...a, current_value: balanceMap.get(a.id)! }
        }
        return a
      })
    }
    return rawAssets
  })
  // Huishoud-context — bron voor partnernaam + aandeel-rendering op kaarten en
  // voor de PrivacyHiddenNotice. Komt mee uit de perspectief-loader.
  const [hhContext, setHhContext] = useState<AssetsPerspectiveContext>(
    initialData?.context ?? SOLO_ASSETS_CONTEXT,
  )
  const [mortgages, setMortgages] = useState<Mortgage[]>(initialData?.mortgages ?? [])
  const [linkedBankAccounts, setLinkedBankAccounts] = useState<Map<string, { id: string; linked_asset_id: string }>>(
    initialData
      ? new Map(initialData.linkedBankAccounts.map(ba => [ba.linked_asset_id, ba]))
      : new Map()
  )
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [newAssetType, setNewAssetType] = useState<AssetType | null>(null)
  const [editAsset, setEditAsset] = useState<Asset | null>(null)
  // Direct revaluation-target — gezet door de "Herwaarderen"-knop op een kaart.
  // Opent uitsluitend de ValuationModal (sheet), zonder eerst de detail-pane.
  const [revalueAsset, setRevalueAsset] = useState<Asset | null>(null)
  // URL-driven pane-state: `?asset=<id>` opent de slide-in pane voor die
  // asset. Consistent met `/core/assets/[type]` (asset-category-page.tsx)
  // en met deeplink-conventie uit `OVERLAY_QUERY_KEYS`.
  const requestedAssetId = searchParams.get('asset')
  const [projectionYears, setProjectionYears] = useState(10)
  const [insightOpen, setInsightOpen] = useState(false)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('collapsible_assets-insight')
      if (stored !== null) setInsightOpen(stored === 'true')
    } catch { /* */ }
  }, [])
  const toggleInsight = () => {
    const next = !insightOpen
    setInsightOpen(next)
    try { localStorage.setItem('collapsible_assets-insight', String(next)) } catch { /* */ }
  }
  const [dailyExpenses, setDailyExpenses] = useState(initialData?.dailyExpenses ?? 0)
  const [budgetingActive, setBudgetingActive] = useState(initialData?.budgetingActive ?? true)
  // Cards-decoraties (sparklines + connections) — client-side fetch zodra
  // assets geladen zijn. Failure is non-fataal: lege maps → cards renderen
  // zonder breuklijn-overlay of plug-indicator.
  const [assetSparklines, setAssetSparklines] = useState<Record<string, number[]>>({})
  const [connectionsByAssetId, setConnectionsByAssetId] = useState<Record<string, AssetConnectionSummary>>({})
  const { perspective } = usePerspective()
  const perspectiveSignal = usePerspectiveAbort(perspective)
  // Weergavemodus — in 'simple' rendert de bezittingenlijst als compacte
  // pill-lijst i.p.v. het kaart-grid. Single source of truth (geen tweede
  // leespad), zelfde host blijft alle data/groepering leveren.
  const simple = useDisplayMode().mode === 'simple'

  const loadAssets = useCallback(async (signal?: AbortSignal) => {
    try {
      const supabase = createClient()
      // Bron van waarheid voor ownership-/privacy-filtering: de perspectief-
      // loader. Levert eigen + (perspectief-gewogen) gedeelde + (privacy-gated)
      // partner-items, reeds gestempeld met `_provenance`/`_myShareFraction`.
      const perspectiveData = await loadPerspectiveData(supabase, perspective)

      if (signal?.aborted) return // Discard stale results

      setHhContext({
        userId: perspectiveData.context.userId,
        hasHousehold: perspectiveData.context.hasHousehold,
        partnerId: perspectiveData.context.partnerId,
        partnerName: perspectiveData.context.partnerName,
        mySharePct: perspectiveData.context.mySharePct,
      })

      const loadedAssets = [...perspectiveData.assets].sort(
        (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0),
      ) as unknown as PerspectiveAsset[]
      setAssets(loadedAssets)

      // Load linked mortgages + daily expenses for freedom-time + bank account links
      const { data: { user } } = await supabase.auth.getUser()
      if (signal?.aborted) return
      if (user) {
        const now = new Date()
        const { start: monthStart, end: monthEnd } = localMonthBounds(now)

        const [mortgageResult, txResult, bankLinksResult, profileBaResult] = await Promise.all([
          supabase
            .from('debts')
            .select('id, name, current_balance, linked_asset_id')
            .eq('user_id', user.id)
            .eq('debt_type', 'mortgage')
            .eq('is_active', true),
          supabase
            .from('transactions')
            .select('amount')
            .gte('date', monthStart)
            .lt('date', monthEnd),
          supabase
            .from('bank_accounts')
            .select('id, linked_asset_id, balance')
            .not('linked_asset_id', 'is', null)
            .eq('is_active', true),
          supabase
            .from('profiles')
            .select('budgeting_active')
            .single(),
        ])

        if (signal?.aborted) return // Discard stale results after parallel queries

        if (mortgageResult.data) setMortgages(mortgageResult.data as Mortgage[])
        setBudgetingActive(profileBaResult.data?.budgeting_active !== false)

        // Build linked bank account map (asset_id → bank_account)
        const linksMap = new Map<string, { id: string; linked_asset_id: string }>(
          (bankLinksResult.data ?? []).map((ba: { id: string; linked_asset_id: string; balance: number }) => [ba.linked_asset_id, ba])
        )
        setLinkedBankAccounts(linksMap)

        // Sync cash asset values with bank_account balances (bank_account is more up-to-date)
        if (bankLinksResult.data && bankLinksResult.data.length > 0) {
          const balanceMap = new Map(
            bankLinksResult.data.map((ba: { id: string; linked_asset_id: string; balance: number }) => [ba.linked_asset_id, Number(ba.balance)])
          )
          setAssets(prev => prev.map(a => {
            if (a.asset_type === 'cash' && balanceMap.has(a.id)) {
              return { ...a, current_value: balanceMap.get(a.id)! }
            }
            return a
          }))
        }

        // Calculate daily expenses from current month transactions
        const monthlyExpenses = (txResult.data ?? []).reduce((sum, t) => {
          const amt = Number(t.amount)
          return amt < 0 ? sum + Math.abs(amt) : sum
        }, 0)
        setDailyExpenses(dailyExpenseRate(monthlyExpenses))
      }
    } catch (err) {
      console.error('Error loading assets:', err)
      if (!signal?.aborted) setError('Kon assets niet laden. Probeer het opnieuw.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [perspective])

  // `valuations` state blijft als opt-in cache voor componenten die de
  // overzicht-pagina als embedded host gebruiken (bv. legacy core-page
  // modal-embed met `initialAssetId`). Voor de hoofdflow leest `<AssetPane>`
  // valuations zelf — geen top-level prefetch meer noodzakelijk.

  useEffect(() => {
    const signal = perspectiveSignal
    loadAssets(signal)
  }, [loadAssets, perspectiveSignal])

  const activeAssets = assets.filter((a) => a.is_active !== false)
  // Aandeel-fractie voor purchase/inleg-aggregaten: bij gedeelde items buiten
  // het huishoud-perspectief telt alleen het aandeel van deze viewer mee
  // (spiegelt `perspectiveAssetValue` maar zonder inclusiepercentage — dat is
  // een waarde-concept, geen aankoop-/inlegconcept).
  const shareFractionFor = useCallback(
    (a: PerspectiveAsset) =>
      a.ownership === 'shared' && perspective !== 'household' ? (a._myShareFraction ?? 1) : 1,
    [perspective],
  )
  const totalValue = activeAssets.reduce((s, a) => s + perspectiveAssetValue(a, perspective), 0)
  const totalPurchase = activeAssets.reduce((s, a) => s + Number(a.purchase_value) * shareFractionFor(a), 0)
  const totalMonthlyContrib = activeAssets.reduce((s, a) => s + Number(a.monthly_contribution) * shareFractionFor(a), 0)

  // Group by type — totalen zijn perspectief-gewogen (gedeeld telt op aandeel
  // buiten huishouden, vol in huishouden).
  const byType = useMemo(() => {
    const map = {} as Record<AssetType, { assets: PerspectiveAsset[]; total: number }>
    for (const type of Object.keys(ASSET_TYPE_LABELS) as AssetType[]) {
      const typeAssets = activeAssets.filter((a) => a.asset_type === type)
      map[type] = {
        assets: typeAssets,
        total: typeAssets.reduce((s, a) => s + perspectiveAssetValue(a, perspective), 0),
      }
    }
    return map
  }, [activeAssets, perspective])

  // Partner-vermogen verborgen? Heuristiek per directive: in huishouden-/partner-
  // perspectief met een partner levert de loader géén partner-provenance item
  // wanneer de partner `assets: 'hidden'` heeft ingesteld. Toon dan de subtiele
  // PrivacyHiddenNotice. (De loader doet de privacy-filtering; wij berekenen
  // hier niets meer zelf.)
  const partnerAssetsHidden =
    hhContext.hasHousehold &&
    (perspective === 'household' || perspective === 'partner') &&
    !activeAssets.some((a) => a._provenance === 'partner')

  // Partner-aggregaatrijen (privacy='totalen') hebben géén asset_type en vallen
  // daardoor buiten `byType`. Toon ze apart in een eigen "Van je partner"-sectie
  // zodat het partner-aandeel zichtbaar is (anders telt het wél mee in het
  // totaal maar zie je nergens wáár het vandaan komt).
  const partnerAggregateAssets = useMemo(
    () => activeAssets.filter((a) => a._aggregated === true && a._provenance === 'partner'),
    [activeAssets],
  )

  // ── Pill-items voor de Eenvoudig-weergave ────────────────────
  // Eén PLATTE lijst over alle categorieën heen: géén CategoryGroupHeader-
  // koppen meer; categorie loopt uitsluitend via het pill-icoon (type-naam +
  // type-kleur). Spiegelt de icoon/kleur/klik-keuzes van het kaart-grid en de
  // perspectief-correcte waarde (`perspectiveAssetValue`) + dezelfde sparkline-
  // serie (`assetSparklines`). Géén nieuwe data-bron.
  //
  // Partner-aggregaatrijen (privacy='totalen', géén asset_type) lopen als
  // gewone pills mee aan het eind — fallback-icoon/-kleur zoals de aggregaat-
  // kaart (Wallet / 'other'-kleur), zonder sparkline (geen historie).
  const assetPillItems = useMemo<PillItem[]>(() => {
    const items = (Object.keys(ASSET_TYPE_LABELS) as AssetType[])
      .filter((type) => !assetTypeFilter || type === assetTypeFilter)
      .flatMap((type): PillItem[] => {
        const group = byType[type]
        if (!group || group.assets.length === 0) return []
        return group.assets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          iconName: ASSET_TYPE_ICONS[type],
          iconColor: ASSET_TYPE_COLORS[type],
          amount: perspectiveAssetValue(asset, perspective),
          sparklineValues: assetSparklines[asset.id],
          onClick: () => handleAssetClick(asset),
        }))
      })

    // Partner-aggregaat als pills (optie A) — alleen buiten een type-filter,
    // zelfde conditie als het kaart-grid (partnerAggregateAssets.length > 0).
    if (!assetTypeFilter) {
      for (const asset of partnerAggregateAssets) {
        items.push({
          id: asset.id,
          name: asset.name,
          iconName: ASSET_TYPE_ICONS.other,
          iconColor: ASSET_TYPE_COLORS.other,
          amount: perspectiveAssetValue(asset, perspective),
          onClick: () => handleAssetClick(asset),
        })
      }
    }
    // Aandeel van elke post in het getoonde totaal (voor de balk in de pill).
    const total = items.reduce((s, it) => s + it.amount, 0)
    if (total > 0) for (const it of items) it.sharePct = (it.amount / total) * 100
    return items
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byType, assetTypeFilter, perspective, assetSparklines, partnerAggregateAssets])

  // ── KPI's per asset (zelfde patroon als asset-category-page) ──
  // Context-build uit lokale state: assets (huidige user) + mortgages
  // (al geladen voor overwaarde-koppelingen). Holdings/cashStats blijven
  // leeg — die KPI's vervallen op deze overview-pagina, het zijn diepere
  // categorie-pagina-KPI's. Voor de mainline-strip (rente, looptijd,
  // overwaarde, LTV) is dit voldoende.
  const kpiByAssetId = useMemo(() => {
    const ctx = buildKpiContext({
      assets: activeAssets.map((a) => ({
        id: a.id,
        asset_type: a.asset_type,
        current_value: Number(a.current_value),
        linked_asset_id: a.linked_asset_id ?? null,
      })),
      debts: mortgages.map((m) => ({
        id: m.id,
        debt_type: 'mortgage' as const,
        current_balance: Number(m.current_balance),
        linked_asset_id: m.linked_asset_id ?? null,
      })),
      holdings: [],
    }).asset
    const map = new Map<string, KpiPair>()
    for (const asset of activeAssets) {
      const pair = computeAssetKpi(asset, ctx)
      if (pair.primary || pair.secondary) {
        map.set(asset.id, pair)
      }
    }
    return map
  }, [activeAssets, mortgages])

  // ── Client-side fetch: sparklines + connections ──────────────
  // Zelfde data als de categorie-pagina laadt zodat `<VermogenAssetCard>`
  // op deze overview identiek rendert als op `/core/assets/[type]`.
  useEffect(() => {
    // Aggregaatrijen (privacy='totalen') hebben geen echt entity-ID — sla ze
    // over voor sparkline-/connection-fetches.
    const ids = activeAssets.filter((a) => a._aggregated !== true).map((a) => a.id)
    if (ids.length === 0) {
      setAssetSparklines({})
      setConnectionsByAssetId({})
      return
    }
    const supabase = createClient()
    let cancelled = false
    Promise.allSettled([
      loadEntitySparklines(supabase, 'asset', ids),
      loadConnectionsByAssetIds(supabase, ids),
    ]).then(([sparkRes, connRes]) => {
      if (cancelled) return
      setAssetSparklines(sparkRes.status === 'fulfilled' ? sparkRes.value : {})
      setConnectionsByAssetId(connRes.status === 'fulfilled' ? connRes.value : {})
    })
    return () => { cancelled = true }
  }, [activeAssets])

  // Portfolio projection — perspectief-gewogen: gedeelde items buiten het
  // huishouden projecteren op het aandeel van deze viewer (waarde + inleg
  // pre-geschaald) zodat de projectie coherent is met `totalValue`.
  const projectionAssets = useMemo(
    () =>
      activeAssets.map((a) => {
        const f = shareFractionFor(a)
        if (f === 1) return a
        return {
          ...a,
          current_value: Number(a.current_value) * f,
          monthly_contribution: Number(a.monthly_contribution) * f,
        }
      }),
    [activeAssets, shareFractionFor],
  )
  const projection = useMemo(
    () => projectPortfolio(projectionAssets, projectionYears * 12),
    [projectionAssets, projectionYears],
  )
  const futureValue = projection.length > 0 ? projection[projection.length - 1].total : totalValue
  const projectedGrowth = futureValue - totalValue

  // URL-state setter — pane-open/-close wisselt `?asset=<id>` via shallow
  // route-replace. Optionele `editMode` zet de extra key `edit=1` zodat
  // de bewerk-knop op de kaart één klik direct in edit-mode landt. Bij
  // sluiten (`id === null`) worden alle keys gestript.
  const setSelectedAssetId = useCallback(
    (id: string | null, editMode = false) => {
      const params = new URLSearchParams(searchParams.toString())
      params.delete('edit')
      if (id) {
        params.set('asset', id)
        if (editMode) params.set('edit', '1')
      } else {
        params.delete('asset')
      }
      const queryString = params.toString()
      router.replace(
        `/core/assets${queryString ? `?${queryString}` : ''}`,
        { scroll: false },
      )
    },
    [router, searchParams],
  )

  // Geselecteerde asset = lookup uit lijst o.b.v. URL. Memoized zodat
  // pane-prop alleen herrendert bij echte id-wisseling.
  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === requestedAssetId) ?? null,
    [assets, requestedAssetId],
  )

  // Initial deep-link via prop (gebruikt door de core-page modal-embed):
  // promote prop naar URL-state op de eerste render zodat alle vervolg-
  // navigatie via dezelfde URL-driven flow loopt.
  const initialAssetIdAppliedRef = useRef(false)
  useEffect(() => {
    if (initialAssetIdAppliedRef.current) return
    if (!initialAssetId || loading || assets.length === 0) return
    if (requestedAssetId === initialAssetId) {
      initialAssetIdAppliedRef.current = true
      return
    }
    const found = assets.find(a => a.id === initialAssetId)
    if (found) {
      initialAssetIdAppliedRef.current = true
      setSelectedAssetId(initialAssetId)
    }
  }, [initialAssetId, loading, assets, requestedAssetId, setSelectedAssetId])

  function handleAssetClick(asset: Asset) {
    // Cash-rekeningen wonen op de cashflow-pagina: open daar met focus op de
    // gekozen rekening (#rekening-<assetId>). Andere asset-types openen de
    // detail-pane op hun categoriepagina zoals voorheen.
    if (asset.asset_type === 'cash') {
      router.push(`/overzicht/cashflow#rekening-${asset.id}`)
      return
    }
    router.push(`/core/assets/${asset.asset_type}?asset=${asset.id}`)
  }

  // Snelle acties vanuit de kaart-actie-rij. Bewerken opent de detail-pane
  // in edit-mode op de huidige pagina (geen cash-deeplink — de gebruiker
  // wil bewerken, niet de Budgetteren-app openen). Herwaarderen opent
  // ALLEEN de ValuationModal als sibling-sheet, zonder de pane.
  const handleAssetEdit = useCallback(
    (asset: Asset) => setSelectedAssetId(asset.id, true),
    [setSelectedAssetId],
  )
  const handleAssetRevalue = useCallback((asset: Asset) => setRevalueAsset(asset), [])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="rounded-[var(--r-lg)] border border-negative/30 bg-negative/10 p-6 text-center">
          <p className="text-sm font-medium text-negative">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); loadAssets() }} className="mt-3 rounded-[var(--r)] bg-negative px-4 py-2 text-sm font-medium text-[var(--paper)] hover:bg-negative/90">
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* ═══ Editorial header (Type 2 — List) ═══════════════════════
          Hergebruikt editorial-primitives: Kicker, EditorialHeadline,
          EditorialDeck, FiguresStrip. Geen hand-rolled markup. */}

      {/* 3px module-accent-bar */}
      <div className="h-[3px] w-full mb-5" style={{ background: 'var(--module-active-500)' }} aria-hidden="true" />

      <header className="relative mb-5 space-y-3">
        <PageInfoButton
          description={pageInfoText}
          className="absolute right-0 top-0"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Kicker size="large">Bezittingen · opgeslagen vrijheid</Kicker>
          <PerspectiveContextLabel />
        </div>

        <EditorialHeadline emphasis="vrijheid" size="lg">
          Opgeslagen vrijheid
        </EditorialHeadline>

        <EditorialDeck>
          Elke bezitting is opgeslagen tijd — geld dat voor je werkt in plaats van andersom.
          {activeAssets.length > 0 && ` ${activeAssets.length} bezitting${activeAssets.length === 1 ? '' : 'en'} bij elkaar — gewogen naar inclusiepercentage.`}
        </EditorialDeck>

        {partnerAssetsHidden && (
          <PrivacyHiddenNotice hiddenCategories={['assets']} forCategories={['assets']} />
        )}
      </header>

      {/* Figures-strip (mini-hero) — Totale waarde krijgt highlight-marker */}
      {/* In Eenvoudig alleen het hoofdcijfer "Totale waarde"; de projectie-
          cijfers (inleg, rendement totaal, waarde over N jaar) zijn diepte → verborgen. */}
      {simple ? (
        <FiguresStrip
          cols={2}
          figures={[
            {
              kicker: 'Totale waarde',
              amount: fc(totalValue),
              sub: dailyExpenses > 0 && totalValue > 0
                ? `${formatFreedomTimeString(calculateFreedomTime(totalValue, dailyExpenses), 'long')} vrijheid`
                : `${activeAssets.length} bezitting${activeAssets.length === 1 ? '' : 'en'}`,
              variant: 'winner',
            },
          ]}
        />
      ) : (
        <FiguresStrip
          cols={4}
          figures={[
            {
              kicker: 'Totale waarde',
              amount: fc(totalValue),
              sub: dailyExpenses > 0 && totalValue > 0
                ? `${formatFreedomTimeString(calculateFreedomTime(totalValue, dailyExpenses), 'long')} vrijheid`
                : `${activeAssets.length} bezitting${activeAssets.length === 1 ? '' : 'en'}`,
              variant: 'winner',
            },
            {
              kicker: 'Maandelijkse inleg',
              amount: fc(totalMonthlyContrib),
              sub: 'totale inleg per maand',
            },
            {
              kicker: 'Rendement totaal',
              amount: totalPurchase > 0
                ? `${totalValue >= totalPurchase ? '+' : ''}${fc(totalValue - totalPurchase)}`
                : '—',
              sub: totalPurchase > 0
                ? totalValue >= totalPurchase ? 'sinds aankoop' : 'verlies sinds aankoop'
                : 'geen aankoopwaarde bekend',
              variant: totalPurchase > 0
                ? totalValue >= totalPurchase ? 'positive' : 'negative'
                : 'neutral',
            },
            {
              kicker: `Waarde over ${projectionYears} jaar`,
              amount: fc(futureValue),
              sub: dailyExpenses > 0 && futureValue > 0
                ? `${formatFreedomTimeString(calculateFreedomTime(futureValue, dailyExpenses), 'long')} vrijheid`
                : `+${fc(projectedGrowth)} verwacht`,
              variant: 'positive',
            },
          ]}
        />
      )}

      {/* Toolbar — filter links (indien meegegeven), Herwaarderen + primaire
          CTA rechts. flex-wrap zorgt dat op smalle schermen de filter onder
          de actie-knoppen vouwt zonder overlap. */}
      <div className="mb-5 flex flex-wrap items-center justify-end gap-2">
        {toolbarFilter && (
          <div className="mr-auto">{toolbarFilter}</div>
        )}
        <Link
          href="/core/assets/revalue"
          aria-label="Herwaarderen"
          className="inline-flex min-h-[40px] items-center gap-2 border border-[var(--border-md)] bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Herwaarderen</span>
        </Link>
        <button
          type="button"
          onClick={() => { setQuickAddInitialType(null); setQuickAddOpen(true) }}
          aria-label="Bezitting toevoegen"
          className="inline-flex min-h-[40px] items-center gap-2 border border-[var(--ink)] bg-[var(--paper)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          <span className="hidden sm:inline">Bezitting toevoegen</span>
        </button>
      </div>

      {/* Inspiratie-blokken direct onder de toolbar — leeg/null als de
          page-server geen drempels haalt. */}
      {inspirationCards && (
        <div className="mb-5 space-y-4">{inspirationCards}</div>
      )}

      {/* Allocation + projection — collapsible card. Bewust óók in Eenvoudig
          zichtbaar (eigen dropdown), zodat /overzicht/bezittingen symmetrisch is
          met de Aflosroute-dropdown op /overzicht/schulden. */}
      <div className="mt-3 sm:mt-6 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden">
        {/* ── Accent bar ── */}
        <div className="h-[3px] w-full bg-kern-500" />

        {/* ── Header (clickable toggle) ── */}
        <button
          type="button"
          onClick={toggleInsight}
          aria-expanded={insightOpen}
          className="flex w-full items-center gap-3 border-b border-[var(--border-ed)] px-4 py-4 text-left transition-colors hover:bg-[var(--subtle)] sm:px-5"
        >
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${insightOpen ? 'rotate-180' : ''}`} />
          <div className="flex min-w-0 flex-1 items-center justify-between">
            <Kicker>
              <BarChart3 className="h-3 w-3 -mt-0.5 inline mr-1" aria-hidden />
              Verdeling &amp; Projectie
            </Kicker>
            <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
              {fc(totalValue)}
            </p>
          </div>
        </button>

        {/* ── Content ── */}
        {insightOpen && (
          <div className="grid gap-3 sm:gap-6 lg:grid-cols-2 p-4 sm:p-6">
            {/* Allocation donut */}
            <section>
              <Kicker>Verdeling</Kicker>
              <p className="mt-2 text-[11px] text-[var(--ink-3)] italic">
                <GlossaryTerm term="diversificatie">Diversificatie</GlossaryTerm> over meerdere typen verlaagt risico.
              </p>
              <div className="mt-4 flex items-center gap-6">
                <AllocationPie byType={byType} total={totalValue} dailyExpenses={dailyExpenses} />
                <div className="flex-1 space-y-2">
                  {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((type) => {
                    const data = byType[type]
                    if (!data || data.total === 0) return null
                    const pct = totalValue > 0 ? (data.total / totalValue) * 100 : 0
                    return (
                      <div key={type} className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-sm"
                          style={{ backgroundColor: ASSET_TYPE_COLORS[type] }}
                        />
                        <span className="flex-1 text-xs text-[var(--ink-2)]">{ASSET_TYPE_LABELS[type]}</span>
                        <span className="text-xs font-medium text-[var(--ink)]">{pct.toFixed(0)}%</span>
                        <span className="text-xs text-[var(--ink-3)]">{fc(data.total)}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>

            {/* Projection chart */}
            <section data-testid="portfolio-projection-section">
              <div className="flex items-center justify-between">
                <Kicker>Projectie</Kicker>
                <div className="flex items-center gap-1" data-testid="projection-year-buttons">
                  {[5, 10, 20, 30].map((y) => (
                    <button
                      key={y}
                      onClick={(e) => { e.stopPropagation(); setProjectionYears(y) }}
                      data-testid={`projection-year-${y}`}
                      className={`rounded-md px-2 py-1 text-xs font-medium ${
                        projectionYears === y
                          ? 'bg-kern-100 text-kern-700'
                          : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                      }`}
                    >
                      {y}j
                    </button>
                  ))}
                </div>
              </div>
              <ProjectionChart data={projection} currentValue={totalValue} />
              <div className="mt-3 flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5 text-positive" />
                  <span className="text-[var(--ink-3)]">Verwachte groei:</span>
                  <span className="font-medium text-positive" data-testid="projected-growth">+{fc(projectedGrowth)}</span>
                </div>
              </div>
              {/* Contextual projection message */}
              {projection.length > 0 && (
                <p className="mt-3 text-xs text-[var(--ink-3)] leading-relaxed" data-testid="projection-context-message">
                  {totalMonthlyContrib > 0
                    ? `Met je huidige inleg van ${fc(totalMonthlyContrib)}/maand groeit je portfolio naar ${fc(futureValue)} in ${projectionYears} jaar`
                    : `Zonder extra inleg groeit je portfolio naar ${fc(futureValue)} in ${projectionYears} jaar`}
                  {dailyExpenses > 0 && futureValue > 0 && (
                    <span className="text-positive font-medium">
                      {' — '}dat is {formatFreedomTimeString(calculateFreedomTime(futureValue, dailyExpenses), 'long')} vrijheid
                    </span>
                  )}
                </p>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Grouped asset cards — grid per categorie, conform /core/assets/[type].
          Elke categorie krijgt een klikbare header die doorlinkt naar de
          categorie-pagina. De "+" kaart aan het einde van elk grid opent de
          QuickAddWizard met dat type voor-geselecteerd. */}
      <section className="mt-3 sm:mt-6 space-y-6">
        {activeAssets.length === 0 && (
          <QuickAddEmptyState
            intent="asset"
            onAdd={() => setQuickAddOpen(true)}
            onImport={() => setAangifteImportOpen(true)}
          />
        )}

        {/* Eenvoudig — compacte pill-lijst i.p.v. het kaart-grid. Zelfde
            groepering/anker/href/totaal; alleen het lijst-blok wisselt. */}
        {simple && activeAssets.length > 0 && assetPillItems.length > 0 && (
          <>
            <p
              className="text-[13px] italic text-[var(--ink-3)] pl-4"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)', borderLeft: '2px solid var(--module-active-500)' }}
            >
              Je opgebouwde vrijheid, post voor post.
            </p>
            <EenvoudigPillList items={assetPillItems} variant="asset" />
          </>
        )}

        {!simple && (Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((type) => {
          // Client-side filter: verberg alle types behalve het geselecteerde.
          if (assetTypeFilter && type !== assetTypeFilter) return null
          const group = byType[type]
          if (!group || group.assets.length === 0) return null
          const groupColor = ASSET_TYPE_COLORS[type]
          const groupIcon = ASSET_TYPE_ICONS[type]

          return (
            <div key={type} id={`asset-group-${type}`} className="scroll-mt-24">
              {/* Group header — gedeelde component (zie debts/page.tsx):
                  icoon + label + chevron = link naar /core/assets/[type]. */}
              <CategoryGroupHeader
                href={type === 'cash' ? '/overzicht/cashflow' : `/core/assets/${type}`}
                label={ASSET_TYPE_LABELS[type]}
                iconName={groupIcon}
                iconColor={groupColor}
                total={group.total}
              />

              {/* Asset cards — zelfde grid + cards als /core/assets/[type].
                  KPI-strip, sparkline-overlay, connection-badge en app-chip
                  worden door VermogenAssetCard zelf gerenderd zodra de props
                  aanwezig zijn. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.assets.map((asset, idx) => (
                  <VermogenAssetCard
                    key={asset.id}
                    asset={asset}
                    kpiPair={kpiByAssetId.get(asset.id)}
                    connection={connectionsByAssetId[asset.id]}
                    sparklineValues={assetSparklines[asset.id]}
                    onClick={handleAssetClick}
                    onEditClick={handleAssetEdit}
                    onRevalueClick={handleAssetRevalue}
                    staggerIndex={idx}
                    perspective={perspective}
                    partnerName={hhContext.partnerName}
                    provenance={asset._provenance}
                    shareFraction={asset._myShareFraction}
                    aggregated={asset._aggregated}
                    hideActions={type === 'cash'}
                  />
                ))}
                <AddCategoryCard
                  label={addAssetCta(type)}
                  onClick={() => { setQuickAddInitialType(type); setQuickAddOpen(true) }}
                  variant="asset"
                  shape="item"
                  staggerIndex={group.assets.length}
                  ariaLabel={`Voeg item toe aan ${ASSET_TYPE_LABELS[type]}`}
                />
              </div>
            </div>
          )
        })}

        {/* Van je partner — privacy='totalen' levert één aggregaat-kaart per
            categorie (geen asset_type), die buiten de type-groepen valt. Apart
            tonen zodat het partner-aandeel zichtbaar is in huishouden/partner-view. */}
        {!simple && !assetTypeFilter && partnerAggregateAssets.length > 0 && (
          <div id="asset-group-partner" className="scroll-mt-24">
            <div className="flex items-center gap-2 pt-2 pb-2.5">
              <span className="text-horizon-600"><Users className="h-4 w-4" /></span>
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                {hhContext.partnerName ? `Van ${hhContext.partnerName}` : 'Van je partner'}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {partnerAggregateAssets.map((asset, idx) => (
                <VermogenAssetCard
                  key={asset.id}
                  asset={asset}
                  onClick={handleAssetClick}
                  onEditClick={handleAssetEdit}
                  onRevalueClick={handleAssetRevalue}
                  staggerIndex={idx}
                  perspective={perspective}
                  partnerName={hhContext.partnerName}
                  provenance={asset._provenance}
                  shareFraction={asset._myShareFraction}
                  aggregated={asset._aggregated}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Asset detail/edit/revalue — uniforme slide-in pane (driewegregel
          kind="pane"). Vervangt de oude BottomSheet-tripple (detail / edit /
          revalue) zodat deze overzicht-pagina dezelfde flow gebruikt als
          `/core/assets/[type]`. Pane laadt zelf side-data (valuations,
          mortgages, allAssets, bankAccounts, connection, holdings) en kan
          daardoor in elke context worden ingezet. */}
      <AssetPane
        asset={selectedAsset}
        onClose={() => setSelectedAssetId(null)}
        onChanged={() => {
          loadAssets()
          router.refresh()
        }}
      />

      {/* Direct herwaardering — geopend door de "Herwaarderen"-knop op een
          kaart. Sibling sheet (driewegregel kind="sheet"): single-form,
          retour-context behouden. Slaat de pane bewust over zodat één klik
          direct in de invoer-modal landt. */}
      {revalueAsset && (
        <ValuationModal
          entityId={revalueAsset.id}
          entityType="asset"
          entityName={revalueAsset.name}
          entitySubtype={revalueAsset.asset_type}
          netWorthInclusionPct={revalueAsset.net_worth_inclusion_pct ?? 100}
          currentValue={Number(revalueAsset.current_value)}
          onClose={() => setRevalueAsset(null)}
          onSaved={() => {
            setRevalueAsset(null)
            loadAssets()
            router.refresh()
          }}
        />
      )}


      {/* New asset form */}
      {showForm && (
        <AssetForm
          asset={editAsset ?? undefined}
          defaultType={newAssetType ?? undefined}
          linkedBankAccounts={linkedBankAccounts}
          budgetingActive={budgetingActive}
          dailyExpenses={dailyExpenses}
          onClose={() => { setShowForm(false); setEditAsset(null); setNewAssetType(null) }}
          onSaved={(result) => {
            setShowForm(false)
            setEditAsset(null)
            setNewAssetType(null)
            // Part B: na het AANMAKEN van een nieuwe eigen woning de hypotheek-
            // vervolgvraag tonen. Niet bij bewerken (daar bestaat de koppel-
            // sectie al in de detail-pane).
            if (result?.isNew && result.assetType === 'eigen_huis' && result.assetId) {
              setMortgageLinkPrompt({ assetId: result.assetId, assetName: result.assetName })
            }
            loadAssets().then(async () => {
              const supabase = createClient()
              const { data } = await supabase.from('profiles').select('budgeting_active, net_monthly_income, estimated_monthly_expenses').single()
              const nowInactive = data?.budgeting_active === false
              setBudgetingActive(!nowInactive)
              if (nowInactive && (!data?.net_monthly_income || !data?.estimated_monthly_expenses)) {
                router.push('/core?showEstimates=true')
              }
            })
          }}
        />
      )}

      <QuickAddWizard
        open={quickAddOpen}
        onClose={() => { setQuickAddOpen(false); setQuickAddInitialType(null) }}
        initialIntent="asset"
        initialAssetType={quickAddInitialType ?? undefined}
        onSaved={() => router.refresh()}
      />

      {/* Part B: hypotheek-vervolgvraag bij een nieuw aangemaakte eigen woning.
          Hergebruikt StepLinkDebt; bij "Ja" opent de hypotheek-quick-add met
          het verse asset-id als linked_asset_id (ownership server-side geborgd). */}
      <BottomSheet
        open={mortgageLinkPrompt !== null}
        onClose={() => setMortgageLinkPrompt(null)}
        title="Gekoppelde schuld"
        size="md"
      >
        {mortgageLinkPrompt && (
          <div className="p-5 sm:p-6">
            <StepLinkDebt
              assetType="eigen_huis"
              assetName={mortgageLinkPrompt.assetName}
              onYes={() => {
                setMortgageWizardAssetId(mortgageLinkPrompt.assetId)
                setMortgageLinkPrompt(null)
              }}
              onNo={() => setMortgageLinkPrompt(null)}
            />
          </div>
        )}
      </BottomSheet>

      <QuickAddWizard
        open={mortgageWizardAssetId !== null}
        onClose={() => setMortgageWizardAssetId(null)}
        initialIntent="debt"
        initialDebtType="mortgage"
        initialLinkedAssetId={mortgageWizardAssetId ?? undefined}
        onSaved={() => { setMortgageWizardAssetId(null); loadAssets(); router.refresh() }}
      />

      <AangifteImportPane
        open={aangifteImportOpen}
        onClose={() => setAangifteImportOpen(false)}
        mode="direct-import"
        onImported={() => router.refresh()}
      />
    </div>
  )
}

// ── Asset detail modal ───────────────────────────────────────

/**
 * Shape die `AssetDetailModal` (in `embedded`-mode) en `AssetForm` (idem)
 * publiceren naar hun pane-wrapper, zodat de pane-footer/header de juiste
 * acties kan tonen zonder zelf de interne form-state te kennen.
 *
 * Pattern hergebruikt uit `event-pane-edit.tsx` (`EventEditActionsState`):
 * een ref-gebaseerde save-handler voorkomt dat we de callback-identity
 * elke render hoeven te ontkoppelen van een nieuwe closure.
 */
/**
 * Resultaat dat `AssetForm.onSaved` na een succesvolle save doorgeeft. Stelt de
 * host in staat een vervolg-actie te tonen — m.n. de hypotheek-vervolg-CTA bij
 * een nieuw aangemaakte eigen woning (alleen bij `isNew`, niet bij bewerken).
 */
export type AssetSavedResult = {
  assetId?: string
  isNew: boolean
  assetType: AssetType
  assetName: string
}

export type AssetEditActionsState = {
  canSave: boolean
  saving: boolean
  isEditing: boolean
  /** Roept de meest recente save-handler aan (via ref). */
  save: () => void
}

export function AssetDetailModal({
  asset,
  valuations,
  mortgage,
  dailyExpenses,
  allAssets,
  cryptoHoldings,
  investmentHoldings,
  onClose,
  onEdit,
  onRevalue,
  onDelete,
  embedded = false,
}: {
  asset: Asset
  valuations: Valuation[] | undefined
  mortgage: { name: string; balance: number } | null
  dailyExpenses: number
  allAssets?: Asset[]
  /**
   * Typed crypto-holdings die bij dit asset horen (R5). Geladen door
   * `<AssetDetailFlow />` via `loadCryptoHoldingsForAsset()`. Bij `undefined`
   * is de fetch nog niet gedaan; bij `[]` zijn er gewoon 0 holdings (legitiem
   * voor handmatig ingevoerde "Crypto-portfolio €X" zonder details).
   */
  cryptoHoldings?: import('@/lib/crypto-holdings-data').CryptoHoldingRow[]
  /**
   * Typed investment-holdings (R5). Zelfde semantiek als `cryptoHoldings`.
   */
  investmentHoldings?: import('@/lib/investment-holdings-data').InvestmentHoldingRow[]
  onClose: () => void
  onEdit: () => void
  onRevalue: () => void
  onDelete: () => void
  /**
   * Wanneer true rendert deze component alleen de body (geen `BottomSheet`
   * wrapper, geen interne actie-bar). De pane-wrapper levert de overlay
   * en footer-knoppen via `<ShellOverlay kind="pane">`. Default false
   * zodat bestaande call-sites (bv. `/core/assets`) ongewijzigd blijven.
   */
  embedded?: boolean
}) {
  const fc = useFc()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [hasActiveHoldings, setHasActiveHoldings] = useState(false)
  const [holdingsCount, setHoldingsCount] = useState(0)
  // Stabiele "nu" voor remaining-time-berekeningen verderop. Wordt eenmaal
  // bij mount vastgelegd zodat render-purity (react-hooks/purity) gerespecteerd
  // wordt; voor een detail-modal is sub-seconde precisie niet relevant.
  const [nowMs] = useState(() => Date.now())
  const value = Number(asset.current_value)
  const purchase = Number(asset.purchase_value)
  const returnPct = purchase > 0 ? ((value - purchase) / purchase) * 100 : 0
  const icon = ASSET_TYPE_ICONS[asset.asset_type] ?? 'Briefcase'
  const color = ASSET_TYPE_COLORS[asset.asset_type]
  const isEigenHuis = asset.asset_type === 'eigen_huis'

  // Check if this asset has active holdings (portfolio tracker is source of truth)
  useEffect(() => {
    if (['investment', 'crypto', 'savings', 'retirement'].includes(asset.asset_type)) {
      fetch(`/api/assets/has-holdings?asset_id=${asset.id}`)
        .then(res => res.json())
        .then(data => {
          setHasActiveHoldings(data.has_holdings === true)
          setHoldingsCount(data.holdings_count || 0)
        })
        .catch(() => { /* non-critical */ })
    }
  }, [asset.id, asset.asset_type])

  // DGA-lening tracking for deelneming assets
  const isDeelneming = asset.asset_type === 'deelneming'
  const [linkedDebts, setLinkedDebts] = useState<{ id: string; name: string; current_balance: number }[]>([])
  const [allDebts, setAllDebts] = useState<{ id: string; name: string; current_balance: number; linked_asset_id: string | null }[]>([])
  const [totalDgaLeningen, setTotalDgaLeningen] = useState(0)
  const [showLinkDropdown, setShowLinkDropdown] = useState(false)
  const WET_EXCESSIEF_LENEN_DREMPEL = 500_000
  const WET_EXCESSIEF_LENEN_WAARSCHUWING = 400_000

  useEffect(() => {
    if (!isDeelneming) return
    const sb = createClient()
    Promise.all([
      sb.from('debts').select('id, name, current_balance').eq('linked_asset_id', asset.id).eq('is_active', true),
      sb.from('debts').select('id, name, current_balance, linked_asset_id').eq('is_active', true),
      sb.from('assets').select('id').eq('asset_type', 'deelneming').eq('is_active', true),
    ]).then(([linkedRes, allRes, deelnemingRes]) => {
      setLinkedDebts(linkedRes.data ?? [])
      setAllDebts(allRes.data ?? [])
      const deelIds = new Set((deelnemingRes.data ?? []).map((a: { id: string }) => a.id))
      const tot = (allRes.data ?? [])
        .filter((d: { linked_asset_id: string | null }) => d.linked_asset_id && deelIds.has(d.linked_asset_id))
        .reduce((s: number, d: { current_balance: number }) => s + Number(d.current_balance), 0)
      setTotalDgaLeningen(tot)
    })
  }, [asset.id, isDeelneming])

  const linkDebt = async (debtId: string) => {
    const sb = createClient()
    await sb.from('debts').update({ linked_asset_id: asset.id }).eq('id', debtId)
    const { data } = await sb.from('debts').select('id, name, current_balance').eq('linked_asset_id', asset.id).eq('is_active', true)
    setLinkedDebts(data ?? [])
    setAllDebts(prev => prev.map(d => d.id === debtId ? { ...d, linked_asset_id: asset.id } : d))
    setTotalDgaLeningen(prev => prev + Number(allDebts.find(d => d.id === debtId)?.current_balance ?? 0))
    setShowLinkDropdown(false)
  }

  const unlinkDebt = async (debtId: string) => {
    const sb = createClient()
    await sb.from('debts').update({ linked_asset_id: null }).eq('id', debtId)
    const bal = Number(linkedDebts.find(d => d.id === debtId)?.current_balance ?? 0)
    setLinkedDebts(prev => prev.filter(d => d.id !== debtId))
    setAllDebts(prev => prev.map(d => d.id === debtId ? { ...d, linked_asset_id: null } : d))
    setTotalDgaLeningen(prev => prev - bal)
  }

  const availableDebts = allDebts.filter(d => !d.linked_asset_id)

  // Body-renderer — gedeeld tussen standalone (BottomSheet) en embedded
  // (pane-content) modi. Houdt dezelfde DOM-structuur, alleen de buitenste
  // wrapper verschilt zodat de pane-driewegregel respecteerd blijft.
  const body = (
    <>
        {/* Subheader */}
        <div className="flex items-center gap-3 px-6 pb-2">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)]"
            style={{ backgroundColor: color + '15' }}
          >
            <BudgetIcon name={icon} className="h-5 w-5" />
          </div>
          <p className="text-xs text-[var(--ink-3)]">
            {ASSET_TYPE_LABELS[asset.asset_type]}
            {asset.subtype && ASSET_SUBTYPE_LABELS[asset.asset_type]?.[asset.subtype]
              ? ` \u2022 ${ASSET_SUBTYPE_LABELS[asset.asset_type]![asset.subtype]}`
              : ''}
            {asset.institution ? ` \u2022 ${asset.institution}` : ''}
          </p>
        </div>

        {/* Value highlight — editorial blueprint met HighlightMark */}
        <div className="border-b border-[var(--border-ed)] px-6 py-5 text-center">
          {(isEigenHuis || asset.asset_type === 'levensverzekering' || asset.asset_type === 'vordering') && (
            <div className="mb-2 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)]">
              <span
                aria-hidden
                className="inline-block w-5 h-px"
                style={{ background: 'var(--module-active-500)' }}
              />
              {isEigenHuis && 'Marktwaarde'}
              {asset.asset_type === 'levensverzekering' && 'Afkoopwaarde'}
              {asset.asset_type === 'vordering' && 'Uitstaand bedrag'}
            </div>
          )}
          <p
            className="text-[32px] sm:text-[40px] font-black leading-none tracking-[-0.02em] tabular-nums text-[var(--ink)]"
            style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
          >
            <span
              className="inline px-1"
              style={{
                backgroundImage:
                  'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
              }}
            >
              {fc(value)}
            </span>
          </p>
          {dailyExpenses > 0 && value > 0 && (
            <p
              className="mt-1.5 italic text-[12px] text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              data-testid="detail-value-freedom"
            >
              {formatFreedomTimeString(calculateFreedomTime(value, dailyExpenses), 'long')} vrijheid
            </p>
          )}
          {purchase > 0 && (
            <p className={`mt-2 text-sm font-medium tabular-nums ${returnPct >= 0 ? 'text-positive' : 'text-negative'}`}>
              {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}% ({returnPct >= 0 ? '+' : ''}{fc(value - purchase)})
              {dailyExpenses > 0 && Math.abs(value - purchase) > 0 && (
                <span className={`ml-1 text-xs ${returnPct >= 0 ? 'text-positive/60' : 'text-negative/60'}`} data-testid="detail-return-freedom">
                  — {(() => {
                    const fd = calculateFreedomTime(Math.abs(value - purchase), dailyExpenses)
                    return formatFreedomTimeString(fd, 'short', true)
                  })()} {returnPct >= 0 ? 'gewonnen' : 'verloren'}
                </span>
              )}
            </p>
          )}
          {/* Badges */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            {asset.risk_profile && (
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                asset.risk_profile === 'laag' ? 'bg-positive/15 text-positive' :
                asset.risk_profile === 'middel' ? 'bg-kern-100 text-kern-700' :
                'bg-negative/15 text-negative'
              }`}>
                Risico: {RISK_PROFILE_LABELS[asset.risk_profile]}
              </span>
            )}
            {asset.is_liquid === true && (
              <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">Liquide</span>
            )}
            {asset.is_liquid === false && (
              <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-[var(--ink-2)]">Vastgezet</span>
            )}
            {asset.tax_benefit && (
              <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">Fiscaal voordeel</span>
            )}
          </div>
        </div>

        {/* Details grid */}
        <div className="space-y-4 px-6 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">{isEigenHuis ? 'Aankoopprijs' : asset.asset_type === 'vordering' ? 'Oorspronkelijke hoofdsom' : 'Aankoopwaarde'}</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{purchase > 0 ? fc(purchase) : '-'}</p>
            </div>
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">{asset.asset_type === 'vordering' ? 'Rentepercentage' : 'Verwacht rendement'}</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{Number(asset.expected_return)}% p.j.</p>
            </div>
            {!isEigenHuis && (
              <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
                <p className="text-xs text-[var(--ink-3)]">{asset.asset_type === 'vordering' ? 'Maandelijkse aflossing' : asset.asset_type === 'levensverzekering' ? 'Maandelijkse premie' : 'Maandelijkse inleg'}</p>
                <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">
                  {Number(asset.monthly_contribution) > 0 ? fc(Number(asset.monthly_contribution)) : '-'}
                </p>
              </div>
            )}
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Aankoopdatum</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">
                {asset.purchase_date
                  ? new Date(asset.purchase_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
                  : '-'}
              </p>
            </div>
          </div>

          {/* Hypotheek + overwaarde (eigen woning) */}
          {isEigenHuis && (
            <div className="rounded-[var(--r)] border border-kern-200 bg-kern-50/50 p-3 space-y-2">
              <p className="text-xs font-semibold text-kern-700/60 uppercase">Hypotheek</p>
              {mortgage ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--ink-2)]">{mortgage.name}</span>
                    <span className="text-sm font-medium text-[var(--ink)]">{fc(mortgage.balance)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-kern-200/60 pt-2">
                    <span className="text-xs font-medium text-[var(--ink-2)]">Overwaarde</span>
                    {(() => {
                      const overwaarde = value - mortgage.balance
                      return (
                        <span className={`text-sm font-bold ${overwaarde >= 0 ? 'text-positive' : 'text-negative'}`}>
                          {fc(overwaarde)}
                        </span>
                      )
                    })()}
                  </div>
                </>
              ) : (
                <p className="text-xs text-[var(--ink-3)]">Geen hypotheek gekoppeld. Koppel een hypotheek via Overzicht &gt; Schulden.</p>
              )}
            </div>
          )}

          {/* DGA-lening section for deelneming assets */}
          {isDeelneming && (
            <div className="rounded-[var(--r)] border border-teal-200 bg-teal-50/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-teal-700/80 uppercase">Gekoppelde DGA-lening</p>
                {availableDebts.length > 0 && (
                  <button
                    onClick={() => setShowLinkDropdown(!showLinkDropdown)}
                    className="flex items-center gap-1 rounded-[var(--r)] bg-teal-100 px-2 py-1 text-[10px] font-medium text-teal-700 hover:bg-teal-200 transition-colors"
                  >
                    <LinkIcon className="h-3 w-3" /> Koppel schuld
                  </button>
                )}
              </div>

              {/* Link dropdown */}
              {showLinkDropdown && availableDebts.length > 0 && (
                <div className="rounded-[var(--r)] border border-teal-200 bg-white p-2 space-y-1">
                  <p className="text-[10px] text-[var(--ink-3)] mb-1">Selecteer een schuld om te koppelen:</p>
                  {availableDebts.map(d => (
                    <button
                      key={d.id}
                      onClick={() => linkDebt(d.id)}
                      className="flex w-full items-center justify-between rounded-[var(--r)] px-2 py-1.5 text-xs hover:bg-teal-50 transition-colors"
                    >
                      <span className="text-[var(--ink)]">{d.name}</span>
                      <span className="font-mono tabular-nums text-[var(--ink-2)]">{fc(d.current_balance)}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Linked debts list */}
              {linkedDebts.length > 0 ? (
                <div className="space-y-1.5">
                  {linkedDebts.map(d => (
                    <div key={d.id} className="flex items-center justify-between">
                      <span className="text-xs text-[var(--ink-2)]">{d.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums text-sm font-medium text-[var(--ink)]">{fc(d.current_balance)}</span>
                        <button
                          onClick={() => unlinkDebt(d.id)}
                          className="rounded p-0.5 text-[var(--ink-4)] hover:text-negative hover:bg-negative/10 transition-colors"
                          title="Ontkoppel"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--ink-3)]">
                  Geen DGA-lening gekoppeld. Koppel een schuld uit Overzicht &gt; Schulden.
                </p>
              )}

              {/* Wet excessief lenen warnings */}
              {totalDgaLeningen > 0 && (
                <div className="border-t border-teal-200/60 pt-2 mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--ink-2)]">Totaal DGA-leningen</span>
                    <span className="font-mono tabular-nums font-medium text-[var(--ink)]">{fc(totalDgaLeningen)}</span>
                  </div>

                  {totalDgaLeningen >= WET_EXCESSIEF_LENEN_DREMPEL && (
                    <div className="mt-2 flex items-start gap-2 rounded-[var(--r)] bg-negative/10 border border-negative/30 px-3 py-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-negative" />
                      <div>
                        <p className="text-xs font-medium text-negative">
                          Wet excessief lenen: drempel overschreden
                        </p>
                        <p className="text-[10px] text-negative mt-0.5">
                          Uw totale DGA-leningen ({fc(totalDgaLeningen)}) overschrijden de drempel van {fc(WET_EXCESSIEF_LENEN_DREMPEL)}. Het meerdere wordt belast als fictief regulier voordeel in Box 2.
                        </p>
                        <a
                          href="https://www.belastingdienst.nl/wps/wcm/connect/nl/box-2/content/excessief-lenen"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-[10px] font-medium text-negative underline hover:text-negative/80"
                        >
                          Meer informatie over Wet excessief lenen →
                        </a>
                      </div>
                    </div>
                  )}

                  {totalDgaLeningen >= WET_EXCESSIEF_LENEN_WAARSCHUWING && totalDgaLeningen < WET_EXCESSIEF_LENEN_DREMPEL && (
                    <div className="mt-2 flex items-start gap-2 rounded-[var(--r)] bg-amber-50 border border-amber-200 px-3 py-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <div>
                        <p className="text-xs font-medium text-amber-700">
                          Wet excessief lenen: nadert drempel
                        </p>
                        <p className="text-[10px] text-amber-600 mt-0.5">
                          Uw totale DGA-leningen ({fc(totalDgaLeningen)}) naderen de drempel van {fc(WET_EXCESSIEF_LENEN_DREMPEL)}. Boven deze drempel wordt het meerdere belast als fictief regulier voordeel in Box 2.
                        </p>
                        <a
                          href="https://www.belastingdienst.nl/wps/wcm/connect/nl/box-2/content/excessief-lenen"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-[10px] font-medium text-amber-700 underline hover:text-amber-800"
                        >
                          Meer informatie over Wet excessief lenen →
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Type-specific details */}
          {(() => {
            const details: { label: string; value: string }[] = []
            if (asset.ticker_symbol) details.push({ label: 'Ticker / ISIN', value: asset.ticker_symbol })
            if (asset.address_postcode || asset.address_house_number) details.push({ label: 'Adres', value: `${asset.address_postcode ?? ''} ${asset.address_house_number ?? ''}`.trim() })
            if (asset.woz_value) details.push({ label: 'WOZ-waarde', value: fc(Number(asset.woz_value)) })
            if (asset.rental_income) details.push({ label: 'Huurinkomsten p/m', value: fc(Number(asset.rental_income)) })
            if (asset.retirement_provider_type) details.push({ label: 'Pensioenuitvoerder', value: RETIREMENT_PROVIDER_LABELS[asset.retirement_provider_type] })
            if (asset.depreciation_rate != null && asset.depreciation_rate !== 0) details.push({ label: 'Afschrijving p/j', value: `${asset.depreciation_rate}%` })
            if (asset.lock_end_date) {
              const lockEnd = new Date(asset.lock_end_date)
              const formatted = lockEnd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
              if (asset.asset_type === 'vordering') {
                const diffMs = lockEnd.getTime() - nowMs
                const remaining = diffMs <= 0 ? '(afgelopen)' : (() => {
                  const y = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000))
                  const m = Math.floor((diffMs % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000))
                  if (y > 0) return `(nog ${y} jaar${m > 0 ? ` en ${m} mnd` : ''})`
                  return `(nog ${m} maanden)`
                })()
                details.push({ label: 'Einddatum lening', value: `${formatted} ${remaining}` })
              } else {
                details.push({ label: 'Vastgezet tot', value: formatted })
              }
            }
            // Levensverzekering-specific fields
            if (asset.expiry_date) {
              const endDate = new Date(asset.expiry_date)
              const formatted = endDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
              const diffMs = endDate.getTime() - nowMs
              const remaining = diffMs <= 0 ? '(verlopen)' : (() => {
                const y = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000))
                const m = Math.floor((diffMs % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000))
                if (y > 0) return `(nog ${y} jaar${m > 0 ? ` en ${m} mnd` : ''})`
                return `(nog ${m} maanden)`
              })()
              details.push({ label: 'Einddatum polis', value: `${formatted} ${remaining}` })
            }
            if (asset.beneficiary) details.push({ label: 'Begunstigde', value: asset.beneficiary })
            // Deelneming-specific fields
            if (asset.kvk_number) details.push({ label: 'KvK-nummer', value: asset.kvk_number })
            if (asset.ownership_percentage != null) details.push({ label: 'Belang', value: `${asset.ownership_percentage}%` })
            if (asset.annual_dividend != null && asset.annual_dividend > 0) details.push({ label: 'Jaarlijks dividend', value: fc(asset.annual_dividend) })
            if (details.length === 0) return null
            return (
              <div className="grid grid-cols-2 gap-3">
                {details.map((d) => (
                  <div key={d.label} className="rounded-[var(--r)] bg-kern-50/50 p-3">
                    <p className="text-xs text-kern-700/60">{d.label}</p>
                    <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{d.value}</p>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* DGA-lening linked deelneming */}
          {asset.asset_type === 'vordering' && asset.subtype === 'dga_lening' && asset.linked_asset_id && (() => {
            const linked = allAssets?.find(a => a.id === asset.linked_asset_id)
            if (!linked) return null
            return (
              <div className="rounded-[var(--r)] border border-teal-200 bg-teal-50/50 p-3 space-y-1">
                <p className="text-xs font-semibold text-teal-700/60 uppercase">Gekoppelde deelneming</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--ink)]">{linked.name}</span>
                  <span className="text-sm text-[var(--ink-2)]">{fc(Number(linked.current_value))}</span>
                </div>
                {linked.ownership_percentage != null && (
                  <p className="text-xs text-teal-600/80">{linked.ownership_percentage}% belang</p>
                )}
              </div>
            )
          })()}

          {asset.notes && (
            <p className="text-xs text-[var(--ink-3)]">{asset.notes}</p>
          )}

          {/* Valuation history */}
          {valuations && valuations.length > 0 && (
            <ValuationTrendSection valuations={valuations} />
          )}
          {/* No valuation history message */}
          {(!valuations || valuations.length === 0) && (
            <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/50 p-4 text-center" data-testid="no-valuation-history">
              <p className="text-xs text-[var(--ink-3)]">Nog geen waardehistorie. Gebruik &ldquo;Herwaarderen&rdquo; om de waarde bij te werken.</p>
            </div>
          )}

          {/* Holdings per asset — typed lijst voor crypto/investment (R5),
              legacy fallback voor savings/retirement zolang die nog op de
              polymorfe holdings-API draaien. */}
          {asset.asset_type === 'crypto' && (
            <TypedHoldingsSection
              assetType="crypto"
              holdings={cryptoHoldings ?? []}
              loaded={cryptoHoldings !== undefined}
            />
          )}
          {asset.asset_type === 'investment' && (
            <TypedHoldingsSection
              assetType="investment"
              holdings={investmentHoldings ?? []}
              loaded={investmentHoldings !== undefined}
            />
          )}
          {(['savings', 'retirement'] as string[]).includes(asset.asset_type) && (
            <HoldingsList assetId={asset.id} assetName={asset.name} />
          )}
        </div>

        {/* Holdings source-of-truth banner */}
        {hasActiveHoldings && (
          <div className="mx-6 mb-0 mt-2 flex items-start gap-2 rounded-[var(--r)] bg-kern-50 border border-kern-200 px-3 py-2" data-testid="holdings-source-of-truth-banner">
            <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kern-600" />
            <p className="text-xs text-kern-700">
              <strong>Portfolio tracker actief</strong> ({holdingsCount} holding{holdingsCount !== 1 ? 's' : ''}): de waarde van deze asset wordt automatisch berekend uit de holdings. Handmatig herwaarderen is uitgeschakeld.
            </p>
          </div>
        )}

        {/* Actions — alleen in standalone-mode. In embedded-mode levert de
            pane-wrapper de footer-knoppen (Bewerken + Herwaarderen) en de
            header-action (Verwijderen-icon). */}
        {!embedded && (
          <div className="flex gap-2 border-t border-[var(--border-ed)] px-6 py-4">
            <button
              onClick={hasActiveHoldings ? undefined : onRevalue}
              disabled={hasActiveHoldings}
              title={hasActiveHoldings ? 'Waarde wordt automatisch berekend uit holdings' : undefined}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r)] border px-3 py-2 text-xs font-medium ${
                hasActiveHoldings
                  ? 'border-[var(--border-ed)] text-[var(--ink-3)] cursor-not-allowed bg-[var(--subtle)]'
                  : 'border-kern-200 text-kern-700 hover:bg-kern-50'
              }`}
              data-testid="revalue-btn"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Herwaarderen
            </button>
            <button
              onClick={onEdit}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-2 text-xs font-medium text-white hover:bg-kern-700"
            >
              <Edit3 className="h-3.5 w-3.5" />
              Bewerken
            </button>
            {confirmDelete ? (
              <button
                onClick={onDelete}
                className="inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] bg-negative px-3 py-2 text-xs font-medium text-[var(--paper)] hover:bg-negative/90"
              >
                Bevestigen
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] border border-negative/30 px-3 py-2 text-xs font-medium text-negative hover:bg-negative/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
    </>
  )

  if (embedded) return body
  return (
    <BottomSheet open={true} onClose={onClose} title={asset.name} size="lg">
      {body}
    </BottomSheet>
  )
}

// ── Typed holdings section (R5) ──────────────────────────────

/**
 * Compacte holdings-lijst binnen de asset-detail-sheet voor crypto/investment-
 * assets. Hergebruikt de typed holding-cards (CryptoHoldingCard /
 * InvestmentHoldingCard) in `compact`-vorm en biedt een deeplink naar de
 * Holdings-app verdiepingstab op de bijbehorende categoriepagina voor het
 * volle arsenaal (allocation, transacties, vergelijking).
 *
 * Bewuste keuze: cards renderen we hier zonder bron-badge — die is via de
 * detail-context (de asset zelf, met plug-indicator op de naam-regel) al
 * eenduidig. Cap op de eerste 12 entries om de bottom-sheet niet uit zijn
 * voegen te laten barsten; "Open holdings (N)" verwijst door naar het volle
 * overzicht.
 */
function TypedHoldingsSection({
  assetType,
  holdings,
  loaded,
}: {
  assetType: 'crypto' | 'investment'
  holdings:
    | import('@/lib/crypto-holdings-data').CryptoHoldingRow[]
    | import('@/lib/investment-holdings-data').InvestmentHoldingRow[]
  loaded: boolean
}) {
  const fc = useFc()
  const router = useRouter()
  const visible = holdings.slice(0, 12)
  const hasMore = holdings.length > visible.length
  const totalEur = holdings.reduce((sum, h) => sum + h.valueEur, 0)

  const headerLabel = assetType === 'crypto' ? 'Coins' : 'Posities'
  const deepenSlug = assetType === 'crypto' ? 'crypto-holdings' : 'aandelen-holdings'
  const deepenLink = `/core/assets/${assetType}?tab=${deepenSlug}`

  // Loading-state: typed-holdings nog niet binnen. We tonen een lichte
  // skeleton-blokje in plaats van een spinner — past bij krant-stijl en
  // voorkomt layout-shift wanneer de data binnen ms binnenkomt.
  if (!loaded) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
            {headerLabel}
          </p>
        </div>
        <div className="h-12 w-full bg-[var(--subtle)]/60" aria-hidden="true" />
        <div className="h-12 w-full bg-[var(--subtle)]/60" aria-hidden="true" />
      </div>
    )
  }

  if (holdings.length === 0) {
    return (
      <div className="border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/40 p-4">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Geen {assetType === 'crypto' ? 'coins' : 'posities'} gekoppeld
        </p>
        <p className="mt-1 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Voeg holdings toe via een exchange-koppeling, wallet-adres of
          {assetType === 'investment' ? ' een CSV-import' : ' handmatige invoer'} om hier
          de detailsamenstelling te zien.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              router.push(
                assetType === 'crypto'
                  ? '/identity/koppelingen'
                  : '/core/assets/holdings/import',
              )
            }
            className="inline-flex h-9 items-center gap-1.5 border border-kern-300 bg-kern-50 px-3 text-[11px] font-medium text-kern-700 transition-colors hover:bg-kern-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            {assetType === 'crypto' ? 'Koppel exchange' : 'Importeer holdings'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          {headerLabel}
          <span className="ml-1.5 text-[var(--ink-3)]">({holdings.length})</span>
        </p>
        <p className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">
          {fc(totalEur)}
        </p>
      </div>

      <div className="space-y-1.5">
        {assetType === 'crypto'
          ? (visible as import('@/lib/crypto-holdings-data').CryptoHoldingRow[]).map(
              (h, idx) => (
                <CryptoHoldingCard
                  key={h.id}
                  holding={h}
                  staggerIndex={idx}
                  size="compact"
                  onClick={(holding) =>
                    router.push(`/core/assets/crypto/${holding.id}`)
                  }
                />
              ),
            )
          : (
              visible as import('@/lib/investment-holdings-data').InvestmentHoldingRow[]
            ).map((h, idx) => (
              <InvestmentHoldingCard
                key={h.id}
                holding={h}
                staggerIndex={idx}
                size="compact"
                onClick={(holding) =>
                  router.push(`/core/assets/investment/${holding.id}`)
                }
              />
            ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => router.push(deepenLink)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-kern-700 hover:text-kern-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          Open holdings
          {hasMore && <span className="text-[var(--ink-4)]">({holdings.length})</span>}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </button>
        {hasMore && (
          <p className="text-[10px] tabular-nums text-[var(--ink-4)]">
            +{holdings.length - visible.length} meer
          </p>
        )}
      </div>
    </div>
  )
}

// ── Mini sparkline for asset cards ───────────────────────────

function MiniSparkline({
  valuations,
  className = '',
}: {
  valuations: Valuation[]
  className?: string
}) {
  if (valuations.length < 2) return null

  const values = valuations.map(v => Number(v.value))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const W = 64
  const H = 24
  const PAD = 2

  const points = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2)
    return `${x},${y}`
  })

  const trend = values[values.length - 1] >= values[0]
  const strokeColor = trend ? 'var(--positive)' : 'var(--negative)'

  // Create gradient fill
  const fillPoints = [
    `${PAD},${H - PAD}`,
    ...points,
    `${PAD + ((values.length - 1) / (values.length - 1)) * (W - PAD * 2)},${H - PAD}`,
  ]

  return (
    <div className={`shrink-0 ${className}`} data-testid="asset-card-sparkline">
      <svg viewBox={`0 0 ${W} ${H}`} width={64} height={24} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`sparkFill-${trend ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon
          points={fillPoints.join(' ')}
          fill={`url(#sparkFill-${trend ? 'up' : 'down'})`}
        />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Last point dot */}
        {(() => {
          const lastIdx = values.length - 1
          const x = PAD + (lastIdx / (values.length - 1)) * (W - PAD * 2)
          const y = H - PAD - ((values[lastIdx] - min) / range) * (H - PAD * 2)
          return <circle cx={x} cy={y} r="2" fill={strokeColor} />
        })()}
      </svg>
    </div>
  )
}

// ── Valuation trend section for detail modal ─────────────────

function ValuationTrendSection({ valuations }: { valuations: Valuation[] }) {
  const fc = useFc()
  const { ref: chartRef, hasEntered: chartEntered } = useInViewAnimation({ duration: 600 })
  const [showAll, setShowAll] = useState(false)
  const INITIAL_SHOW = 10

  const sorted = useMemo(
    () => [...valuations].sort((a, b) => a.valuation_date.localeCompare(b.valuation_date)),
    [valuations],
  )

  // Reverse sorted for history list (newest first)
  const historyList = useMemo(
    () => [...valuations].sort((a, b) => b.valuation_date.localeCompare(a.valuation_date)),
    [valuations],
  )

  const displayedHistory = showAll ? historyList : historyList.slice(0, INITIAL_SHOW)
  const hasMore = historyList.length > INITIAL_SHOW

  // Line chart dimensions
  const W = 380
  const H = 140
  const PAD = { top: 10, right: 10, bottom: 25, left: 55 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const values = sorted.map(v => Number(v.value))
  const min = Math.min(...values) * 0.95
  const max = Math.max(...values) * 1.05
  const range = max - min || 1

  function xPos(i: number) {
    return PAD.left + (sorted.length === 1 ? chartW / 2 : (i / (sorted.length - 1)) * chartW)
  }
  function yPos(val: number) {
    return PAD.top + chartH - ((val - min) / range) * chartH
  }

  const trend = values.length >= 2 && values[values.length - 1] >= values[0]
  const strokeColor = trend ? 'var(--positive)' : 'var(--negative)'
  const fillColor = trend ? 'var(--positive)' : 'var(--negative)'

  // Chart line path
  const linePath = sorted.length === 1
    ? ''
    : `M ${sorted.map((_, i) => `${xPos(i).toFixed(1)} ${yPos(values[i]).toFixed(1)}`).join(' L ')}`

  // Area fill path
  const areaPath = sorted.length === 1
    ? ''
    : `${linePath} L ${xPos(sorted.length - 1).toFixed(1)} ${(PAD.top + chartH).toFixed(1)} L ${xPos(0).toFixed(1)} ${(PAD.top + chartH).toFixed(1)} Z`

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => min + t * range)

  // X-axis labels (show max 5 labels)
  const labelStep = Math.max(1, Math.floor(sorted.length / 5))

  return (
    <div data-testid="valuation-trend-section">
      <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Waardehistorie ({valuations.length} metingen)</p>

      {/* Line chart */}
      {sorted.length >= 2 ? (
        <div ref={chartRef} className="mb-3 rounded-[var(--r)] bg-[var(--subtle)] p-3" data-testid="valuation-line-chart">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" preserveAspectRatio="xMidYMid meet">
            {/* Grid lines and Y labels */}
            {yTicks.map((val, i) => (
              <g key={i}>
                <line
                  x1={PAD.left}
                  y1={yPos(val)}
                  x2={W - PAD.right}
                  y2={yPos(val)}
                  stroke="#e4e4e7"
                  strokeWidth="0.5"
                />
                <text x={PAD.left - 6} y={yPos(val) + 3} textAnchor="end" fontSize="7" fill="#a1a1aa">
                  {val >= 1000 ? `€${(val / 1000).toFixed(0)}k` : `€${val.toFixed(0)}`}
                </text>
              </g>
            ))}

            {/* Area fill */}
            <path d={areaPath} fill={fillColor}
              style={{ opacity: chartEntered ? 0.08 : 0, transition: chartEntered ? 'opacity 250ms ease-out 455ms' : 'none' }} />

            {/* Line */}
            <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              pathLength={1} strokeDasharray={1}
              style={{ strokeDashoffset: chartEntered ? undefined : 1, animation: chartEntered ? 'drawPath 600ms cubic-bezier(.22,1,.36,1) both' : 'none' }} />

            {/* Data points */}
            {sorted.map((v, i) => (
              <circle
                key={v.id}
                cx={xPos(i)}
                cy={yPos(values[i])}
                r={sorted.length <= 20 ? 3 : 2}
                fill={i === sorted.length - 1 ? strokeColor : '#a1a1aa'}
                stroke="white"
                strokeWidth="1"
              />
            ))}

            {/* X-axis date labels */}
            {sorted.filter((_, i) => i % labelStep === 0 || i === sorted.length - 1).map((v, _, arr) => {
              const idx = sorted.indexOf(v)
              return (
                <text
                  key={v.id}
                  x={xPos(idx)}
                  y={H - 4}
                  textAnchor="middle"
                  fontSize="7"
                  fill="#a1a1aa"
                >
                  {new Date(v.valuation_date).toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })}
                </text>
              )
            })}
          </svg>

          {/* Trend summary */}
          <div className="mt-1 flex items-center justify-between text-[10px]">
            <span className="text-[var(--ink-3)]">
              {new Date(sorted[0].valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' — '}
              {new Date(sorted[sorted.length - 1].valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            {(() => {
              const first = values[0]
              const last = values[values.length - 1]
              const diff = last - first
              const pct = first > 0 ? ((last - first) / first) * 100 : 0
              return (
                <span className={`font-medium ${diff >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {diff >= 0 ? '+' : ''}{fc(diff)} ({diff >= 0 ? '+' : ''}{pct.toFixed(1)}%)
                </span>
              )
            })()}
          </div>
        </div>
      ) : sorted.length === 1 ? (
        <div className="mb-3 rounded-[var(--r)] bg-[var(--subtle)] p-3 text-center" data-testid="valuation-single-point">
          <p className="text-xs text-[var(--ink-3)]">
            {fc(Number(sorted[0].value))} op{' '}
            {new Date(sorted[0].valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <p className="mt-1 text-[10px] text-[var(--ink-3)]">Voeg meer waarderingen toe voor een trendgrafiek.</p>
        </div>
      ) : null}

      {/* History list — full history, no limit */}
      <div className="space-y-1" data-testid="valuation-history-list">
        {displayedHistory.map((v) => {
          // Find previous valuation in chronological order
          const chronIdx = sorted.findIndex(s => s.id === v.id)
          const prev = chronIdx > 0 ? sorted[chronIdx - 1] : null
          const diff = prev ? Number(v.value) - Number(prev.value) : null
          return (
            <div key={v.id} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 text-[var(--ink-3)]">
                {new Date(v.valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: '2-digit' })}
              </span>
              <span className="font-medium text-[var(--ink-2)]">{fc(Number(v.value))}</span>
              {diff !== null && (
                <span className={`text-[10px] font-medium ${diff >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {diff >= 0 ? '+' : ''}{fc(diff)}
                </span>
              )}
              {v.notes && (
                <span className="truncate text-[10px] text-[var(--ink-3)]">{v.notes}</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Show more/less button */}
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-[var(--r)] py-1.5 text-xs font-medium text-kern-600 hover:bg-kern-50/50"
          data-testid="valuation-show-more"
        >
          {showAll ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Toon minder
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Toon alle {historyList.length} waarderingen
            </>
          )}
        </button>
      )}
    </div>
  )
}

// ── Holdings list for asset detail modal ─────────────────────

type AssetHolding = {
  id: string
  user_id: string
  asset_id: string | null
  ticker: string | null
  isin: string | null
  name: string
  units: number
  avg_purchase_price: number
  current_price: number | null
  last_price_update: string | null
  purchase_date: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

function HoldingsList({ assetId, assetName }: { assetId: string; assetName: string }) {
  const fc = useFc()
  const [holdings, setHoldings] = useState<AssetHolding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editHolding, setEditHolding] = useState<AssetHolding | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formTicker, setFormTicker] = useState('')
  const [formIsin, setFormIsin] = useState('')
  const [formUnits, setFormUnits] = useState('')
  const [formAvgPrice, setFormAvgPrice] = useState('')
  const [formPurchaseDate, setFormPurchaseDate] = useState('')

  const loadHoldings = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`/api/holdings?asset_id=${assetId}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setHoldings(data.holdings || [])
    } catch {
      setError('Kon holdings niet laden')
    } finally {
      setLoading(false)
    }
  }, [assetId])

  useEffect(() => {
    loadHoldings()
  }, [loadHoldings])

  function resetForm() {
    setFormName('')
    setFormTicker('')
    setFormIsin('')
    setFormUnits('')
    setFormAvgPrice('')
    setFormPurchaseDate('')
    setFormError(null)
  }

  function openEditForm(h: AssetHolding) {
    setEditHolding(h)
    setFormName(h.name)
    setFormTicker(h.ticker || '')
    setFormIsin(h.isin || '')
    setFormUnits(String(h.units))
    setFormAvgPrice(String(h.avg_purchase_price))
    setFormPurchaseDate(h.purchase_date || '')
    setFormError(null)
    setShowForm(true)
  }

  function openCreateForm() {
    setEditHolding(null)
    resetForm()
    setShowForm(true)
  }

  async function handleSave() {
    if (!formName.trim()) {
      setFormError('Naam is verplicht')
      return
    }

    setSaving(true)
    setFormError(null)

    try {
      if (editHolding) {
        // UPDATE
        const res = await fetch('/api/holdings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editHolding.id,
            name: formName.trim(),
            ticker: formTicker.trim() || null,
            units: Number(formUnits) || 1,
            avg_purchase_price: Number(formAvgPrice) || 0,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `HTTP ${res.status}`)
        }
      } else {
        // CREATE
        const res = await fetch('/api/holdings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            asset_id: assetId,
            name: formName.trim(),
            ticker: formTicker.trim() || null,
            isin: formIsin.trim() || null,
            units: Number(formUnits) || 1,
            avg_purchase_price: Number(formAvgPrice) || 0,
            current_price: Number(formAvgPrice) || 0,
            purchase_date: formPurchaseDate || null,
            force_duplicate: true, // Allow same ticker on different assets
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || data.message || `HTTP ${res.status}`)
        }
      }

      setShowForm(false)
      setEditHolding(null)
      resetForm()
      loadHoldings()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (deleting) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/holdings?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Verwijderen mislukt')
      setHoldings((prev) => prev.filter((h) => h.id !== id))
      setDeleteConfirm(null)
    } catch {
      setError('Kon holding niet verwijderen')
    } finally {
      setDeleting(null)
    }
  }

  const totalValue = holdings.reduce((sum, h) => {
    const price = h.current_price ?? h.avg_purchase_price
    return sum + price * h.units
  }, 0)

  const totalCost = holdings.reduce((sum, h) => {
    return sum + h.avg_purchase_price * h.units
  }, 0)

  return (
    <div data-testid="holdings-list-section">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between rounded-[var(--r)] bg-kern-50/50 px-3 py-2 text-left hover:bg-kern-50"
        data-testid="holdings-toggle"
      >
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-kern-600" />
          <span className="text-xs font-semibold text-[var(--ink-2)]">
            Holdings ({loading ? '…' : holdings.length})
          </span>
          {!loading && holdings.length > 0 && (
            <span className="text-xs text-[var(--ink-3)]">
              — {fc(totalValue)}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2" data-testid="holdings-list-expanded">
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-kern-500" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-[var(--r)] bg-negative/10 px-3 py-2 text-xs text-negative">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}

          {!loading && holdings.length === 0 && !showForm && (
            <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/50 p-4 text-center" data-testid="no-holdings">
              <p className="text-xs text-[var(--ink-3)]">Nog geen holdings voor dit vermogensobject.</p>
              <button
                onClick={openCreateForm}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-kern-600 hover:text-kern-700"
                data-testid="add-first-holding-btn"
              >
                <Plus className="h-3 w-3" />
                Eerste holding toevoegen
              </button>
            </div>
          )}

          {/* Holdings list */}
          {!loading && holdings.length > 0 && (
            <div className="space-y-1.5">
              {holdings.map((h) => {
                const price = h.current_price ?? h.avg_purchase_price
                const value = price * h.units
                const cost = h.avg_purchase_price * h.units
                const returnPct = cost > 0 ? ((value - cost) / cost) * 100 : 0

                return (
                  <div
                    key={h.id}
                    className="flex items-center justify-between rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2"
                    data-testid={`holding-item-${h.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-[var(--ink)] truncate">{h.name}</span>
                        {h.ticker && (
                          <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-[var(--ink-3)]">
                            {h.ticker}
                          </span>
                        )}
                        {h.isin && !h.ticker && (
                          <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-[var(--ink-3)]">
                            {h.isin}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--ink-3)]">
                        <span>{h.units} eenheden</span>
                        <span>·</span>
                        <span>Gem. {fc(h.avg_purchase_price)}</span>
                        {h.purchase_date && (
                          <>
                            <span>·</span>
                            <span>{new Date(h.purchase_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-medium text-[var(--ink)]">{fc(value)}</p>
                        <p className={`text-[10px] ${returnPct >= 0 ? 'text-positive' : 'text-negative'}`}>
                          {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
                        </p>
                      </div>
                      <div className="flex gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditForm(h) }}
                          className="rounded p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]"
                          title="Bewerken"
                          data-testid={`edit-holding-${h.id}`}
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                        {deleteConfirm === h.id ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(h.id) }}
                            className="rounded p-1 text-negative hover:bg-negative/10"
                            disabled={deleting === h.id}
                            data-testid={`confirm-delete-holding-${h.id}`}
                          >
                            {deleting === h.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <span className="text-[10px] font-medium">Ja</span>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(h.id) }}
                            className="rounded p-1 text-[var(--ink-3)] hover:bg-negative/10 hover:text-negative"
                            title="Verwijderen"
                            data-testid={`delete-holding-${h.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Summary row */}
              <div className="flex items-center justify-between border-t border-[var(--border-ed)] pt-1.5 px-3">
                <span className="text-[10px] font-medium text-[var(--ink-3)]">Totaal</span>
                <div className="text-right">
                  <span className="text-xs font-semibold text-[var(--ink)]">{fc(totalValue)}</span>
                  {totalCost > 0 && (
                    <span className={`ml-1.5 text-[10px] ${totalValue >= totalCost ? 'text-positive' : 'text-negative'}`}>
                      ({totalValue >= totalCost ? '+' : ''}{((totalValue - totalCost) / totalCost * 100).toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>

              {/* Add holding button */}
              <button
                onClick={openCreateForm}
                className="flex w-full items-center justify-center gap-1 rounded-[var(--r)] border border-dashed border-kern-200 py-1.5 text-xs font-medium text-kern-600 hover:bg-kern-50"
                data-testid="add-holding-btn"
              >
                <Plus className="h-3 w-3" />
                Holding toevoegen
              </button>
            </div>
          )}

          {/* Create / Edit form */}
          {showForm && (
            <div className="rounded-[var(--r)] border border-kern-200 bg-kern-50/30 p-3 space-y-2" data-testid="holding-form">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-[var(--ink-2)]">
                  {editHolding ? 'Holding bewerken' : 'Nieuwe holding'}
                </h4>
                <button
                  onClick={() => { setShowForm(false); setEditHolding(null); resetForm() }}
                  className="rounded p-0.5 text-[var(--ink-3)] hover:text-[var(--ink-2)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] font-medium text-[var(--ink-3)]">Naam *</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="bijv. Vanguard FTSE All-World"
                    className="mt-0.5 w-full rounded border border-[var(--border-ed)] px-2 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                    data-testid="holding-name-input"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-[var(--ink-3)]">Ticker</label>
                  <input
                    type="text"
                    value={formTicker}
                    onChange={(e) => setFormTicker(e.target.value.toUpperCase())}
                    placeholder="bijv. VWRL"
                    className="mt-0.5 w-full rounded border border-[var(--border-ed)] px-2 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                    data-testid="holding-ticker-input"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-[var(--ink-3)]">ISIN</label>
                  <input
                    type="text"
                    value={formIsin}
                    onChange={(e) => setFormIsin(e.target.value.toUpperCase())}
                    placeholder="bijv. IE00B3RBWM25"
                    className="mt-0.5 w-full rounded border border-[var(--border-ed)] px-2 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                    data-testid="holding-isin-input"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-[var(--ink-3)]">Eenheden</label>
                  <input
                    type="number"
                    value={formUnits}
                    onChange={(e) => setFormUnits(e.target.value)}
                    placeholder="bijv. 50"
                    step="any"
                    min="0"
                    className="mt-0.5 w-full rounded border border-[var(--border-ed)] px-2 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                    data-testid="holding-units-input"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-[var(--ink-3)]">Gem. aankoopprijs (€)</label>
                  <input
                    type="number"
                    value={formAvgPrice}
                    onChange={(e) => setFormAvgPrice(e.target.value)}
                    placeholder="bijv. 80.00"
                    step="0.01"
                    min="0"
                    className="mt-0.5 w-full rounded border border-[var(--border-ed)] px-2 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                    data-testid="holding-avg-price-input"
                  />
                </div>
                {!editHolding && (
                  <div className="col-span-2">
                    <label className="text-[10px] font-medium text-[var(--ink-3)]">Aankoopdatum</label>
                    <input
                      type="date"
                      value={formPurchaseDate}
                      onChange={(e) => setFormPurchaseDate(e.target.value)}
                      className="mt-0.5 w-full rounded border border-[var(--border-ed)] px-2 py-1.5 text-xs text-[var(--ink)] focus:border-kern-400 focus:outline-none focus:ring-1 focus:ring-kern-400"
                      data-testid="holding-purchase-date-input"
                    />
                  </div>
                )}
              </div>

              {formError && (
                <div className="flex items-center gap-1 text-[10px] text-negative">
                  <AlertCircle className="h-3 w-3" />
                  {formError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => { setShowForm(false); setEditHolding(null); resetForm() }}
                  className="rounded px-3 py-1 text-xs text-[var(--ink-3)] hover:bg-zinc-100"
                >
                  Annuleren
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formName.trim()}
                  className="inline-flex items-center gap-1 rounded bg-kern-600 px-3 py-1 text-xs font-medium text-white hover:bg-kern-700 disabled:opacity-50"
                  data-testid="holding-save-btn"
                >
                  {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                  {editHolding ? 'Opslaan' : 'Toevoegen'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Allocation pie chart (SVG donut) ─────────────────────────

function AllocationPie({
  byType,
  total,
  dailyExpenses,
}: {
  byType: Record<AssetType, { assets: Asset[]; total: number }>
  total: number
  dailyExpenses: number
}) {
  const fc = useFc()
  const { ref, hasEntered } = useInViewAnimation({ duration: 700 })
  const size = 120
  const cx = size / 2
  const cy = size / 2
  const r = 45
  const strokeWidth = 22

  const segments: { type: string; pct: number; color: string }[] = []
  for (const type of Object.keys(ASSET_TYPE_LABELS) as AssetType[]) {
    const pct = total > 0 ? byType[type].total / total : 0
    if (pct > 0) segments.push({ type, pct, color: ASSET_TYPE_COLORS[type] })
  }

  const circumference = 2 * Math.PI * r
  let offset = 0

  return (
    <div ref={ref} className="shrink-0">
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg, i) => {
        const dash = seg.pct * circumference
        const gap = circumference - dash
        const currentOffset = offset
        offset += dash

        return (
          <circle
            key={seg.type}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={hasEntered ? `${dash} ${gap}` : `0 ${circumference}`}
            strokeDashoffset={-currentOffset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: hasEntered ? `stroke-dasharray 600ms cubic-bezier(.22,1,.36,1) ${i * 80}ms` : 'none' }}
          />
        )
      })}
      <text x={cx} y={dailyExpenses > 0 && total > 0 ? cy - 10 : cy - 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#18181b">
        {fc(total)}
      </text>
      {dailyExpenses > 0 && total > 0 ? (
        <>
          <text x={cx} y={cy + 4} textAnchor="middle" fontSize="7" fill="#d97706" data-testid="donut-freedom">
            {formatFreedomTimeString(calculateFreedomTime(total, dailyExpenses), 'short', false)}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize="7" fill="#a1a1aa">
            vrijheid
          </text>
        </>
      ) : (
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill="#a1a1aa">
          totaal
        </text>
      )}
    </svg>
    </div>
  )
}

// ── Projection chart ─────────────────────────────────────────

function ProjectionChart({
  data,
  currentValue,
}: {
  data: ReturnType<typeof projectPortfolio>
  currentValue: number
}) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })
  if (data.length === 0) return <div className="flex h-40 items-center justify-center text-xs text-[var(--ink-3)]">Geen data</div>

  const w = 400
  const h = 160
  const pad = { top: 10, right: 10, bottom: 25, left: 50 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const rawMax = Math.max(...data.map((d) => d.total), currentValue)
  // `!(rawMax > 0)` also catches NaN/Infinity — a plain `rawMax <= 0` lets a
  // non-finite max through (NaN <= 0 is false), which would emit NaN y-coords.
  if (!(rawMax > 0) || !Number.isFinite(rawMax)) return <div className="flex h-40 items-center justify-center text-xs text-[var(--ink-3)]">Geen data</div>
  const maxVal = rawMax * 1.05
  const maxMonth = data.length

  const step = Math.max(1, Math.floor(maxMonth / 60))
  const sampled = data.filter((_, i) => i % step === 0 || i === data.length - 1)

  function x(month: number) { return pad.left + (month / maxMonth) * chartW }
  function y(val: number) { return pad.top + chartH - (val / maxVal) * chartH }

  const areaPath = `M ${x(0).toFixed(1)} ${y(currentValue).toFixed(1)} ` +
    sampled.map((d) => `L ${x(d.month).toFixed(1)} ${y(d.total).toFixed(1)}`).join(' ') +
    ` L ${x(maxMonth).toFixed(1)} ${(pad.top + chartH).toFixed(1)} L ${x(0).toFixed(1)} ${(pad.top + chartH).toFixed(1)} Z`

  const linePath = `M ${x(0).toFixed(1)} ${y(currentValue).toFixed(1)} ` +
    sampled.map((d) => `L ${x(d.month).toFixed(1)} ${y(d.total).toFixed(1)}`).join(' ')

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxVal * t))

  return (
    <div ref={ref}>
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-auto w-full" preserveAspectRatio="xMidYMid meet" data-testid="projection-area-chart">
      {yTicks.map((val, i) => (
        <g key={i}>
          <line x1={pad.left} y1={y(val)} x2={w - pad.right} y2={y(val)} stroke="#f4f4f5" strokeWidth="0.5" />
          <text x={pad.left - 6} y={y(val) + 3} textAnchor="end" fontSize="7" fill="#a1a1aa">
            {val >= 1000 ? `${Math.round(val / 1000)}k` : val}
          </text>
        </g>
      ))}

      <line
        x1={pad.left} y1={y(currentValue)} x2={w - pad.right} y2={y(currentValue)}
        stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="3 3"
      />

      <path d={areaPath} fill="var(--positive)"
        style={{ opacity: hasEntered ? 0.12 : 0, transition: hasEntered ? 'opacity 250ms ease-out 455ms' : 'none' }} />
      <path d={linePath} fill="none" stroke="var(--positive)" strokeWidth="1.5"
        pathLength={1} strokeDasharray={1}
        style={{ strokeDashoffset: hasEntered ? undefined : 1, animation: hasEntered ? 'drawPath 600ms cubic-bezier(.22,1,.36,1) both' : 'none' }} />

      {sampled.filter((_, i) => i % Math.max(1, Math.floor(sampled.length / 5)) === 0).map((d) => (
        <text key={d.month} x={x(d.month)} y={h - 5} textAnchor="middle" fontSize="7" fill="#a1a1aa">
          {d.month >= 12 ? `${Math.floor(d.month / 12)}j` : `${d.month}m`}
        </text>
      ))}
    </svg>
    </div>
  )
}

// ── Asset form modal ─────────────────────────────────────────

export function AssetForm({
  asset,
  defaultType,
  linkedBankAccounts,
  onClose,
  onSaved,
  budgetingActive = true,
  initialConnection = null,
  initialBrokerConnection = null,
  embedded = false,
  onActionsChange,
  dailyExpenses = 0,
}: {
  asset?: Asset
  defaultType?: AssetType
  linkedBankAccounts: Map<string, { id: string; linked_asset_id: string }>
  onClose: () => void
  /**
   * Aangeroepen na een succesvolle save. De optionele `result` beschrijft de
   * zojuist-opgeslagen asset zodat de host een vervolg-actie kan tonen — bv. de
   * "Heeft deze woning een hypotheek?"-CTA bij een nieuw aangemaakte eigen
   * woning. Bestaande callers die `() => void` doorgeven blijven geldig.
   */
  onSaved: (result?: AssetSavedResult) => void
  budgetingActive?: boolean
  /**
   * Initiële externe-koppeling voor de R2 "Externe koppeling"-sectie. Alleen
   * relevant voor crypto-assets — voor andere types is dit altijd `null` en
   * wordt de sectie niet gerenderd. Wordt door `<AssetDetailFlow />`
   * meegegeven uit de batch-fetch bij modal-open.
   */
  initialConnection?: import('@/lib/connections-data').AssetConnectionSummary | null
  /**
   * Initiële broker-koppeling voor de "Externe koppeling"-sectie van
   * `investment`-assets (Trading 212 / CSV). Alleen relevant voor investment —
   * voor andere types is dit altijd `null` en wordt de sectie niet gerenderd.
   * Wordt door de pane/flow meegegeven uit de batch-fetch bij modal-open.
   */
  initialBrokerConnection?: import('@/lib/broker-connections-data').BrokerConnectionRow | null
  /**
   * Wanneer true rendert deze component alleen de body en publiceert het
   * save-state naar de pane-wrapper via `onActionsChange`. Geen interne
   * BottomSheet, geen interne Annuleren/Opslaan-knoppen.
   */
  embedded?: boolean
  /**
   * Callback om de huidige save-state naar de pane-wrapper te publiceren.
   * De wrapper rendert dan een primary CTA (Opslaan/Bijwerken) in de
   * pane-footer die `state.save()` aanroept.
   */
  onActionsChange?: (state: AssetEditActionsState) => void
  /**
   * Dagtarief (€/dag) voor de vrijheidstijd-context bij de verkoopstrategie
   * ("dit staat voor X vrijheidsdagen"). Optioneel: alleen het standalone
   * bewerkscherm (`assets-client.tsx`) geeft 'm mee; embedded pane/flow-callers
   * laten 'm weg en de vrijheidstijd-regel verdwijnt dan gracieus (0 → verborgen).
   */
  dailyExpenses?: number
}) {
  const fc = useFc()
  const isEdit = !!asset
  const [hasActiveHoldings, setHasActiveHoldings] = useState(false)
  const [holdingsCount, setHoldingsCount] = useState(0)
  // Budget tracking confirmation state
  const [showBudgetConfirm, setShowBudgetConfirm] = useState(false)
  const [otherTrackingCount, setOtherTrackingCount] = useState<number | null>(null)

  const [name, setName] = useState(asset?.name ?? '')
  const [assetType, setAssetType] = useState<AssetType>(asset?.asset_type ?? defaultType ?? 'savings')
  const [hasBudgetTracking, setHasBudgetTracking] = useState(asset?.has_budget_tracking ?? false)
  const [hasHoldingsTracking, setHasHoldingsTracking] = useState(asset?.has_holdings_tracking ?? false)
  // App-koppeling per asset-type — Hypotheekplanner (eigen_huis) en Verhuurrendement (real_estate).
  // De boolean leeft op de asset zelf; geen aparte API-call nodig — de save-payload schrijft mee.
  const [hasWoonbalansTracking, setHasWoonbalansTracking] = useState(asset?.has_woonbalans_tracking ?? false)
  const [hasRentalTracking, setHasRentalTracking] = useState(asset?.has_rental_tracking ?? false)
  const [iban, setIban] = useState(asset?.account_number ?? '')
  const [currentValue, setCurrentValue] = useState(String(asset?.current_value ?? ''))
  const [purchaseValue, setPurchaseValue] = useState(String(asset?.purchase_value ?? ''))

  // Check if editing an asset with active holdings
  useEffect(() => {
    if (isEdit && asset && ['investment', 'crypto', 'savings', 'retirement'].includes(asset.asset_type)) {
      fetch(`/api/assets/has-holdings?asset_id=${asset.id}`)
        .then(res => res.json())
        .then(data => {
          setHasActiveHoldings(data.has_holdings === true)
          setHoldingsCount(data.holdings_count || 0)
        })
        .catch(() => { /* non-critical */ })
    }
  }, [isEdit, asset])

  // Query how many OTHER cash assets have budget tracking (for last-account confirmation)
  useEffect(() => {
    if (isEdit && asset?.asset_type === 'cash' && asset.has_budget_tracking) {
      const supabase = createClient()
      supabase
        .from('assets')
        .select('id')
        .eq('asset_type', 'cash')
        .eq('has_budget_tracking', true)
        .eq('is_active', true)
        .neq('id', asset.id)
        .then(({ data }) => {
          setOtherTrackingCount(data?.length ?? 0)
        })
    }
  }, [isEdit, asset?.id, asset?.asset_type, asset?.has_budget_tracking])
  const [purchaseDate, setPurchaseDate] = useState(asset?.purchase_date ?? '')
  const [expectedReturn, setExpectedReturn] = useState(String(asset?.expected_return ?? TYPICAL_RETURNS.savings))
  const [monthlyContribution, setMonthlyContribution] = useState(String(asset?.monthly_contribution ?? '0'))
  const [institution, setInstitution] = useState(asset?.institution ?? '')
  const [notes, setNotes] = useState(asset?.notes ?? '')
  const [netWorthInclusionPct, setNetWorthInclusionPct] = useState(asset?.net_worth_inclusion_pct ?? 100)
  const [saving, setSaving] = useState(false)
  // Type-specific state
  const [subtype, setSubtype] = useState(asset?.subtype ?? '')
  const [riskProfile, setRiskProfile] = useState<string>(asset?.risk_profile ?? '')
  const [taxBenefit, setTaxBenefit] = useState(asset?.tax_benefit ?? false)
  const [isLiquid, setIsLiquid] = useState(asset?.is_liquid ?? true)
  const [lockEndDate, setLockEndDate] = useState(asset?.lock_end_date ?? '')
  const [tickerSymbol, setTickerSymbol] = useState(asset?.ticker_symbol ?? '')
  const [rentalIncome, setRentalIncome] = useState(String(asset?.rental_income ?? ''))
  const [wozValue, setWozValue] = useState(String(asset?.woz_value ?? ''))
  const [retirementProviderType, setRetirementProviderType] = useState(asset?.retirement_provider_type ?? '')
  const [depreciationRate, setDepreciationRate] = useState(String(asset?.depreciation_rate ?? ''))
  const [addressPostcode, setAddressPostcode] = useState(asset?.address_postcode ?? '')
  const [addressHouseNumber, setAddressHouseNumber] = useState(asset?.address_house_number ?? '')
  const [expiryDate, setExpiryDate] = useState(asset?.expiry_date ?? '')
  const [beneficiary, setBeneficiary] = useState(asset?.beneficiary ?? '')
  const [linkedAssetId, setLinkedAssetId] = useState(asset?.linked_asset_id ?? '')
  // ── Verkoopstrategie in prognose (zie lib/sale-config.ts) ──
  // Initiële stand + velden uit de bestaande sale_config (parser geeft de
  // resolve-time default `wanneer_nodig` terug voor een config-loze niet-liquide
  // asset, zodat "Automatisch bij behoefte" actief toont).
  const initialSaleConfig = useMemo(() => parseSaleConfig(asset?.sale_config), [asset?.sale_config])
  const [saleStand, setSaleStand] = useState<SaleStand>(initialSaleConfig.stand)
  const [saleTriggerAge, setSaleTriggerAge] = useState(
    initialSaleConfig.stand !== 'niet_verkopen' && initialSaleConfig.triggerAge != null
      ? String(initialSaleConfig.triggerAge)
      : ''
  )
  const [saleTriggerDate, setSaleTriggerDate] = useState(
    initialSaleConfig.stand === 'vast_moment' && initialSaleConfig.triggerDate ? initialSaleConfig.triggerDate : ''
  )
  // 'leeftijd' | 'datum' — welk veld de gebruiker voor het vaste moment invult.
  const [saleMomentMode, setSaleMomentMode] = useState<'leeftijd' | 'datum'>(
    initialSaleConfig.stand === 'vast_moment' && initialSaleConfig.triggerDate ? 'datum' : 'leeftijd'
  )
  const [saleCostsPct, setSaleCostsPct] = useState(
    initialSaleConfig.stand !== 'niet_verkopen' && initialSaleConfig.salesCostsPct != null
      ? String(Math.round(initialSaleConfig.salesCostsPct * 1000) / 10) // fractie → % (bv. 0.06 → 6)
      : ''
  )
  const [salePayoffDebtIds, setSalePayoffDebtIds] = useState<string[]>(
    initialSaleConfig.stand !== 'niet_verkopen' && initialSaleConfig.payoffDebtIds ? initialSaleConfig.payoffDebtIds : []
  )
  // Actieve schulden van de gebruiker voor de "Aflossen bij verkoop"-keuze.
  const [activeDebts, setActiveDebts] = useState<{ id: string; name: string }[]>([])
  const [deelnemingOptions, setDeelnemingOptions] = useState<{ id: string; name: string }[]>([])
  const [dgaTotal, setDgaTotal] = useState(0)
  const [validationError, setValidationError] = useState<string | null>(null)
  // Household ownership
  const [ownership, setOwnership] = useState<OwnershipType>(asset?.ownership ?? 'personal')
  const { hasHousehold, householdId } = useHouseholdStatus()

  const subtypeOptions = ASSET_SUBTYPE_LABELS[assetType]
  const visibleFields = ASSET_TYPE_FIELDS[assetType]
  // Toont de verkoopstrategie-sectie? Geldt voor de niet-liquide types die de
  // v2-grootboek-engine kan liquideren (sale_config in ASSET_TYPE_FIELDS).
  const showSaleConfig = visibleFields.includes('sale_config')

  // Load deelneming options + DGA total when subtype is dga_lening
  useEffect(() => {
    if (subtype !== 'dga_lening') {
      setDeelnemingOptions([])
      setDgaTotal(0)
      return
    }
    const supabase = createClient()
    // Fetch deelneming assets
    supabase.from('assets').select('id, name').eq('asset_type', 'deelneming').eq('is_active', true)
      .then(({ data }) => setDeelnemingOptions(data ?? []))
    // Fetch total DGA-leningen (excluding current asset if editing)
    supabase.from('assets').select('id, current_value').eq('asset_type', 'vordering').eq('is_active', true)
      .then(({ data }) => {
        const total = (data ?? [])
          .filter(a => a.id !== asset?.id)
          .reduce((sum, a) => sum + Number(a.current_value), 0)
        setDgaTotal(total)
      })
  }, [subtype, asset?.id])

  // Laad de actieve schulden voor "Aflossen bij verkoop" zodra de
  // verkoopstrategie-sectie zichtbaar is (niet-liquide type).
  useEffect(() => {
    if (!showSaleConfig) {
      setActiveDebts([])
      return
    }
    const supabase = createClient()
    supabase
      .from('debts')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .then(({ data }) => setActiveDebts((data as { id: string; name: string }[]) ?? []))
  }, [showSaleConfig])

  function handleTypeChange(type: AssetType) {
    setAssetType(type)
    setSubtype('')
    if (!isEdit) {
      setExpectedReturn(String(TYPICAL_RETURNS[type]))
      setRiskProfile('')
      setTaxBenefit(false)
      setIsLiquid(true)
      // Default depreciation for vehicle; clear for non-depreciating types
      if (type === 'vehicle') {
        setDepreciationRate('15')
        setExpectedReturn('0')
      } else if (type !== 'physical') {
        setDepreciationRate('')
      }
    }
  }

  function handleSubtypeChange(st: string) {
    setSubtype(st)
    if (!isEdit && st) {
      const defaults = ASSET_SUBTYPE_DEFAULTS[st]
      if (defaults) {
        if (defaults.expected_return !== undefined) setExpectedReturn(String(defaults.expected_return))
        if (defaults.risk_profile) setRiskProfile(defaults.risk_profile)
        if (defaults.is_liquid !== undefined) setIsLiquid(defaults.is_liquid)
        if (defaults.tax_benefit !== undefined) setTaxBenefit(defaults.tax_benefit)
      }
    }
  }

  async function handleSave() {
    if (!name || !currentValue) return
    setValidationError(null)

    // Validate no negative monetary values
    const numCurrentValue = Number(currentValue)
    const numPurchaseValue = Number(purchaseValue)
    const numMonthlyContribution = Number(monthlyContribution)

    if (numCurrentValue < 0) {
      setValidationError('Waarde mag niet negatief zijn. Voer een positief bedrag in.')
      return
    }
    if (purchaseValue && numPurchaseValue < 0) {
      setValidationError('Aankoopwaarde mag niet negatief zijn. Voer een positief bedrag in.')
      return
    }
    if (monthlyContribution && numMonthlyContribution < 0) {
      setValidationError('Maandelijkse inleg mag niet negatief zijn.')
      return
    }

    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const isCashType = assetType === 'cash'

    // Bouw de SaleConfig uit de UI-state. Alleen voor niet-liquide types die de
    // sectie tonen; anders null (laat de DB-default/parser z'n werk doen).
    const showSaleConfigOnSave = ASSET_TYPE_FIELDS[assetType].includes('sale_config')
    let saleConfigPayload: SaleConfig | null = null
    if (showSaleConfigOnSave) {
      const pctNum = saleCostsPct ? Number(saleCostsPct) : NaN
      const salesCostsPct = Number.isFinite(pctNum) && pctNum > 0 ? pctNum / 100 : undefined // % → fractie
      const ageNum = saleTriggerAge ? Number(saleTriggerAge) : NaN
      const triggerAge = Number.isFinite(ageNum) && ageNum > 0 ? ageNum : undefined
      const payoffDebtIds = salePayoffDebtIds.length > 0 ? salePayoffDebtIds : undefined
      if (saleStand === 'niet_verkopen') {
        saleConfigPayload = { stand: 'niet_verkopen' }
      } else if (saleStand === 'vast_moment') {
        saleConfigPayload = {
          stand: 'vast_moment',
          ...(saleMomentMode === 'datum'
            ? { triggerDate: saleTriggerDate || null }
            : { triggerAge: triggerAge ?? null }),
          ...(salesCostsPct !== undefined ? { salesCostsPct } : {}),
          ...(payoffDebtIds ? { payoffDebtIds } : {}),
        }
      } else {
        saleConfigPayload = {
          stand: 'wanneer_nodig',
          ...(triggerAge !== undefined ? { triggerAge } : {}),
          ...(salesCostsPct !== undefined ? { salesCostsPct } : {}),
          ...(payoffDebtIds ? { payoffDebtIds } : {}),
        }
      }
    }

    const row = {
      user_id: user.id,
      name,
      asset_type: assetType,
      current_value: Number(currentValue) || 0,
      purchase_value: isCashType ? Number(currentValue) || 0 : Number(purchaseValue) || 0,
      purchase_date: isCashType ? null : purchaseDate || null,
      expected_return: (depreciationRate && Number(depreciationRate) > 0 ? 0 : Number(expectedReturn) || 0),
      monthly_contribution: isCashType ? 0 : Number(monthlyContribution) || 0,
      institution: institution || null,
      account_number: isCashType ? (iban || null) : null,
      notes: notes || null,
      // Type-specific fields
      subtype: subtype || null,
      risk_profile: riskProfile || null,
      tax_benefit: visibleFields.includes('tax_benefit') ? taxBenefit : null,
      is_liquid: isCashType ? true : (visibleFields.includes('is_liquid') ? isLiquid : null),
      lock_end_date: lockEndDate || null,
      ticker_symbol: tickerSymbol || null,
      rental_income: rentalIncome ? Number(rentalIncome) : null,
      woz_value: wozValue ? Number(wozValue) : null,
      retirement_provider_type: retirementProviderType || null,
      depreciation_rate: depreciationRate ? Number(depreciationRate) : null,
      address_postcode: addressPostcode || null,
      address_house_number: addressHouseNumber || null,
      // Verkoopstrategie in prognose (alleen niet-liquide types; anders null →
      // parser/DB-default `wanneer_nodig`). Zie lib/sale-config.ts.
      sale_config: showSaleConfigOnSave ? saleConfigPayload : null,
      // Household fields
      ownership: ownership,
      household_id: ownership === 'shared' ? householdId : null,
      // Net worth inclusion
      net_worth_inclusion_pct: netWorthInclusionPct,
      // Budget tracking
      has_budget_tracking: isCashType ? hasBudgetTracking : false,
      // Holdings tracking
      has_holdings_tracking: ['investment', 'crypto', 'savings', 'retirement'].includes(assetType) ? hasHoldingsTracking : false,
      // App-koppeling: Hypotheekplanner (eigen_huis) + Verhuurrendement (real_estate).
      // Voor andere asset-types gedwongen `false` zodat een type-wissel niet stilzwijgend
      // een verkeerde app-vlag laat staan.
      has_woonbalans_tracking: assetType === 'eigen_huis' ? hasWoonbalansTracking : false,
      has_rental_tracking: assetType === 'real_estate' ? hasRentalTracking : false,
      // Ensure new assets are visible
      is_active: true,
    }

    let assetId: string | undefined

    if (isEdit && asset) {
      const { error: updateErr } = await supabase.from('assets').update(row).eq('id', asset.id)
      if (updateErr) { console.error('ASSET UPDATE FAILED:', updateErr); setSaving(false); return }
      assetId = asset.id

      // Auto-track valuation when current_value changes
      const newValue = Number(currentValue) || 0
      const oldValue = Number(asset.current_value)
      if (newValue !== oldValue && newValue > 0) {
        const today = new Date().toISOString().split('T')[0]
        await supabase.from('valuations').upsert({
          user_id: user.id,
          entity_type: 'asset',
          entity_id: asset.id,
          valuation_date: today,
          value: newValue,
          notes: `Waarde bijgewerkt van ${oldValue} naar ${newValue}`,
        }, { onConflict: 'entity_id,valuation_date' })
        // Mirror naar balance_snapshots zodat de categorie-sparkline meebeweegt.
        await upsertSingleBalanceSnapshot(supabase, user.id, today, {
          type: 'asset',
          id: asset.id,
          name,
          subtype: assetType,
          balance: newValue,
          netWorthInclusionPct: netWorthInclusionPct,
        })
      }
    } else {
      const { data: inserted, error: insertErr } = await supabase.from('assets').insert(row).select('id').single()
      if (insertErr) { console.error('ASSET INSERT FAILED:', insertErr); setValidationError('Opslaan mislukt: ' + insertErr.message); setSaving(false); return }
      assetId = inserted?.id
    }

    // Create or sync linked bank_account for cash with budget tracking
    if (isCashType && hasBudgetTracking && assetId) {
      const { data: existingBA } = await supabase
        .from('bank_accounts')
        .select('id')
        .eq('linked_asset_id', assetId)
        .maybeSingle()

      if (!existingBA) {
        await supabase.from('bank_accounts').insert({
          user_id: user.id,
          name,
          iban: iban || null,
          bank_name: institution || null,
          account_type: subtype || 'checking',
          balance: Number(currentValue) || 0,
          linked_asset_id: assetId,
          ownership,
          household_id: ownership === 'shared' ? householdId : null,
        })
      } else {
        await supabase.from('bank_accounts').update({
          name,
          iban: iban || null,
          bank_name: institution || null,
          account_type: subtype || 'checking',
          balance: Number(currentValue) || 0,
          // Sync eigendom mee: een eigendomswijziging op het cash-bezit moet
          // doorwerken naar de gekoppelde bankrekening (DB-trigger herstempelt
          // household_id). Geen backfill-dialoog hier — alleen de rekeningrij.
          ownership,
        }).eq('id', existingBA.id)
      }
    }

    // Cleanup linked bank_account when budget tracking is turned OFF
    if (isCashType && !hasBudgetTracking && isEdit && asset?.has_budget_tracking && assetId) {
      const { data: linkedBA } = await supabase
        .from('bank_accounts')
        .select('id')
        .eq('linked_asset_id', assetId)
        .maybeSingle()

      if (linkedBA) {
        const { count } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', linkedBA.id)

        if (count === 0) {
          await supabase.from('bank_accounts').delete().eq('id', linkedBA.id)
        } else {
          await supabase.from('bank_accounts').update({ linked_asset_id: null }).eq('id', linkedBA.id)
        }
      }
    }

    // After save: sync budgeting_active with has_budget_tracking status.
    // Best-effort (zoals de oude inline sync): een gefaalde gate-write mag de
    // save-flow niet breken; een volgende save herstelt de gate.
    if (isCashType) {
      await syncBudgetingActive(supabase, user.id).catch(() => undefined)
    }

    setSaving(false)
    onSaved({ assetId: assetId ?? undefined, isNew: !isEdit, assetType, assetName: name })
  }

  // Publiceer save-state naar pane-wrapper (zelfde patroon als
  // EventPaneEdit). Een ref voor de save-handler voorkomt stale closures:
  // de wrapper roept altijd de meest recente handler aan zonder dat we de
  // callback-identity hoeven te invalideren bij elke state-mutatie.
  const saveHandlerRef = useRef<() => void>(() => {})
  useEffect(() => {
    saveHandlerRef.current = () => { void handleSave() }
  })
  const canSave = !saving && Boolean(name) && Boolean(currentValue)
  useEffect(() => {
    if (!onActionsChange) return
    onActionsChange({
      canSave,
      saving,
      isEditing: isEdit,
      save: () => saveHandlerRef.current(),
    })
  }, [onActionsChange, canSave, saving, isEdit])

  return (
    <MaybeBottomSheet
      embedded={embedded}
      onClose={onClose}
      title={isEdit ? 'Asset bewerken' : 'Nieuwe asset'}
      size="lg"
    >
        <div className="space-y-3 px-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Naam</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                placeholder="Spaarrekening"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Type</label>
              <select
                value={assetType}
                onChange={(e) => handleTypeChange(e.target.value as AssetType)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              >
                {Object.entries(ASSET_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Huishouden */}
          <OwnershipToggle
            value={ownership}
            onChange={setOwnership}
            hasHousehold={hasHousehold}
          />

          {/* Netto vermogen inclusie — logisch onder huishouden */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
              Neem dit % mee in netto vermogen en berekeningen naar de horizon
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={100} step={5}
                value={netWorthInclusionPct}
                onChange={(e) => setNetWorthInclusionPct(Number(e.target.value))}
                className="flex-1 accent-kern-600"
              />
              <input
                type="number" min={0} max={100}
                value={netWorthInclusionPct}
                onChange={(e) => setNetWorthInclusionPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                className="w-16 rounded-[var(--r)] border border-[var(--border-ed)] px-2 py-1.5 text-sm text-center tabular-nums"
              />
              <span className="text-sm text-[var(--ink-3)]">%</span>
            </div>
            <p className="mt-1 text-[10px] text-[var(--ink-3)]">
              Stel in welk percentage van deze asset wordt meegeteld in je netto vermogen en vrijheidsberekeningen.
            </p>
            {netWorthInclusionPct < 100 && Number(currentValue) > 0 && (
              <p className="mt-1 font-mono text-[11px] tabular-nums text-kern-600">
                Effectieve waarde: {fc(Number(currentValue) * netWorthInclusionPct / 100)}
              </p>
            )}
          </div>

          {/* Subtype dropdown (conditional) */}
          {subtypeOptions && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Subtype</label>
              <select
                value={subtype}
                onChange={(e) => handleSubtypeChange(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              >
                <option value="">Selecteer subtype...</option>
                {Object.entries(subtypeOptions).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Warning when holdings are active */}
          {hasActiveHoldings && (
            <div className="flex items-start gap-2 rounded-[var(--r)] bg-kern-50 border border-kern-200 px-3 py-2" data-testid="asset-form-holdings-warning">
              <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kern-600" />
              <p className="text-xs text-kern-700">
                Deze asset heeft {holdingsCount} actieve holding{holdingsCount !== 1 ? 's' : ''}. De waarde wordt automatisch berekend uit de portfolio tracker. Het veld &ldquo;Huidige waarde&rdquo; kan niet handmatig worden gewijzigd.
              </p>
            </div>
          )}

          {/* Cash-specific: IBAN + Bank name (hidden for contant geld) */}
          {assetType === 'cash' && subtype !== 'contant_geld' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">IBAN</label>
                <input
                  value={iban}
                  onChange={(e) => setIban(e.target.value.toUpperCase())}
                  className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm uppercase"
                  placeholder="NL12 INGB 0001 2345 67"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Bank</label>
                <input
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                  placeholder="ING, ABN AMRO, Rabobank..."
                />
              </div>
            </div>
          )}

          {/* Info text for contant geld */}
          {assetType === 'cash' && subtype === 'contant_geld' && (
            <p className="text-xs text-[var(--ink-3)] pl-1">
              Contant geld heeft geen IBAN of bank — vul alleen het bedrag in.
            </p>
          )}

          {/* Value fields */}
          {assetType === 'cash' ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Huidig saldo</label>
              <input
                type="number"
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                placeholder="0"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                    {assetType === 'eigen_huis' ? 'Marktwaarde' : assetType === 'levensverzekering' ? 'Afkoopwaarde' : assetType === 'vordering' ? 'Uitstaand bedrag' : 'Huidige waarde'}
                  </label>
                  <input
                    type="number"
                    value={currentValue}
                    onChange={(e) => !hasActiveHoldings && setCurrentValue(e.target.value)}
                    readOnly={hasActiveHoldings}
                    className={`w-full rounded-[var(--r)] border px-3 py-2 text-sm ${
                      hasActiveHoldings
                        ? 'border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-3)] cursor-not-allowed'
                        : 'border-[var(--border-ed)]'
                    }`}
                    title={hasActiveHoldings ? 'Waarde wordt automatisch berekend uit holdings' : undefined}
                  />
                  {hasActiveHoldings && (
                    <p className="mt-1 text-[10px] text-kern-600">Automatisch gesynchroniseerd vanuit holdings</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                    {assetType === 'eigen_huis' ? 'Aankoopprijs' : assetType === 'vordering' ? 'Oorspronkelijke hoofdsom' : 'Aankoopwaarde'}
                  </label>
                  <input
                    type="number"
                    value={purchaseValue}
                    onChange={(e) => setPurchaseValue(e.target.value)}
                    className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {visibleFields.includes('woz_value') && (
                <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
                  Weet je de actuele marktwaarde niet? Bekijk een schatting via de Hypotheker en vul &apos;m hier in.{' '}
                  <a
                    href="https://www.hypotheker.nl/zelf-berekenen/wat-is-deze-woning-waard/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-[var(--ink-2)] underline underline-offset-4 hover:text-[var(--ink)]"
                  >
                    Open de Hypotheker
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </p>
              )}

              <div className={`grid ${assetType === 'eigen_huis' ? 'grid-cols-2' : 'grid-cols-3'} gap-3`}>
                {!(visibleFields.includes('depreciation_rate') && depreciationRate && Number(depreciationRate) > 0) && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">{assetType === 'vordering' ? 'Rente (% p.j.)' : 'Rendement (% p.j.)'}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={expectedReturn}
                    onChange={(e) => setExpectedReturn(e.target.value)}
                    className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                  />
                </div>
                )}
                {assetType !== 'eigen_huis' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                      {assetType === 'levensverzekering' ? 'Premie p/m' : assetType === 'vordering' ? 'Aflossing p/m' : 'Inleg p/m'}
                    </label>
                    <input
                      type="number"
                      value={monthlyContribution}
                      onChange={(e) => setMonthlyContribution(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Aankoopdatum</label>
                  <input
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {assetType !== 'eigen_huis' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                    {assetType === 'levensverzekering' ? 'Verzekeraar' : assetType === 'vordering' ? 'Debiteur / Tegenpartij' : 'Instelling'}
                  </label>
                  <input
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                    placeholder={assetType === 'levensverzekering' ? 'Nationale-Nederlanden, Aegon...' : assetType === 'vordering' ? 'Bijv. Jan Jansen, Mijn BV' : 'ABN AMRO, DEGIRO, ABP...'}
                  />
                </div>
              )}
            </>
          )}

          {/* Budget tracking toggle (cash only, hidden when budgetteren module is off) */}
          {assetType === 'cash' && budgetingActive && (
            <>
              <label className="flex items-start gap-3 rounded-[var(--r)] border border-positive/30 bg-positive/5 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasBudgetTracking}
                  onChange={(e) => {
                    const wantsToDisable = !e.target.checked && hasBudgetTracking
                    // If disabling and this is the last tracking account, show confirmation
                    if (wantsToDisable && otherTrackingCount === 0) {
                      setShowBudgetConfirm(true)
                      return
                    }
                    setShowBudgetConfirm(false)
                    setHasBudgetTracking(e.target.checked)
                  }}
                  className="mt-0.5 rounded border-[var(--border-md)]"
                />
                <div>
                  <span className="text-sm font-medium text-[var(--ink)]">Budgetten & transacties</span>
                  <p className="text-xs text-[var(--ink-3)]">
                    Schakel in om transacties te importeren, budgetcategorieën te koppelen, en cashflow te voorspellen.
                  </p>
                </div>
              </label>

              {/* Confirmation warning when disabling last budget tracking account */}
              {showBudgetConfirm && (
                <div className="rounded-[var(--r)] border border-amber-300 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        Weet je het zeker? Dit is je laatste rekening met budgetteren.
                      </p>
                      <p className="mt-1 text-xs text-amber-700">
                        Als je dit uitschakelt, worden budgetfuncties in de hele app gedeactiveerd. Je kunt dit altijd weer inschakelen.
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setHasBudgetTracking(false)
                            setShowBudgetConfirm(false)
                          }}
                          className="rounded-[var(--r)] bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                        >
                          Ja, uitschakelen
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowBudgetConfirm(false)}
                          className="rounded-[var(--r)] border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                        >
                          Annuleer
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Holdings tracking toggle (investment, crypto, savings, retirement) */}
          {['investment', 'crypto', 'savings', 'retirement'].includes(assetType) && (
            <>
              <label className="flex items-start gap-3 rounded-[var(--r)] border border-kern-200 bg-kern-50/30 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasHoldingsTracking}
                  onChange={(e) => {
                    setHasHoldingsTracking(e.target.checked)
                  }}
                  className="mt-0.5 rounded border-[var(--border-md)]"
                />
                <div>
                  <span className="text-sm font-medium text-[var(--ink)]">Holdings bijhouden</span>
                  <p className="text-xs text-[var(--ink-3)]">
                    Schakel in om individuele posities, transacties en portfolio-allocatie bij te houden.
                  </p>
                </div>
              </label>

              {/* Warning when disabling with active holdings */}
              {!hasHoldingsTracking && isEdit && asset?.has_holdings_tracking && hasActiveHoldings && (
                <div className="rounded-[var(--r)] border border-amber-300 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        Er zijn {holdingsCount} actieve holding{holdingsCount !== 1 ? 's' : ''} gekoppeld.
                      </p>
                      <p className="mt-1 text-xs text-amber-700">
                        Deze worden niet verwijderd maar verschijnen niet meer op de centrale holdings pagina.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Externe koppeling sectie (R2) — alleen voor crypto, en alleen
              wanneer we een bestaand asset bewerken: een connection vereist
              een persistente asset-ID die we via de POST kunnen meegeven. */}
          {isEdit && asset && assetType === 'crypto' && (
            <AssetEditConnectionSection
              assetId={asset.id}
              assetName={asset.name}
              initialConnection={initialConnection}
            />
          )}

          {/* Broker-koppeling sectie — alleen voor investment-assets, en alleen
              bij bewerken van een bestaand asset (een koppeling vereist een
              persistente asset-ID). Trading 212 (sync) of CSV-import. */}
          {isEdit && asset && assetType === 'investment' && (
            <AssetEditBrokerSection
              assetId={asset.id}
              assetName={asset.name}
              initialConnection={initialBrokerConnection}
            />
          )}

          {/* Hypotheekplanner-app toggle (eigen_huis only) — patroon analoog aan budget/holdings hierboven. */}
          {assetType === 'eigen_huis' && (
            <label className="flex items-start gap-3 rounded-[var(--r)] border border-kern-200 bg-kern-50/30 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasWoonbalansTracking}
                onChange={(e) => setHasWoonbalansTracking(e.target.checked)}
                className="mt-0.5 rounded border-[var(--border-md)]"
              />
              <div>
                <span className="text-sm font-medium text-[var(--ink)]">Hypotheekplanner</span>
                <p className="text-xs text-[var(--ink-3)]">
                  Schakel in om je equity-opbouw, oversluit-scenario&apos;s en hypotheek-vs-beleggen te zien.
                </p>
              </div>
            </label>
          )}

          {/* Verhuurrendement-app toggle (real_estate only) — patroon analoog aan budget/holdings hierboven. */}
          {assetType === 'real_estate' && (
            <label className="flex items-start gap-3 rounded-[var(--r)] border border-kern-200 bg-kern-50/30 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={hasRentalTracking}
                onChange={(e) => setHasRentalTracking(e.target.checked)}
                className="mt-0.5 rounded border-[var(--border-md)]"
              />
              <div>
                <span className="text-sm font-medium text-[var(--ink)]">Verhuurrendement</span>
                <p className="text-xs text-[var(--ink-3)]">
                  Schakel in om netto rendement, cashflow en bezetting per object te zien.
                </p>
              </div>
            </label>
          )}

          {/* Type-specific fields */}
          {visibleFields.length > 0 && visibleFields.some((f) => f !== 'subtype') && (
            <div className="space-y-3 rounded-[var(--r)] border border-kern-100 bg-kern-50/30 p-3">
              <p className="text-xs font-semibold text-kern-700/60 uppercase">Details</p>
              <div className="grid grid-cols-2 gap-3">
                {visibleFields.includes('risk_profile') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Risicoprofiel</label>
                    <select
                      value={riskProfile}
                      onChange={(e) => setRiskProfile(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    >
                      <option value="">-</option>
                      {Object.entries(RISK_PROFILE_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>{l}</option>
                      ))}
                    </select>
                  </div>
                )}
                {visibleFields.includes('ticker_symbol') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Ticker / ISIN</label>
                    <input
                      value={tickerSymbol}
                      onChange={(e) => setTickerSymbol(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                      placeholder="VWRL, IWDA..."
                    />
                  </div>
                )}
                {visibleFields.includes('is_liquid') && (
                  <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                    <input
                      type="checkbox"
                      checked={isLiquid}
                      onChange={(e) => setIsLiquid(e.target.checked)}
                      className="rounded border-[var(--border-md)]"
                    />
                    Direct opneembaar
                  </label>
                )}
                {visibleFields.includes('lock_end_date') && !isLiquid && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Vastgezet tot</label>
                    <input
                      type="date"
                      value={lockEndDate}
                      onChange={(e) => setLockEndDate(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('tax_benefit') && (
                  <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                    <input
                      type="checkbox"
                      checked={taxBenefit}
                      onChange={(e) => setTaxBenefit(e.target.checked)}
                      className="rounded border-[var(--border-md)]"
                    />
                    Fiscaal voordeel
                  </label>
                )}
                {visibleFields.includes('retirement_provider_type') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Pensioenuitvoerder</label>
                    <select
                      value={retirementProviderType}
                      onChange={(e) => setRetirementProviderType(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    >
                      <option value="">-</option>
                      {Object.entries(RETIREMENT_PROVIDER_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>{l}</option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                      Vraag je actuele pensioenoverzicht op (DigiD vereist) en update je waarde handmatig.{' '}
                      <a
                        href="https://www.mijnpensioenoverzicht.nl/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[var(--ink-2)] underline underline-offset-4 hover:text-[var(--ink)]"
                      >
                        Open mijnpensioenoverzicht.nl
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </p>
                  </div>
                )}
                {visibleFields.includes('address_postcode') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Postcode</label>
                    <input
                      value={addressPostcode}
                      onChange={(e) => setAddressPostcode(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                      placeholder="1234 AB"
                    />
                  </div>
                )}
                {visibleFields.includes('address_house_number') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Huisnummer</label>
                    <input
                      value={addressHouseNumber}
                      onChange={(e) => setAddressHouseNumber(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                      placeholder="42"
                    />
                  </div>
                )}
                {visibleFields.includes('rental_income') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Huurinkomsten p/m</label>
                    <input
                      type="number"
                      value={rentalIncome}
                      onChange={(e) => setRentalIncome(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('woz_value') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">WOZ-waarde</label>
                    <input
                      type="number"
                      value={wozValue}
                      onChange={(e) => setWozValue(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                    <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                      Vraag je actuele WOZ-waarde gratis op bij het officiële waardeloket en vul &apos;m hier in.{' '}
                      <a
                        href="https://www.wozwaardeloket.nl/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-[var(--ink-2)] underline underline-offset-4 hover:text-[var(--ink)]"
                      >
                        Open WOZ-waardeloket
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    </p>
                  </div>
                )}
                {visibleFields.includes('depreciation_rate') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Afschrijving (% p.j.)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={depreciationRate}
                      onChange={(e) => setDepreciationRate(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('expiry_date') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Einddatum polis</label>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('beneficiary') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Begunstigde</label>
                    <input
                      value={beneficiary}
                      onChange={(e) => setBeneficiary(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                      placeholder="Bijv. partner, kinderen"
                    />
                  </div>
                )}
                {/* DGA-lening: link to deelneming + warning */}
                {subtype === 'dga_lening' && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Gekoppelde deelneming</label>
                      <select
                        value={linkedAssetId}
                        onChange={(e) => setLinkedAssetId(e.target.value)}
                        className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                      >
                        <option value="">— Geen koppeling —</option>
                        {deelnemingOptions.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      {deelnemingOptions.length === 0 && (
                        <p className="mt-1 text-[10px] text-[var(--ink-4)]">Voeg eerst een deelneming toe onder Bezittingen.</p>
                      )}
                    </div>
                    {(() => {
                      const totalDga = dgaTotal + (Number(currentValue) || 0)
                      if (totalDga > 500000) return (
                        <div className="rounded-[var(--r)] border border-negative/40 bg-negative/10 p-3">
                          <p className="text-xs font-medium text-negative">Wet excessief lenen: totaal DGA-leningen &euro;{totalDga.toLocaleString('nl-NL')} overschrijdt de grens van &euro;500.000.</p>
                          <p className="mt-0.5 text-[10px] text-negative">Het meerdere boven &euro;500.000 wordt belast als box 2-inkomen (aanmerkelijk belang).</p>
                        </div>
                      )
                      if (totalDga > 400000) return (
                        <div className="rounded-[var(--r)] border border-amber-300 bg-amber-50 p-3">
                          <p className="text-xs font-medium text-amber-800">Let op: totaal DGA-leningen &euro;{totalDga.toLocaleString('nl-NL')} nadert de grens van &euro;500.000 (Wet excessief lenen).</p>
                        </div>
                      )
                      return null
                    })()}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Verkoopstrategie in prognose ──
              Stelt assets.sale_config in: of/wanneer de horizon-prognose dit
              bezit verkoopt. Horizon-context (dit voedt de toekomstprognose),
              dus horizon-accenten. */}
          {showSaleConfig && (
            <div className="space-y-3 rounded-[var(--r)] border border-horizon-100 bg-horizon-50/30 p-3">
              <div>
                <p id="sale-config-legend" className="text-xs font-semibold uppercase text-horizon-700/60">Verkoopstrategie in prognose</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
                  Bepaal hoe je toekomstprognose dit bezit behandelt: wel of niet verkopen, en wanneer.
                </p>
              </div>

              {/* Vrijheidstijd-context bij de waarde — "geld is opgeslagen tijd". */}
              {dailyExpenses > 0 && Number(currentValue) > 0 && (
                <p className="text-[11px] text-[var(--ink-3)]">
                  Deze waarde van <span className="font-medium text-[var(--ink-2)]">{fc(Number(currentValue))}</span> staat voor{' '}
                  <span className="font-medium text-horizon-700">
                    {formatFreedomTimeString(calculateFreedomTime(Number(currentValue), dailyExpenses), 'long')}
                  </span>{' '}
                  vrijheid.
                </p>
              )}

              {/* Drie-weg keuze — verticale radio-cards (375px-proof). */}
              <div role="radiogroup" aria-labelledby="sale-config-legend" className="space-y-2">
                {([
                  {
                    stand: 'wanneer_nodig' as SaleStand,
                    title: 'Automatisch bij behoefte',
                    desc: 'Verkoop pas zodra je liquide middelen tekortschieten.',
                  },
                  {
                    stand: 'vast_moment' as SaleStand,
                    title: 'Op een vast moment',
                    desc: 'Verkoop op een vaste leeftijd of datum.',
                  },
                  {
                    stand: 'niet_verkopen' as SaleStand,
                    title: 'Niet verkopen',
                    desc: 'Dit bezit blijft staan in de prognose.',
                  },
                ]).map((opt) => {
                  const active = saleStand === opt.stand
                  return (
                    <label
                      key={opt.stand}
                      className={`flex cursor-pointer items-start gap-3 rounded-[var(--r)] border p-3 transition-colors ${
                        active
                          ? 'border-horizon-400 bg-horizon-50'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="sale-stand"
                        value={opt.stand}
                        aria-label={opt.title}
                        checked={active}
                        onChange={() => setSaleStand(opt.stand)}
                        className="mt-0.5 shrink-0 accent-horizon-600"
                      />
                      <span className="min-w-0">
                        <span className={`block text-sm font-medium ${active ? 'text-horizon-800' : 'text-[var(--ink)]'}`}>
                          {opt.title}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--ink-3)]">{opt.desc}</span>
                      </span>
                    </label>
                  )
                })}
              </div>

              {/* Conditionele velden per stand. */}
              {saleStand === 'wanneer_nodig' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                    Uiterlijke leeftijd <span className="text-[var(--ink-4)]">(optioneel)</span>
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={saleTriggerAge}
                    onChange={(e) => setSaleTriggerAge(e.target.value)}
                    placeholder="Bijv. 75"
                    className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-[10px] text-[var(--ink-4)]">
                    Laat leeg om alleen bij een tekort te verkopen. Vul in om uiterlijk op deze leeftijd te verkopen, ook zonder tekort.
                  </p>
                </div>
              )}

              {saleStand === 'vast_moment' && (
                <div className="space-y-3">
                  {/* Leeftijd of datum — één van beide. */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSaleMomentMode('leeftijd')}
                      className={`flex-1 rounded-[var(--r)] border px-3 py-2.5 text-xs font-medium transition-colors ${
                        saleMomentMode === 'leeftijd'
                          ? 'border-horizon-400 bg-horizon-50 text-horizon-800'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
                      }`}
                    >
                      Op leeftijd
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaleMomentMode('datum')}
                      className={`flex-1 rounded-[var(--r)] border px-3 py-2.5 text-xs font-medium transition-colors ${
                        saleMomentMode === 'datum'
                          ? 'border-horizon-400 bg-horizon-50 text-horizon-800'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
                      }`}
                    >
                      Op datum
                    </button>
                  </div>
                  {saleMomentMode === 'leeftijd' ? (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Leeftijd</label>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={saleTriggerAge}
                        onChange={(e) => setSaleTriggerAge(e.target.value)}
                        placeholder="Bijv. 67"
                        className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Datum</label>
                      <input
                        type="date"
                        value={saleTriggerDate}
                        onChange={(e) => setSaleTriggerDate(e.target.value)}
                        className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Gedeelde optionele velden bij 'vast_moment' en 'wanneer_nodig'. */}
              {saleStand !== 'niet_verkopen' && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                      Verkoopkosten % <span className="text-[var(--ink-4)]">(optioneel)</span>
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      inputMode="decimal"
                      value={saleCostsPct}
                      onChange={(e) => setSaleCostsPct(e.target.value)}
                      placeholder="Bijv. 6"
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                    <p className="mt-1 text-[10px] text-[var(--ink-4)]">
                      Kosten die van de opbrengst afgaan (makelaar, overdracht). Leeg = standaard voor dit type.
                    </p>
                  </div>

                  {activeDebts.length > 0 && (
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                        Aflossen bij verkoop <span className="text-[var(--ink-4)]">(optioneel)</span>
                      </label>
                      <p className="mb-2 text-[10px] text-[var(--ink-4)]">
                        Kies welke schulden je met de opbrengst aflost.
                      </p>
                      <div className="space-y-1.5">
                        {activeDebts.map((d) => {
                          const checked = salePayoffDebtIds.includes(d.id)
                          return (
                            <label
                              key={d.id}
                              className="flex cursor-pointer items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setSalePayoffDebtIds((prev) =>
                                    e.target.checked ? [...prev, d.id] : prev.filter((id) => id !== d.id)
                                  )
                                }
                                className="rounded border-[var(--border-md)] accent-horizon-600"
                              />
                              <span className="min-w-0 truncate">{d.name}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Notities (optioneel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
          </div>
        </div>

        {validationError && (
          <div className="mx-6 mt-3 rounded-[var(--r)] border border-negative/30 bg-negative/10 px-4 py-2 text-sm text-negative" data-testid="asset-validation-error">
            {validationError}
          </div>
        )}

        {/* Inline Annuleren/Opslaan — alleen in standalone-mode. In
            embedded-mode levert de pane-wrapper deze knoppen via
            `primaryAction` + `secondaryAction` in de pane-footer. */}
        {!embedded && (
          <div className="mt-5 flex justify-end gap-2 px-6 pb-6">
            <button
              onClick={onClose}
              className="rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              Annuleren
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name || !currentValue}
              className="rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : isEdit ? 'Opslaan' : 'Toevoegen'}
            </button>
          </div>
        )}
    </MaybeBottomSheet>
  )
}

// ── Shared types & components for valuations ─────────────────

export type Valuation = {
  id: string
  user_id: string
  entity_type: string
  entity_id: string
  valuation_date: string
  value: number
  notes: string | null
  created_at: string
}

export function ValuationModal({
  entityId,
  entityType,
  entityName,
  entitySubtype,
  netWorthInclusionPct,
  currentValue,
  onClose,
  onSaved,
}: {
  entityId: string
  entityType: 'asset' | 'debt'
  entityName: string
  entitySubtype: string
  netWorthInclusionPct?: number | null
  currentValue: number
  onClose: () => void
  onSaved: () => void
}) {
  const fc = useFc()
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [value, setValue] = useState(String(currentValue))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [hasActiveHoldings, setHasActiveHoldings] = useState(false)
  const [holdingsCount, setHoldingsCount] = useState(0)

  // Check if asset has active holdings (blocks manual revaluation)
  useEffect(() => {
    if (entityType === 'asset') {
      fetch(`/api/assets/has-holdings?asset_id=${entityId}`)
        .then(res => res.json())
        .then(data => {
          setHasActiveHoldings(data.has_holdings === true)
          setHoldingsCount(data.holdings_count || 0)
        })
        .catch(() => { /* non-critical */ })
    }
  }, [entityId, entityType])

  async function handleSave() {
    if (!value || hasActiveHoldings) return
    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Insert valuation record
    const { error: valError } = await supabase.from('valuations').upsert({
      user_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
      valuation_date: date,
      value: Number(value),
      notes: notes || null,
    }, { onConflict: 'entity_id,valuation_date' })

    if (valError) {
      console.error('Valuation error:', valError)
      setSaving(false)
      return
    }

    // Update the entity's current value
    const table = entityType === 'asset' ? 'assets' : 'debts'
    const column = entityType === 'asset' ? 'current_value' : 'current_balance'
    await supabase.from(table).update({ [column]: Number(value) }).eq('id', entityId)

    // Mirror naar balance_snapshots op de gekozen valuation_date.
    await upsertSingleBalanceSnapshot(supabase, user.id, date, {
      type: entityType,
      id: entityId,
      name: entityName,
      subtype: entitySubtype,
      balance: Number(value),
      netWorthInclusionPct,
    })

    setSaving(false)
    onSaved()
  }

  const label = entityType === 'asset' ? 'Herwaarderen' : 'Saldo bijwerken'

  return (
    <BottomSheet open={true} onClose={onClose} title={label} size="md">
        <div className="px-6">
        <p className="mb-4 text-sm text-[var(--ink-3)]">{entityName}</p>

        {/* Warning when holdings are active */}
        {hasActiveHoldings && (
          <div className="mb-4 flex items-start gap-2 rounded-[var(--r)] bg-kern-50 border border-kern-200 px-3 py-2" data-testid="valuation-holdings-warning">
            <Briefcase className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kern-600" />
            <p className="text-xs text-kern-700">
              Deze asset heeft {holdingsCount} actieve holding{holdingsCount !== 1 ? 's' : ''}. De waarde wordt automatisch berekend uit de portfolio tracker. Handmatig herwaarderen is niet mogelijk.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Datum</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
              {entityType === 'asset' ? 'Nieuwe waarde' : 'Nieuw saldo'}
            </label>
            <input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              Huidige waarde: {fc(currentValue)}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Notitie (optioneel)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              placeholder="Reden van waardewijziging..."
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !value}
            className="rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
          >
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
        </div>
    </BottomSheet>
  )
}


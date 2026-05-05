'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import {
  type Asset,
  type AssetType,
  ASSET_TYPE_COLORS,
  ASSET_TYPE_LABELS,
} from '@/lib/asset-data'
import type { BudgetsPageData } from '@/lib/budgets-data-loader'
import type { HoldingsPageData } from '@/lib/holdings-data-loader'
import type { CorePageData } from '@/lib/core-data-loader'
import type { AssetConnectionSummary } from '@/lib/connections-data'
import type {
  CryptoHoldingRow,
  CryptoTransactionRow,
  CryptoPortfolioPoint,
  CryptoPeriodReturnsBundle,
  CryptoRealizedPnL,
  CryptoSparklinePoint,
  CryptoVolatilityMetric,
  CryptoFeesSummary,
} from '@/lib/crypto-holdings-data'
import type { InvestmentHoldingRow } from '@/lib/investment-holdings-data'
import type { CategoryHistoryData } from '@/lib/load-category-history'
import { MaskedAmount } from '@/components/app/masked-amount'
import { buildKpiContext, type KpiContextRefs } from '@/lib/kpi-context'
import { computeAssetKpi, type KpiPair } from '@/lib/asset-kpi'
import { useFeatureAccess } from '@/components/app/feature-access-provider'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
import { CashOverview } from '@/components/app/cash-overview'
import { AddCategoryCard } from './add-category-card'
import { VermogenAssetCard } from './vermogen-asset-card'
import { CategoryTabs, type CategoryTab } from './category-tabs'
import { CategoryHistoryChart } from './category-history-chart'
import { ModuleTipStrip } from './module-tip-strip'
import { CoreKengetallen } from './core-kengetallen'
import { AssetDetailFlow } from './asset-detail-flow'
import {
  findDeepenings,
  getDeepeningComponent,
  getDeepeningSlug,
  type DeepeningEntry,
} from './category-deepening-registry'

// ── Constants ────────────────────────────────────────────────

/**
 * Items-tab is de eerste tab op elke categorie-pagina. Een tweede tab wordt
 * dynamisch toegevoegd wanneer er een verdieping in het registry staat voor
 * dit type — onafhankelijk van of de bijbehorende module actief is. Wanneer
 * de module uit staat blijft de tab zichtbaar en toont de inhoud een
 * tip-strip met deeplink naar Instellingen.
 */
const ITEMS_TAB_KEY = 'items'

// ── Helpers ──────────────────────────────────────────────────

/**
 * Item-label per type — vermijdt awkward formules zoals "Cash & Spaargeld
 * geregistreerd". We gebruiken een korter, instinctief begrip ("rekening",
 * "belegging", "huis") in counts en CTA's.
 */
function itemNoun(type: AssetType, count: number): string {
  const map: Record<AssetType, [string, string]> = {
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
  const [singular, plural] = map[type]
  return count === 1 ? singular : plural
}

/** Korter actie-label voor het toevoeg-CTA (bv. "Voeg rekening toe"). */
function addItemCta(type: AssetType): string {
  return `Voeg ${itemNoun(type, 1)} toe`
}

// ── Props ────────────────────────────────────────────────────

interface AssetCategoryPageProps {
  /** Validated AssetType — server-component heeft `notFound()` gedraaid bij invalid type. */
  type: AssetType
  /** Initiële assets, server-side geladen. Client kan deze later updaten. */
  initialAssets: Asset[]
  /**
   * Server-geladen budget-data, alleen relevant voor `type === 'cash'`. Wordt
   * doorgegeven aan de Budgetteren-verdieping zodat `<BudgetsClient />` direct
   * met server-data kan renderen (geen client-fetch waterfall). `undefined`
   * wanneer de module uit staat of de fetch faalde — de tab vangt dat zelf op.
   */
  initialBudgetsData?: BudgetsPageData
  /**
   * Server-geladen holdings-data, alleen relevant voor `type === 'investment'`.
   * Doorgegeven aan de Holdings-verdieping zodat `<HoldingsPage />` direct
   * kan renderen. `undefined` valt netjes terug op een eigen client-fetch
   * binnen `HoldingsPage` of een empty-state.
   */
  initialHoldingsData?: HoldingsPageData
  /**
   * Server-geladen Kern-data, alleen relevant voor `type === 'cash'`. Wordt
   * gebruikt om de financiële kencijfers (geschat jaarinkomen, jaarlijkse
   * must-uitgaven) en de volledige cash-overview te tonen bovenaan de pagina.
   */
  initialCoreData?: CorePageData
  /**
   * Mapping van cash-asset-ID → bank-account-ID, alleen relevant voor
   * `type === 'cash'`. Wanneer een cash-asset `has_budget_tracking=true`
   * heeft én een bijbehorende rij in `bank_accounts` (1:1 koppeling), dan
   * navigeren we bij een klik op de asset-card naar de cash-detail-pagina
   * (`/core/assets/cash/[bankAccountId]`). Zonder koppeling valt de klik
   * terug op de bestaande `<AssetDetailFlow />` bottom-sheet.
   */
  bankAccountByAssetId?: Record<string, string>
  /**
   * Lichtgewicht refs (assets+debts+holdings) voor de KPI-strip onder elke
   * asset-card. Server laadt deze parallel met de hoofdquery; bij `undefined`
   * (load-failure of KPI's nog niet relevant voor dit type) vervalt de
   * strip op de individuele kaarten en blijft de pagina functioneel.
   */
  initialKpiRefs?: KpiContextRefs
  /**
   * Mapping van asset-ID → actieve externe koppeling, alleen relevant voor
   * `type === 'crypto'` (R2). Wordt op de kaart als kleine indicator-badge
   * getoond. `undefined` of een lege map → geen badges, kaart valt terug op
   * de standaard rendering.
   */
  initialConnectionsByAssetId?: Record<string, AssetConnectionSummary>
  /**
   * Typed crypto-holding rijen (P3). Alleen relevant voor `type === 'crypto'`.
   * Wanneer aanwezig vervangt de items-tab de oude `VermogenAssetCard`-grid
   * door een grid van `CryptoHoldingCard` per coin — bron-badge + plug-status
   * inbegrepen. Lege array → empty-state of fallback op asset-cards.
   */
  initialCryptoHoldings?: CryptoHoldingRow[]
  /**
   * Recente crypto-transacties — gevoed door `loadRecentCryptoTransactions`.
   * Alleen relevant voor `type === 'crypto'`. Doorgegeven aan de Holdings-app
   * voor de transactie-feed onderaan. Lege array → feed-sectie blijft uit.
   */
  initialCryptoTransactions?: CryptoTransactionRow[]
  /**
   * Dagelijkse waarde-snapshots over de afgelopen N dagen voor de
   * performance-chart in de crypto Holdings-app. Alleen voor `type ==='crypto'`.
   */
  initialCryptoHistory?: CryptoPortfolioPoint[]
  /**
   * Aantal dagen dat `initialCryptoHistory` dekt. Tonen we als chart-header
   * label ("Waarde-evolutie · 30 dagen"). Default 30 wanneer omitted.
   */
  cryptoHistoryDaysBack?: number
  /**
   * Per-periode rendementen (24u/7d/30d/1j/All) — vooraf-berekend voor de
   * KPI-strip period-toggle. Optional; ontbreken → toggle valt terug op een
   * "—"-cijfer per periode.
   */
  initialCryptoPeriodReturns?: CryptoPeriodReturnsBundle
  /**
   * Realized vs unrealized P&L splitsing voor de sub-strip onder de KPI-row.
   * Optional; ontbreken → sub-strip toont 0,00 met label "Geen verkopen".
   * Berekend via weighted-average cost basis (default).
   */
  initialCryptoRealizedPnL?: CryptoRealizedPnL
  /**
   * FIFO-variant van de realized/unrealized berekening — wordt parallel met
   * de weighted-avg variant geladen zodat de KPI-strip toggle client-side
   * schakelt zonder roundtrip.
   */
  initialCryptoRealizedPnLFifo?: CryptoRealizedPnL
  /**
   * Per-holding 7-daagse close-prijs reeks voor de sparkline-kolom in de
   * tabel-view van de Holdings-app. Alleen relevant voor `type === 'crypto'`.
   * Holdings die ontbreken in de map → tabel toont een neutrale streep.
   */
  initialCryptoSparklines?: Record<string, CryptoSparklinePoint[]>
  /**
   * Benchmark-prijshistorie (BTC) over hetzelfde venster als
   * `initialCryptoHistory`. Wordt door de performance-chart gebruikt voor de
   * BTC-overlay (toggle Geen|BTC|ETH). Lege array → toggle blijft, maar de
   * BTC-optie krijgt een tooltip "Niet beschikbaar".
   */
  initialCryptoBenchmarkBtc?: { date: string; close: number }[]
  /** Idem voor ETH-overlay. */
  initialCryptoBenchmarkEth?: { date: string; close: number }[]
  /**
   * Portfolio-volatiliteit (90-daagse stdev van dagelijkse returns) voor de
   * Risico-sub-strip in de KPI. Ontbreken → cel toont "—".
   */
  initialCryptoVolatility?: CryptoVolatilityMetric
  /**
   * Totaal transactiekosten over alle crypto_transactions, geconverteerd
   * naar EUR + breakdown per exchange. Ontbreken → fees-cel toont "—".
   */
  initialCryptoFees?: CryptoFeesSummary
  /**
   * Typed investment-holding rijen (P3). Alleen relevant voor
   * `type === 'investment'`. Items-tab toont per ISIN-positie een kaart;
   * de Holdings-app embed (deepening) blijft zijn eigen `HoldingsPageData`-
   * pad gebruiken.
   */
  initialInvestmentHoldings?: InvestmentHoldingRow[]
  /**
   * Per-asset 6-maands sparkline-waarden voor de achtergrond-breuklijn op
   * elke `<VermogenAssetCard>`. Server-side gebouwd uit `balance_snapshots`
   * via `loadEntitySparklines()`. Assets zonder historie staan niet in de
   * map — de overlay valt dan terug op een rechte scheidingslijn.
   */
  initialAssetSparklines?: Record<string, number[]>
  /**
   * 12-maands cumulatieve historie voor `<CategoryHistoryChart>`. Server-side
   * geladen voor niet-cash categorieën; cash heeft eigen overzicht-secties
   * (`CashOverview` + `CoreKengetallen`) onder de items-tab. `undefined` of
   * een lege reeks → chart wordt niet gerenderd.
   */
  historyData?: CategoryHistoryData
}

// ── Component ────────────────────────────────────────────────

/**
 * Categorie-pagina voor één asset-type. Hergebruikt `VermogenAssetCard` voor
 * de items-tab en raadpleegt de deepening-registry voor een optionele
 * tweede tab (Budgetteren bij `cash`, Holdings bij `investment`).
 *
 * Routing:
 * - URL-state: `?tab=items` (default) of `?tab=<deepeningKey>`. Elke wissel
 *   gebruikt `router.replace` zodat de browser-back-knop correct terugkeert
 *   naar `/core` in plaats van te bouncen door tab-history.
 * - Onbekende `?tab=…` waarde valt terug op de items-tab.
 *
 * Module-fallback:
 * - Verdieping zonder actieve module → `<ModuleTipStrip />` op de items-tab
 *   onderaan (subtiel, geen pop-up). De verdiepings-tab zelf rendert dan een
 *   teaser i.p.v. data.
 *
 * Design (UX-skill):
 * - Mini-hero in krant-stijl: kicker (UPPERCASE 11px) + groot bedrag (DM Mono
 *   tabular-nums) + meta-regel (count + items). Geen kaart-rand — alleen
 *   onder-border om de hero te scheiden van de tab-content.
 * - Items-grid: 1-koloms op mobiel, 2-koloms op tablet, 3-koloms op desktop.
 * - Empty state: krant-kicker "GEEN [type] GEREGISTREERD" + Source Serif
 *   italic uitleg-zin + primaire CTA "+ Voeg [type] toe".
 */
export function AssetCategoryPage({
  type,
  initialAssets,
  initialBudgetsData,
  initialHoldingsData,
  initialCoreData,
  bankAccountByAssetId,
  initialKpiRefs,
  initialConnectionsByAssetId,
  initialCryptoHoldings,
  initialCryptoTransactions,
  initialCryptoHistory,
  cryptoHistoryDaysBack,
  initialCryptoPeriodReturns,
  initialCryptoRealizedPnL,
  initialCryptoRealizedPnLFifo,
  initialCryptoSparklines,
  initialCryptoBenchmarkBtc,
  initialCryptoBenchmarkEth,
  initialCryptoVolatility,
  initialCryptoFees,
  initialInvestmentHoldings,
  initialAssetSparklines,
  historyData,
}: AssetCategoryPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeModules } = useFeatureAccess()

  // Assets zijn server-geladen; client houdt geen Supabase-poll. Mutaties
  // vinden plaats via de QuickAddWizard en sturen `router.refresh()` zodat
  // de server-component opnieuw laadt — daarna update React de prop.
  const assets = initialAssets
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  )

  // ── Deepening-resolutie ───────────────────────────────────
  // Een categorie kan meerdere apps hebben (bv. mortgage → Aflosstrategie +
  // Hypotheekplanner). We loopen één keer per render door de registry-
  // entries en cachen het resultaat (`deepenings`) achter useMemo zodat
  // identiteit stabiel blijft zolang `type` niet verandert — anders zou
  // `findDeepenings` elke render een nieuwe array opleveren en alle
  // afhankelijke `useMemo` / effects nodeloos triggeren.
  const deepenings = useMemo(() => findDeepenings(type, 'asset'), [type])
  // Eerste deepening blijft beschikbaar voor module-uit fallback (tip-strip
  // en module-active flag onder de items-tab — ongewijzigd gedrag voor de
  // single-app categorieën die er waren).
  const primaryDeepening = deepenings[0]
  const moduleActive = primaryDeepening
    ? activeModules.includes(primaryDeepening.moduleId)
    : false

  // Tabs: items + één tab per registry-entry. Slug uit `getDeepeningSlug()`
  // dient als URL-state én als component-lookup-key bij multi-app
  // categorieën.
  const tabs = useMemo<CategoryTab[]>(() => {
    const base: CategoryTab[] = [
      { key: ITEMS_TAB_KEY, label: itemsTabLabel(type) },
    ]
    for (const entry of deepenings) {
      // Component-lookup vindt plaats in render-laag; tab wordt alleen
      // toegevoegd als er ook werkelijk een component voor de slug bestaat.
      const slug = getDeepeningSlug(entry)
      if (getDeepeningComponent(type, 'asset', slug) !== undefined) {
        base.push({ key: slug, label: entry.label })
      }
    }
    return base
  }, [type, deepenings])

  // ── URL-state synchronisatie ──────────────────────────────
  const requestedTab = searchParams.get('tab')
  const activeTabKey = useMemo(() => {
    // Onbekende ?tab=… waardes negeren we — items is altijd een veilige
    // fallback en voorkomt 404-achtig gedrag bij verkeerde deeplinks.
    if (requestedTab && tabs.some((t) => t.key === requestedTab)) {
      return requestedTab
    }
    return ITEMS_TAB_KEY
  }, [requestedTab, tabs])

  const handleTabChange = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (key === ITEMS_TAB_KEY) {
        params.delete('tab')
      } else {
        params.set('tab', key)
      }
      const queryString = params.toString()
      router.replace(
        `/core/assets/${type}${queryString ? `?${queryString}` : ''}`,
        { scroll: false },
      )
    },
    [router, searchParams, type],
  )

  // Wanneer de deepening verdwijnt (module wordt extern uitgezet en het
  // registry-component bestaat niet meer) corrigeren we de URL — zo land
  // je niet op een tab die niet meer in de tablist staat.
  useEffect(() => {
    if (
      requestedTab &&
      !tabs.some((tab) => tab.key === requestedTab)
    ) {
      handleTabChange(ITEMS_TAB_KEY)
    }
  }, [handleTabChange, requestedTab, tabs])

  // ── Afgeleide waarden ─────────────────────────────────────
  // De mini-hero rapporteert per categorie altijd de som van de asset-
  // current_value en het aantal asset-cards — symmetrisch met cash,
  // eigen_huis en de overige types. De typed holding-rijen voor crypto/
  // investment voeden via `initialData` de Holdings-app verdieping; ze
  // worden niet meer als kaart op de items-tab gerenderd (R5).
  const total = useMemo(
    () => assets.reduce((sum, asset) => sum + Number(asset.current_value), 0),
    [assets],
  )
  const count = assets.length

  // ── KPI's per asset voor de strip onder elke kaart ────────
  // We bouwen de context één keer (Maps voor holdings + linked-debts) en
  // dispatchen vervolgens per asset naar `computeAssetKpi`. Wanneer
  // `initialKpiRefs` ontbreekt (server load failure of nog niet beschikbaar)
  // bouwen we een lege context — `computeAssetKpi` levert dan KPI's die
  // alleen lokale velden gebruiken (rente uit `expected_return` etc.) en
  // overslaat wat external context nodig heeft (LTV, overwaarde).
  const kpiByAssetId = useMemo(() => {
    const ctx = initialKpiRefs
      ? buildKpiContext({
          assets: initialKpiRefs.assets as unknown as Parameters<typeof buildKpiContext>[0]['assets'],
          debts: initialKpiRefs.debts as unknown as Parameters<typeof buildKpiContext>[0]['debts'],
          holdings: initialKpiRefs.holdings,
          cashStatsByAssetId: initialKpiRefs.cashStats,
        }).asset
      : {}
    const map = new Map<string, KpiPair>()
    for (const asset of assets) {
      const pair = computeAssetKpi(asset, ctx)
      if (pair.primary || pair.secondary) {
        map.set(asset.id, pair)
      }
    }
    return map
  }, [assets, initialKpiRefs])
  const isItemsTab = activeTabKey === ITEMS_TAB_KEY
  // Tip-strip onderaan de items-tab: tonen wanneer de eerste app van de
  // categorie nog niet geactiveerd is. Bij multi-app wordt alleen de eerste
  // app benoemd in de strip — meer dan dat zou de copy onleesbaar maken.
  const showTipStrip =
    isItemsTab && primaryDeepening !== undefined && !moduleActive

  // ── Actieve deepening ─────────────────────────────────────
  // Wanneer een verdiepings-tab actief is, zoeken we de bijbehorende entry
  // en component op basis van de slug in de URL. moduleActive wordt per
  // entry herberekend zodat elke app zijn eigen module-flag respecteert.
  //
  // De lookup teruggegeven referentie is stabiel per (type, kind, slug):
  // `getDeepeningComponent` leest uit een module-level `DEEPENING_COMPONENTS`
  // record dat éénmaal wordt geconstrueerd, dus dezelfde slug levert altijd
  // dezelfde React component-referentie. De `react-hooks/static-components`
  // waarschuwing slaat hier niet op werkelijke runtime-stabiliteit —
  // hetzelfde patroon zit elders in deze codebase (`category-card.tsx`
  // resolveert ook icons dynamisch op render).
  const activeDeepening: DeepeningEntry | undefined = deepenings.find(
    (entry) => !isItemsTab && getDeepeningSlug(entry) === activeTabKey,
  )
  const ActiveDeepeningComponent = getDeepeningComponent(
    type,
    'asset',
    activeTabKey,
  )
  const activeDeepeningModuleActive = activeDeepening
    ? activeModules.includes(activeDeepening.moduleId)
    : false

  // Klik op een asset: voor cash met `has_budget_tracking=true` én een
  // gekoppelde bank-account-rij navigeren we naar de volledige
  // cash-detail-pagina — daar zit de transactie-historie, herhalingen,
  // import en bewerken bij elkaar. In alle andere gevallen openen we de
  // lokale BottomSheet (lichte preview met optionele deep-link naar de
  // bewerk-flow). Zo blijven niet-getrackte cash-assets en alle andere
  // asset-types netjes binnen het bestaande BottomSheet-patroon.
  const openAssetDetail = useCallback(
    (asset: Asset) => {
      if (asset.has_budget_tracking) {
        const accId = bankAccountByAssetId?.[asset.id]
        if (accId) {
          router.push(`/core/assets/cash/${accId}`)
          return
        }
      }
      setSelectedAssetId(asset.id)
    },
    [bankAccountByAssetId, router],
  )

  return (
    <div className="mx-auto max-w-6xl">
      <CategoryHero type={type} total={total} count={count} />

      <div className="px-4 sm:px-6">
        <CategoryTabs
          tabs={tabs}
          activeKey={activeTabKey}
          onChange={handleTabChange}
          className="mt-4"
        />

        <div
          role="tabpanel"
          id={`category-tabpanel-${activeTabKey}`}
          aria-labelledby={`category-tab-${activeTabKey}`}
          className="py-6"
        >
          {isItemsTab ? (
            <>
              {/* Volgorde voor cash:
                  1. ItemsTab — de standaard asset-cards (alle cash-assets,
                     ook handmatig ingevoerde zonder bank-account-rij).
                  2. CashOverview embedded — toont alleen hero (totaal
                     liquiditeit) + geldstroom; rekeningen-sectie en snelle
                     acties zijn verborgen omdat die overlappen met de
                     items-grid en de detail-pagina's.
                  3. CoreKengetallen — financiële kencijfers onderaan.
                  Andere types tonen alleen de items-tab. */}
              <ItemsTab
                type={type}
                assets={assets}
                kpiByAssetId={kpiByAssetId}
                connectionsByAssetId={initialConnectionsByAssetId}
                sparklinesByAssetId={initialAssetSparklines}
                onItemClick={openAssetDetail}
                onAddClick={() => setQuickAddOpen(true)}
              />

              {type !== 'cash' && historyData && (
                <section className="mt-8">
                  <CategoryHistoryChart
                    variant="asset"
                    subtype={type}
                    initialData={historyData}
                  />
                </section>
              )}

              {type === 'cash' && (
                <div className="mt-8 -mx-4 sm:-mx-6">
                  <CashOverview embedded hideAccountsSection hideQuickActions />
                </div>
              )}

              {type === 'cash' && initialCoreData && (
                <div className="mt-10 -mx-4 sm:-mx-6">
                  <CoreKengetallen
                    yearlyIncome={initialCoreData.rawFinancials.extrapolatedIncome}
                    incomeMonths={initialCoreData.incomeMonths}
                    incomeByMonth={initialCoreData.incomeByMonth}
                    yearlyMustExpenses={initialCoreData.rawFinancials.yearlyMustExpenses}
                    mustExpenseItems={initialCoreData.mustExpenseItems}
                    retirementMethod={initialCoreData.retirementMethodUsed}
                    budgetingActive={initialCoreData.budgetingActive}
                  />
                </div>
              )}
            </>
          ) : ActiveDeepeningComponent ? (
            <ActiveDeepeningComponent
              type={type}
              moduleActive={activeDeepeningModuleActive}
              initialData={
                type === 'cash'
                  ? initialBudgetsData
                  : type === 'investment'
                    ? initialHoldingsData
                    : type === 'crypto'
                      ? {
                          // Bundle-vorm voor de crypto Holdings-app: holdings +
                          // transacties + dagelijkse waarde-snapshots. De tab-
                          // wrapper (`CryptoHoldingsTab`) accepteert zowel de
                          // legacy array-vorm als deze bundle, dus oudere
                          // call-sites blijven werken.
                          holdings: initialCryptoHoldings ?? [],
                          transactions: initialCryptoTransactions ?? [],
                          history: initialCryptoHistory ?? [],
                          historyDaysBack: cryptoHistoryDaysBack ?? 30,
                          periodReturns: initialCryptoPeriodReturns,
                          realizedPnL: initialCryptoRealizedPnL,
                          realizedPnLFifo: initialCryptoRealizedPnLFifo,
                          sparklinesByHoldingId: initialCryptoSparklines,
                          benchmarkBtc: initialCryptoBenchmarkBtc,
                          benchmarkEth: initialCryptoBenchmarkEth,
                          volatility: initialCryptoVolatility,
                          fees: initialCryptoFees,
                        }
                      : undefined
              }
            />
          ) : null}
        </div>

        {showTipStrip && primaryDeepening && (
          <ModuleTipStrip copy={primaryDeepening.tipStripCopy} className="mb-6" />
        )}
      </div>

      <QuickAddWizard
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        initialIntent="asset"
        initialAssetType={type}
        onSaved={() => {
          setQuickAddOpen(false)
          router.refresh()
        }}
      />

      <AssetDetailFlow
        asset={selectedAsset}
        onClose={() => setSelectedAssetId(null)}
        onAfterSave={() => router.refresh()}
      />
    </div>
  )
}

// ── Items-tab label ──────────────────────────────────────────

/**
 * Sentence-case label voor de items-tab. Cash en savings krijgen
 * "Rekeningen", investment "Posities", etc. — alle types zonder duidelijke
 * Nederlandse term vallen terug op "Items".
 */
function itemsTabLabel(type: AssetType): string {
  const labels: Partial<Record<AssetType, string>> = {
    cash: 'Rekeningen',
    savings: 'Rekeningen',
    investment: 'Posities',
    retirement: 'Regelingen',
    eigen_huis: 'Woning',
    real_estate: 'Objecten',
    crypto: 'Posities',
    vehicle: 'Voertuigen',
    physical: 'Items',
    deelneming: 'Deelnemingen',
    levensverzekering: 'Polissen',
    vordering: 'Vorderingen',
    other: 'Items',
  }
  return labels[type] ?? 'Items'
}

// ── Mini-hero ────────────────────────────────────────────────

interface CategoryHeroProps {
  type: AssetType
  total: number
  count: number
}

/**
 * Krant-stijl mini-hero bovenaan de categorie-pagina. Toont een terug-link,
 * de kicker, het totaalbedrag groot, en een meta-regel met item-aantal +
 * een dunne bar in de type-kleur (visuele aankondiging zonder de tekst te
 * kleuren — krant-discipline).
 */
function CategoryHero({ type, total, count }: CategoryHeroProps) {
  const accentColor = ASSET_TYPE_COLORS[type]
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })

  return (
    <section className="border-b border-[var(--border-ed)] bg-[var(--paper)]">
      {/* Module-active accent (Kern-500 op /core/assets/**) */}
      <div className="h-1" style={{ background: 'var(--module-active-500)' }} />

      <div className="px-4 py-5 sm:px-6 sm:py-7">
        {/* Kicker met 28×1px streep — editorial signature-element */}
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          {ASSET_TYPE_LABELS[type]}
        </div>

        {/* Hoofdbedrag met halve transparante streep (module-active-200) */}
        <p
          className="mt-2 leading-none tracking-tight text-[var(--ink)]"
          style={{
            fontFamily: 'var(--font-playfair, var(--font-mono, monospace))',
          }}
        >
          <span
            className="inline px-1"
            style={{
              backgroundImage:
                'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
            }}
          >
            <MaskedAmount
              value={total}
              tone="kern"
              monoWhenVisible={false}
              className="text-[28px] font-bold leading-none tracking-tight sm:text-[36px]"
            />
          </span>
        </p>

        {/* Sub-meta in italic Source Serif (vervangt UPPERCASE) + type-bar */}
        <div
          ref={ref as unknown as React.RefObject<HTMLDivElement>}
          className="mt-3 flex items-center gap-3"
        >
          <div
            className="h-1 w-16 overflow-hidden bg-[var(--subtle)]"
            aria-hidden="true"
          >
            <span
              className="block h-full"
              style={{
                width: hasEntered ? '100%' : '0%',
                backgroundColor: accentColor,
                transition: 'width 600ms cubic-bezier(.22,1,.36,1)',
              }}
            />
          </div>
          <p
            className="italic text-[12px] text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
          >
            {count} {itemNoun(type, count)}
          </p>
        </div>
      </div>
    </section>
  )
}

// ── Items-tab ────────────────────────────────────────────────

interface ItemsTabProps {
  type: AssetType
  assets: Asset[]
  kpiByAssetId?: Map<string, KpiPair>
  connectionsByAssetId?: Record<string, AssetConnectionSummary>
  sparklinesByAssetId?: Record<string, number[]>
  onItemClick: (asset: Asset) => void
  onAddClick: () => void
}

/**
 * Lijst van items in deze categorie + toevoeg-CTA. Eén kaart per asset/
 * koppeling — symmetrisch over alle asset-types (cash, investment, crypto,
 * eigen_huis, …). Diepere holdings-data leeft op de Holdings-app verdiepings-
 * tab (investment, crypto) en op de asset-detail-sheet. Empty state behoudt
 * krant-toon: kicker + serif-italic uitleg + duidelijke primaire actie.
 */
function ItemsTab({
  type,
  assets,
  kpiByAssetId,
  connectionsByAssetId,
  sparklinesByAssetId,
  onItemClick,
  onAddClick,
}: ItemsTabProps) {
  if (assets.length === 0) {
    return <EmptyItemsState type={type} onAddClick={onAddClick} />
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {assets.map((asset, idx) => (
        <VermogenAssetCard
          key={asset.id}
          asset={asset}
          kpiPair={kpiByAssetId?.get(asset.id)}
          connection={connectionsByAssetId?.[asset.id]}
          sparklineValues={sparklinesByAssetId?.[asset.id]}
          onClick={onItemClick}
          staggerIndex={idx}
        />
      ))}
      <AddCategoryCard
        label={addItemCta(type)}
        onClick={onAddClick}
        variant="asset"
        shape="item"
        staggerIndex={assets.length}
      />
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────

interface EmptyItemsStateProps {
  type: AssetType
  onAddClick: () => void
}

/**
 * Empty state met krant-stijl kicker + serif-italic uitleg-zin. Voldoet aan
 * de UX-skill regel "geen doodlopende lege lijst" — er is altijd een
 * primaire CTA met een outcome-georiënteerd label.
 */
function EmptyItemsState({ type, onAddClick }: EmptyItemsStateProps) {
  const noun = itemNoun(type, 1)
  return (
    <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-10 text-center">
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Geen {itemNoun(type, 2)} geregistreerd
      </p>
      <p className="mt-2 font-serif italic text-base leading-relaxed text-[var(--ink-2)]">
        Voeg je eerste {noun} toe om hier te beginnen — vrijheid begint bij overzicht.
      </p>
      <button
        type="button"
        onClick={onAddClick}
        className="mt-4 inline-flex h-11 items-center gap-2 border border-kern-300 bg-kern-50 px-4 text-sm font-medium text-kern-700 transition-colors hover:bg-kern-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {addItemCta(type)}
      </button>
    </div>
  )
}

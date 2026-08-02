import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  ASSET_CLIENT_COLUMNS,
  ASSET_TYPE_LABELS,
  type Asset,
  type AssetType,
} from '@/lib/asset-data'
import {
  loadBudgetsData,
  type BudgetsPageData,
} from '@/lib/budgets-data-loader'
import {
  loadHoldingsData,
  type HoldingsPageData,
} from '@/lib/holdings-data-loader'
import {
  loadCryptoHoldingsForUser,
  loadRecentCryptoTransactions,
  loadCryptoPortfolioHistory,
  loadCryptoPeriodReturns,
  loadCryptoRealizedPnL,
  loadCryptoSparklineData,
  loadBenchmarkHistory,
  loadCryptoPortfolioVolatility,
  loadCryptoFeesSummary,
  type CryptoHoldingRow,
  type CryptoTransactionRow,
  type CryptoPortfolioPoint,
  type CryptoPeriodReturnsBundle,
  type CryptoRealizedPnL,
  type CryptoSparklinePoint,
  type CryptoVolatilityMetric,
  type CryptoFeesSummary,
} from '@/lib/crypto-holdings-data'
import {
  loadInvestmentHoldingsForUser,
  type InvestmentHoldingRow,
} from '@/lib/investment-holdings-data'
import { loadCoreData, type CorePageData } from '@/lib/core-data-loader'
import { loadKpiContextRefs, type KpiContextRefs } from '@/lib/kpi-context'
import {
  loadConnectionsByAssetIds,
  type AssetConnectionSummary,
} from '@/lib/connections-data'
import { loadEntitySparklines } from '@/lib/load-entity-sparklines'
import {
  loadCategoryHistory,
  type CategoryHistoryData,
} from '@/lib/load-category-history'
import { AssetCategoryPage } from '@/components/core/asset-category-page'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'

// ── Type guards ──────────────────────────────────────────────

const VALID_ASSET_TYPES = Object.keys(ASSET_TYPE_LABELS) as AssetType[]

/**
 * Type-guard die ook `notFound()`-friendly werkt: alles wat niet exact in
 * de `ASSET_TYPE_LABELS`-keyset zit telt als een verkeerde URL en hoort een
 * 404 te krijgen — geen leeg scherm.
 */
function isValidAssetType(value: string): value is AssetType {
  return (VALID_ASSET_TYPES as string[]).includes(value)
}

// ── Page ─────────────────────────────────────────────────────

/**
 * Server-component voor `/core/assets/[type]`. Valideert de URL-parameter,
 * laadt de assets in deze categorie en delegeert aan de client-component
 * `<AssetCategoryPage />`.
 *
 * Geen module-eis — registratie zonder verdieping is een volwaardige
 * use-case (CLAUDE.md fundament-regel). De verdieping zelf valt terug op
 * een tip-strip wanneer de bijbehorende module uit staat.
 *
 * Errors van Supabase tonen we als editorial 404 in plaats van een lege
 * pagina — duidelijke feedback past bij krant-toon.
 */
export default async function AssetCategoryServerPage({
  params,
}: {
  params: Promise<{ type: string }>
}) {
  const { type } = await params

  // Cash heeft nu een eigen landing op de cashflow-route — stuur door vóór
  // de validatiecheck zodat andere asset-types onveranderd blijven.
  if (type === 'cash') redirect('/overzicht/cashflow')

  if (!isValidAssetType(type)) {
    notFound()
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  // Filter direct op asset_type + actieve items + huidige user. We sorteren
  // op `sort_order` zodat de categorie-pagina dezelfde volgorde aanhoudt als
  // de hoofdlijst op `/core/assets`.
  // Expliciete kolomlijst i.p.v. `select('*')`: deze rijen gaan als
  // `initialAssets` naar `<AssetCategoryPage>` (clientcomponent) en staan dus
  // volledig in de RSC-payload. De `.eq('user_id')` sluit partner-materiaal uit,
  // maar de drie account-nummer-kolommen (plaintext IBAN, ciphertext en de
  // blind index onder een server-only sleutel) horen ook in de eigen paginabron
  // niet thuis. Zie ASSET_CLIENT_COLUMNS in lib/asset-data.ts.
  const { data, error } = await supabase
    .from('assets')
    .select(ASSET_CLIENT_COLUMNS)
    .eq('user_id', user.id)
    .eq('asset_type', type)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    // Editorial fallback i.p.v. crash — gebruiker ziet een uitleg en route
    // is hervatbaar via terug-navigatie.
    return <AssetCategoryError type={type} detail={error.message} />
  }

  const assets = (data ?? []) as Asset[]

  // ── KPI-context refs ─────────────────────────────────────────
  // Lichtgewicht parallel-load — geeft de client de Maps die nodig zijn voor
  // mortgage LTV, eigen huis overwaarde en investment dagverandering. We
  // catchen fouten zodat een falende KPI-load niet de hele categorie-pagina
  // 500't; bij failure rendert de strip simpelweg geen extra KPI's.
  const kpiRefsPromise = loadKpiContextRefs(supabase).catch(() => null)

  // ── Cumulatieve categorie-historie ───────────────────────────
  // Voor niet-cash categorieën laden we 12 maanden snapshot-historie zodat
  // `<CategoryHistoryChart>` direct kan renderen zonder client-roundtrip.
  // Cash heeft eigen overzicht-componenten (CashOverview + CoreKengetallen)
  // bovenaan de items-tab, dus we besparen daar de query.
  const historyPromise: Promise<CategoryHistoryData | undefined> =
    type === 'cash'
      ? Promise.resolve(undefined)
      : loadCategoryHistory(supabase, { entityType: 'asset', subtype: type }).catch(
          () => undefined,
        )

  // ── Verdieping-data prefetch ─────────────────────────────────
  // Voor `cash` en `investment` laden we óók de bijbehorende module-data
  // server-side. Zo kunnen de tabs `<BudgetsClient />` en `<HoldingsPage />`
  // direct met `initialData` renderen — geen client-fetch waterfall.
  //
  // Bij elke fout (module uit, RLS-mismatch, lege rijen) vangen we netjes
  // af met `null`: de tab-component handelt die fallback zelf met een
  // teaser of empty-state. We willen geen 500 op de categorie-pagina als
  // alleen de verdieping-bron faalt.
  let budgetsData: BudgetsPageData | null = null
  let holdingsData: HoldingsPageData | null = null
  let coreData: CorePageData | null = null
  // P3: typed holding-rows voor crypto/investment categorie-pagina's. Voor
  // andere asset-types blijven beide arrays leeg en wordt het oude
  // VermogenAssetCard-pad gebruikt.
  let cryptoHoldings: CryptoHoldingRow[] = []
  let cryptoTransactions: CryptoTransactionRow[] = []
  let cryptoHistory: CryptoPortfolioPoint[] = []
  let cryptoPeriodReturns: CryptoPeriodReturnsBundle | undefined
  let cryptoRealizedPnL: CryptoRealizedPnL | undefined
  // FIFO-variant draait parallel met weighted_avg zodat de KPI-strip toggle
  // client-side schakelt zonder extra roundtrip. Beide methodes hangen op
  // dezelfde transactie-fetch, dus de marginale kost is laag.
  let cryptoRealizedPnLFifo: CryptoRealizedPnL | undefined
  let cryptoVolatility: CryptoVolatilityMetric | undefined
  let cryptoFees: CryptoFeesSummary | undefined
  // Per-holding 7-daagse close-prijs reeks voor de tabel-view sparklines.
  // Geladen ná de holdings-fetch zodat we exact de juiste IDs kunnen
  // batchen — voor 50 holdings × 7 dagen = ~350 rijen.
  let cryptoSparklines: Record<string, CryptoSparklinePoint[]> = {}
  // Default-venster voor de portfolio-history. 30 dagen blijft de standaard;
  // het period-toggle in de UI laadt grotere vensters via de loader-cache.
  const cryptoHistoryDaysBack = 365
  // Benchmark-overlays voor de portfolio performance-chart. We laden BTC en
  // ETH parallel met de overige crypto-data; de chart filtert client-side
  // op periode + actieve toggle. Bij fetch-fout blijft de array leeg en
  // toont de UI een nette fallback in de toggle.
  let cryptoBenchmarkBtc: { date: string; close: number }[] = []
  let cryptoBenchmarkEth: { date: string; close: number }[] = []
  let investmentHoldings: InvestmentHoldingRow[] = []
  // Lookup voor cash-assets die gekoppeld zijn aan een actieve bank-account-rij.
  // Een cash-asset met `has_budget_tracking=true` opent de detail-pagina van
  // de gekoppelde rekening (`/core/assets/cash/[bankAccountId]`); zonder
  // koppeling valt de klik terug op de algemene asset-detail-sheet.
  // Niet-cash categorieën hebben deze prop niet nodig — `undefined` is veilig.
  let bankAccountByAssetId: Record<string, string> | undefined

  if (type === 'cash') {
    // Voor de cash-categorie laden we ook de Kern-data zodat we de
    // kencijfers (geschat jaarinkomen, must-uitgaven) kunnen tonen
    // bovenaan de pagina.
    const [budgetsResult, coreResult, bankAccountsResult] = await Promise.allSettled([
      loadBudgetsData(supabase),
      loadCoreData(supabase),
      supabase
        .from('bank_accounts')
        .select('id, linked_asset_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .not('linked_asset_id', 'is', null),
    ])
    if (budgetsResult.status === 'fulfilled') budgetsData = budgetsResult.value
    if (coreResult.status === 'fulfilled') coreData = coreResult.value
    if (bankAccountsResult.status === 'fulfilled' && bankAccountsResult.value.data) {
      const rows = bankAccountsResult.value.data as Array<{ id: string; linked_asset_id: string | null }>
      bankAccountByAssetId = Object.fromEntries(
        rows
          .filter((r): r is { id: string; linked_asset_id: string } => r.linked_asset_id !== null)
          .map((r) => [r.linked_asset_id, r.id]),
      )
    }
  } else if (type === 'investment') {
    // Parallel: legacy `HoldingsPageData` voor de Holdings-app embed +
    // typed `InvestmentHoldingRow[]` voor de items-tab kaarten. Beide falen
    // onafhankelijk; een fout in de ene dempt de andere niet.
    const [legacyHoldings, typedHoldings] = await Promise.allSettled([
      loadHoldingsData(supabase),
      loadInvestmentHoldingsForUser(supabase),
    ])
    if (legacyHoldings.status === 'fulfilled') holdingsData = legacyHoldings.value
    if (typedHoldings.status === 'fulfilled') investmentHoldings = typedHoldings.value
  } else if (type === 'crypto') {
    // Vijf parallelle loads: holdings (verplicht voor de app), transacties
    // (voor de feed-sectie), 1-jaars koers-historie (chart filtert client-side
    // op periode), per-periode rendementen voor de KPI-toggle, en realized/
    // unrealized P&L voor de sub-strip. Elk faalt onafhankelijk.
    const [
      holdingsResult,
      txResult,
      historyResult,
      periodReturnsResult,
      realizedPnLResult,
      realizedPnLFifoResult,
      benchmarkBtcResult,
      benchmarkEthResult,
      volatilityResult,
      feesResult,
    ] = await Promise.allSettled([
      loadCryptoHoldingsForUser(supabase),
      loadRecentCryptoTransactions(supabase, 50),
      loadCryptoPortfolioHistory(supabase, cryptoHistoryDaysBack),
      loadCryptoPeriodReturns(supabase),
      loadCryptoRealizedPnL(supabase, 'weighted_avg'),
      loadCryptoRealizedPnL(supabase, 'fifo'),
      loadBenchmarkHistory(supabase, 'BTC', cryptoHistoryDaysBack),
      loadBenchmarkHistory(supabase, 'ETH', cryptoHistoryDaysBack),
      loadCryptoPortfolioVolatility(supabase, 90),
      loadCryptoFeesSummary(supabase),
    ])
    if (holdingsResult.status === 'fulfilled') cryptoHoldings = holdingsResult.value
    if (txResult.status === 'fulfilled') cryptoTransactions = txResult.value
    if (historyResult.status === 'fulfilled') cryptoHistory = historyResult.value
    if (periodReturnsResult.status === 'fulfilled') cryptoPeriodReturns = periodReturnsResult.value
    if (realizedPnLResult.status === 'fulfilled') cryptoRealizedPnL = realizedPnLResult.value
    if (realizedPnLFifoResult.status === 'fulfilled') cryptoRealizedPnLFifo = realizedPnLFifoResult.value
    if (benchmarkBtcResult.status === 'fulfilled') cryptoBenchmarkBtc = benchmarkBtcResult.value
    if (benchmarkEthResult.status === 'fulfilled') cryptoBenchmarkEth = benchmarkEthResult.value
    if (volatilityResult.status === 'fulfilled') cryptoVolatility = volatilityResult.value
    if (feesResult.status === 'fulfilled') cryptoFees = feesResult.value

    // Sparklines hebben de holding-IDs nodig — laden we als follow-up wanneer
    // er holdings zijn. Eén batched query, faalt onafhankelijk (lege map →
    // tabel toont neutrale streep per rij).
    if (cryptoHoldings.length > 0) {
      const trackedIds = cryptoHoldings
        .filter((h) => !h.isFiatBalance)
        .map((h) => h.id)
      if (trackedIds.length > 0) {
        try {
          cryptoSparklines = await loadCryptoSparklineData(supabase, trackedIds, 7)
        } catch {
          cryptoSparklines = {}
        }
      }
    }
  }

  const [kpiRefs, historyData] = await Promise.all([
    kpiRefsPromise,
    historyPromise,
  ])

  // ── Per-asset sparklines voor de items-tab ───────────────────
  // Eén batched query op `balance_snapshots` voor alle assets in deze
  // categorie. Failure is non-fataal: lege map → kaarten tonen alleen
  // de tweelagentint zonder breuklijn.
  const assetSparklines = assets.length > 0
    ? await loadEntitySparklines(supabase, 'asset', assets.map((a) => a.id))
    : {}

  // ── Connections per asset (R2 + R5) ──────────────────────────
  // Voor crypto én investment laden we de actieve externe koppeling per
  // asset zodat de asset-card op de items-tab een plug-indicator kan tonen
  // (Bitvavo-gekoppeld, broker-CSV, wallet, …). Andere asset-types kennen
  // (vooralsnog) geen externe bron-koppelingen — we slaan de query dan over
  // om Supabase-roundtrips te besparen.
  let connectionsByAssetId: Record<string, AssetConnectionSummary> | undefined
  if ((type === 'crypto' || type === 'investment') && assets.length > 0) {
    try {
      connectionsByAssetId = await loadConnectionsByAssetIds(
        supabase,
        assets.map((a) => a.id),
      )
    } catch {
      connectionsByAssetId = undefined
    }
  }

  return (
    <>
      <NavStackMeta title={ASSET_TYPE_LABELS[type] ?? 'Bezittingen'} bottomBar={{ kind: 'tabs' }} />
      <AssetCategoryPage
        type={type}
        initialAssets={assets}
        initialBudgetsData={budgetsData ?? undefined}
        initialHoldingsData={holdingsData ?? undefined}
        initialCoreData={coreData ?? undefined}
        bankAccountByAssetId={bankAccountByAssetId}
        initialKpiRefs={kpiRefs ?? undefined}
        initialConnectionsByAssetId={connectionsByAssetId}
        initialCryptoHoldings={cryptoHoldings}
        initialCryptoTransactions={cryptoTransactions}
        initialCryptoHistory={cryptoHistory}
        cryptoHistoryDaysBack={cryptoHistoryDaysBack}
        initialCryptoPeriodReturns={cryptoPeriodReturns}
        initialCryptoRealizedPnL={cryptoRealizedPnL}
        initialCryptoRealizedPnLFifo={cryptoRealizedPnLFifo}
        initialCryptoSparklines={cryptoSparklines}
        initialCryptoBenchmarkBtc={cryptoBenchmarkBtc}
        initialCryptoBenchmarkEth={cryptoBenchmarkEth}
        initialCryptoVolatility={cryptoVolatility}
        initialCryptoFees={cryptoFees}
        initialInvestmentHoldings={investmentHoldings}
        initialAssetSparklines={assetSparklines}
        historyData={historyData}
      />
    </>
  )
}

// ── Editorial error-state ────────────────────────────────────

function AssetCategoryError({ type, detail }: { type: AssetType; detail: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {ASSET_TYPE_LABELS[type]}
      </p>
      <h1 className="mt-2 font-serif text-2xl font-semibold text-[var(--ink)]">
        We konden deze categorie niet laden.
      </h1>
      <p className="mt-3 font-serif italic text-base leading-relaxed text-[var(--ink-2)]">
        Vernieuw de pagina om het opnieuw te proberen, of ga terug naar de
        Kern voor het volledige overzicht.
      </p>
      <p className="mt-4 font-mono text-[11px] text-[var(--ink-4)]">{detail}</p>
    </div>
  )
}

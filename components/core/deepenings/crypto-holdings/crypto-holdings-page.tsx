'use client'

// crypto-holdings-page.tsx — root van de crypto Holdings-app. Orchestreert
// de KPI-strip (incl. period-toggle + collapsible detailweergave met de drie
// sub-strips P&L/Risico/Fiscaal & Kosten), de full-width performance-chart,
// het verdelings-paneel (segmented-control over donut · bron · spreiding ·
// heatmap), holdings-grid en transactiegeschiedenis — samen één tab-pagina.
//
// Mirror van de investment Holdings-pagina (zie `components/core/holdings-
// client.tsx`) maar dan gevoed door typed crypto-data en zonder de
// CRUD-actiebalk + benchmark/dividend-secties die voor crypto niet zinvol
// zijn (toelichting per overgeslagen feature staat onderaan dit bestand).
//
// Data-eigenaarschap: deze component is **client** maar krijgt al z'n bron-
// data als props mee. De server-loader op de categorie-pagina bepaalt de
// initial state; alleen view-state (sortering, filter, view-mode, periode)
// leeft hier in `useState`.

import { useCallback, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Coins, Plug, Wallet } from 'lucide-react'
import {
  computeCryptoSpread,
  type CryptoHoldingRow,
  type CryptoTransactionRow,
  type CryptoPortfolioPoint,
  type CryptoPeriodReturnsBundle,
  type CryptoRealizedPnL,
  type CryptoReturnPeriod,
  type CryptoSparklinePoint,
  type CryptoVolatilityMetric,
  type CryptoFeesSummary,
} from '@/lib/crypto-holdings-data'
import { OVERLAY_QUERY_KEYS } from '@/lib/navigation'
import { CryptoKpiStrip } from './crypto-kpi-strip'
import { CryptoDistributionPanel } from './crypto-distribution-panel'
import { CryptoPerformanceChart } from './crypto-performance-chart'
import {
  CryptoHoldingsGrid,
  type CryptoSortKey,
  type CryptoViewMode,
} from './crypto-holdings-grid'
import { CryptoTransactionsLog } from './crypto-transactions-log'
import { CryptoHoldingPane } from './crypto-holding-pane'

export interface CryptoHoldingsPageProps {
  holdings: CryptoHoldingRow[]
  transactions?: CryptoTransactionRow[]
  history?: CryptoPortfolioPoint[]
  /** Aantal dagen dat `history` dekt — chart filtert hier client-side op periode. */
  historyDaysBack?: number
  periodReturns?: CryptoPeriodReturnsBundle
  /** Realized + unrealized P&L (weighted-average cost basis — default). */
  realizedPnL?: CryptoRealizedPnL
  /**
   * Realized + unrealized P&L volgens FIFO. Wordt naast `realizedPnL` geleverd
   * zodat de KPI-strip cost-basis-toggle client-side schakelt zonder extra
   * fetch. Ontbreken → toggle valt terug op de wavg-variant.
   */
  realizedPnLFifo?: CryptoRealizedPnL
  /**
   * Per-holding 7-daagse close-prijs reeks voor de tabel-view sparklines.
   * Optioneel — zonder data toont de tabel een neutrale streep per rij.
   */
  sparklinesByHoldingId?: Record<string, CryptoSparklinePoint[]>
  /**
   * Benchmark-prijshistorie (BTC) over hetzelfde venster als `history`. Gevoed
   * naar `<CryptoPerformanceChart>` voor de optionele BTC-overlay-toggle. Lege
   * array → toggle blijft, maar de BTC-optie wordt disabled met tooltip.
   */
  benchmarkBtc?: { date: string; close: number }[]
  /** Benchmark-prijshistorie (ETH) — idem voor de ETH-toggle. */
  benchmarkEth?: { date: string; close: number }[]
  /**
   * 90-daagse portfolio-volatiliteit. Gevoed naar de Risico-sub-strip in de
   * KPI naast Concentratie. Ontbreken → cel toont "—".
   */
  volatility?: CryptoVolatilityMetric
  /** Totaal transactiekosten + per-exchange breakdown voor de Fiscaal/Kosten-sub-strip. */
  fees?: CryptoFeesSummary
}

export function CryptoHoldingsPage({
  holdings,
  transactions = [],
  history = [],
  periodReturns,
  realizedPnL,
  realizedPnLFifo,
  sparklinesByHoldingId,
  benchmarkBtc,
  benchmarkEth,
  volatility,
  fees,
}: CryptoHoldingsPageProps) {
  const [sortKey, setSortKey] = useState<CryptoSortKey>('value')
  const [viewMode, setViewMode] = useState<CryptoViewMode>('cards')
  const [sourceFilter, setSourceFilter] = useState<string | null>(null)
  // Default-periode voor zowel KPI-strip rendement-cijfer als performance-chart.
  // 30d komt overeen met de oude hardcoded chart-window — gebruiker ziet bij
  // eerste laad hetzelfde overzicht als R6.
  const [period, setPeriod] = useState<CryptoReturnPeriod>('30d')

  // ── Pane URL-state ─────────────────────────────────────────────────
  // De pane voor één coin leeft op `?crypto=<id>`. We lezen de query-param
  // en zoeken de bijbehorende holding op uit de al-geladen array — geen
  // extra fetch nodig (alle data zit al in props). `selectedHolding=null`
  // betekent: pane is dicht. `selectedSparkline` haalt de 7-daagse reeks
  // uit de page-bundle zodat we niet apart hoeven te fetchen.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requestedHoldingId = searchParams.get(OVERLAY_QUERY_KEYS.cryptoHolding)
  const selectedHolding = useMemo(
    () => holdings.find((h) => h.id === requestedHoldingId) ?? null,
    [holdings, requestedHoldingId],
  )
  const selectedSparkline = selectedHolding && sparklinesByHoldingId
    ? sparklinesByHoldingId[selectedHolding.id]
    : undefined

  // Sluit de pane door alleen `?crypto=` uit de URL te halen — overige
  // query-state (zoals `?tab=crypto-holdings`) blijft behouden zodat de
  // gebruiker terugkeert naar dezelfde tab. `router.replace` ipv `push`
  // omdat één pane-open al een history-entry kostte (zie click-handlers
  // in `crypto-holdings-grid.tsx`); sluit-actie hoeft daar niet bovenop
  // te stapelen.
  const closePane = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(OVERLAY_QUERY_KEYS.cryptoHolding)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname, searchParams])

  // Pane-callback bij save/delete — laad de page-bundle opnieuw zodat de
  // holdings-list, KPI-strip en figures-strip de nieuwe waarden tonen.
  // `router.refresh()` re-rendert de server-component zonder URL-wissel.
  const handlePaneChanged = useCallback(() => {
    router.refresh()
  }, [router])

  let totalValue = 0
  for (const h of holdings) totalValue += h.valueEur

  // Spread per coin — pure berekening uit de bestaande holdings-array, geen
  // extra DB-roundtrip. `useMemo` voorkomt dat we de groupering opnieuw doen
  // bij elke onafhankelijke state-change (sortKey, viewMode, period).
  const spread = useMemo(() => computeCryptoSpread(holdings), [holdings])

  if (holdings.length === 0) {
    return <CryptoHoldingsEmpty />
  }

  const activePeriodReturn = periodReturns?.[period]

  return (
    // Outer wrapper houdt het verticale ritme tussen de paper-band en de
    // overige secties (`space-y-8` = 32px gap, gelijk aan de standaard
    // sectie-spacing op de pagina). Geen `-mx-`-truc meer: de host
    // (`asset-category-page.tsx`) levert al `px-4 sm:px-6` rond de tab-
    // content, dus de paper-band en de chart/distribution/grid/transactions
    // delen dezelfde outer-rand (1104px op max-w-6xl) — uniformiteit met
    // `/core/budgets` waar de heroBand óók binnen host-padding zit.
    <div className="space-y-8">
      {/* 1. Hero-band: paper-blok rond de KPI-strip met harde ink-borders
          boven en onder als afgebakend "blok" (zelfde editorial discipline
          als budgetten — zie `budgets-client.tsx` regel 1485). De interne
          `px-4 sm:px-6` levert horizontale ademruimte voor de KPI-content
          binnen de paper-bg en spiegelt `CategoryHero`
          (`asset-category-page.tsx` regel 672) zodat de hero ritmisch
          consistent is met de rest van de Kern-module. */}
      <section className="border-t border-b border-[var(--ink)] bg-[var(--paper)] px-4 py-5 sm:px-6 sm:py-7">
        {/* KPI-strip — hoofd-figures altijd zichtbaar; de drie sub-strips
            (P&L incl. FIFO-toggle, Risico, Fiscaal & Kosten) zitten achter
            een "Detailweergave"-toggle zodat boven-de-vouw rustig blijft. */}
        <CryptoKpiStrip
          holdings={holdings}
          period={period}
          onPeriodChange={setPeriod}
          periodReturn={activePeriodReturn}
          realizedPnL={realizedPnL}
          realizedPnLFifo={realizedPnLFifo}
          volatility={volatility}
          fees={fees}
        />
      </section>

      {/* 2. Performance-chart — full-width. Tijdseries lezen breder beter
          dan smal; de allocation-donut zit nu in het verdelings-blok. */}
      <CryptoPerformanceChart
        points={history}
        period={period}
        periodReturn={activePeriodReturn}
        benchmarkBtc={benchmarkBtc}
        benchmarkEth={benchmarkEth}
      />

      {/* 3. Verdeling — één paneel met segmented-control voor de vier
          views (Per coin · Per bron · Spreiding · Heatmap). Vervangt vier
          afzonderlijke secties. Bron-filter blijft hier toggelen zodat de
          holdings-grid eronder blijft reageren. */}
      <CryptoDistributionPanel
        holdings={holdings}
        totalValue={totalValue}
        spread={spread}
        perHoldingChange24h={periodReturns?.['24h'].perHolding}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
      />

      {/* 4. Holdings-grid met sort + view-toggle (kaarten/tabel) */}
      <CryptoHoldingsGrid
        holdings={holdings}
        sortKey={sortKey}
        onSortChange={setSortKey}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sourceFilter={sourceFilter}
        sparklinesByHoldingId={sparklinesByHoldingId}
      />

      {/* 5. Recente transacties (alleen als er trades zijn) */}
      {transactions.length > 0 && (
        <CryptoTransactionsLog transactions={transactions} />
      )}

      {/* 6. Coin-detail pane — opent vanaf `?crypto=<id>` (zie URL-state
          hookup boven). Op desktop een SlideInPane rechts, op mobile een
          full-height BottomSheet als fallback. De pane leeft als sibling
          binnen de `space-y-8`-flow zodat hij geen ruimte inneemt wanneer
          gesloten (`null` → niets in DOM) en geen layout-shift veroorzaakt
          op de holdings-tab. Sparkline-data komt uit `sparklinesByHoldingId`
          zodat geen extra fetch nodig is. */}
      <CryptoHoldingPane
        holding={selectedHolding}
        sparkline={selectedSparkline}
        onClose={closePane}
        onChanged={handlePaneChanged}
      />
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────────────

function CryptoHoldingsEmpty() {
  return (
    <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center bg-[var(--paper)]">
        <Coins className="h-5 w-5 text-kern-600" aria-hidden="true" />
      </div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        Geen crypto-posities
      </p>
      <p className="mt-2 font-serif italic text-base leading-relaxed text-[var(--ink-2)]">
        Voeg een Bitvavo-koppeling of wallet-adres toe in Instellingen om
        live coin-saldi en EUR-waardes hier te zien.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <a
          href="/identity/koppelingen"
          className="inline-flex h-11 items-center gap-2 border border-kern-300 bg-kern-50 px-4 text-sm font-medium text-kern-700 transition-colors hover:bg-kern-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          <Plug className="h-4 w-4" aria-hidden="true" />
          Koppel exchange
        </a>
        <a
          href="/identity/koppelingen"
          className="inline-flex h-11 items-center gap-2 border border-[var(--border-ed)] bg-[var(--paper)] px-4 text-sm font-medium text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          <Wallet className="h-4 w-4" aria-hidden="true" />
          Voeg wallet toe
        </a>
      </div>
    </div>
  )
}

// ── Bewust niet overgenomen uit investment Holdings-app ──────────────────
//
// 1. **TER-kolom (Total Expense Ratio)** — alleen relevant voor ETF's met
//    beheerkosten. Crypto-positie heeft geen vergelijkbaar percentage.
// 2. **Dividend-tracker** — coins betalen geen dividenden. Een toekomstige
//    "Staking-rewards"-sectie kan op deze plek ingehaakt worden zodra de
//    P2/F2-loader staking-events binnenhaalt; voor nu weglaten (geen lege
//    kaart die suggereert dat er data komt).
// 3. **Benchmark-comparison (S&P500/MSCI World)** — een crypto-portefeuille
//    vergelijken met een aandelenbenchmark is misleidend. De BTC/ETH-overlay
//    op de performance-chart (R8c) is wél geïmplementeerd: rebased op de
//    portfolio-startwaarde zodat de gebruiker direct ziet of het portfolio
//    het beter of slechter doet dan de twee marktreferenties.
// 4. **CRUD-actiebalk (toevoegen / verwijderen / bewerken)** — crypto-
//    holdings worden bij voorkeur via bron-koppelingen ingelezen
//    (Bitvavo/wallet-sync). Handmatige toevoeging blijft via de
//    asset-detail-flow op de items-tab; het Holdings-app dashboard heeft
//    geen eigen CRUD nodig.
// 5. **Volledige fiscale module** — de KPI-strip toont nu een **indicatieve**
//    Box 3-heffing (forfait 2026 × 36% × bruto crypto-waarde), maar de echte
//    aangifte vereist peildatum-snapshots, partner-grondslag en alle Box 3-
//    bezittingen samen. Dat blijft voor een toekomstige fiscale module.

'use client'

// Verdiepingstab "Holdings" voor de crypto-categorie.
//
// Deze tab is een dunne wrapper rond `<CryptoHoldingsPage>` (de eigenlijke
// app — zie `crypto-holdings/crypto-holdings-page.tsx`). De verdeling
// houden we bewust:
//   - Tab-component leeft hier (registry-import, module-gating,
//     teaser-fallback) — symmetrisch met `investment-holdings-tab.tsx`.
//   - App-content + sub-componenten leven in `crypto-holdings/` zodat de
//     Holdings-app modulair blijft en losse onderdelen elders herbruikbaar
//     zijn (bv. de allocation-chart in een toekomstig dashboard-widget).
//
// Module-uit pad:
//   - Wanneer `aandelenregistratie` uit staat tonen we een teaser + tip-
//     strip met deeplink. De full-app wordt nooit gemount.

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
import { CryptoHoldingsPage } from './crypto-holdings/crypto-holdings-page'
import type { DeepeningTabProps } from '../category-deepening-registry'
import { ModuleTipStrip } from '../module-tip-strip'

// ── Initial-data shape ─────────────────────────────────────────────────
//
// De server-loader op `app/(app)/core/assets/[type]/page.tsx` blijft het
// bestaande contract gebruiken: voor crypto wordt een `CryptoHoldingRow[]`
// doorgegeven via `initialData`. Optioneel kunnen we hier in de toekomst
// een rijker bundle-object accepteren (transactions + history) zonder de
// registry-laag aan te passen — daarom de twee-vorm union hieronder.

interface CryptoInitialBundle {
  holdings: CryptoHoldingRow[]
  transactions?: CryptoTransactionRow[]
  history?: CryptoPortfolioPoint[]
  historyDaysBack?: number
  periodReturns?: CryptoPeriodReturnsBundle
  realizedPnL?: CryptoRealizedPnL
  /** FIFO-variant van realizedPnL — voor de KPI-strip cost-basis toggle. */
  realizedPnLFifo?: CryptoRealizedPnL
  /** Per-holding 7-daagse close-prijs reeks voor de tabel-view sparklines. */
  sparklinesByHoldingId?: Record<string, CryptoSparklinePoint[]>
  /** Benchmark-prijshistorie (BTC) voor performance-chart overlay. */
  benchmarkBtc?: { date: string; close: number }[]
  /** Benchmark-prijshistorie (ETH) voor performance-chart overlay. */
  benchmarkEth?: { date: string; close: number }[]
  /** 90-daagse volatiliteit voor de Risico-sub-strip. */
  volatility?: CryptoVolatilityMetric
  /** Totaal transactiekosten + per-exchange breakdown. */
  fees?: CryptoFeesSummary
}

type CryptoInitialData = CryptoHoldingRow[] | CryptoInitialBundle | undefined

function isBundle(value: CryptoInitialData): value is CryptoInitialBundle {
  return (
    !!value &&
    !Array.isArray(value) &&
    typeof value === 'object' &&
    'holdings' in value &&
    Array.isArray((value as CryptoInitialBundle).holdings)
  )
}

// ── Component ──────────────────────────────────────────────────────────

export function CryptoHoldingsTab({ moduleActive, initialData }: DeepeningTabProps) {
  if (!moduleActive) {
    return <CryptoHoldingsTeaser />
  }
  // Cast op het eindpunt: registry-laag is generiek (`unknown`); hier weten
  // we welke shapes legitiem zijn.
  const data = initialData as CryptoInitialData
  if (isBundle(data)) {
    return (
      <CryptoHoldingsPage
        holdings={data.holdings}
        transactions={data.transactions ?? []}
        history={data.history ?? []}
        historyDaysBack={data.historyDaysBack ?? 30}
        periodReturns={data.periodReturns}
        realizedPnL={data.realizedPnL}
        realizedPnLFifo={data.realizedPnLFifo}
        sparklinesByHoldingId={data.sparklinesByHoldingId}
        benchmarkBtc={data.benchmarkBtc}
        benchmarkEth={data.benchmarkEth}
        volatility={data.volatility}
        fees={data.fees}
      />
    )
  }
  return <CryptoHoldingsPage holdings={data ?? []} />
}

// ── Teaser-tak (module uit) ────────────────────────────────────────────

function CryptoHoldingsTeaser() {
  return (
    <div className="space-y-6">
      <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-6 py-8">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Module uit
        </p>
        <h3 className="mt-2 font-serif text-xl font-semibold text-[var(--ink)]">
          Aandelen- en cryptoregistratie is niet ingeschakeld
        </h3>
        <p className="mt-2 font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Met deze module zie je per coin de huidige units, EUR-waarde en
          welke exchange of wallet hem levert. Schakel het in via Instellingen
          om hier inzicht te krijgen.
        </p>
      </div>
      <ModuleTipStrip
        copy="Activeer aandelen- en cryptoregistratie voor het volledige overzicht."
        className="border-t-0"
      />
    </div>
  )
}

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

import { Coins } from 'lucide-react'
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
import type { Asset } from '@/lib/asset-data'
import { CryptoHoldingsPage } from './crypto-holdings/crypto-holdings-page'
import type { DeepeningTabProps } from '../category-deepening-registry'
import { ModuleTipStrip } from '../module-tip-strip'
import { AppSetupGate } from '@/components/app/app-setup/app-setup-gate'
import { AppLinkGate } from '@/components/app/app-setup/app-link-gate'
import { useIsAppSetupCompleted } from '@/components/app/app-setup/use-is-setup-completed'

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

export function CryptoHoldingsTab({ moduleActive, initialData, assets, currentUserId }: DeepeningTabProps) {
  if (!moduleActive) {
    return <CryptoHoldingsTeaser />
  }
  return <CryptoHoldingsActive initialData={initialData} assets={assets} currentUserId={currentUserId} />
}

// ── Actieve tak (module aan) ───────────────────────────────────────────

function CryptoHoldingsActive({
  initialData,
  assets,
  currentUserId,
}: {
  initialData: unknown
  assets?: Asset[]
  currentUserId?: string
}) {
  // Onafhankelijk van de aandelen-setup — crypto en aandelen-holdings
  // hebben elk een eigen gate-marker.
  const setupCompleted = useIsAppSetupCompleted('crypto_holdings')
  if (setupCompleted === null) return <AppSetupSkeleton />
  if (setupCompleted === false) return <AppSetupGate appKey="crypto_holdings" />

  // Setup ooit voltooid maar geen enkele crypto-bezitting (meer) gekoppeld
  // (`has_holdings_tracking`) → koppelscherm i.p.v. een doodlopende
  // empty-state. De kandidaten komen uit de server-bundel van de host;
  // opslaan schrijft dezelfde vlag als de instelling op de bezitting zelf
  // (/api/assets/toggle-holdings) en ververst daarna de bundel.
  // Alleen éígen bezittingen als kandidaat: lezen is huishoud-verbreed, maar
  // de toggle-write is strikt eigen-rij — een partner-rij zou altijd falen.
  const cryptoAssets = assets ?? []
  const linkableAssets = currentUserId
    ? cryptoAssets.filter((a) => a.user_id === currentUserId)
    : cryptoAssets
  if (!cryptoAssets.some((a) => a.has_holdings_tracking)) {
    return (
      <AppLinkGate
        kicker="Bezittingen koppelen"
        title="Koppel je crypto-bezittingen"
        intro="De Crypto-holdings-app volgt alleen de bezittingen die je koppelt. Kies hieronder welke crypto-bezittingen je in deze app wilt bijhouden."
        itemNoun="bezitting"
        icon={Coins}
        candidates={linkableAssets.map((a) => ({
          id: a.id,
          name: a.name,
          value: Number(a.current_value),
        }))}
        endpoint="/api/assets/toggle-holdings"
        emptyCopy="Je hebt nog geen crypto-bezitting geregistreerd. Voeg er eerst één toe op de Posities-tab — daarna kun je 'm hier aan de app koppelen."
        emptyCtaLabel="Voeg crypto-bezitting toe"
      />
    )
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

function AppSetupSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <div className="h-[120px] animate-pulse border-t border-b border-[var(--ink)] bg-[var(--paper)]" />
      <div className="h-[180px] animate-pulse border border-[var(--border-ed)] bg-[var(--subtle)]/40" />
      <span className="sr-only">Setup-status wordt gecheckt…</span>
    </div>
  )
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

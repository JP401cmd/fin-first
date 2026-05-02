'use client'

// crypto-kpi-strip.tsx — vier-blok kencijfers bovenaan de crypto Holdings-app
// + een period-toggle (24u/7d/30d/1j/Alles) die "Rendement" en "Top performer"
// herrekent voor de gekozen periode. Daaronder drie sub-strips:
//
//   1. **P&L** — niet-gerealiseerd / gerealiseerd / totaal, met een rechts-
//      bovenin segmented control voor cost-basis methode (Weighted-avg / FIFO).
//   2. **Risico** — concentratie (HHI + bar) links + 90-daagse volatiliteit
//      rechts. Bewust samen op één rij omdat ze beide "hoe stabiel is dit
//      portfolio" beantwoorden.
//   3. **Fiscaal & Kosten** — indicatieve Box 3-jaarheffing links + totaal
//      transactiekosten rechts. Beide zijn jaarlijkse drag-cijfers; samen op
//      één rij maakt de "wat kost dit me echt"-vergelijking direct zichtbaar.
//
// Krant-esthetiek:
//   - 2-koloms op mobiel, 4-koloms op sm+; geen kaart-borders
//   - Onder-border scheidt strip optisch van de hero
//   - Bedragen in DM Mono met `tabular-nums`, koppen klein en uppercase
//   - Period- en method-toggle rechts uitgelijnd, zelfde stijl
//   - Sub-strips gescheiden door dashed top-border — past bij krantkolom-look

import { useState } from 'react'
import { Info } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import {
  computeConcentrationMetrics,
  type ConcentrationMetrics,
  type ConcentrationRiskLabel,
  type CryptoCostBasisMethod,
  type CryptoFeesSummary,
  type CryptoHoldingRow,
  type CryptoPortfolioPeriodReturn,
  type CryptoRealizedPnL,
  type CryptoReturnPeriod,
  type CryptoVolatilityMetric,
} from '@/lib/crypto-holdings-data'
import { computeCryptoBox3Impact } from '@/lib/crypto-holdings-data'

interface CryptoKpiStripProps {
  holdings: CryptoHoldingRow[]
  /** Geselecteerde periode (controlled van de page-component). */
  period: CryptoReturnPeriod
  onPeriodChange: (period: CryptoReturnPeriod) => void
  /** Per-periode rendementen — als undefined toont de strip "—" voor periode-cijfers. */
  periodReturn?: CryptoPortfolioPeriodReturn
  /** Realized vs unrealized P&L sub-strip — weighted-avg variant (default). */
  realizedPnL?: CryptoRealizedPnL
  /** FIFO-variant; wordt geactiveerd via de cost-basis-toggle in de P&L sub-strip. */
  realizedPnLFifo?: CryptoRealizedPnL
  /** 90-daagse stdev van dagelijkse returns — voor de Risico-sub-strip. */
  volatility?: CryptoVolatilityMetric
  /** Totaal transactiekosten + breakdown — voor de Fiscaal & Kosten-sub-strip. */
  fees?: CryptoFeesSummary
}

const PERIOD_LABELS: Record<CryptoReturnPeriod, string> = {
  '24h': '24u',
  '7d': '7d',
  '30d': '30d',
  '1y': '1j',
  all: 'Alles',
}

const PERIOD_LABELS_LONG: Record<CryptoReturnPeriod, string> = {
  '24h': 'over 24 uur',
  '7d': 'over 7 dagen',
  '30d': 'over 30 dagen',
  '1y': 'over 1 jaar',
  all: 'sinds start',
}

const PERIOD_ORDER: CryptoReturnPeriod[] = ['24h', '7d', '30d', '1y', 'all']

export function CryptoKpiStrip({
  holdings,
  period,
  onPeriodChange,
  periodReturn,
  realizedPnL,
  realizedPnLFifo,
  volatility,
  fees,
}: CryptoKpiStripProps) {
  let totalValue = 0
  let coinCount = 0
  let fiatTotal = 0
  let cryptoOnlyTotal = 0
  for (const h of holdings) {
    totalValue += h.valueEur
    if (h.isFiatBalance) {
      fiatTotal += h.valueEur
      continue
    }
    coinCount += 1
    cryptoOnlyTotal += h.valueEur
  }

  // Top performer over de gekozen periode — sortering op changePct.
  let topPerformer: { symbol: string; changePct: number } | null = null
  if (periodReturn) {
    for (const r of periodReturn.perHolding) {
      if (r.changePct == null) continue
      if (!topPerformer || r.changePct > topPerformer.changePct) {
        topPerformer = { symbol: r.symbol, changePct: r.changePct }
      }
    }
  }

  const returnPct = periodReturn?.changePct ?? null
  const returnEur = periodReturn?.changeEur ?? null
  const hasReturnData = returnPct != null

  // Concentratie-risico: pure metric, draait elke render mee. Goedkoop
  // (O(N log N) sort op ≤enkele tientallen holdings) en filtert fiat zelf,
  // dus geen aparte preprocessing in de page-component nodig.
  const concentration = computeConcentrationMetrics(holdings)

  // Cost-basis methode toggle. Initial = wavg (de bestaande default). Als de
  // FIFO-variant ontbreekt zetten we de toggle gewoon disabled — die rendert
  // dan niet de switch, alleen het wavg-cijfer.
  const [costBasisMethod, setCostBasisMethod] =
    useState<CryptoCostBasisMethod>('weighted_avg')
  const activeRealizedPnL =
    costBasisMethod === 'fifo' && realizedPnLFifo
      ? realizedPnLFifo
      : realizedPnL

  // Box 3 indicatie: rekenen op de **bruto** crypto-waarde (excl. fiat-cash
  // bij de exchange — die valt onder "bank- en spaartegoeden", andere fictief
  // rendement). Voor users zonder crypto-positie val we terug op 0.
  const box3 = computeCryptoBox3Impact(cryptoOnlyTotal)

  return (
    <section className="space-y-4 border-b border-[var(--border-ed)] pb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          Kencijfers
        </p>
        <PeriodToggle period={period} onChange={onPeriodChange} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCell
          label="Totale waarde"
          value={formatCurrency(totalValue)}
          sub={fiatTotal > 0 ? `${formatCurrency(fiatTotal)} cash` : undefined}
        />
        <KpiCell
          label="Posities"
          value={String(coinCount)}
          sub={coinCount === 1 ? 'coin' : 'coins'}
        />
        <KpiCell
          label={`Rendement · ${PERIOD_LABELS[period]}`}
          value={
            hasReturnData
              ? `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%`
              : '—'
          }
          sub={
            hasReturnData && returnEur != null
              ? `${returnEur >= 0 ? '+' : ''}${formatCurrency(returnEur)}`
              : 'geen koers-historie'
          }
          tone={
            !hasReturnData ? 'neutral' : returnPct >= 0 ? 'positive' : 'negative'
          }
        />
        <KpiCell
          label="Top performer"
          value={topPerformer?.symbol ?? '—'}
          sub={
            topPerformer
              ? `${topPerformer.changePct >= 0 ? '+' : ''}${topPerformer.changePct.toFixed(1)}% ${PERIOD_LABELS_LONG[period]}`
              : 'geen rendement-data'
          }
          tone={
            topPerformer
              ? topPerformer.changePct >= 0
                ? 'positive'
                : 'negative'
              : 'neutral'
          }
        />
      </div>

      {activeRealizedPnL && (
        <RealizedPnLSubStrip
          data={activeRealizedPnL}
          method={costBasisMethod}
          onMethodChange={setCostBasisMethod}
          // Toggle-disable als de FIFO-variant niet beschikbaar is. Voorkomt
          // dat de gebruiker schakelt naar een leeg pad.
          fifoAvailable={!!realizedPnLFifo}
        />
      )}

      {/* Sub-strip: Risico — concentratie + volatiliteit op één rij. */}
      {(concentration.holdingsCount > 0 || volatility) && (
        <RiskSubStrip
          concentration={concentration}
          volatility={volatility}
        />
      )}

      {/* Sub-strip: Fiscaal & Kosten — Box 3 indicatie + totaal fees. Toon
          alleen wanneer er crypto-waarde of fees zijn (anders zijn beide
          cellen 0 en heeft de strip geen informatie). */}
      {(cryptoOnlyTotal > 0 || (fees && fees.feeCount > 0)) && (
        <TaxAndCostsSubStrip box3={box3} fees={fees} />
      )}
    </section>
  )
}

// ── Period toggle ────────────────────────────────────────────────────────

interface PeriodToggleProps {
  period: CryptoReturnPeriod
  onChange: (p: CryptoReturnPeriod) => void
}

function PeriodToggle({ period, onChange }: PeriodToggleProps) {
  return (
    <div
      className="flex items-center border border-[var(--border-ed)] bg-[var(--paper)]"
      role="group"
      aria-label="Periode selecteren"
    >
      {PERIOD_ORDER.map((p) => {
        const active = p === period
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-pressed={active}
            className={`inline-flex h-8 min-w-[40px] items-center justify-center px-2 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors ${
              active
                ? 'bg-kern-100 text-kern-800'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        )
      })}
    </div>
  )
}

// ── Cost-basis (FIFO/wavg) toggle ────────────────────────────────────────
//
// Zelfde visuele stijl als de PeriodToggle — kleinere cellen omdat we maar
// twee opties hebben en de toggle in de sub-strip-header rechts uitgelijnd
// staat. Bij `fifoAvailable=false` rendert de FIFO-knop disabled met tooltip,
// zodat de toggle visueel intact blijft maar geen lege state aanlevert.

interface CostBasisToggleProps {
  method: CryptoCostBasisMethod
  onChange: (method: CryptoCostBasisMethod) => void
  fifoAvailable: boolean
}

const COST_BASIS_LABELS: Record<CryptoCostBasisMethod, string> = {
  weighted_avg: 'Gewogen gem.',
  fifo: 'FIFO',
}

const COST_BASIS_TOOLTIP =
  'Cost-basis methode. Gewogen gemiddelde matcht de avg_purchase_price per holding. FIFO (First-In-First-Out) verkoopt eerst de oudste lots — fiscaal gangbaar in NL en geeft over langere horizon vaak een realistischer beeld.'

function CostBasisToggle({
  method,
  onChange,
  fifoAvailable,
}: CostBasisToggleProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--ink-4)] hover:text-[var(--ink-3)]"
        title={COST_BASIS_TOOLTIP}
        aria-label={COST_BASIS_TOOLTIP}
        tabIndex={0}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div
        className="flex items-center border border-[var(--border-ed)] bg-[var(--paper)]"
        role="group"
        aria-label="Cost-basis methode"
      >
        {(['weighted_avg', 'fifo'] as CryptoCostBasisMethod[]).map((m) => {
          const active = m === method
          const disabled = m === 'fifo' && !fifoAvailable
          return (
            <button
              key={m}
              type="button"
              onClick={() => {
                if (!disabled) onChange(m)
              }}
              aria-pressed={active}
              aria-disabled={disabled}
              disabled={disabled}
              title={
                disabled
                  ? 'FIFO-data niet beschikbaar — geen verkoop-transacties of geen kostenbasis.'
                  : undefined
              }
              className={`inline-flex h-7 items-center justify-center px-2 text-[10px] font-medium uppercase tracking-[0.06em] transition-colors ${
                active
                  ? 'bg-kern-100 text-kern-800'
                  : disabled
                    ? 'cursor-not-allowed text-[var(--ink-4)]'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
              }`}
            >
              {COST_BASIS_LABELS[m]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Realized vs unrealized sub-strip ─────────────────────────────────────

interface RealizedPnLSubStripProps {
  data: CryptoRealizedPnL
  method: CryptoCostBasisMethod
  onMethodChange: (method: CryptoCostBasisMethod) => void
  fifoAvailable: boolean
}

function RealizedPnLSubStrip({
  data,
  method,
  onMethodChange,
  fifoAvailable,
}: RealizedPnLSubStripProps) {
  const total = data.unrealizedEur + data.realizedEur
  const totalTone =
    total > 0.005 ? 'positive' : total < -0.005 ? 'negative' : 'neutral'
  return (
    <div className="space-y-3 border-t border-dashed border-[var(--border-ed)] pt-4">
      {/* Header-rij met kicker links + cost-basis-toggle rechts. Houden we
          bewust apart van de cellen zodat de toggle niet meeschaalt op
          mobiel — daar wikkelt de kicker boven de cijfers. */}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Resultaat · {COST_BASIS_LABELS[method].toLowerCase()}
        </p>
        <CostBasisToggle
          method={method}
          onChange={onMethodChange}
          fifoAvailable={fifoAvailable}
        />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <PnLCell
          label="Niet-gerealiseerd"
          value={data.unrealizedEur}
          sub="open posities"
        />
        <PnLCell
          label="Gerealiseerd"
          value={data.realizedEur}
          sub={
            data.sellCount === 0
              ? 'geen verkopen geregistreerd'
              : `${data.sellCount} ${data.sellCount === 1 ? 'verkoop' : 'verkopen'}`
          }
        />
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Totaal P&amp;L
          </p>
          <p
            className={`mt-1 font-mono text-lg font-bold tabular-nums ${
              totalTone === 'positive'
                ? 'text-positive'
                : totalTone === 'negative'
                  ? 'text-negative'
                  : 'text-[var(--ink)]'
            }`}
          >
            {total >= 0 ? '+' : ''}
            {formatCurrency(total)}
          </p>
          <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
            inclusief alle handel
          </p>
        </div>
      </div>
    </div>
  )
}

interface PnLCellProps {
  label: string
  value: number
  sub: string
}

function PnLCell({ label, value, sub }: PnLCellProps) {
  const tone =
    value > 0.005 ? 'positive' : value < -0.005 ? 'negative' : 'neutral'
  const toneClass =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'negative'
        ? 'text-negative'
        : 'text-[var(--ink)]'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {label}
      </p>
      <p className={`mt-1 font-mono text-lg font-bold tabular-nums ${toneClass}`}>
        {value >= 0 ? '+' : ''}
        {formatCurrency(value)}
      </p>
      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
        {sub}
      </p>
    </div>
  )
}

// ── KPI cell ─────────────────────────────────────────────────────────────

interface KpiCellProps {
  label: string
  value: string
  sub?: string
  tone?: 'positive' | 'negative' | 'neutral'
}

function KpiCell({ label, value, sub, tone = 'neutral' }: KpiCellProps) {
  const toneClass =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'negative'
        ? 'text-negative'
        : 'text-[var(--ink)]'
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        {label}
      </p>
      <p className={`mt-1 font-mono text-xl font-bold tabular-nums ${toneClass}`}>
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
          {sub}
        </p>
      )}
    </div>
  )
}

// ── Risico sub-strip (concentratie + volatiliteit) ───────────────────────
//
// Twee risico-indicatoren naast elkaar, gescheiden door een verticale
// scheidingslijn op desktop, gestapeld op mobiel. Concentratie krijgt iets
// meer ruimte (1.2fr) omdat het een HHI-bar bevat; volatiliteit is compacter.
// Bewust géén aparte rij per metric: dat zou de KPI-strip te lang maken.

const RISK_LABEL_TEXT: Record<ConcentrationRiskLabel, string> = {
  verspreid: 'Verspreid',
  gemiddeld: 'Gemiddeld',
  geconcentreerd: 'Geconcentreerd',
}

// Toelichting in de native browser-tooltip op het info-icoon. Bewust kort —
// de drie HHI-grenzen + één-zin "wat betekent het" past binnen 200 tekens.
const HHI_TOOLTIP =
  'Herfindahl-index: < 1500 verspreid · 1500–2500 gemiddeld · > 2500 geconcentreerd. Hoge concentratie betekent dat het portfolio sterk afhankelijk is van één coin.'

const VOL_TOOLTIP =
  'Standaarddeviatie van de dagelijkse portfolio-returns over de afgelopen 90 dagen. Geannualiseerd via × √365. Laag (< 2%) is rustig (BTC-zwaar), > 5% is hoog (alt-zwaar of klein portfolio).'

interface RiskSubStripProps {
  concentration: ConcentrationMetrics
  volatility?: CryptoVolatilityMetric
}

function RiskSubStrip({ concentration, volatility }: RiskSubStripProps) {
  return (
    <div className="grid gap-6 border-t border-dashed border-[var(--border-ed)] pt-4 sm:grid-cols-[1.2fr_1fr] sm:gap-8">
      {/* Concentratie-cel */}
      {concentration.holdingsCount > 0 ? (
        <ConcentrationBlock metrics={concentration} />
      ) : (
        <div />
      )}
      {/* Volatiliteits-cel — compacte categorisatie + numerieke daily/annu. */}
      <VolatilityBlock data={volatility} />
    </div>
  )
}

function ConcentrationBlock({ metrics }: { metrics: ConcentrationMetrics }) {
  // Kleuring: spreiding is goed (positive), middelmaat is neutraal-attentie
  // (--ink-2 — wel zichtbaar maar niet alarmerend), geconcentreerd is risico
  // (negative). We gebruiken bewust geen aparte --warning token: die bestaat
  // nog niet in het systeem en --ink-2 past beter bij de krant-toon.
  const labelToneClass =
    metrics.riskLabel === 'verspreid'
      ? 'text-positive'
      : metrics.riskLabel === 'geconcentreerd'
        ? 'text-negative'
        : 'text-[var(--ink-2)]'

  // Top-3 sub-regel. Bij <3 holdings tonen we minder namen — eerlijke
  // weergave i.p.v. opvulling. Top-symbol komt altijd uit `topHolding`.
  const top3Display = metrics.top3Names.join(' · ')
  const topShareLabel = metrics.topHolding
    ? `${metrics.topHolding.symbol} ${metrics.topHolding.sharePct.toFixed(0)}%`
    : null

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end sm:gap-6">
      {/* Linkerkolom: kicker + groot label + meta */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Concentratie-risico
          </p>
          <span
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--ink-4)] hover:text-[var(--ink-3)]"
            title={HHI_TOOLTIP}
            aria-label={HHI_TOOLTIP}
            tabIndex={0}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>
        <p
          className={`mt-1 font-mono text-lg font-bold uppercase tracking-[0.04em] tabular-nums ${labelToneClass}`}
        >
          {RISK_LABEL_TEXT[metrics.riskLabel]}
        </p>
        <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
          {metrics.top3Names.length > 0 && (
            <>
              Top {metrics.top3Names.length} ({top3Display}) ={' '}
              {metrics.top3SharePct.toFixed(0)}%
              {topShareLabel ? ` · ${topShareLabel}` : ''}
            </>
          )}
        </p>
      </div>

      {/* Rechterkolom: HHI-bar met zone-markers. */}
      <HhiBar metrics={metrics} />
    </div>
  )
}

function VolatilityBlock({ data }: { data?: CryptoVolatilityMetric }) {
  // Categorisatie volgens de gangbare crypto-bandbreedtes (zie loader-noot).
  // Lege/onvoldoende data → "—" met neutrale tint.
  const hasData = !!data && data.daysWithData >= 1
  const stdev = data?.daily_stdev_pct ?? 0
  const annu = data?.annualized_pct ?? 0
  let label: 'Laag' | 'Gemiddeld' | 'Hoog' | '—' = '—'
  let toneClass = 'text-[var(--ink-2)]'
  if (hasData) {
    if (stdev < 2) {
      label = 'Laag'
      toneClass = 'text-positive'
    } else if (stdev < 5) {
      label = 'Gemiddeld'
      toneClass = 'text-[var(--ink-2)]'
    } else {
      label = 'Hoog'
      toneClass = 'text-negative'
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Volatiliteit · 90d
        </p>
        <span
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--ink-4)] hover:text-[var(--ink-3)]"
          title={VOL_TOOLTIP}
          aria-label={VOL_TOOLTIP}
          tabIndex={0}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
      <p
        className={`mt-1 font-mono text-lg font-bold uppercase tracking-[0.04em] tabular-nums ${toneClass}`}
      >
        {label}
      </p>
      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
        {hasData
          ? `${stdev.toFixed(2)}% per dag · ${annu.toFixed(0)}% jaarbasis`
          : 'onvoldoende koers-historie'}
      </p>
    </div>
  )
}

interface HhiBarProps {
  metrics: ConcentrationMetrics
}

function HhiBar({ metrics }: HhiBarProps) {
  // Posities op de bar: 1500 = 15% van de breedte, 2500 = 25%. De marker
  // (huidige HHI) wordt geclamped tussen 0 en 100% zodat extreme waardes
  // (bv. één holding = 10000) netjes binnen de bar blijven.
  const markerPct = Math.min(100, Math.max(0, metrics.hhiNormalized * 100))
  const verspreidEnd = 15 // 1500 / 10000
  const gemiddeldEnd = 25 // 2500 / 10000

  const markerColor =
    metrics.riskLabel === 'verspreid'
      ? 'var(--positive)'
      : metrics.riskLabel === 'geconcentreerd'
        ? 'var(--negative)'
        : 'var(--ink-2)'

  return (
    <div className="w-full sm:w-[200px]">
      {/* Zone-bar: drie segmenten in subtiele tinten, scherpe hoeken. */}
      <div
        className="relative h-1.5 w-full bg-[var(--subtle)]"
        role="img"
        aria-label={`HHI ${Math.round(metrics.hhi)} van 10000`}
      >
        {/* Verspreid-zone (0..1500) */}
        <div
          className="absolute top-0 left-0 h-full bg-[color-mix(in_oklch,var(--positive)_18%,transparent)]"
          style={{ width: `${verspreidEnd}%` }}
        />
        {/* Gemiddeld-zone (1500..2500) */}
        <div
          className="absolute top-0 h-full bg-[color-mix(in_oklch,var(--ink-2)_18%,transparent)]"
          style={{
            left: `${verspreidEnd}%`,
            width: `${gemiddeldEnd - verspreidEnd}%`,
          }}
        />
        {/* Geconcentreerd-zone (2500..10000) — leeg, gebruikt --subtle achtergrond */}

        {/* Marker: dunne verticale streep op de huidige HHI-positie */}
        <div
          className="absolute top-[-2px] h-[10px] w-[2px]"
          style={{
            left: `calc(${markerPct}% - 1px)`,
            background: markerColor,
          }}
          aria-hidden="true"
        />
      </div>
      {/* Schaal-labels onder de bar — alleen de twee grenzen, geen 0/10000
          (die zijn impliciet aan de uiteinden). */}
      <div className="mt-1 flex items-start text-[9px] uppercase tracking-[0.06em] text-[var(--ink-4)]">
        <span style={{ width: `${verspreidEnd}%` }} className="text-right">
          1500
        </span>
        <span
          style={{ width: `${gemiddeldEnd - verspreidEnd}%` }}
          className="text-right"
        >
          2500
        </span>
        <span className="ml-auto font-mono tabular-nums text-[var(--ink-3)]">
          HHI {Math.round(metrics.hhi).toLocaleString('nl-NL')}
        </span>
      </div>
    </div>
  )
}

// ── Fiscaal & Kosten sub-strip (Box 3 + fees) ────────────────────────────
//
// Beide cellen tonen een **jaarlijks drag-cijfer** in EUR — daarom samen op
// één rij: de gebruiker ziet direct de twee grootste continue kosten van
// crypto-bezit. Box 3 links (groter cijfer doorgaans), fees rechts. Mobiel
// 1-kolom, desktop 2-koloms met dezelfde gap als de risico-strip.

interface TaxAndCostsSubStripProps {
  box3: ReturnType<typeof computeCryptoBox3Impact>
  fees?: CryptoFeesSummary
}

function TaxAndCostsSubStrip({ box3, fees }: TaxAndCostsSubStripProps) {
  return (
    <div className="grid gap-6 border-t border-dashed border-[var(--border-ed)] pt-4 sm:grid-cols-[1.2fr_1fr] sm:gap-8">
      <Box3Block data={box3} />
      <FeesBlock data={fees} />
    </div>
  )
}

function Box3Block({
  data,
}: {
  data: ReturnType<typeof computeCryptoBox3Impact>
}) {
  const tooltip = `Indicatieve Box 3-jaarheffing: ${data.ratePct.toFixed(2)}% forfait × ${data.taxRatePct.toFixed(0)}% tarief op de bruto crypto-waarde. Werkelijke heffing hangt af van de drempelvrijstelling (€${data.drempelvrijstellingEur.toLocaleString('nl-NL')} p.p.), partner-grondslag en peildatum 1 januari.`
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Box 3 jaarheffing · indicatief
        </p>
        <span
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--ink-4)] hover:text-[var(--ink-3)]"
          title={tooltip}
          aria-label={tooltip}
          tabIndex={0}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
        {data.belastingEur > 0 ? formatCurrency(data.belastingEur) : '—'}
      </p>
      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
        forfait {data.ratePct.toFixed(2)}% × heffing {data.taxRatePct.toFixed(0)}%
      </p>
    </div>
  )
}

function FeesBlock({ data }: { data?: CryptoFeesSummary }) {
  const hasFees = !!data && data.feeCount > 0
  // Hover-tooltip met breakdown — in krant-stijl als één regel "Bron · €123 · 4". Bij
  // veel exchanges (>3) tonen we alleen de top-3 om de tooltip-regel niet te
  // laten exploderen. De gebruiker kan altijd inzoomen via de transactie-
  // feed onderaan de pagina.
  let tooltip = 'Totale transactiekosten over alle crypto_transactions, omgerekend naar EUR.'
  if (hasFees) {
    const top = data!.byExchange.slice(0, 3)
    const breakdown = top
      .map(
        (b) =>
          `${b.source}: ${formatCurrency(b.eur)} (${b.count} ${b.count === 1 ? 'tx' : 'tx'})`,
      )
      .join('  ·  ')
    const more =
      data!.byExchange.length > top.length
        ? `  ·  +${data!.byExchange.length - top.length} overig`
        : ''
    tooltip = `Per bron — ${breakdown}${more}`
  }
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
          Transactiekosten · totaal
        </p>
        <span
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[var(--ink-4)] hover:text-[var(--ink-3)]"
          title={tooltip}
          aria-label={tooltip}
          tabIndex={0}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
        {hasFees ? formatCurrency(data!.totalFeesEur) : '—'}
      </p>
      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
        {hasFees
          ? `${data!.feeCount} ${data!.feeCount === 1 ? 'transactie' : 'transacties'}${
              data!.byExchange.length > 0
                ? ` · ${data!.byExchange.length} ${data!.byExchange.length === 1 ? 'bron' : 'bronnen'}`
                : ''
            }`
          : 'geen fee-data'}
      </p>
    </div>
  )
}

'use client'

/**
 * Portfolio summary — vervangt de oude KPI-strip + losse Box 3-tegel op
 * /core/assets/holdings. Drie onderdelen:
 *   1. Figures-strip (Playfair, scherpe hoeken, highlight-marker op winnaar)
 *      met periode-keuze. Marktwaarde · Rendement · Vandaag · Forward dividend.
 *   2. Box 3-rij als klikbare kassabon-trigger (skill: "elk getal is klikbaar").
 *   3. Editorial deck-regel met FIRE-koppeling als de gebruiker essentiële
 *      uitgaven heeft ingericht.
 *
 * Period-selector is gekoppeld aan dezelfde state als de BenchmarkComparison-
 * grafiek beneden — `benchmarkComparison.portfolio.returnPct` bevat al een
 * time-weighted return per periode (`lib/benchmark-comparison.ts:514`).
 * Wanneer comparison nog niet geladen is valt de cell terug op de naïef-
 * return over alle holdings (totalValue vs totalCost).
 */

import { useCallback, useState, type ReactNode } from 'react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { Kicker, FiguresStrip, type FigureProps } from '@/components/editorial'
import {
  TIME_PERIODS,
  type TimePeriod,
  type ComparisonResult,
} from '@/lib/benchmark-comparison'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatMaskedCurrency } from '@/lib/format'
import { type calculatePortfolioBox3 } from '@/lib/box3-holdings'

type Box3Summary = ReturnType<typeof calculatePortfolioBox3>

export type AssetClassSlice = {
  label: string
  value: number
  pct: number
}

export type PortfolioSummaryProps = {
  totalValue: number
  totalCost: number
  /** Som van per-holding `daily_change_percent * value` (gewogen) — null als
   *  geen prijsfeed-data beschikbaar. */
  todayChangeEur: number | null
  todayChangePct: number | null
  /** Verwacht netto-NL forward dividend (12 maanden, na 15% bronbelasting).
   *  null als nog geen dividend-data geladen of geen dividend-aandelen. */
  forwardDividendNetNl: number | null
  /** Box 3-summary uit `calculatePortfolioBox3`. */
  box3: Box3Summary
  /** Yearly essentiële uitgaven uit must-budgets (loader). 0 verbergt deck. */
  yearlyEssentialExpenses: number
  activePeriod: TimePeriod
  onPeriodChange: (p: TimePeriod) => void
  /** Geleverde portfolio-rendement uit benchmark-comparison API.
   *  null tijdens initial load of bij <2 datapunten in de gekozen periode. */
  comparison: ComparisonResult | null
  /** Asset-class breakdown voor de compacte allocatie-strip in de hero.
   *  Lege array verbergt de strip (= geen holdings of allemaal soldout). */
  assetClassBreakdown: AssetClassSlice[]
  /** Top-3 posities als % van totaal — null verbergt regel (<3 holdings). */
  concentrationTop3Pct: number | null
}

const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'
const NL_SWR = 0.04

export function PortfolioSummary({
  totalValue,
  totalCost,
  todayChangeEur,
  todayChangePct,
  forwardDividendNetNl,
  box3,
  yearlyEssentialExpenses,
  activePeriod,
  onPeriodChange,
  comparison,
  assetClassBreakdown,
  concentrationTop3Pct,
}: PortfolioSummaryProps) {
  const { masked } = useMaskedAmounts()
  const fc = useCallback(
    (v: number) => formatMaskedCurrency(v, masked),
    [masked],
  )

  const [box3Open, setBox3Open] = useState(false)

  // Rendement over de gekozen periode. Op 'all' valt de strip terug op de
  // naïef return (value − cost / cost) zodat er altijd iets staat, ook als
  // benchmark-comparison nog laadt.
  const periodReturnPct =
    activePeriod.id === 'all' || !comparison
      ? totalCost > 0
        ? ((totalValue - totalCost) / totalCost) * 100
        : 0
      : comparison.portfolio.returnPct
  const periodReturnEur =
    activePeriod.id === 'all'
      ? totalValue - totalCost
      : (totalValue * periodReturnPct) / 100
  const periodReturnEurLabel =
    periodReturnEur >= 0 ? `+${fc(periodReturnEur)}` : `${fc(periodReturnEur)}`
  const periodReturnSub =
    activePeriod.id === 'all'
      ? `${periodReturnEurLabel} sinds aankoop`
      : `${periodReturnEurLabel} over ${activePeriod.label.toLowerCase()}`

  const todayLabel =
    todayChangePct !== null && todayChangeEur !== null
      ? `${todayChangePct >= 0 ? '+' : ''}${todayChangePct.toFixed(2)}%`
      : '—'
  const todaySub =
    todayChangeEur !== null
      ? `${todayChangeEur >= 0 ? '+' : ''}${fc(todayChangeEur)}`
      : 'wacht op prijsfeed'

  const dividendLabel =
    forwardDividendNetNl !== null && forwardDividendNetNl > 0
      ? fc(forwardDividendNetNl)
      : '—'
  const dividendSub =
    forwardDividendNetNl !== null && forwardDividendNetNl > 0
      ? '12 mnd · netto NL'
      : 'nog geen dividend'

  const figures: FigureProps[] = [
    {
      kicker: 'Marktwaarde',
      amount: fc(totalValue),
      sub: `ingelegd ${fc(totalCost)}`,
      variant: 'winner', // hoofdresultaat → highlight-marker
    },
    {
      kicker: 'Rendement',
      amount: `${periodReturnPct >= 0 ? '+' : ''}${periodReturnPct.toFixed(1)}%`,
      sub: periodReturnSub,
      variant: periodReturnPct >= 0 ? 'positive' : 'negative',
    },
    {
      kicker: 'Vandaag',
      amount: todayLabel,
      sub: todaySub,
      variant:
        todayChangePct === null
          ? 'neutral'
          : todayChangePct >= 0
            ? 'positive'
            : 'negative',
    },
    {
      kicker: 'Dividend 12M',
      amount: dividendLabel,
      sub: dividendSub,
      variant: 'neutral',
    },
  ]

  const showFireDeck =
    yearlyEssentialExpenses > 0 && totalValue > 0
  const yearsCovered = showFireDeck
    ? totalValue / yearlyEssentialExpenses
    : 0
  const swrYears = showFireDeck
    ? totalValue / (yearlyEssentialExpenses / NL_SWR)
    : 0

  return (
    <section className="mt-2">
      <FiguresStrip cols={4} figures={figures} />

      {/* Allocatie-strip — compacte one-liner direct onder de figures-strip,
          klikbaar naar de full donut-sectie. Geeft snel inzicht in
          aandelen/ETF/crypto-mix zonder dat je hoeft te scrollen. */}
      {assetClassBreakdown.length > 0 && (
        <AllocationStrip
          slices={assetClassBreakdown}
          concentrationTop3Pct={concentrationTop3Pct}
          fc={fc}
        />
      )}

      {/* Periode-selector — toggle-pill-stijl, scherpe hoeken voor pill-rail */}
      <div className="-mt-3 mb-4 flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-[var(--ink-3)]">
          Periode
        </span>
        <div
          className="flex flex-wrap gap-1"
          role="tablist"
          aria-label="Rendement-periode"
        >
          {TIME_PERIODS.map((p) => {
            const active = p.id === activePeriod.id
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onPeriodChange(p)}
                className={`min-h-[32px] px-2.5 py-1 text-[11px] font-mono font-semibold uppercase tracking-[0.12em] border transition-colors ${
                  active
                    ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                    : 'bg-transparent text-[var(--ink-3)] border-[var(--rule-soft)] hover:text-[var(--ink-2)] hover:border-[var(--ink-3)]'
                }`}
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Box 3 als kassabon-trigger — klikbare rij, geen aparte kaart */}
      {box3.totalValue > 0 && (
        <button
          type="button"
          onClick={() => setBox3Open(true)}
          className="mt-1 mb-4 w-full text-left flex items-center justify-between gap-4 border-t border-b border-[var(--rule-soft)] py-3 hover:bg-[var(--subtle)]/40 transition-colors"
          aria-label="Bekijk Box 3-kassabon"
        >
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-block h-px w-7 shrink-0"
              style={{ background: 'var(--module-active-500)' }}
            />
            <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-[var(--module-active-700)]">
              Box 3-belasting
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="font-mono tabular-nums text-sm text-[var(--ink)]"
              style={{ fontWeight: 600 }}
            >
              {fc(box3.totalTax)}/jaar
            </span>
            <span className="text-[10px] font-mono text-[var(--ink-3)]">
              {(box3.effectiveRate * 100).toFixed(2)}%
            </span>
            <ChevronRight />
          </div>
        </button>
      )}

      {/* FIRE-deck-regel — Horizon-koppeling via editorial italic */}
      {showFireDeck && (
        <FireDeckLine
          yearsCovered={yearsCovered}
          swrYears={swrYears}
          fontFamily={SOURCE_SERIF}
        />
      )}

      <Box3Sheet
        open={box3Open}
        onClose={() => setBox3Open(false)}
        box3={box3}
        fc={fc}
      />
    </section>
  )
}

/**
 * Compacte allocatie-strip: stacked-bar + percentage-chips per asset-class,
 * concentratie-regel eronder. Klikbaar naar de full donut-sectie via anchor.
 * Editorial-tonen: dotted divider boven, kleine swatches in module-shades.
 */
function AllocationStrip({
  slices,
  concentrationTop3Pct,
  fc,
}: {
  slices: AssetClassSlice[]
  concentrationTop3Pct: number | null
  fc: (v: number) => string
}) {
  // Module-aware kleur-rotatie. We gebruiken module-active shades zodat de
  // strip automatisch meekleurt met de actieve module (Kern hier). 200/400/700
  // geeft drie zichtbare niveaus zonder hardcoded hex.
  const shades = [
    'var(--module-active-700)',
    'var(--module-active-500)',
    'var(--module-active-300)',
    'var(--ink-3)',
  ]

  return (
    <a
      href="#portfolio-allocation"
      className="block mt-1 mb-4 border-t border-b border-dotted border-[var(--rule-soft)] py-3 hover:bg-[var(--subtle)]/40 transition-colors"
      aria-label="Bekijk volledige allocatie"
    >
      <div className="flex items-center gap-2.5 mb-2">
        <span
          aria-hidden
          className="inline-block h-px w-7 shrink-0"
          style={{ background: 'var(--module-active-500)' }}
        />
        <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-[var(--module-active-700)]">
          Verdeling
        </span>
        {concentrationTop3Pct !== null && (
          <span
            className="ml-auto text-[10px] font-mono tabular-nums text-[var(--ink-3)]"
            title="Top-3 posities als percentage van het portfolio (concentratie-indicator)"
          >
            top-3 = {concentrationTop3Pct.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Stacked-bar — proportioneel, scherpe hoeken */}
      <div
        className="flex h-1.5 w-full overflow-hidden bg-[var(--subtle)]"
        role="img"
        aria-label="Allocatie per asset-class"
      >
        {slices.map((s, idx) => (
          <div
            key={s.label}
            style={{
              width: `${s.pct}%`,
              background: shades[idx] ?? shades[shades.length - 1],
            }}
            title={`${s.label} ${s.pct.toFixed(1)}%`}
          />
        ))}
      </div>

      {/* Chip-rij — label · percentage · bedrag */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px]">
        {slices.map((s, idx) => (
          <span key={s.label} className="inline-flex items-baseline gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 self-center"
              style={{ background: shades[idx] ?? shades[shades.length - 1] }}
            />
            <span className="text-[var(--ink-2)]">{s.label}</span>
            <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">
              {s.pct.toFixed(0)}%
            </span>
            <span className="font-mono tabular-nums text-[var(--ink-3)]">
              {fc(s.value)}
            </span>
          </span>
        ))}
      </div>
    </a>
  )
}

function ChevronRight() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[var(--ink-3)]"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function FireDeckLine({
  yearsCovered,
  swrYears,
  fontFamily,
}: {
  yearsCovered: number
  swrYears: number
  fontFamily: string
}) {
  // Twee framings: brutto (jaren waar je portfolio op kunt teren tot €0) en
  // SWR (jaren bij 4%-onttrekking — duurzaam). Toon SWR primair als die ≥1,
  // anders brutto met label "uitgaven".
  const useSwr = swrYears >= 1
  const display = useSwr ? swrYears : yearsCovered
  const yearsLabel = display.toFixed(1).replace('.', ',')
  const framing = useSwr
    ? `Bij 4% onttrekking financiert deze portefeuille ${yearsLabel} jaar van je essentiële uitgaven.`
    : `Deze portefeuille dekt ${yearsLabel} jaar essentiële uitgaven (zonder rendement-aanname).`
  return (
    <p
      className="italic text-[13px] leading-snug text-[var(--ink-2)] pl-3 max-w-[60ch] mb-4"
      style={{
        fontFamily,
        borderLeft: '2px solid var(--module-active-500)',
      }}
    >
      {framing}
    </p>
  )
}

function Box3Sheet({
  open,
  onClose,
  box3,
  fc,
}: {
  open: boolean
  onClose: () => void
  box3: Box3Summary
  fc: (v: number) => string
}) {
  // Aggregate per-holding velden naar portfolio-niveau voor de kassabon-rijen.
  const taxableValue = box3.holdings.reduce((s, h) => s + h.taxableValue, 0)
  const forfaitRendement = box3.holdings.reduce(
    (s, h) => s + h.forfaitRendement,
    0,
  )
  const tarief = box3.holdings[0]?.tarief ?? 0.36
  const forfaitRate = box3.holdings[0]?.forfaitRate ?? 0
  return (
    <ShellOverlay open={open} onClose={onClose} kind="sheet" size="md" title="Box 3-kassabon">
      <div className="space-y-4">
        <Kicker>Berekening</Kicker>
        <dl className="text-sm">
          <Row label="Bruto vermogen" value={fc(box3.totalValue)} />
          <Row label="Heffingsvrij vermogen" value={fc(box3.totalExemption)} />
          <Row label="Belastbaar deel" value={fc(taxableValue)} />
          <Row
            label={`Fictief rendement (${(forfaitRate * 100).toFixed(2)}%)`}
            value={fc(forfaitRendement)}
          />
          <Row
            label={`Tarief ${(tarief * 100).toFixed(0)}%`}
            value={fc(box3.totalTax)}
            emphasis
          />
        </dl>
        <p
          className="italic text-[13px] leading-snug text-[var(--ink-3)]"
          style={{ fontFamily: SOURCE_SERIF }}
        >
          Effectief tarief over je totale beleggingsvermogen:{' '}
          <strong className="not-italic font-bold text-[var(--ink)]">
            {(box3.effectiveRate * 100).toFixed(2)}%
          </strong>
          . Berekend via fictief rendement; netto kunnen dividend en koerswinst
          deze heffing meer dan compenseren.
        </p>
      </div>
    </ShellOverlay>
  )
}

function Row({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: ReactNode
  emphasis?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-2 ${
        emphasis
          ? 'border-t-4 border-double border-[var(--ink)] mt-2 pt-3'
          : 'border-b border-dotted border-[var(--rule-soft)]'
      }`}
    >
      <dt
        className={`text-[var(--ink-2)] ${emphasis ? 'font-bold text-[var(--ink)]' : ''}`}
      >
        {label}
      </dt>
      <dd
        className={`font-mono tabular-nums ${
          emphasis ? 'font-bold text-[var(--ink)]' : 'text-[var(--ink-2)]'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

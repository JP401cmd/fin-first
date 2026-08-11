'use client'

/**
 * Portfolio summary — de KPI-strip bovenaan /core/assets/holdings. Drie
 * onderdelen:
 *   1. Figures-strip (Playfair, scherpe hoeken, highlight-marker op winnaar):
 *      Marktwaarde · Rendement · Vandaag · Forward dividend.
 *   2. Compacte allocatie-strip met concentratie-indicator.
 *   3. Editorial deck-regel met FIRE-koppeling als de gebruiker essentiële
 *      uitgaven heeft ingericht.
 *
 * De periode-rail staat bewust NIET meer in dit component maar op de pagina
 * zelf: hij stuurt inmiddels drie consumenten aan (deze rendement-cel, de
 * waardegrafiek en de benchmark-vergelijking), en hoorde daarmee niet langer
 * bij de hero. `activePeriod` komt hier alleen nog binnen als label-context.
 *
 * Het rendement is de tijdgewogen return over de gekozen periode uit
 * `lib/benchmark-comparison.ts` (single source; deze cell rekent niets zelf
 * uit). Dat veld is `null` zodra de koershistorie ontbreekt; de cell toont dan
 * een streepje. Bij periode 'Alles' komt het getal uit de canonieke
 * aggregatie-engine (`totalPnL`/`totalInvested`) — zie de prop-toelichting.
 *
 * Box 3 staat hier niet meer: die hoort op /overzicht/belasting/box3, waar de
 * heffing over het héle vermogen wordt berekend in plaats van over alleen deze
 * portefeuille.
 */

import { useCallback } from 'react'
import { FiguresStrip, type FigureProps } from '@/components/editorial'
import {
  type TimePeriod,
  type ComparisonResult,
} from '@/lib/benchmark-comparison'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatMaskedCurrency } from '@/lib/format'

export type AssetClassSlice = {
  label: string
  value: number
  pct: number
}

export type PortfolioSummaryProps = {
  totalValue: number
  /**
   * Totale opbrengst over de HELE historie uit de canonieke aggregatie-engine:
   * gerealiseerd + ongerealiseerd + dividend − kosten, over álle posities.
   *
   * Hier stond eerder `totalCost` (= `units × avg_purchase_price`), waaruit het
   * rendement als `(totalValue − totalCost) / totalCost` volgde. Dat getal telt
   * alleen de posities die je NU nog hebt: een verkochte positie heeft
   * `units = 0` en verdwijnt mét het resultaat dat je erop maakte. Op een
   * portefeuille met 14 open en 95 gesloten posities negeerde de KPI daarmee
   * 95 van de 109 posities — en stond er een "ingelegd"-bedrag onder dat niet
   * bij de marktwaarde ernaast hoorde.
   */
  totalPnL: number
  /** Bruto Σ aankoopbedragen over dezelfde historie — de noemer bij `totalPnL`. */
  totalInvested: number
  /** Aantal posities met een open positie (units > 0) — subregel bij marktwaarde. */
  openPositionsCount: number
  /** Som van per-holding `daily_change_percent * value` (gewogen) — null als
   *  geen prijsfeed-data beschikbaar. */
  todayChangeEur: number | null
  todayChangePct: number | null
  /** Verwacht netto-NL forward dividend (12 maanden, na 15% bronbelasting).
   *  null als nog geen dividend-data geladen of geen dividend-aandelen. */
  forwardDividendNetNl: number | null
  /** Yearly essentiële uitgaven uit must-budgets (loader). 0 verbergt deck. */
  yearlyEssentialExpenses: number
  /**
   * Gepersonaliseerde veilige onttrekkingsvoet uit de loader
   * (`HoldingsPageData.effectiveSwr` ← `resolveFireParamsWithAssumptions`).
   * De ENIGE onttrekkingsvoet die dit oppervlak mag tonen — consume, don't
   * recompute. `null` = geen grondslag geleverd (server-load mislukt); de
   * deck-regel valt dan terug op de SWR-vrije bruto-framing in plaats van een
   * percentage te tonen dat niet van deze gebruiker is.
   */
  effectiveSwr: number | null
  /** Alleen label-context voor de rendement-cel; de rail zelf staat op de pagina. */
  activePeriod: TimePeriod
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
// SWR voor de FIRE-deck-regel komt binnen als prop (`effectiveSwr`), niet uit
// een import. Twee eerdere stadia zaten hier fout: eerst een lokale
// `const NL_SWR = 0.04` die de échte constante schaduwde, daarna de echte
// `NL_SWR`-import — canoniek, maar het is de app-brede no-profiel-fallback en
// dus niet de onttrekkingsvoet van DEZE gebruiker. Op dit oppervlak was NL_SWR
// bovendien de ENIGE bron (geen fallback naast een primaire prop, zoals bij de
// horizon-componenten), waardoor de hero structureel een ander SWR-percentage
// toonde dan de SWR-monitor-widget en elk ander FIRE-oppervlak. De loader
// levert de grondslag nu wél: HoldingsPageData.effectiveSwr.

export function PortfolioSummary({
  totalValue,
  totalPnL,
  totalInvested,
  openPositionsCount,
  todayChangeEur,
  todayChangePct,
  forwardDividendNetNl,
  yearlyEssentialExpenses,
  effectiveSwr,
  activePeriod,
  comparison,
  assetClassBreakdown,
  concentrationTop3Pct,
}: PortfolioSummaryProps) {
  const { masked } = useMaskedAmounts()
  const fc = useCallback(
    (v: number) => formatMaskedCurrency(v, masked),
    [masked],
  )

  // Rendement over de gekozen periode.
  //   • 'Alles' = het totale resultaat over de hele historie, uit de canonieke
  //     aggregatie-engine: gerealiseerd + ongerealiseerd + dividend − kosten,
  //     gedeeld door wat je in totaal hebt ingelegd. Dat telt óók de posities
  //     die je inmiddels verkocht hebt — precies wat de oude
  //     `(totalValue − totalCost)`-som liet vallen. Hangt niet van koershistorie
  //     af. Consume, don't recompute: de som staat in de loader/route.
  //   • Elke andere periode komt uitsluitend uit de benchmark-motor. Levert die
  //     `null` (geen maandelijkse koersobservaties), dan tonen we een streepje
  //     i.p.v. het sinds-aankoop-getal met een periodelabel eronder — dat las
  //     als een periode-rendement dat het niet is (bugkaart testbug-ffa902).
  const lifetimeReturnPct =
    totalInvested > 0 ? (totalPnL / totalInvested) * 100 : null
  const periodReturnPct =
    activePeriod.id === 'all'
      ? lifetimeReturnPct
      : comparison?.portfolio.returnPct ?? null

  const periodReturnEur =
    activePeriod.id === 'all'
      ? lifetimeReturnPct !== null
        ? totalPnL
        : null
      : periodReturnPct !== null
        ? (totalValue * periodReturnPct) / 100
        : null
  const periodReturnEurLabel =
    periodReturnEur === null
      ? null
      : periodReturnEur >= 0
        ? `+${fc(periodReturnEur)}`
        : `${fc(periodReturnEur)}`
  const periodReturnSub =
    activePeriod.id === 'all'
      ? periodReturnEurLabel !== null
        // Zonder deze guard rendert de cel letterlijk "null sinds aankoop":
        // `periodReturnEurLabel` is null zodra er geen inleg bekend is, en dit
        // was de enige tak zonder controle. Vóór de overstap op de P&L-motor
        // kón dat niet — het bedrag was toen altijd een getal.
        ? `${periodReturnEurLabel} sinds aankoop`
        : 'nog geen inleg bekend'
      : periodReturnEurLabel !== null
        ? `${periodReturnEurLabel} ${activePeriod.windowLabel}`
        : comparison
          ? 'koershistorie ontbreekt'
          : 'wordt berekend…'

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
      // Bewust GEEN "ingelegd €x" meer: dat bedrag was `units ×
      // avg_purchase_price` over de open posities, dus het hoorde niet bij de
      // marktwaarde ernaast zodra er ook maar één positie verkocht was. Het
      // aantal open posities is wél een eerlijke duiding van hetzelfde getal.
      sub: openPositionsCount === 1 ? '1 positie' : `${openPositionsCount} posities`,
      variant: 'winner', // hoofdresultaat → highlight-marker
    },
    {
      kicker: 'Rendement',
      amount:
        periodReturnPct === null
          ? '—'
          : `${periodReturnPct >= 0 ? '+' : ''}${periodReturnPct.toFixed(1)}%`,
      sub: periodReturnSub,
      variant:
        periodReturnPct === null
          ? 'neutral'
          : periodReturnPct >= 0
            ? 'positive'
            : 'negative',
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
  const swrYears =
    showFireDeck && effectiveSwr !== null
      ? totalValue / (yearlyEssentialExpenses / effectiveSwr)
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

      {/* FIRE-deck-regel — Horizon-koppeling via editorial italic */}
      {showFireDeck && (
        <FireDeckLine
          yearsCovered={yearsCovered}
          swrYears={swrYears}
          swr={effectiveSwr}
          fontFamily={SOURCE_SERIF}
        />
      )}
    </section>
  )
}

/**
 * Periode-rail — toggle-pill-stijl, scherpe hoeken.
 *
 * Woont sinds aug 2026 als eigen sectie op de pagina in plaats van in de hero:
 * hij stuurt drie oppervlakken tegelijk aan (de rendement-cel hierboven, de
 * waardegrafiek en de benchmark-vergelijking), en hoorde daarmee niet langer
 * bij één ervan. De vormgeving blijft hier zodat er één rail-recept is.
 */
export function PeriodRail({
  periods,
  activePeriod,
  onPeriodChange,
  className = '',
}: {
  periods: readonly TimePeriod[]
  activePeriod: TimePeriod
  onPeriodChange: (p: TimePeriod) => void
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-[var(--ink-3)]">
        Periode
      </span>
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Periode">
        {periods.map((p) => {
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

function FireDeckLine({
  yearsCovered,
  swrYears,
  swr,
  fontFamily,
}: {
  yearsCovered: number
  swrYears: number
  /**
   * Gepersonaliseerde onttrekkingsvoet die de SWR-framing aanstuurt
   * (`effectiveSwr`, doorgegeven vanaf de loader). `null` = geen grondslag →
   * uitsluitend de bruto-framing, nooit een generiek percentage.
   */
  swr: number | null
  fontFamily: string
}) {
  // Twee framings: brutto (jaren waar je portfolio op kunt teren tot €0) en
  // SWR (jaren bij duurzame onttrekking). Toon SWR primair als die ≥1, anders
  // brutto met label "uitgaven". Het percentage komt uit de doorgegeven `swr`
  // zodat de tekst nooit een ander tarief noemt dan waarmee gerekend is.
  const useSwr = swr !== null && swrYears >= 1
  const display = useSwr ? swrYears : yearsCovered
  const yearsLabel = display.toFixed(1).replace('.', ',')
  const framing =
    useSwr && swr !== null
      ? `Bij ${(swr * 100).toFixed(1).replace('.', ',')}% onttrekking financiert deze portefeuille ${yearsLabel} jaar van je essentiële uitgaven.`
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

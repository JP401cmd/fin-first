'use client'

/**
 * Historische waardegrafiek van de effectenportefeuille — /core/assets/holdings.
 *
 * Twee lijnen over dezelfde tijdas: de marktwaarde van alle open posities
 * (vol, kern-accent) en de inleg/kostbasis van diezelfde posities (dunner,
 * gedempt). Het verschil tussen die twee lijnen ís het rendement; de grafiek
 * hoeft dat dus niet apart te rekenen — en doet dat ook niet.
 *
 * Alle cijfers komen uit `GET /api/holdings/value-history`. Dit component
 * berekent geen kerngetallen: het schaalt, tekent en benoemt wat de route
 * levert (consume, don't recompute — CLAUDE.md).
 *
 * Eerlijke grondslag is hier geen versiering maar de kern van het vertrouwen:
 * een deel van de historische waarde rust op een échte slotkoers, een deel op
 * de laatst bekende transactieprijs. `pricedFromMarket`/`averagePricedFromMarket`
 * dragen dat aandeel, en de regel onder de grafiek zegt het in gewone taal.
 * Alleen bij een volledig marktgewaardeerde reeks (== 1) verdwijnt die regel.
 *
 * Bouwpatroon gespiegeld op `app/(app)/core/assets/holdings/[id]/value-chart-client.tsx`
 * (handgeschreven inline SVG met viewBox, useMemo-gememoiseerde path-strings,
 * memo()-wrapper) — de repo heeft bewust geen chart-library. Styling volgt de
 * editorial design-taal (scherpe hoeken, ink-tokens, DM Mono voor bedragen).
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { LineChart } from 'lucide-react'
import { Kicker } from '@/components/editorial'
import { useModuleHex } from '@/components/app/module-color-provider'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  calculateFreedomTime,
  dailyExpenseRate,
  formatDateShort,
  formatFreedomTimeString,
  formatMaskedCurrency,
} from '@/lib/format'

// ── Contract van de databron ─────────────────────────────────────

export type PortfolioValueHistoryPoint = {
  /** 'YYYY-MM-01' (1e van de maand); het laatste punt is vandaag. */
  date: string
  /** Marktwaarde van alle open posities op die datum, EUR. */
  marketValue: number
  /** Inleg (kostbasis) van diezelfde posities, EUR. */
  costBasis: number
  openPositions: number
  /** 0..1 — aandeel van marketValue dat op een ECHTE slotkoers rust. */
  pricedFromMarket: number
}

export type PortfolioValueHistoryResponse = {
  points: PortfolioValueHistoryPoint[]
  averagePricedFromMarket: number
  holdingsWithoutMarketPriceCount: number
  totalHoldings: number
}

export type PortfolioValueChartProps = {
  /** Aantal maanden historie dat de route moet leveren. Default 12. */
  months?: number
  /**
   * Jaarlijkse essentiële uitgaven uit de must-budgets (loader-veld
   * `yearlyEssentialExpenses`, zelfde bron als `PortfolioSummary`). 0 of
   * ontbrekend verbergt de vrijheidstijd-regel — liever geen duiding dan een
   * verzonnen dagtarief.
   */
  yearlyEssentialExpenses?: number
  className?: string
}

// ── Vormgeving ───────────────────────────────────────────────────

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

/**
 * Breedte vóór de eerste meting (en in jsdom, waar ResizeObserver een mock is).
 * De echte breedte komt uit een ResizeObserver op de grafiek-wrapper, zodat de
 * viewBox 1-op-1 met CSS-pixels loopt — anders schaalt een viewBox van vaste
 * breedte de as-teksten op mobiel mee naar ~5px. Zelfde aanpak als
 * `components/app/horizon/sim-chart.tsx` (`containerW`).
 */
const DEFAULT_W = 640

/** Volledige animatiesequentie: 700ms lijn + 80ms stagger op de tweede lijn. */
const ANIM_DURATION = 780

/** Geometrie voor een gemeten breedte — smal scherm krijgt een lagere kaart,
 *  smallere marges en minder x-labels. */
function layoutFor(width: number) {
  const W = Math.max(300, Math.round(width))
  const narrow = W < 420
  const H = narrow ? 200 : 250
  const PAD = {
    top: 16,
    right: narrow ? 14 : 26,
    bottom: 30,
    left: narrow ? 44 : 56,
  }
  return {
    W,
    H,
    PAD,
    chartW: W - PAD.left - PAD.right,
    chartH: H - PAD.top - PAD.bottom,
    maxXLabels: narrow ? 3 : W < 560 ? 4 : 6,
  }
}

// ── Container: laadt, kiest de staat, rendert ────────────────────

export const PortfolioValueChart = memo(function PortfolioValueChart({
  months = 12,
  yearlyEssentialExpenses = 0,
  className = '',
}: PortfolioValueChartProps) {
  const [data, setData] = useState<PortfolioValueHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Datapad (ADR 0058): dit is een on-demand read via een API-ROUTE, niet een
  // directe client-read op Supabase — dat pad is expliciet toegestaan voor data
  // die niet in de loader-bundel past. En dat is hier het geval: de curve vraagt
  // de vólledige transactie- én koershistorie van álle posities (bij een echt
  // account tienduizenden rijen na een backfill) en een replay per maandpunt.
  // Dat in `loadHoldingsData` hangen zou élke holdings-render met dat werk
  // belasten, ook voor wie nooit naar de grafiek kijkt.
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function load() {
      try {
        const res = await fetch(`/api/holdings/value-history?months=${months}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as PortfolioValueHistoryResponse
        if (cancelled) return
        setData(json)
        setFailed(false)
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === 'AbortError')) return
        // Stil degraderen: de grafiek is duiding, geen kritiek pad. Geen rode
        // banner die de holdings-pagina domineert.
        setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [months, attempt])

  const retry = useCallback(() => {
    setLoading(true)
    setFailed(false)
    setAttempt(a => a + 1)
  }, [])

  if (loading) {
    return (
      <ChartShell className={className} testId="portfolio-value-chart-loading">
        <div className="mt-4 animate-pulse space-y-3" aria-hidden>
          <div className="h-3 w-40 bg-[var(--subtle)]" />
          <div className="h-[200px] w-full bg-[var(--subtle)]" />
          <div className="h-3 w-2/3 bg-[var(--subtle)]" />
        </div>
        <p className="sr-only" role="status">Waardeverloop wordt geladen.</p>
      </ChartShell>
    )
  }

  if (failed) {
    return (
      <ChartShell className={className} testId="portfolio-value-chart-error">
        <p className="mt-3 font-serif text-[13px] italic leading-relaxed text-[var(--ink-3)]">
          Het waardeverloop is nu niet op te halen. De rest van je portefeuille
          klopt gewoon.
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-2 inline-flex min-h-[32px] items-center px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-2)] underline decoration-[var(--rule-soft)] underline-offset-4 hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--module-active-500)]"
        >
          Opnieuw proberen
        </button>
      </ChartShell>
    )
  }

  const points = data?.points ?? []

  // Eén punt is geen verloop: één datapunt zou een vlakke lijn suggereren die
  // er niet is. Beide gevallen krijgen dezelfde eerlijke lege staat.
  if (points.length < 2) {
    return (
      <ChartShell className={className} testId="portfolio-value-chart-empty">
        <p className="mt-3 font-serif text-[13px] italic leading-relaxed text-[var(--ink-2)]">
          Er is nog geen transactiehistorie om een verloop van te tekenen. Zodra
          je transacties over meerdere maanden lopen, zie je hier je marktwaarde
          naast je inleg.
        </p>
        <Link
          href="/core/assets/holdings/import"
          className="mt-3 inline-flex min-h-[36px] items-center border border-[var(--ink)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--module-active-500)]"
        >
          Importeer je transacties
        </Link>
      </ChartShell>
    )
  }

  return (
    <ValueHistoryChart
      className={className}
      points={points}
      averagePricedFromMarket={data!.averagePricedFromMarket}
      holdingsWithoutMarketPriceCount={data!.holdingsWithoutMarketPriceCount}
      totalHoldings={data!.totalHoldings}
      yearlyEssentialExpenses={yearlyEssentialExpenses}
      onReload={retry}
    />
  )
})

// ── Gedeelde kaart-omhulling (kop is in elke staat gelijk) ───────

function ChartShell({
  children,
  className = '',
  testId,
}: {
  children: React.ReactNode
  className?: string
  testId: string
}) {
  return (
    <section
      className={`border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6 ${className}`}
      data-testid={testId}
    >
      <Kicker>
        <LineChart className="-mt-0.5 mr-1 inline h-3 w-3" aria-hidden />
        Waardeverloop
      </Kicker>
      {/* Narratieve Playfair-kop met één italic-em in module-accent; de kicker
          draagt de vakterm, de kop de betekenis. */}
      <h2
        className="mt-1.5 text-[15px] font-semibold leading-snug text-[var(--ink)] sm:text-[17px]"
        style={{ fontFamily: PLAYFAIR }}
      >
        Wat je inleg{' '}
        <em className="font-normal italic text-[var(--module-active-700)]">waard</em> werd
      </h2>
      {children}
    </section>
  )
}

// ── De grafiek zelf ──────────────────────────────────────────────

function ValueHistoryChart({
  points,
  averagePricedFromMarket,
  holdingsWithoutMarketPriceCount,
  totalHoldings,
  yearlyEssentialExpenses,
  onReload,
  className = '',
}: {
  points: PortfolioValueHistoryPoint[]
  averagePricedFromMarket: number
  holdingsWithoutMarketPriceCount: number
  totalHoldings: number
  yearlyEssentialExpenses: number
  /** Herlaadt de reeks nadat de koershistorie is opgehaald. */
  onReload: () => void
  className?: string
}) {
  const { masked } = useMaskedAmounts()
  const fc = useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
  const { ref, hasEntered, animationComplete } = useInViewAnimation({ duration: ANIM_DURATION })
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  // Module-identiteit: holdings valt onder Overzicht/De Kern, dus de
  // marktwaarde-lijn volgt het door de gebruiker gekozen kern-accent.
  const marketColor = useModuleHex('kern', 500)
  const gradientId = 'portfolio-value-area'

  // Gemeten breedte → viewBox-breedte, zodat 1 SVG-eenheid 1 CSS-pixel is en
  // de 9px-as-teksten op mobiel niet mee wegschalen.
  const [containerW, setContainerW] = useState(DEFAULT_W)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setContainerW(Math.round(w))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  // Alle geometrie in één memo — schaal, paden, ticks en labels hangen van
  // dezelfde inputs af (punten + gemeten breedte).
  const geo = useMemo(() => {
    const { W, H, PAD, chartW, chartH, maxXLabels } = layoutFor(containerW)

    const values = points.flatMap(p => [p.marketValue, p.costBasis])
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const span = rawMax - rawMin || Math.max(Math.abs(rawMax) * 0.1, 1)
    const minVal = Math.max(0, rawMin - span * 0.12)
    const maxVal = rawMax + span * 0.12
    const range = maxVal - minVal || 1
    const x = (i: number) => PAD.left + (i / Math.max(1, points.length - 1)) * chartW
    const y = (v: number) => PAD.top + chartH - ((v - minVal) / range) * chartH

    const line = (pick: (p: PortfolioValueHistoryPoint) => number) =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(pick(p)).toFixed(1)}`)
        .join(' ')
    const market = line(p => p.marketValue)
    const baseline = y(minVal).toFixed(1)
    const paths = {
      market,
      cost: line(p => p.costBasis),
      area: `${market} L ${x(points.length - 1).toFixed(1)} ${baseline} L ${x(0).toFixed(1)} ${baseline} Z`,
    }

    // Eén precisie voor de héle as: gemengde ticks (€9,0k naast €11k) lezen
    // als slordigheid, en afronden op hele duizenden maakt gelijke stappen
    // ongelijk (9 → 11 → 12). Pas vanaf een stap van €5k is heel-k eerlijk.
    const steps = 4
    const tickStep = range / steps
    const decimals = tickStep >= 5_000 ? 0 : 1
    const yTicks = Array.from({ length: steps + 1 }, (_, i) => {
      const val = minVal + tickStep * i
      return { y: y(val), label: compactEur(val, decimals) }
    })

    // Minder x-labels naarmate de kaart smaller is; eerste en laatste blijven.
    const step = Math.max(1, Math.ceil(points.length / maxXLabels))
    const idxs: number[] = []
    for (let i = 0; i < points.length; i += step) idxs.push(i)
    const lastIdx = points.length - 1
    if (idxs[idxs.length - 1] !== lastIdx) {
      idxs.push(lastIdx)
      // Het laatste punt telt altijd mee, maar mag het label ervóór niet
      // overlappen (bv. "jan 26" tegen "feb 26"): valt het te dicht, dan
      // verdwijnt de voorlaatste.
      const penultimate = idxs[idxs.length - 2]
      // ~60px: het end-geankerde laatste label ("feb 26") is zelf al ~38px
      // breed en het label ervóór staat gecentreerd op zijn punt.
      if (penultimate !== undefined && x(lastIdx) - x(penultimate) < 60) {
        idxs.splice(idxs.length - 2, 1)
      }
    }
    // Randlabels ankeren binnenwaarts: een gecentreerd laatste label loopt op
    // smalle kaarten buiten de viewBox en wordt afgekapt.
    const xLabels = idxs.map(i => ({
      i,
      x: x(i),
      label: monthLabel(points[i].date),
      anchor: (i === 0 ? 'start' : i === lastIdx ? 'end' : 'middle') as
        | 'start'
        | 'end'
        | 'middle',
    }))

    return {
      W, H, PAD, chartW, chartH,
      minVal, x, y, paths, yTicks, xLabels,
      sliceW: chartW / Math.max(1, points.length - 1),
    }
  }, [points, containerW])

  const first = points[0]
  const last = points[points.length - 1]
  const diff = last.marketValue - last.costBasis

  // Vrijheidstijd van de eindwaarde. Dagtarief via de canonieke helper; de
  // /12 is enkel de jaar→maand-eenheid die `dailyExpenseRate` verwacht
  // (×12/365 blijft dus de enige dag-conversie in de app).
  const dailyExpenses = yearlyEssentialExpenses > 0 ? dailyExpenseRate(yearlyEssentialExpenses / 12) : 0
  const freedomText = useMemo(() => {
    if (dailyExpenses <= 0) return null
    const breakdown = calculateFreedomTime(last.marketValue, dailyExpenses)
    if (breakdown.isInfinite) return null
    return formatFreedomTimeString(breakdown, 'long')
  }, [dailyExpenses, last.marketValue])

  // Grondslag-percentage: bewust naar beneden geknepen zodat 99,6% nooit als
  // "100% marktkoersen" leest. Geen precisie suggereren die er niet is.
  const pricedPct = useMemo(() => {
    const raw = Math.round(averagePricedFromMarket * 100)
    if (averagePricedFromMarket < 1 && raw >= 100) return 99
    if (averagePricedFromMarket > 0 && raw <= 0) return 1
    return raw
  }, [averagePricedFromMarket])
  const showBasisNote = averagePricedFromMarket < 1

  const trendWord = diffWord(last.marketValue - first.marketValue)
  const ariaLabel =
    `Waardeverloop van je portefeuille, ${formatDateShort(first.date)} tot ${formatDateShort(last.date)}. ` +
    `Marktwaarde ${trendWord} van ${fc(first.marketValue)} naar ${fc(last.marketValue)}; ` +
    `inleg van ${fc(first.costBasis)} naar ${fc(last.costBasis)}.`

  const lineStyle = (delayMs: number) => ({
    strokeDashoffset: hasEntered ? 0 : 1,
    transition: hasEntered
      ? `stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1) ${delayMs}ms`
      : 'none',
  })

  const hovered = hoveredIdx !== null ? points[hoveredIdx] : null

  return (
    <ChartShell className={className} testId="portfolio-value-chart">
      {/* Vrijheidstijd van de eindwaarde — geld is opgeslagen tijd. Bij
          privacy-masking valt de regel weg: hij zou de orde van grootte van het
          gemaskeerde bedrag alsnog verklappen. */}
      {freedomText && !masked && (
        <p
          className="mt-2 max-w-[60ch] border-l-2 border-[var(--module-active-500)] pl-3 font-serif text-[13px] italic leading-relaxed text-[var(--ink-2)]"
          data-testid="portfolio-value-freedom"
        >
          Op je essentiële uitgaven staat deze portefeuille vandaag voor{' '}
          <span className="whitespace-nowrap font-mono not-italic tabular-nums text-[var(--ink)]">
            {freedomText}
          </span>{' '}
          vrijheid.
        </p>
      )}

      {/* Grafiek — de ref van `useInViewAnimation` zit op de grafiek-wrapper:
          de lijnen tekenen zich zodra de grafiek zelf in beeld komt. */}
      <div ref={ref} className="relative mt-4">
        <svg
          viewBox={`0 0 ${geo.W} ${geo.H}`}
          className="w-full"
          style={{ maxWidth: '100%' }}
          role="img"
          aria-label={ariaLabel}
          onMouseLeave={animationComplete ? () => setHoveredIdx(null) : undefined}
          data-testid="portfolio-value-chart-svg"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={marketColor} stopOpacity="0.20" />
              <stop offset="100%" stopColor={marketColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Rasterlijnen + Y-as */}
          {geo.yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={geo.PAD.left}
                y1={tick.y}
                x2={geo.W - geo.PAD.right}
                y2={tick.y}
                strokeDasharray="2 3"
                style={{ stroke: 'var(--rule-soft)' }}
              />
              <text
                x={geo.PAD.left - 8}
                y={tick.y + 3}
                textAnchor="end"
                fontSize="9"
                fontFamily="var(--font-dm-mono, monospace)"
                style={{ fill: 'var(--ink-3)' }}
              >
                {masked ? '•••' : tick.label}
              </text>
            </g>
          ))}

          {/* X-as — het aantal labels volgt de gemeten breedte */}
          {geo.xLabels.map(l => (
            <text
              key={l.i}
              x={l.x}
              y={geo.H - 8}
              textAnchor={l.anchor}
              fontSize="9"
              fontFamily="var(--font-dm-mono, monospace)"
              style={{ fill: 'var(--ink-3)' }}
              data-testid="portfolio-value-x-label"
            >
              {l.label}
            </text>
          ))}

          {/* Vlak onder de marktwaarde-lijn */}
          <path
            d={geo.paths.area}
            fill={`url(#${gradientId})`}
            style={{
              opacity: hasEntered ? 1 : 0,
              transition: hasEntered ? 'opacity 250ms ease-out 455ms' : 'none',
            }}
          />

          {/* Inleg — dunner en gedempt; het referentieniveau, niet de kop */}
          <path
            d={geo.paths.cost}
            fill="none"
            strokeWidth={1.25}
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            style={{ stroke: 'var(--ink-3)', opacity: 0.55, ...lineStyle(80) }}
            data-testid="portfolio-value-cost-line"
          />

          {/* Marktwaarde — vol, module-accent */}
          <path
            d={geo.paths.market}
            fill="none"
            stroke={marketColor}
            strokeWidth={2.25}
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            style={lineStyle(0)}
            data-testid="portfolio-value-market-line"
          />

          {/* Hover-geleider + markers */}
          {hovered && hoveredIdx !== null && (
            <g aria-hidden>
              <line
                x1={geo.x(hoveredIdx)}
                y1={geo.PAD.top}
                x2={geo.x(hoveredIdx)}
                y2={geo.PAD.top + geo.chartH}
                strokeDasharray="3 3"
                style={{ stroke: 'var(--rule-soft)' }}
              />
              <circle
                cx={geo.x(hoveredIdx)}
                cy={geo.y(hovered.costBasis)}
                r={3}
                fill="var(--paper)"
                strokeWidth={1.25}
                style={{ stroke: 'var(--ink-3)' }}
              />
              <circle
                cx={geo.x(hoveredIdx)}
                cy={geo.y(hovered.marketValue)}
                r={4}
                fill="var(--paper)"
                stroke={marketColor}
                strokeWidth={2}
              />
            </g>
          )}

          {/* Onzichtbare trefvlakken per meetpunt */}
          {points.map((p, i) => (
            <rect
              key={p.date}
              x={geo.x(i) - geo.sliceW / 2}
              y={geo.PAD.top}
              width={geo.sliceW}
              height={geo.chartH}
              fill="transparent"
              onMouseEnter={animationComplete ? () => setHoveredIdx(i) : undefined}
              data-testid={`portfolio-value-hit-${i}`}
            />
          ))}
        </svg>

        {/* Tooltip — HTML i.p.v. SVG-tekst zodat DM Mono + tabular-nums gelden */}
        {hovered && hoveredIdx !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-2 shadow-[var(--s2)]"
            style={{
              left: `${(geo.x(hoveredIdx) / geo.W) * 100}%`,
              transform: geo.x(hoveredIdx) > geo.W * 0.62 ? 'translateX(-100%)' : 'translateX(0)',
            }}
            data-testid="portfolio-value-tooltip"
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
              {formatDateShort(hovered.date)}
            </p>
            <dl className="mt-1 space-y-0.5">
              <TooltipRow label="Marktwaarde" value={fc(hovered.marketValue)} />
              <TooltipRow label="Inleg" value={fc(hovered.costBasis)} />
              <TooltipRow
                label="Verschil"
                value={`${hovered.marketValue - hovered.costBasis >= 0 ? '+' : ''}${fc(hovered.marketValue - hovered.costBasis)}`}
                valueClass={hovered.marketValue - hovered.costBasis >= 0 ? 'text-positive' : 'text-negative'}
              />
            </dl>
          </div>
        )}
      </div>

      {/* Legenda met de stand van vandaag */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <LegendItem
          swatch={<span className="inline-block h-[3px] w-5" style={{ background: marketColor }} />}
          label="Marktwaarde"
          value={fc(last.marketValue)}
        />
        <LegendItem
          swatch={<span className="inline-block h-px w-5" style={{ background: 'var(--ink-3)', opacity: 0.55 }} />}
          label="Inleg"
          value={fc(last.costBasis)}
        />
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
            Verschil
          </span>
          <span
            className={`font-mono text-[12px] font-semibold tabular-nums ${diff >= 0 ? 'text-positive' : 'text-negative'}`}
            data-testid="portfolio-value-diff"
          >
            {diff >= 0 ? '+' : ''}
            {fc(diff)}
          </span>
        </div>
      </div>

      {/* Eerlijke grondslag — welk deel van de waarde op echte koersen rust */}
      {showBasisNote && (
        <p
          className="mt-3 border-t border-dotted border-[var(--rule-soft)] pt-2.5 font-serif text-[12px] italic leading-relaxed text-[var(--ink-3)]"
          data-testid="portfolio-value-basis-note"
        >
          {pricedPct}% van de waarde is gewaardeerd op opgehaalde slotkoersen; de
          rest op de laatst bekende prijs van die positie.
          {holdingsWithoutMarketPriceCount > 0 && totalHoldings > 0 && (
            <>
              {' '}
              {holdingsWithoutMarketPriceCount} van de {totalHoldings}{' '}
              {holdingsWithoutMarketPriceCount === 1 ? 'posities heeft' : 'posities hebben'} geen
              koershistorie.
            </>
          )}
        </p>
      )}

      {/* Uitgang bij de constatering. Een melding dat de koershistorie ontbreekt
          zonder manier om 'm op te halen is een doodlopende mededeling; dit is
          de expliciete gebruikersactie die ADR 0098 voorschrijft (bewust geen
          automatisme in een loader of effect — het zijn tientallen externe
          verzoeken per gebruiker). */}
      {showBasisNote && holdingsWithoutMarketPriceCount > 0 && (
        <BackfillPricesButton onDone={onReload} />
      )}
    </ChartShell>
  )
}

// ── Kleine bouwstenen ────────────────────────────────────────────

function LegendItem({
  swatch,
  label,
  value,
}: {
  swatch: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span aria-hidden className="self-center">{swatch}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
        {label}
      </span>
      <span className="font-mono text-[12px] font-semibold tabular-nums text-[var(--ink)]">
        {value}
      </span>
    </div>
  )
}

function TooltipRow({
  label,
  value,
  valueClass = 'text-[var(--ink)]',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
        {label}
      </dt>
      <dd className={`ml-auto font-mono text-[11px] font-semibold tabular-nums ${valueClass}`}>
        {value}
      </dd>
    </div>
  )
}

// ── Weergave-helpers (puur presentatie, geen financiële logica) ──

/**
 * Compacte as-notatie in nl-locale: €1,2k / €3,4M. `decimals` wordt per as
 * één keer bepaald zodat alle ticks dezelfde precisie dragen.
 */
function compactEur(value: number, decimals = 1): string {
  const abs = Math.abs(value)
  const nl = (v: number) => v.toFixed(decimals).replace('.', ',')
  if (abs >= 1_000_000) return `€${nl(value / 1_000_000)}M`
  if (abs >= 1_000) return `€${nl(value / 1_000)}k`
  return `€${Math.round(value)}`
}

/** 'mrt 25' — UTC-parse zodat een tijdzone de maand niet laat verspringen. */
function monthLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

function diffWord(delta: number): string {
  if (delta > 0) return 'gestegen'
  if (delta < 0) return 'gedaald'
  return 'gelijk gebleven'
}

// ── Koershistorie ophalen ────────────────────────────────────────

/**
 * Haalt de ontbrekende koershistorie op via POST /api/holdings/backfill-history
 * en herlaadt daarna de curve.
 *
 * De route werkt in pagina's (`nextOffset`) omdat een backfill tientallen
 * externe verzoeken doet en niet binnen één functie-aanroep past. Die lus staat
 * hier, niet in de route: zo ziet de gebruiker de voortgang en kan hij 'm
 * afbreken door weg te navigeren, in plaats van te wachten op een verzoek dat
 * stil in een timeout loopt.
 */
function BackfillPricesButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const run = useCallback(async () => {
    setBusy(true)
    setResult(null)
    let offset: number | null = 0
    let filled = 0
    let unresolvable = 0
    try {
      // Bovengrens tegen een route die door een bug altijd een nextOffset geeft.
      for (let round = 0; round < 40 && offset !== null; round++) {
        const res: Response = await fetch('/api/holdings/backfill-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offset }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as {
          backfilled?: number
          skippedUnresolvable?: number
          nextOffset?: number | null
        }
        filled += Number(json.backfilled) || 0
        unresolvable += Number(json.skippedUnresolvable) || 0
        offset = typeof json.nextOffset === 'number' ? json.nextOffset : null
      }
      setResult(
        filled > 0
          ? `Koershistorie opgehaald voor ${filled} ${filled === 1 ? 'positie' : 'posities'}.`
          : unresolvable > 0
            ? 'Geen koershistorie beschikbaar: deze posities staan niet als beursfonds genoteerd.'
            : 'Geen nieuwe koershistorie gevonden.',
      )
      if (filled > 0) onDone()
    } catch {
      setResult('Ophalen is niet gelukt. Probeer het later opnieuw.')
    } finally {
      setBusy(false)
    }
  }, [onDone])

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex min-h-[36px] items-center border border-[var(--border-ed)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-2)] transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--module-active-500)]"
      >
        {busy ? 'Koershistorie ophalen…' : 'Koershistorie ophalen'}
      </button>
      {result && (
        <p className="mt-1.5 font-serif text-[12px] italic text-[var(--ink-3)]" role="status">
          {result}
        </p>
      )}
    </div>
  )
}

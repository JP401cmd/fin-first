'use client'

/**
 * Historische waardegrafiek van de effectenportefeuille — /core/assets/holdings.
 *
 * Twee weergaven van dezelfde reeks, met een schakelaar rechtsboven in de kaart:
 *  - **lijn**: één curve — de marktwaarde van alle open posities over de tijd
 *    (vol, kern-accent, met vlak eronder);
 *  - **balken**: per maandanker één gestapelde balk, één segment per positie,
 *    zodat zichtbaar wordt wélke posities die waarde droegen. Klik op een maand
 *    opent de kassabon met de posities erachter.
 *
 * De inleg-/kostbasis-lijn is hier bewust wég: `costBasis` telt alleen de
 * posities die je NU nog hebt, dus verkochte posities verdwijnen mét hun
 * resultaat uit die reeks — het getal (en dus het "verschil" eronder) was
 * daarmee onwaar zodra er ooit iets verkocht is. Het veld blijft in het
 * datacontract staan (de motor levert het en de per-holding-route gebruikt het),
 * het wordt alleen niet meer getekend.
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
 * memo()-wrapper) — de repo heeft bewust geen chart-library. De balk-geometrie en
 * -interactie volgen `components/app/horizon/wealth-composition-chart.tsx`.
 * Styling volgt de editorial design-taal (scherpe hoeken, ink-tokens, DM Mono
 * voor bedragen).
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { BarChart3, LineChart } from 'lucide-react'
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
import {
  PortfolioMonthDetailsSheet,
  type PortfolioValueHoldingSlice,
  type PortfolioValueRest,
} from './portfolio-month-details-sheet'

// ── Contract van de databron ─────────────────────────────────────

export type { PortfolioValueHoldingSlice, PortfolioValueRest }

export type PortfolioValueHistoryPoint = {
  /** 'YYYY-MM-01' (1e van de maand); het laatste punt is vandaag. */
  date: string
  /** Marktwaarde van alle open posities op die datum, EUR. */
  marketValue: number
  /**
   * Inleg (kostbasis) van diezelfde posities, EUR. Blijft in het contract —
   * de motor levert het en de per-holding-route gebruikt het — maar wordt in
   * deze grafiek NIET meer getekend (zie de kop van dit bestand).
   */
  costBasis: number
  openPositions: number
  /** 0..1 — aandeel van marketValue dat op een ECHTE slotkoers rust. */
  pricedFromMarket: number
  /**
   * Marktwaarde per positie op de peildatum, aflopend, top-12. Bewust optioneel
   * getypeerd: een gecachete respons van vóór deze uitbreiding levert het veld
   * niet, en dan valt de balkweergave netjes terug op de lijn in plaats van te
   * crashen op `undefined.map`.
   */
  byHolding?: PortfolioValueHoldingSlice[]
  /** De staart buiten de top-12 — zelfde reden voor het optionele type. */
  rest?: PortfolioValueRest | null
}

export type PortfolioValueHistoryResponse = {
  points: PortfolioValueHistoryPoint[]
  averagePricedFromMarket: number
  holdingsWithoutMarketPriceCount: number
  totalHoldings: number
}

export type PortfolioValueChartProps = {
  /**
   * Aantal maanden historie dat de route moet leveren. Default 12; `null`
   * betekent "hele historie" — dan gaat de `months`-param niet mee en levert de
   * route de volledige reeks.
   */
  months?: number | null
  /**
   * Jaarlijkse essentiële uitgaven uit de must-budgets (loader-veld
   * `yearlyEssentialExpenses`, zelfde bron als `PortfolioSummary`). 0 of
   * ontbrekend verbergt de vrijheidstijd-regel — liever geen duiding dan een
   * verzonnen dagtarief.
   */
  yearlyEssentialExpenses?: number
  className?: string
}

/** Weergave-keuze; gepersisteerd in localStorage. */
type ChartMode = 'line' | 'bars'

const MODE_STORAGE_KEY = 'holdings-value-chart-mode'

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

/** Volledige animatiesequentie: 700ms opbouw + 80ms uitloop op de laatste kolom. */
const ANIM_DURATION = 780

/**
 * Aantal posities dat een eigen kleur krijgt in de balkweergave.
 *
 * Twaalf, om twee redenen die samenvallen: (1) het precedent van dit
 * kleurrecept (`lib/load-category-history.ts`) noemt 3-12 entiteiten als
 * werkbereik — daarboven wordt een kleurenfamilie een kleurenbrij; (2) de route
 * levert per maandpunt sowieso een top-12 (`byHolding`) plus een `rest`-bucket,
 * dus twaalf eigen kleuren dekt precies wat één balk maximaal aan benoemde
 * segmenten kan tonen. Alles daarbuiten krijgt `REST_COLOR`.
 */
const NAMED_COLOR_SLOTS = 12

/**
 * Hue-stap per positie: één omwenteling verdeeld over de twaalf gekleurde
 * slots (30°). De laatste gekleurde positie (index 11) landt daarmee op 330° —
 * de cirkel wordt precies gevuld en loopt nooit terug op index 0, waar de oude
 * vaste stap van 12° bij index 30 exact de accentkleur reproduceerde. 30° is
 * bovendien ruim genoeg om twee naast elkaar gestapelde segmenten uit elkaar te
 * houden; 12° was dat op het randje al niet.
 */
const HUE_STEP_DEG = 360 / NAMED_COLOR_SLOTS

/** De staart: posities buiten de top-12 én de `rest`-bucket, één neutrale tint. */
const REST_COLOR = 'var(--ink-4)'

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
  /** Er loopt een échte netwerkronde (cache-hits zetten dit nooit). */
  const [fetching, setFetching] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Venster-cache: één respons per `months`-waarde, aan de mount-levensduur van
  // dít component. Langs de periode-rail klikken (1M→3M→6M→1J→YTD→Alles) is
  // anders zes volle rondes over dezelfde onderliggende data — het venster
  // bepaalt alleen wélke maanden de route uitrekent, de query's lezen sowieso de
  // complete transactie- en koershistorie, en bij "Alles" is de payload ~1400
  // verrijkte regels. Bewust géén globale/module-cache: die zou over accounts en
  // sessies heen leven en een eigen TTL-/invalidatie-verhaal nodig hebben.
  const cacheRef = useRef<Map<number | null, PortfolioValueHistoryResponse>>(new Map())

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
    const key = months ?? null

    const cached = cacheRef.current.get(key)
    if (cached) {
      // Teruggeklikt naar een venster dat we al hebben: geen verzoek, geen
      // laadstand — de reeks stond er al.
      setData(cached)
      setFailed(false)
      setLoading(false)
      setFetching(false)
      return () => {
        cancelled = true
      }
    }

    setFetching(true)
    setFailed(false)

    async function load() {
      try {
        // `months === null` = hele historie: de queryparam gaat dan wég, zodat
        // de route zelf bepaalt hoe ver de reeks terugloopt. Een `months=0` of
        // `months=null` in de URL zou daar een lege of foute reeks van maken.
        const url =
          months == null
            ? '/api/holdings/value-history'
            : `/api/holdings/value-history?months=${months}`
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as PortfolioValueHistoryResponse
        if (cancelled) return
        cacheRef.current.set(key, json)
        setData(json)
        setFailed(false)
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === 'AbortError')) return
        // Stil degraderen: de grafiek is duiding, geen kritiek pad. Geen rode
        // banner die de holdings-pagina domineert. Een mislukte ronde komt
        // bewust NIET in de cache — anders blijft de fout aan dat venster kleven.
        setFailed(true)
      } finally {
        if (!cancelled) {
          setLoading(false)
          setFetching(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [months, attempt])

  const retry = useCallback(() => {
    // De hele cache leeg, niet alleen het huidige venster: `retry` heeft twee
    // aanroepers — de foutstaat en de zojuist afgeronde koers-backfill — en in
    // beide gevallen is élk gecachet venster verdacht, want de onderliggende
    // koershistorie is veranderd. Een venster dat we ongemoeid laten zou daarna
    // de oude reeks blijven tonen.
    cacheRef.current.clear()
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
    // Twee wezenlijk verschillende oorzaken, en ze mogen niet dezelfde tekst
    // krijgen. De reeks is op maandgrenzen geankerd, dus een KORT venster kan op
    // zichzelf al te weinig punten opleveren — op de 1e van de maand levert "1M"
    // precies één anker. Iemand met zes jaar historie te vertellen dat hij "nog
    // geen transactiehistorie" heeft en hem naar het importscherm te sturen is
    // dan pertinent onjuist. `months == null` (Alles) is het enige venster dat
    // niets kan afsnijden; alleen dáár is de historie zelf de verklaring.
    const vensterTeSmal = months != null
    return (
      <ChartShell className={className} testId="portfolio-value-chart-empty">
        <p className="mt-3 font-serif text-[13px] italic leading-relaxed text-[var(--ink-2)]">
          {vensterTeSmal
            ? 'Deze periode bevat te weinig maandpunten om een verloop van te tekenen. Kies een langere periode.'
            : 'Er is nog geen transactiehistorie om een verloop van te tekenen. Zodra je transacties over meerdere maanden lopen, zie je hier wat je portefeuille waard was.'}
        </p>
        {!vensterTeSmal && (
          <Link
            href="/core/assets/holdings/import"
            className="mt-3 inline-flex min-h-[36px] items-center border border-[var(--ink)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--module-active-500)]"
          >
            Importeer je transacties
          </Link>
        )}
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
      // Nieuwe periode onderweg terwijl er nog een oudere reeks staat: die reeks
      // blijft zichtbaar maar gedimd + `aria-busy`, zodat hij niet stilletjes
      // doorgaat voor het antwoord op de zojuist gekozen periode.
      busy={fetching}
    />
  )
})

// ── Gedeelde kaart-omhulling (kop is in elke staat gelijk) ───────

function ChartShell({
  children,
  className = '',
  testId,
  headerRight,
  busy = false,
}: {
  children: React.ReactNode
  className?: string
  testId: string
  /** Optionele controls rechtsboven in de kaart-kop (de weergave-schakelaar). */
  headerRight?: React.ReactNode
  /** Er wordt een nieuwe periode opgehaald terwijl deze kaart al gevuld is. */
  busy?: boolean
}) {
  return (
    <section
      className={`border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6 ${className}`}
      data-testid={testId}
      aria-busy={busy || undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
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
            Wat je portefeuille{' '}
            <em className="font-normal italic text-[var(--module-active-700)]">waard</em> was
          </h2>
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>
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
  busy = false,
  className = '',
}: {
  points: PortfolioValueHistoryPoint[]
  averagePricedFromMarket: number
  holdingsWithoutMarketPriceCount: number
  totalHoldings: number
  yearlyEssentialExpenses: number
  /** Herlaadt de reeks nadat de koershistorie is opgehaald. */
  onReload: () => void
  /** Nieuwe periode onderweg: dim de getoonde reeks en meld het aan AT. */
  busy?: boolean
  className?: string
}) {
  const { masked } = useMaskedAmounts()
  const fc = useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
  const { ref, hasEntered, animationComplete } = useInViewAnimation({ duration: ANIM_DURATION })
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [detailsIdx, setDetailsIdx] = useState<number | null>(null)

  // ── Roving tabindex over de maandkolommen ──────────────────────
  //
  // De grafiek is ÉÉN tab-stop: alleen de actieve kolom draagt `tabIndex={0}`,
  // de rest `-1`. Pijltjestoetsen verplaatsen de selectie, Home/End springen
  // naar begin/eind, Enter/Space opent de kassabon. Zonder dit moest iemand bij
  // "Alles" 121 keer Tab drukken om langs de grafiek te komen — 121 tab-stops
  // van ~5px breed, met een hover-fill als enige (onvoldoende) focus-affordance.
  //
  // Startpositie is de LAATSTE maand: dat is "vandaag", het punt waar de
  // legenda, de vrijheidsregel en het verhaal van de kaart op eindigen. Home
  // brengt je in één toets naar het begin van de reeks.
  const [activeIdx, setActiveIdx] = useState(points.length - 1)
  const [focusVisible, setFocusVisible] = useState(false)
  const hitRefs = useRef<(SVGRectElement | null)[]>([])
  const activeCol = Math.min(Math.max(activeIdx, 0), points.length - 1)

  // Andere periode gekozen → de reeks is een andere: leg de selectie weer op de
  // meest recente maand in plaats van op een index die daar niets meer betekent.
  useEffect(() => {
    setActiveIdx(points.length - 1)
  }, [points.length])

  const moveActive = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, 0), points.length - 1)
      setActiveIdx(clamped)
      setHoveredIdx(clamped)
      // Directe focus-verplaatsing (geen rAF): álle kolommen staan al in de DOM,
      // alleen hun tabIndex verschilt — en programmatisch focussen werkt ook op
      // een element met tabIndex -1. Zo hoort een schermlezer de nieuwe maand.
      hitRefs.current[clamped]?.focus?.()
    },
    [points.length],
  )

  // Weergave-keuze — zelfde lazy-initializer als `holdings-view-mode` in
  // `holdings-client.tsx`: lezen bij eerste render, schrijven bij elke wissel.
  const [mode, setMode] = useState<ChartMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(MODE_STORAGE_KEY) as ChartMode) || 'line'
    }
    return 'line'
  })
  const changeMode = useCallback((next: ChartMode) => {
    setMode(next)
    setHoveredIdx(null)
    if (typeof window !== 'undefined') {
      localStorage.setItem(MODE_STORAGE_KEY, next)
    }
  }, [])

  // Module-identiteit: holdings valt onder Overzicht/De Kern, dus de
  // marktwaarde-lijn en de balk-segmenten volgen het door de gebruiker gekozen
  // kern-accent.
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

  // Draagt de reeks een verdeling per positie? Een oudere/gecachete respons doet
  // dat niet — dan blijft de balkweergave onbereikbaar in plaats van leeg.
  const hasBreakdown = useMemo(
    () => points.some(p => Array.isArray(p.byHolding) && p.byHolding.length > 0),
    [points],
  )
  const effectiveMode: ChartMode = mode === 'bars' && hasBreakdown ? 'bars' : 'line'
  const breakdownMissing = mode === 'bars' && !hasBreakdown

  // Alle geometrie in één memo — schaal, paden, ticks en labels hangen van
  // dezelfde inputs af (punten + gemeten breedte).
  const geo = useMemo(() => {
    const { W, H, PAD, chartW, chartH, maxXLabels } = layoutFor(containerW)

    const values = points.map(p => p.marketValue)
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const span = rawMax - rawMin || Math.max(Math.abs(rawMax) * 0.1, 1)
    const minVal = Math.max(0, rawMin - span * 0.12)
    const maxVal = rawMax + span * 0.12
    const range = maxVal - minVal || 1
    const x = (i: number) => PAD.left + (i / Math.max(1, points.length - 1)) * chartW
    const y = (v: number) => PAD.top + chartH - ((v - minVal) / range) * chartH

    const market = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.marketValue).toFixed(1)}`)
      .join(' ')
    const baseline = y(minVal).toFixed(1)
    const paths = {
      market,
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
    const idxs = thinnedIndexes(points.length, maxXLabels)
    const lastIdx = points.length - 1
    if (idxs[idxs.length - 1] === lastIdx) {
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

  // ── Balk-geometrie ─────────────────────────────────────────────
  //
  // Eén band per maandanker; de gestapelde segmenten dragen hun eigen waarde uit
  // `byHolding` (+ `rest`). De as-top neemt het maximum van het maandtotaal en
  // de gestapelde som, zodat een stapel nooit boven de as uitsteekt wanneer die
  // twee door afronding een cent uiteenlopen.
  const barGeo = useMemo(() => {
    const { W, H, PAD, chartW, chartH, maxXLabels } = layoutFor(containerW)
    const n = Math.max(1, points.length)
    const bandW = chartW / n
    const barW = Math.max(3, Math.min(bandW * 0.62, 34))

    const stackTotals = points.map(p => {
      const seg =
        (p.byHolding ?? []).reduce((s, x) => s + Math.max(0, x.value), 0) +
        Math.max(0, p.rest?.value ?? 0)
      return Math.max(seg, p.marketValue, 0)
    })
    const rawMax = Math.max(...stackTotals, 1)
    const maxVal = rawMax * 1.08

    const cx = (i: number) => PAD.left + bandW * (i + 0.5)
    const y = (v: number) => PAD.top + chartH - (v / maxVal) * chartH
    const baseY = PAD.top + chartH

    const steps = 4
    const tickStep = maxVal / steps
    const decimals = tickStep >= 5_000 ? 0 : 1
    const yTicks = Array.from({ length: steps + 1 }, (_, i) => {
      const val = tickStep * i
      return { y: y(val), label: compactEur(val, decimals) }
    })

    const xLabels = thinnedIndexes(points.length, maxXLabels).map(i => ({
      i,
      x: cx(i),
      label: monthLabel(points[i].date),
    }))

    return { W, H, PAD, chartW, chartH, bandW, barW, cx, y, baseY, maxVal, yTicks, xLabels }
  }, [points, containerW])

  // Stabiele kleur per positie over álle maanden heen. Zou de kleur per maand uit
  // de rangorde binnen díé maand komen, dan wisselt een positie van kleur zodra
  // ze een plaats stijgt of daalt — precies wat een stapelgrafiek onleesbaar
  // maakt. Ordening op de grootste waarde die de positie ooit had.
  //
  // Alleen de `NAMED_COLOR_SLOTS` grootste posities krijgen een eigen kleur; de
  // staart daarachter valt op `var(--ink-4)`, dezelfde behandeling als de
  // `rest`-bucket. Reden: de grafiek bouwt `holdingOrder` over de UNIE van álle
  // maandpunten, en met 121 punten × top-12 per punt lopen dat er makkelijk
  // 30-60 (het referentie-account heeft 109 posities). Bij een vaste stap zou de
  // hue-cirkel rondlopen en zou positie 31 exact de kleur van positie 1 krijgen —
  // twee identieke segmenten in dezelfde balk, precies wat stabiele kleuren
  // moesten voorkomen.
  const holdingOrder = useMemo(() => {
    const maxById = new Map<string, number>()
    for (const p of points) {
      for (const s of p.byHolding ?? []) {
        maxById.set(s.id, Math.max(maxById.get(s.id) ?? 0, s.value))
      }
    }
    const ordered = [...maxById.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
    const index = new Map<string, number>()
    const color = new Map<string, string>()
    ordered.forEach((id, i) => {
      index.set(id, i)
      color.set(
        id,
        i >= NAMED_COLOR_SLOTS
          ? REST_COLOR
          : i === 0
            ? marketColor
            : rotateHueHex(marketColor, HUE_STEP_DEG * i),
      )
    })
    return { index, color }
  }, [points, marketColor])

  /** Segmenten van één maand, in de globale (kleur-)volgorde gestapeld. */
  const stackFor = useCallback(
    (p: PortfolioValueHistoryPoint) => {
      const slices = (p.byHolding ?? [])
        .filter(s => s.value > 0)
        .slice()
        .sort(
          (a, b) =>
            (holdingOrder.index.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (holdingOrder.index.get(b.id) ?? Number.MAX_SAFE_INTEGER),
        )
      let cum = barGeo.baseY
      const segs = slices.map(s => {
        const h = (s.value / barGeo.maxVal) * barGeo.chartH
        cum -= h
        return {
          key: s.id,
          y: cum,
          h,
          color: holdingOrder.color.get(s.id) ?? marketColor,
        }
      })
      const restValue = Math.max(0, p.rest?.value ?? 0)
      if (restValue > 0) {
        const h = (restValue / barGeo.maxVal) * barGeo.chartH
        cum -= h
        segs.push({ key: '__rest__', y: cum, h, color: REST_COLOR })
      }
      return segs
    },
    [barGeo, holdingOrder, marketColor],
  )

  // Tap-handling voor de maand-klik. Op mobiel zijn `onClick`-events op
  // SVG-rects onbetrouwbaar; we triggeren primair via `onPointerUp` met een
  // motion-check (pan-vs-tap) en dedupliceren binnen 250ms tegen de
  // muis-synthese van `onClick`. Zelfde recept als de wealth-composition-chart.
  const tapStartRef = useRef<{ x: number; y: number; idx: number; pointerId: number } | null>(null)
  const lastTapRef = useRef<{ idx: number; ts: number } | null>(null)
  const triggerMonthTap = useCallback((idx: number) => {
    const now = Date.now()
    if (lastTapRef.current && lastTapRef.current.idx === idx && now - lastTapRef.current.ts < 250) {
      return
    }
    lastTapRef.current = { idx, ts: now }
    setHoveredIdx(null)
    // De roving tab-stop volgt de laatste interactie: wie op een maand klikt en
    // daarna het toetsenbord pakt, gaat verder waar hij was.
    setActiveIdx(idx)
    setDetailsIdx(idx)
  }, [])

  const first = points[0]
  const last = points[points.length - 1]

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
    effectiveMode === 'bars'
      ? `Marktwaarde van je portefeuille per maand, ${formatDateShort(first.date)} tot ${formatDateShort(last.date)}, ` +
        `gestapeld per positie. Marktwaarde ${trendWord} van ${fc(first.marketValue)} naar ${fc(last.marketValue)}. ` +
        `Kies een maand met de pijltjestoetsen, Home en End voor begin en eind, Enter voor de posities van die maand.`
      : `Waardeverloop van je portefeuille, ${formatDateShort(first.date)} tot ${formatDateShort(last.date)}. ` +
        `Marktwaarde ${trendWord} van ${fc(first.marketValue)} naar ${fc(last.marketValue)}.`

  const lineStyle = (delayMs: number) => ({
    strokeDashoffset: hasEntered ? 0 : 1,
    transition: hasEntered
      ? `stroke-dashoffset 700ms cubic-bezier(.22,1,.36,1) ${delayMs}ms`
      : 'none',
  })

  const hovered = hoveredIdx !== null ? points[hoveredIdx] : null
  const hoveredX =
    hoveredIdx === null ? 0 : effectiveMode === 'bars' ? barGeo.cx(hoveredIdx) : geo.x(hoveredIdx)
  const detailsPoint = detailsIdx !== null ? points[detailsIdx] : null

  const toggle = (
    <div
      className="flex items-center justify-end gap-1"
      role="group"
      aria-label="Weergave van het waardeverloop"
      data-testid="portfolio-value-chart-toggle"
    >
      <button
        type="button"
        onClick={() => changeMode('line')}
        aria-pressed={mode === 'line'}
        className={`min-h-[28px] inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-[0.12em] border transition-colors ${
          mode === 'line'
            ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
            : 'bg-transparent text-[var(--ink-3)] border-[var(--rule-soft)] hover:text-[var(--ink-2)] hover:border-[var(--ink-3)]'
        }`}
        data-testid="value-chart-toggle-line"
      >
        <LineChart className="h-3 w-3" aria-hidden />
        Lijn
      </button>
      <button
        type="button"
        onClick={() => changeMode('bars')}
        aria-pressed={mode === 'bars'}
        className={`min-h-[28px] inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-[0.12em] border transition-colors ${
          mode === 'bars'
            ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
            : 'bg-transparent text-[var(--ink-3)] border-[var(--rule-soft)] hover:text-[var(--ink-2)] hover:border-[var(--ink-3)]'
        }`}
        data-testid="value-chart-toggle-bars"
      >
        <BarChart3 className="h-3 w-3" aria-hidden />
        Balken
      </button>
    </div>
  )

  return (
    <ChartShell
      className={className}
      testId="portfolio-value-chart"
      headerRight={toggle}
      busy={busy}
    >
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

      {/* Balkweergave gevraagd, maar de reeks draagt geen verdeling per positie.
          Eerlijk melden en terugvallen op de lijn — niet stilletjes een lege
          grafiek tonen. */}
      {breakdownMissing && (
        <p
          className="mt-3 border-l-2 border-[var(--rule-soft)] pl-3 font-serif text-[12px] italic leading-relaxed text-[var(--ink-3)]"
          role="status"
          data-testid="portfolio-value-bars-unavailable"
        >
          De verdeling per positie zit nog niet in deze reeks. Ververs de pagina;
          tot die tijd zie je het verloop als lijn.
        </p>
      )}

      {/* Nieuwe periode onderweg: de reeks die er staat is die van het vórige
          venster. Hij blijft leesbaar maar gedimd (en de kaart draagt
          `aria-busy`) i.p.v. stil door te gaan voor het nieuwe antwoord. */}
      {busy && (
        <p className="sr-only" role="status">
          Nieuwe periode wordt geladen.
        </p>
      )}

      {/* Grafiek — de ref van `useInViewAnimation` zit op de grafiek-wrapper:
          de lijn/balken tekenen zich zodra de grafiek zelf in beeld komt. */}
      <div
        ref={ref}
        className="relative mt-4"
        style={{
          opacity: busy ? 0.45 : 1,
          transition: 'opacity 180ms ease-out',
        }}
        data-testid="portfolio-value-chart-plot"
      >
        <svg
          viewBox={
            effectiveMode === 'bars'
              ? `0 0 ${barGeo.W} ${barGeo.H}`
              : `0 0 ${geo.W} ${geo.H}`
          }
          className="w-full"
          style={{ maxWidth: '100%' }}
          // In balkweergave zitten er focusbare kolommen ín de grafiek. Een
          // `role="img"` maakt de subtree presentational — dan kondigt de
          // schermlezer de gefocuste maand niet meer aan. Daarom daar `group`;
          // de lijnweergave heeft geen interactieve kinderen en blijft `img`.
          role={effectiveMode === 'bars' ? 'group' : 'img'}
          aria-label={ariaLabel}
          onMouseLeave={animationComplete ? () => setHoveredIdx(null) : undefined}
          data-testid="portfolio-value-chart-svg"
        >
          {effectiveMode === 'line' ? (
            <>
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

              {/* Hover-geleider + marker */}
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
            </>
          ) : (
            <>
              {/* Rasterlijnen + Y-as */}
              {barGeo.yTicks.map((tick, i) => (
                <g key={i}>
                  <line
                    x1={barGeo.PAD.left}
                    y1={tick.y}
                    x2={barGeo.W - barGeo.PAD.right}
                    y2={tick.y}
                    strokeDasharray="2 3"
                    style={{ stroke: 'var(--rule-soft)' }}
                  />
                  <text
                    x={barGeo.PAD.left - 8}
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

              {/* X-as */}
              {barGeo.xLabels.map(l => (
                <text
                  key={l.i}
                  x={l.x}
                  y={barGeo.H - 8}
                  textAnchor="middle"
                  fontSize="9"
                  fontFamily="var(--font-dm-mono, monospace)"
                  style={{ fill: 'var(--ink-3)' }}
                  data-testid="portfolio-value-x-label"
                >
                  {l.label}
                </text>
              ))}

              {/* Gestapelde balken — één segment per positie, plus de staart */}
              {points.map((p, i) => {
                const segs = stackFor(p)
                const isHovered = hoveredIdx === i
                const x = barGeo.cx(i) - barGeo.barW / 2
                const progress = hasEntered ? 1 : 0
                const label = monthLabel(p.date)
                const count = (p.byHolding ?? []).length + (p.rest?.count ?? 0)
                return (
                  <g
                    key={p.date}
                    opacity={hasEntered ? 1 : 0}
                    style={{
                      transition: hasEntered
                        ? `opacity 0.4s ease ${Math.min(i * 0.02, 0.3)}s`
                        : 'none',
                    }}
                  >
                    {segs.map(seg => (
                      <rect
                        key={seg.key}
                        x={x}
                        y={barGeo.baseY - (barGeo.baseY - seg.y) * progress}
                        width={barGeo.barW}
                        height={seg.h * progress}
                        fill={seg.color}
                        opacity={isHovered ? 1 : 0.85}
                        style={{
                          transition:
                            'opacity 150ms ease, y 0.6s cubic-bezier(.22,1,.36,1), height 0.6s cubic-bezier(.22,1,.36,1)',
                        }}
                        data-testid={`portfolio-value-bar-segment-${i}`}
                      />
                    ))}

                    {/* Eén transparante kolom-hitrect over de volle hoogte: de
                        gebruiker hoeft niet precies op een segment te mikken.
                        Toetsenbord: roving tabindex — alléén de actieve kolom is
                        tabbaar, pijltjes/Home/End verplaatsen, Enter/Space opent.
                        Op touch via pointerUp met pan-check. Bedragen blijven uit
                        het aria-label zodra masking aanstaat — anders omzeilt de
                        screenreader-tekst precies wat de masking verbergt. */}
                    <rect
                      ref={el => {
                        hitRefs.current[i] = el
                      }}
                      x={barGeo.cx(i) - barGeo.bandW / 2}
                      y={barGeo.PAD.top}
                      width={Math.max(barGeo.bandW, 4)}
                      height={barGeo.chartH}
                      fill={isHovered ? 'var(--module-active-100)' : 'transparent'}
                      fillOpacity={isHovered ? 0.35 : 1}
                      tabIndex={i === activeCol ? 0 : -1}
                      role="button"
                      aria-label={
                        masked
                          ? `Bekijk de posities van ${label}`
                          : `Bekijk de posities van ${label} — ${fc(p.marketValue)}, ${count === 1 ? '1 positie' : `${count} posities`}`
                      }
                      onMouseEnter={animationComplete ? () => setHoveredIdx(i) : undefined}
                      onFocus={() => {
                        setHoveredIdx(i)
                        setActiveIdx(i)
                        setFocusVisible(true)
                      }}
                      onBlur={() => {
                        setHoveredIdx(null)
                        setFocusVisible(false)
                      }}
                      onPointerDown={e => {
                        e.stopPropagation()
                        tapStartRef.current = {
                          x: e.clientX,
                          y: e.clientY,
                          idx: i,
                          pointerId: e.pointerId,
                        }
                      }}
                      onPointerUp={e => {
                        const start = tapStartRef.current
                        tapStartRef.current = null
                        if (!start || start.pointerId !== e.pointerId) return
                        const dx = e.clientX - start.x
                        const dy = e.clientY - start.y
                        if (Math.hypot(dx, dy) > 10) return // pan, geen tap
                        if (e.pointerType === 'touch' || e.pointerType === 'pen') {
                          e.stopPropagation()
                          triggerMonthTap(i)
                        }
                      }}
                      onPointerLeave={() => setHoveredIdx(null)}
                      onPointerCancel={() => {
                        tapStartRef.current = null
                      }}
                      onClick={() => triggerMonthTap(i)}
                      onKeyDown={e => {
                        switch (e.key) {
                          case 'ArrowRight':
                          case 'ArrowDown':
                            e.preventDefault()
                            moveActive(i + 1)
                            break
                          case 'ArrowLeft':
                          case 'ArrowUp':
                            e.preventDefault()
                            moveActive(i - 1)
                            break
                          case 'Home':
                            e.preventDefault()
                            moveActive(0)
                            break
                          case 'End':
                            e.preventDefault()
                            moveActive(points.length - 1)
                            break
                          case 'Enter':
                          case ' ':
                            e.preventDefault()
                            triggerMonthTap(i)
                            break
                          default:
                            break
                        }
                      }}
                      style={{
                        cursor: 'pointer',
                        // Bewust geen browser-outline: die rendert op SVG-vormen
                        // onbetrouwbaar (en volgt de vorm soms niet). De ring
                        // hieronder is de echte focus-affordance.
                        outline: 'none',
                        touchAction: 'manipulation',
                        transition: 'fill 150ms ease, fill-opacity 150ms ease',
                      }}
                      data-testid={`portfolio-value-bar-hit-${i}`}
                    />

                    {/* Zichtbare focusring om de gefocuste kolom (WCAG 2.4.7).
                        Dubbele stroke: een lichte buitenrand op `--paper` zodat
                        de ink-lijn óók leesbaar blijft waar hij over een
                        gekleurd segment loopt. */}
                    {focusVisible && i === activeCol && (
                      <g aria-hidden pointerEvents="none">
                        <rect
                          x={barGeo.cx(i) - barGeo.bandW / 2}
                          y={barGeo.PAD.top}
                          width={Math.max(barGeo.bandW, 4)}
                          height={barGeo.chartH}
                          fill="none"
                          stroke="var(--paper)"
                          strokeWidth={4}
                        />
                        <rect
                          x={barGeo.cx(i) - barGeo.bandW / 2}
                          y={barGeo.PAD.top}
                          width={Math.max(barGeo.bandW, 4)}
                          height={barGeo.chartH}
                          fill="none"
                          stroke="var(--ink)"
                          strokeWidth={2}
                          data-testid={`portfolio-value-bar-focus-${i}`}
                        />
                      </g>
                    )}
                  </g>
                )
              })}
            </>
          )}
        </svg>

        {/* Tooltip — HTML i.p.v. SVG-tekst zodat DM Mono + tabular-nums gelden */}
        {hovered && hoveredIdx !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-2 shadow-[var(--s2)]"
            style={{
              left: `${(hoveredX / (effectiveMode === 'bars' ? barGeo.W : geo.W)) * 100}%`,
              transform:
                hoveredX > (effectiveMode === 'bars' ? barGeo.W : geo.W) * 0.62
                  ? 'translateX(-100%)'
                  : 'translateX(0)',
            }}
            data-testid="portfolio-value-tooltip"
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
              {formatDateShort(hovered.date)}
            </p>
            <dl className="mt-1 space-y-0.5">
              <TooltipRow label="Marktwaarde" value={fc(hovered.marketValue)} />
            </dl>
            {effectiveMode === 'bars' && (
              <p className="mt-1 font-serif text-[10px] italic text-[var(--ink-3)]">
                Klik voor de posities
              </p>
            )}
          </div>
        )}
      </div>

      {/* Stand van vandaag */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <LegendItem
          swatch={
            effectiveMode === 'bars' ? (
              <span className="inline-block h-2.5 w-2.5" style={{ background: marketColor }} />
            ) : (
              <span className="inline-block h-[3px] w-5" style={{ background: marketColor }} />
            )
          }
          label="Marktwaarde"
          value={fc(last.marketValue)}
        />
      </div>

      {effectiveMode === 'bars' && (
        <p className="mt-2 font-serif text-[12px] italic leading-relaxed text-[var(--ink-3)]">
          Elke balk is één maand, elk segment één positie. Kies een maand om te
          zien wie die waarde droeg.
        </p>
      )}

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

      {/* Kassabon achter één maand — opent vanaf een klik/tap op een balk. */}
      <PortfolioMonthDetailsSheet
        open={detailsPoint !== null}
        onClose={() => setDetailsIdx(null)}
        details={
          detailsPoint
            ? {
                date: detailsPoint.date,
                marketValue: detailsPoint.marketValue,
                byHolding: detailsPoint.byHolding ?? [],
                rest: detailsPoint.rest ?? null,
              }
            : null
        }
        dailyExpenses={dailyExpenses}
      />
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

/** Indices van de te labelen punten: gelijkmatig gedund, laatste altijd mee. */
function thinnedIndexes(count: number, maxLabels: number): number[] {
  const step = Math.max(1, Math.ceil(count / maxLabels))
  const idxs: number[] = []
  for (let i = 0; i < count; i += step) idxs.push(i)
  const lastIdx = count - 1
  if (idxs[idxs.length - 1] !== lastIdx) idxs.push(lastIdx)
  return idxs
}

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

// ── Kleur-familie per positie ────────────────────────────────────
//
// Zelfde recept als `lib/load-category-history.ts` (12° hue-rotatie per stap
// vanaf het module-accent): 3-12 segmenten krijgen zo een herkenbare familie in
// plaats van willekeurige kleuren. De HSL-helpers staan hier inline omdat de
// tegenhanger in die loader module-privé is en dit bestand geen loader-import
// hoort te doen voor puur presentatie-werk.

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  return [
    parseInt(v.slice(0, 2), 16) || 0,
    parseInt(v.slice(2, 4), 16) || 0,
    parseInt(v.slice(4, 6), 16) || 0,
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break
      case gn: h = (bn - rn) / d + 2; break
      default: h = (rn - gn) / d + 4
    }
    h *= 60
  }
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = ((((h % 360) + 360) % 360) / 360)
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hue2rgb = (t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [hue2rgb(hh + 1 / 3) * 255, hue2rgb(hh) * 255, hue2rgb(hh - 1 / 3) * 255]
}

function rotateHueHex(hex: string, deg: number): string {
  const [r, g, b] = hexToRgb(hex)
  const [h, s, l] = rgbToHsl(r, g, b)
  const [r2, g2, b2] = hslToRgb(h + deg, s, l)
  return rgbToHex(r2, g2, b2)
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

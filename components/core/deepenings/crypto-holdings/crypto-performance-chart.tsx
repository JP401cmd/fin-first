'use client'

// crypto-performance-chart.tsx — lijngrafiek van de portefeuillewaarde over
// de afgelopen N dagen. Mirror van de benchmark-chart op de investment-app:
//   - SVG-pad met `pathLength={1}` + draw-in animatie via `useInViewAnimation`
//   - Y-as auto-schaalt op min/max van de reeks (geen 0-baseline — zou bij
//     2% schommelingen alle detail platdrukken)
//   - X-as: drie labels (start / midden / eind) in krant-datum-stijl
//   - Tooltip-vrij: krant-toon, geen hover-overlays. Wel een onderschrift
//     met start- en eindwaarde + percentage-delta
//
// Lege state: als `points.length < 2` renderen we een lichte placeholder die
// uitlegt dat de koers-historie nog opbouwt. Geen "0" lijn — die verleidt
// tot foute conclusies.
//
// R8c — benchmark-overlay:
//   Optioneel kan een 2e lijn worden getoond met de gerebaseerde BTC of ETH
//   prestatie over hetzelfde venster. De gebruiker kiest via een 3-knops
//   toggle (Geen | BTC | ETH); rebasing volgt de formule
//
//        benchmarkValue[t] = portfolioValue[0] * (price[t] / price[0])
//
//   zodat beide lijnen op dezelfde Y-startwaarde beginnen en de relatieve
//   prestatie visueel vergelijkbaar wordt. De benchmark-lijn is gestippeld
//   en gerenderd in `var(--ink-4)` zodat hij subtiel onderscheidend blijft
//   van de groene/rode portfolio-lijn.

import { useMemo, useState } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type {
  CryptoPortfolioPoint,
  CryptoPortfolioPeriodReturn,
  CryptoReturnPeriod,
} from '@/lib/crypto-holdings-data'

interface CryptoPerformanceChartProps {
  points: CryptoPortfolioPoint[]
  /** Periode-keuze synchroon met de KPI-strip toggle. */
  period?: CryptoReturnPeriod
  /**
   * Periode-rendement uit dezelfde bron als de KPI-strip. Wanneer aanwezig
   * gebruikt de chart-header deze delta in plaats van een eigen berekening
   * over de getekende lijn — zo blijven KPI en chart-onderschrift consistent.
   */
  periodReturn?: CryptoPortfolioPeriodReturn
  /** Benchmark-prijshistorie (BTC) over hetzelfde maximale venster als `points`. */
  benchmarkBtc?: { date: string; close: number }[]
  /** Benchmark-prijshistorie (ETH) — idem. */
  benchmarkEth?: { date: string; close: number }[]
}

type BenchmarkChoice = 'none' | 'btc' | 'eth'

const PERIOD_DAYS: Record<CryptoReturnPeriod, number | null> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
  '1y': 365,
  all: null,
}

const PERIOD_HEADER: Record<CryptoReturnPeriod, string> = {
  '24h': '24 uur',
  '7d': '7 dagen',
  '30d': '30 dagen',
  '1y': '1 jaar',
  all: 'sinds start',
}

const BENCHMARK_OPTIONS: { key: BenchmarkChoice; label: string; ariaLabel: string }[] = [
  { key: 'none', label: 'Geen', ariaLabel: 'Geen benchmark' },
  { key: 'btc', label: 'BTC', ariaLabel: 'Bitcoin als benchmark' },
  { key: 'eth', label: 'ETH', ariaLabel: 'Ethereum als benchmark' },
]

export function CryptoPerformanceChart({
  points,
  period = '30d',
  periodReturn,
  benchmarkBtc,
  benchmarkEth,
}: CryptoPerformanceChartProps) {
  const { masked } = useMaskedAmounts()
  const fc = (v: number) => formatMaskedCurrency(v, masked)
  // Benchmark-keuze leeft hier in component-state — dit is een lokale view-
  // setting (geen URL-state) zodat de gebruiker tussen periodes kan switchen
  // zonder de overlay te verliezen. Default is "Geen": de portfolio-lijn
  // staat altijd voorop.
  const [benchmark, setBenchmark] = useState<BenchmarkChoice>('none')

  // Slice de reeks op basis van de gekozen periode. Bij "All" geven we de
  // volledige reeks terug. Bij een specifieke periode pakken we de laatste N
  // dagen — caller laadt typisch een 1-jaars venster zodat de toggle zonder
  // round-trip werkt.
  const sliced = useMemo(() => {
    const days = PERIOD_DAYS[period]
    if (days == null) return points
    if (points.length === 0) return points
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffIso = cutoff.toISOString().slice(0, 10)
    const filtered = points.filter((p) => p.date >= cutoffIso)
    // Als de filter niets oplevert (bv. 24u zonder snapshot vandaag), pak de
    // laatste 2 punten zodat we nog íets kunnen tekenen.
    if (filtered.length < 2 && points.length >= 2) {
      return points.slice(-2)
    }
    return filtered
  }, [points, period])

  const stats = useMemo(() => {
    if (sliced.length < 2) return null
    const first = sliced[0]
    const last = sliced[sliced.length - 1]
    let min = Infinity
    let max = -Infinity
    for (const p of sliced) {
      if (p.valueEur < min) min = p.valueEur
      if (p.valueEur > max) max = p.valueEur
    }
    const deltaEur = last.valueEur - first.valueEur
    const deltaPct =
      first.valueEur > 0 ? (deltaEur / first.valueEur) * 100 : null
    return { first, last, min, max, deltaEur, deltaPct }
  }, [sliced])

  // ── Benchmark-rebasing ─────────────────────────────────────────────────
  // We selecteren eerst de juiste bron-array, beperken die tot het zichtbare
  // periode-venster, en rebasen vervolgens op de portfolio-startwaarde zodat
  // de twee lijnen op dezelfde Y-positie starten. Wanneer de bron leeg is of
  // korter dan 2 punten retourneren we `null` en blijft de toggle zichtbaar
  // (we tonen dan onder de chart een korte error-tekst).
  const benchmarkSource = useMemo(() => {
    if (benchmark === 'btc') return benchmarkBtc ?? []
    if (benchmark === 'eth') return benchmarkEth ?? []
    return []
  }, [benchmark, benchmarkBtc, benchmarkEth])

  const benchmarkAvailable = useMemo(() => {
    return {
      btc: (benchmarkBtc?.length ?? 0) >= 2,
      eth: (benchmarkEth?.length ?? 0) >= 2,
    }
  }, [benchmarkBtc, benchmarkEth])

  const benchmarkRebased = useMemo(() => {
    if (benchmark === 'none' || !stats) return null
    if (benchmarkSource.length < 2) return null
    // Beperk de benchmark-reeks tot dezelfde datum-range als de portfolio-
    // slice. We gebruiken de eerste portfolio-datum als referentie en zoeken
    // de laatst-bekende benchmark-prijs op-of-vóór die datum (forward-fill).
    const startIso = sliced[0].date
    const endIso = sliced[sliced.length - 1].date

    // Vind referentie-prijs (dichtstbijzijnde ≤ startIso). Als er geen
    // benchmark-data is vóór de start (startWindow korter dan 1 jaar), pakken
    // we het eerste beschikbare punt — beter een iets latere vergelijking
    // dan helemaal geen lijn.
    let refPrice: number | null = null
    for (let i = benchmarkSource.length - 1; i >= 0; i--) {
      if (benchmarkSource[i].date <= startIso) {
        refPrice = benchmarkSource[i].close
        break
      }
    }
    if (refPrice == null) refPrice = benchmarkSource[0].close
    if (refPrice == null || refPrice <= 0) return null

    const startValue = stats.first.valueEur
    if (startValue <= 0) return null

    // Filter benchmark op het venster en rebasing toepassen.
    const windowed = benchmarkSource.filter(
      (p) => p.date >= startIso && p.date <= endIso,
    )
    // Begin altijd met een referentie-punt op de exacte start-datum zodat
    // beide lijnen visueel samenvallen op de Y-as bij t=0.
    const points: { date: string; value: number }[] = [
      { date: startIso, value: startValue },
    ]
    for (const p of windowed) {
      // Skip eerste rij als hij op exact dezelfde datum als startIso valt —
      // anders dubbele entry.
      if (p.date === startIso && points.length === 1) continue
      points.push({ date: p.date, value: startValue * (p.close / refPrice) })
    }
    if (points.length < 2) return null
    return points
  }, [benchmark, benchmarkSource, sliced, stats])

  // Y-as moet beide lijnen kunnen bevatten — herbereken min/max over portfolio
  // én benchmark wanneer een overlay actief is. Zo wordt de portfolio-lijn
  // niet uitgerekt of platgedrukt door een uitschietende benchmark.
  const yRange = useMemo(() => {
    if (!stats) return null
    let min = stats.min
    let max = stats.max
    if (benchmarkRebased) {
      for (const p of benchmarkRebased) {
        if (p.value < min) min = p.value
        if (p.value > max) max = p.value
      }
    }
    return { min, max }
  }, [stats, benchmarkRebased])

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          Waarde-evolutie · {PERIOD_HEADER[period]}
        </p>
        {(() => {
          // Voor de header-delta heeft de KPI-bron voorrang boven de eigen
          // berekening over de getekende lijn. Dat houdt het cijfer hier
          // identiek aan de KPI-strip "Rendement · 30D" — beide gebruiken
          // dan dezelfde referentieprijs (laatst-bekende close ≤ refdatum)
          // én huidige live-prijs als eindwaarde. Zonder bron vallen we
          // terug op de chart-eigen lijn-delta.
          const deltaPct =
            periodReturn?.changePct != null ? periodReturn.changePct : stats?.deltaPct ?? null
          const deltaEur =
            periodReturn?.changePct != null ? periodReturn.changeEur : stats?.deltaEur ?? null
          if (deltaPct == null || deltaEur == null) return null
          return (
            <p
              className={`font-mono text-[12px] tabular-nums ${
                deltaPct >= 0 ? 'text-positive' : 'text-negative'
              }`}
            >
              {deltaPct >= 0 ? '+' : ''}
              {deltaPct.toFixed(1)}%
              <span className="ml-1 text-[var(--ink-4)]">
                ({deltaEur >= 0 ? '+' : ''}{fc(deltaEur)})
              </span>
            </p>
          )
        })()}
      </div>

      {/* Benchmark-toggle — alleen tonen wanneer er een chart is om over te
          leggen. Bij placeholder-state heeft de toggle geen functie. */}
      {stats && (
        <BenchmarkToggle
          value={benchmark}
          onChange={setBenchmark}
          available={benchmarkAvailable}
        />
      )}

      {!stats || !yRange ? (
        <PerformancePlaceholder />
      ) : (
        <>
          {(() => {
            // Lijnkleur volgt dezelfde delta-bron als de header zodat een
            // KPI-positief rendement nooit met een rode lijn wordt gepaard.
            const deltaPositive =
              periodReturn?.changeEur != null
                ? periodReturn.changeEur >= 0
                : stats.deltaEur >= 0
            return (
              <PerformanceLine
                key={`${period}-${benchmark}`}
                points={sliced}
                min={yRange.min}
                max={yRange.max}
                deltaPositive={deltaPositive}
                benchmarkPoints={benchmarkRebased}
              />
            )
          })()}
          {/* Legend onder de chart — alleen wanneer er een 2e lijn ligt. */}
          {benchmarkRebased && (
            <p className="flex items-center gap-3 text-[10px] uppercase tracking-[0.06em] text-[var(--ink-4)]">
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-[2px] w-3"
                  style={{
                    backgroundColor:
                      (periodReturn?.changeEur ?? stats.deltaEur) >= 0
                        ? 'oklch(0.50 0.09 162)'
                        : 'oklch(0.50 0.09 25)',
                  }}
                />
                Portfolio
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-[2px] w-3 border-t border-dashed border-[var(--ink-4)]"
                />
                {benchmark === 'btc' ? 'BTC' : 'ETH'} benchmark
              </span>
            </p>
          )}
          {/* Foutmelding wanneer overlay gevraagd is maar data ontbreekt of te
              kort is. Houd het feitelijk en niet-alarmerend — de chart blijft
              functioneel zonder de tweede lijn. */}
          {benchmark !== 'none' && !benchmarkRebased && (
            <p
              className="text-[11px] italic text-[var(--ink-4)]"
              role="status"
              aria-live="polite"
            >
              {benchmark === 'btc' ? 'BTC' : 'ETH'}-data is niet beschikbaar voor deze periode.
            </p>
          )}
        </>
      )}
    </section>
  )
}

// ── Benchmark toggle ─────────────────────────────────────────────────────

interface BenchmarkToggleProps {
  value: BenchmarkChoice
  onChange: (next: BenchmarkChoice) => void
  available: { btc: boolean; eth: boolean }
}

/**
 * 3-knops segmented control in krant-stijl, identiek aan de period-toggle uit
 * de KPI-strip. Knoppen zonder data worden gedisabled met `aria-disabled` +
 * tooltip — de toggle blijft daarmee zichtbaar (CLAUDE.md fallback-regel:
 * geen stilzwijgend verbergen).
 */
function BenchmarkToggle({ value, onChange, available }: BenchmarkToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Benchmark-overlay"
      className="inline-flex items-center border border-[var(--border-ed)] bg-[var(--paper)]"
    >
      <span className="px-2 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
        Vergelijk
      </span>
      {BENCHMARK_OPTIONS.map((opt) => {
        const isAvailable =
          opt.key === 'none' ||
          (opt.key === 'btc' && available.btc) ||
          (opt.key === 'eth' && available.eth)
        const isActive = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={opt.ariaLabel}
            aria-disabled={!isAvailable}
            disabled={!isAvailable}
            title={
              !isAvailable
                ? 'Benchmark-data is op dit moment niet beschikbaar.'
                : undefined
            }
            onClick={() => isAvailable && onChange(opt.key)}
            className={`flex h-7 min-w-[40px] items-center justify-center border-l border-[var(--border-ed)] px-2 text-[11px] font-medium uppercase tracking-[0.08em] transition-colors ${
              isActive
                ? 'bg-[var(--subtle)] text-[var(--ink)]'
                : 'text-[var(--ink-3)] hover:bg-[var(--subtle)]/40 hover:text-[var(--ink-2)]'
            } ${
              !isAvailable
                ? 'cursor-not-allowed text-[var(--ink-4)] hover:bg-transparent hover:text-[var(--ink-4)]'
                : ''
            } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Performance line ─────────────────────────────────────────────────────

interface PerformanceLineProps {
  points: CryptoPortfolioPoint[]
  min: number
  max: number
  deltaPositive: boolean
  /** Optionele 2e lijn (gerebaseerde benchmark) op dezelfde Y-as. */
  benchmarkPoints: { date: string; value: number }[] | null
}

function PerformanceLine({
  points,
  min,
  max,
  deltaPositive,
  benchmarkPoints,
}: PerformanceLineProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 900 })
  const width = 600
  const height = 140
  const padX = 8
  const padY = 12

  // Ondergrens beschermen: min == max betekent een vlakke lijn — geef
  // een arbitraire bandbreedte zodat de lijn op het midden ligt.
  const range = max - min
  const safeRange = range < 1 ? 1 : range

  const xStep = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0
  const path = points
    .map((p, i) => {
      const x = padX + i * xStep
      const y = padY + ((max - p.valueEur) / safeRange) * (height - padY * 2)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')

  // Benchmark-pad — gebruikt dezelfde X-schaal als het portfolio-pad zodat
  // de twee lijnen op dezelfde tijd-as liggen. We verdelen de benchmark-
  // punten gelijkmatig over de chart-breedte (geen tijds-precieze X-mapping
  // — voor visuele vergelijking is dat ruim genoeg en blijft de code simpel).
  const benchmarkPath =
    benchmarkPoints && benchmarkPoints.length >= 2
      ? benchmarkPoints
          .map((p, i, arr) => {
            const x = padX + (i / (arr.length - 1)) * (width - padX * 2)
            const y = padY + ((max - p.value) / safeRange) * (height - padY * 2)
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
          })
          .join(' ')
      : null

  // Eerste / laatste / midden datum-labels in krant-stijl.
  const firstLabel = formatShortDate(points[0].date)
  const lastLabel = formatShortDate(points[points.length - 1].date)
  const midLabel = formatShortDate(points[Math.floor(points.length / 2)].date)

  const stroke = deltaPositive
    ? 'oklch(0.50 0.09 162)' // var(--positive)
    : 'oklch(0.50 0.09 25)' // var(--negative)

  return (
    <div ref={ref} className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Lijngrafiek waarde over tijd"
        className="h-[140px] w-full"
      >
        {/* Subtiele baseline op het minimum */}
        <line
          x1={padX}
          x2={width - padX}
          y1={height - padY}
          y2={height - padY}
          stroke="var(--border-ed)"
          strokeWidth="1"
        />
        {/* Benchmark-lijn eerst — zo ligt de portfolio-lijn er bovenop. We
            tekenen hem gestippeld in `var(--ink-4)` om duidelijk te maken dat
            het de referentie is, niet de hoofdmaat. */}
        {benchmarkPath && (
          <path
            d={benchmarkPath}
            fill="none"
            stroke="var(--ink-4)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 3"
            pathLength={1}
            strokeDashoffset={hasEntered ? 0 : 1}
            style={{
              // 60ms vertraging zodat hij netjes ná de portfolio-lijn intekent
              // en niet visueel concurreert tijdens de animatie.
              transition: hasEntered
                ? 'stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1) 60ms'
                : 'none',
              opacity: 0.85,
            }}
          />
        )}
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={hasEntered ? 0 : 1}
          style={{
            transition: hasEntered
              ? 'stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)'
              : 'none',
          }}
        />
      </svg>
      <div className="flex justify-between text-[10px] uppercase tracking-[0.06em] text-[var(--ink-4)]">
        <span>{firstLabel}</span>
        <span>{midLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  )
}

function PerformancePlaceholder() {
  return (
    <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-4 py-6 text-center">
      <p className="font-serif italic text-sm text-[var(--ink-2)]">
        Koers-historie bouwt nog op. Zodra er meerdere dagen aan snapshots
        beschikbaar zijn verschijnt hier de waarde-evolutie.
      </p>
    </div>
  )
}

function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

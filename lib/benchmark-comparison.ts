/**
 * Benchmark comparison for portfolio performance.
 *
 * Vergelijkt het portfoliorendement met gangbare indices (AEX, MSCI World,
 * S&P 500) over één gekozen venster.
 *
 * TWEE REGELS DIE DEZE MODULE DRAGEN (bugkaart testbug-ffa902):
 *
 * 1. **Eén venster voor alles.** De periodekeuze bepaalt de startdatum via
 *    `resolvePeriodStart()` — diezelfde functie gebruikt de API-route om de
 *    Yahoo-reeks op te halen én de vergelijkingsmotor om te knippen. Vóór de
 *    fix startte de benchmarkreeks bij de eerste aankoop ooit, waardoor een
 *    "1J"-selectie een ~3-jaars indexrendement toonde en de alpha een
 *    3-jaars-getal van een 1-jaars-getal aftrok.
 *
 * 2. **Rendement is koersbeweging, nooit inleg.** `computeTwrSeries()` ketent
 *    maand-op-maand-rendementen en rekent de kasstroom van die maand uit de
 *    noemer. Storten verandert het rendement daardoor per definitie niet.
 *    Ontbreekt de koersobservatie voor een maand (geen valuation-rij), dan is
 *    het rendement niet meetbaar en geeft de motor `null` terug — de UI toont
 *    dan géén getal, in plaats van de groei van de inleg als "rendement".
 */

import { localMonthEnd, localMonthStart } from './month-range'
import { roundCents } from '@/lib/format'

// ── Types ────────────────────────────────────────────────────

export type BenchmarkId = 'aex' | 'msci_world' | 'sp500'

export interface BenchmarkInfo {
  id: BenchmarkId
  name: string
  description: string
  color: string
  /** Annual average return (%) used for projection when no real data */
  avgAnnualReturn: number
}

export interface TimePeriod {
  id: string
  label: string
  months: number
  /**
   * Venster-omschrijving in lopende tekst ("over 1 jaar", "dit jaar").
   * Hoort bij de periodedefinitie zelf zodat elk oppervlak hetzelfde venster
   * benoemt — een percentage zonder venster is niet te lezen.
   */
  windowLabel: string
  /** If true, use year-to-date calculation */
  isYtd?: boolean
}

export interface BenchmarkDataPoint {
  date: string // YYYY-MM-DD
  value: number // normalized to 100 at start
}

export interface PortfolioDataPoint {
  date: string
  value: number // normalized to 100 at start
}

/** Waarom het portfoliorendement niet getoond kan worden. */
export type PortfolioReturnGap = 'no_price_history'

export interface ComparisonResult {
  period: TimePeriod
  /**
   * De daadwerkelijk gehanteerde vensterstart (YYYY-MM-DD). Portfolio én
   * benchmarks zijn op deze datum geknipt; de X-as loopt dus nooit buiten het
   * venster dat de gebruiker koos.
   */
  windowStart: string
  /**
   * True wanneer er te weinig snapshots in de gekozen periode zaten en op de
   * volledige beschikbare historie is teruggevallen. De UI benoemt dat — het
   * periodelabel alleen zou een venster suggereren dat niet is gebruikt.
   */
  windowFallback: boolean
  portfolio: {
    /** `null` = niet meetbaar (zie `gap`); toon dan géén getal. */
    returnPct: number | null
    /** Alleen gezet wanneer `returnPct === null`. */
    gap?: PortfolioReturnGap
    /** Rendementsindex (basis 100), zonder kasstroomeffect. Leeg bij `gap`. */
    dataPoints: PortfolioDataPoint[]
  }
  benchmarks: {
    id: BenchmarkId
    name: string
    color: string
    returnPct: number
    dataPoints: BenchmarkDataPoint[]
    /** portfolio return − benchmark return; `null` als het portfolio geen meetbaar rendement heeft. */
    alpha: number | null
    /** Whether data comes from real Yahoo Finance data or synthetic random walk */
    dataSource?: 'yahoo_finance' | 'synthetic'
  }[]
}

// ── Constants ────────────────────────────────────────────────

export const BENCHMARKS: BenchmarkInfo[] = [
  {
    id: 'aex',
    name: 'AEX',
    description: 'Amsterdam Exchange Index — top 25 Nederlandse aandelen',
    color: '#3b82f6', // blue
    avgAnnualReturn: 8.5,
  },
  {
    id: 'msci_world',
    name: 'MSCI World',
    description: 'Wereldwijde aandelenindex — 23 ontwikkelde markten',
    color: '#8b5cf6', // violet
    avgAnnualReturn: 9.5,
  },
  {
    id: 'sp500',
    name: 'S&P 500',
    description: 'Standard & Poor\'s 500 — top 500 Amerikaanse bedrijven',
    color: '#10b981', // emerald
    avgAnnualReturn: 10.5,
  },
]

/** Yahoo Finance ticker symbols for each benchmark */
export const BENCHMARK_TICKERS: Record<BenchmarkId, string> = {
  aex: '^AEX',
  msci_world: 'IWDA.AS',
  sp500: '^GSPC',
}

export const TIME_PERIODS: TimePeriod[] = [
  { id: '1m', label: '1M', months: 1, windowLabel: 'over 1 maand' },
  { id: '3m', label: '3M', months: 3, windowLabel: 'over 3 maanden' },
  { id: '6m', label: '6M', months: 6, windowLabel: 'over 6 maanden' },
  { id: '1y', label: '1J', months: 12, windowLabel: 'over 1 jaar' },
  { id: 'ytd', label: 'YTD', months: 0, isYtd: true, windowLabel: 'dit jaar' },
  { id: 'all', label: 'Alles', months: 0, windowLabel: 'over de volledige historie' },
]

// ── Venster (één bron voor route én motor) ───────────────────

/**
 * Lokale YYYY-MM-DD van een Date. Bewust NIET `toISOString()`: in NL (UTC+)
 * rekent die terug naar de vorige dag, waardoor een venstergrens een dag
 * verschuift t.o.v. de snapshot-datums (die uit `localMonthEnd` komen).
 */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Startdatum van het gekozen venster. SINGLE SOURCE: de API-route gebruikt
 * hem om de benchmarkreeks op te halen, `compareToBenchmarks` om portfolio én
 * benchmarks te knippen. Zolang beide dezelfde functie aanroepen kan het
 * venster van de grafiek niet meer uit de pas lopen met de periodekeuze.
 */
export function resolvePeriodStart(
  period: TimePeriod,
  earliestSnapshotDate: string | null,
  now: Date = new Date(),
): Date {
  if (period.isYtd) return new Date(now.getFullYear(), 0, 1)

  if (period.id === 'all') {
    if (earliestSnapshotDate) return new Date(earliestSnapshotDate)
    // Geen historie bekend: begrens de fetch alsnog op 12 maanden i.p.v. een
    // open venster richting Yahoo.
    const fallback = new Date(now)
    fallback.setMonth(fallback.getMonth() - 12)
    return fallback
  }

  const start = new Date(now)
  start.setMonth(start.getMonth() - period.months)
  return start
}

/**
 * Knip een benchmarkreeks op het venster en normaliseer opnieuw naar 100.
 * De opgehaalde reeks is genormaliseerd op zijn eigen eerste punt; zonder
 * hernormalisatie zou het eerste punt van het venster niet op 100 starten en
 * is het rendement van dat venster niet af te lezen.
 */
export function clipBenchmarkSeries(
  points: BenchmarkDataPoint[] | null | undefined,
  windowStart: string,
): BenchmarkDataPoint[] {
  if (!points || points.length === 0) return []
  const inWindow = points.filter(p => p.date >= windowStart)
  if (inWindow.length < 2) return []
  const base = inWindow[0].value
  if (base <= 0) return []
  return inWindow.map(p => ({
    date: p.date,
    value: Math.round((p.value / base) * 10000) / 100,
  }))
}

// ── Real benchmark data from Yahoo Finance ───────────────────

/** Cache for real benchmark data (1 hour TTL) */
const benchmarkCache = new Map<string, { data: BenchmarkDataPoint[]; expiresAt: number }>()
const BENCHMARK_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const BENCHMARK_CACHE_MAX_ENTRIES = 50

/**
 * Yahoo-interval dat bij de venstergrootte past. Sinds het venster de
 * periodekeuze volgt, levert een vast maand-interval bij "1M"/"3M" maar één of
 * twee punten op — te weinig om een rendement uit af te lezen (en te weinig om
 * de fallback naar synthetische data te vermijden).
 */
export function benchmarkInterval(startDate: Date, endDate: Date): '1d' | '1wk' | '1mo' {
  const days = (endDate.getTime() - startDate.getTime()) / 86_400_000
  if (days <= 95) return '1d'
  if (days <= 400) return '1wk'
  return '1mo'
}

/**
 * Fetch real historical closing prices from Yahoo Finance for the window.
 * Returns data points normalized to 100 at the start of the period.
 * Returns null if the API is unavailable or data is insufficient.
 */
export async function fetchRealBenchmarkData(
  benchmarkId: BenchmarkId,
  startDate: Date,
  endDate: Date,
): Promise<BenchmarkDataPoint[] | null> {
  const ticker = BENCHMARK_TICKERS[benchmarkId]
  if (!ticker) return null

  const interval = benchmarkInterval(startDate, endDate)

  // Check cache — venster + interval horen in de sleutel: de reeks is sinds de
  // venster-fix periodegebonden, dus één sleutel per benchmark zou de reeks
  // van de ene periode aan de andere uitserveren.
  const cacheKey = `${benchmarkId}:${interval}:${toDateStr(startDate)}:${toDateStr(endDate)}`
  const cached = benchmarkCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data
  }

  try {
    // Yahoo Finance chart API — period1/period2 are Unix timestamps
    const period1 = Math.floor(startDate.getTime() / 1000)
    const period2 = Math.floor(endDate.getTime() / 1000)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&period1=${period1}&period2=${period2}`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TriFinity/1.0)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    })

    if (!res.ok) return null

    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null

    const timestamps: number[] = result.timestamp || []
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || []

    if (timestamps.length < 2 || closes.length < 2) return null

    // Build data points from real closing prices
    const rawPoints: { date: string; close: number }[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const close = closes[i]
      if (close === null || close === undefined || isNaN(close)) continue
      const d = new Date(timestamps[i] * 1000)
      const dateStr = d.toISOString().split('T')[0]
      rawPoints.push({ date: dateStr, close })
    }

    if (rawPoints.length < 2) return null

    // Normalize to base 100
    const baseValue = rawPoints[0].close
    if (baseValue <= 0) return null

    const points: BenchmarkDataPoint[] = rawPoints.map(p => ({
      date: p.date,
      value: Math.round((p.close / baseValue) * 10000) / 100,
    }))

    // Cache the result
    benchmarkCache.set(cacheKey, { data: points, expiresAt: Date.now() + BENCHMARK_CACHE_TTL_MS })

    // Evict expired entries, daarna hard afkappen op de bovengrens. Het aantal
    // sleutels is met het periodegebonden venster gegroeid (benchmark × periode
    // × dag); alleen verlopen entries opruimen liet de Map onbegrensd groeien
    // zolang alles binnen de TTL viel.
    if (benchmarkCache.size > BENCHMARK_CACHE_MAX_ENTRIES) {
      const now = Date.now()
      for (const [k, v] of Array.from(benchmarkCache.entries())) {
        if (now >= v.expiresAt) benchmarkCache.delete(k)
      }
      // Map bewaart invoegvolgorde → de oudste sleutels staan vooraan.
      for (const k of Array.from(benchmarkCache.keys())) {
        if (benchmarkCache.size <= BENCHMARK_CACHE_MAX_ENTRIES) break
        benchmarkCache.delete(k)
      }
    }

    return points
  } catch {
    // Network error, timeout, parse error — return null (caller uses synthetic fallback)
    return null
  }
}

/**
 * Fetch real benchmark data for all benchmarks in parallel.
 * Returns a map of benchmarkId → data points (null if unavailable).
 */
export async function fetchAllRealBenchmarkData(
  startDate: Date,
  endDate: Date,
): Promise<Map<BenchmarkId, BenchmarkDataPoint[] | null>> {
  const results = new Map<BenchmarkId, BenchmarkDataPoint[] | null>()

  // Fetch all benchmarks in parallel
  const promises = BENCHMARKS.map(async (bench) => {
    const data = await fetchRealBenchmarkData(bench.id, startDate, endDate)
    results.set(bench.id, data)
  })

  await Promise.all(promises)
  return results
}

// ── Synthetic benchmark data generation (fallback) ───────────
// Generate realistic benchmark data using a random walk seeded by the benchmark
// and date, so results are consistent across renders.

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function dateToSeed(dateStr: string, benchmarkIdx: number): number {
  const d = new Date(dateStr)
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate() + benchmarkIdx * 7919
}

/**
 * Generate synthetic benchmark data points for a given period.
 * Uses a deterministic random walk based on historical average returns,
 * with realistic monthly volatility.
 */
export function generateBenchmarkData(
  benchmark: BenchmarkInfo,
  startDate: Date,
  endDate: Date,
  benchmarkIdx: number,
): BenchmarkDataPoint[] {
  const points: BenchmarkDataPoint[] = []
  const monthlyReturn = benchmark.avgAnnualReturn / 100 / 12
  // Monthly volatility (standard deviation) ~ annualized vol / sqrt(12)
  // Typical equity annual vol is ~15-20%
  const monthlyVol = 0.045 // ~15.6% annualized

  let value = 100
  const current = new Date(startDate)

  while (current <= endDate) {
    // Lokale datumstring: `toISOString()` zou het eerste punt in NL een dag
    // vóór de vensterstart zetten en de X-as buiten de periode laten beginnen.
    const dateStr = toDateStr(current)
    points.push({ date: dateStr, value: Math.round(value * 100) / 100 })

    // Monthly step: expected return + random noise
    const seed = dateToSeed(dateStr, benchmarkIdx)
    const noise = (seededRandom(seed) - 0.5) * 2 * monthlyVol
    value = value * (1 + monthlyReturn + noise)

    // Move to next month
    current.setMonth(current.getMonth() + 1)
  }

  return points
}

// ── Portfolio valuation history ──────────────────────────────

export interface HoldingSnapshot {
  date: string
  totalValue: number
  totalCost: number
  /**
   * Netto externe kasstroom ín deze maand (aankopen − verkopen, in euro).
   * Nodig om rendement van inleg te scheiden: zonder dit veld leest een
   * storting als koerswinst.
   */
  netFlow: number
  /**
   * True wanneer élke bijdragende positie voor deze maand een echte
   * koersobservatie had — een `valuations`-rij voor die maand, of (in de
   * lopende maand) de actuele koers. False = gewaardeerd tegen een stand-in
   * koers; het rendement over een venster met zo'n maand is niet meetbaar.
   */
  pricedFromHistory: boolean
}

/**
 * Build portfolio value history from holdings and their transactions/valuations.
 * Returns monthly data points showing portfolio value over time.
 *
 * `now` is injecteerbaar zodat de reeks in tests deterministisch is.
 */
export function buildPortfolioHistory(
  holdings: Array<{
    id: string
    units: number
    avg_purchase_price: number
    current_price: number | null
    purchase_date: string | null
    created_at: string
  }>,
  valuations: Array<{
    entity_id: string
    entity_type: string
    value: number
    valuation_date: string
  }>,
  transactions: Array<{
    holding_id: string
    type: 'buy' | 'sell' | 'dividend'
    units: number
    price_per_unit: number
    date: string
  }>,
  now: Date = new Date(),
): HoldingSnapshot[] {
  if (holdings.length === 0) return []

  // Find the earliest date across all holdings
  const allDates = holdings.map(h => h.purchase_date || h.created_at).filter(Boolean)
  if (allDates.length === 0) return []

  const earliest = new Date(allDates.sort()[0])

  // Build month-by-month snapshots
  const snapshots: HoldingSnapshot[] = []
  const current = new Date(earliest.getFullYear(), earliest.getMonth(), 1)

  // Index valuations by entity_id → date → value
  const valMap: Record<string, Record<string, number>> = {}
  for (const v of valuations) {
    if (!valMap[v.entity_id]) valMap[v.entity_id] = {}
    const monthKey = v.valuation_date.substring(0, 7) // YYYY-MM
    valMap[v.entity_id][monthKey] = v.value
  }

  // Index transactions by holding_id → sorted by date
  const txMap: Record<string, typeof transactions> = {}
  for (const tx of transactions) {
    if (!txMap[tx.holding_id]) txMap[tx.holding_id] = []
    txMap[tx.holding_id].push(tx)
  }
  for (const key of Object.keys(txMap)) {
    txMap[key].sort((a, b) => a.date.localeCompare(b.date))
  }

  const nowMonthKey = localMonthStart(now).substring(0, 7)

  while (current <= now) {
    const monthStart = localMonthStart(current) // YYYY-MM-01 (tijdzone-veilig)
    const monthKey = monthStart.substring(0, 7) // YYYY-MM
    const monthEnd = localMonthEnd(current) // inclusieve laatste dag van de maand

    let totalValue = 0
    let totalCost = 0
    let netFlow = 0
    // Optimistisch: één positie zonder koersobservatie zet de hele maand op
    // "niet waarneembaar" — de portfoliowaarde is immers de som.
    let pricedFromHistory = true

    for (const holding of holdings) {
      const holdingStart = holding.purchase_date || holding.created_at
      if (holdingStart > monthEnd) continue // Holding didn't exist yet

      // Calculate units at this point by replaying transactions
      const holdingTxs = txMap[holding.id] || []
      let units = 0
      let costBasis = 0
      let monthFlow = 0
      let sawTxUpToMonth = false

      // Replay transactions up to this month
      for (const tx of holdingTxs) {
        if (tx.date > monthEnd) break
        sawTxUpToMonth = true
        const amount = tx.units * tx.price_per_unit
        const inThisMonth = tx.date >= monthStart
        if (tx.type === 'buy') {
          costBasis += amount
          units += tx.units
          if (inThisMonth) monthFlow += amount
        } else if (tx.type === 'sell') {
          // Gemiddelde-kostprijsmethode: verkoop schrijft hetzelfde aandeel van
          // de kostprijs af als van de stukken, geklemd op 100% bij oververkoop.
          const fraction = tx.units / Math.max(units, tx.units)
          costBasis -= costBasis * fraction
          units -= tx.units
          if (inThisMonth) monthFlow -= amount
        }
        // dividends don't affect units
      }

      if (!sawTxUpToMonth) {
        if (holdingTxs.length === 0) {
          // Geen transactieboek voor deze positie: de holdingrij zelf is de
          // enige bron, dus die geldt vanaf de aankoopdatum.
          units = holding.units
          costBasis = holding.units * holding.avg_purchase_price
        } else {
          // Er ís een transactieboek, maar het begint ná deze maand: de positie
          // bestond toen nog niet. Vóór de fix vulde `holding.units` (het aantal
          // van vandaag) die vroege maanden met stukken die er niet waren.
          continue
        }
      }

      netFlow += monthFlow

      if (units <= 0) continue

      // Koers voor deze maand — en of dat een échte observatie is.
      let price: number
      let priceObserved = false

      const valuation = valMap[holding.id]?.[monthKey]
      if (valuation != null && valuation > 0) {
        price = valuation / units // valuation is total value
        priceObserved = true
      } else if (monthKey === nowMonthKey && holding.current_price) {
        // Lopende maand tegen de actuele koers = wél een echte observatie.
        price = holding.current_price
        priceObserved = true
      } else {
        // Geen koers voor deze maand bekend. We waarderen tegen de laatst
        // bekende koers zodat de reeks niet gatenkaas wordt, maar markeren de
        // maand: hier is géén rendement uit af te leiden.
        price = holding.current_price ?? holding.avg_purchase_price
      }

      if (!priceObserved) pricedFromHistory = false

      totalValue += units * price
      totalCost += costBasis
    }

    if (totalValue > 0 || totalCost > 0) {
      snapshots.push({
        date: monthEnd,
        totalValue: roundCents(totalValue),
        totalCost: roundCents(totalCost),
        netFlow: roundCents(netFlow),
        pricedFromHistory,
      })
    }

    current.setMonth(current.getMonth() + 1)
  }

  return snapshots
}

// ── Time-weighted return calculation ─────────────────────────

export interface TwrSeries {
  /**
   * Rendementsindex, 100 bij de eerste snapshot. Volgt uitsluitend de
   * koersontwikkeling — een storting verplaatst de lijn niet.
   */
  indexPoints: PortfolioDataPoint[]
  /** Rendement over het hele venster in % (= laatste index − 100). */
  returnPct: number
}

/**
 * Echte tijdgewogen return: ketent de maandrendementen en haalt de kasstroom
 * van elke maand uit de noemer.
 *
 *   r_t = V_t / (V_{t−1} + F_t) − 1      TWR = Π(1 + r_t) − 1
 *
 * De kasstroom telt vól mee aan het begin van de maand. Dat is bewust: het
 * maakt de invariant hard dat een maand zónder koersbeweging exact 0% oplevert
 * (V_t = V_{t−1} + F_t). Een gewicht van een halve maand (Modified Dietz) zou
 * bij een vlakke koers alsnog een rendement laten zien — precies de fout die
 * deze kaart aanwijst. De prijs is dat de inleg-maand haar rendement iets
 * onderschat; met maandelijkse snapshots is dat de kleinste van de twee fouten.
 *
 * Geeft `null` wanneer het rendement niet meetbaar is: te weinig snapshots, een
 * maand zonder koersobservatie (`pricedFromHistory === false`), of een
 * deelperiode zonder positieve startbasis.
 */
export function computeTwrSeries(snapshots: HoldingSnapshot[]): TwrSeries | null {
  if (snapshots.length < 2) return null
  if (!snapshots.every(s => s.pricedFromHistory)) return null

  let index = 100
  const indexPoints: PortfolioDataPoint[] = [{ date: snapshots[0].date, value: 100 }]

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1]
    const cur = snapshots[i]
    const base = prev.totalValue + cur.netFlow
    if (base <= 0) return null
    index *= cur.totalValue / base
    indexPoints.push({ date: cur.date, value: Math.round(index * 100) / 100 })
  }

  return { indexPoints, returnPct: Math.round((index - 100) * 100) / 100 }
}

/**
 * Tijdgewogen rendement over het venster in %, of `null` als het niet meetbaar
 * is. Dunne wrapper om `computeTwrSeries` zodat het getal en de lijn in de
 * grafiek per definitie uit dezelfde berekening komen.
 */
export function calculateTimeWeightedReturn(
  snapshots: HoldingSnapshot[],
): number | null {
  return computeTwrSeries(snapshots)?.returnPct ?? null
}

// ── Comparison engine ────────────────────────────────────────

/**
 * Compare portfolio performance against benchmarks for a given time period.
 * If realBenchmarkData is provided, uses real market data; otherwise falls back to synthetic.
 *
 * Portfolio én benchmarks worden op hetzelfde venster geknipt — dat is de kern
 * van de fix: alleen dan zijn de percentages en de alpha onderling leesbaar en
 * loopt de X-as niet buiten de gekozen periode.
 */
export function compareToBenchmarks(
  portfolioSnapshots: HoldingSnapshot[],
  period: TimePeriod,
  realBenchmarkData?: Map<BenchmarkId, BenchmarkDataPoint[] | null>,
  now: Date = new Date(),
): ComparisonResult | null {
  if (portfolioSnapshots.length < 2) return null

  let windowStart = toDateStr(resolvePeriodStart(period, portfolioSnapshots[0].date, now))
  let filtered = portfolioSnapshots.filter(s => s.date >= windowStart)
  let windowFallback = false

  if (filtered.length < 2) {
    // Te weinig snapshots in het gekozen venster: val terug op de volledige
    // beschikbare historie — maar meld dat, zodat de UI niet het periodelabel
    // toont bij een venster dat niet is gebruikt.
    filtered = [...portfolioSnapshots]
    windowStart = filtered[0].date
    windowFallback = true
  }

  const windowStartDate = new Date(windowStart)
  const twr = computeTwrSeries(filtered)

  const benchmarks = BENCHMARKS.map((bench, idx) => {
    // Echte data heeft de voorkeur, maar alleen geknipt op hetzelfde venster.
    const clipped = clipBenchmarkSeries(realBenchmarkData?.get(bench.id), windowStart)
    const isReal = clipped.length >= 2
    const benchData = isReal
      ? clipped
      : generateBenchmarkData(bench, windowStartDate, now, idx)
    const benchReturn = benchData.length >= 2
      ? ((benchData[benchData.length - 1].value / benchData[0].value) - 1) * 100
      : 0
    const returnPct = Math.round(benchReturn * 100) / 100

    return {
      id: bench.id,
      name: bench.name,
      color: bench.color,
      returnPct,
      dataPoints: benchData,
      // Geen meetbaar portfoliorendement → geen alpha. Een alpha t.o.v. een
      // niet-bestaand getal is precies de onzin die deze kaart aanwijst.
      alpha: twr ? Math.round((twr.returnPct - returnPct) * 100) / 100 : null,
      dataSource: isReal ? 'yahoo_finance' as const : 'synthetic' as const,
    }
  })

  return {
    period,
    windowStart,
    windowFallback,
    portfolio: twr
      ? { returnPct: twr.returnPct, dataPoints: twr.indexPoints }
      : { returnPct: null, gap: 'no_price_history' as const, dataPoints: [] },
    benchmarks,
  }
}

/**
 * Get alpha description in Dutch.
 */
export function getAlphaDescription(alpha: number): {
  text: string
  color: string
  label: string
} {
  // Semantische kleuren (positief/negatief) — géén Tailwind-standaardkleuren:
  // die volgen de accentkeuze van de gebruiker niet en horen niet bij
  // stoplicht-/resultaatsemantiek (kleurconventie in CLAUDE.md).
  if (alpha > 0) {
    return {
      text: `Je portfolio presteert ${alpha.toFixed(1)}% beter dan de benchmark`,
      color: 'text-positive',
      label: 'Outperformance',
    }
  } else if (alpha < 0) {
    return {
      text: `Je portfolio presteert ${Math.abs(alpha).toFixed(1)}% slechter dan de benchmark`,
      color: 'text-negative',
      label: 'Underperformance',
    }
  }
  return {
    text: 'Je portfolio presteert gelijk aan de benchmark',
    color: 'text-[var(--ink-3)]',
    label: 'Gelijkwaardig',
  }
}

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
 *
 * 3. **Gemeten wordt alleen wat noteert.** Een echte portefeuille noteert maar
 *    deels: van 116 posities op productie hebben er 15 een koersbron, de rest
 *    draagt de brokeromschrijving van een turbo of een gedelistte naam (zie
 *    ADR 0098). De eerste versie van deze module eiste een koersobservatie voor
 *    élke positie en gaf anders `null`. Dat is precies één positie te streng:
 *    op het referentie-account blankte één onnoteerbare positie van €289 (1%
 *    van de waarde) het hele rendement. Sinds die bevinding meet de motor het
 *    **waarneembare deel** van de portefeuille — een echt, afgebakend mandje —
 *    en draagt hij de dekking (`observedShare`) mee in het contract, zodat de
 *    UI kan zeggen hóé hard het getal is. Een positie die het mandje in- of
 *    uitstapt telt als kasstroom, niet als rendement; daarmee blijft regel 2
 *    overeind. Waardeert de motor niets waarneembaars, dan blijft het `null`.
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

/**
 * Waarom het portfoliorendement niet getoond kan worden.
 *
 * - `no_price_history` — geen enkele positie had een koersbron in dit venster,
 *   of er is er maar één maand waarneembaar (één punt is geen rendement).
 * - `unmeasurable_window` — een opname overtrof de startwaarde van een maand
 *   (`base < 0`). Er is dan geen basis om tegen af te zetten; dat is een
 *   bewuste weigering, geen afronding naar 0%.
 */
export type PortfolioReturnGap = 'no_price_history' | 'unmeasurable_window'

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
  /**
   * True wanneer het venster IS INGEKORT omdat de koershistorie pas later
   * begint dan de gekozen periode. Portfolio én benchmarks meten dan het
   * kortere, meetbare venster — anders zou een "1J"-label boven een rendement
   * van drie maanden staan, met een index van twaalf ernaast (dezelfde fout als
   * de vensterbug die deze module oorspronkelijk repareerde).
   */
  windowClipped: boolean
  portfolio: {
    /** `null` = niet meetbaar (zie `gap`); toon dan géén getal. */
    returnPct: number | null
    /** Alleen gezet wanneer `returnPct === null`. */
    gap?: PortfolioReturnGap
    /** Rendementsindex (basis 100), zonder kasstroomeffect. Leeg bij `gap`. */
    dataPoints: PortfolioDataPoint[]
    /**
     * Het laagste aandeel (0–1) van de portefeuillewaarde dat in enige gemeten
     * maand op een échte koers rustte. `1` = alles noteerde, elke maand.
     *
     * Dit is contract, geen presentatiedetail (ADR 0098): zonder dit veld is
     * het rendement een getal met onbekende hardheid. `null` als er geen
     * meetbaar rendement is.
     */
    observedShare: number | null
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

/**
 * Het venster waarover vergeleken wordt, uit de periodekeuze én de beschikbare
 * snapshots. **De API-route moet hier de Yahoo-reeks mee ophalen** en
 * `compareToBenchmarks` knipt er dezelfde reeks mee.
 *
 * Waarom dit een eigen functie is: de route haalde de indexreeks op vanaf de
 * PERIODE-start, terwijl de motor bij te weinig snapshots terugviel op de
 * volledige historie. Die terugval verruimt het venster, dus `clipBenchmarkSeries`
 * knipte daarna niets meer weg en de opgehaalde reeks bleef het korte venster
 * dragen: portfolio +77,6% over 30 maanden naast AEX +6,0% over 3 maanden, met
 * het verschil als "alpha". Zolang route en motor deze functie delen kan dat
 * niet meer uiteenlopen.
 */
export function resolveComparisonWindow(
  snapshots: HoldingSnapshot[],
  period: TimePeriod,
  now: Date = new Date(),
): { windowStart: string; windowFallback: boolean } {
  if (snapshots.length === 0) {
    return { windowStart: toDateStr(resolvePeriodStart(period, null, now)), windowFallback: false }
  }

  const windowStart = toDateStr(resolvePeriodStart(period, snapshots[0].date, now))
  if (snapshots.filter(s => s.date >= windowStart).length >= 2) {
    return { windowStart, windowFallback: false }
  }

  // Te weinig snapshots in het gekozen venster: val terug op de volledige
  // beschikbare historie — maar meld dat, zodat de UI niet het periodelabel
  // toont bij een venster dat niet is gebruikt.
  return { windowStart: snapshots[0].date, windowFallback: true }
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
   * koersobservatie had. Afgeleid (`observedValue === totalValue`) en bewaard
   * omdat "volledig waargenomen" een leesbaar begrip is; de rekenkant gebruikt
   * `observedValue`, niet deze vlag.
   */
  pricedFromHistory: boolean
  /**
   * De waarde van uitsluitend de posities die deze maand een échte
   * koersobservatie hadden — het waarneembare mandje. Dit is de teller van de
   * tijdgewogen return; posities zonder koersbron blijven er structureel
   * buiten in plaats van het hele venster te blokkeren.
   */
  observedValue: number
  /**
   * Netto externe kasstroom van dát mandje. Naast de gewone aan-/verkopen
   * tellen hier de posities mee die het mandje IN- of UITSTAPPEN: wordt een
   * positie deze maand voor het eerst waarneembaar, dan komt haar volledige
   * waarde erbij als instroom; verdwijnt de koersbron, dan gaat haar waarde
   * van de vórige maand eraf. Zonder die twee zou het aanzwellen van de
   * koersdekking zich voordoen als koerswinst — precies de fout die regel 2
   * van deze module verbiedt.
   */
  observedNetFlow: number
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
  /**
   * Dagelijkse slotkoersen uit `investment_holding_prices` — de PRIMAIRE
   * koersbron sinds de eigen lijn structureel ontbrak.
   *
   * Waarom dit erbij kwam: deze functie waardeerde uitsluitend op `valuations`,
   * een tabel die voor echte accounts leeg is (0 rijen bij 109 posities). Elke
   * maand kwam daardoor op `pricedFromHistory: false`, `computeTwrSeries` gaf
   * `null`, en de grafiek meldde "Je eigen lijn ontbreekt nog" — terwijl de
   * koersen wél bestonden, alleen in een andere tabel. `valuations` blijft als
   * terugval staan zodat bestaande data blijft werken.
   */
  priceObservations: Array<{
    holding_id: string
    date: string
    close_price: number | string
  }> = [],
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

  // Index koersobservaties per positie, chronologisch. Per maand pakken we de
  // laatste observatie op of vóór het maandeinde — een echte slotkoers, ook als
  // die van een paar dagen eerder is (feestdagen, weekend, illiquide fonds).
  const pricesByHolding: Record<string, Array<{ date: string; close: number }>> = {}
  for (const p of priceObservations) {
    const close = Number(p.close_price)
    if (!Number.isFinite(close) || close <= 0) continue
    if (!pricesByHolding[p.holding_id]) pricesByHolding[p.holding_id] = []
    pricesByHolding[p.holding_id].push({ date: p.date, close })
  }
  for (const key of Object.keys(pricesByHolding)) {
    pricesByHolding[key].sort((a, b) => a.date.localeCompare(b.date))
  }

  // Cursor per positie. De maandlus loopt chronologisch, dus elke reeks hoeft
  // maar één keer doorlopen te worden in plaats van per maand opnieuw vanaf het
  // begin — met duizenden koersrijen per positie (na een backfill) scheelt dat
  // maanden × posities × duizenden vergelijkingen per request.
  const priceCursor: Record<string, number> = {}
  const lastClose: Record<string, number> = {}

  /**
   * Laatste slotkoers op of vóór `onOrBefore`, of null.
   *
   * LET OP: mag alleen met een niet-dalende `onOrBefore` worden aangeroepen —
   * de cursor loopt één kant op. Dat geldt binnen de maandlus hieronder.
   */
  function closeOnOrBefore(holdingId: string, onOrBefore: string): number | null {
    const list = pricesByHolding[holdingId]
    if (!list || list.length === 0) return null
    let i = priceCursor[holdingId] ?? 0
    while (i < list.length && list[i].date <= onOrBefore) {
      lastClose[holdingId] = list[i].close
      i++
    }
    priceCursor[holdingId] = i
    return lastClose[holdingId] ?? null
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

  // Waarde per waarneembare positie aan het eind van de vórige maand. Nodig om
  // in- en uitstappers als kasstroom te boeken i.p.v. als rendement.
  let prevObserved: Record<string, number> = {}

  while (current <= now) {
    const monthStart = localMonthStart(current) // YYYY-MM-01 (tijdzone-veilig)
    const monthKey = monthStart.substring(0, 7) // YYYY-MM
    const monthEnd = localMonthEnd(current) // inclusieve laatste dag van de maand

    let totalValue = 0
    let totalCost = 0
    let netFlow = 0
    // Optimistisch: één positie zonder koersobservatie zet de hele maand op
    // "niet volledig waargenomen". Dat blokkeert het rendement niet meer (zie
    // regel 3 in de modulekop) — het drukt de dekking.
    let pricedFromHistory = true
    let observedValue = 0
    let observedNetFlow = 0
    const currObserved: Record<string, number> = {}

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

      const close = closeOnOrBefore(holding.id, monthEnd)
      const valuation = valMap[holding.id]?.[monthKey]
      if (close != null) {
        // Primaire bron: een echte slotkoers uit `investment_holding_prices`.
        price = close
        priceObserved = true
      } else if (valuation != null && valuation > 0) {
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

      const value = units * price
      totalValue += value
      totalCost += costBasis

      if (priceObserved) {
        observedValue += value
        currObserved[holding.id] = value
        // Instapper: de positie was vorige maand niet waarneembaar, dus haar
        // hele waarde komt nu het mandje in. Haar eigen maandkasstroom zit
        // daar al in — die apart optellen zou dubbel boeken.
        observedNetFlow += holding.id in prevObserved ? monthFlow : value
      } else {
        pricedFromHistory = false
      }
    }

    // Uitstappers: waarneembaar in de vorige maand, nu niet meer (verkocht, of
    // de koersbron viel weg). Ze verlaten het mandje tegen hun laatst bekende
    // waarde, zodat hun verdwijnen geen −100% wordt.
    for (const [holdingId, prevValue] of Object.entries(prevObserved)) {
      if (!(holdingId in currObserved)) observedNetFlow -= prevValue
    }

    // Eenmaal begonnen blijft de reeks doorlopen, óók als de portefeuille een
    // maand volledig leeg staat. Vóór deze regel viel zo'n maand weg en knoopte
    // de keten de maand vóór de verkoop rechtstreeks aan de herkoop vast — met
    // de verkoop-kasstroom buiten de noemer, wat een vlakke koers als −50% las.
    if (totalValue > 0 || totalCost > 0 || snapshots.length > 0) {
      snapshots.push({
        date: monthEnd,
        totalValue: roundCents(totalValue),
        totalCost: roundCents(totalCost),
        netFlow: roundCents(netFlow),
        pricedFromHistory,
        observedValue: roundCents(observedValue),
        observedNetFlow: roundCents(observedNetFlow),
      })
      prevObserved = currObserved
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
  /**
   * De datum waarop de meting daadwerkelijk begint: de eerste snapshot met een
   * waarneembare waarde. Kan later liggen dan de vensterstart wanneer de
   * koershistorie pas later begint. `compareToBenchmarks` knipt de benchmarks
   * hierop, zodat portfolio en index hetzelfde interval meten.
   */
  measuredFrom: string
  /**
   * Laagste aandeel (0–1) van de portefeuillewaarde dat in enige gemeten maand
   * op een echte koers rustte — de hardheid van de zwakste schakel in de keten.
   */
  observedShare: number
}

/**
 * Uitkomst van de TWR-berekening. Bewust een unie i.p.v. `TwrSeries | null`:
 * "niet meetbaar" heeft twee verschillende oorzaken en de UI hoort ze uit
 * elkaar te houden — geen koershistorie is iets anders dan een venster dat door
 * een opname onmeetbaar werd.
 */
export type TwrOutcome =
  | { ok: true; series: TwrSeries }
  | { ok: false; gap: PortfolioReturnGap }

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
 * Gemeten wordt het WAARNEEMBARE mandje (`observedValue`/`observedNetFlow`),
 * niet de hele portefeuille: posities zonder koersbron zouden anders tegen een
 * stand-in koers vlak blijven liggen en het rendement richting nul verdunnen —
 * een fout getal, waar de vorige versie liever géén getal gaf. De meting begint
 * bij de eerste maand met een waarneming; alles daarvóór is geen nul-rendement
 * maar een blinde vlek, en telt dus niet mee.
 */
export function computeTwrOutcome(snapshots: HoldingSnapshot[]): TwrOutcome {
  // Alles vóór de eerste waarneming is blind; daar begint de meting.
  const start = snapshots.findIndex(s => s.observedValue > 0)
  if (start < 0 || snapshots.length - start < 2) {
    return { ok: false, gap: 'no_price_history' }
  }

  let index = 100
  const measured = snapshots.slice(start)
  const indexPoints: PortfolioDataPoint[] = [{ date: measured[0].date, value: 100 }]

  for (let i = 1; i < measured.length; i++) {
    const prev = measured[i - 1]
    const cur = measured[i]
    const base = prev.observedValue + cur.observedNetFlow

    if (base < 0) {
      // Er is meer opgenomen dan er stond: geen basis om tegen af te zetten.
      return { ok: false, gap: 'unmeasurable_window' }
    }
    if (base === 0) {
      // Geen kapitaal onder risico deze maand (volledig verkocht, of nog niets
      // waarneembaars). Dan is het rendement per definitie 0% — niet `null`, en
      // zeker geen −100% omdat de teller toevallig leeg is. Stond er wél waarde
      // aan het eind zónder basis aan het begin, dan klopt de boekhouding niet.
      if (cur.observedValue !== 0) return { ok: false, gap: 'unmeasurable_window' }
      indexPoints.push({ date: cur.date, value: Math.round(index * 100) / 100 })
      continue
    }

    index *= cur.observedValue / base
    indexPoints.push({ date: cur.date, value: Math.round(index * 100) / 100 })
  }

  // De zwakste schakel, niet de laatste maand. Een TWR is het product van zijn
  // segmenten: één maand waarin 13% van de waarde waarneembaar was maakt de héle
  // keten zo hard als díé maand. De laatste maand meten zou bovendien altijd
  // ~100% opleveren — in de lopende maand geldt `current_price` als observatie,
  // dus daar noteert per definitie alles.
  let observedShare = 1
  for (const s of measured) {
    if (s.totalValue <= 0) continue // lege maand zegt niets over de dekking
    observedShare = Math.min(observedShare, s.observedValue / s.totalValue)
  }
  observedShare = Math.min(1, Math.max(0, Math.round(observedShare * 10000) / 10000))

  return {
    ok: true,
    series: {
      indexPoints,
      returnPct: Math.round((index - 100) * 100) / 100,
      measuredFrom: measured[0].date,
      observedShare,
    },
  }
}

/**
 * Dunne wrapper om `computeTwrOutcome` voor callers die de reden niet nodig
 * hebben. `null` = niet meetbaar.
 */
export function computeTwrSeries(snapshots: HoldingSnapshot[]): TwrSeries | null {
  const outcome = computeTwrOutcome(snapshots)
  return outcome.ok ? outcome.series : null
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

  const { windowStart: requestedStart, windowFallback } = resolveComparisonWindow(
    portfolioSnapshots,
    period,
    now,
  )
  const filtered = portfolioSnapshots.filter(s => s.date >= requestedStart)
  const outcome = computeTwrOutcome(filtered)
  const twr = outcome.ok ? outcome.series : null

  // Het venster dat we écht meten. De TWR begint bij de eerste waarneming; ligt
  // die later dan de vensterstart, dan moeten de indices op datzelfde punt
  // beginnen. Anders zet je een index van twaalf maanden naast een portfolio
  // van drie en heet het verschil "alpha".
  const windowStart = twr ? twr.measuredFrom : requestedStart
  // Clipping vergelijken we tegen de eerste snapshot BINNEN het venster
  // (filtered[0]), niet tegen de rauwe requestedStart: snapshots landen op
  // maandeinden, requestedStart is "nu min N maanden" (een dag midden in de
  // maand). Tegen requestedStart zou windowClipped bij vrijwel elke vaste
  // periode ten onrechte true zijn — puur door het snapshot-rooster, niet
  // omdat de koershistorie later begint. filtered[0] bestaat altijd wanneer
  // twr niet null is (computeTwrOutcome eist measured.length >= 2 uit filtered).
  const windowClipped = twr ? windowStart > filtered[0].date : false
  const windowStartDate = new Date(windowStart)

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
    windowClipped,
    portfolio: twr
      ? {
          returnPct: twr.returnPct,
          dataPoints: twr.indexPoints,
          observedShare: twr.observedShare,
        }
      : {
          returnPct: null,
          gap: outcome.ok ? 'no_price_history' : outcome.gap,
          dataPoints: [],
          observedShare: null,
        },
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

/**
 * Price Feed Integration
 *
 * Fetches real-time stock/ETF/crypto prices from Yahoo Finance's public API.
 * Includes:
 * - In-memory cache with configurable TTL (default 5 minutes)
 * - Rate limiting (max 5 requests per second)
 * - Graceful error handling (returns null on failure)
 * - Previous close price for daily change calculation
 */

export type PriceData = {
  /** Current market price */
  price: number
  /** Previous trading day's closing price (for daily change calc) */
  previousClose: number | null
  /** Daily change amount (price - previousClose) */
  dailyChange: number | null
  /** Daily change percentage */
  dailyChangePercent: number | null
  /** Currency of the price (e.g., "EUR", "USD") */
  currency: string | null
  /** Full name of the security */
  displayName: string | null
  /** Timestamp of the price data */
  timestamp: string
  /** Source of the data */
  source: 'yahoo_finance' | 'cache'
}

// ── In-memory cache ─────────────────────────────────────────────
const priceCache = new Map<string, { data: PriceData; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getCachedPrice(ticker: string): PriceData | null {
  const key = ticker.toUpperCase()
  const cached = priceCache.get(key)
  if (cached && Date.now() < cached.expiresAt) {
    return { ...cached.data, source: 'cache' }
  }
  // Clean expired entry
  if (cached) priceCache.delete(key)
  return null
}

function setCachedPrice(ticker: string, data: PriceData): void {
  const key = ticker.toUpperCase()
  priceCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })

  // Evict old entries if cache grows too large
  if (priceCache.size > 500) {
    const now = Date.now()
    for (const [k, v] of priceCache.entries()) {
      if (now >= v.expiresAt) priceCache.delete(k)
    }
  }
}

// ── Rate limiter (token bucket) ─────────────────────────────────
const RATE_LIMIT_MAX_TOKENS = 5 // max 5 requests per second
const RATE_LIMIT_REFILL_RATE = 5 // 5 tokens per second
let rateLimitTokens = RATE_LIMIT_MAX_TOKENS
let rateLimitLastRefill = Date.now()

function acquireRateLimitToken(): boolean {
  const now = Date.now()
  const elapsed = (now - rateLimitLastRefill) / 1000
  rateLimitTokens = Math.min(RATE_LIMIT_MAX_TOKENS, rateLimitTokens + elapsed * RATE_LIMIT_REFILL_RATE)
  rateLimitLastRefill = now

  if (rateLimitTokens >= 1) {
    rateLimitTokens -= 1
    return true
  }
  return false
}

// Bij een lege bucket instant `null` teruggeven markeert holdings ten onrechte
// als "stale" zodra een aanroeper (zoals de refresh-pool) sneller vraagt dan de
// 5/s-refill. In plaats daarvan wachten we kort en proberen opnieuw, tot een
// gebonden max-wachttijd. Zo paced elke aanroeper — ongeacht de concurrency —
// zichzelf vanzelf op de duurzame refill-rate, en degradeert het pas naar de
// eerlijke 'gedeeltelijk/stale'-melding als er écht geen capaciteit is binnen de
// tijd die de server-`maxDuration`/client-abort toestaat.
const RATE_LIMIT_REFILL_INTERVAL_MS = Math.ceil(1000 / RATE_LIMIT_REFILL_RATE) // ~200ms per token
const RATE_LIMIT_MAX_WAIT_MS = 15_000 // ruim binnen server-maxDuration (60s) en client-abort (55s)

async function acquireRateLimitTokenBlocking(maxWaitMs: number): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs
  for (;;) {
    if (acquireRateLimitToken()) return true
    if (Date.now() >= deadline) return false
    // Iets meer dan het refill-interval zodat er gegarandeerd ≥1 token bijkomt.
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_REFILL_INTERVAL_MS + 10))
  }
}

// ── Yahoo Finance API ───────────────────────────────────────────

/**
 * Fetch price data for a ticker from Yahoo Finance.
 *
 * Uses the public v8 finance API (no API key required).
 * Returns null if the ticker is not found or the API is unavailable.
 *
 * Common ticker formats:
 * - US stocks: "AAPL", "MSFT"
 * - EU stocks: "ASML.AS" (Amsterdam), "SAP.DE" (Frankfurt)
 * - ETFs: "VWRL.AS", "IWDA.AS"
 * - Crypto: "BTC-EUR", "ETH-EUR"
 * - Indices: "^AEX", "^GSPC"
 */
export async function fetchPriceData(ticker: string): Promise<PriceData | null> {
  if (!ticker || ticker.trim().length === 0) return null

  const normalizedTicker = ticker.trim().toUpperCase()

  // Check cache first
  const cached = getCachedPrice(normalizedTicker)
  if (cached) return cached

  // Rate limit check — wacht kort op capaciteit i.p.v. instant 'stale'.
  if (!(await acquireRateLimitTokenBlocking(RATE_LIMIT_MAX_WAIT_MS))) {
    // Pas na de gebonden max-wachttijd opgeven — caller toont laatste bekende prijs.
    return null
  }

  try {
    // Yahoo Finance v8 API — public, no API key needed
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedTicker)}?interval=1d&range=2d`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TriFinity/1.0)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000), // 8 second timeout
    })

    if (!res.ok) {
      // 404 = ticker not found, other errors = API issue
      return null
    }

    const data = await res.json()

    const result = data?.chart?.result?.[0]
    if (!result) return null

    const meta = result.meta
    if (!meta) return null

    let currentPrice: number | null = meta.regularMarketPrice ?? null
    if (currentPrice === null || currentPrice === undefined) return null

    let previousClose: number | null = meta.chartPreviousClose ?? meta.previousClose ?? null
    let currency: string | null = meta.currency || null

    // ── Pence-notatie normaliseren (Londen/LSE-instrumenten) ────────
    // Yahoo levert in pence genoteerde aandelen met currency "GBp" (kleine
    // p; Yahoo's pence-conventie is exact zo gespeld) of de variant "GBX",
    // en de prijzen 100× te hoog t.o.v. echte ponden (2947.5 pence = £29,475).
    // Normaliseer bij de bron naar hele ponden vóór het samenstellen/cachen,
    // zodat élke consument (cron, handmatige refresh, loader, UI, forex)
    // canonieke GBP-waarden krijgt zonder eigen fix. LET OP: "GBP" met
    // hoofdletter P is een écht pond en mag NIET gedeeld worden; het
    // percentage is schaal-invariant en blijft ongemoeid.
    if (currency === 'GBp' || currency?.toUpperCase() === 'GBX') {
      currentPrice = currentPrice / 100
      if (previousClose !== null) previousClose = previousClose / 100
      currency = 'GBP'
    }

    let dailyChange: number | null = null
    let dailyChangePercent: number | null = null

    if (previousClose !== null && previousClose > 0) {
      dailyChange = currentPrice - previousClose
      dailyChangePercent = (dailyChange / previousClose) * 100
    }

    const priceData: PriceData = {
      price: currentPrice,
      previousClose,
      dailyChange,
      dailyChangePercent,
      currency,
      displayName: meta.shortName || meta.longName || null,
      timestamp: new Date().toISOString(),
      source: 'yahoo_finance',
    }

    // Cache the result
    setCachedPrice(normalizedTicker, priceData)

    return priceData
  } catch {
    // Network error, timeout, parse error — gracefully return null
    return null
  }
}

// ── Symbol resolution (ISIN / name → Yahoo ticker) ──────────────
//
// Broker-imports (m.n. DEGIRO-transactie-exports) leveren GEEN beurssymbool —
// de `ticker` is daar de productnaam ("MARVELL TECHNOLOGY INC"). Yahoo's
// chart-API kent die niet, dus de prijs-refresh vond niets. Yahoo's search-
// endpoint resolveert wél een ISIN of naam naar een verhandelbaar symbool
// (US5738741041 → MRVL, NL0012747059 → CMCOM.AS). We cachen het resultaat
// lang (ISIN→symbool is stabiel) zodat een herhaalde refresh direct op het
// symbool kan prijzen.

const SYMBOL_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 uur
const symbolCache = new Map<string, { symbol: string | null; expiresAt: number }>()

/**
 * Resolveer een ISIN of instrument-naam naar een Yahoo-Finance-symbool via de
 * publieke search-API. Geeft het eerste verhandelbare (EQUITY/ETF) symbool
 * terug, of `null` als er geen match is. Geen API-key nodig; deelt de rate-
 * limiter met `fetchPriceData`.
 */
export async function resolveYahooSymbol(query: string): Promise<string | null> {
  const q = (query ?? '').trim()
  if (q.length === 0) return null
  const key = q.toUpperCase()

  const cached = symbolCache.get(key)
  if (cached && Date.now() < cached.expiresAt) return cached.symbol

  if (!(await acquireRateLimitTokenBlocking(RATE_LIMIT_MAX_WAIT_MS))) return null

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TriFinity/1.0)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null

    const data = await res.json()
    const quotes: Array<{ symbol?: string; quoteType?: string }> = Array.isArray(
      data?.quotes,
    )
      ? data.quotes
      : []

    // Prefereer een echt verhandelbaar instrument; val anders terug op de
    // eerste match met een symbool.
    const tradeable = quotes.find(
      (qt) => qt.symbol && (qt.quoteType === 'EQUITY' || qt.quoteType === 'ETF'),
    )
    const symbol = tradeable?.symbol ?? quotes.find((qt) => qt.symbol)?.symbol ?? null

    symbolCache.set(key, { symbol, expiresAt: Date.now() + SYMBOL_CACHE_TTL_MS })
    return symbol
  } catch {
    return null
  }
}

/**
 * Simple price-only fetch (backward compatible with existing fetchTickerPrice signature).
 * Returns just the price number, or null if unavailable.
 */
export async function fetchTickerPrice(ticker: string): Promise<number | null> {
  const data = await fetchPriceData(ticker)
  return data?.price ?? null
}

/**
 * Batch fetch prices for multiple tickers.
 * Processes sequentially with rate limiting to avoid API abuse.
 * Returns a map of ticker → PriceData.
 */
export async function fetchBatchPrices(tickers: string[]): Promise<Map<string, PriceData | null>> {
  const results = new Map<string, PriceData | null>()

  for (const ticker of tickers) {
    const data = await fetchPriceData(ticker)
    results.set(ticker.toUpperCase(), data)

    // Small delay between requests to be respectful to the API
    if (data?.source === 'yahoo_finance') {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  return results
}

/**
 * Clear the price cache (useful for testing).
 */
export function clearPriceCache(): void {
  priceCache.clear()
}

/**
 * Get cache statistics.
 */
export function getPriceCacheStats(): { size: number; maxAge: number } {
  return { size: priceCache.size, maxAge: CACHE_TTL_MS }
}

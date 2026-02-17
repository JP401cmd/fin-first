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

  // Rate limit check
  if (!acquireRateLimitToken()) {
    // Rate limited — return null (caller will use stale price)
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

    const currentPrice = meta.regularMarketPrice ?? null
    if (currentPrice === null || currentPrice === undefined) return null

    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null

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
      currency: meta.currency || null,
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

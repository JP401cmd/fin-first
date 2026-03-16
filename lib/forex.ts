/**
 * Foreign exchange rate utilities.
 *
 * Fetches live exchange rates from Yahoo Finance forex pairs.
 * Converts foreign currency amounts to EUR for portfolio calculations.
 *
 * Includes:
 * - In-memory cache with 1-hour TTL
 * - Graceful fallback (returns null if unavailable)
 * - Common currency pair support (USD, GBP, CHF, JPY, etc.)
 */

export interface ForexRate {
  /** Source currency (e.g., 'USD') */
  from: string
  /** Target currency, always 'EUR' */
  to: 'EUR'
  /** Exchange rate: 1 unit of source = rate units of EUR */
  rate: number
  /** When the rate was fetched */
  timestamp: string
  /** Data source */
  source: 'yahoo_finance' | 'cache' | 'fallback'
}

// ── Cache ───────────────────────────────────────────────────
const forexCache = new Map<string, { rate: ForexRate; expiresAt: number }>()
const FOREX_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

// ── Fallback rates (approximate, updated periodically) ──────
// Used when Yahoo Finance is unavailable
const FALLBACK_RATES: Record<string, number> = {
  USD: 0.92,
  GBP: 1.16,
  CHF: 1.04,
  JPY: 0.0061,
  CAD: 0.68,
  AUD: 0.60,
  SEK: 0.088,
  NOK: 0.086,
  DKK: 0.134,
  PLN: 0.23,
  CZK: 0.040,
  HUF: 0.0025,
  HKD: 0.12,
  SGD: 0.69,
  CNY: 0.13,
  INR: 0.011,
  BRL: 0.16,
  KRW: 0.00067,
  TWD: 0.029,
  ZAR: 0.051,
}

/**
 * Fetch the exchange rate from a currency to EUR via Yahoo Finance.
 * Returns null if the rate cannot be determined.
 *
 * Yahoo Finance forex tickers: USDEUR=X, GBPEUR=X, etc.
 */
export async function fetchForexRate(fromCurrency: string): Promise<ForexRate | null> {
  const from = fromCurrency.trim().toUpperCase()

  // EUR to EUR is always 1
  if (from === 'EUR') {
    return { from: 'EUR', to: 'EUR', rate: 1, timestamp: new Date().toISOString(), source: 'cache' }
  }

  // Check cache
  const cached = forexCache.get(from)
  if (cached && Date.now() < cached.expiresAt) {
    return { ...cached.rate, source: 'cache' }
  }

  try {
    // Yahoo Finance forex pair: e.g., USDEUR=X
    const ticker = `${from}EUR=X`
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TriFinity/1.0)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return getFallbackRate(from)
    }

    const data = await res.json()
    const result = data?.chart?.result?.[0]
    const rate = result?.meta?.regularMarketPrice

    if (!rate || isNaN(rate) || rate <= 0) {
      return getFallbackRate(from)
    }

    const forexRate: ForexRate = {
      from,
      to: 'EUR',
      rate,
      timestamp: new Date().toISOString(),
      source: 'yahoo_finance',
    }

    // Cache the result
    forexCache.set(from, { rate: forexRate, expiresAt: Date.now() + FOREX_CACHE_TTL_MS })

    return forexRate
  } catch {
    return getFallbackRate(from)
  }
}

/**
 * Get a fallback rate when Yahoo Finance is unavailable.
 */
function getFallbackRate(from: string): ForexRate | null {
  const rate = FALLBACK_RATES[from]
  if (!rate) return null

  return {
    from,
    to: 'EUR',
    rate,
    timestamp: new Date().toISOString(),
    source: 'fallback',
  }
}

/**
 * Convert an amount from a foreign currency to EUR.
 * Returns the original amount if the currency is EUR or rate is unavailable.
 */
export async function convertToEUR(amount: number, fromCurrency: string): Promise<{
  eurAmount: number
  rate: number
  source: ForexRate['source']
}> {
  const from = fromCurrency.trim().toUpperCase()

  if (from === 'EUR') {
    return { eurAmount: amount, rate: 1, source: 'cache' }
  }

  const forexRate = await fetchForexRate(from)

  if (!forexRate) {
    // Cannot convert — return original amount as best effort
    return { eurAmount: amount, rate: 1, source: 'fallback' }
  }

  return {
    eurAmount: amount * forexRate.rate,
    rate: forexRate.rate,
    source: forexRate.source,
  }
}

/**
 * Fetch exchange rates for multiple currencies at once.
 * Returns a map of currency → rate to EUR.
 */
export async function fetchBatchForexRates(currencies: string[]): Promise<Map<string, ForexRate | null>> {
  const results = new Map<string, ForexRate | null>()
  const unique = Array.from(new Set(currencies.map(c => c.trim().toUpperCase())))

  for (const currency of unique) {
    const rate = await fetchForexRate(currency)
    results.set(currency, rate)

    // Small delay between requests
    if (rate?.source === 'yahoo_finance') {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  return results
}

/**
 * Get a synchronous EUR conversion rate (from cache or fallback only).
 * Does NOT make API calls. Use this for display purposes when async is not possible.
 */
export function getEURRateSync(fromCurrency: string): number {
  const from = fromCurrency.trim().toUpperCase()
  if (from === 'EUR') return 1

  // Check cache first
  const cached = forexCache.get(from)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.rate.rate
  }

  // Fallback
  return FALLBACK_RATES[from] ?? 1
}

/**
 * Clear the forex cache (useful for testing).
 */
export function clearForexCache(): void {
  forexCache.clear()
}

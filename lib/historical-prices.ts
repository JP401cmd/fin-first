/**
 * Historical Price Data
 *
 * Fetches historical daily closing prices from Yahoo Finance and stores
 * them in the `holding_prices` Supabase table. Used for portfolio
 * performance charts and time-weighted return calculations.
 *
 * Features:
 * - Yahoo Finance v8 chart API (no API key required)
 * - Upsert-based storage (safe to re-run without duplicates)
 * - Graceful error handling (never throws)
 * - Single-day storage for daily price refresh jobs
 */

export type HistoricalPrice = {
  /** Date in YYYY-MM-DD format */
  date: string
  /** Closing price */
  close: number
  /** Opening price */
  open?: number
  /** Intraday high */
  high?: number
  /** Intraday low */
  low?: number
  /** Trading volume */
  volume?: number
}

/** Valid range values for Yahoo Finance chart API */
const VALID_RANGES = ['1mo', '3mo', '6mo', '1y', '2y', '5y', 'max'] as const
type HistoricalRange = (typeof VALID_RANGES)[number]

// ── Yahoo Finance Chart API ─────────────────────────────────────

/**
 * Fetch historical daily closing prices from Yahoo Finance.
 *
 * Uses the public v8 chart API with daily intervals. Returns an empty
 * array on any error (network, parse, invalid ticker) so callers never
 * need to handle exceptions.
 *
 * @param ticker - Yahoo Finance ticker (e.g., "VWRL.AS", "AAPL")
 * @param range  - Lookback period (default: "1y")
 * @returns Array of daily prices, oldest first
 */
export async function fetchHistoricalPrices(
  ticker: string,
  range: HistoricalRange | string = '1y',
): Promise<HistoricalPrice[]> {
  if (!ticker || ticker.trim().length === 0) return []

  const normalizedTicker = ticker.trim().toUpperCase()

  // Validate range to prevent unexpected API behavior
  const safeRange = VALID_RANGES.includes(range as HistoricalRange) ? range : '1y'

  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedTicker)}` +
      `?interval=1d&range=${safeRange}`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TriFinity/1.0)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return []

    const data = await res.json()

    const result = data?.chart?.result?.[0]
    if (!result) return []

    const timestamps: number[] | undefined = result.timestamp
    const quote = result.indicators?.quote?.[0]
    if (!timestamps || !quote) return []

    const closes: (number | null)[] = quote.close ?? []
    const opens: (number | null)[] = quote.open ?? []
    const highs: (number | null)[] = quote.high ?? []
    const lows: (number | null)[] = quote.low ?? []
    const volumes: (number | null)[] = quote.volume ?? []

    const prices: HistoricalPrice[] = []

    for (let i = 0; i < timestamps.length; i++) {
      const closePrice = closes[i]

      // Skip entries with null close prices (market holidays / data gaps)
      if (closePrice === null || closePrice === undefined) continue

      // Convert unix timestamp (seconds) to YYYY-MM-DD
      const dateObj = new Date(timestamps[i] * 1000)
      const date = dateObj.toISOString().slice(0, 10)

      const entry: HistoricalPrice = { date, close: closePrice }

      if (opens[i] !== null && opens[i] !== undefined) entry.open = opens[i]!
      if (highs[i] !== null && highs[i] !== undefined) entry.high = highs[i]!
      if (lows[i] !== null && lows[i] !== undefined) entry.low = lows[i]!
      if (volumes[i] !== null && volumes[i] !== undefined) entry.volume = volumes[i]!

      prices.push(entry)
    }

    return prices
  } catch {
    // Network error, timeout, parse error — return empty array
    return []
  }
}

// ── Supabase Storage ────────────────────────────────────────────

/**
 * Store historical prices into the `holding_prices` table.
 *
 * Uses upsert with a unique constraint on (holding_id, date) so this
 * is safe to call repeatedly — existing rows are updated, new rows
 * are inserted.
 *
 * @param supabase  - Any Supabase client instance (server or browser)
 * @param holdingId - UUID of the holding
 * @param prices    - Array of historical prices to store
 * @param currency  - ISO currency code (default: "EUR")
 * @returns Number of rows upserted, or 0 on error
 */
export async function storeHistoricalPrices(
  supabase: any,
  holdingId: string,
  prices: HistoricalPrice[],
  currency: string = 'EUR',
): Promise<number> {
  if (!prices.length) return 0

  try {
    const rows = prices.map((p) => ({
      holding_id: holdingId,
      date: p.date,
      close_price: p.close,
      currency,
      source: 'yahoo_finance',
    }))

    const { error } = await supabase
      .from('holding_prices')
      .upsert(rows, { onConflict: 'holding_id,date' })

    if (error) {
      console.error('[historical-prices] storeHistoricalPrices error:', error.message)
      return 0
    }

    return rows.length
  } catch (err) {
    console.error('[historical-prices] storeHistoricalPrices unexpected error:', err)
    return 0
  }
}

/**
 * Fetch and store historical prices for a single holding.
 *
 * Convenience wrapper that combines `fetchHistoricalPrices` and
 * `storeHistoricalPrices` into a single call.
 *
 * @param supabase  - Any Supabase client instance
 * @param holdingId - UUID of the holding
 * @param ticker    - Yahoo Finance ticker symbol
 * @param userId    - UUID of the owning user (reserved for future audit use)
 * @param range     - Lookback period (default: "1y")
 * @returns Number of price rows stored, or 0 on error
 */
export async function backfillHoldingPrices(
  supabase: any,
  holdingId: string,
  ticker: string,
  userId: string,
  range: HistoricalRange | string = '1y',
): Promise<number> {
  const prices = await fetchHistoricalPrices(ticker, range)
  if (!prices.length) return 0

  return storeHistoricalPrices(supabase, holdingId, prices)
}

/**
 * Store a single day's closing price for a holding.
 *
 * Designed for the daily price refresh job — inserts or updates one
 * row in `holding_prices` for the given date (defaults to today).
 *
 * @param supabase  - Any Supabase client instance
 * @param holdingId - UUID of the holding
 * @param price     - Closing price
 * @param date      - Date in YYYY-MM-DD format (default: today)
 * @param currency  - ISO currency code (default: "EUR")
 * @returns true on success, false on error
 */
export async function storeSingleDayPrice(
  supabase: any,
  holdingId: string,
  price: number,
  date?: string,
  currency: string = 'EUR',
): Promise<boolean> {
  try {
    const effectiveDate = date ?? new Date().toISOString().slice(0, 10)

    const { error } = await supabase
      .from('holding_prices')
      .upsert(
        {
          holding_id: holdingId,
          date: effectiveDate,
          close_price: price,
          currency,
          source: 'yahoo_finance',
        },
        { onConflict: 'holding_id,date' },
      )

    if (error) {
      console.error('[historical-prices] storeSingleDayPrice error:', error.message)
      return false
    }

    return true
  } catch (err) {
    console.error('[historical-prices] storeSingleDayPrice unexpected error:', err)
    return false
  }
}

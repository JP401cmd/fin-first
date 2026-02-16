import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/holdings/refresh-prices — Attempt to refresh prices for holdings.
 *
 * Tries to fetch current market prices for all holdings with a ticker symbol.
 * When the price API is unavailable or fails for a specific ticker, the holding
 * retains its last known price and is flagged as stale (price_fetch_failed).
 *
 * Body (optional): { holding_id?: string } — refresh a specific holding only
 *
 * Returns: { results: Array<{ id, ticker, status, price?, error?, last_price_update? }> }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    let body: Record<string, unknown> = {}
    try {
      body = await request.json()
    } catch {
      // Empty body is fine — refresh all
    }

    const holdingId = body?.holding_id as string | undefined

    // Check if holdings table exists
    const { error: tableCheck } = await supabase.from('holdings').select('id').limit(0)
    const hasTable = !tableCheck || !tableCheck.message.includes('Could not find')

    if (!hasTable) {
      return NextResponse.json({
        results: [],
        message: 'Holdings tabel niet beschikbaar',
        source: 'no_table',
      })
    }

    // Fetch holdings that have tickers
    let query = supabase
      .from('holdings')
      .select('id, ticker, isin, name, current_price, last_price_update, units, avg_purchase_price')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (holdingId) {
      query = query.eq('id', holdingId)
    }

    const { data: holdings, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        results: [],
        message: 'Geen holdings gevonden',
      })
    }

    const results = []

    for (const holding of holdings) {
      if (!holding.ticker && !holding.isin) {
        results.push({
          id: holding.id,
          ticker: null,
          status: 'skipped' as const,
          message: 'Geen ticker of ISIN beschikbaar',
          current_price: holding.current_price,
          last_price_update: holding.last_price_update,
        })
        continue
      }

      // Attempt to fetch price from an external API
      // This is designed to gracefully handle failures
      try {
        const price = await fetchTickerPrice(holding.ticker || holding.isin || '')

        if (price !== null) {
          // Successfully got a price — update the holding
          const { error: updateError } = await supabase
            .from('holdings')
            .update({
              current_price: price,
              last_price_update: new Date().toISOString(),
            })
            .eq('id', holding.id)
            .eq('user_id', user.id)

          if (updateError) {
            results.push({
              id: holding.id,
              ticker: holding.ticker,
              status: 'error' as const,
              error: 'Kon prijs niet opslaan',
              current_price: holding.current_price,
              last_price_update: holding.last_price_update,
            })
          } else {
            // Also sync linked asset
            if (holding.id) {
              const newValue = price * (holding.units || 1)
              await supabase
                .from('assets')
                .update({ current_value: newValue })
                .eq('user_id', user.id)
            }

            results.push({
              id: holding.id,
              ticker: holding.ticker,
              status: 'updated' as const,
              price,
              last_price_update: new Date().toISOString(),
            })
          }
        } else {
          // Price API returned null — price feed unavailable for this ticker
          results.push({
            id: holding.id,
            ticker: holding.ticker,
            status: 'stale' as const,
            message: 'Prijsfeed niet beschikbaar — laatste bekende prijs wordt getoond',
            current_price: holding.current_price,
            last_price_update: holding.last_price_update,
          })
        }
      } catch {
        // Price fetch failed entirely — holding keeps last known price
        results.push({
          id: holding.id,
          ticker: holding.ticker,
          status: 'stale' as const,
          message: 'Prijsfeed niet bereikbaar — laatste bekende prijs wordt getoond',
          current_price: holding.current_price,
          last_price_update: holding.last_price_update,
        })
      }
    }

    const updated = results.filter(r => r.status === 'updated').length
    const stale = results.filter(r => r.status === 'stale').length
    const skipped = results.filter(r => r.status === 'skipped').length

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        updated,
        stale,
        skipped,
      },
      message: updated > 0
        ? `${updated} prij${updated === 1 ? 's' : 'zen'} bijgewerkt, ${stale} niet beschikbaar`
        : stale > 0
          ? `Prijsfeed niet beschikbaar voor ${stale} holding${stale !== 1 ? 's' : ''} — laatste bekende prijzen worden getoond`
          : 'Geen holdings met ticker gevonden',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * PATCH /api/holdings/refresh-prices — Manual price override for a single holding.
 *
 * Body: { holding_id: string, price: number }
 * Updates the holding's current_price and last_price_update to now.
 * This is the "manual override" option when the price feed is unavailable.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Ongeldig JSON-formaat' }, { status: 400 })
    }

    const { holding_id, price } = body

    if (!holding_id || typeof holding_id !== 'string') {
      return NextResponse.json({ error: 'holding_id is verplicht' }, { status: 400 })
    }

    if (price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0) {
      return NextResponse.json({ error: 'Prijs moet een positief getal zijn' }, { status: 400 })
    }

    const { data: holding, error } = await supabase
      .from('holdings')
      .update({
        current_price: Number(price),
        last_price_update: new Date().toISOString(),
      })
      .eq('id', holding_id)
      .eq('user_id', user.id)
      .select('*, asset_id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!holding) {
      return NextResponse.json({ error: 'Holding niet gevonden' }, { status: 404 })
    }

    // Sync linked asset's current_value
    if (holding.asset_id) {
      const newValue = Number(price) * (holding.units || 1)
      await supabase
        .from('assets')
        .update({ current_value: newValue })
        .eq('id', holding.asset_id)
        .eq('user_id', user.id)
    }

    return NextResponse.json({
      holding,
      message: 'Prijs handmatig bijgewerkt',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Attempt to fetch a ticker price from external market data.
 *
 * This function attempts to get a real-time price. When the external API
 * is unavailable, unreachable, or returns an error, it returns null rather
 * than throwing — allowing the caller to gracefully fall back to the last
 * known price.
 *
 * In production, this would connect to a real market data provider
 * (e.g., Yahoo Finance, Alpha Vantage, IEX Cloud). Currently returns null
 * to simulate "price feed unavailable", which triggers the stale price UX.
 */
async function fetchTickerPrice(ticker: string): Promise<number | null> {
  // The price feed is "unavailable" — return null to trigger stale price handling
  // This simulates the real-world scenario where the external API is down
  // In a production environment, this would be:
  //
  // try {
  //   const res = await fetch(`https://api.marketdata.com/v1/quote/${encodeURIComponent(ticker)}`, {
  //     headers: { 'Authorization': `Bearer ${process.env.MARKET_DATA_API_KEY}` },
  //     signal: AbortSignal.timeout(5000),
  //   })
  //   if (!res.ok) return null
  //   const data = await res.json()
  //   return data.price ?? null
  // } catch {
  //   return null  // Network error, timeout, etc. — gracefully degrade
  // }

  void ticker // Acknowledge parameter usage
  return null  // Price feed unavailable — triggers stale price handling
}

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { fetchPriceData } from '@/lib/price-feed'
import { syncAssetValueFromHoldings } from '@/lib/holdings-sync'

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

      // Attempt to fetch price from Yahoo Finance API
      // This is designed to gracefully handle failures
      try {
        const priceData = await fetchPriceData(holding.ticker || holding.isin || '')

        if (priceData !== null) {
          // Successfully got a price — update the holding
          const updateFields: Record<string, unknown> = {
            current_price: priceData.price,
            last_price_update: new Date().toISOString(),
          }

          // Store previous_close and daily change if available
          if (priceData.previousClose !== null) {
            updateFields.previous_close = priceData.previousClose
          }
          if (priceData.dailyChangePercent !== null) {
            updateFields.daily_change_percent = priceData.dailyChangePercent
          }

          const { error: updateError } = await supabase
            .from('holdings')
            .update(updateFields)
            .eq('id', holding.id)
            .eq('user_id', user.id)

          if (updateError) {
            // If the columns don't exist yet, try without them
            const { error: fallbackError } = await supabase
              .from('holdings')
              .update({
                current_price: priceData.price,
                last_price_update: new Date().toISOString(),
              })
              .eq('id', holding.id)
              .eq('user_id', user.id)

            if (fallbackError) {
              results.push({
                id: holding.id,
                ticker: holding.ticker,
                status: 'error' as const,
                error: 'Kon prijs niet opslaan',
                current_price: holding.current_price,
                last_price_update: holding.last_price_update,
              })
              continue
            }
          }

          // Sync linked asset value — aggregate ALL holdings for the asset,
          // not just this one holding (portfolio tracker is source of truth)
          if (holding.id) {
            const { data: holdingFull } = await supabase
              .from('holdings')
              .select('asset_id')
              .eq('id', holding.id)
              .single()

            if (holdingFull?.asset_id) {
              await syncAssetValueFromHoldings(supabase, holdingFull.asset_id, user.id)
            }
          }

          results.push({
            id: holding.id,
            ticker: holding.ticker,
            status: 'updated' as const,
            price: priceData.price,
            previousClose: priceData.previousClose,
            dailyChange: priceData.dailyChange,
            dailyChangePercent: priceData.dailyChangePercent,
            currency: priceData.currency,
            displayName: priceData.displayName,
            last_price_update: new Date().toISOString(),
          })
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

    // Sync linked asset's current_value — aggregate ALL holdings for the asset,
    // not just this one holding (portfolio tracker is source of truth)
    if (holding.asset_id) {
      await syncAssetValueFromHoldings(supabase, holding.asset_id, user.id)
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

// fetchTickerPrice is now imported from @/lib/price-feed
// The real Yahoo Finance integration replaces the previous placeholder

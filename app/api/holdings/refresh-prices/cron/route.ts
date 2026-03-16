import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { fetchPriceData } from '@/lib/price-feed'

/**
 * GET /api/holdings/refresh-prices/cron
 *
 * Scheduled endpoint for automatic price updates across all users.
 * Designed to be called by:
 * - Vercel Cron Jobs (see vercel.json)
 * - Supabase pg_cron / Edge Function
 * - External cron service (cron-job.org, etc.)
 *
 * Uses service role key (not user auth) to update prices for ALL users.
 * Protected by CRON_SECRET environment variable.
 *
 * Behaviour:
 * - Fetches all active holdings with a ticker across all users
 * - Deduplicates tickers to minimize Yahoo Finance API calls
 * - Respects rate limits (200ms delay between requests)
 * - Updates current_price, previous_close, daily_change_percent, last_price_update
 * - Syncs parent asset values after price updates
 * - Logs successes and errors per user
 *
 * Recommended schedule: hourly during market hours (08:00-22:00 CET)
 * to cover European, US, and crypto markets.
 */
export async function GET(request: Request) {
  const startTime = Date.now()

  // ── Auth: verify CRON_SECRET ──────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const url = new URL(request.url)
  const querySecret = url.searchParams.get('secret')

  const isAuthorized =
    !cronSecret || // No secret configured = dev mode, allow
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Supabase service role client ──────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({
      error: 'SUPABASE_SERVICE_ROLE_KEY not configured',
      description: 'This endpoint requires the service role key to update prices for all users.',
      manual_trigger: 'Users can manually refresh via the "Prijzen vernieuwen" button on the holdings page.',
    }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    // ── Step 1: Fetch all active holdings with a ticker ───────────
    const { data: allHoldings, error: holdingsError } = await supabase
      .from('holdings')
      .select('id, user_id, asset_id, ticker, isin, name, current_price, last_price_update, units')
      .eq('is_active', true)
      .or('ticker.neq.null,isin.neq.null')

    if (holdingsError) {
      return NextResponse.json({ error: holdingsError.message }, { status: 500 })
    }

    if (!allHoldings || allHoldings.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Geen holdings met ticker gevonden',
        summary: { total_holdings: 0, unique_tickers: 0, updated: 0, stale: 0, skipped: 0 },
        duration_ms: Date.now() - startTime,
      })
    }

    // Filter out holdings without a usable ticker/ISIN
    const holdingsWithTicker = allHoldings.filter(h => h.ticker || h.isin)

    // ── Step 2: Deduplicate tickers to minimize API calls ─────────
    // Multiple users/holdings may share the same ticker (e.g., VWRL.AS)
    const tickerMap = new Map<string, string>() // normalized ticker → original ticker
    for (const h of holdingsWithTicker) {
      const ticker = (h.ticker || h.isin || '').trim().toUpperCase()
      if (ticker && !tickerMap.has(ticker)) {
        tickerMap.set(ticker, h.ticker || h.isin || '')
      }
    }

    // ── Step 3: Fetch prices for unique tickers ───────────────────
    const priceResults = new Map<string, Awaited<ReturnType<typeof fetchPriceData>>>()

    const uniqueTickers = Array.from(tickerMap.keys())

    for (const normalizedTicker of uniqueTickers) {
      const priceData = await fetchPriceData(normalizedTicker)
      priceResults.set(normalizedTicker, priceData)

      // Respect rate limits: 200ms delay between actual API calls
      if (priceData?.source === 'yahoo_finance') {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }

    // ── Step 4: Update holdings with fetched prices ───────────────
    let updated = 0
    let stale = 0
    let skipped = 0
    const errors: { holdingId: string; ticker: string; error: string }[] = []
    const assetsToSync = new Set<string>() // asset_id:user_id pairs

    for (const holding of holdingsWithTicker) {
      const ticker = (holding.ticker || holding.isin || '').trim().toUpperCase()

      if (!ticker) {
        skipped++
        continue
      }

      const priceData = priceResults.get(ticker)

      if (!priceData) {
        stale++
        continue
      }

      // Build update fields
      const updateFields: Record<string, unknown> = {
        current_price: priceData.price,
        last_price_update: new Date().toISOString(),
      }

      if (priceData.previousClose !== null) {
        updateFields.previous_close = priceData.previousClose
      }
      if (priceData.dailyChangePercent !== null) {
        updateFields.daily_change_percent = priceData.dailyChangePercent
      }
      // Store detected currency from Yahoo Finance
      if (priceData.currency) {
        updateFields.currency = priceData.currency
      }

      // Update the holding
      const { error: updateError } = await supabase
        .from('holdings')
        .update(updateFields)
        .eq('id', holding.id)

      if (updateError) {
        // Fallback: try without optional columns
        const { error: fallbackError } = await supabase
          .from('holdings')
          .update({
            current_price: priceData.price,
            last_price_update: new Date().toISOString(),
          })
          .eq('id', holding.id)

        if (fallbackError) {
          errors.push({
            holdingId: holding.id,
            ticker: holding.ticker || holding.isin || '',
            error: fallbackError.message,
          })
          continue
        }
      }

      updated++

      // Track assets that need value sync
      if (holding.asset_id) {
        assetsToSync.add(`${holding.asset_id}:${holding.user_id}`)
      }
    }

    // ── Step 5: Sync parent asset values ──────────────────────────
    let assetsSynced = 0
    const assetSyncKeys = Array.from(assetsToSync)
    for (const key of assetSyncKeys) {
      const [assetId, userId] = key.split(':')
      try {
        // Aggregate all active holdings for this asset
        const { data: assetHoldings } = await supabase
          .from('holdings')
          .select('units, current_price, avg_purchase_price')
          .eq('asset_id', assetId)
          .eq('user_id', userId)
          .eq('is_active', true)

        if (assetHoldings && assetHoldings.length > 0) {
          const totalValue = assetHoldings.reduce((sum, h) => {
            const price = h.current_price ?? h.avg_purchase_price
            return sum + (price * h.units)
          }, 0)

          await supabase
            .from('assets')
            .update({ current_value: totalValue })
            .eq('id', assetId)
            .eq('user_id', userId)

          assetsSynced++
        }
      } catch {
        // Non-critical: asset sync failure doesn't fail the cron
      }
    }

    // ── Step 6: Return results ────────────────────────────────────
    const durationMs = Date.now() - startTime

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        total_holdings: holdingsWithTicker.length,
        unique_tickers: tickerMap.size,
        updated,
        stale,
        skipped,
        errors: errors.length,
        assets_synced: assetsSynced,
      },
      duration_ms: durationMs,
      ...(errors.length > 0 ? { errors } : {}),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({
      error: message,
      duration_ms: Date.now() - startTime,
    }, { status: 500 })
  }
}

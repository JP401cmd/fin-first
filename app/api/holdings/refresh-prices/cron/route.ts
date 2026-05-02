import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { fetchPriceData } from '@/lib/price-feed'
import { fetchCoinPricesEurBatch } from '@/lib/integrations/coingecko-client'
import { syncAllExchangeConnections } from '@/lib/integrations/exchange-cron'
import { syncAllWalletAddresses } from '@/lib/integrations/wallet-cron'

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
 * Behaviour (post-P2):
 * - Loops over BOTH `investment_holdings` and `crypto_holdings`.
 * - Investment side uses Yahoo Finance, deduplicating tickers across users.
 * - Crypto side tries Yahoo `{symbol}-EUR` first, falls back to a single
 *   batched CoinGecko request for the long-tail symbols Yahoo can't price.
 * - Persists day-close in `investment_holding_prices` / `crypto_holding_prices`.
 * - Syncs parent asset values from the typed rollup helpers.
 *
 * Recommended schedule: hourly during market hours (08:00-22:00 CET) to cover
 * European, US, and crypto markets.
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

  // Cast to the loosely-typed `SupabaseClient` so the helpers below can call
  // `.from('investment_holdings')` without the strict default-schema generics
  // collapsing the row shape to `never`.
  const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey) as unknown as SupabaseClient

  try {
    // ── Step 1: Investment holdings refresh ───────────────────────
    const investmentSummary = await refreshInvestmentHoldings(supabase)

    // ── Step 2: Crypto holdings refresh ───────────────────────────
    const cryptoSummary = await refreshCryptoHoldings(supabase)

    // ── Step 3: Sync exchange connections (W1.2) ──────────────────
    // Runs AFTER price refresh so the asset-value rollup inside each sync
    // sees the latest crypto quotes. Failures here never abort the cron;
    // they are recorded in `external_data_sources`.
    let exchangeResult
    try {
      exchangeResult = await syncAllExchangeConnections(supabase)
    } catch (err) {
      exchangeResult = {
        total: 0, ok: 0, failed: 0, skipped: 0,
        errors: [{ connectionId: '*', error: err instanceof Error ? err.message : 'unknown' }],
      }
    }

    // ── Step 4: Sync on-chain wallet addresses (W1.3) ─────────────
    let walletResult
    try {
      walletResult = await syncAllWalletAddresses(supabase)
    } catch (err) {
      walletResult = {
        total: 0, ok: 0, failed: 0,
        errors: [{ walletId: '*', error: err instanceof Error ? err.message : 'unknown' }],
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        investment: investmentSummary,
        crypto: cryptoSummary,
        exchanges: exchangeResult,
        wallets: walletResult,
      },
      duration_ms: Date.now() - startTime,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({
      error: message,
      duration_ms: Date.now() - startTime,
    }, { status: 500 })
  }
}

interface BucketSummary {
  total: number
  unique_tickers: number
  updated: number
  stale: number
  skipped: number
  errors: number
  assets_synced: number
}

async function refreshInvestmentHoldings(supabase: SupabaseClient): Promise<BucketSummary> {
  const summary: BucketSummary = { total: 0, unique_tickers: 0, updated: 0, stale: 0, skipped: 0, errors: 0, assets_synced: 0 }

  const { data: rows, error } = await supabase
    .from('investment_holdings')
    .select('id, user_id, asset_id, ticker, isin, current_price')
    .eq('is_active', true)
    .or('ticker.neq.null,isin.neq.null')

  if (error || !rows) return summary
  summary.total = rows.length

  // Deduplicate tickers to minimise Yahoo calls.
  const tickerToHoldings = new Map<string, Array<typeof rows[number]>>()
  for (const h of rows) {
    const t = ((h.ticker as string | null) || (h.isin as string | null) || '').trim().toUpperCase()
    if (!t) {
      summary.skipped++
      continue
    }
    const list = tickerToHoldings.get(t) ?? []
    list.push(h)
    tickerToHoldings.set(t, list)
  }
  summary.unique_tickers = tickerToHoldings.size

  const tickers = Array.from(tickerToHoldings.keys())
  const priceResults = new Map<string, Awaited<ReturnType<typeof fetchPriceData>>>()
  for (const t of tickers) {
    const data = await fetchPriceData(t)
    priceResults.set(t, data)
    if (data?.source === 'yahoo_finance') {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  const assetsToSync = new Set<string>()

  for (const [ticker, holdings] of tickerToHoldings.entries()) {
    const priceData = priceResults.get(ticker)
    if (!priceData) {
      summary.stale += holdings.length
      continue
    }

    const today = new Date().toISOString().slice(0, 10)
    for (const h of holdings) {
      const updateFields: Record<string, unknown> = {
        current_price: priceData.price,
        last_price_update: new Date().toISOString(),
      }
      if (priceData.previousClose !== null) updateFields.previous_close = priceData.previousClose
      if (priceData.dailyChangePercent !== null) updateFields.daily_change_percent = priceData.dailyChangePercent
      if (priceData.currency) updateFields.currency = priceData.currency

      const { error: upErr } = await supabase
        .from('investment_holdings')
        .update(updateFields)
        .eq('id', h.id as string)

      if (upErr) {
        summary.errors++
        continue
      }
      summary.updated++
      if (h.asset_id) assetsToSync.add(`${h.asset_id}:${h.user_id}`)

      await supabase
        .from('investment_holding_prices')
        .upsert(
          {
            holding_id: h.id as string,
            date: today,
            close_price: priceData.price,
            currency: priceData.currency || 'EUR',
            source: 'yahoo_finance',
          },
          { onConflict: 'holding_id,date' },
        )
    }
  }

  // Roll up parent assets
  for (const key of assetsToSync) {
    const [assetId, userId] = key.split(':')
    try {
      const { data: assetHoldings } = await supabase
        .from('investment_holdings')
        .select('units, current_price, avg_purchase_price')
        .eq('asset_id', assetId)
        .eq('user_id', userId)
        .eq('is_active', true)

      if (assetHoldings && assetHoldings.length > 0) {
        const totalValue = assetHoldings.reduce((sum, h) => {
          const price = (h.current_price as number | null) ?? (h.avg_purchase_price as number | null) ?? 0
          const units = (h.units as number) ?? 0
          return sum + price * units
        }, 0)
        await supabase
          .from('assets')
          .update({ current_value: totalValue })
          .eq('id', assetId)
          .eq('user_id', userId)
        summary.assets_synced++
      }
    } catch {
      // Non-critical
    }
  }

  return summary
}

async function refreshCryptoHoldings(supabase: SupabaseClient): Promise<BucketSummary> {
  const summary: BucketSummary = { total: 0, unique_tickers: 0, updated: 0, stale: 0, skipped: 0, errors: 0, assets_synced: 0 }

  const { data: rows, error } = await supabase
    .from('crypto_holdings')
    .select('id, user_id, asset_id, symbol, current_price, is_fiat_balance')
    .eq('is_active', true)

  if (error || !rows) return summary
  summary.total = rows.length

  // Group by symbol for one Yahoo + one CoinGecko fetch per symbol.
  const symbolToHoldings = new Map<string, Array<typeof rows[number]>>()
  for (const h of rows) {
    if ((h.is_fiat_balance as boolean | null) === true) {
      summary.skipped++
      continue
    }
    const sym = ((h.symbol as string | null) || '').trim().toUpperCase()
    if (!sym) {
      summary.skipped++
      continue
    }
    const list = symbolToHoldings.get(sym) ?? []
    list.push(h)
    symbolToHoldings.set(sym, list)
  }
  summary.unique_tickers = symbolToHoldings.size

  const symbols = Array.from(symbolToHoldings.keys())
  const yahooResults = new Map<string, Awaited<ReturnType<typeof fetchPriceData>>>()
  const yahooMisses: string[] = []

  for (const sym of symbols) {
    const data = await fetchPriceData(`${sym}-EUR`)
    yahooResults.set(sym, data)
    if (!data) yahooMisses.push(sym)
    if (data?.source === 'yahoo_finance') {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  const cgPrices = yahooMisses.length > 0
    ? await fetchCoinPricesEurBatch(yahooMisses)
    : {}

  const assetsToSync = new Set<string>()
  const today = new Date().toISOString().slice(0, 10)

  for (const [sym, holdings] of symbolToHoldings.entries()) {
    const yahooData = yahooResults.get(sym) ?? null
    const yahooPrice = yahooData?.price ?? null
    const yahooPriceValid = typeof yahooPrice === 'number' && Number.isFinite(yahooPrice) && yahooPrice > 0

    let price: number | null = null
    let source: 'yahoo_finance' | 'coingecko' | null = null
    if (yahooPriceValid) {
      price = yahooPrice
      source = 'yahoo_finance'
    } else {
      const cg = cgPrices[sym]
      if (typeof cg === 'number' && Number.isFinite(cg) && cg > 0) {
        price = cg
        source = 'coingecko'
      }
    }

    if (price == null || source == null) {
      summary.stale += holdings.length
      continue
    }

    for (const h of holdings) {
      const { error: upErr } = await supabase
        .from('crypto_holdings')
        .update({
          current_price: price,
          last_price_update: new Date().toISOString(),
        })
        .eq('id', h.id as string)

      if (upErr) {
        summary.errors++
        continue
      }
      summary.updated++
      if (h.asset_id) assetsToSync.add(`${h.asset_id}:${h.user_id}`)

      await supabase
        .from('crypto_holding_prices')
        .upsert(
          {
            holding_id: h.id as string,
            date: today,
            close_price: price,
            currency: 'EUR',
            source,
          },
          { onConflict: 'holding_id,date' },
        )
    }
  }

  // Roll up parent assets
  for (const key of assetsToSync) {
    const [assetId, userId] = key.split(':')
    try {
      const { data: assetHoldings } = await supabase
        .from('crypto_holdings')
        .select('units, current_price, avg_purchase_price')
        .eq('asset_id', assetId)
        .eq('user_id', userId)
        .eq('is_active', true)

      if (assetHoldings && assetHoldings.length > 0) {
        const totalValue = assetHoldings.reduce((sum, h) => {
          const price = (h.current_price as number | null) ?? (h.avg_purchase_price as number | null) ?? 0
          const units = (h.units as number) ?? 0
          return sum + price * units
        }, 0)
        await supabase
          .from('assets')
          .update({ current_value: totalValue })
          .eq('id', assetId)
          .eq('user_id', userId)
        summary.assets_synced++
      }
    } catch {
      // Non-critical
    }
  }

  return summary
}

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { fetchPriceData } from '@/lib/price-feed'
import {
  syncAssetValueFromInvestmentHoldings,
  syncAssetValueFromCryptoHoldings,
} from '@/lib/holdings-sync'
import { fetchCoinPricesEurBatch } from '@/lib/integrations/coingecko-client'

type RefreshResult = {
  id: string
  bucket: 'investment' | 'crypto'
  ticker: string | null
  status: 'updated' | 'stale' | 'skipped' | 'error'
  message?: string
  error?: string
  price?: number | null
  previousClose?: number | null
  dailyChange?: number | null
  dailyChangePercent?: number | null
  currency?: string | null
  displayName?: string | null
  current_price?: number | null
  last_price_update?: string | null
}

/**
 * POST /api/holdings/refresh-prices — Attempt to refresh prices for a user's
 * holdings across both `investment_holdings` and `crypto_holdings`.
 *
 * Investment side: Yahoo Finance keyed on `ticker` (or `isin` as fallback).
 * Crypto side: Yahoo first (`{symbol}-EUR`), CoinGecko fallback for the long
 * tail. Persisted prices land in `investment_holding_prices` resp.
 * `crypto_holding_prices` with `source` set accordingly.
 *
 * Body (optional): { holding_id?: string, bucket?: 'investment' | 'crypto' }
 *   Refresh a specific holding only — `bucket` is required when scoping to one.
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
    const bucketFilter = body?.bucket as 'investment' | 'crypto' | undefined

    const results: RefreshResult[] = []
    const investmentAssetIdsToSync = new Set<string>()
    const cryptoAssetIdsToSync = new Set<string>()

    // ── Investment holdings ────────────────────────────────────
    if (!bucketFilter || bucketFilter === 'investment') {
      let invQuery = supabase
        .from('investment_holdings')
        .select('id, asset_id, ticker, isin, name, current_price, last_price_update, units, avg_purchase_price')
        .eq('user_id', user.id)
        .eq('is_active', true)
      if (holdingId && bucketFilter === 'investment') invQuery = invQuery.eq('id', holdingId)

      const { data: invHoldings, error: invErr } = await invQuery
      if (invErr) {
        return NextResponse.json({ error: invErr.message }, { status: 500 })
      }

      for (const holding of invHoldings ?? []) {
        const result = await refreshInvestmentHolding(supabase, user.id, holding as never)
        results.push(result)
        if (result.status === 'updated' && (holding as { asset_id?: string }).asset_id) {
          investmentAssetIdsToSync.add((holding as { asset_id: string }).asset_id)
        }
      }
    }

    // ── Crypto holdings ────────────────────────────────────────
    if (!bucketFilter || bucketFilter === 'crypto') {
      let cryQuery = supabase
        .from('crypto_holdings')
        .select('id, asset_id, symbol, current_price, last_price_update, units, avg_purchase_price, is_fiat_balance')
        .eq('user_id', user.id)
        .eq('is_active', true)
      if (holdingId && bucketFilter === 'crypto') cryQuery = cryQuery.eq('id', holdingId)

      const { data: cryHoldings, error: cryErr } = await cryQuery
      if (cryErr) {
        return NextResponse.json({ error: cryErr.message }, { status: 500 })
      }

      // Pre-resolve CoinGecko prices for the symbols Yahoo can't price so we
      // batch the network call instead of one fetch per coin.
      const yahooMisses: { id: string; symbol: string }[] = []
      const yahooResults = new Map<string, Awaited<ReturnType<typeof fetchPriceData>>>()

      for (const holding of cryHoldings ?? []) {
        const h = holding as {
          id: string
          asset_id: string | null
          symbol: string | null
          is_fiat_balance: boolean | null
          current_price: number | null
        }
        if (h.is_fiat_balance) {
          // Fiat balances don't get refreshed here; EUR is pinned at 1 by sync.
          results.push({
            id: h.id, bucket: 'crypto', ticker: h.symbol,
            status: 'skipped',
            message: 'Fiat balance — geen prijsverversing',
            current_price: h.current_price,
            last_price_update: null,
          })
          continue
        }
        if (!h.symbol) {
          results.push({
            id: h.id, bucket: 'crypto', ticker: null,
            status: 'skipped',
            message: 'Geen symbol beschikbaar',
            current_price: h.current_price,
          })
          continue
        }
        const yahooTicker = `${h.symbol.toUpperCase()}-EUR`
        const priceData = await fetchPriceData(yahooTicker)
        yahooResults.set(h.id, priceData)
        if (!priceData) yahooMisses.push({ id: h.id, symbol: h.symbol.toUpperCase() })
      }

      const cgPrices = yahooMisses.length > 0
        ? await fetchCoinPricesEurBatch(yahooMisses.map((m) => m.symbol))
        : {}

      for (const holding of cryHoldings ?? []) {
        const h = holding as {
          id: string
          asset_id: string | null
          symbol: string | null
          is_fiat_balance: boolean | null
          current_price: number | null
        }
        if (h.is_fiat_balance || !h.symbol) continue

        const yahooData = yahooResults.get(h.id) ?? null
        const cgPrice = cgPrices[h.symbol.toUpperCase()]
        const result = await persistCryptoPrice(supabase, user.id, h.id, h.symbol, yahooData, cgPrice)
        results.push(result)
        if (result.status === 'updated' && h.asset_id) {
          cryptoAssetIdsToSync.add(h.asset_id)
        }
      }
    }

    // ── Roll up parent assets ──────────────────────────────────
    for (const assetId of investmentAssetIdsToSync) {
      await syncAssetValueFromInvestmentHoldings(supabase, assetId, user.id)
    }
    for (const assetId of cryptoAssetIdsToSync) {
      await syncAssetValueFromCryptoHoldings(supabase, assetId, user.id)
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

async function refreshInvestmentHolding(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  holding: {
    id: string
    asset_id: string | null
    ticker: string | null
    isin: string | null
    current_price: number | null
    last_price_update: string | null
  },
): Promise<RefreshResult> {
  if (!holding.ticker && !holding.isin) {
    return {
      id: holding.id,
      bucket: 'investment',
      ticker: null,
      status: 'skipped',
      message: 'Geen ticker of ISIN beschikbaar',
      current_price: holding.current_price,
      last_price_update: holding.last_price_update,
    }
  }

  let priceData: Awaited<ReturnType<typeof fetchPriceData>> = null
  try {
    priceData = await fetchPriceData(holding.ticker || holding.isin || '')
  } catch {
    return {
      id: holding.id,
      bucket: 'investment',
      ticker: holding.ticker,
      status: 'stale',
      message: 'Prijsfeed niet bereikbaar — laatste bekende prijs wordt getoond',
      current_price: holding.current_price,
      last_price_update: holding.last_price_update,
    }
  }

  if (!priceData) {
    return {
      id: holding.id,
      bucket: 'investment',
      ticker: holding.ticker,
      status: 'stale',
      message: 'Prijsfeed niet beschikbaar — laatste bekende prijs wordt getoond',
      current_price: holding.current_price,
      last_price_update: holding.last_price_update,
    }
  }

  const updateFields: Record<string, unknown> = {
    current_price: priceData.price,
    last_price_update: new Date().toISOString(),
  }
  if (priceData.previousClose !== null) updateFields.previous_close = priceData.previousClose
  if (priceData.dailyChangePercent !== null) updateFields.daily_change_percent = priceData.dailyChangePercent
  if (priceData.currency) updateFields.currency = priceData.currency

  const { error: updateError } = await supabase
    .from('investment_holdings')
    .update(updateFields)
    .eq('id', holding.id)
    .eq('user_id', userId)

  if (updateError) {
    return {
      id: holding.id,
      bucket: 'investment',
      ticker: holding.ticker,
      status: 'error',
      error: 'Kon prijs niet opslaan',
      current_price: holding.current_price,
      last_price_update: holding.last_price_update,
    }
  }

  // Persist day-close in investment_holding_prices for charts. Best-effort.
  const today = new Date().toISOString().slice(0, 10)
  await supabase
    .from('investment_holding_prices')
    .upsert(
      {
        holding_id: holding.id,
        date: today,
        close_price: priceData.price,
        currency: priceData.currency || 'EUR',
        source: priceData.source === 'cache' ? 'yahoo_finance' : priceData.source,
      },
      { onConflict: 'holding_id,date' },
    )

  return {
    id: holding.id,
    bucket: 'investment',
    ticker: holding.ticker,
    status: 'updated',
    price: priceData.price,
    previousClose: priceData.previousClose,
    dailyChange: priceData.dailyChange,
    dailyChangePercent: priceData.dailyChangePercent,
    currency: priceData.currency,
    displayName: priceData.displayName,
    last_price_update: new Date().toISOString(),
  }
}

async function persistCryptoPrice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  holdingId: string,
  symbol: string,
  yahooData: Awaited<ReturnType<typeof fetchPriceData>> | null,
  cgPrice: number | undefined,
): Promise<RefreshResult> {
  const yahooPrice = yahooData?.price ?? null
  const yahooPriceValid = typeof yahooPrice === 'number' && Number.isFinite(yahooPrice) && yahooPrice > 0

  let price: number | null = null
  let source: 'yahoo_finance' | 'coingecko' | null = null
  if (yahooPriceValid) {
    price = yahooPrice
    source = 'yahoo_finance'
  } else if (typeof cgPrice === 'number' && Number.isFinite(cgPrice) && cgPrice > 0) {
    price = cgPrice
    source = 'coingecko'
  }

  if (price == null || source == null) {
    return {
      id: holdingId,
      bucket: 'crypto',
      ticker: symbol,
      status: 'stale',
      message: 'Prijsfeed niet beschikbaar — laatste bekende prijs wordt getoond',
    }
  }

  const updateFields: Record<string, unknown> = {
    current_price: price,
    last_price_update: new Date().toISOString(),
  }
  if (source === 'yahoo_finance' && yahooData) {
    if (yahooData.previousClose !== null) updateFields.previous_close = yahooData.previousClose
    if (yahooData.dailyChangePercent !== null) updateFields.daily_change_percent = yahooData.dailyChangePercent
  }

  const { error: updateError } = await supabase
    .from('crypto_holdings')
    .update(updateFields)
    .eq('id', holdingId)
    .eq('user_id', userId)

  if (updateError) {
    // crypto_holdings doesn't have previous_close / daily_change_percent columns;
    // retry without them so we still persist the price even when the optional
    // columns reject the write.
    const { error: fallbackErr } = await supabase
      .from('crypto_holdings')
      .update({
        current_price: price,
        last_price_update: new Date().toISOString(),
      })
      .eq('id', holdingId)
      .eq('user_id', userId)

    if (fallbackErr) {
      return {
        id: holdingId,
        bucket: 'crypto',
        ticker: symbol,
        status: 'error',
        error: 'Kon prijs niet opslaan',
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  await supabase
    .from('crypto_holding_prices')
    .upsert(
      {
        holding_id: holdingId,
        date: today,
        close_price: price,
        currency: 'EUR',
        source,
      },
      { onConflict: 'holding_id,date' },
    )

  return {
    id: holdingId,
    bucket: 'crypto',
    ticker: symbol,
    status: 'updated',
    price,
    currency: 'EUR',
    last_price_update: new Date().toISOString(),
  }
}

/**
 * PATCH /api/holdings/refresh-prices — Manual price override for a single holding.
 *
 * Body: { holding_id: string, price: number, bucket: 'investment' | 'crypto' }
 * Updates the holding's current_price + last_price_update across the correct
 * typed table. `bucket` defaults to 'investment' for back-compat with older UI
 * code that doesn't yet pass it.
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
    const bucket = (body.bucket === 'crypto' ? 'crypto' : 'investment') as 'investment' | 'crypto'

    if (!holding_id || typeof holding_id !== 'string') {
      return NextResponse.json({ error: 'holding_id is verplicht' }, { status: 400 })
    }

    if (price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0) {
      return NextResponse.json({ error: 'Prijs moet een positief getal zijn' }, { status: 400 })
    }

    const table = bucket === 'crypto' ? 'crypto_holdings' : 'investment_holdings'

    const { data: holding, error } = await supabase
      .from(table)
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

    if (holding.asset_id) {
      if (bucket === 'crypto') {
        await syncAssetValueFromCryptoHoldings(supabase, holding.asset_id, user.id)
      } else {
        await syncAssetValueFromInvestmentHoldings(supabase, holding.asset_id, user.id)
      }
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

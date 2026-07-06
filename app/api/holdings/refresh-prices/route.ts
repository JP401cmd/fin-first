import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { fetchPriceData, resolveYahooSymbol } from '@/lib/price-feed'
import { fetchBatchForexRates, getEURRateSync } from '@/lib/forex'
import {
  syncAssetValueFromInvestmentHoldings,
  syncAssetValueFromCryptoHoldings,
} from '@/lib/holdings-sync'
import { fetchCoinPricesEurBatch } from '@/lib/integrations/coingecko-client'

// Deze route doet externe Yahoo/CoinGecko/forex-calls per holding. Op Vercel
// Hobby is 60s de max toegestane functieduur; zonder deze regel valt de
// serverless-functie terug op de (veel kortere) default en breekt de client-
// request af nog vóór de trage lange-staart-holdings geprijsd zijn.
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Map over `items` met GEBONDEN concurrency (pool van `limit` tegelijk).
 *
 * We parallelliseren de per-holding refresh om de wall-clock te bekorten, maar
 * NIET met een onbeperkte `Promise.all`: dat zou tientallen holdings tegelijk
 * in-flight zetten. De rate-limiter zelf bewaakt de duurzame 5/s-grens — sinds
 * `acquireRateLimitTokenBlocking` in `lib/price-feed.ts` wacht een aanroeper bij
 * een lege bucket kort op capaciteit i.p.v. instant `null` (vals-"stale") terug
 * te geven, dus de échte bound is de refill-rate, niet de poolgrootte. De pool
 * van ~4 begrenst enkel het geheugen/aantal gelijktijdige holdings en houdt de
 * wachttijden per holding kort; hoger mag, maar levert weinig extra doorstroom
 * omdat de blocking-acquire alles alsnog op 5/s serialiseert. Resultaten komen
 * index-geordend terug zodat de aanroeper ze veilig ná de pool-afronding kan
 * samenvoegen (geen gedeelde-state-interleaving).
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  }
  const poolSize = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: poolSize }, () => worker()))
  return results
}

/** Aantal holdings dat we tegelijk verversen — zie `mapWithConcurrency`. */
const REFRESH_CONCURRENCY = 4

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
        .select('id, asset_id, ticker, isin, name, currency, current_price, last_price_update, units, avg_purchase_price')
        .eq('user_id', user.id)
        .eq('is_active', true)
      if (holdingId && bucketFilter === 'investment') invQuery = invQuery.eq('id', holdingId)

      const { data: invHoldings, error: invErr } = await invQuery
      if (invErr) {
        return NextResponse.json({ error: invErr.message }, { status: 500 })
      }

      // Parallelliseer per holding met gebonden concurrency (zie
      // `mapWithConcurrency`). Resultaten + asset-sync-ids worden index-geordend
      // teruggegeven en pas ná de pool samengevoegd, zodat de gedeelde
      // `results`-array en de sync-Set thread-safe gevuld blijven.
      const invOutcomes = await mapWithConcurrency(
        invHoldings ?? [],
        REFRESH_CONCURRENCY,
        async (holding): Promise<{ result: RefreshResult; assetIdToSync: string | null }> => {
          const h = holding as {
            id: string
            ticker: string | null
            units: number | string | null
            current_price: number | null
          }
          // Gesloten positie (0 stuks) → geen koers nodig; de waarde is 0. Scheelt
          // ook Yahoo-calls op de lange staart aan volledig verkochte posities.
          if (Math.abs(Number(h.units) || 0) < 1e-9) {
            return {
              result: {
                id: h.id,
                bucket: 'investment',
                ticker: h.ticker,
                status: 'skipped',
                message: 'Gesloten positie (0 stuks)',
                current_price: h.current_price,
              },
              assetIdToSync: null,
            }
          }
          const result = await refreshInvestmentHolding(supabase, user.id, holding as never)
          const assetId = (holding as { asset_id?: string }).asset_id
          return {
            result,
            assetIdToSync: result.status === 'updated' && assetId ? assetId : null,
          }
        },
      )

      for (const { result, assetIdToSync } of invOutcomes) {
        results.push(result)
        if (assetIdToSync) investmentAssetIdsToSync.add(assetIdToSync)
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

      // Classificeer eerst synchroon (skips) en verzamel wat écht een Yahoo-
      // call nodig heeft; vuur die daarna met gebonden concurrency af.
      const cryToFetch: { id: string; yahooTicker: string; symbolUpper: string }[] = []
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
        const symbolUpper = h.symbol.toUpperCase()
        cryToFetch.push({ id: h.id, yahooTicker: `${symbolUpper}-EUR`, symbolUpper })
      }

      const cryFetched = await mapWithConcurrency(
        cryToFetch,
        REFRESH_CONCURRENCY,
        async (f) => ({ id: f.id, symbolUpper: f.symbolUpper, data: await fetchPriceData(f.yahooTicker) }),
      )
      for (const f of cryFetched) {
        yahooResults.set(f.id, f.data)
        if (!f.data) yahooMisses.push({ id: f.id, symbol: f.symbolUpper })
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
    const errors = results.filter(r => r.status === 'error').length

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        updated,
        stale,
        skipped,
        errors,
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
    name: string | null
    currency: string | null
    current_price: number | null
    last_price_update: string | null
  },
): Promise<RefreshResult> {
  if (!holding.ticker && !holding.isin && !holding.name) {
    return {
      id: holding.id,
      bucket: 'investment',
      ticker: null,
      status: 'skipped',
      message: 'Geen ticker, ISIN of naam beschikbaar',
      current_price: holding.current_price,
      last_price_update: holding.last_price_update,
    }
  }

  // Koers-resolutie. Probeer eerst de opgeslagen ticker; faalt die (bij broker-
  // imports is de "ticker" vaak de productnaam, geen beurssymbool), resolve dan
  // via Yahoo-search op ISIN — en als laatste redmiddel op de naam — naar een
  // echt symbool, en prijs daarop. Het gevonden symbool wordt opgeslagen zodat
  // een volgende refresh direct prijst.
  let priceData: Awaited<ReturnType<typeof fetchPriceData>> = null
  let resolvedTicker: string | null = null
  try {
    if (holding.ticker) {
      priceData = await fetchPriceData(holding.ticker)
    }
    if (!priceData) {
      const symbol =
        (holding.isin ? await resolveYahooSymbol(holding.isin) : null) ||
        (holding.name ? await resolveYahooSymbol(holding.name) : null)
      if (symbol) {
        const bySymbol = await fetchPriceData(symbol)
        if (bySymbol) {
          priceData = bySymbol
          resolvedTicker = symbol
        }
      }
    }
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

  // EUR-normalisatie. Een EUR-gedenomineerde holding (kostbasis in EUR — zoals
  // alle DEGIRO-imports) met een niet-EUR Yahoo-koers (US-aandelen → USD) wordt
  // omgerekend naar EUR, zodat waarde én rendement consistent blijven met de
  // (EUR) transactie-kostbasis. Holdings met een eigen native currency laten we
  // ongemoeid — de loader rekent die zelf om via forex.
  let price = priceData.price
  let previousClose = priceData.previousClose
  let storeCurrency = priceData.currency
  const holdingCur = (holding.currency ?? 'EUR').toUpperCase()
  const priceCur = (priceData.currency ?? holdingCur).toUpperCase()
  if (holdingCur === 'EUR' && priceCur !== 'EUR') {
    await fetchBatchForexRates([priceCur])
    const rate = getEURRateSync(priceCur)
    if (rate > 0) {
      price = priceData.price * rate
      previousClose = priceData.previousClose != null ? priceData.previousClose * rate : null
      storeCurrency = 'EUR'
    }
  }

  const updateFields: Record<string, unknown> = {
    current_price: price,
    last_price_update: new Date().toISOString(),
  }
  // Bewaar het via ISIN/naam gevonden symbool zodat een volgende refresh direct
  // prijst (en de detail-/lijst-UI een net symbool toont i.p.v. de productnaam).
  if (resolvedTicker) updateFields.ticker = resolvedTicker
  if (previousClose !== null) updateFields.previous_close = previousClose
  if (priceData.dailyChangePercent !== null) updateFields.daily_change_percent = priceData.dailyChangePercent
  if (storeCurrency) updateFields.currency = storeCurrency

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
        close_price: price,
        currency: storeCurrency || 'EUR',
        source: priceData.source === 'cache' ? 'yahoo_finance' : priceData.source,
      },
      { onConflict: 'holding_id,date' },
    )

  return {
    id: holding.id,
    bucket: 'investment',
    ticker: resolvedTicker ?? holding.ticker,
    status: 'updated',
    price,
    previousClose,
    dailyChange: priceData.dailyChange,
    dailyChangePercent: priceData.dailyChangePercent,
    currency: storeCurrency,
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

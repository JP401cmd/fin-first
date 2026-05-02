// Persistence layer that bridges an `ExchangeAdapter` (which knows how to talk
// to one exchange) and the local `crypto_holdings` table for ONE pre-existing
// asset.
//
// Mapping rules (post-P2 — strict 1-on-1 + typed crypto schema):
//   • The caller passes the target `assetId` plus the originating `connectionId`.
//     The asset MUST already exist and belong to the calling user; the connect-
//     route validates this before persisting the connection. We never create
//     assets here.
//   • One row in `crypto_holdings` per non-zero symbol on the exchange.
//     `units = available + inOrder`. Fiat balances (EUR/USD/GBP) are persisted
//     too, marked with `is_fiat_balance=true` so the rollup keeps showing the
//     full exchange value.
//   • Re-sync is idempotent: rows are upserted on `(asset_id, symbol)` (the
//     UNIQUE INDEX `crypto_holdings_dedup_uidx`). Symbols that disappear from
//     the exchange are deactivated (units=0, is_active=false) — never deleted,
//     so historical transactions remain attached.
//   • `source_exchange_connection_id` is stamped on every row so the UI can
//     show a "Bitvavo" badge per coin and link back to /identity/koppelingen.
//   • Yahoo Finance is tried first for `{SYMBOL}-EUR`. CoinGecko backfills the
//     long tail (ADA, BNB, AVAX, TIA, INJ, …) — its prices land in
//     `crypto_holding_prices` with `source='coingecko'`.
//   • F2 trades-import: for each non-fiat holding we pull recent trades from
//     the adapter (Bitvavo only at the moment) and upsert them into
//     `crypto_transactions` with onConflict (external_source, external_trade_id)
//     so re-syncs don't duplicate. Throttled to ~5 markets/sec to stay under
//     Bitvavo's 1000 weight/min limit.

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPriceData } from '@/lib/price-feed'
import { syncAssetValueFromCryptoHoldings } from '@/lib/holdings-sync'
import {
  fetchCoinPricesEurBatch,
  fetchMarketChartEur,
  SYMBOL_TO_COINGECKO_ID,
} from './coingecko-client'
import { fetchTrades, fetchAvailableMarkets } from './bitvavo-client'
import { fetchHistoricalPrices } from '@/lib/historical-prices'
import type { ExchangeAdapter, ExchangeBalance } from './exchange-adapter'

export interface SyncOutcome {
  itemsSynced: number
  itemsDeactivated: number
  tradesImported: number
  /**
   * Aantal markten waarvoor de Bitvavo trades-fetch faalde. Wanneer >0 én
   * `tradesImported === 0` is dit een sterk signaal dat de API-key geen
   * "View information" + "Trade History" permissies heeft, of dat er een
   * andere blocking-fout op de /v2/trades endpoint optreedt. De caller
   * geeft dit door als `last_sync_error` op de connectie zodat de gebruiker
   * geen lege "succesvolle" sync ziet.
   */
  tradesFetchErrorCount: number
  /** Eerste foutmelding uit de trades-fetch (max 1 stuk, voor leesbaarheid). */
  tradesFetchSampleError?: string
  assetId: string
  totalValueEur: number
}

const FIAT_SYMBOLS = new Set(['EUR', 'USD', 'GBP'])

function symbolToYahooTicker(symbol: string): string {
  const s = symbol.toUpperCase()
  if (s === 'EUR') return 'EUR'
  return `${s}-EUR`
}

interface CurrentCryptoHolding {
  id: string
  symbol: string
  is_active: boolean
}

/**
 * Synchronises the exchange balances into `crypto_holdings` rows under the
 * asset that the connection points at. Pure side-effect on the DB; the caller
 * is responsible for writing the audit row to `external_data_sources` and for
 * updating the connection's `last_synced_at` / `last_sync_error`.
 *
 * `connectionId` is required so freshly upserted holdings get a non-null
 * `source_exchange_connection_id` for the UI bron-badge.
 */
export async function syncExchangeBalances(params: {
  supabase: SupabaseClient
  userId: string
  assetId: string
  connectionId: string
  adapter: ExchangeAdapter
  apiKey: string
  apiSecret: string
}): Promise<SyncOutcome> {
  const { supabase, userId, assetId, connectionId, adapter, apiKey, apiSecret } = params

  const balances: ExchangeBalance[] = await adapter.fetchBalances(apiKey, apiSecret)

  // Pull current crypto-holdings under this asset so we can upsert + soft-delete
  // in one pass without an extra round-trip per symbol.
  const { data: existingRows } = await supabase
    .from('crypto_holdings')
    .select('id, symbol, is_active')
    .eq('user_id', userId)
    .eq('asset_id', assetId)

  const existing: CurrentCryptoHolding[] = (existingRows ?? []) as CurrentCryptoHolding[]
  const bySymbol = new Map<string, CurrentCryptoHolding>()
  for (const h of existing) {
    if (h.symbol) bySymbol.set(h.symbol.toUpperCase(), h)
  }

  const seenSymbols = new Set<string>()
  let itemsSynced = 0

  for (const b of balances) {
    const units = b.available + b.inOrder
    if (units <= 0) continue

    const symbol = b.symbol.toUpperCase()
    seenSymbols.add(symbol)
    const isFiat = FIAT_SYMBOLS.has(symbol)

    let priceEur: number | null = null
    if (isFiat) {
      // EUR balances are 1:1; non-EUR fiat is left for the next refresh pass
      // to resolve via Yahoo (USDEUR=X / GBPEUR=X). Manual entries can override.
      priceEur = symbol === 'EUR' ? 1 : null
    } else {
      const priceData = await fetchPriceData(symbolToYahooTicker(symbol))
      priceEur = priceData?.price ?? null
    }

    const baseFields: Record<string, unknown> = {
      user_id: userId,
      asset_id: assetId,
      symbol,
      name: symbol,
      units,
      units_in_order: b.inOrder,
      is_fiat_balance: isFiat,
      is_active: true,
      source_exchange_connection_id: connectionId,
      last_price_update: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (priceEur != null) baseFields.current_price = priceEur

    const found = bySymbol.get(symbol)
    if (found) {
      const { error } = await supabase
        .from('crypto_holdings')
        .update(baseFields)
        .eq('id', found.id)
        .eq('user_id', userId)
      if (error) continue
      itemsSynced++
    } else {
      // Use upsert on (asset_id, symbol) so a concurrent sync from another
      // request can't double-insert the same coin.
      const insertFields = {
        ...baseFields,
        avg_purchase_price: priceEur ?? null,
      }
      const { error } = await supabase
        .from('crypto_holdings')
        .upsert(insertFields, { onConflict: 'asset_id,symbol' })
      if (error) continue
      itemsSynced++
    }
  }

  let itemsDeactivated = 0
  for (const h of existing) {
    if (!h.symbol) continue
    if (seenSymbols.has(h.symbol.toUpperCase())) continue
    if (!h.is_active) continue
    const { error } = await supabase
      .from('crypto_holdings')
      .update({ units: 0, is_active: false })
      .eq('id', h.id)
      .eq('user_id', userId)
    if (!error) itemsDeactivated++
  }

  await backfillMissingPricesViaCoinGecko({ supabase, userId, assetId })

  // Yahoo Finance historie (1 jaar) per holding — voedt sparkline en
  // value-history-chart op de holdings-overzicht/detail-pagina. Voor obscure
  // tokens zonder Yahoo-pair retourneert `fetchHistoricalPrices` een lege
  // array; dat zien we als "skip" zonder error.
  await backfillCryptoPriceHistory({ supabase, userId, assetId })

  // F2 — Bitvavo trades import. Only Bitvavo exposes the necessary endpoint
  // through our adapter today; Kraken/Coinbase return 0 trades and the cost
  // is one Map-lookup so we don't gate this on adapter.name explicitly here.
  let tradesImported = 0
  let tradesFetchErrorCount = 0
  let tradesFetchSampleError: string | undefined
  if (adapter.name === 'bitvavo') {
    const result = await importBitvavoTrades({
      supabase,
      userId,
      assetId,
      apiKey,
      apiSecret,
    })
    tradesImported = result.inserted
    tradesFetchErrorCount = result.errorCount
    tradesFetchSampleError = result.sampleError
  }

  const { totalValue } = await syncAssetValueFromCryptoHoldings(supabase, assetId, userId)
  return {
    itemsSynced,
    itemsDeactivated,
    tradesImported,
    tradesFetchErrorCount,
    tradesFetchSampleError,
    assetId,
    totalValueEur: totalValue,
  }
}

interface MissingPriceCryptoHolding {
  id: string
  symbol: string | null
  current_price: number | null
}

/**
 * Second-pass price fill for crypto holdings whose `{SYMBOL}-EUR` ticker isn't
 * carried by Yahoo Finance (ADA, BNB, AVAX, TIA, INJ, APE, HOT, LUNA2, ROSE…).
 * Looks them up on CoinGecko in one batched request and writes:
 *   • `crypto_holdings.current_price` + `last_price_update`
 *   • a `crypto_holding_prices` row tagged `source = 'coingecko'` for today
 *
 * Symbols CoinGecko also doesn't know about are left untouched, preserving any
 * existing manual price.
 */
async function backfillMissingPricesViaCoinGecko(params: {
  supabase: SupabaseClient
  userId: string
  assetId: string
}): Promise<void> {
  const { supabase, userId, assetId } = params

  const { data, error } = await supabase
    .from('crypto_holdings')
    .select('id, symbol, current_price, is_fiat_balance')
    .eq('user_id', userId)
    .eq('asset_id', assetId)
    .eq('is_active', true)

  if (error || !data) return

  const candidates: { id: string; symbol: string }[] = []
  for (const row of data as (MissingPriceCryptoHolding & { is_fiat_balance: boolean | null })[]) {
    if (!row.symbol) continue
    if (row.is_fiat_balance) continue
    if (row.current_price != null && row.current_price > 0) continue
    const symbol = row.symbol.toUpperCase()
    if (!symbol) continue
    candidates.push({ id: row.id, symbol })
  }

  if (!candidates.length) return

  const uniqueSymbols = Array.from(new Set(candidates.map((c) => c.symbol)))
  const prices = await fetchCoinPricesEurBatch(uniqueSymbols)
  if (!Object.keys(prices).length) return

  const today = new Date().toISOString().slice(0, 10)
  const nowIso = new Date().toISOString()

  for (const { id, symbol } of candidates) {
    const price = prices[symbol]
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) continue

    const { error: updateErr } = await supabase
      .from('crypto_holdings')
      .update({
        current_price: price,
        last_price_update: nowIso,
      })
      .eq('id', id)
      .eq('user_id', userId)
    if (updateErr) continue

    await supabase
      .from('crypto_holding_prices')
      .upsert(
        {
          holding_id: id,
          date: today,
          close_price: price,
          currency: 'EUR',
          source: 'coingecko',
        },
        { onConflict: 'holding_id,date' },
      )
  }
}

/**
 * Backfill 1 jaar daily-close prijzen voor elke crypto-holding. Voedt
 * sparkline op de holdings-overzicht en de value-history-grafiek op de
 * detail-page.
 *
 * Twee bronnen, in volgorde:
 *  1. **Yahoo Finance** via `{SYMBOL}-EUR` — sneller en goed voor de top-50
 *     liquide coins (BTC, ETH, ADA, AVAX, BNB, SHIB, …).
 *  2. **CoinGecko** als fallback wanneer Yahoo geen data heeft, gebruik
 *     makend van de bestaande `SYMBOL_TO_COINGECKO_ID`-resolver. Vangt
 *     coins op zoals HOT, INJ, FET, TIA, APE, LUNA2 die wel een liquide
 *     CoinGecko-listing hebben maar geen Yahoo-pair.
 *
 * Coins waarvoor beide bronnen leeg zijn (echte exotics zoals 2Z, AI,
 * USELESS, OPEN, W, YB) blijven zonder historie — sparkline rendert dan
 * de leeg-staat-streep. Geen error.
 *
 * Idempotent via unique index op (holding_id, date); throttled met
 * 5-concurrent / 1s-pauze cadence om externe rate limits te respecteren.
 */
async function backfillCryptoPriceHistory(params: {
  supabase: SupabaseClient
  userId: string
  assetId: string
}): Promise<void> {
  const { supabase, userId, assetId } = params

  const { data: holdingsRaw } = await supabase
    .from('crypto_holdings')
    .select('id, symbol, is_fiat_balance')
    .eq('user_id', userId)
    .eq('asset_id', assetId)
    .eq('is_active', true)

  const holdings = ((holdingsRaw ?? []) as Array<{
    id: string
    symbol: string | null
    is_fiat_balance: boolean | null
  }>)
    .filter((h) => !h.is_fiat_balance && h.symbol)
    .map((h) => ({ id: h.id, symbol: (h.symbol as string).toUpperCase() }))

  if (!holdings.length) return

  const CONCURRENCY = 5
  for (let i = 0; i < holdings.length; i += CONCURRENCY) {
    const slice = holdings.slice(i, i + CONCURRENCY)
    await Promise.all(
      slice.map((h) => backfillOneCryptoSymbol({ supabase, holding: h })),
    )
    if (i + CONCURRENCY < holdings.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
}

async function backfillOneCryptoSymbol(params: {
  supabase: SupabaseClient
  holding: { id: string; symbol: string }
}): Promise<void> {
  const { supabase, holding } = params

  // 1. Yahoo Finance pad — `{SYMBOL}-EUR`
  try {
    const yahooPrices = await fetchHistoricalPrices(`${holding.symbol}-EUR`, '1y')
    if (yahooPrices.length > 0) {
      const rows = yahooPrices.map((p) => ({
        holding_id: holding.id,
        date: p.date,
        close_price: p.close,
        currency: 'EUR',
        source: 'yahoo_finance',
      }))
      await supabase
        .from('crypto_holding_prices')
        .upsert(rows, { onConflict: 'holding_id,date' })
      return
    }
  } catch {
    // Yahoo geeft incidenteel een 404/timeout voor obscure pairs — val
    // door naar CoinGecko.
  }

  // 2. CoinGecko fallback — alleen voor symbols in onze id-resolver
  const cgId = SYMBOL_TO_COINGECKO_ID[holding.symbol]
  if (!cgId) return

  try {
    const cgSeries = await fetchMarketChartEur(cgId, 365)
    if (cgSeries.length === 0) return

    const rows = cgSeries.map((p) => ({
      holding_id: holding.id,
      date: p.date,
      close_price: p.close,
      currency: 'EUR',
      source: 'coingecko',
    }))
    await supabase
      .from('crypto_holding_prices')
      .upsert(rows, { onConflict: 'holding_id,date' })
  } catch {
    // Beide bronnen niet beschikbaar — laat de holding zonder historie.
  }
}

interface CryptoHoldingForTrades {
  id: string
  symbol: string
}

/**
 * F2 — pulls Bitvavo trade history per holding and inserts new rows into
 * `crypto_transactions`. Idempotent via UNIQUE INDEX on
 * (external_source, external_trade_id).
 *
 * For each non-fiat holding we resolve `since` = max(date) of previously
 * imported Bitvavo trades for that holding (epoch ms) and only ask Bitvavo
 * for trades after that point. Throttled to 5 concurrent market requests via
 * a sliding window so we stay well under Bitvavo's per-second weight budget.
 */
interface TradesImportResult {
  inserted: number
  errorCount: number
  sampleError?: string
}

async function importBitvavoTrades(params: {
  supabase: SupabaseClient
  userId: string
  assetId: string
  apiKey: string
  apiSecret: string
}): Promise<TradesImportResult> {
  const { supabase, userId, assetId, apiKey, apiSecret } = params

  const { data: holdingsRaw } = await supabase
    .from('crypto_holdings')
    .select('id, symbol, is_fiat_balance')
    .eq('user_id', userId)
    .eq('asset_id', assetId)
    .eq('is_active', true)

  const allHoldings: CryptoHoldingForTrades[] = ((holdingsRaw ?? []) as Array<{
    id: string
    symbol: string | null
    is_fiat_balance: boolean | null
  }>)
    .filter((h) => !h.is_fiat_balance && h.symbol)
    .map((h) => ({ id: h.id, symbol: (h.symbol as string).toUpperCase() }))

  if (!allHoldings.length) return { inserted: 0, errorCount: 0 }

  // Filter holdings op markten die daadwerkelijk verhandelbaar zijn op
  // Bitvavo. Sommige tokens uit het account-saldo (delisted coins, airdrops)
  // hebben geen actieve `{SYMBOL}-EUR` markt; zonder deze filter zou elke
  // trade-fetch voor zo'n markt een 400/404 retourneren en de error-counter
  // onterecht vullen.
  let availableMarkets: Set<string> | null = null
  try {
    availableMarkets = await fetchAvailableMarkets()
  } catch {
    // Publieke endpoint kan kortstondig falen; we vallen terug op
    // ongefilterde fetch — Bitvavo's per-trade error blijft daarbij wel
    // zichtbaar.
    availableMarkets = null
  }
  const holdings = availableMarkets
    ? allHoldings.filter((h) => availableMarkets!.has(`${h.symbol}-EUR`))
    : allHoldings

  if (!holdings.length) return { inserted: 0, errorCount: 0 }

  let inserted = 0
  let errorCount = 0
  let sampleError: string | undefined
  const CONCURRENCY = 5

  for (let i = 0; i < holdings.length; i += CONCURRENCY) {
    const slice = holdings.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      slice.map((h) => importBitvavoTradesForHolding({ supabase, userId, holding: h, apiKey, apiSecret })),
    )
    for (const r of results) {
      inserted += r.inserted
      if (r.error) {
        errorCount++
        if (!sampleError) sampleError = r.error
      }
    }
    // Sliding-window throttle: ~1s between buckets keeps us at ~5 req/s.
    if (i + CONCURRENCY < holdings.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  return { inserted, errorCount, sampleError }
}

interface PerHoldingResult {
  inserted: number
  error?: string
}

async function importBitvavoTradesForHolding(params: {
  supabase: SupabaseClient
  userId: string
  holding: CryptoHoldingForTrades
  apiKey: string
  apiSecret: string
}): Promise<PerHoldingResult> {
  const { supabase, userId, holding, apiKey, apiSecret } = params
  const market = `${holding.symbol}-EUR`

  // Determine watermark — only fetch trades after the most recent already
  // persisted Bitvavo trade for this holding. Bitvavo's `start` filter is
  // expressed in epoch milliseconds.
  const { data: latestRow } = await supabase
    .from('crypto_transactions')
    .select('date')
    .eq('user_id', userId)
    .eq('holding_id', holding.id)
    .eq('external_source', 'bitvavo')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  let since = 0
  if (latestRow?.date) {
    const ts = new Date(latestRow.date as string).getTime()
    if (Number.isFinite(ts) && ts > 0) since = ts
  }

  let trades
  try {
    trades = await fetchTrades(apiKey, apiSecret, market, { since })
  } catch (err) {
    // Network / signing failures aborten de hele sync niet, maar we moeten
    // ze wél naar boven rapporteren — een silent catch heeft uren aan
    // debugging gekost. De caller aggregeert deze errors en schrijft ze
    // naar `last_sync_error` op de connectie zodat de UI het toont.
    const message = err instanceof Error ? err.message : String(err)
    return { inserted: 0, error: `${market}: ${message}` }
  }

  if (!trades.length) return { inserted: 0 }

  const rows = trades.map((t) => {
    const units = t.amount
    const pricePerUnit = t.price
    const dateIso = new Date(t.timestamp).toISOString().slice(0, 10)
    return {
      user_id: userId,
      holding_id: holding.id,
      type: t.side,
      units,
      price_per_unit: pricePerUnit,
      total_amount: units * pricePerUnit,
      fee_native: t.fee,
      fee_currency: t.feeCurrency || null,
      date: dateIso,
      external_source: 'bitvavo',
      external_trade_id: t.id,
    }
  })

  const { error, count } = await supabase
    .from('crypto_transactions')
    .upsert(rows, { onConflict: 'external_source,external_trade_id', count: 'exact' })

  if (error) {
    return { inserted: 0, error: `${market} upsert: ${error.message}` }
  }
  return { inserted: count ?? rows.length }
}

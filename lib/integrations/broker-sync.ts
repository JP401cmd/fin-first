// Persistence layer that bridges a `BrokerAdapter` (which knows how to talk to
// one stock broker) and the local `investment_holdings` table for ONE
// pre-existing asset. The broker twin of `exchange-sync.ts`.
//
// Mapping rules (mirror exchange-sync, strict 1-on-1 + typed investment schema):
//   • The caller passes the target `assetId` plus the originating
//     `connectionId`. The asset MUST already exist, belong to the calling user
//     and be of type 'investment'; the connect-route validates this before
//     persisting the connection. We never create assets here.
//   • One row in `investment_holdings` per non-zero position on the broker,
//     keyed case-insensitively on the ticker so a re-sync never duplicates a
//     row. `source_broker_connection_id` is stamped on every synced row so the
//     UI can show a "Trading 212" badge per holding and link back to
//     /identity/koppelingen.
//   • Re-sync idempotency is achieved WITHOUT a unique index: unlike
//     `crypto_holdings` (which has `crypto_holdings_dedup_uidx`),
//     `investment_holdings` has NO unique constraint on (asset_id, ticker).
//     We therefore CANNOT `.upsert(..., { onConflict: 'asset_id,ticker' })`
//     (no matching constraint → Postgres errors). Instead we pre-fetch the
//     existing rows, key them in memory on UPPER(ticker), and do an
//     UPDATE-if-found / plain-INSERT-if-new branch — exactly like the
//     exchange-sync `found ? update : insert` logic, but the insert branch is a
//     plain `.insert(...)` (no onConflict fallback, since there's nothing to
//     conflict on).
//   • Soft-delete is scoped per source: positions that disappear from the
//     broker are deactivated (units=0, is_active=false) — never deleted, so
//     historical transactions stay attached. We ONLY deactivate rows that this
//     same broker connection previously synced (source_broker_connection_id ===
//     connectionId). Manual/CSV holdings (source NULL or a different
//     connection) are left untouched.
//   • Price enrichment: Trading 212 returns `currentPrice`/`currency` inline
//     per position, so we consume that directly. There is NO Yahoo/CoinGecko
//     second pass — that backfill is crypto-specific (exchanges only return a
//     symbol, never a price) and is out of scope here. Positions without a
//     price are left with `current_price` null, best-effort, and never fail the
//     sync.

import type { SupabaseClient } from '@supabase/supabase-js'
import { syncAssetValueFromInvestmentHoldings } from '@/lib/holdings-sync'
import type { BrokerAdapter, BrokerPosition } from './broker-adapter'

export interface SyncOutcome {
  itemsSynced: number
  itemsDeactivated: number
  totalValueEur: number
  assetId: string
}

interface CurrentInvestmentHolding {
  id: string
  ticker: string
  is_active: boolean
  source_broker_connection_id: string | null
}

/**
 * Synchronises the broker positions into `investment_holdings` rows under the
 * asset that the connection points at. Pure side-effect on the DB; the caller
 * is responsible for writing the audit row to `external_data_sources` and for
 * updating the connection's `last_synced_at` / `last_sync_error`.
 *
 * `connectionId` is required so freshly written holdings get a non-null
 * `source_broker_connection_id` for the UI bron-badge AND so the soft-delete
 * pass can be scoped to this connection's own rows.
 */
export async function syncBrokerPositions(params: {
  supabase: SupabaseClient
  userId: string
  assetId: string
  connectionId: string
  adapter: BrokerAdapter
  apiKey: string
}): Promise<SyncOutcome> {
  const { supabase, userId, assetId, connectionId, adapter, apiKey } = params

  const positions: BrokerPosition[] = await adapter.fetchPositions(apiKey)

  // Pull current investment-holdings under this asset so we can update +
  // soft-delete in one pass without an extra round-trip per ticker. We also
  // select `source_broker_connection_id` so the deactivation pass can be
  // scoped to rows this same connection synced (see the soft-delete loop).
  const { data: existingRows } = await supabase
    .from('investment_holdings')
    .select('id, ticker, is_active, source_broker_connection_id')
    .eq('user_id', userId)
    .eq('asset_id', assetId)

  const existing: CurrentInvestmentHolding[] = (existingRows ?? []) as CurrentInvestmentHolding[]

  // Key the map case-insensitively on UPPER(ticker). `investment_holdings`
  // has NO unique index on (asset_id, ticker), so this in-memory map is the
  // ONLY thing preventing duplicate rows on re-sync — keep it the single
  // source of "have I already got this ticker?".
  const byTicker = new Map<string, CurrentInvestmentHolding>()
  for (const h of existing) {
    if (h.ticker) byTicker.set(h.ticker.toUpperCase(), h)
  }

  const seenTickers = new Set<string>()
  let itemsSynced = 0

  for (const p of positions) {
    if (p.units === 0) continue

    // Store the broker's ticker string verbatim in the `ticker` column, but
    // key the dedup map case-insensitively so "aapl"/"AAPL" can't both land.
    const ticker = p.ticker
    const tickerKey = ticker.toUpperCase()
    seenTickers.add(tickerKey)

    const nowIso = new Date().toISOString()
    const baseFields: Record<string, unknown> = {
      user_id: userId,
      asset_id: assetId,
      ticker,
      name: p.name ?? ticker,
      currency: p.currency ?? 'EUR',
      units: p.units,
      external_source: 'trading212',
      source_broker_connection_id: connectionId,
      is_active: true,
      last_price_update: nowIso,
      updated_at: nowIso,
    }
    // Only set `current_price` when the broker actually supplied one, so a
    // missing price doesn't overwrite a previously-known value (mirror of the
    // exchange-sync `if (priceEur != null)` guard).
    if (p.currentPrice != null) baseFields.current_price = p.currentPrice
    // Likewise only stamp the ISIN when the metadata lookup resolved one.
    if (p.isin != null) baseFields.isin = p.isin

    const found = byTicker.get(tickerKey)
    if (found) {
      const { error } = await supabase
        .from('investment_holdings')
        .update(baseFields)
        .eq('id', found.id)
        .eq('user_id', userId)
      // On error: skip this position, don't abort the whole sync (mirror
      // exchange-sync's `continue`).
      if (error) continue
      itemsSynced++
    } else {
      // Brand-new row. PLAIN insert — NOT upsert: `investment_holdings` has no
      // unique index on (asset_id, ticker) for onConflict to target, so an
      // upsert would error. `avg_purchase_price` is seeded only here, on
      // INSERT, from the broker's average price (left untouched on later
      // UPDATEs so manual corrections survive).
      const insertFields = {
        ...baseFields,
        avg_purchase_price: p.averagePrice ?? null,
      }
      const { error } = await supabase
        .from('investment_holdings')
        .insert(insertFields)
      if (error) continue
      itemsSynced++
    }
  }

  // Soft-deactivate positions that vanished from the broker. CRITICAL SEAM:
  // an investment asset may also hold manual or CSV-imported holdings, so —
  // unlike exchange-sync which deactivates ALL absent holdings under the asset
  // — we restrict deactivation to rows THIS broker connection previously
  // synced (source_broker_connection_id === connectionId). Manual/CSV rows
  // (source NULL) and rows synced by a different connection are left untouched.
  let itemsDeactivated = 0
  for (const h of existing) {
    if (!h.ticker) continue
    if (seenTickers.has(h.ticker.toUpperCase())) continue
    if (!h.is_active) continue
    if (h.source_broker_connection_id !== connectionId) continue
    const { error } = await supabase
      .from('investment_holdings')
      .update({ units: 0, is_active: false })
      .eq('id', h.id)
      .eq('user_id', userId)
    if (!error) itemsDeactivated++
  }

  // Roll the EUR-converted total back onto `assets.current_value`. The helper
  // handles FX conversion for non-EUR positions and is best-effort (never
  // throws), so a partial price picture still yields a usable total.
  const { totalValue } = await syncAssetValueFromInvestmentHoldings(supabase, assetId, userId)

  return {
    itemsSynced,
    itemsDeactivated,
    totalValueEur: totalValue,
    assetId,
  }
}

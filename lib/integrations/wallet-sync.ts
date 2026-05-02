// Persistence layer that bridges Blockchair + CoinGecko and the local
// `wallet_addresses` row plus the linked `assets` (and optional crypto_holdings) row.
//
// Mapping rules (post-P2 — strict 1-on-1 + typed crypto schema):
//   • The wallet row carries a NOT NULL `linked_asset_id`. The asset MUST
//     already exist and belong to the calling user; the create-route validates
//     this before persisting the wallet. We never create assets here.
//   • If the linked asset has `has_holdings_tracking=true`, a row inside
//     `crypto_holdings` is upserted (matched on (asset_id, symbol)) so the
//     wallet contributes units alongside other holdings of the same asset. The
//     `source_wallet_address_id` and `chain` columns are stamped so the UI can
//     show a "wallet (chain)" badge per coin and link back to /identity/koppelingen.
//     The asset's `current_value` is then recomputed via
//     `syncAssetValueFromCryptoHoldings`.
//   • If the linked asset has `has_holdings_tracking=false`, we just stamp
//     `current_value = last_balance_eur` directly on the asset.
//   • Re-sync is idempotent: rows are upserted on (asset_id, symbol). Multiple
//     wallets pointing at the same asset+symbol would collide, but the 1-on-1
//     unique index `wallet_addresses.linked_asset_id` ensures each asset has
//     at most one wallet, so this is safe in practice.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { WalletChain } from '@/lib/connections-data'
import { fetchWalletBalance } from './blockchair-client'
import { fetchEurPriceForChain } from './coingecko-client'
import { syncAssetValueFromCryptoHoldings } from '@/lib/holdings-sync'

const CHAIN_SYMBOL: Record<WalletChain, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  // Polygon's native token is MATIC; ETH is gas on Arbitrum/Base/Ethereum.
  polygon: 'MATIC',
  arbitrum: 'ETH',
  base: 'ETH',
  solana: 'SOL',
}

export interface WalletSyncOutcome {
  nativeBalance: number
  eurBalance: number
  assetId: string
}

interface WalletRow {
  id: string
  user_id: string
  chain: WalletChain
  address: string
  label: string | null
  linked_asset_id: string
}

async function upsertLinkedCryptoHolding(
  supabase: SupabaseClient,
  userId: string,
  assetId: string,
  walletId: string,
  chain: WalletChain,
  label: string | null,
  units: number,
  pricePerUnit: number | null,
): Promise<void> {
  const symbol = CHAIN_SYMBOL[chain]
  const displayName = label && label.trim().length > 0
    ? `${symbol} (${label.trim()})`
    : `${symbol} (wallet)`

  const fields: Record<string, unknown> = {
    user_id: userId,
    asset_id: assetId,
    symbol,
    name: displayName,
    chain,
    units,
    units_in_order: 0,
    is_fiat_balance: false,
    is_active: true,
    source_wallet_address_id: walletId,
    last_price_update: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (pricePerUnit != null) fields.current_price = pricePerUnit

  await supabase
    .from('crypto_holdings')
    .upsert(fields, { onConflict: 'asset_id,symbol' })
}

/**
 * Fetches the on-chain balance + EUR price, persists the wallet row, and either
 * upserts a crypto_holdings row inside the linked asset (when holdings-tracking
 * is on) or just stamps `current_value` on the asset directly. Pure side-effect:
 * caller writes the audit row + updates `wallet_addresses.last_synced_at` /
 * `last_sync_error`.
 */
export async function syncWalletBalance(params: {
  supabase: SupabaseClient
  wallet: WalletRow
}): Promise<WalletSyncOutcome> {
  const { supabase, wallet } = params

  const balance = await fetchWalletBalance(wallet.chain, wallet.address)
  const priceEur = await fetchEurPriceForChain(wallet.chain)
  const eurValue = priceEur != null ? balance.nativeBalance * priceEur : 0

  const { data: linked } = await supabase
    .from('assets')
    .select('id, has_holdings_tracking')
    .eq('id', wallet.linked_asset_id)
    .eq('user_id', wallet.user_id)
    .maybeSingle()

  if (!linked?.id) {
    throw new Error('Gekoppeld asset niet gevonden of geen toegang.')
  }

  const assetId = linked.id as string
  const hasHoldings = (linked.has_holdings_tracking as boolean | null) === true

  if (hasHoldings) {
    await upsertLinkedCryptoHolding(
      supabase,
      wallet.user_id,
      assetId,
      wallet.id,
      wallet.chain,
      wallet.label,
      balance.nativeBalance,
      priceEur,
    )
    await syncAssetValueFromCryptoHoldings(supabase, assetId, wallet.user_id)
  } else {
    await supabase
      .from('assets')
      .update({ current_value: eurValue, is_active: true })
      .eq('id', assetId)
      .eq('user_id', wallet.user_id)
  }

  await supabase
    .from('wallet_addresses')
    .update({
      last_balance_native: balance.nativeBalance,
      last_balance_eur: eurValue,
    })
    .eq('id', wallet.id)
    .eq('user_id', wallet.user_id)

  return { nativeBalance: balance.nativeBalance, eurBalance: eurValue, assetId }
}

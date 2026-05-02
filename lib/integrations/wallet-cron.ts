// Cron entry-point for batch-syncing every user's wallet addresses.
//
// Called from `app/api/holdings/refresh-prices/cron/route.ts` after the
// exchange-sync. Concurrency: batched with `Promise.allSettled` in groups of
// MAX_PARALLEL so we never burst Blockchair beyond the free-tier ~30 req/min
// guideline. Per-wallet failures are logged but never abort the run.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { WalletChain } from '@/lib/connections-data'
import { syncWalletBalance } from './wallet-sync'
import { classifyWalletError } from './blockchair-client'

const MAX_PARALLEL = 10

interface WalletRow {
  id: string
  user_id: string
  chain: WalletChain
  address: string
  label: string | null
  linked_asset_id: string
}

export interface WalletCronResult {
  total: number
  ok: number
  failed: number
  errors: Array<{ walletId: string; error: string }>
}

async function syncOne(supabase: SupabaseClient, row: WalletRow): Promise<{ status: 'ok' | 'failed'; error?: string }> {
  const startedAt = new Date().toISOString()
  try {
    await syncWalletBalance({ supabase, wallet: row })
    await supabase
      .from('wallet_addresses')
      .update({ last_synced_at: startedAt, last_sync_error: null })
      .eq('id', row.id)
    await supabase.from('external_data_sources').insert({
      user_id: row.user_id,
      source_type: 'wallet',
      source_ref_id: row.id,
      run_at: startedAt,
      status: 'success',
      items_synced: 1,
    })
    return { status: 'ok' }
  } catch (err) {
    const { message } = classifyWalletError(err)
    await supabase
      .from('wallet_addresses')
      .update({ last_sync_error: message })
      .eq('id', row.id)
    await supabase.from('external_data_sources').insert({
      user_id: row.user_id,
      source_type: 'wallet',
      source_ref_id: row.id,
      run_at: startedAt,
      status: 'error',
      items_synced: 0,
      error_message: message,
    })
    return { status: 'failed', error: message }
  }
}

export async function syncAllWalletAddresses(supabase: SupabaseClient): Promise<WalletCronResult> {
  const { data: rows, error } = await supabase
    .from('wallet_addresses')
    .select('id, user_id, chain, address, label, linked_asset_id')

  if (error || !rows) {
    return { total: 0, ok: 0, failed: 0, errors: [] }
  }

  const result: WalletCronResult = { total: rows.length, ok: 0, failed: 0, errors: [] }
  const typedRows = rows as WalletRow[]

  for (let i = 0; i < typedRows.length; i += MAX_PARALLEL) {
    const batch = typedRows.slice(i, i + MAX_PARALLEL)
    const settled = await Promise.allSettled(batch.map((r) => syncOne(supabase, r)))
    settled.forEach((s, idx) => {
      const row = batch[idx]
      if (s.status === 'fulfilled') {
        if (s.value.status === 'ok') result.ok++
        else {
          result.failed++
          result.errors.push({ walletId: row.id, error: s.value.error ?? 'unknown' })
        }
      } else {
        result.failed++
        result.errors.push({ walletId: row.id, error: s.reason instanceof Error ? s.reason.message : String(s.reason) })
      }
    })
  }

  return result
}

// Cron entry-point for batch-syncing every user's exchange-connections.
//
// Called from `app/api/holdings/refresh-prices/cron/route.ts` after the
// holdings price refresh, so the asset.current_value rollup that runs inside
// the sync sees the latest crypto quotes.
//
// Concurrency: batched with `Promise.allSettled` in groups of MAX_PARALLEL so
// we never hammer Bitvavo with 100 simultaneous requests if the user-base
// grows. Per-connection failures are logged but never abort the run.

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptField } from '@/lib/crypto/field-encryption'
import { getExchangeAdapter, classifyExchangeError, type ExchangeId } from './exchange-adapter'
import { syncExchangeBalances } from './exchange-sync'

const MAX_PARALLEL = 10

interface ConnectionRow {
  id: string
  user_id: string
  exchange: ExchangeId
  label: string | null
  api_key_encrypted: string
  api_secret_encrypted: string
  linked_asset_id: string
}

export interface ExchangeCronResult {
  total: number
  ok: number
  failed: number
  skipped: number
  errors: Array<{ connectionId: string; error: string }>
}

async function syncOne(supabase: SupabaseClient, row: ConnectionRow): Promise<{ status: 'ok' | 'failed' | 'skipped'; error?: string }> {
  const startedAt = new Date().toISOString()

  let apiKey: string
  let apiSecret: string
  try {
    const k = decryptField(row.api_key_encrypted)
    const s = decryptField(row.api_secret_encrypted)
    if (!k || !s) throw new Error('decrypt returned null')
    apiKey = k
    apiSecret = s
  } catch {
    // Skip rows we can't decrypt — likely orphaned from a key rotation.
    return { status: 'skipped', error: 'decrypt_failed' }
  }

  let adapter
  try {
    adapter = getExchangeAdapter(row.exchange)
  } catch {
    return { status: 'skipped', error: `unsupported_exchange:${row.exchange}` }
  }

  try {
    const outcome = await syncExchangeBalances({
      supabase,
      userId: row.user_id,
      assetId: row.linked_asset_id,
      connectionId: row.id,
      adapter,
      apiKey,
      apiSecret,
    })
    await supabase
      .from('exchange_connections')
      .update({ last_synced_at: startedAt, last_sync_error: null })
      .eq('id', row.id)
    await supabase.from('external_data_sources').insert({
      user_id: row.user_id,
      source_type: 'exchange',
      source_ref_id: row.id,
      run_at: startedAt,
      status: 'success',
      items_synced: outcome.itemsSynced,
    })
    return { status: 'ok' }
  } catch (err) {
    const { message } = classifyExchangeError(err)
    await supabase
      .from('exchange_connections')
      .update({ last_sync_error: message })
      .eq('id', row.id)
    await supabase.from('external_data_sources').insert({
      user_id: row.user_id,
      source_type: 'exchange',
      source_ref_id: row.id,
      run_at: startedAt,
      status: 'error',
      items_synced: 0,
      error_message: message,
    })
    return { status: 'failed', error: message }
  }
}

export async function syncAllExchangeConnections(supabase: SupabaseClient): Promise<ExchangeCronResult> {
  const { data: rows, error } = await supabase
    .from('exchange_connections')
    .select('id, user_id, exchange, label, api_key_encrypted, api_secret_encrypted, linked_asset_id')

  if (error || !rows) {
    return { total: 0, ok: 0, failed: 0, skipped: 0, errors: [] }
  }

  const result: ExchangeCronResult = { total: rows.length, ok: 0, failed: 0, skipped: 0, errors: [] }
  const typedRows = rows as ConnectionRow[]

  for (let i = 0; i < typedRows.length; i += MAX_PARALLEL) {
    const batch = typedRows.slice(i, i + MAX_PARALLEL)
    const settled = await Promise.allSettled(batch.map((r) => syncOne(supabase, r)))
    settled.forEach((s, idx) => {
      const row = batch[idx]
      if (s.status === 'fulfilled') {
        if (s.value.status === 'ok') result.ok++
        else if (s.value.status === 'failed') {
          result.failed++
          result.errors.push({ connectionId: row.id, error: s.value.error ?? 'unknown' })
        } else {
          result.skipped++
        }
      } else {
        result.failed++
        result.errors.push({ connectionId: row.id, error: s.reason instanceof Error ? s.reason.message : String(s.reason) })
      }
    })
  }

  return result
}

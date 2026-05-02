// Server-side data loader for the /identity/koppelingen page.
//
// Fetches encrypted exchange connections, public wallet addresses, and the
// most recent sync-runs from external_data_sources. API keys/secrets NEVER
// leave the server — only `apiKeyLast4` (already public-safe per migration)
// is forwarded to the client.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Constants ──────────────────────────────────────────────────────────

const RECENT_SYNCS_LIMIT = 25

// Freshness budget for the "fresh / stale / error / never" status badge.
// 24h matches the cron cadence of W1.2/W1.3.
export const SYNC_FRESHNESS_HOURS = 24

// ── Public types — these are what the client sees ──────────────────────

export type ExchangeId = 'bitvavo' | 'kraken' | 'coinbase'
export type WalletChain = 'bitcoin' | 'ethereum' | 'polygon' | 'arbitrum' | 'base' | 'solana'
export type SyncSourceType = 'exchange' | 'wallet' | 'market_data'
export type SyncStatus = 'success' | 'error' | 'partial'

export interface ExchangeConnectionRow {
  id: string
  exchange: ExchangeId
  label: string | null
  apiKeyLast4: string | null
  lastSyncedAt: string | null
  lastSyncError: string | null
  createdAt: string
  linkedAssetId: string
  linkedAssetName: string
  linkedAssetType: string
}

export interface WalletAddressRow {
  id: string
  chain: WalletChain
  address: string
  label: string | null
  linkedAssetId: string
  linkedAssetName: string
  linkedAssetType: string
  lastSyncedAt: string | null
  lastBalanceNative: number | null
  lastBalanceEur: number | null
  lastSyncError: string | null
  createdAt: string
}

export interface ExternalDataSourceRow {
  id: string
  sourceType: SyncSourceType
  sourceRefId: string | null
  runAt: string
  status: SyncStatus
  itemsSynced: number
  errorMessage: string | null
}

export interface ConnectionsData {
  exchanges: ExchangeConnectionRow[]
  wallets: WalletAddressRow[]
  recentSyncs: ExternalDataSourceRow[]
}

// ── Loader ─────────────────────────────────────────────────────────────

export const loadConnectionsData = cache(async (
  supabase: SupabaseClient,
): Promise<ConnectionsData> => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const [exchangesRes, walletsRes, syncsRes] = await Promise.all([
    supabase
      .from('exchange_connections')
      .select('id, exchange, label, api_key_last4, last_synced_at, last_sync_error, created_at, linked_asset_id, assets:linked_asset_id (id, name, asset_type)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('wallet_addresses')
      .select('id, chain, address, label, linked_asset_id, last_synced_at, last_balance_native, last_balance_eur, last_sync_error, created_at, assets:linked_asset_id (id, name, asset_type)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('external_data_sources')
      .select('id, source_type, source_ref_id, run_at, status, items_synced, error_message')
      .eq('user_id', user.id)
      .order('run_at', { ascending: false })
      .limit(RECENT_SYNCS_LIMIT),
  ])

  // Supabase nested-select shape: `assets` may be a single object or an array
  // depending on join cardinality. We normalise to a single record.
  type AssetRef = { id: string; name: string; asset_type: string } | null
  function asAssetRef(value: unknown): AssetRef {
    if (!value) return null
    const v = Array.isArray(value) ? value[0] : value
    if (!v || typeof v !== 'object') return null
    const o = v as { id?: unknown; name?: unknown; asset_type?: unknown }
    if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.asset_type !== 'string') return null
    return { id: o.id, name: o.name, asset_type: o.asset_type }
  }

  const exchanges: ExchangeConnectionRow[] = (exchangesRes.data ?? []).map((r) => {
    const asset = asAssetRef((r as Record<string, unknown>).assets)
    return {
      id: r.id as string,
      exchange: r.exchange as ExchangeId,
      label: (r.label as string | null) ?? null,
      apiKeyLast4: (r.api_key_last4 as string | null) ?? null,
      lastSyncedAt: (r.last_synced_at as string | null) ?? null,
      lastSyncError: (r.last_sync_error as string | null) ?? null,
      createdAt: r.created_at as string,
      linkedAssetId: (r.linked_asset_id as string),
      linkedAssetName: asset?.name ?? '(asset niet gevonden)',
      linkedAssetType: asset?.asset_type ?? 'crypto',
    }
  })

  const wallets: WalletAddressRow[] = (walletsRes.data ?? []).map((r) => {
    const asset = asAssetRef((r as Record<string, unknown>).assets)
    return {
      id: r.id as string,
      chain: r.chain as WalletChain,
      address: r.address as string,
      label: (r.label as string | null) ?? null,
      linkedAssetId: (r.linked_asset_id as string),
      linkedAssetName: asset?.name ?? '(asset niet gevonden)',
      linkedAssetType: asset?.asset_type ?? 'crypto',
      lastSyncedAt: (r.last_synced_at as string | null) ?? null,
      lastBalanceNative: r.last_balance_native != null ? Number(r.last_balance_native) : null,
      lastBalanceEur: r.last_balance_eur != null ? Number(r.last_balance_eur) : null,
      lastSyncError: (r.last_sync_error as string | null) ?? null,
      createdAt: r.created_at as string,
    }
  })

  const recentSyncs: ExternalDataSourceRow[] = (syncsRes.data ?? []).map((r) => ({
    id: r.id as string,
    sourceType: r.source_type as SyncSourceType,
    sourceRefId: (r.source_ref_id as string | null) ?? null,
    runAt: r.run_at as string,
    status: r.status as SyncStatus,
    itemsSynced: Number(r.items_synced ?? 0),
    errorMessage: (r.error_message as string | null) ?? null,
  }))

  return { exchanges, wallets, recentSyncs }
})

// ── Per-asset loaders ──────────────────────────────────────────────────

/**
 * Lichte vorm van connection-data voor weergave op de asset-edit-pagina en
 * als badge op asset-kaarten. Bevat alleen wat de UI publiek toont — geen
 * encrypted velden of hash-kolommen. Eén asset heeft (door de R1-migratie)
 * maximaal één exchange- of wallet-koppeling.
 */
export interface AssetConnectionSummary {
  exchange?: ExchangeConnectionRow
  wallet?: WalletAddressRow
}

/**
 * Laadt de actieve koppeling(en) voor één asset. Zowel exchange als wallet
 * worden parallel bevraagd; in de praktijk bestaat per asset hooguit één van
 * beide (1-op-1 contract op `linked_asset_id`). Returnt `null` als er geen
 * koppeling is.
 */
export async function loadConnectionForAsset(
  supabase: SupabaseClient,
  assetId: string,
): Promise<AssetConnectionSummary | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [exchangeRes, walletRes] = await Promise.all([
    supabase
      .from('exchange_connections')
      .select('id, exchange, label, api_key_last4, last_synced_at, last_sync_error, created_at, linked_asset_id, assets:linked_asset_id (id, name, asset_type)')
      .eq('user_id', user.id)
      .eq('linked_asset_id', assetId)
      .maybeSingle(),
    supabase
      .from('wallet_addresses')
      .select('id, chain, address, label, linked_asset_id, last_synced_at, last_balance_native, last_balance_eur, last_sync_error, created_at, assets:linked_asset_id (id, name, asset_type)')
      .eq('user_id', user.id)
      .eq('linked_asset_id', assetId)
      .maybeSingle(),
  ])

  // Nested-select normalisatie identiek aan loadConnectionsData (DRY zou een
  // gedeelde helper rechtvaardigen, maar de twee call-sites hebben nu een
  // duidelijke contract-grens — refactor later als er een derde komt).
  type AssetRef = { id: string; name: string; asset_type: string } | null
  function asAssetRef(value: unknown): AssetRef {
    if (!value) return null
    const v = Array.isArray(value) ? value[0] : value
    if (!v || typeof v !== 'object') return null
    const o = v as { id?: unknown; name?: unknown; asset_type?: unknown }
    if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.asset_type !== 'string') return null
    return { id: o.id, name: o.name, asset_type: o.asset_type }
  }

  const result: AssetConnectionSummary = {}

  if (exchangeRes.data) {
    const r = exchangeRes.data
    const asset = asAssetRef((r as Record<string, unknown>).assets)
    result.exchange = {
      id: r.id as string,
      exchange: r.exchange as ExchangeId,
      label: (r.label as string | null) ?? null,
      apiKeyLast4: (r.api_key_last4 as string | null) ?? null,
      lastSyncedAt: (r.last_synced_at as string | null) ?? null,
      lastSyncError: (r.last_sync_error as string | null) ?? null,
      createdAt: r.created_at as string,
      linkedAssetId: r.linked_asset_id as string,
      linkedAssetName: asset?.name ?? '(asset niet gevonden)',
      linkedAssetType: asset?.asset_type ?? 'crypto',
    }
  }

  if (walletRes.data) {
    const r = walletRes.data
    const asset = asAssetRef((r as Record<string, unknown>).assets)
    result.wallet = {
      id: r.id as string,
      chain: r.chain as WalletChain,
      address: r.address as string,
      label: (r.label as string | null) ?? null,
      linkedAssetId: r.linked_asset_id as string,
      linkedAssetName: asset?.name ?? '(asset niet gevonden)',
      linkedAssetType: asset?.asset_type ?? 'crypto',
      lastSyncedAt: (r.last_synced_at as string | null) ?? null,
      lastBalanceNative: r.last_balance_native != null ? Number(r.last_balance_native) : null,
      lastBalanceEur: r.last_balance_eur != null ? Number(r.last_balance_eur) : null,
      lastSyncError: (r.last_sync_error as string | null) ?? null,
      createdAt: r.created_at as string,
    }
  }

  if (!result.exchange && !result.wallet) return null
  return result
}

/**
 * Batched-load voor lijst-views: levert per asset-ID de actieve koppeling
 * (of `undefined` als er geen is). Twee queries — exchange + wallet — beide
 * gefilterd op `linked_asset_id IN (...)` zodat er geen N+1 ontstaat.
 *
 * Voor lege input lossen we direct met een leeg record op — voorkomt een
 * onnodige Supabase-call met een lege `IN`-clause die op sommige Postgres
 * planners een full scan triggert.
 */
export async function loadConnectionsByAssetIds(
  supabase: SupabaseClient,
  assetIds: string[],
): Promise<Record<string, AssetConnectionSummary>> {
  if (assetIds.length === 0) return {}

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const [exchangeRes, walletRes] = await Promise.all([
    supabase
      .from('exchange_connections')
      .select('id, exchange, label, api_key_last4, last_synced_at, last_sync_error, created_at, linked_asset_id')
      .eq('user_id', user.id)
      .in('linked_asset_id', assetIds),
    supabase
      .from('wallet_addresses')
      .select('id, chain, address, label, linked_asset_id, last_synced_at, last_balance_native, last_balance_eur, last_sync_error, created_at')
      .eq('user_id', user.id)
      .in('linked_asset_id', assetIds),
  ])

  const result: Record<string, AssetConnectionSummary> = {}

  for (const r of exchangeRes.data ?? []) {
    const assetId = r.linked_asset_id as string
    const summary = result[assetId] ?? {}
    summary.exchange = {
      id: r.id as string,
      exchange: r.exchange as ExchangeId,
      label: (r.label as string | null) ?? null,
      apiKeyLast4: (r.api_key_last4 as string | null) ?? null,
      lastSyncedAt: (r.last_synced_at as string | null) ?? null,
      lastSyncError: (r.last_sync_error as string | null) ?? null,
      createdAt: r.created_at as string,
      linkedAssetId: assetId,
      // Naam/type worden niet uitgevraagd in de batch — caller heeft de assets
      // al in scope. Voor de badge-strip volstaat exchange-naam + status.
      linkedAssetName: '',
      linkedAssetType: '',
    }
    result[assetId] = summary
  }

  for (const r of walletRes.data ?? []) {
    const assetId = r.linked_asset_id as string
    const summary = result[assetId] ?? {}
    summary.wallet = {
      id: r.id as string,
      chain: r.chain as WalletChain,
      address: r.address as string,
      label: (r.label as string | null) ?? null,
      linkedAssetId: assetId,
      linkedAssetName: '',
      linkedAssetType: '',
      lastSyncedAt: (r.last_synced_at as string | null) ?? null,
      lastBalanceNative: r.last_balance_native != null ? Number(r.last_balance_native) : null,
      lastBalanceEur: r.last_balance_eur != null ? Number(r.last_balance_eur) : null,
      lastSyncError: (r.last_sync_error as string | null) ?? null,
      createdAt: r.created_at as string,
    }
    result[assetId] = summary
  }

  return result
}

/**
 * Batched-load voor debt-lijst-views: levert per debt-ID de actieve koppeling
 * (of `undefined` als er geen is). Symmetrisch met `loadConnectionsByAssetIds`.
 *
 * In de huidige R-iteratie bestaan er nog geen actieve API-koppelingen voor
 * schulden — `linked_debt_id` is door de R-migratie wél aanwezig in zowel
 * `wallet_addresses` als `exchange_connections`. De functie werkt dus al met
 * het bestaande schema, en levert een leeg record zolang er geen debt-rij
 * gekoppeld is. Zo kan het display-pad nu al ingebouwd worden zonder
 * speculatieve database-wijzigingen.
 */
export async function loadConnectionsByDebtIds(
  supabase: SupabaseClient,
  debtIds: string[],
): Promise<Record<string, AssetConnectionSummary>> {
  if (debtIds.length === 0) return {}

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const [exchangeRes, walletRes] = await Promise.all([
    supabase
      .from('exchange_connections')
      .select('id, exchange, label, api_key_last4, last_synced_at, last_sync_error, created_at, linked_debt_id')
      .eq('user_id', user.id)
      .in('linked_debt_id', debtIds),
    supabase
      .from('wallet_addresses')
      .select('id, chain, address, label, linked_debt_id, last_synced_at, last_balance_native, last_balance_eur, last_sync_error, created_at')
      .eq('user_id', user.id)
      .in('linked_debt_id', debtIds),
  ])

  const result: Record<string, AssetConnectionSummary> = {}

  for (const r of exchangeRes.data ?? []) {
    const debtId = (r as Record<string, unknown>).linked_debt_id as string | null
    if (!debtId) continue
    const summary = result[debtId] ?? {}
    summary.exchange = {
      id: r.id as string,
      exchange: r.exchange as ExchangeId,
      label: (r.label as string | null) ?? null,
      apiKeyLast4: (r.api_key_last4 as string | null) ?? null,
      lastSyncedAt: (r.last_synced_at as string | null) ?? null,
      lastSyncError: (r.last_sync_error as string | null) ?? null,
      createdAt: r.created_at as string,
      // `linkedAssetId` blijft leeg in dit pad — debt-koppelingen vullen dit
      // veld bewust niet in. Het ExchangeConnectionRow-contract is asset-
      // gericht; het debt-pad hergebruikt de struct alleen voor het
      // display-summary (source + status + tijd) en raakt deze velden niet aan.
      linkedAssetId: '',
      linkedAssetName: '',
      linkedAssetType: '',
    }
    result[debtId] = summary
  }

  for (const r of walletRes.data ?? []) {
    const debtId = (r as Record<string, unknown>).linked_debt_id as string | null
    if (!debtId) continue
    const summary = result[debtId] ?? {}
    summary.wallet = {
      id: r.id as string,
      chain: r.chain as WalletChain,
      address: r.address as string,
      label: (r.label as string | null) ?? null,
      linkedAssetId: '',
      linkedAssetName: '',
      linkedAssetType: '',
      lastSyncedAt: (r.last_synced_at as string | null) ?? null,
      lastBalanceNative: r.last_balance_native != null ? Number(r.last_balance_native) : null,
      lastBalanceEur: r.last_balance_eur != null ? Number(r.last_balance_eur) : null,
      lastSyncError: (r.last_sync_error as string | null) ?? null,
      createdAt: r.created_at as string,
    }
    result[debtId] = summary
  }

  return result
}

// ── Status helpers (shared with badge component) ───────────────────────

export type FreshnessStatus = 'fresh' | 'stale' | 'error' | 'never'

export function computeFreshness(
  lastSyncedAt: string | null,
  lastSyncError: string | null,
  freshnessHours = SYNC_FRESHNESS_HOURS,
): FreshnessStatus {
  if (lastSyncError) return 'error'
  if (!lastSyncedAt) return 'never'
  const last = new Date(lastSyncedAt).getTime()
  if (Number.isNaN(last)) return 'never'
  const ageMs = Date.now() - last
  return ageMs > freshnessHours * 60 * 60 * 1000 ? 'stale' : 'fresh'
}

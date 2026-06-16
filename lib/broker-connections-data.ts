// Server-side data loader for broker-koppelingen (Trading 212, …).
//
// The broker twin of `connections-data.ts`. Fetches encrypted broker
// connections but NEVER lets the encrypted/hash columns leave the server —
// only `apiKeyLast4` (already public-safe per migration) is forwarded to the
// client. Used by the koppelingen UI and the asset-edit connection section.

import type { SupabaseClient } from '@supabase/supabase-js'

export type BrokerId = 'trading212'

export interface BrokerConnectionRow {
  id: string
  broker: BrokerId
  label: string | null
  apiKeyLast4: string | null
  lastSyncedAt: string | null
  lastSyncError: string | null
  createdAt: string
  linkedAssetId: string
  linkedAssetName: string
  linkedAssetType: string
}

// Public-safe column projection. Note the deliberate ABSENCE of
// api_key_encrypted / api_secret_encrypted / api_key_hash — those never leave
// the server.
const BROKER_SELECT =
  'id, broker, label, api_key_last4, last_synced_at, last_sync_error, created_at, linked_asset_id, assets:linked_asset_id (id, name, asset_type)'

// Supabase nested-select shape: `assets` may be a single object or an array
// depending on join cardinality. We normalise to a single record. Identical to
// the asAssetRef helper in connections-data.ts.
type AssetRef = { id: string; name: string; asset_type: string } | null
function asAssetRef(value: unknown): AssetRef {
  if (!value) return null
  const v = Array.isArray(value) ? value[0] : value
  if (!v || typeof v !== 'object') return null
  const o = v as { id?: unknown; name?: unknown; asset_type?: unknown }
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.asset_type !== 'string') return null
  return { id: o.id, name: o.name, asset_type: o.asset_type }
}

function mapBrokerRow(r: Record<string, unknown>): BrokerConnectionRow {
  const asset = asAssetRef(r.assets)
  return {
    id: r.id as string,
    broker: r.broker as BrokerId,
    label: (r.label as string | null) ?? null,
    apiKeyLast4: (r.api_key_last4 as string | null) ?? null,
    lastSyncedAt: (r.last_synced_at as string | null) ?? null,
    lastSyncError: (r.last_sync_error as string | null) ?? null,
    createdAt: r.created_at as string,
    linkedAssetId: r.linked_asset_id as string,
    linkedAssetName: asset?.name ?? '(asset niet gevonden)',
    linkedAssetType: asset?.asset_type ?? 'investment',
  }
}

/**
 * Laadt de actieve broker-koppeling voor één asset (1-op-1 contract op
 * `linked_asset_id`). Returnt `null` als er geen koppeling is.
 */
export async function loadBrokerConnectionForAsset(
  supabase: SupabaseClient,
  assetId: string,
): Promise<BrokerConnectionRow | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('broker_connections')
    .select(BROKER_SELECT)
    .eq('user_id', user.id)
    .eq('linked_asset_id', assetId)
    .maybeSingle()

  if (!data) return null
  return mapBrokerRow(data as Record<string, unknown>)
}

/**
 * Laadt alle broker-koppelingen van de ingelogde gebruiker, nieuwste eerst.
 * Symmetrisch met de exchanges-tak in `loadConnectionsData`.
 */
export async function loadBrokerConnectionsForUser(
  supabase: SupabaseClient,
): Promise<BrokerConnectionRow[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('broker_connections')
    .select(BROKER_SELECT)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (data ?? []).map((r) => mapBrokerRow(r as Record<string, unknown>))
}

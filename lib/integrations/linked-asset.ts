// Shared helper for validating that a connect-route caller owns the asset
// they want to couple a connection to. Used by every exchange + wallet
// connect-route to enforce the strict 1-on-1 contract introduced in R1.

import type { SupabaseClient } from '@supabase/supabase-js'

export type LinkedAssetCheckResult =
  | { ok: true; assetId: string }
  | { ok: false; status: 400 | 403 | 404; message: string }

export async function validateLinkedAsset(
  supabase: SupabaseClient,
  userId: string,
  rawId: unknown,
): Promise<LinkedAssetCheckResult> {
  if (typeof rawId !== 'string' || rawId.trim().length === 0) {
    return { ok: false, status: 400, message: 'linkedAssetId is verplicht.' }
  }
  const assetId = rawId.trim()

  const { data, error } = await supabase
    .from('assets')
    .select('id, user_id, asset_type')
    .eq('id', assetId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, status: 404, message: 'Asset niet gevonden.' }
  }
  if ((data.user_id as string) !== userId) {
    return { ok: false, status: 403, message: 'Geen toegang tot dit asset.' }
  }
  if ((data.asset_type as string) !== 'crypto') {
    return { ok: false, status: 400, message: 'Alleen crypto-assets kunnen aan een exchange of wallet gekoppeld worden.' }
  }
  return { ok: true, assetId: data.id as string }
}

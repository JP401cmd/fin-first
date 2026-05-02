import { createClient } from '@/lib/supabase/server'
import { getEURRateSync } from '@/lib/forex'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

/**
 * Aggregate all active investment_holdings for a given asset and write the
 * EUR-converted total back onto `assets.current_value`. Foreign-currency
 * positions are converted via cached/fallback FX rates. Errors are swallowed:
 * the rollup is a best-effort side-effect of writes from sync paths and CSV
 * imports — it must never fail the calling operation.
 */
export async function syncAssetValueFromInvestmentHoldings(
  supabase: SupabaseLike,
  assetId: string,
  userId: string
): Promise<{ synced: boolean; totalValue: number }> {
  try {
    const { data: holdings } = await supabase
      .from('investment_holdings')
      .select('units, current_price, avg_purchase_price, currency')
      .eq('asset_id', assetId)
      .eq('user_id', userId)
      .eq('is_active', true)

    if (!holdings) return { synced: false, totalValue: 0 }

    const totalValue = holdings.reduce((sum, h) => {
      const price = (h.current_price as number | null) ?? (h.avg_purchase_price as number | null) ?? 0
      const currency = (h.currency as string) || 'EUR'
      const eurRate = getEURRateSync(currency)
      const units = (h.units as number) ?? 0
      return sum + price * units * eurRate
    }, 0)

    await supabase
      .from('assets')
      .update({ current_value: totalValue })
      .eq('id', assetId)
      .eq('user_id', userId)

    return { synced: true, totalValue }
  } catch {
    return { synced: false, totalValue: 0 }
  }
}

/**
 * Aggregate all active crypto_holdings for a given asset and write the EUR
 * total onto the parent asset. crypto_holdings.current_price is already in EUR
 * by contract (the new schema dropped the polymorphic `currency` column for
 * crypto), so no FX conversion is needed. Fiat balances inside an exchange
 * (`is_fiat_balance = true`) ARE included so the asset reflects the user's
 * total exchange value, not just the crypto positions.
 */
export async function syncAssetValueFromCryptoHoldings(
  supabase: SupabaseLike,
  assetId: string,
  userId: string
): Promise<{ synced: boolean; totalValue: number }> {
  try {
    const { data: holdings } = await supabase
      .from('crypto_holdings')
      .select('units, current_price, avg_purchase_price')
      .eq('asset_id', assetId)
      .eq('user_id', userId)
      .eq('is_active', true)

    if (!holdings) return { synced: false, totalValue: 0 }

    const totalValue = holdings.reduce((sum, h) => {
      const price = (h.current_price as number | null) ?? (h.avg_purchase_price as number | null) ?? 0
      const units = (h.units as number) ?? 0
      return sum + price * units
    }, 0)

    await supabase
      .from('assets')
      .update({ current_value: totalValue })
      .eq('id', assetId)
      .eq('user_id', userId)

    return { synced: true, totalValue }
  } catch {
    return { synced: false, totalValue: 0 }
  }
}

/**
 * Dispatch to the correct rollup helper based on `assets.asset_type`. Use this
 * from sync code paths that don't already know whether the asset is investment-
 * or crypto-typed (e.g. CSV import which only has the asset_id). When the type
 * is already known statically, prefer the dedicated helper.
 */
export async function syncAssetValueByType(
  supabase: SupabaseLike,
  assetId: string,
  userId: string,
  assetType?: string | null
): Promise<{ synced: boolean; totalValue: number }> {
  let resolvedType = assetType
  if (!resolvedType) {
    const { data: asset } = await supabase
      .from('assets')
      .select('asset_type')
      .eq('id', assetId)
      .eq('user_id', userId)
      .maybeSingle()
    resolvedType = (asset?.asset_type as string | undefined) ?? null
  }

  if (resolvedType === 'crypto') {
    return syncAssetValueFromCryptoHoldings(supabase, assetId, userId)
  }
  return syncAssetValueFromInvestmentHoldings(supabase, assetId, userId)
}

/**
 * Back-compat shim. Existing callers that still call the old generic name get
 * routed to the dispatcher. New code should use the dedicated helpers.
 *
 * @deprecated Use `syncAssetValueByType`, `syncAssetValueFromInvestmentHoldings`,
 *             or `syncAssetValueFromCryptoHoldings` directly.
 */
export async function syncAssetValueFromHoldings(
  supabase: SupabaseLike,
  assetId: string,
  userId: string
): Promise<{ synced: boolean; totalValue: number }> {
  return syncAssetValueByType(supabase, assetId, userId)
}

/**
 * Returns whether the asset currently has any active holdings (investment or
 * crypto) plus the EUR-equivalent total value. Used by the asset-edit UI to
 * warn that manual current_value edits will be overwritten on the next sync.
 */
export async function assetHasActiveHoldings(
  supabase: SupabaseLike,
  assetId: string,
  userId: string
): Promise<{ hasHoldings: boolean; holdingsCount: number; totalValue: number }> {
  try {
    const { data: asset } = await supabase
      .from('assets')
      .select('asset_type')
      .eq('id', assetId)
      .eq('user_id', userId)
      .maybeSingle()

    const isCrypto = (asset?.asset_type as string | undefined) === 'crypto'

    if (isCrypto) {
      const { data: holdings } = await supabase
        .from('crypto_holdings')
        .select('units, current_price, avg_purchase_price')
        .eq('asset_id', assetId)
        .eq('user_id', userId)
        .eq('is_active', true)

      if (!holdings || holdings.length === 0) {
        return { hasHoldings: false, holdingsCount: 0, totalValue: 0 }
      }

      const totalValue = holdings.reduce((sum, h) => {
        const price = (h.current_price as number | null) ?? (h.avg_purchase_price as number | null) ?? 0
        const units = (h.units as number) ?? 0
        return sum + price * units
      }, 0)

      return { hasHoldings: true, holdingsCount: holdings.length, totalValue }
    }

    const { data: holdings } = await supabase
      .from('investment_holdings')
      .select('units, current_price, avg_purchase_price, currency')
      .eq('asset_id', assetId)
      .eq('user_id', userId)
      .eq('is_active', true)

    if (!holdings || holdings.length === 0) {
      return { hasHoldings: false, holdingsCount: 0, totalValue: 0 }
    }

    const totalValue = holdings.reduce((sum, h) => {
      const price = (h.current_price as number | null) ?? (h.avg_purchase_price as number | null) ?? 0
      const currency = (h.currency as string) || 'EUR'
      const eurRate = getEURRateSync(currency)
      const units = (h.units as number) ?? 0
      return sum + price * units * eurRate
    }, 0)

    return { hasHoldings: true, holdingsCount: holdings.length, totalValue }
  } catch {
    return { hasHoldings: false, holdingsCount: 0, totalValue: 0 }
  }
}

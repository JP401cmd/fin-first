import { createClient } from '@/lib/supabase/server'
import { getEURRateSync } from '@/lib/forex'

/**
 * Aggregate all active holdings for a given asset and sync the total to the
 * parent asset's current_value. This ensures the asset always reflects the
 * sum of (current_price * units) across all its holdings.
 *
 * Portfolio tracker is source of truth when holdings exist for an asset:
 * - When there are active holdings, asset.current_value = SUM(holdings value in EUR)
 * - When all holdings are removed, asset.current_value becomes 0
 *
 * Foreign currency holdings are converted to EUR using cached/fallback rates.
 * This is a non-critical operation: errors don't fail the calling operation.
 */
export async function syncAssetValueFromHoldings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assetId: string,
  userId: string
): Promise<{ synced: boolean; totalValue: number }> {
  try {
    const { data: holdings } = await supabase
      .from('holdings')
      .select('units, current_price, avg_purchase_price, currency')
      .eq('asset_id', assetId)
      .eq('user_id', userId)
      .eq('is_active', true)

    if (!holdings) return { synced: false, totalValue: 0 }

    const totalValue = holdings.reduce((sum, h) => {
      const price = h.current_price ?? h.avg_purchase_price
      const currency = (h.currency as string) || 'EUR'
      const eurRate = getEURRateSync(currency)
      return sum + (price * h.units * eurRate)
    }, 0)

    await supabase
      .from('assets')
      .update({ current_value: totalValue })
      .eq('id', assetId)
      .eq('user_id', userId)

    return { synced: true, totalValue }
  } catch {
    // Non-critical: don't fail the main operation if sync fails
    return { synced: false, totalValue: 0 }
  }
}

/**
 * Check if an asset has active holdings linked to it.
 * Used to determine if manual value editing should be blocked/warned.
 *
 * When an asset has active holdings, the portfolio tracker is the source of truth
 * and manual edits to current_value would be overwritten on the next sync.
 *
 * Returns EUR-equivalent total value.
 */
export async function assetHasActiveHoldings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assetId: string,
  userId: string
): Promise<{ hasHoldings: boolean; holdingsCount: number; totalValue: number }> {
  try {
    const { data: holdings } = await supabase
      .from('holdings')
      .select('units, current_price, avg_purchase_price, currency')
      .eq('asset_id', assetId)
      .eq('user_id', userId)
      .eq('is_active', true)

    if (!holdings || holdings.length === 0) {
      return { hasHoldings: false, holdingsCount: 0, totalValue: 0 }
    }

    const totalValue = holdings.reduce((sum, h) => {
      const price = h.current_price ?? h.avg_purchase_price
      const currency = (h.currency as string) || 'EUR'
      const eurRate = getEURRateSync(currency)
      return sum + (price * h.units * eurRate)
    }, 0)

    return { hasHoldings: true, holdingsCount: holdings.length, totalValue }
  } catch {
    return { hasHoldings: false, holdingsCount: 0, totalValue: 0 }
  }
}

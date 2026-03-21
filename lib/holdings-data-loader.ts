// lib/holdings-data-loader.ts
// Server-side data loader for the Holdings page.
// Provides initial data to eliminate the client-side JS→fetch waterfall.
// Only loads holdings whose parent asset has has_holdings_tracking = true.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────

export interface HoldingsPageData {
  holdings: Array<Record<string, unknown>>
  totalValue: number
  totalCost: number
  source: string
}

// ── Loader ─────────────────────────────────────────────────────

export const loadHoldingsData = cache(async (supabase: SupabaseClient): Promise<HoldingsPageData> => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Load holdings with a nested select on assets to filter by has_holdings_tracking
  // and include the parent asset name for grouping in the UI.
  const { data: holdingsData } = await supabase
    .from('holdings')
    .select('*, asset:assets!asset_id(id, name, has_holdings_tracking)')
    .eq('is_active', true)
    .eq('assets.has_holdings_tracking', true)
    .order('created_at', { ascending: true })

  // Supabase returns rows where the nested asset is null when the filter
  // doesn't match; exclude those and flatten the asset name onto each holding.
  const rawRows = ((holdingsData ?? []) as Array<Record<string, unknown>>)
    .filter((h) => h.asset != null)

  // Calculate totals before flattening (raw rows still have all holding columns)
  let totalValue = 0
  let totalCost = 0
  for (const h of rawRows) {
    const units = Number(h.units) || 0
    const currentPrice = h.current_price != null ? Number(h.current_price) : Number(h.avg_purchase_price) || 0
    const avgPurchasePrice = Number(h.avg_purchase_price) || 0
    totalValue += units * currentPrice
    totalCost += units * avgPurchasePrice
  }

  // Flatten asset name onto each holding for client-side grouping
  const holdings: Array<Record<string, unknown>> = rawRows.map((h) => {
    const asset = h.asset as { id: string; name: string } | null
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { asset: _unused, ...rest } = h
    return {
      ...rest,
      asset_name: asset?.name ?? null,
      asset_id: asset?.id ?? h.asset_id,
    }
  })

  return {
    holdings,
    totalValue,
    totalCost,
    source: 'server',
  }
})

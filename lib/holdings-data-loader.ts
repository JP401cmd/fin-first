// lib/holdings-data-loader.ts
// Server-side data loader for the Holdings page.
// Provides initial data to eliminate the client-side JS→fetch waterfall.

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

  // Load holdings directly from holdings table
  const { data: holdingsData } = await supabase
    .from('holdings')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  const holdings = (holdingsData ?? []) as Array<Record<string, unknown>>

  // Calculate totals
  let totalValue = 0
  let totalCost = 0
  for (const h of holdings) {
    const units = Number(h.units) || 0
    const currentPrice = h.current_price != null ? Number(h.current_price) : Number(h.avg_purchase_price) || 0
    const avgPurchasePrice = Number(h.avg_purchase_price) || 0
    totalValue += units * currentPrice
    totalCost += units * avgPurchasePrice
  }

  return {
    holdings,
    totalValue,
    totalCost,
    source: 'server',
  }
})

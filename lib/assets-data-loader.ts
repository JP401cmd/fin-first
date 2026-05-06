// lib/assets-data-loader.ts
// Server-side data loader for the Assets page.
// Provides initial data to eliminate the client-side JS→fetch waterfall.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadEntitySparklines } from './load-entity-sparklines'
import { loadKpiContextRefs, type KpiContextRefs } from './kpi-context'
import { loadConnectionsByAssetIds, type AssetConnectionSummary } from './connections-data'

// ── Types ──────────────────────────────────────────────────────

export interface AssetsPageData {
  assets: Array<Record<string, unknown>>
  mortgages: Array<{ id: string; name: string; current_balance: number; linked_asset_id: string | null }>
  dailyExpenses: number
  linkedBankAccounts: Array<{ id: string; linked_asset_id: string; balance: number }>
  budgetingActive: boolean
  valuations: Record<string, Array<Record<string, unknown>>>
  /** Per-asset sparkline (12 maandwaarden) — voor de breuklijn-overlay op
   *  `<VermogenAssetCard>`. Zelfde shape als categorie-pagina. */
  assetSparklines: Record<string, number[]>
  /** KPI-context refs voor `buildKpiContext` + `computeAssetKpi` per kaart. */
  kpiRefs: KpiContextRefs | null
  /** Actieve externe koppeling (Bitvavo, broker, wallet) per asset-ID. */
  connectionsByAssetId: Record<string, AssetConnectionSummary>
}

// ── Loader ─────────────────────────────────────────────────────

export const loadAssetsData = cache(async (supabase: SupabaseClient): Promise<AssetsPageData> => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

  // Parallel fetch all data
  const [assetsRes, mortgageRes, txRes, bankLinksRes, profileRes, valuationsRes] = await Promise.all([
    supabase
      .from('assets')
      .select('*')
      .order('sort_order', { ascending: true }),
    supabase
      .from('debts')
      .select('id, name, current_balance, linked_asset_id')
      .eq('user_id', user.id)
      .eq('debt_type', 'mortgage')
      .eq('is_active', true),
    supabase
      .from('transactions')
      .select('amount')
      .gte('date', monthStart)
      .lt('date', monthEnd),
    supabase
      .from('bank_accounts')
      .select('id, linked_asset_id, balance')
      .not('linked_asset_id', 'is', null)
      .eq('is_active', true),
    supabase
      .from('profiles')
      .select('budgeting_active')
      .single(),
    supabase
      .from('valuations')
      .select('*')
      .eq('entity_type', 'asset')
      .order('valuation_date', { ascending: true }),
  ])

  const assets = (assetsRes.data ?? []) as Array<Record<string, unknown>>
  const mortgages = (mortgageRes.data ?? []) as AssetsPageData['mortgages']
  const budgetingActive = profileRes.data?.budgeting_active !== false

  // Calculate daily expenses
  const monthlyExpenses = (txRes.data ?? []).reduce((sum, t) => {
    const amt = Number(t.amount)
    return amt < 0 ? sum + Math.abs(amt) : sum
  }, 0)
  const dailyExpenses = monthlyExpenses > 0 ? monthlyExpenses / 30 : 0

  // Bank account links
  const linkedBankAccounts = (bankLinksRes.data ?? []) as AssetsPageData['linkedBankAccounts']

  // Group valuations by entity_id
  const valuations: Record<string, Array<Record<string, unknown>>> = {}
  for (const v of (valuationsRes.data ?? []) as Array<Record<string, unknown>>) {
    const entityId = v.entity_id as string
    if (!valuations[entityId]) valuations[entityId] = []
    valuations[entityId].push(v)
  }

  // ── Cards-decoraties: sparklines + kpiRefs + connections ─────
  // Zelfde data als de categorie-pagina laadt zodat `<VermogenAssetCard>`
  // op deze overview identiek rendert als op `/core/assets/[type]`.
  const assetIds = assets
    .map((a) => a.id as string | undefined)
    .filter((id): id is string => typeof id === 'string')

  const [sparklinesResult, kpiRefsResult, connectionsResult] = await Promise.allSettled([
    assetIds.length > 0
      ? loadEntitySparklines(supabase, 'asset', assetIds)
      : Promise.resolve({} as Record<string, number[]>),
    loadKpiContextRefs(supabase),
    assetIds.length > 0
      ? loadConnectionsByAssetIds(supabase, assetIds)
      : Promise.resolve({} as Record<string, AssetConnectionSummary>),
  ])

  const assetSparklines = sparklinesResult.status === 'fulfilled' ? sparklinesResult.value : {}
  const kpiRefs = kpiRefsResult.status === 'fulfilled' ? kpiRefsResult.value : null
  const connectionsByAssetId = connectionsResult.status === 'fulfilled' ? connectionsResult.value : {}

  return {
    assets,
    mortgages,
    dailyExpenses,
    linkedBankAccounts,
    budgetingActive,
    valuations,
    assetSparklines,
    kpiRefs,
    connectionsByAssetId,
  }
})

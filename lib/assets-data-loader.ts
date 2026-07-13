// lib/assets-data-loader.ts
// Server-side data loader for the Assets page.
// Provides initial data to eliminate the client-side JS→fetch waterfall.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadEntitySparklines } from './load-entity-sparklines'
import { loadKpiContextRefs, type KpiContextRefs } from './kpi-context'
import { loadConnectionsByAssetIds, type AssetConnectionSummary } from './connections-data'
import { loadPerspectiveDataServer } from './household/perspective-loader-server'
import { getRecentDailyExpenseRate } from './expense-rate'
import { parseHousingStrategy, type HousingStrategyConfig } from './housing-strategy'
import { buildUnlinkedCashAssets } from './unlinked-cash-assets'
import type { Perspective } from './household-data'

// ── Types ──────────────────────────────────────────────────────

/** Huishoud-context die de client nodig heeft om aandeel/badges te renderen. */
export interface AssetsPerspectiveContext {
  userId: string
  hasHousehold: boolean
  partnerId: string | null
  partnerName: string | null
  mySharePct: number
}

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
  /** Perspectief waarmee de assets gestempeld zijn (eigen/huishouden/partner). */
  perspective: Perspective
  /** Huishoud-context voor aandeel-/badge-rendering op de kaarten. */
  context: AssetsPerspectiveContext
  /** Eigen-woning-strategie (geparsed) — gating-bron voor het "excl. eigen
   *  woning"-subtotaal (dubbele grondslag). Meegeleverd zodat de client de
   *  splitsing zonder flash bij de eerste render kan tonen. */
  housingStrategyConfig: HousingStrategyConfig
}

// ── Loader ─────────────────────────────────────────────────────

export const loadAssetsData = cache(async (
  supabase: SupabaseClient,
  perspective: Perspective = 'personal',
): Promise<AssetsPageData> => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const now = new Date()

  // Bezittingen komen uit de perspectief-loader (single source of truth voor
  // ownership-/privacy-filtering). De rest (hypotheken, transacties,
  // bankkoppelingen, profiel, waarderingen) blijft een directe query.
  const [perspectiveData, mortgageRes, expenseRate, bankLinksRes, unlinkedBankRes, profileRes, valuationsRes] = await Promise.all([
    loadPerspectiveDataServer(supabase, perspective),
    supabase
      .from('debts')
      .select('id, name, current_balance, linked_asset_id')
      .eq('user_id', user.id)
      .eq('debt_type', 'mortgage')
      .eq('is_active', true),
    // Canoniek 12-mnd rolling dagtarief via de gedeelde bron (KRUIS-20) i.p.v. de
    // losse huidige kalendermaand — zelfde €/dag als balans/vermogen-rapport en de
    // dashboard-widgets, zodat de bezittingen-pagina dezelfde vrijheidstijd toont
    // voor hetzelfde bedrag.
    getRecentDailyExpenseRate(supabase, now),
    supabase
      .from('bank_accounts')
      .select('id, linked_asset_id, balance')
      .not('linked_asset_id', 'is', null)
      .eq('is_active', true),
    // Ongekoppelde bankrekeningen (linked_asset_id IS NULL): echte cash-
    // bezittingen die alleen in bank_accounts staan (geen companion cash-asset).
    // Zelfde bron/telling als horizon-data-loader's `unlinkedCash`, zodat het
    // bezittingen-totaal aansluit op de canonieke `totalAssets` / hero-kaart.
    // RLS scoopt dit tot de eigen rekeningen van de gebruiker.
    supabase
      .from('bank_accounts')
      .select('id, name, balance')
      .is('linked_asset_id', null)
      .eq('is_active', true),
    supabase
      .from('profiles')
      .select('budgeting_active, housing_strategy_config')
      .single(),
    supabase
      .from('valuations')
      .select('*')
      .eq('entity_type', 'asset')
      .order('valuation_date', { ascending: true }),
  ])

  // Sorteer op sort_order (de loader sorteert niet) zodat de volgorde gelijk
  // blijft aan de oude directe query.
  const sortedAssets = [...perspectiveData.assets].sort(
    (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0),
  ) as Array<Record<string, unknown>>

  // Ongekoppelde bankrekeningen als synthetische cash-bezittingen — alleen in
  // eigen-inclusieve perspectieven (personal/household). In 'partner'-perspectief
  // toont de lijst bewust de bezittingen van de partner; de eigen rekeningen
  // horen daar niet bij. RLS levert sowieso alleen de eigen rekeningen.
  const unlinkedCashAssets =
    perspective === 'partner'
      ? []
      : (buildUnlinkedCashAssets(unlinkedBankRes.data ?? []) as unknown as Array<Record<string, unknown>>)
  const assets = [...sortedAssets, ...unlinkedCashAssets]
  const mortgages = (mortgageRes.data ?? []) as AssetsPageData['mortgages']
  const budgetingActive = profileRes.data?.budgeting_active !== false
  const housingStrategyConfig = parseHousingStrategy(
    (profileRes.data as { housing_strategy_config?: unknown } | null)?.housing_strategy_config,
  )

  // Canoniek dagtarief (€/dag) — 12-mnd rolling grondslag (zie Promise.all).
  const dailyExpenses = expenseRate.dailyRate

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
    .filter((a) => a._aggregated !== true && a._syntheticCash !== true)
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

  const ctx = perspectiveData.context

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
    perspective: perspectiveData.perspective,
    context: {
      userId: ctx.userId,
      hasHousehold: ctx.hasHousehold,
      partnerId: ctx.partnerId,
      partnerName: ctx.partnerName,
      mySharePct: ctx.mySharePct,
    },
    housingStrategyConfig,
  }
})

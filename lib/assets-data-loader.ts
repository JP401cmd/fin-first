// lib/assets-data-loader.ts
// Server-side data loader for the Assets page.
// Provides initial data to eliminate the client-side JS→fetch waterfall.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────

export interface AssetsPageData {
  assets: Array<Record<string, unknown>>
  mortgages: Array<{ id: string; name: string; current_balance: number; linked_asset_id: string | null }>
  dailyExpenses: number
  linkedBankAccounts: Array<{ id: string; linked_asset_id: string; balance: number }>
  budgetingActive: boolean
  valuations: Record<string, Array<Record<string, unknown>>>
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

  return {
    assets,
    mortgages,
    dailyExpenses,
    linkedBankAccounts,
    budgetingActive,
    valuations,
  }
})

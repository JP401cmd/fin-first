import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computePerspectiveNetWorth, computeSharePct, type SplitMode } from '@/lib/household-data'

/**
 * GET /api/household/data?perspective=personal|household
 *
 * Returns financial data from the user's perspective:
 * - personal: user's own items + their share of shared items
 * - household: all items (personal from both partners + shared)
 *
 * Includes cost splitting calculation and net worth breakdown.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const perspective = (request.nextUrl.searchParams.get('perspective') ?? 'personal') as 'personal' | 'household'

  // Fetch household info
  const { data: members } = await supabase
    .from('household_members')
    .select('user_id, role')

  const hasHousehold = members && members.length > 0
  const partnerId = members?.find(m => m.user_id !== user.id)?.user_id

  // Fetch household settings
  let splitMode: SplitMode = 'equal'
  let customSplitPct: number | null = null
  let primaryPayerId: string | null = null
  let householdName = 'Huishouden'

  if (hasHousehold) {
    const { data: myMembership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .single()

    if (myMembership) {
      const { data: household } = await supabase
        .from('households')
        .select('name, split_mode, custom_split_pct, primary_payer_id')
        .eq('id', myMembership.household_id)
        .single()

      if (household) {
        householdName = household.name
        splitMode = household.split_mode as SplitMode
        customSplitPct = household.custom_split_pct
        primaryPayerId = household.primary_payer_id
      }
    }
  }

  // Calculate share percentage
  // For income_ratio mode, we'd need income data from budgets
  let myIncome = 0
  let partnerIncome = 0

  if (splitMode === 'income_ratio') {
    // Try to get income from income budgets
    const { data: incomeBudgets } = await supabase
      .from('budgets')
      .select('user_id, default_limit')
      .eq('budget_type', 'income')

    if (incomeBudgets) {
      myIncome = incomeBudgets
        .filter(b => b.user_id === user.id)
        .reduce((sum, b) => sum + b.default_limit, 0)
      if (partnerId) {
        partnerIncome = incomeBudgets
          .filter(b => b.user_id === partnerId)
          .reduce((sum, b) => sum + b.default_limit, 0)
      }
    }
  }

  const mySharePct = computeSharePct(
    { splitMode, customSplitPct, primaryPayerId },
    user.id,
    myIncome,
    partnerIncome,
  )

  // Fetch assets and debts (RLS filters to user's own + household shared)
  const [assetsRes, debtsRes, budgetsRes] = await Promise.all([
    supabase.from('assets').select('id, name, asset_type, current_value, ownership, user_id, is_active, household_id').eq('is_active', true),
    supabase.from('debts').select('id, name, debt_type, current_balance, ownership, user_id, is_active, household_id').eq('is_active', true),
    supabase.from('budgets').select('id, name, budget_type, default_limit, ownership, user_id, household_id'),
  ])

  const assets = assetsRes.data ?? []
  const debts = debtsRes.data ?? []
  const budgets = budgetsRes.data ?? []

  // Compute perspective-aware net worth
  const netWorthData = computePerspectiveNetWorth(
    assets.map(a => ({ current_value: a.current_value, ownership: a.ownership ?? 'personal', user_id: a.user_id, is_active: a.is_active })),
    debts.map(d => ({ current_balance: d.current_balance, ownership: d.ownership ?? 'personal', user_id: d.user_id, is_active: d.is_active })),
    perspective,
    mySharePct,
    user.id,
  )

  // Separate assets/debts/budgets by ownership for the response
  const personalAssets = assets.filter(a => a.ownership === 'personal' && a.user_id === user.id)
  const sharedAssets = assets.filter(a => a.ownership === 'shared')
  const personalDebts = debts.filter(d => d.ownership === 'personal' && d.user_id === user.id)
  const sharedDebts = debts.filter(d => d.ownership === 'shared')
  const personalBudgets = budgets.filter(b => b.ownership === 'personal' && b.user_id === user.id)
  const sharedBudgets = budgets.filter(b => b.ownership === 'shared')

  return NextResponse.json({
    perspective,
    hasHousehold: !!hasHousehold,
    householdName,
    splitMode,
    mySharePct,
    myIncome,
    partnerIncome,
    netWorth: netWorthData,
    counts: {
      personalAssets: personalAssets.length,
      sharedAssets: sharedAssets.length,
      personalDebts: personalDebts.length,
      sharedDebts: sharedDebts.length,
      personalBudgets: personalBudgets.length,
      sharedBudgets: sharedBudgets.length,
    },
    assets: perspective === 'household' ? assets : [...personalAssets, ...sharedAssets],
    debts: perspective === 'household' ? debts : [...personalDebts, ...sharedDebts],
    budgets: perspective === 'household' ? budgets : [...personalBudgets, ...sharedBudgets],
  })
}

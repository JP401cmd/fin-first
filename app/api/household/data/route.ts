import { NextRequest, NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import {
  computePerspectiveNetWorth,
  computeSharePct,
  normalisePrivacySettings,
  applyPrivacyFilter,
  type SplitMode,
  type PrivacySettings,
} from '@/lib/household-data'

/**
 * GET /api/household/data?perspective=personal|household
 *
 * Returns financial data from the user's perspective:
 * - personal: user's own items + their share of shared items
 * - household: all items (personal from both partners + shared)
 *
 * When perspective=household, partner's privacy settings are respected:
 * - full: all individual items visible
 * - totals: partner's personal items aggregated into a single total
 * - hidden: partner's personal items removed entirely
 *
 * Includes cost splitting calculation and net worth breakdown.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const perspective = (request.nextUrl.searchParams.get('perspective') ?? 'personal') as 'personal' | 'household'

  // Fetch household info (including privacy_settings)
  const { data: members } = await supabase
    .from('household_members')
    .select('user_id, role, privacy_settings')

  const hasHousehold = members && members.length > 0
  const partnerMember = members?.find(m => m.user_id !== claims.sub)
  const partnerId = partnerMember?.user_id

  // Get partner's privacy settings (what the partner allows us to see)
  let partnerPrivacy: PrivacySettings | null = null
  if (partnerId && perspective === 'household') {
    // First try household_members.privacy_settings column
    const rawPrivacy = partnerMember?.privacy_settings as Record<string, string> | null
    if (rawPrivacy) {
      partnerPrivacy = normalisePrivacySettings(rawPrivacy)
    } else {
      // Fallback: try app_settings
      const { data: appSetting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', `household_privacy:${partnerId}`)
        .single()
      partnerPrivacy = normalisePrivacySettings(appSetting?.value ?? null)
    }
  }

  // Fetch household settings
  let splitMode: SplitMode = 'equal'
  let customSplitPct: number | null = null
  let primaryPayerId: string | null = null
  let householdName = 'Huishouden'

  if (hasHousehold) {
    const { data: myMembership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', claims.sub)
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
  let myIncome = 0
  let partnerIncome = 0

  if (splitMode === 'income_ratio') {
    const { data: incomeBudgets } = await supabase
      .from('budgets')
      .select('user_id, default_limit')
      .eq('budget_type', 'income')

    if (incomeBudgets) {
      myIncome = incomeBudgets
        .filter(b => b.user_id === claims.sub)
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
    claims.sub,
    myIncome,
    partnerIncome,
  )

  // Fetch assets, debts, and budgets (RLS filters to user's own + household shared)
  const [assetsRes, debtsRes, budgetsRes] = await Promise.all([
    supabase.from('assets').select('id, name, asset_type, current_value, ownership, user_id, is_active, household_id').eq('is_active', true),
    supabase.from('debts').select('id, name, debt_type, current_balance, ownership, user_id, is_active, household_id').eq('is_active', true),
    supabase.from('budgets').select('id, name, budget_type, default_limit, ownership, user_id, household_id'),
  ])

  const assets = assetsRes.data ?? []
  const debts = debtsRes.data ?? []
  const budgets = budgetsRes.data ?? []

  // Separate items by ownership and user
  const myPersonalAssets = assets.filter(a => a.ownership === 'personal' && a.user_id === claims.sub)
  const partnerPersonalAssets = assets.filter(a => a.ownership === 'personal' && a.user_id === partnerId)
  const sharedAssets = assets.filter(a => a.ownership === 'shared')

  const myPersonalDebts = debts.filter(d => d.ownership === 'personal' && d.user_id === claims.sub)
  const partnerPersonalDebts = debts.filter(d => d.ownership === 'personal' && d.user_id === partnerId)
  const sharedDebts = debts.filter(d => d.ownership === 'shared')

  const myPersonalBudgets = budgets.filter(b => b.ownership === 'personal' && b.user_id === claims.sub)
  const partnerPersonalBudgets = budgets.filter(b => b.ownership === 'personal' && b.user_id === partnerId)
  const sharedBudgets = budgets.filter(b => b.ownership === 'shared')

  // Apply privacy filtering for household perspective
  let visiblePartnerAssets = partnerPersonalAssets
  let visiblePartnerDebts = partnerPersonalDebts
  let visiblePartnerBudgets = partnerPersonalBudgets
  const privacyApplied: Record<string, { level: string; aggregated: boolean }> = {}

  if (perspective === 'household' && partnerPrivacy) {
    // Assets privacy
    const assetResult = applyPrivacyFilter(
      partnerPersonalAssets,
      partnerPrivacy.assets,
      'Partner vermogen (totaal)',
      'current_value',
    )
    visiblePartnerAssets = assetResult.items
    privacyApplied.assets = {
      level: partnerPrivacy.assets,
      aggregated: assetResult.isAggregated,
    }

    // Debts privacy
    const debtResult = applyPrivacyFilter(
      partnerPersonalDebts,
      partnerPrivacy.debts,
      'Partner schulden (totaal)',
      'current_balance',
    )
    visiblePartnerDebts = debtResult.items
    privacyApplied.debts = {
      level: partnerPrivacy.debts,
      aggregated: debtResult.isAggregated,
    }

    // Budgets privacy
    const budgetResult = applyPrivacyFilter(
      partnerPersonalBudgets,
      partnerPrivacy.budgets,
      'Partner budget (totaal)',
      'default_limit',
    )
    visiblePartnerBudgets = budgetResult.items
    privacyApplied.budgets = {
      level: partnerPrivacy.budgets,
      aggregated: budgetResult.isAggregated,
    }
  }

  // Build the response based on perspective
  let responseAssets, responseDebts, responseBudgets

  if (perspective === 'household') {
    responseAssets = [...myPersonalAssets, ...visiblePartnerAssets, ...sharedAssets]
    responseDebts = [...myPersonalDebts, ...visiblePartnerDebts, ...sharedDebts]
    responseBudgets = [...myPersonalBudgets, ...visiblePartnerBudgets, ...sharedBudgets]
  } else {
    responseAssets = [...myPersonalAssets, ...sharedAssets]
    responseDebts = [...myPersonalDebts, ...sharedDebts]
    responseBudgets = [...myPersonalBudgets, ...sharedBudgets]
  }

  // Compute perspective-aware net worth
  // For net worth computation, use the privacy-filtered items to get correct totals
  const netWorthAssets = responseAssets.map(a => ({
    current_value: a.current_value,
    ownership: (a.ownership ?? 'personal') as 'personal' | 'shared',
    user_id: a.user_id,
    is_active: a.is_active,
  }))
  const netWorthDebts = responseDebts.map(d => ({
    current_balance: d.current_balance,
    ownership: (d.ownership ?? 'personal') as 'personal' | 'shared',
    user_id: d.user_id,
    is_active: d.is_active,
  }))

  const netWorthData = computePerspectiveNetWorth(
    netWorthAssets,
    netWorthDebts,
    perspective,
    mySharePct,
    claims.sub,
  )

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
      personalAssets: myPersonalAssets.length,
      sharedAssets: sharedAssets.length,
      personalDebts: myPersonalDebts.length,
      sharedDebts: sharedDebts.length,
      personalBudgets: myPersonalBudgets.length,
      sharedBudgets: sharedBudgets.length,
    },
    assets: responseAssets,
    debts: responseDebts,
    budgets: responseBudgets,
    // Privacy metadata — allows the UI to show "totalen" badges or "verborgen" notices
    ...(perspective === 'household' && partnerPrivacy ? { privacyApplied } : {}),
  })
}

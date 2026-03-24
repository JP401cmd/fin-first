import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  INVULFASE_ITEMS,
  CATEGORY_META,
  CATEGORY_ORDER,
  getActiveItems,
  calculateProgress,
  type InvulfaseDataState,
  type InvulfaseConditionContext,
  type InvulfaseStatus,
} from '@/lib/invulfase-items'

/**
 * GET /api/invulfase/checklist — Returns the full invulfase checklist
 * with auto-detected statuses and weighted progress.
 *
 * Categories are returned in display order. Conditional categories
 * (budgetten, holdings) only appear when their conditions are met.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    // Query all data in parallel
    // Core queries (tables always exist)
    const [
      assetsRes,
      debtsRes,
      profileRes,
      budgetsRes,
      transactionsRes,
    ] = await Promise.all([
      supabase
        .from('assets')
        .select('asset_type, has_holdings_tracking, has_budget_tracking')
        .eq('user_id', user.id)
        .eq('is_active', true),
      supabase
        .from('debts')
        .select('debt_type')
        .eq('user_id', user.id)
        .eq('is_active', true),
      supabase
        .from('profiles')
        .select('full_name, date_of_birth, household_type, expected_return, inflation_rate, budgeting_active, module_colors, feature_preferences')
        .eq('id', user.id)
        .single(),
      supabase
        .from('budgets')
        .select('id')
        .eq('user_id', user.id)
        .is('parent_id', null)
        .limit(1),
      supabase
        .from('transactions')
        .select('id')
        .eq('user_id', user.id)
        .limit(1),
    ])

    // Optional queries (tables may not exist — errors are ignored via ?? fallback)
    const [bankConnectionsRes, holdingsRes] = await Promise.all([
      supabase
        .from('bank_connections')
        .select('id, status')
        .eq('user_id', user.id),
      supabase
        .from('holdings')
        .select('id, isin, asset_id')
        .eq('user_id', user.id)
        .eq('is_active', true),
    ])

    const assets = assetsRes.data ?? []
    const debts = debtsRes.data ?? []
    const profile = profileRes.data
    const featurePrefs = (profile?.feature_preferences as Record<string, unknown>) ?? {}
    const skippedArray = (featurePrefs._invulfase_skipped as string[]) ?? []

    // Derive asset type sets
    const assetTypes = new Set(assets.map(a => a.asset_type))
    const debtTypes = new Set(debts.map(d => d.debt_type))

    const hasActiveBankConnection = (bankConnectionsRes.data ?? []).some(
      (c: { status: string }) => c.status === 'authorized'
    )
    const hasBudgetTracking = assets.some(a => a.has_budget_tracking === true)
    const hasHoldingsTracking = assets.some(a => a.has_holdings_tracking === true)

    const holdings = holdingsRes.data ?? []
    const hasHoldings = holdings.length > 0
    const hasHoldingsWithIsin = holdings.some((h: { isin: string | null }) => h.isin !== null && h.isin !== '')

    // Build condition context
    const conditionCtx: InvulfaseConditionContext = {
      budgetingActive: profile?.budgeting_active !== false, // default true
      hasBudgetTracking,
      hasHoldingsTracking,
      hasActiveBankConnection,
    }

    // Build data state
    const otherAssetTypes = ['retirement', 'crypto', 'vehicle', 'physical', 'deelneming', 'levensverzekering', 'vordering', 'real_estate', 'other']
    const loanTypes = ['personal_loan', 'student_loan', 'car_loan']
    const otherDebtTypes = ['revolving_credit', 'payment_plan', 'belastingschuld', 'familielening', 'dga_schuld', 'other']

    const dataState: InvulfaseDataState = {
      hasEigenHuis: assetTypes.has('eigen_huis'),
      hasCash: assetTypes.has('cash'),
      hasSavings: assetTypes.has('savings'),
      hasInvestments: assetTypes.has('investment'),
      hasOtherAssets: otherAssetTypes.some(t => assetTypes.has(t)),
      hasMortgage: debtTypes.has('mortgage'),
      hasCreditCard: debtTypes.has('credit_card'),
      hasLoan: loanTypes.some(t => debtTypes.has(t)),
      hasOtherDebts: otherDebtTypes.some(t => debtTypes.has(t)),
      hasFullName: !!profile?.full_name,
      hasDateOfBirth: !!profile?.date_of_birth,
      hasHouseholdType: !!profile?.household_type,
      hasFireParams: profile?.expected_return != null || profile?.inflation_rate != null,
      hasModuleColors: profile?.module_colors != null,
      hasBudgets: (budgetsRes.data?.length ?? 0) > 0,
      hasActiveBankConnection,
      hasTransactions: (transactionsRes.data?.length ?? 0) > 0,
      hasHoldings,
      hasHoldingsWithIsin,
      skippedItems: new Set(skippedArray),
    }

    // Get active items based on conditions
    const activeItems = getActiveItems(conditionCtx)

    // Build categorized response
    const categories = CATEGORY_ORDER
      .map(catKey => {
        const meta = CATEGORY_META[catKey]
        // Skip conditional categories that don't meet their condition
        if (meta.conditional && meta.condition && !meta.condition(conditionCtx)) {
          return null
        }
        const catItems = activeItems
          .filter(item => item.category === catKey)
          .map(item => {
            const status: InvulfaseStatus = item.autoDetect(dataState)
            return {
              key: item.key,
              title: item.title,
              description: item.description,
              href: item.href,
              weight: item.weight,
              status,
            }
          })
        // Skip empty categories (all items filtered by item-level conditions)
        if (catItems.length === 0) return null
        return {
          key: catKey,
          label: meta.label,
          conditional: meta.conditional,
          items: catItems,
        }
      })
      .filter(Boolean)

    // Calculate weighted progress
    const progress = calculateProgress(activeItems, dataState)

    return NextResponse.json({
      categories,
      progress: {
        completed: progress.completedWeight,
        total: progress.totalWeight,
        skipped: progress.skippedWeight,
        percentage: progress.percentage,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

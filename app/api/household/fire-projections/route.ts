import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeFireProjection, computeFireRange, type HorizonInput, type FireProjection, type FireRange } from '@/lib/horizon-data'

/**
 * GET /api/household/fire-projections
 *
 * Returns FIRE projections for the household:
 * - Combined household projection (merged income, expenses, assets, debts)
 * - Individual projections per partner
 * - Partner comparison data
 *
 * Requires authenticated user with a household.
 */

interface PartnerFinancials {
  userId: string
  fullName: string | null
  isCurrentUser: boolean
  totalAssets: number
  totalDebts: number
  monthlyIncome: number
  monthlyExpenses: number
  monthlyContributions: number
  yearlyMustExpenses: number
  dateOfBirth: string | null
  netWorth: number
  // Shared items attributed to this partner
  sharedAssetsValue: number
  sharedDebtsValue: number
}

interface HouseholdFireResponse {
  hasHousehold: boolean
  householdName: string
  // Combined household projection
  combined: {
    input: HorizonInput
    projection: FireProjection
    range: FireRange
  }
  // Individual partner projections
  partners: Array<{
    userId: string
    fullName: string | null
    isCurrentUser: boolean
    financials: PartnerFinancials
    input: HorizonInput
    projection: FireProjection
    range: FireRange
  }>
  // Comparison metrics
  comparison: {
    combinedNetWorth: number
    combinedMonthlyIncome: number
    combinedMonthlyExpenses: number
    combinedMonthlySavings: number
    combinedSavingsRate: number
    combinedFireTarget: number
    combinedFreedomPercentage: number
    sharedFireTarget: number
    individualFireTargets: Array<{
      userId: string
      fullName: string | null
      fireTarget: number
      fireAge: number | null
      freedomPercentage: number
    }>
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Check household membership
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({
      hasHousehold: false,
      message: 'Geen huishouden gevonden. Maak eerst een huishouden aan via je profiel.',
    })
  }

  // Get household info
  const { data: household } = await supabase
    .from('households')
    .select('id, name, split_mode, custom_split_pct, primary_payer_id')
    .eq('id', membership.household_id)
    .single()

  if (!household) {
    return NextResponse.json({ error: 'Huishouden niet gevonden' }, { status: 404 })
  }

  // Get all household members
  const { data: members } = await supabase
    .from('household_members')
    .select('user_id, role')
    .eq('household_id', membership.household_id)
    .order('sort_order', { ascending: true })

  if (!members || members.length === 0) {
    return NextResponse.json({ error: 'Geen leden gevonden' }, { status: 404 })
  }

  const memberIds = members.map(m => m.user_id)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

  // Fetch all financial data for all household members in parallel
  const [
    profilesResult,
    allTransactionsResult,
    allAssetsResult,
    allDebtsResult,
    allEssentialBudgetsResult,
    allChildBudgetsResult,
  ] = await Promise.all([
    // Profiles for all members
    supabase
      .from('profiles')
      .select('id, full_name, date_of_birth')
      .in('id', memberIds),
    // Current month transactions for all members
    supabase
      .from('transactions')
      .select('amount, user_id')
      .in('user_id', memberIds)
      .gte('date', monthStart)
      .lt('date', monthEnd),
    // Active assets for all members (personal + shared)
    supabase
      .from('assets')
      .select('current_value, monthly_contribution, user_id, ownership, is_active')
      .eq('is_active', true),
    // Active debts for all members
    supabase
      .from('debts')
      .select('current_balance, user_id, ownership, is_active')
      .eq('is_active', true),
    // Essential budgets (for yearly must-expenses)
    supabase
      .from('budgets')
      .select('id, default_limit, interval, user_id, ownership')
      .eq('is_essential', true)
      .in('budget_type', ['expense'])
      .is('parent_id', null),
    // Child budgets
    supabase
      .from('budgets')
      .select('id, parent_id, default_limit, user_id, ownership')
      .not('parent_id', 'is', null),
  ])

  const profiles = profilesResult.data ?? []
  const allTransactions = allTransactionsResult.data ?? []
  const allAssets = allAssetsResult.data ?? []
  const allDebts = allDebtsResult.data ?? []
  const allEssentialBudgets = allEssentialBudgetsResult.data ?? []
  const allChildBudgets = allChildBudgetsResult.data ?? []

  // Compute financials per partner
  const partnersData: PartnerFinancials[] = memberIds.map(memberId => {
    const profile = profiles.find(p => p.id === memberId)

    // Transactions for this member
    const memberTx = allTransactions.filter(t => t.user_id === memberId)
    let monthlyIncome = 0
    let monthlyExpenses = 0
    for (const tx of memberTx) {
      const amt = Number(tx.amount)
      if (amt > 0) monthlyIncome += amt
      else monthlyExpenses += Math.abs(amt)
    }

    // Personal assets + share of shared assets
    const personalAssets = allAssets
      .filter(a => a.ownership === 'personal' && a.user_id === memberId)
      .reduce((sum, a) => sum + Number(a.current_value), 0)
    const sharedAssets = allAssets
      .filter(a => a.ownership === 'shared')
      .reduce((sum, a) => sum + Number(a.current_value), 0)
    // Each partner owns 50% of shared assets for individual calculations
    const sharedAssetsValue = sharedAssets / Math.max(memberIds.length, 1)
    const totalAssets = personalAssets + sharedAssetsValue

    // Personal debts + share of shared debts
    const personalDebts = allDebts
      .filter(d => d.ownership === 'personal' && d.user_id === memberId)
      .reduce((sum, d) => sum + Number(d.current_balance), 0)
    const sharedDebts = allDebts
      .filter(d => d.ownership === 'shared')
      .reduce((sum, d) => sum + Number(d.current_balance), 0)
    const sharedDebtsValue = sharedDebts / Math.max(memberIds.length, 1)
    const totalDebts = personalDebts + sharedDebtsValue

    // Monthly contributions
    const personalContributions = allAssets
      .filter(a => a.ownership === 'personal' && a.user_id === memberId)
      .reduce((sum, a) => sum + Number(a.monthly_contribution), 0)
    const sharedContributions = allAssets
      .filter(a => a.ownership === 'shared')
      .reduce((sum, a) => sum + Number(a.monthly_contribution), 0)
    const monthlyContributions = personalContributions + (sharedContributions / Math.max(memberIds.length, 1))

    // Yearly must expenses
    const memberBudgets = allEssentialBudgets.filter(
      b => b.user_id === memberId || b.ownership === 'shared'
    )
    let yearlyMustExpenses = 0
    for (const b of memberBudgets) {
      const children = allChildBudgets.filter(c => c.parent_id === b.id)
      const limit = children.length > 0
        ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
        : Number(b.default_limit)
      if (b.ownership === 'shared') {
        // Split shared budget expenses
        const share = limit / Math.max(memberIds.length, 1)
        yearlyMustExpenses += (b as { interval?: string }).interval === 'monthly' ? share * 12
          : (b as { interval?: string }).interval === 'quarterly' ? share * 4
          : share
      } else {
        yearlyMustExpenses += (b as { interval?: string }).interval === 'monthly' ? limit * 12
          : (b as { interval?: string }).interval === 'quarterly' ? limit * 4
          : limit
      }
    }

    return {
      userId: memberId,
      fullName: profile?.full_name ?? null,
      isCurrentUser: memberId === user.id,
      totalAssets,
      totalDebts,
      monthlyIncome,
      monthlyExpenses,
      monthlyContributions,
      yearlyMustExpenses,
      dateOfBirth: profile?.date_of_birth ?? null,
      netWorth: totalAssets - totalDebts,
      sharedAssetsValue,
      sharedDebtsValue,
    }
  })

  // Compute combined household totals
  const combinedTotalAssets = (() => {
    // Sum all personal assets from all members + all shared assets (once, not duplicated)
    const personalTotal = allAssets
      .filter(a => a.ownership === 'personal' && memberIds.includes(a.user_id))
      .reduce((sum, a) => sum + Number(a.current_value), 0)
    const sharedTotal = allAssets
      .filter(a => a.ownership === 'shared')
      .reduce((sum, a) => sum + Number(a.current_value), 0)
    return personalTotal + sharedTotal
  })()

  const combinedTotalDebts = (() => {
    const personalTotal = allDebts
      .filter(d => d.ownership === 'personal' && memberIds.includes(d.user_id))
      .reduce((sum, d) => sum + Number(d.current_balance), 0)
    const sharedTotal = allDebts
      .filter(d => d.ownership === 'shared')
      .reduce((sum, d) => sum + Number(d.current_balance), 0)
    return personalTotal + sharedTotal
  })()

  const combinedMonthlyIncome = partnersData.reduce((sum, p) => sum + p.monthlyIncome, 0)
  const combinedMonthlyExpenses = partnersData.reduce((sum, p) => sum + p.monthlyExpenses, 0)

  const combinedMonthlyContributions = (() => {
    const personalTotal = allAssets
      .filter(a => a.ownership === 'personal' && memberIds.includes(a.user_id))
      .reduce((sum, a) => sum + Number(a.monthly_contribution), 0)
    const sharedTotal = allAssets
      .filter(a => a.ownership === 'shared')
      .reduce((sum, a) => sum + Number(a.monthly_contribution), 0)
    return personalTotal + sharedTotal
  })()

  const combinedYearlyMustExpenses = (() => {
    // All personal budgets from all members + all shared budgets (once)
    const processed = new Set<string>()
    let total = 0
    for (const b of allEssentialBudgets) {
      if (processed.has(b.id)) continue
      processed.add(b.id)
      if (!memberIds.includes(b.user_id) && b.ownership !== 'shared') continue
      const children = allChildBudgets.filter(c => c.parent_id === b.id)
      const limit = children.length > 0
        ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
        : Number(b.default_limit)
      total += (b as { interval?: string }).interval === 'monthly' ? limit * 12
        : (b as { interval?: string }).interval === 'quarterly' ? limit * 4
        : limit
    }
    return total
  })()

  // Use the oldest date of birth for combined household (most conservative)
  const dateOfBirths = partnersData
    .map(p => p.dateOfBirth)
    .filter((d): d is string => d !== null)
  const combinedDob = dateOfBirths.length > 0
    ? dateOfBirths.sort()[0] // Oldest person (earliest DOB)
    : null

  // Compute combined household FIRE projection
  const combinedInput: HorizonInput = {
    totalAssets: combinedTotalAssets,
    totalDebts: combinedTotalDebts,
    monthlyIncome: combinedMonthlyIncome,
    monthlyExpenses: combinedMonthlyExpenses,
    monthlyContributions: combinedMonthlyContributions,
    yearlyMustExpenses: combinedYearlyMustExpenses,
    dateOfBirth: combinedDob,
  }

  const combinedProjection = computeFireProjection(combinedInput)
  const combinedRange = computeFireRange(combinedInput)

  // Compute individual partner projections
  const partnersProjections = partnersData.map(partner => {
    const partnerInput: HorizonInput = {
      totalAssets: partner.totalAssets,
      totalDebts: partner.totalDebts,
      monthlyIncome: partner.monthlyIncome,
      monthlyExpenses: partner.monthlyExpenses,
      monthlyContributions: partner.monthlyContributions,
      yearlyMustExpenses: partner.yearlyMustExpenses,
      dateOfBirth: partner.dateOfBirth,
    }

    return {
      userId: partner.userId,
      fullName: partner.fullName,
      isCurrentUser: partner.isCurrentUser,
      financials: partner,
      input: partnerInput,
      projection: computeFireProjection(partnerInput),
      range: computeFireRange(partnerInput),
    }
  })

  // Comparison metrics
  const combinedMonthlySavings = combinedMonthlyIncome - combinedMonthlyExpenses
  const combinedSavingsRate = combinedMonthlyIncome > 0
    ? (combinedMonthlySavings / combinedMonthlyIncome) * 100
    : 0

  const response: HouseholdFireResponse = {
    hasHousehold: true,
    householdName: household.name ?? 'Huishouden',
    combined: {
      input: combinedInput,
      projection: combinedProjection,
      range: combinedRange,
    },
    partners: partnersProjections,
    comparison: {
      combinedNetWorth: combinedTotalAssets - combinedTotalDebts,
      combinedMonthlyIncome,
      combinedMonthlyExpenses,
      combinedMonthlySavings,
      combinedSavingsRate,
      combinedFireTarget: combinedProjection.fireTarget,
      combinedFreedomPercentage: combinedProjection.freedomPercentage,
      sharedFireTarget: combinedProjection.fireTarget,
      individualFireTargets: partnersProjections.map(p => ({
        userId: p.userId,
        fullName: p.fullName,
        fireTarget: p.projection.fireTarget,
        fireAge: p.projection.fireAge,
        freedomPercentage: p.projection.freedomPercentage,
      })),
    },
  }

  return NextResponse.json(response)
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import {
  calculateBox3,
  optimizePartnerAllocation,
  type Box3Result,
  type TaxYear,
} from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { normalisePrivacySettings } from '@/lib/household-data'
import { dailyExpenseRate } from '@/lib/format'

/**
 * GET /api/household/box3?year=2025|2026
 *
 * Returns Box 3 calculations:
 * - personal: user's own calculation
 * - If household: per-partner and combined calculations
 *
 * In household mode, returns:
 * - partners[]: individual Box 3 result per partner
 * - combined: merged assets/debts calculated as fiscal partners
 * - optimalAllocation: best tax-efficient split
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const yearParam = request.nextUrl.searchParams.get('year')
  const year: TaxYear = yearParam === '2025' ? 2025 : 2026

  // Fetch household membership (incl. partner privacy settings)
  const { data: members } = await supabase
    .from('household_members')
    .select('user_id, role, privacy_settings')

  const hasHousehold = members && members.length > 1
  const partnerMember = members?.find(m => m.user_id !== claims.sub)
  const partnerId = partnerMember?.user_id

  // What the partner allows the household to see of their vermogen (Box 3 = wealth).
  // Mirrors the foundation loader (loadPerspectiveData): 'hidden' means the
  // partner's personal wealth must not be exposed here at all. Default is
  // 'totals' (DEFAULT_PRIVACY_SETTINGS) — Box 3 returns only aggregated tax
  // results per partner, so 'totals'/'full' are equivalent here; only 'hidden'
  // changes behaviour. (Security review S5.)
  const partnerVermogenLevel = normalisePrivacySettings(
    (partnerMember?.privacy_settings as Record<string, string> | null) ?? null,
  ).assets

  // Fetch all assets and debts (RLS scoped)
  const [assetsRes, debtsRes, profileRes] = await Promise.all([
    supabase.from('assets').select('*').eq('is_active', true),
    supabase.from('debts').select('*').eq('is_active', true),
    supabase.from('profiles').select('full_name'),
  ])

  const allAssets = (assetsRes.data ?? []) as Asset[]
  const allDebts = (debtsRes.data ?? []) as Debt[]
  const currentUserName = profileRes.data?.[0]?.full_name ?? 'Jij'

  // Get monthly expenses for freedom days calculation
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const monthEnd = new Date(monthStart)
  monthEnd.setMonth(monthEnd.getMonth() + 1)

  const { data: budgets } = await supabase
    .from('budgets')
    .select('default_limit, budget_type')
    .eq('budget_type', 'expense')

  const monthlyExpenses = (budgets ?? []).reduce(
    (sum, b) => sum + (Number(b.default_limit) || 0),
    0,
  )
  const dailyExpenses = monthlyExpenses > 0 ? dailyExpenseRate(monthlyExpenses) : 100

  // Separate assets/debts by user
  const myAssets = allAssets.filter(a => a.user_id === claims.sub || a.ownership === 'shared')
  const myPersonalAssets = allAssets.filter(a => a.user_id === claims.sub && a.ownership !== 'shared')
  const sharedAssets = allAssets.filter(a => a.ownership === 'shared')
  const partnerPersonalAssets = partnerId
    ? allAssets.filter(a => a.user_id === partnerId && a.ownership !== 'shared')
    : []

  const myPersonalDebts = allDebts.filter(d => d.user_id === claims.sub && d.ownership !== 'shared')
  const sharedDebts = allDebts.filter(d => d.ownership === 'shared')
  const partnerPersonalDebts = partnerId
    ? allDebts.filter(d => d.user_id === partnerId && d.ownership !== 'shared')
    : []

  // Privacy gate: when the partner hides their vermogen, drop their personal
  // assets/debts before any per-partner or combined Box 3 calculation so their
  // taxable wealth never leaks. Shared items remain (both partners own them).
  const partnerHidesVermogen = partnerVermogenLevel === 'hidden'
  const visiblePartnerAssets = partnerHidesVermogen ? [] : partnerPersonalAssets
  const visiblePartnerDebts = partnerHidesVermogen ? [] : partnerPersonalDebts

  // Personal calculation (user's own assets + their share of shared)
  const personalResult = calculateBox3({
    assets: [...myPersonalAssets, ...sharedAssets],
    debts: [...myPersonalDebts, ...sharedDebts],
    hasPartner: !!hasHousehold,
    dailyExpenses,
    year,
  })

  if (!hasHousehold || !partnerId) {
    return NextResponse.json({
      hasHousehold: false,
      year,
      personal: personalResult,
      dailyExpenses,
      currentUserName,
    })
  }

  // Get partner name
  // Need to use a service role or RPC to get partner's profile name
  // Since profiles are user-scoped, we'll use the household status endpoint pattern
  let partnerName = 'Partner'
  try {
    const { data: householdStatus } = await supabase
      .from('household_members')
      .select('user_id, household_id')
      .eq('user_id', claims.sub)
      .single()

    if (householdStatus) {
      const { data: allMembers } = await supabase
        .from('household_members')
        .select('user_id, profiles:user_id(full_name)')
        .eq('household_id', householdStatus.household_id)
        .returns<{ user_id: string; profiles: { full_name: string | null } | null }[]>()

      const partner = allMembers?.find(m => m.user_id !== claims.sub)
      if (partner && partner.profiles?.full_name) {
        partnerName = partner.profiles.full_name
      }
    }
  } catch {
    // Fall back to 'Partner'
  }

  // Partner's individual calculation
  const partnerResult = calculateBox3({
    assets: [...visiblePartnerAssets, ...sharedAssets],
    debts: [...visiblePartnerDebts, ...sharedDebts],
    hasPartner: true,
    dailyExpenses,
    year,
  })

  // Combined calculation: all assets + debts, fiscal partners
  const combinedAssets = [...myPersonalAssets, ...visiblePartnerAssets, ...sharedAssets]
  const combinedDebts = [...myPersonalDebts, ...visiblePartnerDebts, ...sharedDebts]

  const combinedResult = calculateBox3({
    assets: combinedAssets,
    debts: combinedDebts,
    hasPartner: true,
    dailyExpenses,
    year,
  })

  // Optimal allocation
  const optimalAllocation = optimizePartnerAllocation(combinedResult, {
    assets: combinedAssets,
    debts: combinedDebts,
    hasPartner: true,
    dailyExpenses,
    year,
  })

  return NextResponse.json({
    hasHousehold: true,
    year,
    dailyExpenses,
    currentUserName,
    partnerName,
    partners: [
      {
        userId: claims.sub,
        fullName: currentUserName,
        isCurrentUser: true,
        result: personalResult,
      },
      {
        userId: partnerId,
        fullName: partnerName,
        isCurrentUser: false,
        result: partnerResult,
      },
    ],
    combined: combinedResult,
    optimalAllocation,
    partnerVermogenPrivacy: partnerVermogenLevel,
  })
}

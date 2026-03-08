import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  calculateBox2,
  type Box2Deelneming,
  type TaxYear,
} from '@/lib/box2-data'
import type { Asset } from '@/lib/asset-data'

/**
 * GET /api/household/box2?year=2025|2026
 *
 * Returns Box 2 calculations based on deelneming assets:
 * - Fetches all assets with asset_type='deelneming'
 * - Builds Box2Input from annual_dividend per deelneming
 * - Runs calculateBox2() and returns full Box2Result
 *
 * In household mode, includes partner's deelnemingen in combined view.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const yearParam = request.nextUrl.searchParams.get('year')
  const year: TaxYear = yearParam === '2025' ? 2025 : 2026

  // Fetch household membership
  const { data: members } = await supabase
    .from('household_members')
    .select('user_id, role')

  const hasHousehold = members && members.length > 1
  const partnerMember = members?.find(m => m.user_id !== user.id)
  const partnerId = partnerMember?.user_id

  // Fetch all deelneming assets (RLS scoped)
  const { data: assetsRaw } = await supabase
    .from('assets')
    .select('*')
    .eq('is_active', true)
    .eq('asset_type', 'deelneming')

  const allAssets = (assetsRaw ?? []) as Asset[]

  // Get monthly expenses for freedom days calculation
  const { data: budgets } = await supabase
    .from('budgets')
    .select('default_limit, budget_type')
    .eq('budget_type', 'expense')

  const monthlyExpenses = (budgets ?? []).reduce(
    (sum, b) => sum + (Number(b.default_limit) || 0),
    0,
  )
  const dailyExpenses = monthlyExpenses > 0 ? monthlyExpenses / 30 : 100

  // Helper: convert Asset to Box2Deelneming
  function assetToDeelneming(a: Asset): Box2Deelneming {
    return {
      name: (a as any).institution || a.name || 'Deelneming',
      annual_dividend: Number((a as any).annual_dividend) || 0,
      disposal_gain: 0, // no disposal by default; could be extended
    }
  }

  // Separate assets by ownership
  const myAssets = allAssets.filter(a => a.user_id === user.id && (a as any).ownership !== 'shared')
  const sharedAssets = allAssets.filter(a => (a as any).ownership === 'shared')
  const partnerAssets = partnerId
    ? allAssets.filter(a => a.user_id === partnerId && (a as any).ownership !== 'shared')
    : []

  // Personal calculation
  const myDeelnemingen = [...myAssets, ...sharedAssets].map(assetToDeelneming)
  const personalResult = calculateBox2({
    deelnemingen: myDeelnemingen,
    year,
    hasPartner: !!hasHousehold,
    dailyExpenses,
  })

  // Get current user name
  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name')

  const currentUserName = profileData?.[0]?.full_name ?? 'Jij'

  if (!hasHousehold || !partnerId) {
    return NextResponse.json({
      hasHousehold: false,
      year,
      personal: personalResult,
      dailyExpenses,
      currentUserName,
      deelnemingen: myDeelnemingen.map((d, i) => ({
        ...d,
        assetId: [...myAssets, ...sharedAssets][i]?.id,
        currentValue: [...myAssets, ...sharedAssets][i]?.current_value,
        ownershipPct: Number(([...myAssets, ...sharedAssets][i] as any)?.ownership_percentage) || 100,
      })),
    })
  }

  // Get partner name
  let partnerName = 'Partner'
  try {
    const { data: householdStatus } = await supabase
      .from('household_members')
      .select('user_id, household_id')
      .eq('user_id', user.id)
      .single()

    if (householdStatus) {
      const { data: allMembers } = await supabase
        .from('household_members')
        .select('user_id, profiles:user_id(full_name)')
        .eq('household_id', householdStatus.household_id)

      const partner = allMembers?.find(m => m.user_id !== user.id)
      if (partner && (partner as any).profiles?.full_name) {
        partnerName = (partner as any).profiles.full_name
      }
    }
  } catch {
    // Fall back to 'Partner'
  }

  // Partner calculation
  const partnerDeelnemingen = [...partnerAssets, ...sharedAssets].map(assetToDeelneming)
  const partnerResult = calculateBox2({
    deelnemingen: partnerDeelnemingen,
    year,
    hasPartner: true,
    dailyExpenses,
  })

  // Combined calculation
  const allDeelnemingen = [
    ...myAssets,
    ...partnerAssets,
    ...sharedAssets,
  ].map(assetToDeelneming)

  const combinedResult = calculateBox2({
    deelnemingen: allDeelnemingen,
    year,
    hasPartner: true,
    dailyExpenses,
  })

  // Build enriched deelneming details
  const allAssetsForDetails = [...myAssets, ...partnerAssets, ...sharedAssets]
  const deelnemingDetails = allDeelnemingen.map((d, i) => ({
    ...d,
    assetId: allAssetsForDetails[i]?.id,
    currentValue: allAssetsForDetails[i]?.current_value,
    ownershipPct: Number((allAssetsForDetails[i] as any)?.ownership_percentage) || 100,
    ownerId: allAssetsForDetails[i]?.user_id,
    isShared: (allAssetsForDetails[i] as any)?.ownership === 'shared',
  }))

  return NextResponse.json({
    hasHousehold: true,
    year,
    dailyExpenses,
    currentUserName,
    partnerName,
    partners: [
      {
        userId: user.id,
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
    deelnemingen: deelnemingDetails,
  })
}

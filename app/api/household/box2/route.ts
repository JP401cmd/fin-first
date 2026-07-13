import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  calculateBox2,
  type Box2Deelneming,
  type TaxYear,
} from '@/lib/box2-data'
import type { Asset } from '@/lib/asset-data'
import { normalisePrivacySettings } from '@/lib/household-data'
import { dailyExpenseRate } from '@/lib/format'

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

  // Fetch household membership (incl. partner privacy settings)
  const { data: members } = await supabase
    .from('household_members')
    .select('user_id, role, privacy_settings')

  const hasHousehold = members && members.length > 1
  const partnerMember = members?.find(m => m.user_id !== user.id)
  const partnerId = partnerMember?.user_id

  // What the partner allows the household to see of their vermogen (Box 2
  // deelnemingen = wealth). Mirrors the foundation loader: 'full' shows the
  // partner's individual deelnemingen; 'totals' keeps only aggregate results
  // (no per-deelneming itemisation); 'hidden' removes the partner's personal
  // holdings from every calculation. Default is 'totals'. (Security review S5.)
  const partnerVermogenLevel = normalisePrivacySettings(
    (partnerMember?.privacy_settings as Record<string, string> | null) ?? null,
  ).assets
  const partnerHidesVermogen = partnerVermogenLevel === 'hidden'

  // Fetch all deelneming assets, DGA-vorderingen, and DGA-schulden (RLS scoped)
  const [{ data: assetsRaw }, { data: vorderingenRaw }, { data: dgaSchuldenRaw }] = await Promise.all([
    supabase
      .from('assets')
      .select('*')
      .eq('is_active', true)
      .eq('asset_type', 'deelneming'),
    supabase
      .from('assets')
      .select('id, name, current_value, user_id, subtype, ownership, linked_asset_id')
      .eq('is_active', true)
      .eq('asset_type', 'vordering')
      .eq('subtype', 'dga_lening'),
    supabase
      .from('debts')
      .select('id, name, current_balance, user_id, debt_type, ownership')
      .eq('is_active', true)
      .eq('debt_type', 'dga_schuld'),
  ])

  const allAssets = (assetsRaw ?? []) as Asset[]
  const dgaVorderingen = (vorderingenRaw ?? []) as { id: string; name: string; current_value: number; user_id: string; subtype: string; ownership: string; linked_asset_id: string | null }[]
  const dgaSchulden = (dgaSchuldenRaw ?? []) as { id: string; name: string; current_balance: number; user_id: string; debt_type: string; ownership: string }[]

  // Calculate netto DGA-leningen per perspective
  // Netto = DGA-vorderingen (BV owes you) - DGA-schulden (you owe BV)
  // Wet excessief lenen applies when netto > €500.000
  function calcDgaForUser(userId: string) {
    const vorderingenOwn = dgaVorderingen
      .filter(v => v.user_id === userId && v.ownership !== 'shared')
      .reduce((s, v) => s + Number(v.current_value), 0)
    const vorderingenShared = dgaVorderingen
      .filter(v => v.ownership === 'shared')
      .reduce((s, v) => s + Number(v.current_value), 0)
    const schuldenOwn = dgaSchulden
      .filter(d => d.user_id === userId && d.ownership !== 'shared')
      .reduce((s, d) => s + Number(d.current_balance), 0)
    const schuldenShared = dgaSchulden
      .filter(d => d.ownership === 'shared')
      .reduce((s, d) => s + Number(d.current_balance), 0)
    return Math.max(0, (vorderingenOwn + vorderingenShared) - (schuldenOwn + schuldenShared))
  }

  const myDgaTotal = calcDgaForUser(user.id)

  const partnerDgaTotal = partnerId && !partnerHidesVermogen ? calcDgaForUser(partnerId) : 0

  // Combined DGA over the VISIBLE set — exclude the partner's personal
  // vorderingen/schulden when they hide their vermogen (shared stays).
  const visibleVorderingen = partnerHidesVermogen
    ? dgaVorderingen.filter(v => v.user_id === user.id || v.ownership === 'shared')
    : dgaVorderingen
  const visibleSchulden = partnerHidesVermogen
    ? dgaSchulden.filter(d => d.user_id === user.id || d.ownership === 'shared')
    : dgaSchulden
  const totalVorderingen = visibleVorderingen.reduce((s, v) => s + Number(v.current_value), 0)
  const totalSchulden = visibleSchulden.reduce((s, d) => s + Number(d.current_balance), 0)
  const combinedDgaTotal = Math.max(0, totalVorderingen - totalSchulden)

  // Get monthly expenses for freedom days calculation
  const { data: budgets } = await supabase
    .from('budgets')
    .select('default_limit, budget_type')
    .eq('budget_type', 'expense')

  const monthlyExpenses = (budgets ?? []).reduce(
    (sum, b) => sum + (Number(b.default_limit) || 0),
    0,
  )
  const dailyExpenses = monthlyExpenses > 0 ? dailyExpenseRate(monthlyExpenses) : 100

  // Helper: convert Asset to Box2Deelneming
  function assetToDeelneming(a: Asset): Box2Deelneming {
    return {
      name: a.institution || a.name || 'Deelneming',
      annual_dividend: Number(a.annual_dividend) || 0,
      // WF-BELAST-13 is bewust dividend-only (scope-down, productbesluit optie C):
      // vervreemdingswinst heeft géén backing kolom/UI/afleiding en valt buiten
      // scope als aparte, latere feature. calculateBox2() verwerkt disposal_gain
      // wél zodra er ooit een datapad voor komt; tot dan blijft het 0.
      disposal_gain: 0,
    }
  }

  // Separate assets by ownership
  const myAssets = allAssets.filter(a => a.user_id === user.id && a.ownership !== 'shared')
  const sharedAssets = allAssets.filter(a => a.ownership === 'shared')
  const partnerAssets = partnerId
    ? allAssets.filter(a => a.user_id === partnerId && a.ownership !== 'shared')
    : []
  // Drop the partner's personal deelnemingen from every calculation when hidden.
  const visiblePartnerAssets = partnerHidesVermogen ? [] : partnerAssets

  // Personal calculation
  const myDeelnemingen = [...myAssets, ...sharedAssets].map(assetToDeelneming)
  const personalResult = calculateBox2({
    deelnemingen: myDeelnemingen,
    year,
    hasPartner: !!hasHousehold,
    dailyExpenses,
    dgaLeningenTotal: myDgaTotal,
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
        ownershipPct: Number([...myAssets, ...sharedAssets][i]?.ownership_percentage) || 100,
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
        .returns<{ user_id: string; profiles: { full_name: string | null } | null }[]>()

      const partner = allMembers?.find(m => m.user_id !== user.id)
      if (partner && partner.profiles?.full_name) {
        partnerName = partner.profiles.full_name
      }
    }
  } catch {
    // Fall back to 'Partner'
  }

  // Partner calculation
  const partnerDeelnemingen = [...visiblePartnerAssets, ...sharedAssets].map(assetToDeelneming)
  const partnerResult = calculateBox2({
    deelnemingen: partnerDeelnemingen,
    year,
    hasPartner: true,
    dailyExpenses,
    dgaLeningenTotal: partnerDgaTotal,
  })

  // Combined calculation (partner personal dropped when hidden)
  const allDeelnemingen = [
    ...myAssets,
    ...visiblePartnerAssets,
    ...sharedAssets,
  ].map(assetToDeelneming)

  const combinedResult = calculateBox2({
    deelnemingen: allDeelnemingen,
    year,
    hasPartner: true,
    dailyExpenses,
    dgaLeningenTotal: combinedDgaTotal,
  })

  // Build enriched deelneming details (same visible set as the combined calc).
  const allAssetsForDetails = [...myAssets, ...visiblePartnerAssets, ...sharedAssets]
  const deelnemingDetails = allDeelnemingen.map((d, i) => ({
    ...d,
    assetId: allAssetsForDetails[i]?.id,
    currentValue: allAssetsForDetails[i]?.current_value,
    ownershipPct: Number(allAssetsForDetails[i]?.ownership_percentage) || 100,
    ownerId: allAssetsForDetails[i]?.user_id,
    isShared: allAssetsForDetails[i]?.ownership === 'shared',
  }))

  // Itemised partner holdings are only exposed at privacy level 'full'. At
  // 'totals' (and 'hidden') the partner's contribution stays in the aggregate
  // results above, but per-deelneming detail (assetId, value, owner) is removed.
  const visibleDeelnemingDetails =
    partnerVermogenLevel === 'full'
      ? deelnemingDetails
      : deelnemingDetails.filter(d => d.ownerId !== partnerId)

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
    deelnemingen: visibleDeelnemingDetails,
    partnerVermogenPrivacy: partnerVermogenLevel,
  })
}

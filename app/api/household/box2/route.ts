import { NextRequest, NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import {
  calculateBox2,
  type Box2Deelneming,
  type TaxYear,
} from '@/lib/box2-data'
import type { Asset } from '@/lib/asset-data'
import { normalisePrivacySettings } from '@/lib/household-data'
import { getRecentDailyExpenseRate } from '@/lib/expense-rate'
import {
  dgaLeningTotalForUser,
  dgaLeningTotalCombined,
  type DgaLeningSources,
} from '@/lib/box2-dga-lening'

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

  // DGA-leentotaal voor de Wet excessief lenen (Optie B, kaart 39bf9e8d):
  // som(DGA-schulden `dga_schuld`) + som(DGA-vorderingen subtype `dga_lening`),
  // OPGETELD. Aggregatie-logica leeft in `lib/box2-dga-lening.ts` (gedeeld met
  // de UAT/regressietests); de drempel/excess-motor blijft `calculateBox2`.
  const dgaSources: DgaLeningSources = {
    schulden: dgaSchulden.map(d => ({
      userId: d.user_id,
      ownership: d.ownership,
      amount: Number(d.current_balance),
    })),
    vorderingen: dgaVorderingen.map(v => ({
      userId: v.user_id,
      ownership: v.ownership,
      amount: Number(v.current_value),
    })),
  }

  const myDgaTotal = dgaLeningTotalForUser(dgaSources, claims.sub)

  const partnerDgaTotal =
    partnerId && !partnerHidesVermogen ? dgaLeningTotalForUser(dgaSources, partnerId) : 0

  // Combined DGA over the VISIBLE set — exclude the partner's personal
  // vorderingen/schulden when they hide their vermogen (shared stays).
  const combinedDgaTotal = dgaLeningTotalCombined(dgaSources, claims.sub, partnerHidesVermogen)

  // Dagtarief voor de vrijheidsdagen — CANONIEKE 12-mnd rolling bron
  // (lib/expense-rate.ts), identiek aan de box3-huishoudroute, de widgets en de
  // rapporten. Was de som van budget-LIMIETEN (`budgets.default_limit`) met een
  // verzonnen €100/dag-terugval: een derde grondslag (plan i.p.v. realiteit),
  // waardoor dezelfde Box 2-heffing hier een ander aantal vrijheidsdagen gaf dan
  // elders (vervolg KRUIS-20). 0 = geen eerlijke dagbasis → calculateBox2 guardt
  // daar al op en geeft freedomDays 0.
  const { dailyRate: dailyExpenses } = await getRecentDailyExpenseRate(supabase)

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
  const myAssets = allAssets.filter(a => a.user_id === claims.sub && a.ownership !== 'shared')
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
    deelnemingen: visibleDeelnemingDetails,
    partnerVermogenPrivacy: partnerVermogenLevel,
  })
}

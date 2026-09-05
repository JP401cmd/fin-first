import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { type FinancialInput, type FireProjection, type FireRange } from '@/lib/horizon-data'
import { computeSharePct, type SplitMode } from '@/lib/household-data'
import { annualAmount } from '@/lib/budget-utils'
import { localMonthBounds } from '@/lib/month-range'
import { computeScalarFireRange, type ScalarFireParams } from '@/lib/horizon-kernel/scalar-router'
import { resolveFireParamsWithAssumptions } from '@/lib/fire-params'
import { FIRE_PLAN_COLUMNS, resolveFireStrategyWithOverride } from '@/lib/fire-strategy'
import type { FireAssumptionRow } from '@/lib/fire-assumptions'

/**
 * GET /api/household/fire-projections
 *
 * Returns FIRE projections for the household:
 * - Combined household projection (merged income, expenses, assets, debts)
 * - Individual projections per partner
 * - Partner comparison data
 *
 * Requires authenticated user with a household.
 *
 * ## Motor + aannames (H21/F7, ADR 0107)
 * Deze route draaide op de RAUWE scalar-lus (`computeFireProjection`) **zonder
 * parameters** — dus op de constanten `DEFAULT_RETURN` / `NL_SWR`, ongeacht wat
 * de gebruiker zelf als rendement/inflatie had ingesteld. Dat is een dubbele
 * overtreding: een tweede motor náást de kernel, én een vaste financiële aanname
 * buiten de params-laag.
 *
 * Nu: de kernel-backed router `computeScalarFireRange` (die intern per scenario
 * `solveFire` draait en alleen bij een gate — geen geboortedatum, negatief
 * vermogen — netjes naar de scalar-formule degradeert), gevoed met
 * `resolveFireParamsWithAssumptions` per profiel: eigen keuze wint, anders de
 * jaargelaagde markt-aanname, anders pas de TS-constante.
 *
 * De `projection` is bewust `range.expected` — één run, geen tweede som die kan
 * gaan afwijken van de band waar hij in hoort te liggen.
 *
 * NB: de /toekomst-huishoudweergave leest deze route NIET (meer); die draait op
 * `lib/household-projection.ts` (volledige unified projection, dual-AOW). Deze
 * route blijft bestaan als publiek API-oppervlak. Wie hier een derde
 * huishoud-FIRE-motor wil toevoegen: doe dat niet — consolideer richting
 * `lib/household-projection.ts`.
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
  splitMode: SplitMode
  customSplitPct: number | null
  // Combined household projection
  combined: {
    input: FinancialInput
    projection: FireProjection
    range: FireRange
  }
  // Individual partner projections
  partners: Array<{
    userId: string
    fullName: string | null
    isCurrentUser: boolean
    financials: PartnerFinancials
    input: FinancialInput
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
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Check household membership
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, role')
    .eq('user_id', claims.sub)
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
  const { start: monthStart, end: monthEnd } = localMonthBounds(now)

  // Fetch all financial data for all household members in parallel
  const [
    profilesResult,
    allTransactionsResult,
    allAssetsResult,
    allDebtsResult,
    allEssentialBudgetsResult,
    allChildBudgetsResult,
    fireAssumptionsResult,
  ] = await Promise.all([
    // Profiles for all members.
    // De FIRE-kolommen zijn MARKT-aannames + eindstrategie (rendement, inflatie,
    // box3-methode, stop-leeftijd) — geen persoonlijke financiële feiten. Bewust
    // GEEN `net_monthly_income`/`marginaal_tarief` erbij: die voeden alleen
    // `FireParams.marginaalTarief`, dat deze route niet gebruikt, en zouden de
    // partner-datastroom onnodig verbreden.
    supabase
      .from('profiles')
      .select(
        `id, full_name, date_of_birth, expected_return, inflation_rate, box3_method, ${FIRE_PLAN_COLUMNS}, feature_preferences`,
      )
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
    // Active debts for all members (include partner_split_pct for per-debt overrides)
    supabase
      .from('debts')
      .select('current_balance, user_id, ownership, is_active, partner_split_pct, debt_type')
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
    // FIRE-marktaannames — jaargelaagde override-laag. Ontbrekende/lege set →
    // `resolveFireAssumptions` valt terug op DEFAULT_RETURN/INFLATION.
    supabase
      .from('fire_assumptions')
      .select('year, expected_return, inflation, volatility, source, is_definitive')
      .order('year', { ascending: true }),
  ])

  const profiles = profilesResult.data ?? []
  const allTransactions = allTransactionsResult.data ?? []
  const allAssets = allAssetsResult.data ?? []
  const allDebts = allDebtsResult.data ?? []
  const allEssentialBudgets = allEssentialBudgetsResult.data ?? []
  const allChildBudgets = allChildBudgetsResult.data ?? []
  const assumptionRows = (fireAssumptionsResult.data ?? []) as FireAssumptionRow[]

  /**
   * Rendement/inflatie/SWR + eindstrategie voor één profiel — de canonieke
   * params-keten (eigen keuze → jaarlaag → constante). Ontbrekend profiel →
   * `resolveFireParamsWithAssumptions(null, …)` levert precies de defaults, dus
   * geen aparte tak met eigen getallen.
   */
  type MemberProfileRow = {
    expected_return?: number | null
    inflation_rate?: number | null
    box3_method?: string | null
    fire_end_strategy?: string | null
    fire_end_age?: number | null
    fire_legacy_amount?: number | string | null
    /** ADR 0129 L1 — plan-anker; het scalar-pad leest 'm nog niet (F3a), de select draagt 'm wel. */
    fire_stop_anchor?: string | null
    fire_stop_age?: number | string | null
    feature_preferences?: Record<string, unknown> | null
  }
  const scalarParamsFor = (
    input: FinancialInput,
    profile: MemberProfileRow | null | undefined,
  ): ScalarFireParams => {
    const fireParams = resolveFireParamsWithAssumptions(profile ?? null, assumptionRows)
    const strategy = resolveFireStrategyWithOverride(profile ?? {})
    return {
      input,
      annualReturn: fireParams.grossReturn,
      swrOverride: fireParams.effectiveSwr,
      inflationOverride: fireParams.inflationRate,
      strategyOptions: {
        strategy: strategy.strategy,
        endAge: strategy.endAge,
        legacyAmount: strategy.legacyAmount,
      },
    }
  }

  // Compute per-member monthly income first (needed for income_ratio split mode)
  const memberIncomes = new Map<string, number>()
  for (const memberId of memberIds) {
    const memberTx = allTransactions.filter(t => t.user_id === memberId)
    let income = 0
    for (const tx of memberTx) {
      const amt = Number(tx.amount)
      if (amt > 0) income += amt
    }
    memberIncomes.set(memberId, income)
  }

  // Determine each member's share percentage via split_mode
  const householdSettings = {
    splitMode: (household.split_mode ?? 'equal') as SplitMode,
    customSplitPct: household.custom_split_pct ?? null,
    primaryPayerId: household.primary_payer_id ?? null,
  }

  // Compute financials per partner using split_mode-aware share percentages
  const partnersData: PartnerFinancials[] = memberIds.map(memberId => {
    const profile = profiles.find(p => p.id === memberId)
    const myIncome = memberIncomes.get(memberId) ?? 0
    // For income_ratio, find partner's income
    const partnerIncome = memberIds
      .filter(id => id !== memberId)
      .reduce((sum, id) => sum + (memberIncomes.get(id) ?? 0), 0)

    // Compute this member's share percentage based on split_mode
    const sharePct = computeSharePct(householdSettings, memberId, myIncome, partnerIncome)
    const shareFraction = sharePct / 100

    // Transactions for this member
    const memberTx = allTransactions.filter(t => t.user_id === memberId)
    const monthlyIncome = myIncome
    let monthlyExpenses = 0
    for (const tx of memberTx) {
      const amt = Number(tx.amount)
      if (amt < 0) monthlyExpenses += Math.abs(amt)
    }

    // Personal assets + split-mode share of shared assets
    const personalAssets = allAssets
      .filter(a => a.ownership === 'personal' && a.user_id === memberId)
      .reduce((sum, a) => sum + Number(a.current_value), 0)
    const sharedAssets = allAssets
      .filter(a => a.ownership === 'shared')
      .reduce((sum, a) => sum + Number(a.current_value), 0)
    const sharedAssetsValue = sharedAssets * shareFraction
    const totalAssets = personalAssets + sharedAssetsValue

    // Personal debts + split-mode share of shared debts (respecting per-debt overrides)
    const personalDebts = allDebts
      .filter(d => d.ownership === 'personal' && d.user_id === memberId)
      .reduce((sum, d) => sum + Number(d.current_balance), 0)
    // For shared debts, use per-debt partner_split_pct if available, otherwise household default
    const sharedDebtsValue = allDebts
      .filter(d => d.ownership === 'shared')
      .reduce((sum, d) => {
        const balance = Number(d.current_balance)
        if (d.partner_split_pct != null) {
          // Per-debt override: partner_split_pct is the primary member's share
          // Determine if current member is the debt owner (primary) or partner
          const debtOwnerFraction = d.partner_split_pct / 100
          const myFraction = d.user_id === memberId ? debtOwnerFraction : (1 - debtOwnerFraction)
          return sum + balance * myFraction
        }
        return sum + balance * shareFraction
      }, 0)
    const totalDebts = personalDebts + sharedDebtsValue

    // Monthly contributions
    const personalContributions = allAssets
      .filter(a => a.ownership === 'personal' && a.user_id === memberId)
      .reduce((sum, a) => sum + Number(a.monthly_contribution), 0)
    const sharedContributions = allAssets
      .filter(a => a.ownership === 'shared')
      .reduce((sum, a) => sum + Number(a.monthly_contribution), 0)
    const monthlyContributions = personalContributions + (sharedContributions * shareFraction)

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
      // Jaarconversie via de canonieke `annualAmount` (lib/budget-utils.ts) —
      // niet met de hand. Bij een gedeeld budget telt alleen het eigen aandeel
      // mee; de conversie is lineair, dus delen-vóór of delen-ná converteren
      // geeft hetzelfde bedrag.
      const interval = (b as { interval?: string }).interval
      const share = b.ownership === 'shared' ? limit * shareFraction : limit
      yearlyMustExpenses += annualAmount(share, interval)
    }

    return {
      userId: memberId,
      fullName: profile?.full_name ?? null,
      isCurrentUser: memberId === claims.sub,
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
      total += annualAmount(limit, (b as { interval?: string }).interval)
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
  const combinedInput: FinancialInput = {
    totalAssets: combinedTotalAssets,
    totalDebts: combinedTotalDebts,
    monthlyIncome: combinedMonthlyIncome,
    monthlyExpenses: combinedMonthlyExpenses,
    monthlyContributions: combinedMonthlyContributions,
    yearlyMustExpenses: combinedYearlyMustExpenses,
    dateOfBirth: combinedDob,
  }

  // De gecombineerde run draait op de aannames van de AANVRAGER: dat is de blik
  // die om dit antwoord vraagt, en het is het enige profiel waarvan we zeker
  // weten dat de gebruiker de keuzes zelf gemaakt heeft.
  const requesterProfile = profiles.find(p => p.id === claims.sub) as MemberProfileRow | undefined
  const combinedRange = computeScalarFireRange(scalarParamsFor(combinedInput, requesterProfile)).result
  // Eén run: de "verwachte" tak ván de band is de projectie. Een aparte
  // projectie-aanroep is een tweede som die uit de band kan lopen.
  const combinedProjection = combinedRange.expected

  // Compute individual partner projections
  const partnersProjections = partnersData.map(partner => {
    const partnerInput: FinancialInput = {
      totalAssets: partner.totalAssets,
      totalDebts: partner.totalDebts,
      monthlyIncome: partner.monthlyIncome,
      monthlyExpenses: partner.monthlyExpenses,
      monthlyContributions: partner.monthlyContributions,
      yearlyMustExpenses: partner.yearlyMustExpenses,
      dateOfBirth: partner.dateOfBirth,
    }

    // Elke partner op ZIJN EIGEN aannames + eindstrategie.
    const partnerProfile = profiles.find(p => p.id === partner.userId) as MemberProfileRow | undefined
    const partnerRange = computeScalarFireRange(scalarParamsFor(partnerInput, partnerProfile)).result

    return {
      userId: partner.userId,
      fullName: partner.fullName,
      isCurrentUser: partner.isCurrentUser,
      financials: partner,
      input: partnerInput,
      projection: partnerRange.expected,
      range: partnerRange,
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
    splitMode: householdSettings.splitMode,
    customSplitPct: householdSettings.customSplitPct,
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

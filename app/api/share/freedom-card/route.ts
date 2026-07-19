import { createClient } from '@/lib/supabase/server'
import { computeFireProjection, type FinancialInput } from '@/lib/horizon-data'
import { fetchActionsKpiAggregate } from '@/lib/server-data/actions-aggregate'
import { unauthorized, badRequest, serverError } from '@/lib/api/respond'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import { resolveFireParams } from '@/lib/fire-params'
import { computeFreedomProgressWithBasis, inclHomeTargetFromScalar } from '@/lib/core-metrics'
import { deriveHousingContext, getFireEligibleNetWorth, parseHousingStrategy, isHomeExcludedFromFire } from '@/lib/housing-strategy'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return unauthorized()
    }

    // Parse privacy level from query params
    const url = new URL(request.url)
    const privacyLevel = url.searchParams.get('privacy') || 'anonymous'
    if (!['anonymous', 'named', 'full'].includes(privacyLevel)) {
      return badRequest('Ongeldig privacy niveau')
    }

    // Fetch all financial data in parallel (same as dashboard)
    // Each query uses individual error handling to gracefully degrade
    const now = new Date()
    const { start: monthStart, end: monthEnd } = localMonthBounds(now)
    const sixMonthsAgo = localMonthStart(new Date(now.getFullYear(), now.getMonth() - 5, 1))

    const [
      txResult, assetsResult, debtsResult, profileResult,
      essentialBudgetsResult, actionsThisMonthResult, childBudgetsResult,
      bankResult, expense6mResult, actionsKpiResult,
    ] = await Promise.allSettled([
      supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
      supabase.from('assets').select('id, asset_type, current_value, woz_value, monthly_contribution, net_worth_inclusion_pct, is_active').eq('is_active', true),
      supabase.from('debts').select('current_balance, debt_type, linked_asset_id, net_worth_inclusion_pct, is_active').eq('is_active', true),
      supabase.from('profiles').select('full_name, date_of_birth, expected_return, inflation_rate, housing_strategy_config').single(),
      supabase.from('budgets').select('id, default_limit, interval').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
      // Alleen DEZE-MAAND afgeronde acties → freedomDaysWonThisMonth (klein venster,
      // niet afkap-gevoelig). Het all-time totaal komt uit de aggregaat-RPC hieronder,
      // consistent met de dashboard-bundel. `.gte('completed_at', monthStart)` is een
      // superset-ondergrens; de exacte JS-maandfilter blijft ongewijzigd.
      supabase.from('actions').select('freedom_days_impact, completed_at').eq('status', 'completed').gte('completed_at', monthStart),
      supabase.from('budgets').select('id, parent_id, default_limit').not('parent_id', 'is', null),
      // Losse bankrekeningen (niet aan een asset gekoppeld) tellen als cash —
      // zelfde regel als dashboard-data-loader en de check-in.
      supabase.from('bank_accounts').select('balance').eq('is_active', true).is('linked_asset_id', null),
      // 6-maands uitgaven (transfers uitgesloten) i.p.v. het 1-maands-cijfer ×12,
      // zodat het FIRE-doel niet op één maand schommelt — patroon uit
      // app/api/checkin/gespreksstarters/route.ts.
      supabase.from('transactions').select('amount, transaction_type, date').eq('is_income', false).gte('date', sixMonthsAgo).lt('date', monthEnd),
      // Afkap-vrij all-time totaal (Σ freedom_days_impact over completed) via de
      // SECURITY-INVOKER-RPC — zelfde bron als de dashboard-bundel.
      fetchActionsKpiAggregate(supabase),
    ])

    // Safely extract data from settled promises (gracefully handle failures)
    const txData = txResult.status === 'fulfilled' ? (txResult.value.data ?? []) : []
    const assetsData = assetsResult.status === 'fulfilled' ? (assetsResult.value.data ?? []) : []
    const debtsData = debtsResult.status === 'fulfilled' ? (debtsResult.value.data ?? []) : []
    const profileData = profileResult.status === 'fulfilled' ? profileResult.value.data : null
    const essentialBudgetsData = essentialBudgetsResult.status === 'fulfilled' ? (essentialBudgetsResult.value.data ?? []) : []
    const actionsThisMonthData = actionsThisMonthResult.status === 'fulfilled' ? (actionsThisMonthResult.value.data ?? []) : []
    const childBudgetsData = childBudgetsResult.status === 'fulfilled' ? (childBudgetsResult.value.data ?? []) : []
    const bankData = bankResult.status === 'fulfilled' ? (bankResult.value.data ?? []) : []
    const expense6mData = expense6mResult.status === 'fulfilled' ? (expense6mResult.value.data ?? []) : []

    // Track which data sources are available for the card
    const hasTransactions = txData.length > 0
    const hasAssets = assetsData.length > 0
    const hasDebts = debtsData.length > 0
    const hasExpenses = txData.some((tx: { amount: number }) => Number(tx.amount) < 0)

    // Core calculations (matching dashboard logic exactly)
    let monthlyIncome = 0
    let monthlyExpenses = 0
    for (const tx of txData) {
      const amt = Number(tx.amount)
      if (amt > 0) monthlyIncome += amt
      else monthlyExpenses += Math.abs(amt)
    }

    // Netto vermogen canoniek: actieve posten gewogen met
    // net_worth_inclusion_pct + losse bankrekeningen als cash (dashboard-bron).
    const unlinkedCash = bankData.reduce((s: number, b: { balance: number | string }) => s + Number(b.balance || 0), 0)
    const totalAssets = assetsData.reduce(
      (s: number, a: { current_value: number; net_worth_inclusion_pct?: number | null }) =>
        s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0,
    ) + unlinkedCash
    const totalDebts = debtsData.reduce(
      (s: number, d: { current_balance: number; net_worth_inclusion_pct?: number | null }) =>
        s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0,
    )
    const netWorth = totalAssets - totalDebts
    const monthlyContributions = assetsData.reduce((s: number, a: { monthly_contribution: number }) => s + Number(a.monthly_contribution), 0)

    let yearlyMustExpenses = 0
    for (const b of essentialBudgetsData) {
      const children = childBudgetsData.filter((c: { parent_id: string }) => c.parent_id === b.id)
      const limit = children.length > 0
        ? children.reduce((sum: number, c: { default_limit: number }) => sum + Number(c.default_limit), 0)
        : Number(b.default_limit)
      if (b.interval === 'monthly') yearlyMustExpenses += limit * 12
      else if (b.interval === 'quarterly') yearlyMustExpenses += limit * 4
      else yearlyMustExpenses += limit
    }

    // 6-maands gemiddelde uitgaven (transfers uitgesloten) → jaarbasis, i.p.v.
    // 1-maands ×12. Bij <6 maanden data middelen we over de beschikbare maanden.
    const isRealTx = (t: { transaction_type?: string | null }) =>
      t.transaction_type !== 'transfer' && t.transaction_type !== 'joint_transfer'
    const expense6mRows = (expense6mData as { amount: number | null; transaction_type?: string | null; date: string }[]).filter(isRealTx)
    const expenses6m = expense6mRows.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0)
    const earliest6m = expense6mRows.reduce<string | null>((min, t) => (t.date && (!min || t.date < min) ? t.date : min), null)
    let dataMonths6 = 6
    if (earliest6m) {
      const ed = new Date(earliest6m)
      dataMonths6 = Math.max(1, Math.min(6, (now.getFullYear() - ed.getFullYear()) * 12 + (now.getMonth() - ed.getMonth())))
    }
    const yearlyExpenses = (expenses6m / dataMonths6) * 12

    // Gepersonaliseerde effectiveSwr i.p.v. vaste NL_SWR — zelfde FIRE-doel als
    // /toekomst, dashboard en het rapport.
    const fireParams = resolveFireParams(profileData ?? {})
    const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / fireParams.effectiveSwr : 0
    // Vrijheids-% op de canonieke grondslag (ADR 0009): FIRE-eligible vermogen
    // (eigen woning gefilterd via de housing-strategie) ÷ doelbedrag — zelfde
    // teller als /toekomst, dashboard en het rapport. De kaart toont verderop
    // wél het volledige netWorth (privacy=full): dat is het werkelijke vermogen.
    const housingStrategy = parseHousingStrategy(profileData?.housing_strategy_config)
    const housingContext = deriveHousingContext(assetsData as unknown as Asset[], debtsData as unknown as Debt[])
    const fireEligibleNetWorth = getFireEligibleNetWorth(netWorth, housingContext, housingStrategy)
    // Grondslag-keuze (ADR 0009 herzien): standaard telt de eigen woning mee →
    // INCL.-woning grondslag; alleen bij exclude_from_fire → EXCL. (liquide). De
    // kaart toont verderop het volledige netWorth, dus incl. is óók congruent.
    const homeExcludedFromFire = housingContext.hasEigenHuis && isHomeExcludedFromFire(housingStrategy)
    const requiredPortfolioExclHome = fireTarget > 0 ? fireTarget : null
    const requiredNetWorthInclHome = inclHomeTargetFromScalar(requiredPortfolioExclHome, netWorth, fireEligibleNetWorth)
    const freedomPct = computeFreedomProgressWithBasis({
      homeExcludedFromFire,
      netWorthInclHome: netWorth,
      fireEligibleNetWorth,
      requiredNetWorthInclHome,
      requiredPortfolioExclHome,
    })
    // FIRE-doel op DEZELFDE grondslag als het Vrijheids-% (incl. woning tenzij uitgesloten).
    const displayFireGoal = homeExcludedFromFire ? requiredPortfolioExclHome : (requiredNetWorthInclHome ?? requiredPortfolioExclHome)

    // FIRE projection — gepersonaliseerde return/swr/inflatie.
    const horizonInput: FinancialInput = {
      totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
      monthlyContributions, yearlyMustExpenses,
      dateOfBirth: profileData?.date_of_birth ?? null,
    }
    const fireProj = computeFireProjection(
      horizonInput,
      fireParams.grossReturn,
      fireParams.effectiveSwr,
      fireParams.inflationRate,
    )

    // Days won (all-time) — afkap-vrij via de actions_kpi_aggregate-RPC, exact de
    // bron die de dashboard-bundel gebruikt. `fetchActionsKpiAggregate` normaliseert
    // een RPC-fout naar 0, dus de allSettled-fallback blijft graceful.
    const totalFreedomDaysWon =
      actionsKpiResult.status === 'fulfilled' ? actionsKpiResult.value.data.totalFreedomDaysWon : 0

    // Days won THIS MONTH (completed actions with completed_at in current month).
    // actionsThisMonthData is al op `completed` + `completed_at >= monthStart`
    // begrensd; de exacte maandfilter blijft ONGEWIJZIGD (byte-identiek gedrag).
    const freedomDaysWonThisMonth = actionsThisMonthData
      .filter((a: { completed_at?: string | null }) => {
        if (!a.completed_at) return false
        const completedDate = a.completed_at.split('T')[0]
        return completedDate >= monthStart && completedDate < monthEnd
      })
      .reduce(
        (s: number, a: { freedom_days_impact?: number | null }) => s + (Number(a.freedom_days_impact) || 0), 0
      )

    // Determine if FIRE calculation is possible (requires expense data).
    // yearlyExpenses is nu het 6-maands gemiddelde, dus de kaart blijft geldig
    // ook als er deze maand (nog) geen uitgaven zijn — zolang er in de
    // afgelopen 6 maanden uitgaven waren.
    const canCalculateFire = yearlyExpenses > 0

    // Determine the fire countdown label with graceful fallback
    // fireProj.fireDate can be: 'Bereikt!', 'Niet haalbaar', 'mrt 2038', or '' (empty)
    const fireCountdownLabel = fireProj.fireDate || (canCalculateFire ? 'Niet haalbaar' : 'Nog geen data')

    // Build card data based on privacy level
    const cardData: Record<string, unknown> = {
      privacyLevel,
      freedomPercentage: canCalculateFire ? Math.round(freedomPct * 10) / 10 : null,
      freedomDaysWon: Math.round(totalFreedomDaysWon),
      freedomDaysWonThisMonth: Math.round(freedomDaysWonThisMonth),
      fireCountdown: {
        years: fireProj.countdownYears,
        months: fireProj.countdownMonths,
        days: fireProj.countdownDays,
        label: fireCountdownLabel,
      },
      freedomTime: {
        years: fireProj.freedomYears,
        months: fireProj.freedomMonths,
      },
      savingsRate: hasTransactions ? Math.round(fireProj.savingsRate * 10) / 10 : null,
      generatedAt: new Date().toISOString(),
      // Metadata about data availability (helps the card show N/A for missing metrics)
      dataAvailability: {
        hasTransactions,
        hasAssets,
        hasDebts,
        hasExpenses,
        canCalculateFire,
      },
    }

    // Named: include user name
    if (privacyLevel === 'named' || privacyLevel === 'full') {
      cardData.displayName = profileData?.full_name || user.email?.split('@')[0] || 'Gebruiker'
    }

    // Full: include EUR amounts (opt-in)
    if (privacyLevel === 'full') {
      cardData.netWorth = netWorth
      cardData.fireTarget = displayFireGoal != null && displayFireGoal > 0 ? displayFireGoal : null
    }

    return Response.json(cardData)
  } catch (error) {
    return serverError(error, 'share:GET', 'Kaart genereren mislukt. Probeer het later opnieuw.')
  }
}

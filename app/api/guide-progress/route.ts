import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { ageAtDate } from '@/lib/horizon-data'
import { calculateFreedomTime } from '@/lib/format'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'
import { resolveFireParams } from '@/lib/fire-params'
import { resolveSavingsSource, savingsRateFromAggregates } from '@/lib/savings-source'
import { resolveAmountWithBasis } from '@/lib/effective-financials'
import { loadBudgetBasis } from '@/lib/household/budget-share'
import type { BudgetBasisRow } from '@/lib/budget-basis'

/**
 * GET /api/guide-progress
 * Returns bundled progress data for the Gids page:
 * - Counts: assets, transactions, completed actions, life events
 * - Financial: net worth, daily expenses, freedom days, FIRE age
 * - Meta: active modules, per-step completion booleans
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)

    if (!claims) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    // Parallel queries for efficiency
    const [
      assetsResult,
      transactionsResult,
      actionsResult,
      actionsWithImpactResult,
      lifeEventsResult,
      debtsResult,
      profileResult,
      budgetsResult,
      budgetRowsResult,
      basisPrefsResult,
      recommendationsResult,
    ] = await Promise.all([
      supabase
        .from('assets')
        .select('current_value, net_worth_inclusion_pct', { count: 'exact', head: false })
        .eq('user_id', claims.sub)
        .eq('is_active', true),
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', claims.sub),
      supabase
        .from('actions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', claims.sub)
        .eq('status', 'done'),
      supabase
        .from('actions')
        .select('freedom_days_impact')
        .eq('user_id', claims.sub)
        .eq('status', 'done'),
      supabase
        .from('life_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', claims.sub)
        .eq('is_active', true),
      supabase
        .from('debts')
        .select('current_balance, debt_type, net_worth_inclusion_pct')
        .eq('user_id', claims.sub)
        .eq('is_active', true),
      supabase
        .from('profiles')
        .select('date_of_birth, expected_return, inflation_rate, active_modules, box3_method, marginaal_tarief, net_monthly_income, income_source, expenses_source, estimated_monthly_expenses')
        .eq('id', claims.sub)
        .single(),
      supabase
        .from('budgets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', claims.sub),
      // Budgetrijen + grondslag-selectie (ADR 0103) — de FIRE-schatting op deze
      // route moet dezelfde spaarbron gebruiken als /overzicht. De count-query
      // hierboven blijft head-only (die telt alleen of er budgetten ZIJN).
      supabase
        .from('budgets')
        .select('id, parent_id, budget_type, name, default_limit, interval, ownership, is_archived, merged_into, created_at')
        .eq('user_id', claims.sub),
      // Apart en tolerant: `cashflow_basis_prefs` bestaat pas na migratie
      // 20260811160000 en zou als extra kolom de profielselect laten falen.
      supabase
        .from('profiles')
        .select('cashflow_basis_prefs')
        .eq('id', claims.sub)
        .maybeSingle()
        .then((r) => r, () => ({ data: null })),
      supabase
        .from('recommendations')
        .select('id, status', { count: 'exact', head: false })
        .eq('user_id', claims.sub)
        .eq('status', 'pending'),
    ])

    // Netto vermogen — inclusion-gewogen (net_worth_inclusion_pct) en alleen
    // actieve bezittingen/schulden, exact zoals de canonieke bron (next-steps /
    // dashboard-loader). current_balance staat positief opgeslagen, dus
    // netWorth = Σ bezittingen − Σ schulden (geen Math.abs, geen ongewogen som).
    const assets = assetsResult.data ?? []
    const totalAssets = assets.reduce(
      (sum, a) => sum + (Number(a.current_value) || 0) * ((a.net_worth_inclusion_pct ?? 100) / 100),
      0
    )
    const debts = debtsResult.data ?? []
    const totalDebts = debts.reduce(
      (sum, d) => sum + (Number(d.current_balance) || 0) * ((d.net_worth_inclusion_pct ?? 100) / 100),
      0
    )
    const netWorth = totalAssets - totalDebts

    // Daily expense rate (from transactions, last 12 months)
    const now = new Date()
    const twelveMonthsAgo = localMonthStartMonthsAgo(now, 11)
    const monthEnd = localMonthBounds(now).end

    // Alle transacties over de laatste 12 maanden (beide tekens): uitgaven voor
    // dagtarief/vrijheidstijd én inkomen voor de canonieke spaarbron.
    const txResult = await supabase
      .from('transactions')
      .select('amount, date')
      .eq('user_id', claims.sub)
      .gte('date', twelveMonthsAgo)
      .lt('date', monthEnd)

    const txRows = txResult.data ?? []
    const expenses = txRows.filter((tx) => Number(tx.amount) < 0)
    let dailyExpenseRate = 0
    let monthlyExpenses = 0
    let monthlyIncome = 0

    if (expenses.length > 0) {
      const totalExpenses = expenses.reduce(
        (sum, tx) => sum + Math.abs(Number(tx.amount)),
        0
      )
      const earliest = expenses.reduce(
        (min, tx) => (tx.date < min ? tx.date : min),
        expenses[0].date
      )
      const earliestDate = new Date(earliest)
      const dataMonths = Math.min(
        12,
        Math.max(
          1,
          (now.getFullYear() - earliestDate.getFullYear()) * 12 +
            (now.getMonth() - earliestDate.getMonth()) +
            1
        )
      )
      monthlyExpenses = totalExpenses / dataMonths
      dailyExpenseRate = (monthlyExpenses * 12) / 365

      const totalIncome = txRows
        .filter((tx) => Number(tx.amount) > 0)
        .reduce((sum, tx) => sum + Number(tx.amount), 0)
      monthlyIncome = totalIncome / dataMonths
    }

    // Freedom days
    const freedomDays =
      dailyExpenseRate > 0
        ? calculateFreedomTime(netWorth, dailyExpenseRate)
        : { days: 0, months: 0, years: 0 }

    // FIRE age estimate — canonieke bronnen (consume, don't recompute):
    //  • FIRE-doel op de gepersonaliseerde effectiveSwr (resolveFireParams),
    //    niet de statische NL_SWR.
    //  • Spaarbron via resolveSavingsSource (respecteert handmatige inkomen/
    //    uitgaven-bron), niet de verzonnen uitgaven×0.3.
    //  • Reëel rendement (inflatie-gecorrigeerd), mirror next-steps, niet het
    //    nominale ?? 0.07.
    const profile = profileResult.data
    const dateOfBirth = profile?.date_of_birth
    const currentAge = dateOfBirth ? ageAtDate(dateOfBirth, now) : null
    const yearlyExpenses = monthlyExpenses * 12
    const fireParams = resolveFireParams(profile ?? {})
    const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / fireParams.effectiveSwr : 0
    const shortfall = fireTarget - netWorth

    // Lichte spaarquote uit het 12-maands transactie-inkomen/-uitgaven; het
    // handmatige inkomen/uitgaven-pad wint via resolveSavingsSource.
    const txSavingsRate = savingsRateFromAggregates(monthlyIncome, monthlyExpenses, 0)
    // Budgetgrondslag (ADR 0103) — dezelfde spaarbron als /overzicht.
    const guideBudgetBasis = await loadBudgetBasis(
      supabase,
      (basisPrefsResult.data ?? null) as Record<string, unknown> | null,
      (budgetRowsResult.data ?? []) as unknown as BudgetBasisRow[],
    )
    const guideAnnualIncome = resolveAmountWithBasis(
      profile?.income_source,
      (Number(profile?.net_monthly_income) || 0) * 12,
      monthlyIncome * 12,
      guideBudgetBasis.income.annualTotal,
    )
    const guideExpenses = resolveAmountWithBasis(
      profile?.expenses_source,
      Number(profile?.estimated_monthly_expenses) || 0,
      monthlyExpenses,
      guideBudgetBasis.expenses.monthlyTotal,
    )
    const { baseAnnualSavings } = resolveSavingsSource({
      incomeSource: profile?.income_source,
      expensesSource: profile?.expenses_source,
      netMonthlyIncome: Number(profile?.net_monthly_income) || 0,
      estimatedAnnualIncome: monthlyIncome * 12,
      estimatedMonthlyExpenses: Number(profile?.estimated_monthly_expenses) || 0,
      savingsRate6m: txSavingsRate,
      basis: {
        income: guideAnnualIncome.basis,
        expenses: guideExpenses.basis,
        annualIncome: guideAnnualIncome.amount,
        monthlyExpenses: guideExpenses.amount,
      },
    })

    let fireAge: number | null = null
    if (currentAge !== null && shortfall > 0 && baseAnnualSavings > 0) {
      // Reëel rendement (mirror next-steps): nominaal gecorrigeerd voor inflatie.
      const realReturn = (1 + fireParams.grossReturn) / (1 + fireParams.inflationRate) - 1
      const monthlyReturn = realReturn / 12
      const monthlySavings = baseAnnualSavings / 12
      let portfolio = netWorth
      let months = 0
      while (portfolio < fireTarget && months < 960) {
        portfolio = portfolio * (1 + monthlyReturn) + monthlySavings
        months++
      }
      fireAge = months < 960 ? Math.round(currentAge + months / 12) : null
    } else if (currentAge !== null && shortfall <= 0) {
      fireAge = Math.round(currentAge) // Already at FIRE
    }

    // Counts
    const assetsCount = assetsResult.count ?? assets.length
    const transactionsCount = transactionsResult.count ?? 0
    const completedActionsCount = actionsResult.count ?? 0
    const lifeEventsCount = lifeEventsResult.count ?? 0
    const budgetsCount = budgetsResult.count ?? 0
    const pendingRecommendationsCount = recommendationsResult.count ?? 0
    const wonFreedomDays = (actionsWithImpactResult.data ?? []).reduce(
      (sum, a) => sum + (Number(a.freedom_days_impact) || 0), 0
    )

    // Per-step completion booleans
    const steps = {
      hasAssets: assetsCount > 0,
      hasTransactions: transactionsCount > 0,
      hasBudgets: budgetsCount > 0,
      hasCompletedActions: completedActionsCount > 0,
      hasLifeEvents: lifeEventsCount > 0,
      hasFireData: fireTarget > 0 && currentAge !== null,
      hasDebts: debts.length > 0,
    }

    return Response.json({
      counts: {
        assets: assetsCount,
        transactions: transactionsCount,
        completedActions: completedActionsCount,
        lifeEvents: lifeEventsCount,
        budgets: budgetsCount,
        debts: debts.length,
        pendingRecommendations: pendingRecommendationsCount,
        wonFreedomDays: Math.round(wonFreedomDays * 10) / 10,
      },
      financial: {
        netWorth: Math.round(netWorth * 100) / 100,
        dailyExpenseRate: Math.round(dailyExpenseRate * 100) / 100,
        monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
        freedomDays,
        fireAge,
        fireTarget: Math.round(fireTarget),
        activeModules: profile?.active_modules ?? [],
      },
      steps,
      calculatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Guide progress error:', error)
    return Response.json(
      { error: 'Kon gids-voortgang niet berekenen' },
      { status: 500 }
    )
  }
}

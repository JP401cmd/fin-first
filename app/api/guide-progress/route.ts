import { createClient } from '@/lib/supabase/server'
import { computeSovereigntyLevel } from '@/lib/feature-phases'
import { ageAtDate, NL_SWR } from '@/lib/horizon-data'
import { calculateFreedomTime } from '@/lib/format'

/**
 * GET /api/guide-progress
 * Returns bundled progress data for the Gids page:
 * - Counts: assets, transactions, completed actions, life events
 * - Financial: net worth, daily expenses, freedom days, FIRE age
 * - Meta: sovereignty level, per-step completion booleans
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
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
      recommendationsResult,
    ] = await Promise.all([
      supabase
        .from('assets')
        .select('current_value', { count: 'exact', head: false })
        .eq('user_id', user.id),
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('actions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'done'),
      supabase
        .from('actions')
        .select('freedom_days_impact')
        .eq('user_id', user.id)
        .eq('status', 'done'),
      supabase
        .from('life_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_active', true),
      supabase
        .from('debts')
        .select('current_balance, debt_type')
        .eq('user_id', user.id),
      supabase
        .from('profiles')
        .select('date_of_birth, expected_return, inflation_rate')
        .eq('id', user.id)
        .single(),
      supabase
        .from('budgets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('recommendations')
        .select('id, status', { count: 'exact', head: false })
        .eq('user_id', user.id)
        .eq('status', 'pending'),
    ])

    // Calculate net worth
    const assets = assetsResult.data ?? []
    const totalAssets = assets.reduce(
      (sum, a) => sum + (Number(a.current_value) || 0),
      0
    )
    const debts = debtsResult.data ?? []
    const totalDebts = debts.reduce(
      (sum, d) => sum + Math.abs(Number(d.current_balance) || 0),
      0
    )
    const netWorth = totalAssets - totalDebts

    // Daily expense rate (from transactions, last 12 months)
    const now = new Date()
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      .toISOString()
      .split('T')[0]
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      .toISOString()
      .split('T')[0]

    const expenseResult = await supabase
      .from('transactions')
      .select('amount, date')
      .eq('user_id', user.id)
      .lt('amount', 0)
      .gte('date', twelveMonthsAgo)
      .lt('date', monthEnd)

    const expenses = expenseResult.data ?? []
    let dailyExpenseRate = 0
    let monthlyExpenses = 0

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
    }

    // Sovereignty level
    const hasConsumerDebt = debts.some(
      (d) =>
        d.debt_type === 'creditcard' ||
        d.debt_type === 'persoonlijke_lening' ||
        d.debt_type === 'doorlopend_krediet'
    )
    const freedomPct =
      monthlyExpenses > 0 ? (netWorth / (monthlyExpenses * 12)) * 100 : 0
    const sovereigntyLevel = computeSovereigntyLevel(
      netWorth,
      monthlyExpenses,
      freedomPct,
      hasConsumerDebt
    )

    // Freedom days
    const freedomDays =
      dailyExpenseRate > 0
        ? calculateFreedomTime(netWorth, dailyExpenseRate)
        : { days: 0, months: 0, years: 0 }

    // FIRE age estimate
    const profile = profileResult.data
    const dateOfBirth = profile?.date_of_birth
    const currentAge = dateOfBirth ? ageAtDate(dateOfBirth, now) : null
    const yearlyExpenses = monthlyExpenses * 12
    const swr = NL_SWR
    const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / swr : 0
    const shortfall = fireTarget - netWorth

    let fireAge: number | null = null
    if (currentAge !== null && shortfall > 0 && monthlyExpenses > 0) {
      const grossReturn = profile?.expected_return ?? 0.07
      const annualSavings = monthlyExpenses * 0.3 // rough estimate
      if (annualSavings > 0) {
        // Simple compound growth estimate
        let portfolio = netWorth
        let years = 0
        while (portfolio < fireTarget && years < 80) {
          portfolio = portfolio * (1 + grossReturn) + annualSavings
          years++
        }
        fireAge = Math.round(currentAge + years)
      }
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
        sovereigntyLevel,
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

import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'
import { fetchExpenseRowsForRate, recentDailyExpenseRateFromRows } from '@/lib/expense-rate'
import { EXPENSE_RATE_ROLLING_MONTHS } from '@/lib/constants'

/**
 * GET /api/daily-expense-rate
 * Returns the user's real daily expense rate calculated from actual transaction data.
 * Uses the last 12 months of transaction history for accuracy.
 *
 * Canonieke bron: `lib/expense-rate.ts#recentDailyExpenseRateFromRows` — exact
 * hetzelfde 12-mnd rolling dagtarief als de balans/budget/vermogen-rapporten en de
 * dashboard-widgets (KRUIS-20). Deze route voedt de client-side DailyExpenseProvider
 * (sidebar/badges). Responsevorm ongewijzigd (regressie-suites bewaken de 7 velden).
 *
 * De RIJEN komen sinds bevinding L10 uit het maandaggregaat (`fetchExpenseRowsForRate`)
 * in plaats van uit een ongepagineerde `.from('transactions')`-fetch, die PostgREST
 * stil op max_rows = 1000 afkapte en het tarief daarmee omhoog loog.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)

    if (!claims) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const now = new Date()
    // 12-maands rolling venster, tijdzone-veilige grenzen (lib/month-range). Zelfde
    // venster als `fetchExpenseRowsForRate` hanteert — hier alleen nog nodig voor de
    // aparte transactie-TELLING hieronder.
    const startWindow = localMonthStartMonthsAgo(now, EXPENSE_RATE_ROLLING_MONTHS - 1)
    const endWindow = localMonthBounds(now).end

    // De telling blijft een eigen query, maar als HEAD-count: PostgREST geeft dan
    // alleen het aantal terug en levert geen rijen, dus hij kan niet op max_rows
    // afkappen zoals de oude rij-fetch deed (die boven de 1000 stil "1000" meldde).
    // Het maandaggregaat kan deze telling niet leveren: `count` telt daar álle rijen
    // in een (maand, budget, type)-groep, inclusief de positieve.
    const [expenses, countResult] = await Promise.all([
      fetchExpenseRowsForRate(supabase, now),
      supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .lt('amount', 0)
        .gte('date', startWindow)
        .lt('date', endWindow),
    ])

    if (countResult.error) throw countResult.error

    const { dailyRate, monthlyExpenses, dataMonths, source } =
      recentDailyExpenseRateFromRows(expenses, now)

    return Response.json({
      dailyExpenseRate: Math.round(dailyRate * 100) / 100,
      monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
      yearlyExpenses: Math.round(monthlyExpenses * 12 * 100) / 100,
      dataMonths,
      transactionCount: countResult.count ?? 0,
      // Zonder schatting-fallback levert de helper alleen 'transactions' of 'none'.
      source,
      calculatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Daily expense rate error:', error)
    return Response.json(
      { error: 'Kon dagelijkse uitgaven niet berekenen' },
      { status: 500 }
    )
  }
}

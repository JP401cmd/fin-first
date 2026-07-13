import { createClient } from '@/lib/supabase/server'
import { localMonthStartMonthsAgo } from '@/lib/month-range'
import { recentDailyExpenseRateFromRows } from '@/lib/expense-rate'
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
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const now = new Date()
    // 12-maands rolling venster, tijdzone-veilige ondergrens (lib/month-range).
    const startWindow = localMonthStartMonthsAgo(now, EXPENSE_RATE_ROLLING_MONTHS - 1)
    const { data, error } = await supabase
      .from('transactions')
      .select('amount, date')
      .lt('amount', 0)
      .gte('date', startWindow)
      .lte('date', now.toISOString().split('T')[0])

    if (error) throw error

    const expenses = (data ?? []) as { amount: number; date: string }[]
    const { dailyRate, monthlyExpenses, dataMonths, source } =
      recentDailyExpenseRateFromRows(expenses, now)

    return Response.json({
      dailyExpenseRate: Math.round(dailyRate * 100) / 100,
      monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
      yearlyExpenses: Math.round(monthlyExpenses * 12 * 100) / 100,
      dataMonths,
      transactionCount: expenses.length,
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

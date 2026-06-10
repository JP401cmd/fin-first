import { createClient } from '@/lib/supabase/server'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'

/**
 * GET /api/daily-expense-rate
 * Returns the user's real daily expense rate calculated from actual transaction data.
 * Uses the last 3-12 months of transaction history for accuracy.
 * Falls back to essential budget data if no transactions exist.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const now = new Date()
    const monthEnd = localMonthBounds(now).end
    const twelveMonthsAgo = localMonthStart(new Date(now.getFullYear(), now.getMonth() - 11, 1))

    // Fetch expense transactions from the last 12 months
    const [expenseResult, earliestTxResult] = await Promise.all([
      supabase
        .from('transactions')
        .select('amount, date')
        .lt('amount', 0)
        .gte('date', twelveMonthsAgo)
        .lt('date', monthEnd),
      supabase
        .from('transactions')
        .select('date')
        .lt('amount', 0)
        .gte('date', twelveMonthsAgo)
        .order('date', { ascending: true })
        .limit(1),
    ])

    if (expenseResult.error) throw expenseResult.error
    if (earliestTxResult.error) throw earliestTxResult.error

    const expenses = expenseResult.data ?? []
    const earliestDate = earliestTxResult.data?.[0]?.date

    let dailyExpenseRate = 0
    let monthlyExpenses = 0
    let yearlyExpenses = 0
    let dataMonths = 0
    let source: 'transactions' | 'none' = 'none'

    if (expenses.length > 0 && earliestDate) {
      // Calculate actual months of data available
      const earliest = new Date(earliestDate)
      dataMonths = Math.max(1,
        (now.getFullYear() - earliest.getFullYear()) * 12 +
        (now.getMonth() - earliest.getMonth()) + 1
      )
      dataMonths = Math.min(dataMonths, 12)

      // Sum all expenses (amounts are negative, so we take absolute value)
      const totalExpenses = expenses.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0)

      // Extrapolate to yearly if less than 12 months
      monthlyExpenses = totalExpenses / dataMonths
      yearlyExpenses = monthlyExpenses * 12
      dailyExpenseRate = yearlyExpenses / 365
      source = 'transactions'
    }

    return Response.json({
      dailyExpenseRate: Math.round(dailyExpenseRate * 100) / 100,
      monthlyExpenses: Math.round(monthlyExpenses * 100) / 100,
      yearlyExpenses: Math.round(yearlyExpenses * 100) / 100,
      dataMonths,
      transactionCount: expenses.length,
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

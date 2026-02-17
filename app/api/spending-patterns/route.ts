import { createClient } from '@/lib/supabase/server'
import {
  buildCategorySpending,
  detectSeasonalPatterns,
  detectTrends,
  detectAnomalies,
  patternsToInsights,
  type SpendingInsight,
} from '@/lib/spending-patterns'

/**
 * GET /api/spending-patterns
 * Returns AI-powered spending pattern insights for the current user.
 * Analyzes 12+ months of transaction data to detect seasonal patterns,
 * trends, and anomalies. Returns up to 5 insight cards.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    // Get date range: last 18 months of data for robust pattern detection
    const now = new Date()
    const eighteenMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 17, 1)
    const startDate = eighteenMonthsAgo.toISOString().split('T')[0]

    // Fetch budgets and transactions in parallel
    const [budgetsResult, transactionsResult, essentialBudgetsResult] = await Promise.all([
      supabase
        .from('budgets')
        .select('id, name, icon, parent_id, budget_type, is_essential, default_limit')
        .order('sort_order', { ascending: true }),
      supabase
        .from('transactions')
        .select('budget_id, amount, date, is_income')
        .gte('date', startDate)
        .not('budget_id', 'is', null),
      supabase
        .from('budgets')
        .select('id, default_limit, interval, budget_type, is_essential')
        .eq('is_essential', true)
        .in('budget_type', ['expense'])
        .is('parent_id', null),
    ])

    if (budgetsResult.error) throw budgetsResult.error
    if (transactionsResult.error) throw transactionsResult.error

    const budgets = budgetsResult.data ?? []
    const transactions = transactionsResult.data ?? []

    if (budgets.length === 0 || transactions.length === 0) {
      return Response.json({
        insights: [],
        hasData: false,
        dataMonths: 0,
        message: 'Nog niet genoeg transactiedata voor patroonanalyse.',
      })
    }

    // Count how many distinct months of data we have
    const months = new Set(transactions.map(t => t.date.slice(0, 7)))
    const dataMonths = months.size

    if (dataMonths < 3) {
      return Response.json({
        insights: [],
        hasData: false,
        dataMonths,
        message: `${dataMonths} maand${dataMonths !== 1 ? 'en' : ''} data gevonden. Minimaal 3 maanden nodig voor patroonanalyse.`,
      })
    }

    // Calculate daily expense rate for freedom-day conversion
    const totalExpenses = transactions
      .filter(t => !t.is_income)
      .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
    const avgMonthlyExpenses = totalExpenses / dataMonths
    const dailyExpenses = (avgMonthlyExpenses * 12) / 365

    // Build category spending data
    const categorySpending = buildCategorySpending(
      transactions.map(t => ({
        ...t,
        amount: Number(t.amount),
      })),
      budgets.map(b => ({
        ...b,
        is_essential: b.is_essential ?? false,
        icon: b.icon ?? 'circle',
      })),
    )

    // Detect all types of patterns
    const seasonalPatterns = detectSeasonalPatterns(categorySpending, dailyExpenses)
    const trendPatterns = detectTrends(categorySpending, dailyExpenses)
    const anomalyPatterns = detectAnomalies(categorySpending, dailyExpenses)

    // Combine all patterns and convert to insights
    const allPatterns = [...seasonalPatterns, ...trendPatterns, ...anomalyPatterns]
    const insights = patternsToInsights(allPatterns)

    return Response.json({
      insights,
      hasData: true,
      dataMonths,
      totalPatterns: allPatterns.length,
      message: dataMonths >= 12
        ? `${dataMonths} maanden geanalyseerd — seizoenspatronen gedetecteerd`
        : `${dataMonths} maanden geanalyseerd — meer data verbetert de voorspellingen`,
    })

  } catch (err) {
    console.error('Spending patterns error:', err)
    return Response.json(
      { error: 'Kon uitgavenpatronen niet analyseren.' },
      { status: 500 },
    )
  }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { section, formatCurrency, bulletList } from './formatter'
import {
  buildCategorySpending,
  detectSeasonalPatterns,
  detectTrends,
  detectAnomalies,
  type SpendingPattern,
} from '@/lib/spending-patterns'

/**
 * Build spending pattern context for AI prompts.
 * Detects seasonal patterns, trends, and anomalies from 12+ months of data.
 * Integrated into the AI context builder infrastructure for chat and recommendations.
 */
export async function buildSpendingPatternsContext(supabase: SupabaseClient): Promise<string> {
  const now = new Date()
  const eighteenMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 17, 1)
  const startDate = eighteenMonthsAgo.toISOString().split('T')[0]

  const [budgetsResult, transactionsResult] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, name, icon, parent_id, budget_type, is_essential, default_limit')
      .order('sort_order', { ascending: true }),
    supabase
      .from('transactions')
      .select('budget_id, amount, date, is_income')
      .gte('date', startDate)
      .not('budget_id', 'is', null),
  ])

  const budgets = budgetsResult.data ?? []
  const transactions = transactionsResult.data ?? []

  if (budgets.length === 0 || transactions.length === 0) {
    return ''
  }

  // Count distinct months
  const months = new Set(transactions.map(t => t.date.slice(0, 7)))
  const dataMonths = months.size

  if (dataMonths < 6) return '' // Need at least 6 months for meaningful patterns

  // Calculate daily expense rate
  const totalExpenses = transactions
    .filter(t => !t.is_income)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const avgMonthlyExpenses = totalExpenses / dataMonths
  const dailyExpenses = (avgMonthlyExpenses * 12) / 365

  // Build spending data and detect patterns
  const categorySpending = buildCategorySpending(
    transactions.map(t => ({ ...t, amount: Number(t.amount) })),
    budgets.map(b => ({
      ...b,
      is_essential: b.is_essential ?? false,
      icon: b.icon ?? 'circle',
    })),
  )

  const seasonalPatterns = detectSeasonalPatterns(categorySpending, dailyExpenses)
  const trendPatterns = detectTrends(categorySpending, dailyExpenses)
  const anomalyPatterns = detectAnomalies(categorySpending, dailyExpenses)

  const allPatterns = [...seasonalPatterns, ...trendPatterns, ...anomalyPatterns]

  if (allPatterns.length === 0) {
    return section('UITGAVENPATRONEN', `${dataMonths} maanden geanalyseerd — geen opvallende patronen gedetecteerd. Uitgaven zijn consistent.`)
  }

  const patternLines = allPatterns.slice(0, 8).map(formatPatternLine)
  const header = `${dataMonths} maanden geanalyseerd, ${allPatterns.length} patroon${allPatterns.length !== 1 ? 'en' : ''} gedetecteerd:`

  return section('UITGAVENPATRONEN', header + '\n' + bulletList(patternLines))
}

function formatPatternLine(p: SpendingPattern): string {
  const parts: string[] = []

  switch (p.type) {
    case 'seasonal_high':
      parts.push(`SEIZOEN: ${p.category} — ${p.percentageChange}% hoger in ${p.monthsAffected?.join(', ')}`)
      break
    case 'seasonal_low':
      parts.push(`SEIZOEN: ${p.category} — ${Math.abs(p.percentageChange ?? 0)}% lager in ${p.monthsAffected?.join(', ')}`)
      break
    case 'rising_trend':
      parts.push(`STIJGING: ${p.category} — gemiddeld +${p.percentageChange}% per maand`)
      break
    case 'falling_trend':
      parts.push(`DALING: ${p.category} — gemiddeld ${p.percentageChange}% per maand`)
      break
    case 'anomaly_high':
      parts.push(`OPVALLEND HOOG: ${p.category} — ${p.percentageChange}% boven gemiddelde deze maand`)
      break
    case 'anomaly_low':
      parts.push(`OPVALLEND LAAG: ${p.category} — ${Math.abs(p.percentageChange ?? 0)}% onder gemiddelde deze maand`)
      break
    default:
      parts.push(`${p.category}: ${p.description}`)
  }

  if (p.averageAmount) {
    parts.push(`gem. ${formatCurrency(p.averageAmount)}/mnd`)
  }
  if (p.impactDays) {
    parts.push(`impact: ${p.impactDays} vrijheidsdagen`)
  }

  return parts.join(' | ')
}

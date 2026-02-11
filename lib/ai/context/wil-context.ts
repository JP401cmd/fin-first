import type { SupabaseClient } from '@supabase/supabase-js'
import { getDefaultBudgets, getMockSpending } from '@/lib/budget-data'
import { section, formatCurrency, bulletList } from './formatter'

/**
 * Wil-specific context: goals, recurring transactions, optimization opportunities,
 * active recommendations and open actions.
 */
export async function buildWilContext(supabase: SupabaseClient): Promise<string> {
  const budgets = getDefaultBudgets()
  const spending = getMockSpending(0)

  // Identify optimization opportunities (non-essential categories with high spending)
  const opportunities: string[] = []
  for (const parent of budgets) {
    if (parent.budget_type === 'income' || parent.budget_type === 'savings') continue
    for (const child of parent.children ?? []) {
      const spent = spending[child.name] ?? 0
      if (!parent.is_essential && spent > 0) {
        const dailyExpense = (2510 * 12) / 365
        const freedomDays = Math.round(spent / dailyExpense)
        opportunities.push(`${child.name}: ${formatCurrency(spent)}/mnd (≈ ${freedomDays} dagen vrijheid/mnd)`)
      }
    }
  }

  const parts: string[] = []

  if (opportunities.length > 0) {
    parts.push(section('OPTIMALISATIEKANSEN', 'Niet-essentiële uitgaven deze maand:\n' + bulletList(opportunities)))
  }

  // Mock goals summary
  parts.push(section('DOELEN', [
    'Noodbuffer: €2.500/€5.000 (50%) — op schema',
    'Schulden aflossen: €2.800 resterend — verwacht klaar aug 2028',
    'FIRE bereiken: 25,4% — verwacht dec 2044',
  ].join('\n')))

  // Active recommendations
  const { data: recommendations } = await supabase
    .from('recommendations')
    .select('title, freedom_days_per_year, status, recommendation_type')
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })
    .limit(10)

  if (recommendations && recommendations.length > 0) {
    const recLines = recommendations.map(r =>
      `"${r.title}" — ${Math.round(r.freedom_days_per_year || 0)} dagen/jaar — status: ${r.status}`
    )
    parts.push(section('ACTIEVE AANBEVELINGEN', bulletList(recLines)))
  }

  // Open actions
  const { data: actions } = await supabase
    .from('actions')
    .select('title, freedom_days_impact, status, source')
    .in('status', ['open', 'postponed'])
    .order('priority_score', { ascending: false })
    .limit(10)

  if (actions && actions.length > 0) {
    const actionLines = actions.map(a =>
      `"${a.title}" — ${Math.round(a.freedom_days_impact || 0)} dagen — status: ${a.status} (${a.source})`
    )
    parts.push(section('OPENSTAANDE ACTIES', bulletList(actionLines)))
  }

  return parts.join('\n')
}

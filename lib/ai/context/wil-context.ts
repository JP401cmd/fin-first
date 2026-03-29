import type { SupabaseClient } from '@supabase/supabase-js'
import { section, formatCurrency, bulletList } from './formatter'
import { getNibudHouseholdType, getNibudReferences, calculateBenchmarks } from '@/lib/nibud/reference-data'
import type { ModuleId } from '@/lib/module-registry'

/**
 * Wil-specific context: goals, budget optimization opportunities,
 * active recommendations and open actions.
 * Uses real Supabase data.
 * When inzicht_acties module is inactive, skips goals/recommendations/actions queries.
 */
export async function buildWilContext(supabase: SupabaseClient, budgetingActive = true, activeModules: ModuleId[] = []): Promise<string> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString()

  const inzichtActiesActive = activeModules.includes('inzicht_acties')
  const noData = Promise.resolve({ data: null })

  const [budgetsRes, transactionsRes, goalsRes, recsRes, actionsRes, pastActionsRes, pastRecsRes] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, name, slug, budget_type, default_limit, is_essential, parent_id')
      .order('sort_order', { ascending: true }),
    supabase
      .from('transactions')
      .select('budget_id, amount, transaction_type')
      .gte('date', monthStart)
      .lt('date', monthEnd),
    // Goals, recommendations, actions belong to inzicht_acties module — skip when inactive
    inzichtActiesActive
      ? supabase
          .from('goals')
          .select('name, goal_type, target_value, current_value, target_date, is_completed')
          .eq('is_completed', false)
          .order('sort_order', { ascending: true })
          .limit(10)
      : noData,
    inzichtActiesActive
      ? supabase
          .from('recommendations')
          .select('title, freedom_days_per_year, status, recommendation_type')
          .in('status', ['pending', 'accepted'])
          .order('created_at', { ascending: false })
          .limit(10)
      : noData,
    inzichtActiesActive
      ? supabase
          .from('actions')
          .select('title, freedom_days_impact, status, source')
          .in('status', ['open', 'postponed'])
          .order('priority_score', { ascending: false })
          .limit(10)
      : noData,
    // Fetch completed/rejected actions from the past year to prevent duplicate suggestions
    inzichtActiesActive
      ? supabase
          .from('actions')
          .select('title, status')
          .in('status', ['completed', 'rejected'])
          .gte('updated_at', oneYearAgo)
          .order('updated_at', { ascending: false })
          .limit(30)
      : noData,
    // Fetch dismissed/completed recommendations from the past year to prevent duplicates
    inzichtActiesActive
      ? supabase
          .from('recommendations')
          .select('title, status')
          .in('status', ['dismissed', 'completed'])
          .gte('updated_at', oneYearAgo)
          .order('updated_at', { ascending: false })
          .limit(30)
      : noData,
  ])

  const budgets = budgetsRes.data ?? []
  const transactions = transactionsRes.data ?? []
  const goals = goalsRes.data ?? []
  const recommendations = recsRes.data ?? []
  const actions = actionsRes.data ?? []
  const pastActions = pastActionsRes.data ?? []
  const pastRecommendations = pastRecsRes.data ?? []

  // Calculate spending per budget from real transactions (exclude own-account transfers)
  const isRealTx = (t: { transaction_type?: string | null }) =>
    (t as { transaction_type?: string | null }).transaction_type !== 'transfer' &&
    (t as { transaction_type?: string | null }).transaction_type !== 'joint_transfer'

  const spendingByBudget: Record<string, number> = {}
  for (const t of transactions) {
    if (t.budget_id && isRealTx(t)) {
      spendingByBudget[t.budget_id] = (spendingByBudget[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
    }
  }

  // Get monthly expenses for freedom-day conversion
  const totalMonthlyExpenses = transactions
    .filter(t => Number(t.amount) < 0 && isRealTx(t))
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

  const parts: string[] = []

  // NIBUD benchmark for Wil context — fetch profile for household type and expense fallback
  const { data: { user } } = await supabase.auth.getUser()
  let profileEstExpenses = 0
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('household_type, number_of_children, children_ages, estimated_monthly_expenses')
      .eq('id', user.id)
      .single()

    profileEstExpenses = Number(profile?.estimated_monthly_expenses ?? 0)

    if (budgetingActive) {
      const dailyExpense = totalMonthlyExpenses > 0
        ? (totalMonthlyExpenses * 12) / 365
        : (profileEstExpenses > 0 ? (profileEstExpenses * 12) / 365 : 0)

      // Identify optimization opportunities (non-essential child budgets with spending)
      const parentBudgets = budgets.filter(b => !b.parent_id)
      const nonEssentialParentIds = new Set(
        parentBudgets
          .filter(b => !b.is_essential && b.budget_type !== 'income' && b.budget_type !== 'savings' && b.budget_type !== 'debt')
          .map(b => b.id)
      )

      const opportunities: string[] = []
      for (const child of budgets.filter(b => b.parent_id)) {
        if (!nonEssentialParentIds.has(child.parent_id ?? '')) continue
        const spent = spendingByBudget[child.id] ?? 0
        if (spent > 0) {
          opportunities.push(`${child.name}: ${formatCurrency(spent)}/mnd (= ${formatCurrency(spent * 12)}/jaar richting FIRE-doel)`)
        }
      }

      if (opportunities.length > 0) {
        parts.push(section('OPTIMALISATIEKANSEN', 'Niet-essentiële uitgaven deze maand:\n' + bulletList(opportunities)))
      }

      if (profile) {
        const householdType = getNibudHouseholdType(profile)
        const references = await getNibudReferences(supabase, householdType)

        if (references.length > 0) {
          // Build spending-by-slug from this month's transactions
          const spendingBySlug: Record<string, number> = {}
          for (const child of budgets.filter(b => b.slug)) {
            const spent = spendingByBudget[child.id] ?? 0
            if (spent > 0 && child.slug) {
              spendingBySlug[child.slug] = (spendingBySlug[child.slug] ?? 0) + spent
            }
          }

          const benchmarks = calculateBenchmarks(references, spendingBySlug, dailyExpense)
          const aboveNorm = benchmarks.filter(b => b.delta > 0 && b.freedom_days_potential > 0)

          if (aboveNorm.length > 0) {
            const lines = aboveNorm.slice(0, 5).map(b =>
              `${b.nibud_category_name}: ${formatCurrency(b.user_spending)}/mnd vs NIBUD ${formatCurrency(b.voorbeeld_amount ?? b.basis_amount)}/mnd (+${formatCurrency(b.delta)}, ~${b.freedom_days_potential} dagen/jaar)`
            )
            const total = aboveNorm.reduce((s, b) => s + b.freedom_days_potential, 0)
            parts.push(section(
              'NIBUD BENCHMARK (boven norm)',
              bulletList(lines) + `\nTotaal potentieel: ~${total} vrijheidsdagen/jaar`,
            ))
          }
        }
      }
    }
  }

  // Real goals summary from database
  if (goals.length > 0) {
    const goalLines = goals.map(g => {
      const current = Number(g.current_value)
      const target = Number(g.target_value)
      const pct = target > 0 ? Math.round((current / target) * 100) : 0
      const dateInfo = g.target_date ? ` — deadline ${g.target_date}` : ''
      return `${g.name}: ${formatCurrency(current)}/${formatCurrency(target)} (${pct}%)${dateInfo}`
    })
    parts.push(section('DOELEN', bulletList(goalLines)))
  }

  // Active recommendations
  if (recommendations.length > 0) {
    const recLines = recommendations.map(r =>
      `"${r.title}" — ${Math.round(r.freedom_days_per_year || 0)} dagen/jaar — status: ${r.status}`
    )
    parts.push(section('ACTIEVE AANBEVELINGEN', bulletList(recLines)))
  }

  // Open actions
  if (actions.length > 0) {
    const actionLines = actions.map(a =>
      `"${a.title}" — ${Math.round(a.freedom_days_impact || 0)} dagen — status: ${a.status} (${a.source})`
    )
    parts.push(section('OPENSTAANDE ACTIES', bulletList(actionLines)))
  }

  // Past actions and recommendations — to prevent duplicate suggestions
  const pastItems: string[] = [
    ...pastActions.map(a => `Actie: "${a.title}" (${a.status})`),
    ...pastRecommendations.map(r => `Aanbeveling: "${r.title}" (${r.status})`),
  ]
  if (pastItems.length > 0) {
    parts.push(section(
      'EERDER VOORGESTELDE ACTIES & AANBEVELINGEN (niet opnieuw voorstellen)',
      'Deze acties en aanbevelingen zijn al afgerond, afgewezen of weggestuurd. Stel ze NIET opnieuw voor, ook niet in andere bewoordingen.\n' + bulletList(pastItems),
    ))
  }

  return parts.join('\n')
}

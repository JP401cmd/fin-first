import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSharedContext } from './shared-context'
import { section, formatCurrency, bulletList } from './formatter'

const TEMPORAL_LABELS: Record<number, string> = {
  1: 'De Levensgenieter (level 1) — Comfort > Snelheid. Wil niet inleveren op comfort. FIRE is een leuke bonus, geen obsessie.',
  2: 'De Reiziger (level 2) — Spaart wat overblijft. Ervaringen en herinneringen gaan voor. Balans, licht hellend naar nu.',
  3: 'De Architect (level 3) — Optimaliseert bewust. Bereid luxe op te offeren als het tijd oplevert, maar geen kluizenaar. De gulden middenweg.',
  4: 'De Stoïcijn (level 4) — Haalt plezier uit soberheid en efficiency. Streng en doelgericht. Snelheid > Comfort.',
  5: 'De Essentialist (level 5) — Alles wat niet essentieel is, moet weg. Minimalistisch leven voor maximale snelheid naar vrijheid.',
}

/**
 * Build the full financial context for AI recommendation generation.
 * Uses real Supabase data for budgets, transactions, assets, debts, profile, and feedback.
 */
export async function buildRecommendationContext(supabase: SupabaseClient): Promise<string> {
  const parts: string[] = []

  // User identity/profile
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, date_of_birth, household_type, temporal_balance')
      .eq('id', user.id)
      .single()

    if (profile) {
      const age = profile.date_of_birth
        ? Math.floor((Date.now() - new Date(profile.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null
      const temporal = TEMPORAL_LABELS[profile.temporal_balance ?? 3] ?? TEMPORAL_LABELS[3]
      const identityLines = [
        age ? `Leeftijd: ${age} jaar` : null,
        `Huishoudtype: ${profile.household_type ?? 'solo'}`,
        `Temporal Balance: ${temporal}`,
      ].filter(Boolean) as string[]

      parts.push(section('IDENTITEIT & VOORKEUREN', identityLines.join('\n')))
    }
  }

  // Shared financial overview (net worth, FIRE, freedom %)
  const shared = await buildSharedContext(supabase)
  parts.push(shared)

  // Budget spending patterns
  const { data: budgets } = await supabase
    .from('budgets')
    .select('id, name, slug, parent_id, default_limit, is_essential, budget_type, priority_score')
    .order('sort_order')

  const { data: transactions } = await supabase
    .from('transactions')
    .select('budget_id, amount, date, is_income')
    .gte('date', getMonthsAgoDate(3))

  if (budgets && transactions) {
    // Aggregate spending per budget over last 3 months
    const spendingMap = new Map<string, number>()
    for (const tx of transactions) {
      if (tx.is_income || !tx.budget_id) continue
      const current = spendingMap.get(tx.budget_id) || 0
      spendingMap.set(tx.budget_id, current + Math.abs(Number(tx.amount)))
    }

    const budgetLines: string[] = []
    for (const budget of budgets) {
      if (budget.budget_type === 'income' || budget.parent_id) continue
      const totalSpent = spendingMap.get(budget.id) || 0
      const monthlyAvg = Math.round(totalSpent / 3)
      if (monthlyAvg > 0) {
        const limit = Number(budget.default_limit) || 0
        const essential = budget.is_essential ? ' [essentieel]' : ''
        const overBudget = limit > 0 && monthlyAvg > limit ? ` (OVER budget: ${formatCurrency(monthlyAvg - limit)})` : ''
        budgetLines.push(
          `${budget.name} (${budget.slug || '-'}): ${formatCurrency(monthlyAvg)}/mnd | budget: ${limit > 0 ? formatCurrency(limit) : 'geen'}${essential}${overBudget}`
        )
      }
    }

    // Also add child budget details
    for (const budget of budgets) {
      if (budget.budget_type === 'income' || !budget.parent_id) continue
      const totalSpent = spendingMap.get(budget.id) || 0
      const monthlyAvg = Math.round(totalSpent / 3)
      if (monthlyAvg > 0) {
        const limit = Number(budget.default_limit) || 0
        const essential = budget.is_essential ? ' [essentieel]' : ''
        budgetLines.push(
          `  └ ${budget.name} (${budget.slug || '-'}): ${formatCurrency(monthlyAvg)}/mnd | budget: ${limit > 0 ? formatCurrency(limit) : 'geen'}${essential}`
        )
      }
    }

    if (budgetLines.length > 0) {
      parts.push(section('BUDGET & UITGAVEN (gem. 3 maanden)', bulletList(budgetLines)))
    }
  }

  // Assets
  const { data: assets } = await supabase
    .from('assets')
    .select('name, asset_type, current_value, expected_return, monthly_contribution, is_active')
    .eq('is_active', true)

  if (assets && assets.length > 0) {
    const assetLines = assets.map(a =>
      `${a.name} (${a.asset_type}): ${formatCurrency(Number(a.current_value))} | rendement: ${a.expected_return}% | bijdrage: ${formatCurrency(Number(a.monthly_contribution))}/mnd`
    )
    parts.push(section('ACTIVA', bulletList(assetLines)))
  }

  // Debts
  const { data: debts } = await supabase
    .from('debts')
    .select('name, debt_type, current_balance, interest_rate, monthly_payment, minimum_payment, is_active')
    .eq('is_active', true)

  if (debts && debts.length > 0) {
    const debtLines = debts.map(d =>
      `${d.name} (${d.debt_type}): ${formatCurrency(Number(d.current_balance))} | rente: ${d.interest_rate}% | betaling: ${formatCurrency(Number(d.monthly_payment))}/mnd (min: ${formatCurrency(Number(d.minimum_payment))})`
    )
    parts.push(section('SCHULDEN', bulletList(debtLines)))
  }

  // Previously rejected feedback — so AI avoids similar suggestions
  const { data: feedback } = await supabase
    .from('recommendation_feedback')
    .select('recommendation_type, related_budget_slug, reason, feedback_type')
    .in('feedback_type', ['rejected', 'action_rejected'])
    .order('created_at', { ascending: false })
    .limit(20)

  if (feedback && feedback.length > 0) {
    const feedbackLines = feedback.map(f => {
      const slug = f.related_budget_slug ? ` (${f.related_budget_slug})` : ''
      const reason = f.reason ? ` — reden: "${f.reason}"` : ''
      return `${f.recommendation_type}${slug}: ${f.feedback_type}${reason}`
    })
    parts.push(section('EERDER AFGEWEZEN (vermijd vergelijkbaar)', bulletList(feedbackLines)))
  }

  // Existing pending/accepted recommendations — avoid duplicates
  const { data: existing } = await supabase
    .from('recommendations')
    .select('title, recommendation_type, related_budget_slug, status')
    .in('status', ['pending', 'accepted'])

  if (existing && existing.length > 0) {
    const existingLines = existing.map(r => {
      const slug = r.related_budget_slug ? ` (${r.related_budget_slug})` : ''
      return `${r.title}${slug} — status: ${r.status}`
    })
    parts.push(section('BESTAANDE VOORSTELLEN (geen duplicaten)', bulletList(existingLines)))
  }

  return parts.join('\n')
}

function getMonthsAgoDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().split('T')[0]
}

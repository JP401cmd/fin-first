import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getNibudHouseholdType, getNibudReferences, calculateBenchmarks } from '@/lib/nibud/reference-data'
import { fetchNibudApi } from '@/lib/nibud/api-client'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Fetch profile with household fields
  const { data: profile } = await supabase
    .from('profiles')
    .select('household_type, number_of_children, children_ages, housing_type, net_monthly_income')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profiel niet gevonden' }, { status: 404 })
  }

  const householdType = getNibudHouseholdType(profile)

  // Try NIBUD API first, fallback to static data
  const apiResult = await fetchNibudApi(profile, householdType)

  let references = await getNibudReferences(supabase, householdType)

  // If API returned data, override voorbeeld_amount with API amounts
  if (apiResult && apiResult.length > 0) {
    const apiBySlug = new Map<string, number>()
    for (const item of apiResult) {
      apiBySlug.set(item.slug, (apiBySlug.get(item.slug) ?? 0) + item.amount)
    }

    references = references.map(ref => {
      const apiAmount = ref.mapped_budget_slug ? apiBySlug.get(ref.mapped_budget_slug) : null
      if (apiAmount != null) {
        return { ...ref, voorbeeld_amount: apiAmount }
      }
      return ref
    })
  }

  // Get user spending from last 3 months of transactions
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const dateStr = threeMonthsAgo.toISOString().split('T')[0]

  const [budgetsRes, txRes] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, slug, budget_type')
      .order('sort_order'),
    supabase
      .from('transactions')
      .select('budget_id, amount, is_income')
      .gte('date', dateStr),
  ])

  const budgets = budgetsRes.data ?? []
  const transactions = txRes.data ?? []

  // Aggregate spending per budget slug
  const spendingByBudgetId = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.is_income || !tx.budget_id) continue
    const current = spendingByBudgetId.get(tx.budget_id) ?? 0
    spendingByBudgetId.set(tx.budget_id, current + Math.abs(Number(tx.amount)))
  }

  const spendingBySlug: Record<string, number> = {}
  for (const budget of budgets) {
    if (!budget.slug || budget.budget_type === 'income') continue
    const totalSpent = spendingByBudgetId.get(budget.id) ?? 0
    const monthlyAvg = Math.round(totalSpent / 3)
    if (monthlyAvg > 0) {
      spendingBySlug[budget.slug] = (spendingBySlug[budget.slug] ?? 0) + monthlyAvg
    }
  }

  // Build slug → budget id map for deep-linking
  const slugToId: Record<string, string> = {}
  for (const budget of budgets) {
    if (budget.slug) slugToId[budget.slug] = budget.id
  }

  const totalMonthly = Object.values(spendingBySlug).reduce((s, v) => s + v, 0)
  const dailyExpense = totalMonthly > 0 ? (totalMonthly * 12) / 365 : 1

  const benchmarks = calculateBenchmarks(references, spendingBySlug, dailyExpense, slugToId)

  const householdLabels: Record<string, string> = {
    alleenstaand: 'Alleenstaand',
    paar: 'Paar zonder kinderen',
    gezin_jong: 'Gezin met jonge kinderen',
    gezin_tiener: 'Gezin met tieners',
  }

  return NextResponse.json({
    household_type: householdType,
    household_label: householdLabels[householdType],
    year: 2026,
    source: apiResult ? 'nibud_api' : 'static',
    benchmarks,
    total_freedom_days_potential: benchmarks.reduce((s, b) => s + b.freedom_days_potential, 0),
  })
}

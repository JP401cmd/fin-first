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

  const budgetsRes = await supabase
    .from('budgets')
    .select('id, slug, budget_type, default_limit, interval')
    .eq('user_id', user.id)
    .order('sort_order')

  const budgets = budgetsRes.data ?? []

  // Normaliseer budget naar maandbedrag per slug
  const budgetBySlug: Record<string, number> = {}
  for (const budget of budgets) {
    if (!budget.slug || budget.budget_type === 'income') continue
    const limit = Number(budget.default_limit) || 0
    if (limit <= 0) continue
    const monthly = budget.interval === 'yearly'
      ? limit / 12
      : budget.interval === 'quarterly'
        ? limit / 3
        : limit
    budgetBySlug[budget.slug] = (budgetBySlug[budget.slug] ?? 0) + Math.round(monthly)
  }

  // Build slug → budget id map for deep-linking
  const slugToId: Record<string, string> = {}
  for (const budget of budgets) {
    if (budget.slug) slugToId[budget.slug] = budget.id
  }

  const totalMonthly = Object.values(budgetBySlug).reduce((s, v) => s + v, 0)
  const dailyExpense = totalMonthly > 0 ? (totalMonthly * 12) / 365 : 1

  const benchmarks = calculateBenchmarks(references, budgetBySlug, dailyExpense, slugToId)

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

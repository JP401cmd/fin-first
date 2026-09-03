import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { getNibudHouseholdType, getNibudReferences, calculateBenchmarks } from '@/lib/nibud/reference-data'
import { fetchNibudApi } from '@/lib/nibud/api-client'
import { getRecentDailyExpenseRate } from '@/lib/expense-rate'

export async function GET() {
  const supabase = await createClient()

  const claims = await getAuthClaims(supabase)
  if (!claims) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Fetch profile with household fields
  const { data: profile } = await supabase
    .from('profiles')
    .select('household_type, number_of_children, children_ages, housing_type, net_monthly_income')
    .eq('id', claims.sub)
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
    .eq('user_id', claims.sub)
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

  // Canoniek dagtarief (lib/expense-rate.ts): 12-mnd rolling GEREALISEERDE
  // consumptie. Hier stond de som van budget-LIMIETEN × 12 / 365 met een
  // verzonnen €1/dag als terugval — een andere teller én een andere noemer dan
  // elk ander scherm (1d, nazorg R2+R3). 0 = geen eerlijke dagbasis →
  // calculateBenchmarks laat de vrijheidsdagen dan op 0.
  const { dailyRate: dailyExpense } = await getRecentDailyExpenseRate(supabase)

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

import { createClient } from '@/lib/supabase/server'
import { computeFireProjection, type HorizonInput } from '@/lib/horizon-data'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Parse privacy level from query params
  const url = new URL(request.url)
  const privacyLevel = url.searchParams.get('privacy') || 'anonymous'
  if (!['anonymous', 'named', 'full'].includes(privacyLevel)) {
    return Response.json({ error: 'Ongeldig privacy niveau' }, { status: 400 })
  }

  // Fetch all financial data in parallel (same as dashboard)
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

  const [
    txResult, assetsResult, debtsResult, profileResult,
    essentialBudgetsResult, actionsResult, childBudgetsResult,
  ] = await Promise.all([
    supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
    supabase.from('assets').select('current_value, monthly_contribution').eq('is_active', true),
    supabase.from('debts').select('current_balance, debt_type').eq('is_active', true),
    supabase.from('profiles').select('full_name, date_of_birth').single(),
    supabase.from('budgets').select('id, default_limit, interval').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
    supabase.from('actions').select('id, status, freedom_days_impact').in('status', ['open', 'completed']),
    supabase.from('budgets').select('id, parent_id, default_limit').not('parent_id', 'is', null),
  ])

  // Core calculations (matching dashboard logic exactly)
  let monthlyIncome = 0
  let monthlyExpenses = 0
  for (const tx of txResult.data ?? []) {
    const amt = Number(tx.amount)
    if (amt > 0) monthlyIncome += amt
    else monthlyExpenses += Math.abs(amt)
  }

  const totalAssets = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.current_value), 0)
  const totalDebts = (debtsResult.data ?? []).reduce((s, d) => s + Number(d.current_balance), 0)
  const netWorth = totalAssets - totalDebts
  const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

  const allChildren = childBudgetsResult.data ?? []
  let yearlyMustExpenses = 0
  for (const b of essentialBudgetsResult.data ?? []) {
    const children = allChildren.filter((c: { parent_id: string }) => c.parent_id === b.id)
    const limit = children.length > 0
      ? children.reduce((sum: number, c: { default_limit: number }) => sum + Number(c.default_limit), 0)
      : Number(b.default_limit)
    if (b.interval === 'monthly') yearlyMustExpenses += limit * 12
    else if (b.interval === 'quarterly') yearlyMustExpenses += limit * 4
    else yearlyMustExpenses += limit
  }

  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / 0.04 : 0
  const freedomPct = fireTarget > 0 ? Math.max(Math.min((netWorth / fireTarget) * 100, 100), 0) : 0

  // FIRE projection
  const horizonInput: HorizonInput = {
    totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
    monthlyContributions, yearlyMustExpenses,
    dateOfBirth: profileResult.data?.date_of_birth ?? null,
  }
  const fireProj = computeFireProjection(horizonInput)

  // Days won (from completed actions)
  const allActions = actionsResult.data ?? []
  const completedActions = allActions.filter(a => a.status === 'completed')
  const totalFreedomDaysWon = completedActions.reduce(
    (s, a) => s + (Number(a.freedom_days_impact) || 0), 0
  )

  // Build card data based on privacy level
  const cardData: Record<string, unknown> = {
    privacyLevel,
    freedomPercentage: Math.round(freedomPct * 10) / 10,
    freedomDaysWon: Math.round(totalFreedomDaysWon),
    fireCountdown: {
      years: fireProj.countdownYears,
      months: fireProj.countdownMonths,
      days: fireProj.countdownDays,
      label: fireProj.fireDate,
    },
    freedomTime: {
      years: fireProj.freedomYears,
      months: fireProj.freedomMonths,
    },
    savingsRate: Math.round(fireProj.savingsRate * 10) / 10,
    generatedAt: new Date().toISOString(),
  }

  // Named: include user name
  if (privacyLevel === 'named' || privacyLevel === 'full') {
    cardData.displayName = profileResult.data?.full_name || user.email?.split('@')[0] || 'Gebruiker'
  }

  // Full: include EUR amounts (opt-in)
  if (privacyLevel === 'full') {
    cardData.netWorth = netWorth
    cardData.fireTarget = fireTarget
  }

  return Response.json(cardData)
}

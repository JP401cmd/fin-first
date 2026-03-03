import { createClient } from '@/lib/supabase/server'
import { computeFireProjection, type FinancialInput } from '@/lib/horizon-data'

export async function GET(request: Request) {
  try {
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
    // Each query uses individual error handling to gracefully degrade
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

    const [
      txResult, assetsResult, debtsResult, profileResult,
      essentialBudgetsResult, actionsResult, childBudgetsResult,
    ] = await Promise.allSettled([
      supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
      supabase.from('assets').select('current_value, monthly_contribution').eq('is_active', true),
      supabase.from('debts').select('current_balance, debt_type').eq('is_active', true),
      supabase.from('profiles').select('full_name, date_of_birth').single(),
      supabase.from('budgets').select('id, default_limit, interval').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
      supabase.from('actions').select('id, status, freedom_days_impact, completed_at').in('status', ['open', 'completed']),
      supabase.from('budgets').select('id, parent_id, default_limit').not('parent_id', 'is', null),
    ])

    // Safely extract data from settled promises (gracefully handle failures)
    const txData = txResult.status === 'fulfilled' ? (txResult.value.data ?? []) : []
    const assetsData = assetsResult.status === 'fulfilled' ? (assetsResult.value.data ?? []) : []
    const debtsData = debtsResult.status === 'fulfilled' ? (debtsResult.value.data ?? []) : []
    const profileData = profileResult.status === 'fulfilled' ? profileResult.value.data : null
    const essentialBudgetsData = essentialBudgetsResult.status === 'fulfilled' ? (essentialBudgetsResult.value.data ?? []) : []
    const actionsData = actionsResult.status === 'fulfilled' ? (actionsResult.value.data ?? []) : []
    const childBudgetsData = childBudgetsResult.status === 'fulfilled' ? (childBudgetsResult.value.data ?? []) : []

    // Track which data sources are available for the card
    const hasTransactions = txData.length > 0
    const hasAssets = assetsData.length > 0
    const hasDebts = debtsData.length > 0
    const hasExpenses = txData.some((tx: { amount: number }) => Number(tx.amount) < 0)

    // Core calculations (matching dashboard logic exactly)
    let monthlyIncome = 0
    let monthlyExpenses = 0
    for (const tx of txData) {
      const amt = Number(tx.amount)
      if (amt > 0) monthlyIncome += amt
      else monthlyExpenses += Math.abs(amt)
    }

    const totalAssets = assetsData.reduce((s: number, a: { current_value: number }) => s + Number(a.current_value), 0)
    const totalDebts = debtsData.reduce((s: number, d: { current_balance: number }) => s + Number(d.current_balance), 0)
    const netWorth = totalAssets - totalDebts
    const monthlyContributions = assetsData.reduce((s: number, a: { monthly_contribution: number }) => s + Number(a.monthly_contribution), 0)

    let yearlyMustExpenses = 0
    for (const b of essentialBudgetsData) {
      const children = childBudgetsData.filter((c: { parent_id: string }) => c.parent_id === b.id)
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
    const horizonInput: FinancialInput = {
      totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
      monthlyContributions, yearlyMustExpenses,
      dateOfBirth: profileData?.date_of_birth ?? null,
    }
    const fireProj = computeFireProjection(horizonInput)

    // Days won (from completed actions)
    const completedActions = actionsData.filter((a: { status: string }) => a.status === 'completed')
    const totalFreedomDaysWon = completedActions.reduce(
      (s: number, a: { freedom_days_impact?: number }) => s + (Number(a.freedom_days_impact) || 0), 0
    )

    // Days won THIS MONTH (completed actions with completed_at in current month)
    const freedomDaysWonThisMonth = completedActions
      .filter((a: { completed_at?: string }) => {
        if (!a.completed_at) return false
        const completedDate = a.completed_at.split('T')[0]
        return completedDate >= monthStart && completedDate < monthEnd
      })
      .reduce(
        (s: number, a: { freedom_days_impact?: number }) => s + (Number(a.freedom_days_impact) || 0), 0
      )

    // Determine if FIRE calculation is possible (requires expense data)
    const canCalculateFire = hasExpenses && yearlyExpenses > 0

    // Determine the fire countdown label with graceful fallback
    // fireProj.fireDate can be: 'Bereikt!', 'Niet haalbaar', 'mrt 2038', or '' (empty)
    const fireCountdownLabel = fireProj.fireDate || (canCalculateFire ? 'Niet haalbaar' : 'Nog geen data')

    // Build card data based on privacy level
    const cardData: Record<string, unknown> = {
      privacyLevel,
      freedomPercentage: canCalculateFire ? Math.round(freedomPct * 10) / 10 : null,
      freedomDaysWon: Math.round(totalFreedomDaysWon),
      freedomDaysWonThisMonth: Math.round(freedomDaysWonThisMonth),
      fireCountdown: {
        years: fireProj.countdownYears,
        months: fireProj.countdownMonths,
        days: fireProj.countdownDays,
        label: fireCountdownLabel,
      },
      freedomTime: {
        years: fireProj.freedomYears,
        months: fireProj.freedomMonths,
      },
      savingsRate: hasTransactions ? Math.round(fireProj.savingsRate * 10) / 10 : null,
      generatedAt: new Date().toISOString(),
      // Metadata about data availability (helps the card show N/A for missing metrics)
      dataAvailability: {
        hasTransactions,
        hasAssets,
        hasDebts,
        hasExpenses,
        canCalculateFire,
      },
    }

    // Named: include user name
    if (privacyLevel === 'named' || privacyLevel === 'full') {
      cardData.displayName = profileData?.full_name || user.email?.split('@')[0] || 'Gebruiker'
    }

    // Full: include EUR amounts (opt-in)
    if (privacyLevel === 'full') {
      cardData.netWorth = netWorth
      cardData.fireTarget = fireTarget > 0 ? fireTarget : null
    }

    return Response.json(cardData)
  } catch (error) {
    console.error('Freedom card generation error:', error)
    return Response.json(
      { error: 'Kaart genereren mislukt. Probeer het later opnieuw.' },
      { status: 500 }
    )
  }
}

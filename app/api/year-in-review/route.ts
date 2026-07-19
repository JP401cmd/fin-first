import { createClient, getAuthClaims } from '@/lib/supabase/server'
// Scalar-router (FASE 5, stap 2e) — BEWUSTE UITZONDERING: deze route riep
// computeFireProjection nooit aan (dode import, hier opgeruimd). De FIRE-sectie
// is historische snapshot-weergave (doel = uitgaven/NL_SWR per snapshot-moment),
// geen FIRE-solve — de kernel kan historische percentages niet herrekenen.
import { NL_SWR } from '@/lib/horizon-data'

export interface YearInReviewData {
  year: number
  displayName: string | null

  // Section 1: Freedom days won
  freedomDaysWon: number
  freedomDaysByMonth: { month: string; label: string; days: number }[]
  bestFreedomMonth: { month: string; label: string; days: number } | null

  // Section 2: Net worth growth
  netWorthStart: number | null
  netWorthEnd: number | null
  netWorthGrowth: number | null
  netWorthGrowthPct: number | null
  netWorthByMonth: { month: string; value: number }[]

  // Section 4: Best and worst months
  bestMonth: { month: string; label: string; savings: number } | null
  worstMonth: { month: string; label: string; savings: number } | null
  monthlyOverview: { month: string; label: string; income: number; expenses: number; savings: number }[]

  // Section 5: FIRE progress
  fireStart: {
    percentage: number
    netWorth: number
    fireTarget: number
  } | null
  fireEnd: {
    percentage: number
    netWorth: number
    fireTarget: number
  } | null
  fireProgressDelta: number | null

  // Summary stats
  totalIncome: number
  totalExpenses: number
  totalSaved: number
  savingsRate: number | null
  actionsCompleted: number

  generatedAt: string
}

const MONTH_LABELS_NL: Record<number, string> = {
  0: 'jan', 1: 'feb', 2: 'mrt', 3: 'apr', 4: 'mei', 5: 'jun',
  6: 'jul', 7: 'aug', 8: 'sep', 9: 'okt', 10: 'nov', 11: 'dec',
}

const MONTH_NAMES_NL: Record<number, string> = {
  0: 'Januari', 1: 'Februari', 2: 'Maart', 3: 'April', 4: 'Mei', 5: 'Juni',
  6: 'Juli', 7: 'Augustus', 8: 'September', 9: 'Oktober', 10: 'November', 11: 'December',
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)

    if (!claims) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    // Parse year from query params (default: previous year, or current if Dec/Jan)
    const url = new URL(request.url)
    const now = new Date()
    const defaultYear = now.getMonth() >= 11 ? now.getFullYear() : now.getFullYear() - 1
    const year = parseInt(url.searchParams.get('year') || String(defaultYear), 10)

    if (isNaN(year) || year < 2000 || year > now.getFullYear()) {
      return Response.json({ error: 'Ongeldig jaar' }, { status: 400 })
    }

    const yearStart = `${year}-01-01`
    const yearEnd = `${year + 1}-01-01`

    // Fetch all data in parallel
    const [
      snapshotsResult,
      actionsResult,
      transactionsResult,
      profileResult,
      assetsResult,
      debtsResult,
      budgetsResult,
      childBudgetsResult,
    ] = await Promise.allSettled([
      // Net worth snapshots for the year
      supabase
        .from('net_worth_snapshots')
        .select('snapshot_date, net_worth, total_assets, total_debts, freedom_percentage')
        .gte('snapshot_date', yearStart)
        .lt('snapshot_date', yearEnd)
        .order('snapshot_date', { ascending: true }),

      // All completed actions in the year
      supabase
        .from('actions')
        .select('id, status, freedom_days_impact, completed_at')
        .eq('status', 'completed')
        .gte('completed_at', yearStart)
        .lt('completed_at', yearEnd),

      // All transactions in the year
      supabase
        .from('transactions')
        .select('amount, date, is_income')
        .gte('date', yearStart)
        .lt('date', yearEnd),

      // User profile
      supabase
        .from('profiles')
        .select('full_name, date_of_birth')
        .single(),

      // Current assets (for end-of-year FIRE calc)
      supabase
        .from('assets')
        .select('current_value, monthly_contribution')
        .eq('is_active', true),

      // Current debts
      supabase
        .from('debts')
        .select('current_balance')
        .eq('is_active', true),

      // Essential budgets for FIRE target
      supabase
        .from('budgets')
        .select('id, default_limit, interval')
        .eq('is_essential', true)
        .in('budget_type', ['expense'])
        .is('parent_id', null),

      // Child budgets
      supabase
        .from('budgets')
        .select('id, parent_id, default_limit')
        .not('parent_id', 'is', null),
    ])

    // Safe data extraction
    const snapshots = snapshotsResult.status === 'fulfilled' ? (snapshotsResult.value.data ?? []) : []
    const actions = actionsResult.status === 'fulfilled' ? (actionsResult.value.data ?? []) : []
    const transactions = transactionsResult.status === 'fulfilled' ? (transactionsResult.value.data ?? []) : []
    const profile = profileResult.status === 'fulfilled' ? profileResult.value.data : null
    const assets = assetsResult.status === 'fulfilled' ? (assetsResult.value.data ?? []) : []
    const debts = debtsResult.status === 'fulfilled' ? (debtsResult.value.data ?? []) : []
    const essentialBudgets = budgetsResult.status === 'fulfilled' ? (budgetsResult.value.data ?? []) : []
    const childBudgetsData = childBudgetsResult.status === 'fulfilled' ? (childBudgetsResult.value.data ?? []) : []

    // ── Section 1: Freedom days won ──
    const freedomDaysByMonth: { month: string; label: string; days: number }[] = []
    for (let m = 0; m < 12; m++) {
      const monthStr = `${year}-${String(m + 1).padStart(2, '0')}`
      freedomDaysByMonth.push({ month: monthStr, label: MONTH_LABELS_NL[m], days: 0 })
    }

    let totalFreedomDays = 0
    for (const action of actions) {
      const days = Number(action.freedom_days_impact) || 0
      if (days <= 0 || !action.completed_at) continue
      totalFreedomDays += days

      const completedDate = new Date(action.completed_at)
      const monthIdx = completedDate.getMonth()
      if (completedDate.getFullYear() === year && freedomDaysByMonth[monthIdx]) {
        freedomDaysByMonth[monthIdx].days += days
      }
    }

    // Round to 1 decimal
    for (const m of freedomDaysByMonth) {
      m.days = Math.round(m.days * 10) / 10
    }

    const bestFreedomMonth = freedomDaysByMonth.reduce<{ month: string; label: string; days: number } | null>(
      (best, m) => (!best || m.days > best.days) ? m : best,
      null
    )

    // ── Section 2: Net worth growth ──
    type SnapshotRow = { snapshot_date: string; net_worth: number; total_assets: number; total_debts: number; freedom_percentage?: number }
    const firstSnapshot = snapshots.length > 0 ? (snapshots[0] as SnapshotRow) : null
    const lastSnapshot = snapshots.length > 0 ? (snapshots[snapshots.length - 1] as SnapshotRow) : null

    const netWorthStart = firstSnapshot ? Number(firstSnapshot.net_worth) : null
    const netWorthEnd = lastSnapshot ? Number(lastSnapshot.net_worth) : null
    const netWorthGrowth = netWorthStart != null && netWorthEnd != null ? netWorthEnd - netWorthStart : null
    const netWorthGrowthPct = netWorthStart != null && netWorthEnd != null && netWorthStart !== 0
      ? ((netWorthEnd - netWorthStart) / Math.abs(netWorthStart)) * 100
      : null

    const netWorthByMonth = snapshots.map((s: SnapshotRow) => ({
      month: s.snapshot_date,
      value: Number(s.net_worth),
    }))

    // ── Section 4: Best and worst months ──
    type TxRow = { amount: number; date: string; is_income?: boolean }
    const monthlyOverview: { month: string; label: string; income: number; expenses: number; savings: number }[] = []

    for (let m = 0; m < 12; m++) {
      const monthStr = `${year}-${String(m + 1).padStart(2, '0')}`
      monthlyOverview.push({ month: monthStr, label: MONTH_NAMES_NL[m], income: 0, expenses: 0, savings: 0 })
    }

    let totalIncome = 0
    let totalExpenses = 0

    for (const tx of transactions as TxRow[]) {
      const amt = Number(tx.amount)
      const txDate = new Date(tx.date)
      if (txDate.getFullYear() !== year) continue

      const monthIdx = txDate.getMonth()
      if (amt > 0) {
        monthlyOverview[monthIdx].income += amt
        totalIncome += amt
      } else {
        monthlyOverview[monthIdx].expenses += Math.abs(amt)
        totalExpenses += Math.abs(amt)
      }
    }

    // Calculate savings per month
    for (const m of monthlyOverview) {
      m.savings = Math.round(m.income - m.expenses)
      m.income = Math.round(m.income)
      m.expenses = Math.round(m.expenses)
    }

    // Only consider months with actual data for best/worst
    const monthsWithData = monthlyOverview.filter(m => m.income > 0 || m.expenses > 0)
    const bestMonth = monthsWithData.length > 0
      ? monthsWithData.reduce((best, m) => m.savings > best.savings ? m : best)
      : null
    const worstMonth = monthsWithData.length > 0
      ? monthsWithData.reduce((worst, m) => m.savings < worst.savings ? m : worst)
      : null

    const totalSaved = Math.round(totalIncome - totalExpenses)
    const savingsRate = totalIncome > 0 ? Math.round((totalSaved / totalIncome) * 1000) / 10 : null

    // ── Section 5: FIRE progress ──
    // Use snapshots for start-of-year and end-of-year positions
    let fireStart: YearInReviewData['fireStart'] = null
    let fireEnd: YearInReviewData['fireEnd'] = null

    // Get average monthly expenses for FIRE target calculation
    const avgMonthlyExpenses = monthsWithData.length > 0
      ? totalExpenses / monthsWithData.length
      : 0
    const yearlyExpenses = avgMonthlyExpenses * 12
    const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / NL_SWR : 0

    if (firstSnapshot && fireTarget > 0) {
      const startNw = Number(firstSnapshot.net_worth)
      fireStart = {
        percentage: Math.round(Math.min((startNw / fireTarget) * 100, 100) * 10) / 10,
        netWorth: Math.round(startNw),
        fireTarget: Math.round(fireTarget),
      }
    }

    if (lastSnapshot && fireTarget > 0) {
      const endNw = Number(lastSnapshot.net_worth)
      fireEnd = {
        percentage: Math.round(Math.min((endNw / fireTarget) * 100, 100) * 10) / 10,
        netWorth: Math.round(endNw),
        fireTarget: Math.round(fireTarget),
      }
    }

    const fireProgressDelta = fireStart && fireEnd
      ? Math.round((fireEnd.percentage - fireStart.percentage) * 10) / 10
      : null

    // Build the response
    const reviewData: YearInReviewData = {
      year,
      displayName: profile?.full_name || null,

      // Freedom days
      freedomDaysWon: Math.round(totalFreedomDays * 10) / 10,
      freedomDaysByMonth,
      bestFreedomMonth: bestFreedomMonth && bestFreedomMonth.days > 0 ? bestFreedomMonth : null,

      // Net worth
      netWorthStart,
      netWorthEnd,
      netWorthGrowth: netWorthGrowth != null ? Math.round(netWorthGrowth) : null,
      netWorthGrowthPct: netWorthGrowthPct != null ? Math.round(netWorthGrowthPct * 10) / 10 : null,
      netWorthByMonth,

      // Monthly overview
      bestMonth,
      worstMonth,
      monthlyOverview,

      // FIRE
      fireStart,
      fireEnd,
      fireProgressDelta,

      // Summary
      totalIncome: Math.round(totalIncome),
      totalExpenses: Math.round(totalExpenses),
      totalSaved,
      savingsRate,
      actionsCompleted: actions.length,

      generatedAt: new Date().toISOString(),
    }

    return Response.json(reviewData)
  } catch (error) {
    console.error('Year-in-review error:', error)
    return Response.json(
      { error: 'Jaaroverzicht genereren mislukt. Probeer het later opnieuw.' },
      { status: 500 }
    )
  }
}

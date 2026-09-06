import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { localMonthStart } from '@/lib/month-range'
import { recurringPerMonth } from '@/lib/cashflow-forecast-math'

/**
 * GET /api/cashflow-forecast
 *
 * Predicts the next 6 months of bank balance trajectory based on:
 * 1. Current total bank balance (sum of all active accounts)
 * 2. Recurring transactions (income + expenses)
 * 3. Budget limits (monthly expected spending)
 * 4. Recent transaction patterns (average monthly income/expenses from last 3 months)
 *
 * Returns an array of monthly data points + alerts for low balance.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)
    if (!claims) {
      return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const now = new Date()
    const threeMonthsAgoStr = localMonthStart(new Date(now.getFullYear(), now.getMonth() - 3, 1))
    const currentMonthStart = localMonthStart(now)

    // Fetch all needed data in parallel
    const [accountsResult, recurringsResult, recentTxResult, budgetsResult] = await Promise.all([
      // All active bank accounts with balances
      supabase
        .from('bank_accounts')
        .select('id, balance')
        .eq('is_active', true),

      // All active recurring transactions
      supabase
        .from('recurring_transactions')
        .select('*')
        .eq('is_active', true),

      // Last 3 months of transactions (for pattern detection)
      supabase
        .from('transactions')
        .select('amount, date, is_income, budget_id')
        .gte('date', threeMonthsAgoStr)
        .lt('date', currentMonthStart)
        .order('date', { ascending: true }),

      // Budget limits for expense categories
      supabase
        .from('budgets')
        .select('id, parent_id, default_limit, budget_type, interval')
        .eq('budget_type', 'expense'),
    ])

    // Calculate current total balance
    const accounts = accountsResult.data ?? []
    const currentBalance = accounts.reduce((sum, a) => sum + Number(a.balance ?? 0), 0)

    // Calculate average monthly income and expenses from last 3 months
    const recentTx = recentTxResult.data ?? []
    let totalIncome3m = 0
    let totalExpenses3m = 0
    const monthsWithData = new Set<string>()

    for (const tx of recentTx) {
      const amt = Number(tx.amount)
      const monthKey = tx.date.substring(0, 7) // YYYY-MM
      monthsWithData.add(monthKey)
      if (amt > 0) totalIncome3m += amt
      else totalExpenses3m += Math.abs(amt)
    }

    const dataMonths = Math.max(1, monthsWithData.size)
    const avgMonthlyIncome = totalIncome3m / dataMonths
    const avgMonthlyExpenses = totalExpenses3m / dataMonths

    // Calculate recurring transaction monthly impact
    const recurrings = recurringsResult.data ?? []
    let recurringMonthlyIncome = 0
    let recurringMonthlyExpenses = 0

    for (const r of recurrings) {
      // Eén eigenaar van de frequentie→maand-omrekening: `recurringPerMonth`
      // (lib/cashflow-forecast-math.ts), dezelfde die de forecast-tabel en de
      // cashflow-landingskaarten via `buildForecast` gebruiken. Deze route had
      // die switch lokaal herhaald — vandaag tekenmatig identiek, maar twee
      // onafhankelijke kopieën van één formule zijn per definitie toekomstige
      // drift: de prognose op /overzicht/budget en die in deze route zouden
      // dan uiteenlopen zonder dat er ergens iets rood wordt
      // ("consume, don't recompute", CLAUDE.md).
      //
      // De TEKEN-splitsing blijft hier bewust staan: `recurringPerMonth` levert
      // een signed bedrag, en deze route heeft de twee kanten los nodig voor de
      // 70/30-menging met de gerealiseerde maandpatronen hieronder.
      const monthlyAmount = recurringPerMonth(r)
      if (monthlyAmount > 0) recurringMonthlyIncome += monthlyAmount
      else recurringMonthlyExpenses += Math.abs(monthlyAmount)
    }

    // Compute budget-based monthly expense estimate
    const budgets = budgetsResult.data ?? []
    const parentBudgets = budgets.filter(b => !b.parent_id)
    const childBudgets = budgets.filter(b => b.parent_id)
    let budgetMonthlyExpenses = 0

    for (const parent of parentBudgets) {
      const children = childBudgets.filter(c => c.parent_id === parent.id)
      const limit = children.length > 0
        ? children.reduce((sum, c) => sum + Number(c.default_limit ?? 0), 0)
        : Number(parent.default_limit ?? 0)

      if (parent.interval === 'monthly') budgetMonthlyExpenses += limit
      else if (parent.interval === 'quarterly') budgetMonthlyExpenses += limit / 3
      else if (parent.interval === 'yearly') budgetMonthlyExpenses += limit / 12
      else budgetMonthlyExpenses += limit // default to monthly
    }

    // Use the best estimate: weighted combination of recurring + patterns + budgets
    // Priority: recurring transactions are most reliable, then recent patterns, then budgets as fallback
    let estimatedMonthlyIncome: number
    let estimatedMonthlyExpenses: number

    if (recurrings.length > 0 && recentTx.length > 0) {
      // Blend recurring with actuals (70% recurring, 30% actual patterns)
      estimatedMonthlyIncome = recurringMonthlyIncome * 0.7 + avgMonthlyIncome * 0.3
      estimatedMonthlyExpenses = recurringMonthlyExpenses * 0.7 + avgMonthlyExpenses * 0.3
    } else if (recurrings.length > 0) {
      estimatedMonthlyIncome = recurringMonthlyIncome
      estimatedMonthlyExpenses = recurringMonthlyExpenses
    } else if (recentTx.length > 0) {
      estimatedMonthlyIncome = avgMonthlyIncome
      estimatedMonthlyExpenses = avgMonthlyExpenses
    } else if (budgetMonthlyExpenses > 0) {
      estimatedMonthlyIncome = 0
      estimatedMonthlyExpenses = budgetMonthlyExpenses
    } else {
      // No data at all
      return NextResponse.json({
        forecast: [],
        alerts: [],
        currentBalance,
        estimatedMonthlyIncome: 0,
        estimatedMonthlyExpenses: 0,
        hasData: false,
      })
    }

    // Build 6-month forecast from current month
    const monthlyNet = estimatedMonthlyIncome - estimatedMonthlyExpenses
    const forecast: {
      month: string
      label: string
      projectedBalance: number
      income: number
      expenses: number
      isCurrentMonth: boolean
    }[] = []

    // Add current month as starting point (partial month estimation)
    const dayOfMonth = now.getDate()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const remainingDaysFraction = (daysInMonth - dayOfMonth) / daysInMonth
    const currentMonthRemainingNet = monthlyNet * remainingDaysFraction

    const currentMonthLabel = now.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
    forecast.push({
      month: currentMonthStart,
      label: currentMonthLabel,
      projectedBalance: currentBalance,
      income: estimatedMonthlyIncome * (1 - remainingDaysFraction), // already received
      expenses: estimatedMonthlyExpenses * (1 - remainingDaysFraction),
      isCurrentMonth: true,
    })

    // Project forward 6 months
    let runningBalance = currentBalance + currentMonthRemainingNet
    for (let i = 1; i <= 6; i++) {
      const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const monthLabel = futureDate.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
      const monthKey = futureDate.toISOString().split('T')[0]

      forecast.push({
        month: monthKey,
        label: monthLabel,
        projectedBalance: Math.round(runningBalance * 100) / 100,
        income: Math.round(estimatedMonthlyIncome * 100) / 100,
        expenses: Math.round(estimatedMonthlyExpenses * 100) / 100,
        isCurrentMonth: false,
      })

      runningBalance += monthlyNet
    }

    // Detect alerts: balance drops below thresholds
    const alerts: { month: string; label: string; projectedBalance: number; message: string }[] = []
    const thresholds = [500, 0] // Alert at €500 and €0

    for (const threshold of thresholds) {
      for (const point of forecast) {
        if (point.isCurrentMonth) continue
        if (point.projectedBalance < threshold) {
          const monthName = new Date(point.month).toLocaleDateString('nl-NL', { month: 'long' })
          alerts.push({
            month: point.month,
            label: point.label,
            projectedBalance: point.projectedBalance,
            message: threshold === 0
              ? `Let op: in ${monthName} wordt je saldo negatief (${formatEur(point.projectedBalance)})`
              : `Let op: in ${monthName} zakt je saldo onder €${threshold} (${formatEur(point.projectedBalance)})`,
          })
          break // Only report first month that crosses this threshold
        }
      }
    }

    return NextResponse.json({
      forecast,
      alerts,
      currentBalance,
      estimatedMonthlyIncome: Math.round(estimatedMonthlyIncome * 100) / 100,
      estimatedMonthlyExpenses: Math.round(estimatedMonthlyExpenses * 100) / 100,
      hasData: true,
    })

  } catch (err) {
    console.error('Cash flow forecast error:', err)
    return NextResponse.json({ error: 'Kon prognose niet berekenen' }, { status: 500 })
  }
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount)
}

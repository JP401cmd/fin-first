import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import {
  computeYearlyMustExpenses,
  computeRetirementExpenses,
  type RetirementExpenseMethod,
} from '@/lib/budget-utils'

/**
 * Context-loader voor de uitgaven-na-pensioen pane.
 * Geeft alle data terug die UitgavenNaPensioenClient nodig heeft als props.
 */
export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const now = new Date()
  const twelveMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1))
    .toISOString()
    .split('T')[0]
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1))
    .toISOString()
    .split('T')[0]

  const [profileResult, budgetsResult, incomeResult] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'retirement_expense_method, retirement_expense_custom_amount, net_monthly_income, estimated_monthly_expenses, budgeting_active, feature_preferences',
      )
      .eq('id', claims.sub)
      .single(),
    supabase
      .from('budgets')
      .select('id, name, default_limit, interval, budget_type, is_essential, parent_id'),
    supabase
      .from('transactions')
      .select('amount, date')
      .gt('amount', 0)
      .gte('date', twelveMonthsAgo)
      .lt('date', monthEnd),
  ])

  const profile = profileResult.data ?? {
    retirement_expense_method: 'essential_budgets',
    retirement_expense_custom_amount: null,
    net_monthly_income: 0,
    estimated_monthly_expenses: 0,
    budgeting_active: true,
    feature_preferences: null as Record<string, unknown> | null,
  }

  const allBudgets = (budgetsResult.data ?? []) as {
    id: string
    name: string
    default_limit: number
    interval: string
    budget_type: string
    is_essential: boolean
    parent_id: string | null
  }[]

  const essentialParents = allBudgets.filter(
    b => b.is_essential && b.budget_type === 'expense' && b.parent_id === null,
  )
  const allChildren = allBudgets.filter(c => c.parent_id !== null)

  const { yearlyMustExpenses } = computeYearlyMustExpenses(
    essentialParents,
    allChildren.filter(c => !['archive', 'income', 'savings'].includes(c.budget_type)),
  )

  const txs = incomeResult.data ?? []
  const incomeSum = txs.reduce((s, t) => s + Number(t.amount), 0)
  const monthsCovered = (() => {
    if (!txs.length) return 0
    const dates = txs.map(t => new Date(t.date as string)).sort((a, b) => a.getTime() - b.getTime())
    const earliest = dates[0]
    return Math.max(
      1,
      Math.min(
        12,
        (now.getFullYear() - earliest.getFullYear()) * 12 + (now.getMonth() - earliest.getMonth()),
      ),
    )
  })()
  const yearlyIncomeFromTx = monthsCovered > 0 ? (incomeSum / monthsCovered) * 12 : 0
  const profileMonthlyIncome = Number(profile.net_monthly_income ?? 0)
  const yearlyIncome = yearlyIncomeFromTx > 0 ? yearlyIncomeFromTx : profileMonthlyIncome * 12

  const profileMonthlyExpenses = Number(profile.estimated_monthly_expenses ?? 0)
  const estimatedYearlyExpenses = profileMonthlyExpenses * 12

  const initialMethod = (profile.retirement_expense_method ?? 'essential_budgets') as RetirementExpenseMethod
  const customAmount = profile.retirement_expense_custom_amount

  const currentRetirementExpense = computeRetirementExpenses(
    initialMethod,
    yearlyMustExpenses,
    yearlyIncome,
    customAmount,
    estimatedYearlyExpenses,
  )

  const featurePrefs = (profile.feature_preferences ?? {}) as Record<string, unknown>
  const savedAspirations = featurePrefs.retirement_aspirations ?? null
  const budgetingActive = profile.budgeting_active !== false

  return NextResponse.json({
    initialMethod,
    customAmount,
    yearlyMustExpenses,
    yearlyIncome,
    estimatedYearlyExpenses,
    currentRetirementExpense,
    budgetingActive,
    savedAspirations,
  })
}

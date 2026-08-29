import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { getEarliestIncomeDate } from '@/lib/server-data/base'
import {
  computeYearlyMustExpenses,
  type RetirementExpenseMethod,
} from '@/lib/budget-utils'
import { deriveRetirementExpenseBasis, extrapolateAnnualIncome } from '@/lib/retirement-expense-basis'
import { resolveAmountWithBasis } from '@/lib/effective-financials'
import { loadBudgetBasis, BUDGET_BASIS_COLUMNS } from '@/lib/household/budget-share'
import type { BudgetBasisRow } from '@/lib/budget-basis'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * Context-loader voor de uitgaven-na-pensioen pane.
 * Geeft alle data terug die UitgavenNaPensioenClient nodig heeft als props.
 */
export async function GET() {
  try {
    return await handleGet()
  } catch (err) {
    return serverError(err, 'uitgaven-na-pensioen:GET')
  }
}

async function handleGet() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const now = new Date()
  const twelveMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1))
    .toISOString()
    .split('T')[0]
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1))
    .toISOString()
    .split('T')[0]

  const [profileResult, budgetsResult, incomeResult, earliestIncomeResult] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        // `cashflow_basis_prefs` hoort erbij: `loadBudgetBasis` leest de
        // uitgesloten posten eruit — zonder de kolom telt élke uitgesloten
        // inkomstenpost hier wél mee en drift de sheet van de KPI (review 🔴).
        'retirement_expense_method, retirement_expense_custom_amount, net_monthly_income, estimated_monthly_expenses, budgeting_active, feature_preferences, income_source, cashflow_basis_prefs',
      )
      .eq('id', claims.sub)
      .single(),
    supabase
      .from('budgets')
      // De canonieke grondslag-kolomlijst (o.a. `created_at` als
      // extrapolatie-deler) + `is_essential` voor computeYearlyMustExpenses.
      // Een eigen, smallere lijst liet de budget-grondslag stil driften van de
      // SSR-loader (review 🔴) — daarom de gedeelde constante.
      .select(`${BUDGET_BASIS_COLUMNS}, is_essential`),
    supabase
      .from('transactions')
      .select('amount, date')
      .gt('amount', 0)
      .gte('date', twelveMonthsAgo)
      .lt('date', monthEnd),
    // Vroegste inkomstendatum ALL-TIME — canonieke gedeelde fetcher, hetzelfde
    // deler-anker als de SSR-loader. Een 12-maands-venster gaf een te recente
    // datum → afwijkend jaarbedrag t.o.v. de KPI (WF-TOEK-02-bug2).
    getEarliestIncomeDate(supabase),
  ])

  const profile = profileResult.data ?? {
    retirement_expense_method: 'essential_budgets',
    retirement_expense_custom_amount: null,
    net_monthly_income: 0,
    estimated_monthly_expenses: 0,
    budgeting_active: true,
    feature_preferences: null as Record<string, unknown> | null,
    income_source: null as string | null,
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
  const last12Income = txs.reduce((s, t) => s + Number(t.amount), 0)
  const earliestIncomeDate =
    (earliestIncomeResult.data as { date?: string | null } | null)?.date ?? null

  const profileMonthlyExpenses = Number(profile.estimated_monthly_expenses ?? 0)
  const estimatedYearlyExpenses = profileMonthlyExpenses * 12

  const initialMethod = (profile.retirement_expense_method ?? 'essential_budgets') as RetirementExpenseMethod
  const customAmount = profile.retirement_expense_custom_amount

  // Extrapolatie (inkomen → jaarbasis) + pensioenuitgave-methode: ÉÉN gedeelde
  // bron (lib/retirement-expense-basis.ts), identiek aan de SSR-loader en de
  // horizon-client load()-refresh. Géén eigen net_monthly_income*12-fallback
  // meer: die week af van de canonieke extrapolatie en zou de sheet weer laten
  // divergeren van de KPI voor gebruikers zonder inkomenstransacties.
  //
  // Grondslag (ADR 0103, melding 29-08-2026): net als de SSR-loader geeft deze
  // route het EFFECTIEVE jaarinkomen op de gekozen grondslag door — anders
  // toont de sheet bij methode current_income de rauwe transactie-extrapolatie
  // terwijl de "Na pensioen"-KPI op /toekomst de gekozen (bv. handmatige)
  // grondslag volgt. Zusterbug van WF-TOEK-02-bug2: toen het deler-anker, nu
  // de grondslag.
  const { income: budgetIncome } = await loadBudgetBasis(
    supabase,
    profile as Record<string, unknown>,
    allBudgets as unknown as BudgetBasisRow[],
  )
  const txAnnualIncome = extrapolateAnnualIncome(last12Income, earliestIncomeDate, now)
  const effectiveAnnualIncome = resolveAmountWithBasis(
    (profile as { income_source?: string | null }).income_source,
    Number(profile.net_monthly_income ?? 0) * 12,
    txAnnualIncome,
    budgetIncome.annualTotal,
  )
  const { extrapolatedIncome, yearlyRetirementExpenses } = deriveRetirementExpenseBasis({
    method: initialMethod,
    yearlyMustExpenses,
    last12Income,
    earliestIncomeDate,
    customAmount,
    estimatedYearlyExpenses,
    now,
    effectiveAnnualIncome: effectiveAnnualIncome.amount,
  })
  const yearlyIncome = extrapolatedIncome
  const currentRetirementExpense = yearlyRetirementExpenses

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

import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCoreData } from '@/lib/core-data-loader'
import type { FinancialInput } from '@/lib/core-metrics'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'

export interface CashflowSettingsData {
  estimatedAnnualIncome: number
  netMonthlyIncome: number
  savingsRate6m: number
  targetSavingsRate: number | null
  estimatedMonthlyExpenses: number
  retirementExpenseMethod: RetirementExpenseMethod
  retirementCustomAmount: number
  budgetingActive: boolean
  fireInput: FinancialInput
  grossReturn: number
  effectiveSwr: number
  inflationRate: number
  fireStrategy: { strategy: 'perpetual' | 'legacy' | 'deplete' | 'pensioen'; endAge: number }
  /** Whether income comes from DB field ('manual') or transaction-computed average ('auto'). */
  incomeSource: 'auto' | 'manual'
  /** Whether expenses come from DB field ('manual') or transaction-computed average ('auto'). */
  expensesSource: 'auto' | 'manual'
  /** Transaction-computed monthly expenses (distinct from estimatedMonthlyExpenses = stored profile value). */
  computedMonthlyExpenses: number
}

/**
 * Assembles a serializable props-bundle for the cashflow-instellingen-blok.
 * Reuses the request-level cached `loadCoreData` call — within a single
 * server render this is a no-op if the loader has already run.
 */
export async function loadCashflowSettingsData(
  supabase: SupabaseClient,
): Promise<CashflowSettingsData | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // loadCoreData is wrapped with React cache() — no duplicate DB round-trips
  // when called multiple times within the same server request.
  const core = await loadCoreData(supabase)

  // Re-read only the profile columns that core-data-loader does NOT expose as
  // individual fields (target_savings_rate, net_monthly_income,
  // estimated_monthly_expenses). The retirement columns are already available
  // via core.retirementMethodUsed, but we read the raw numbers here too.
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'date_of_birth, target_savings_rate, net_monthly_income, estimated_monthly_expenses, retirement_expense_method, retirement_expense_custom_amount, income_source, expenses_source',
    )
    .eq('id', user.id)
    .maybeSingle()

  const rf = core.rawFinancials

  // Build the FinancialInput bundle that recomputeFireFromSettings expects.
  // monthlyContributions: sum of monthly_contribution fields on fullAssets —
  // cast to unknown first because the Asset type doesn't declare that column,
  // but the DB row may carry it via the wildcard select in the loader.
  const fireInput: FinancialInput = {
    totalAssets: rf.totalAssets,
    totalDebts: rf.totalDebts,
    monthlyIncome: rf.monthlyIncome,
    monthlyExpenses: rf.monthlyExpenses,
    yearlyMustExpenses: rf.yearlyRetirementExpenses ?? rf.yearlyMustExpenses,
    monthlyContributions: core.fullAssets.reduce(
      (s, a) =>
        s + Number((a as unknown as { monthly_contribution?: number }).monthly_contribution ?? 0),
      0,
    ),
    dateOfBirth: profile?.date_of_birth ?? null,
    last12MonthsIncome: rf.extrapolatedIncome,
  }

  return {
    estimatedAnnualIncome: rf.extrapolatedIncome,
    netMonthlyIncome: Number(profile?.net_monthly_income ?? 0),
    savingsRate6m: core.savingsRate6m,
    targetSavingsRate: profile?.target_savings_rate ?? null,
    estimatedMonthlyExpenses: Number(profile?.estimated_monthly_expenses ?? 0),
    retirementExpenseMethod:
      (profile?.retirement_expense_method as RetirementExpenseMethod) ??
      core.retirementMethodUsed,
    retirementCustomAmount: Number(profile?.retirement_expense_custom_amount ?? 0),
    budgetingActive: core.budgetingActive,
    fireInput,
    grossReturn: core.fireParams.grossReturn,
    effectiveSwr: core.fireParams.effectiveSwr,
    inflationRate: core.fireParams.inflationRate,
    fireStrategy: {
      strategy: core.fireStrategy.strategy,
      endAge: core.fireStrategy.endAge,
    },
    incomeSource: (profile?.income_source as 'auto' | 'manual') ?? 'auto',
    expensesSource: (profile?.expenses_source as 'auto' | 'manual') ?? 'auto',
    // Transactie-berekend (6-mnd gemiddelde), bewust NIET rf.monthlyExpenses —
    // dat is de effectieve (post-resolver) waarde die bij een handmatige
    // override gelijk is aan het ingevoerde bedrag. extHalfYearExpenses komt
    // puur uit transacties, dus de kassabon toont "berekend" los van "handmatig".
    computedMonthlyExpenses: Math.round(core.savingsReceiptData.extHalfYearExpenses / 6),
  }
}

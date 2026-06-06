export interface IncomeExpenseSources {
  net_monthly_income?: number | null
  estimated_monthly_expenses?: number | null
  income_source?: string | null
  expenses_source?: string | null
}

/**
 * Bepaalt het effectieve maandinkomen en de maanduitgaven. Een expliciete
 * handmatige bron ('manual') wint altijd over de berekende transactie-waarde;
 * bij 'auto' winnen transacties wanneer aanwezig, anders de profiel-schatting.
 */
export function resolveEffectiveIncomeExpenses(
  profile: IncomeExpenseSources,
  txIncome: number,
  txExpenses: number,
): { income: number; expenses: number } {
  const manualIncome = Number(profile.net_monthly_income ?? 0)
  const manualExpenses = Number(profile.estimated_monthly_expenses ?? 0)
  const income = profile.income_source === 'manual' ? manualIncome : (txIncome > 0 ? txIncome : manualIncome)
  const expenses = profile.expenses_source === 'manual' ? manualExpenses : (txExpenses > 0 ? txExpenses : manualExpenses)
  return { income, expenses }
}

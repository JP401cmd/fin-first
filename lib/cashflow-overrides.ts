export type LastEdited = 'expenses' | 'savingsRate'

export interface Triple {
  monthlyIncome: number
  monthlyExpenses: number
  savingsRate: number // procent
}

/**
 * Optie C: inkomen is anker; uitgaven ⇄ spaarquote zijn duaal gegeven inkomen.
 * `current` bevat de zojuist-bewerkte waarde in `edited`; deze functie herberekent
 * de afhankelijke. Bij bewerken van inkomen blijft de laatst-bewerkte van
 * {uitgaven, spaarquote} leidend en herberekent de ander.
 */
export function recomputeTriple(
  current: Triple,
  edited: 'income' | 'expenses' | 'savingsRate',
  lastEdited: LastEdited,
): { next: Triple; lastEdited: LastEdited } {
  const I = current.monthlyIncome
  const rateFromExpenses = () => (I > 0 ? ((I - current.monthlyExpenses) / I) * 100 : 0)
  const expensesFromRate = () => I * (1 - current.savingsRate / 100)

  if (edited === 'expenses') {
    return { next: { ...current, savingsRate: rateFromExpenses() }, lastEdited: 'expenses' }
  }
  if (edited === 'savingsRate') {
    return { next: { ...current, monthlyExpenses: expensesFromRate() }, lastEdited: 'savingsRate' }
  }
  // edited === 'income'
  if (lastEdited === 'savingsRate') {
    return { next: { ...current, monthlyExpenses: expensesFromRate() }, lastEdited }
  }
  return { next: { ...current, savingsRate: rateFromExpenses() }, lastEdited }
}

import {
  computeSovereigntyLevel,
  levelToPhaseId,
  DEFAULT_MATRIX,
  FEATURES,
  type FeaturePhaseMatrix,
} from '@/lib/feature-phases'

export type FinancialInput = {
  assets: { current_value: number | string }[]
  debts: { current_balance: number | string; debt_type: string }[]
  transactions: { amount: number | string; is_income: boolean }[]
  matrixJson: string | null
}

export type FeatureAccessData = {
  features: Record<string, boolean>
  phase: string
  level: number
  netWorth: number
  monthlyExpenses: number
  freedomPct: number
}

export function computeFeatureAccess(input: FinancialInput): FeatureAccessData {
  const totalAssets = input.assets.reduce((s, a) => s + Number(a.current_value), 0)
  const debts = input.debts
  const totalDebts = debts.reduce((s, d) => s + Number(d.current_balance), 0)
  const netWorth = totalAssets - totalDebts

  const expenses = input.transactions
    .filter(t => !t.is_income)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const monthlyExpenses = expenses / 3

  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / 0.04 : 0
  const freedomPct = fireTarget > 0 ? (netWorth / fireTarget) * 100 : 0

  const consumerDebtTypes = ['personal_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'car_loan']
  const hasConsumerDebt = debts.some(d => consumerDebtTypes.includes(d.debt_type) && Number(d.current_balance) > 0)

  const level = computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPct, hasConsumerDebt)
  const phase = levelToPhaseId(level)

  // Parse matrix (fallback to DEFAULT_MATRIX)
  let matrix: FeaturePhaseMatrix = DEFAULT_MATRIX
  if (input.matrixJson) {
    try {
      const parsed = JSON.parse(input.matrixJson)
      if (parsed && typeof parsed === 'object') matrix = { ...DEFAULT_MATRIX, ...parsed }
    } catch {
      // keep default
    }
  }

  // Build feature access map
  const features: Record<string, boolean> = {}
  for (const feat of FEATURES) {
    features[feat.id] = matrix[feat.id]?.[phase] ?? false
  }

  return { features, phase, level, netWorth, monthlyExpenses, freedomPct }
}

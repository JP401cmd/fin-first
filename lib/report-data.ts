/**
 * Report data types for the Rapportages feature.
 * Used by both /api/report and the report viewer page.
 */

export interface ReportConfig {
  id: string
  user_id: string
  name: string
  period_type: 'month' | 'quarter' | 'year' | 'custom'
  date_from: string
  date_to: string
  is_scheduled: boolean
  schedule_frequency: 'monthly' | 'quarterly' | 'yearly' | null
  last_generated_at: string | null
  created_at: string
  updated_at: string
  use_ai: boolean
  cached_data: unknown | null
}

export interface HistoricalPeriodSummary {
  periodLabel: string
  dateFrom: string
  dateTo: string
  netWorthEnd: number | null
  totalIncome: number
  totalExpenses: number
  totalSaved: number
  savingsRate: number | null
  firePercentage: number | null
}

export interface ReportData {
  // ── Identity ──
  reportId: string
  reportName: string
  periodType: 'month' | 'quarter' | 'year' | 'custom'
  dateFrom: string
  dateTo: string
  displayName: string | null
  generatedAt: string
  dailyExpenseRate: number

  // ── DE KERN ──
  kern: ReportKernSection

  // ── DE WIL ──
  wil: ReportWilSection

  // ── DE HORIZON ──
  horizon: ReportHorizonSection

  // ── AI Introduction ──
  aiIntroduction: string | null

  // ── AI Pullquotes ──
  aiInsights: ReportAiInsight[]

  // ── Meta ──
  useAi: boolean
  historicalPeriods: HistoricalPeriodSummary[]
}

export interface ReportKernSection {
  netWorthStart: number | null
  netWorthEnd: number | null
  netWorthGrowth: number | null
  netWorthGrowthPct: number | null
  netWorthByPeriod: { date: string; value: number }[]
  totalAssets: number
  totalDebts: number
  savingsRate: number | null
  savingsRateByPeriod: { month: string; label: string; rate: number }[]
  totalIncome: number
  totalExpenses: number
  totalSaved: number
  fireTarget: number
  firePercentage: number | null
  budgetBreakdown: ReportBudgetItem[]
  assetBreakdown: ReportAssetItem[]
  debtBreakdown: ReportDebtItem[]
  monthlyOverview: ReportMonthRow[]
  bestMonth: ReportMonthRow | null
  worstMonth: ReportMonthRow | null
}

export interface ReportBudgetItem {
  id: string
  name: string
  icon: string
  limit: number
  spent: number
  isEssential: boolean
  pctOfLimit: number
}

export interface ReportAssetItem {
  id: string
  name: string
  assetType: string
  currentValue: number
}

export interface ReportDebtItem {
  id: string
  name: string
  debtType: string
  currentBalance: number
  interestRate: number
}

export interface ReportMonthRow {
  month: string
  label: string
  income: number
  expenses: number
  savings: number
}

export interface ReportWilSection {
  actionsCompleted: number
  freedomDaysWon: number
  freedomDaysByPeriod: { period: string; label: string; days: number }[]
  topActions: {
    id: string
    title: string
    freedomDaysImpact: number
    completedAt: string
  }[]
  spendingInsights: {
    id: string
    title: string
    description: string
    icon: string
    severity: 'info' | 'positive' | 'warning'
  }[]
  goalsProgress: {
    id: string
    name: string
    targetValue: number
    currentValue: number
    pct: number
    isCompleted: boolean
  }[]
}

export interface ReportHorizonSection {
  fireStart: { percentage: number; netWorth: number; fireTarget: number } | null
  fireEnd: { percentage: number; netWorth: number; fireTarget: number } | null
  fireProgressDelta: number | null
  projectedNetWorth1y: number | null
  projectedNetWorth3y: number | null
  projectedNetWorth5y: number | null
  fireDate: string | null
  fireAge: number | null
  monthlyPassiveIncome: number | null
  projectionPoints: { month: number; netWorth: number }[]
}

export interface ReportAiInsight {
  module: 'kern' | 'wil' | 'horizon'
  quote: string
  avatar: 'fhin' | 'finn' | 'ffin'
}

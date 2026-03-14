/**
 * Budget Report data types.
 * Used by GET /api/report/budget?month=YYYY-MM
 */

export interface BudgetReportData {
  month: string                       // 'YYYY-MM'
  monthLabel: string                  // 'Maart 2026'
  generatedAt: string
  displayName: string | null
  dailyExpenseRate: number
  daysInMonth: number
  daysPassed: number
  summary: BudgetReportSummary
  categories: BudgetReportCategory[]
  essentialTotal: BudgetReportAggregate
  discretionaryTotal: BudgetReportAggregate
  comparison: BudgetReportComparison
  trendMonths: string[]               // ['okt','nov','dec','jan','feb','mrt']
  overBudgetCategories: BudgetReportVarianceItem[]
  underBudgetCategories: BudgetReportVarianceItem[]
  rollovers: BudgetReportRolloverItem[]
  totalRolloverImpact: number
  ytd: BudgetReportYTD
}

export interface BudgetReportSummary {
  totalBudgeted: number
  totalSpent: number
  totalVariance: number               // positief = onder budget
  variancePercent: number
  totalIncomeBudgeted: number
  totalIncomeActual: number
  totalSavingsBudgeted: number
  totalSavingsActual: number
  totalDebtBudgeted: number
  totalDebtActual: number
  savingsRate: number | null
  teVerdelen: number
  dekkingsgraad: number
  freedomDaysVariance: number
  categoriesOnTrack: number
  categoriesOverBudget: number
  categoriesNearLimit: number
  projectedMonthEnd: number
}

export interface BudgetReportCategory {
  id: string
  name: string
  icon: string
  budgetType: 'expense' | 'savings' | 'debt'
  isEssential: boolean
  limit: number                       // effectief (base + rollover)
  baseLimit: number
  rolloverAmount: number
  spent: number
  variance: number
  variancePercent: number
  percentUsed: number
  freedomDaysImpact: number
  trendValues: number[]               // 6 maanden
  trendDirection: 'up' | 'down' | 'flat'
  healthScore: 'healthy' | 'warning' | 'over'
  children: BudgetReportChildCategory[]
  previousMonthSpent: number
  threeMonthAverage: number
  monthOverMonthChange: number
}

export interface BudgetReportChildCategory {
  id: string
  name: string
  icon: string
  limit: number
  spent: number
  percentUsed: number
  rolloverAmount: number
}

export interface BudgetReportAggregate {
  label: string
  budgeted: number
  spent: number
  variance: number
  freedomDaysImpact: number
  categoryCount: number
}

export interface BudgetReportComparison {
  previousMonth: { label: string; totalSpent: number; savingsRate: number | null }
  threeMonthAverage: { label: string; totalSpent: number; savingsRate: number | null }
  currentMonth: { label: string; totalSpent: number; savingsRate: number | null }
}

export interface BudgetReportVarianceItem {
  categoryName: string
  categoryIcon: string
  limit: number
  spent: number
  variance: number
  variancePercent: number
  freedomDaysImpact: number
  isEssential: boolean
}

export interface BudgetReportRolloverItem {
  budgetId: string
  budgetName: string
  carriedAmount: number
  rolloverType: string
}

export interface BudgetReportYTD {
  totalBudgeted: number
  totalSpent: number
  variance: number
  monthsCovered: number
}

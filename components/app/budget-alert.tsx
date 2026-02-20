'use client'

import { useState } from 'react'
import { AlertTriangle, TrendingDown, Info, X } from 'lucide-react'
import { formatCurrency } from '@/components/app/budget-shared'
import { shouldAlert, type BudgetType } from '@/lib/budget-alerts'
import { useDailyExpenseRate, eurToFreedomTime } from '@/components/app/freedom-time-label'

// Re-export shouldAlert and BudgetType for backwards compatibility
export { shouldAlert, type BudgetType } from '@/lib/budget-alerts'

type BudgetAlertProps = {
  budgetName: string
  budgetId: string
  spent: number
  limit: number
  threshold: number // 0-100
  budgetType?: BudgetType
  onNavigate?: (budgetId: string) => void
}

export function BudgetAlert({
  budgetName,
  budgetId,
  spent,
  limit,
  threshold,
  budgetType = 'expense',
  onNavigate,
}: BudgetAlertProps) {
  const [dismissed, setDismissed] = useState(false)
  const { dailyExpenseRate, loading: rateLoading, source } = useDailyExpenseRate()

  if (dismissed) return null

  // Income: no alerts
  if (budgetType === 'income') return null

  const pct = limit > 0 ? (spent / limit) * 100 : 0

  // Freedom-time calculation for over-budget amounts
  const overAmount = spent > limit ? spent - limit : 0
  const hasFreedomData = !rateLoading && source === 'transactions' && dailyExpenseRate > 0
  // Only show freedom time for amounts >= €100 (per spec: avoid clutter for small amounts)
  const freedomOver = hasFreedomData && overAmount >= 100
    ? eurToFreedomTime(overAmount, dailyExpenseRate)
    : null

  let level: 'warning' | 'danger' | 'critical' | 'info'
  let message: string
  let colorClasses: string
  let IconComponent: typeof AlertTriangle

  if (budgetType === 'savings') {
    // Savings: alert when UNDER target (too little saved)
    level = 'info'
    message = `Je spaart minder dan gepland — ${Math.round(pct)}% van je doel bereikt`
    colorClasses = 'border-blue-200 bg-blue-50 text-blue-800'
    IconComponent = TrendingDown
  } else if (budgetType === 'debt') {
    // Debt: alert when UNDER target (too little repaid)
    level = 'info'
    message = `Aflossing loopt achter — ${Math.round(pct)}% van je maandelijkse doel`
    colorClasses = 'border-red-200 bg-red-50 text-red-700'
    IconComponent = Info
  } else {
    // Expense: alert when OVER threshold (spending too much)
    IconComponent = AlertTriangle
    if (pct >= 120) {
      level = 'critical'
      message = `Flink over budget — ${Math.round(pct)}% besteed`
      colorClasses = 'border-red-300 bg-red-50 text-red-800'
    } else if (pct >= 100) {
      level = 'danger'
      message = `Budget overschreden — ${Math.round(pct)}% besteed`
      colorClasses = 'border-red-200 bg-red-50 text-red-700'
    } else {
      level = 'warning'
      message = `Je nadert je limiet — ${Math.round(pct)}% besteed`
      colorClasses = 'border-amber-200 bg-amber-50 text-amber-800'
    }
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 ${colorClasses} ${
        level === 'critical' ? 'animate-pulse' : ''
      }`}
      data-testid="budget-alert"
    >
      <IconComponent className={`h-4 w-4 shrink-0 ${
        budgetType === 'savings' ? 'text-blue-500' :
        level === 'warning' ? 'text-amber-500' : 'text-red-500'
      }`} />
      <div
        className="min-w-0 flex-1 cursor-pointer"
        onClick={() => onNavigate?.(budgetId)}
      >
        <p className="text-sm font-medium">{budgetName}</p>
        <p className="text-xs opacity-80">
          {message} — {formatCurrency(spent)} van {formatCurrency(limit)}
        </p>
        {freedomOver && (
          <p className="text-sm italic text-[var(--ink-3)]" data-testid="alert-freedom-time">
            {formatCurrency(overAmount)} over — {freedomOver.formattedDagen} ingeleverd
          </p>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setDismissed(true) }}
        className="shrink-0 rounded p-1 opacity-50 hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

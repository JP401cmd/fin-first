'use client'

import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { formatCurrency } from '@/components/app/budget-shared'

type BudgetAlertProps = {
  budgetName: string
  budgetId: string
  spent: number
  limit: number
  threshold: number // 0-100
  onNavigate?: (budgetId: string) => void
}

export function BudgetAlert({
  budgetName,
  budgetId,
  spent,
  limit,
  threshold,
  onNavigate,
}: BudgetAlertProps) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const pct = limit > 0 ? (spent / limit) * 100 : 0

  // Determine alert level
  let level: 'warning' | 'danger' | 'critical'
  let message: string
  let colorClasses: string

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

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 ${colorClasses} ${
        level === 'critical' ? 'animate-pulse' : ''
      }`}
    >
      <AlertTriangle className={`h-4 w-4 shrink-0 ${
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

/**
 * Check if a budget should trigger an alert.
 */
export function shouldAlert(spent: number, limit: number, threshold: number): boolean {
  if (limit <= 0 || threshold <= 0) return false
  return (spent / limit) * 100 >= threshold
}

'use client'

import { useState } from 'react'
import { getDefaultBudgets } from '@/lib/budget-data'

export function BudgetAmountEditor({
  amounts,
  onChange,
  netIncome,
}: {
  amounts: Record<string, number>
  onChange: (amounts: Record<string, number>) => void
  netIncome: number
}) {
  const budgets = getDefaultBudgets()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    // Open all groups by default
    const initial: Record<string, boolean> = {}
    for (const b of budgets) {
      initial[b.slug] = true
    }
    return initial
  })

  const toggleGroup = (slug: string) => {
    setOpenGroups((prev) => ({ ...prev, [slug]: !prev[slug] }))
  }

  const setAmount = (slug: string, value: number) => {
    onChange({ ...amounts, [slug]: Math.max(0, value) })
  }

  // Calculate totals
  let totalExpenses = 0
  let totalIncome = 0
  let totalSavings = 0

  for (const parent of budgets) {
    if (!parent.children) continue
    for (const child of parent.children) {
      const val = amounts[child.slug] ?? child.default_limit
      if (parent.budget_type === 'income') {
        totalIncome += val
      } else if (parent.budget_type === 'savings' || parent.budget_type === 'debt') {
        totalSavings += val
      } else {
        totalExpenses += val
      }
    }
  }

  const totalOut = totalExpenses + totalSavings
  const remaining = netIncome - totalOut
  const isOver = remaining < 0

  return (
    <div className="space-y-3">
      {budgets
        .filter((b) => b.budget_type !== 'income') // Don't show income budgets in editor
        .map((parent) => {
          const isOpen = openGroups[parent.slug] ?? true
          const groupTotal = (parent.children ?? []).reduce(
            (sum, c) => sum + (amounts[c.slug] ?? c.default_limit),
            0,
          )

          return (
            <div key={parent.slug} className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]">
              <button
                onClick={() => toggleGroup(parent.slug)}
                className="flex w-full min-h-[44px] items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--ink)]">{parent.name}</span>
                  <span className="rounded-full bg-[var(--subtle)] px-2 py-0.5 text-xs font-medium text-[var(--ink-3)]">
                    &euro;{groupTotal.toLocaleString('nl-NL')}
                  </span>
                </div>
                <svg
                  className={`h-4 w-4 text-[var(--ink-4)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {isOpen && parent.children && (
                <div className="border-t border-[var(--border-ed)] px-4 py-3 space-y-3">
                  {parent.children.map((child) => {
                    const val = amounts[child.slug] ?? child.default_limit
                    return (
                      <div key={child.slug} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                        <label className="min-w-0 text-xs text-[var(--ink-2)] truncate sm:flex-1" title={child.name}>
                          {child.name}
                        </label>
                        <div className="relative w-full sm:w-28 sm:shrink-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-4)]">&euro;</span>
                          <input
                            type="number"
                            min={0}
                            step={100}
                            value={val}
                            onChange={(e) => setAmount(child.slug, Number(e.target.value))}
                            className="w-full rounded-md border border-[var(--border-ed)] bg-[var(--subtle)] py-2 pr-2 pl-6 text-right text-base text-[var(--ink)] outline-none focus:border-[var(--border-md)] focus:ring-1 focus:ring-[var(--border-md)] sm:py-1.5 sm:text-xs"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

      {/* Running total — sticky on mobile */}
      <div className={`sticky bottom-0 z-10 rounded-xl border-2 p-4 shadow-lg sm:static sm:shadow-none ${isOver ? 'border-red-300 bg-red-50' : 'border-[var(--border-ed)] bg-[var(--subtle)]'}`}>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--ink-2)]">Netto inkomen</span>
          <span className="font-semibold text-[var(--ink)]">&euro;{netIncome.toLocaleString('nl-NL')}</span>
        </div>
        <div className="mt-1 flex justify-between text-sm">
          <span className="text-[var(--ink-2)]">Totale uitgaven + sparen</span>
          <span className="font-medium text-[var(--ink-2)]">&euro;{totalOut.toLocaleString('nl-NL')}</span>
        </div>
        <div className="mt-2 border-t border-[var(--border-ed)] pt-2 flex justify-between text-sm">
          <span className={`font-semibold ${isOver ? 'text-negative' : 'text-positive'}`}>
            {isOver ? 'Tekort' : 'Over'}
          </span>
          <span className={`font-bold ${isOver ? 'text-negative' : 'text-positive'}`}>
            &euro;{Math.abs(remaining).toLocaleString('nl-NL')}
          </span>
        </div>
      </div>
    </div>
  )
}

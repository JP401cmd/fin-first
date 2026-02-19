'use client'

import { useState } from 'react'
import { BudgetForm } from '@/components/app/budget-form'
import type { Budget } from '@/lib/budget-data'

/**
 * Interactive test page for Feature #135
 * Renders the BudgetForm outside of auth context for manual testing of:
 * - isDirty tracking (amber indicator)
 * - Navigation warning (clicking Back/Cancel when dirty)
 * - Draft auto-save to localStorage
 * - Draft recovery on reload
 */

const mockParentBudgets: Budget[] = [
  {
    id: 'parent-1',
    user_id: 'test',
    name: 'Vaste Lasten',
    icon: 'Home',
    description: null,
    default_limit: 0,
    budget_type: 'expense',
    interval: 'monthly',
    rollover_type: 'reset',
    limit_type: 'soft',
    alert_threshold: 80,
    max_single_transaction_amount: 0,
    is_essential: true,
    priority_score: 3,
    is_inflation_indexed: false,
    slug: null,
    ownership: 'personal',
    household_id: null,
    parent_id: null,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

const mockEditBudget: Budget = {
  id: 'test-budget-edit',
  user_id: 'test',
  name: 'Boodschappen',
  icon: 'ShoppingCart',
  description: 'Wekelijkse boodschappen',
  default_limit: 500,
  budget_type: 'expense',
  interval: 'monthly',
  rollover_type: 'reset',
  limit_type: 'soft',
  alert_threshold: 80,
  max_single_transaction_amount: 200,
  is_essential: true,
  priority_score: 4,
  is_inflation_indexed: false,
  slug: null,
  ownership: 'personal',
  household_id: null,
  parent_id: 'parent-1',
  sort_order: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

export default function InteractiveTestPage() {
  const [mode, setMode] = useState<'new' | 'edit'>('edit')

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl px-6 py-4">
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-sm font-semibold text-blue-800">Feature #135 Interactive Test</h2>
          <p className="mt-1 text-xs text-blue-700">
            Test steps: 1) Change a field → see dirty indicator appear.
            2) Click &quot;Terug naar budgetten&quot; or &quot;Annuleren&quot; → see unsaved changes warning.
            3) Click &quot;Verder bewerken&quot; → warning dismissed, form data intact.
            4) Click &quot;Wijzigingen verwijderen&quot; → would navigate away.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setMode('edit')}
              className={`rounded-md px-3 py-1 text-xs font-medium ${mode === 'edit' ? 'bg-blue-600 text-white' : 'border border-blue-300 text-blue-700'}`}
            >
              Edit Mode
            </button>
            <button
              onClick={() => setMode('new')}
              className={`rounded-md px-3 py-1 text-xs font-medium ${mode === 'new' ? 'bg-blue-600 text-white' : 'border border-blue-300 text-blue-700'}`}
            >
              New Mode
            </button>
          </div>
        </div>
      </div>

      {mode === 'edit' ? (
        <BudgetForm budget={mockEditBudget} parentBudgets={mockParentBudgets} />
      ) : (
        <BudgetForm parentBudgets={mockParentBudgets} />
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { ArrowRight, Save, X } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'
import type { BudgetWithChildren } from '@/lib/budget-data'
import type { Budget } from '@/lib/budget-data'

interface EnvelopeTransferSheetProps {
  budgets: BudgetWithChildren[]
  budgetAmounts: { id: string; budget_id: string; effective_from: string; amount: number }[]
  monthDate: Date
  onClose: () => void
  onSaved: () => void
}

export function EnvelopeTransferSheet({
  budgets,
  budgetAmounts,
  monthDate,
  onClose,
  onSaved,
}: EnvelopeTransferSheetProps) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const displayDate = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-01`

  // Flatten all non-income non-archive budgets (children preferred, parents as fallback)
  const allBudgets: Budget[] = []
  for (const parent of budgets) {
    if (parent.budget_type === 'income' || parent.budget_type === 'archive') continue
    if (parent.children.length > 0) {
      allBudgets.push(...parent.children)
    } else {
      allBudgets.push(parent)
    }
  }

  function getEffectiveLimitForBudget(budgetId: string, defaultLimit: number): number {
    const applicable = budgetAmounts
      .filter(a => a.budget_id === budgetId && a.effective_from <= displayDate)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
    return applicable.length > 0 ? Number(applicable[0].amount) : defaultLimit
  }

  const fromBudget = allBudgets.find(b => b.id === fromId)
  const toBudget = allBudgets.find(b => b.id === toId)

  const fromCurrentLimit = fromBudget ? getEffectiveLimitForBudget(fromBudget.id, Number(fromBudget.default_limit)) : 0
  const toCurrentLimit = toBudget ? getEffectiveLimitForBudget(toBudget.id, Number(toBudget.default_limit)) : 0

  const transferAmount = parseFloat(amount) || 0

  async function handleSave() {
    if (!fromId || !toId) {
      setError('Selecteer een bron- en doelbudget')
      return
    }
    if (fromId === toId) {
      setError('Bron en doel mogen niet hetzelfde zijn')
      return
    }
    if (transferAmount <= 0) {
      setError('Voer een bedrag in groter dan 0')
      return
    }
    if (transferAmount > fromCurrentLimit) {
      setError(`Bedrag (${formatCurrency(transferAmount)}) overschrijdt het limiet van ${fromCurrentLimit ? formatCurrency(fromCurrentLimit) : '€0'} voor ${fromBudget?.name}`)
      return
    }

    setSaving(true)
    setError('')

    const supabase = createClient()

    // Upsert (delete + insert pattern, same as BudgetAllocationModal)
    const newFromLimit = fromCurrentLimit - transferAmount
    const newToLimit = toCurrentLimit + transferAmount

    const updates = [
      { budgetId: fromId, newLimit: newFromLimit },
      { budgetId: toId, newLimit: newToLimit },
    ]

    for (const { budgetId, newLimit } of updates) {
      await supabase.from('budget_amounts').delete()
        .eq('budget_id', budgetId).eq('effective_from', displayDate)
      await supabase.from('budget_amounts').insert({
        budget_id: budgetId,
        effective_from: displayDate,
        amount: newLimit,
      })
    }

    setSaving(false)
    onSaved()
  }

  // Group budgets by parent name for display
  const groupedOptions = budgets
    .filter(p => p.budget_type !== 'income' && p.budget_type !== 'archive')
    .map(parent => ({
      parentName: parent.name,
      children: parent.children.length > 0 ? parent.children : [parent],
    }))

  return (
    <BottomSheet open={true} onClose={onClose} title="Verplaats budget">
      <div className="p-6 space-y-5">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* From */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Van budget</label>
          <select
            value={fromId}
            onChange={e => setFromId(e.target.value)}
            className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
          >
            <option value="">Kies een budget…</option>
            {groupedOptions.map(group => (
              <optgroup key={group.parentName} label={group.parentName}>
                {group.children.map(b => {
                  const lim = getEffectiveLimitForBudget(b.id, Number(b.default_limit))
                  return (
                    <option key={b.id} value={b.id}>
                      {b.name} — {formatCurrency(lim)}
                    </option>
                  )
                })}
              </optgroup>
            ))}
          </select>
          {fromBudget && (
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              Huidig limiet: <span className="font-mono font-medium">{formatCurrency(fromCurrentLimit)}</span>
            </p>
          )}
        </div>

        {/* Arrow */}
        <div className="flex items-center justify-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--subtle)]">
            <ArrowRight className="h-4 w-4 text-[var(--ink-3)]" />
          </div>
        </div>

        {/* To */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Naar budget</label>
          <select
            value={toId}
            onChange={e => setToId(e.target.value)}
            className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
          >
            <option value="">Kies een budget…</option>
            {groupedOptions.map(group => (
              <optgroup key={group.parentName} label={group.parentName}>
                {group.children.map(b => {
                  const lim = getEffectiveLimitForBudget(b.id, Number(b.default_limit))
                  return (
                    <option key={b.id} value={b.id} disabled={b.id === fromId}>
                      {b.name} — {formatCurrency(lim)}
                    </option>
                  )
                })}
              </optgroup>
            ))}
          </select>
          {toBudget && (
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              Huidig limiet: <span className="font-mono font-medium">{formatCurrency(toCurrentLimit)}</span>
            </p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Bedrag (€)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-3)]">€</span>
            <input
              type="number"
              min="0.01"
              step="1"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] py-2 pl-7 pr-3 text-right font-mono text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
            />
          </div>
        </div>

        {/* Preview */}
        {fromBudget && toBudget && transferAmount > 0 && (
          <div className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-3 font-mono text-sm">
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">{fromBudget.name} wordt</span>
              <span className="tabular-nums text-kern-700">{formatCurrency(fromCurrentLimit - transferAmount)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="font-sans text-sm text-[var(--ink-2)]">{toBudget.name} wordt</span>
              <span className="tabular-nums text-emerald-700">{formatCurrency(toCurrentLimit + transferAmount)}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--border-ed)] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Verplaatsen...' : 'Verplaatsen'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

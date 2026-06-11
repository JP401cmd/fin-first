'use client'

import { useState } from 'react'
import { Trash2, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { type RecurringTransaction, FREQUENCY_LABELS } from '@/lib/recurring-data'
import { type Budget } from '@/lib/budget-data'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { OwnershipToggle, useHouseholdStatus } from '@/components/app/ownership-toggle'

interface RecurringEditSheetProps {
  /** `ownership` is optioneel: niet alle call-sites typen de huishoud-kolom mee. */
  recurring: RecurringTransaction & { ownership?: 'personal' | 'shared' }
  budgets: Budget[]
  onClose: () => void
  onSaved: () => void
}

const DAY_NAMES = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag']

export function RecurringEditSheet({ recurring, budgets, onClose, onSaved }: RecurringEditSheetProps) {
  const { hasHousehold } = useHouseholdStatus()
  const [form, setForm] = useState({
    name: recurring.name,
    amount: String(Math.abs(Number(recurring.amount))),
    isIncome: Number(recurring.amount) > 0,
    frequency: recurring.frequency,
    dayOfMonth: String(recurring.day_of_month ?? 1),
    dayOfWeek: String(recurring.day_of_week ?? 1),
    endDate: recurring.end_date ?? '',
    isActive: recurring.is_active,
    budgetId: recurring.budget_id ?? '',
    ownership: recurring.ownership ?? ('personal' as 'personal' | 'shared'),
  })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim() || !form.amount) return
    setSaving(true)
    const supabase = createClient()
    const amount = parseFloat(form.amount) * (form.isIncome ? 1 : -1)
    await supabase
      .from('recurring_transactions')
      .update({
        name: form.name.trim(),
        amount,
        frequency: form.frequency,
        day_of_month: form.frequency !== 'weekly' ? parseInt(form.dayOfMonth) || 1 : null,
        day_of_week: form.frequency === 'weekly' ? parseInt(form.dayOfWeek) : null,
        end_date: form.endDate || null,
        is_active: form.isActive,
        budget_id: form.budgetId || null,
        // household_id wordt server-side afgeleid door de stamp_household_id-trigger.
        ownership: form.ownership,
      })
      .eq('id', recurring.id)
    setSaving(false)
    onSaved()
    onClose()
  }

  async function handleDeactivate() {
    const supabase = createClient()
    await supabase
      .from('recurring_transactions')
      .update({ is_active: false })
      .eq('id', recurring.id)
    onSaved()
    onClose()
  }

  const expenseBudgets = budgets.filter(
    (b) => b.budget_type !== 'income' && b.budget_type !== 'archive',
  )

  return (
    <BottomSheet open={true} onClose={onClose} title="Terugkerende boeking bewerken" size="lg">
      <div className="p-5">
        <div className="space-y-3">
          {/* Naam */}
          <div>
            <label className="mb-1 block font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
              Naam
            </label>
            <input
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-kern-400"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          {/* Bedrag + type */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="mb-1 block font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Bedrag
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 font-mono text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-kern-400"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
              />
            </div>
            <div className="w-32">
              <label className="mb-1 block font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Type
              </label>
              <select
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none"
                value={form.isIncome ? 'income' : 'expense'}
                onChange={(e) => set('isIncome', e.target.value === 'income')}
              >
                <option value="expense">Uitgave</option>
                <option value="income">Inkomsten</option>
              </select>
            </div>
          </div>

          {/* Frequentie */}
          <div>
            <label className="mb-1 block font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
              Frequentie
            </label>
            <select
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none"
              value={form.frequency}
              onChange={(e) =>
                set('frequency', e.target.value as RecurringTransaction['frequency'])
              }
            >
              {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Dag selector */}
          {form.frequency === 'weekly' ? (
            <div>
              <label className="mb-1 block font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Dag van de week
              </label>
              <select
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none"
                value={form.dayOfWeek}
                onChange={(e) => set('dayOfWeek', e.target.value)}
              >
                {DAY_NAMES.map((d, i) => (
                  <option key={i} value={String(i)}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="mb-1 block font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Dag van de maand
              </label>
              <input
                type="number"
                min="1"
                max="31"
                className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 font-mono text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-kern-400"
                value={form.dayOfMonth}
                onChange={(e) => set('dayOfMonth', e.target.value)}
              />
            </div>
          )}

          {/* Budget */}
          <div>
            <label className="mb-1 block font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
              Budget categorie
            </label>
            <select
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none"
              value={form.budgetId}
              onChange={(e) => set('budgetId', e.target.value)}
            >
              <option value="">— geen —</option>
              {expenseBudgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Einddatum */}
          <div>
            <label className="mb-1 block font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
              Einddatum (optioneel)
            </label>
            <input
              type="date"
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-kern-400"
              value={form.endDate}
              onChange={(e) => set('endDate', e.target.value)}
            />
          </div>

          {/* Actief toggle */}
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-md)] accent-kern-600"
            />
            <span className="text-sm text-[var(--ink-2)]">Actief</span>
          </label>

          {/* Eigendom — alleen relevant met een actief huishouden */}
          {hasHousehold && (
            <div data-testid="recurring-ownership-toggle">
              <label className="mb-1 block font-sans text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Eigendom
              </label>
              <OwnershipToggle
                value={form.ownership}
                onChange={(v) => set('ownership', v)}
                hasHousehold={hasHousehold}
                compact
              />
            </div>
          )}
        </div>

        {/* Acties */}
        <div className="mt-5 flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs text-red-600">Zeker deactiveren?</span>
              <button
                onClick={handleDeactivate}
                className="rounded-[var(--r)] bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                Ja, deactiveer
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)]"
              >
                Annuleren
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-xs text-[var(--ink-3)] hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Deactiveren
              </button>
              <div className="flex-1" />
              <button
                onClick={onClose}
                className="rounded-[var(--r)] border border-[var(--border-md)] px-4 py-2 text-sm text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              >
                Annuleren
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex items-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}

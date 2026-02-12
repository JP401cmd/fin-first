'use client'

import { useState } from 'react'
import { X, Save, Trash2, Repeat } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Budget } from '@/lib/budget-data'
import { FREQUENCY_LABELS } from '@/lib/recurring-data'

type Transaction = {
  id: string
  account_id: string
  budget_id: string | null
  date: string
  amount: number
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  is_income: boolean
  notes: string | null
  category_source: string
}

type BudgetGroup = {
  parent: Budget
  children: Budget[]
}

export function TransactionForm({
  transaction,
  accountId,
  budgetGroups,
  onClose,
  onSaved,
}: {
  transaction?: Transaction
  accountId: string
  budgetGroups: BudgetGroup[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!transaction
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [form, setForm] = useState({
    date: transaction?.date ?? new Date().toISOString().split('T')[0],
    amount: transaction ? String(Math.abs(transaction.amount)) : '',
    is_income: transaction?.is_income ?? false,
    description: transaction?.description ?? '',
    counterparty_name: transaction?.counterparty_name ?? '',
    budget_id: transaction?.budget_id ?? '',
    notes: transaction?.notes ?? '',
    is_recurring: false,
    frequency: 'monthly' as string,
    day_of_month: String(new Date().getDate()),
    day_of_week: '1',
    end_date: '',
  })

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.description.trim()) {
      setError('Beschrijving is verplicht')
      return
    }
    if (!form.amount || parseFloat(form.amount) === 0) {
      setError('Bedrag is verplicht')
      return
    }

    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Niet ingelogd')
      setSaving(false)
      return
    }

    const rawAmount = parseFloat(form.amount)
    const amount = form.is_income ? Math.abs(rawAmount) : -Math.abs(rawAmount)

    const row = {
      user_id: user.id,
      account_id: accountId,
      date: form.date,
      amount,
      description: form.description.trim(),
      counterparty_name: form.counterparty_name.trim() || null,
      budget_id: form.budget_id || null,
      is_income: form.is_income,
      category_source: 'manual' as const,
      notes: form.notes.trim() || null,
    }

    if (isEdit && transaction) {
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', transaction.id)

      if (updateError) {
        setError(updateError.message)
        setSaving(false)
        return
      }
    } else {
      const { error: insertError } = await supabase
        .from('transactions')
        .insert(row)

      if (insertError) {
        setError(insertError.message)
        setSaving(false)
        return
      }

      // Create recurring template if toggled
      if (form.is_recurring) {
        const recurringRow = {
          user_id: user.id,
          account_id: accountId,
          budget_id: form.budget_id || null,
          name: form.description.trim(),
          amount,
          description: form.description.trim(),
          counterparty_name: form.counterparty_name.trim() || null,
          frequency: form.frequency,
          day_of_month: (form.frequency === 'monthly' || form.frequency === 'quarterly' || form.frequency === 'yearly')
            ? parseInt(form.day_of_month) || 1
            : null,
          day_of_week: form.frequency === 'weekly' ? parseInt(form.day_of_week) : null,
          start_date: form.date,
          end_date: form.end_date || null,
          is_active: true,
        }

        await supabase.from('recurring_transactions').insert(recurringRow)
      }
    }

    onSaved()
  }

  async function handleDelete() {
    if (!transaction) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }

    setDeleting(true)
    const supabase = createClient()
    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transaction.id)

    if (deleteError) {
      setError(deleteError.message)
      setDeleting(false)
      return
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            {isEdit ? 'Transactie bewerken' : 'Nieuwe transactie'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Type toggle */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => update('is_income', false)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    !form.is_income
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                  }`}
                >
                  Uitgave
                </button>
                <button
                  type="button"
                  onClick={() => update('is_income', true)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    form.is_income
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'
                  }`}
                >
                  Inkomen
                </button>
              </div>
            </div>

            {/* Date + Amount */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="tx-date" className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Datum
                </label>
                <input
                  id="tx-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => update('date', e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="tx-amount" className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Bedrag (&euro;)
                </label>
                <input
                  id="tx-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => update('amount', e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  placeholder="0,00"
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="tx-description" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Beschrijving
              </label>
              <input
                id="tx-description"
                type="text"
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                placeholder="bijv. Albert Heijn boodschappen"
                required
              />
            </div>

            {/* Counterparty */}
            <div>
              <label htmlFor="tx-counterparty" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Tegenpartij (optioneel)
              </label>
              <input
                id="tx-counterparty"
                type="text"
                value={form.counterparty_name}
                onChange={(e) => update('counterparty_name', e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                placeholder="bijv. Albert Heijn"
              />
            </div>

            {/* Budget */}
            <div>
              <label htmlFor="tx-budget" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Budget
              </label>
              <select
                id="tx-budget"
                value={form.budget_id}
                onChange={(e) => update('budget_id', e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              >
                <option value="">Niet gecategoriseerd</option>
                {budgetGroups
                  .filter((group) => group.children.length > 0)
                  .map((group) => (
                  <optgroup key={group.parent.id} label={group.parent.name}>
                    {group.children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {child.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Recurring toggle — only for new transactions */}
            {!isEdit && (
              <div className="rounded-lg border border-zinc-200 p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_recurring}
                    onChange={(e) => update('is_recurring', e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                  />
                  <Repeat className="h-4 w-4 text-zinc-500" />
                  <span className="text-sm font-medium text-zinc-700">Terugkerende transactie</span>
                </label>

                {form.is_recurring && (
                  <div className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="tx-frequency" className="mb-1 block text-xs font-medium text-zinc-600">
                          Frequentie
                        </label>
                        <select
                          id="tx-frequency"
                          value={form.frequency}
                          onChange={(e) => update('frequency', e.target.value)}
                          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        >
                          {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                      {form.frequency === 'weekly' ? (
                        <div>
                          <label htmlFor="tx-dow" className="mb-1 block text-xs font-medium text-zinc-600">
                            Dag van de week
                          </label>
                          <select
                            id="tx-dow"
                            value={form.day_of_week}
                            onChange={(e) => update('day_of_week', e.target.value)}
                            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                          >
                            {['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'].map((d, i) => (
                              <option key={i} value={i}>{d}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label htmlFor="tx-dom" className="mb-1 block text-xs font-medium text-zinc-600">
                            Dag van de maand
                          </label>
                          <input
                            id="tx-dom"
                            type="number"
                            min="1"
                            max="31"
                            value={form.day_of_month}
                            onChange={(e) => update('day_of_month', e.target.value)}
                            className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label htmlFor="tx-enddate" className="mb-1 block text-xs font-medium text-zinc-600">
                        Einddatum (optioneel)
                      </label>
                      <input
                        id="tx-enddate"
                        type="date"
                        value={form.end_date}
                        onChange={(e) => update('end_date', e.target.value)}
                        className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label htmlFor="tx-notes" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Notities (optioneel)
              </label>
              <textarea
                id="tx-notes"
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                rows={2}
                placeholder="Optionele notities..."
              />
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-between border-t border-zinc-200 pt-4">
            <div>
              {isEdit && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    confirmDelete
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'text-red-600 hover:bg-red-50'
                  }`}
                >
                  <Trash2 className="h-4 w-4" />
                  {confirmDelete ? 'Bevestig verwijderen' : 'Verwijderen'}
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Annuleren
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

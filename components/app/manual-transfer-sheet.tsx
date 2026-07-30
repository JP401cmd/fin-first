'use client'

import { useState } from 'react'
import { ArrowLeftRight, Save } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { createClient } from '@/lib/supabase/client'

type Account = {
  id: string
  name: string
  iban: string | null
  account_type: string
  balance: number
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function ManualTransferSheet({
  accounts,
  onClose,
  onSaved,
}: {
  accounts: Account[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    from_account_id: accounts[0]?.id ?? '',
    to_account_id: accounts[1]?.id ?? '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: 'Overboeking',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const fromAccount = accounts.find(a => a.id === form.from_account_id)
  const toAccount = accounts.find(a => a.id === form.to_account_id)
  const amount = parseFloat(form.amount) || 0

  async function handleSave() {
    if (!form.from_account_id || !form.to_account_id) {
      setError('Selecteer beide rekeningen')
      return
    }
    if (form.from_account_id === form.to_account_id) {
      setError('Van- en naar-rekening mogen niet hetzelfde zijn')
      return
    }
    if (!form.amount || amount <= 0) {
      setError('Voer een geldig bedrag in')
      return
    }
    if (!form.description.trim()) {
      setError('Omschrijving is verplicht')
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

    // Eigen-rekening-post (archive → telt niet mee) waar de verschuiving op landt.
    const { data: eigenBudget } = await supabase
      .from('budgets')
      .select('id')
      .eq('slug', 'eigen-rekening-sub')
      .limit(1)
      .maybeSingle()
    const eigenBudgetId = eigenBudget?.id ?? null

    // Insert debit side (van-rekening, negatief bedrag)
    const { data: debitTx, error: debitError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        account_id: form.from_account_id,
        date: form.date,
        amount: -Math.abs(amount),
        description: form.description.trim(),
        is_income: false,
        transaction_type: 'transfer',
        category_source: 'transfer',
        budget_id: eigenBudgetId,
        is_split: false,
        // Herkomst (B5): een handmatig ingevoerde overboeking.
        source: 'handmatig',
      })
      .select('id')
      .single()

    if (debitError || !debitTx) {
      setError(debitError?.message ?? 'Opslaan mislukt')
      setSaving(false)
      return
    }

    // Insert credit side (naar-rekening, positief bedrag)
    const { data: creditTx, error: creditError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        account_id: form.to_account_id,
        date: form.date,
        amount: Math.abs(amount),
        description: form.description.trim(),
        is_income: true,
        transaction_type: 'transfer',
        category_source: 'transfer',
        budget_id: eigenBudgetId,
        is_split: false,
        linked_transfer_id: debitTx.id,
        // Herkomst (B5): een handmatig ingevoerde overboeking.
        source: 'handmatig',
      })
      .select('id')
      .single()

    if (creditError || !creditTx) {
      // Rollback debit side on failure
      await supabase.from('transactions').delete().eq('id', debitTx.id)
      setError(creditError?.message ?? 'Opslaan mislukt')
      setSaving(false)
      return
    }

    // Link the debit side back to the credit side
    await supabase
      .from('transactions')
      .update({ linked_transfer_id: creditTx.id })
      .eq('id', debitTx.id)

    setSaving(false)
    onSaved()
  }

  return (
    <BottomSheet open={true} onClose={onClose} title="Handmatige overboeking">
      <div className="p-6 space-y-5">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Van / Naar rekeningen */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)]">Van rekening</label>
            <select
              value={form.from_account_id}
              onChange={e => update('from_account_id', e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id} disabled={a.id === form.to_account_id}>
                  {a.name}
                </option>
              ))}
            </select>
            {fromAccount && (
              <p className="mt-1 font-mono text-[10px] text-[var(--ink-3)]">{formatCurrency(fromAccount.balance)}</p>
            )}
          </div>

          <div className="pb-2">
            <ArrowLeftRight className="h-4 w-4 text-[var(--ink-3)]" />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink-3)]">Naar rekening</label>
            <select
              value={form.to_account_id}
              onChange={e => update('to_account_id', e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id} disabled={a.id === form.from_account_id}>
                  {a.name}
                </option>
              ))}
            </select>
            {toAccount && (
              <p className="mt-1 font-mono text-[10px] text-[var(--ink-3)]">{formatCurrency(toAccount.balance)}</p>
            )}
          </div>
        </div>

        {/* Kassabon preview */}
        {amount > 0 && fromAccount && toAccount && fromAccount.id !== toAccount.id && (
          <div className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4 font-mono text-sm">
            <div className="mb-2 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">OVERBOEKING</p>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-sans text-[var(--ink-3)]">Van</span>
                <span className="text-[var(--ink-2)]">{fromAccount.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="font-sans text-[var(--ink-3)]">Naar</span>
                <span className="text-[var(--ink-2)]">{toAccount.name}</span>
              </div>
            </div>
            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="font-sans text-[var(--ink)]">Bedrag</span>
              <span className="tabular-nums text-[var(--ink)]">{formatCurrency(amount)}</span>
            </div>
            <p className="mt-2 text-center font-sans text-[10px] text-[var(--ink-4)]">Geen budgetimpact — verplaatsing tussen eigen rekeningen</p>
          </div>
        )}

        {/* Bedrag + Datum */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Bedrag (€)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={e => update('amount', e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm font-mono text-[var(--ink)] outline-none focus:border-kern-500"
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Datum</label>
            <input
              type="date"
              value={form.date}
              onChange={e => update('date', e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500"
            />
          </div>
        </div>

        {/* Omschrijving */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Omschrijving</label>
          <input
            type="text"
            value={form.description}
            onChange={e => update('description', e.target.value)}
            className="w-full rounded-[var(--r)] border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500"
            placeholder="bijv. Sparen naar spaarrekening"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2 border-t border-[var(--border-ed)]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2.5 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-[var(--r)] bg-kern-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Opslaan...' : 'Overboeking aanmaken'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

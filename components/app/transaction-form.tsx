'use client'

import { useState, useEffect } from 'react'
import { X, Save, Trash2, Repeat, GitFork, Plus, History, ArrowRight, FileText, BarChart3, Sparkles } from 'lucide-react'
import { CounterpartyAnalysisPanel } from '@/components/app/counterparty-analysis-panel'
import { BottomSheet } from '@/components/app/bottom-sheet'
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
  is_split?: boolean
}

type BudgetGroup = {
  parent: Budget
  children: Budget[]
}

type Phase = 'form' | 'scope' | 'saving' | 'analyse'

type PendingRow = {
  user_id: string
  account_id: string
  date: string
  amount: number
  description: string
  counterparty_name: string | null
  budget_id: string | null
  is_income: boolean
  is_split: boolean
  category_source: string
  notes: string | null
}

function formatDateNL(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}-${m}-${y}`
}

export function TransactionForm({
  transaction,
  accountId,
  budgetGroups,
  onClose,
  onSaved,
  disableAnalysis,
}: {
  transaction?: Transaction
  accountId: string
  budgetGroups: BudgetGroup[]
  onClose: () => void
  onSaved: () => void
  disableAnalysis?: boolean
}) {
  const isEdit = !!transaction
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [phase, setPhase] = useState<Phase>('form')
  const [pendingRow, setPendingRow] = useState<PendingRow | null>(null)

  type SplitRow = { id: string; budget_id: string; amount: string; description: string }
  const [isSplit, setIsSplit] = useState(!!transaction?.is_split)
  const [splitsLoading, setSplitsLoading] = useState(!!transaction?.is_split)
  const [splitRows, setSplitRows] = useState<SplitRow[]>([
    { id: crypto.randomUUID(), budget_id: '', amount: '', description: '' },
    { id: crypto.randomUUID(), budget_id: '', amount: '', description: '' },
  ])

  // Load existing splits when editing a split transaction
  useEffect(() => {
    if (!transaction?.is_split || !transaction.id) return
    const supabase = createClient()
    supabase
      .from('transaction_splits')
      .select('id, budget_id, amount, description')
      .eq('transaction_id', transaction.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data && data.length >= 2) {
          setSplitRows(
            data.map(r => ({
              id: r.id,
              budget_id: r.budget_id ?? '',
              amount: String(Math.abs(Number(r.amount))),
              description: r.description ?? '',
            }))
          )
        }
        setSplitsLoading(false)
      })
  }, [transaction?.id, transaction?.is_split])

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

  const matchName = form.counterparty_name.trim() || form.description.trim()
  const matchField = form.counterparty_name.trim() ? 'counterparty_name' : 'description'

  async function handleSaveWithScope(scope: 'single' | 'future' | 'all') {
    if (!transaction || !pendingRow) return
    setPhase('saving')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Niet ingelogd')
      setPhase('scope')
      return
    }

    // 1. Update de huidige transactie altijd
    const { error: updateError } = await supabase
      .from('transactions')
      .update({ ...pendingRow, updated_at: new Date().toISOString() })
      .eq('id', transaction.id)

    if (updateError) {
      setError(updateError.message)
      setPhase('scope')
      return
    }

    // Delete splits if user converted split back to regular
    if (transaction.is_split && !isSplit) {
      await supabase.from('transaction_splits').delete().eq('transaction_id', transaction.id)
    }

    // 2. Bulk update (als scope niet 'single')
    if (scope !== 'single' && matchName) {
      let query = supabase
        .from('transactions')
        .update({ budget_id: form.budget_id || null, category_source: 'rule' })
        .eq('user_id', user.id)
        .neq('id', transaction.id)

      if (matchField === 'counterparty_name') {
        query = query.ilike('counterparty_name', matchName)
      } else {
        query = query.ilike('description', matchName)
      }

      if (scope === 'future') {
        query = query.gte('date', transaction.date)
      }

      await query

      // 3. Upsert category_correction rule
      await supabase
        .from('category_corrections')
        .delete()
        .eq('user_id', user.id)
        .eq('match_field', matchField)
        .ilike('match_value', matchName)

      await supabase.from('category_corrections').insert({
        user_id: user.id,
        match_field: matchField,
        match_value: matchName,
        budget_id: form.budget_id || null,
      })
    }

    onSaved()
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
    if (isSplit) {
      const validRows = splitRows.filter(r => r.amount !== '' && parseFloat(r.amount) > 0)
      if (validRows.length < 2) {
        setError('Voeg minimaal 2 splits toe')
        return
      }
      const splitTotal = validRows.reduce((s, r) => s + parseFloat(r.amount), 0)
      const mainAmount = parseFloat(form.amount)
      if (Math.abs(splitTotal - mainAmount) > 0.01) {
        setError(`Splits (${splitTotal.toFixed(2)}) moeten optellen tot het totaalbedrag (${mainAmount.toFixed(2)})`)
        return
      }
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

    const validSplitRows = isSplit
      ? splitRows.filter(r => r.amount !== '' && parseFloat(r.amount) > 0)
      : []

    const row: PendingRow = {
      user_id: user.id,
      account_id: accountId,
      date: form.date,
      amount,
      description: form.description.trim(),
      counterparty_name: form.counterparty_name.trim() || null,
      // When split, don't assign a single budget (splits handle that)
      budget_id: isSplit ? null : (form.budget_id || null),
      is_income: form.is_income,
      is_split: isSplit && validSplitRows.length >= 2,
      category_source: 'manual' as const,
      notes: form.notes.trim() || null,
    }

    if (isEdit && transaction) {
      // Intercept for scope-prompt when budget changed on a non-split transaction
      const budgetChanged = !isSplit && (form.budget_id !== (transaction.budget_id ?? ''))
      if (budgetChanged) {
        setPendingRow(row)
        setPhase('scope')
        setSaving(false)
        return
      }

      const { error: updateError } = await supabase
        .from('transactions')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', transaction.id)

      if (updateError) {
        setError(updateError.message)
        setSaving(false)
        return
      }

      // Manage splits for edited transactions
      if (isSplit && validSplitRows.length >= 2) {
        // Delete all existing splits, then re-insert
        await supabase.from('transaction_splits').delete().eq('transaction_id', transaction.id)
        await supabase.from('transaction_splits').insert(
          validSplitRows.map(r => ({
            transaction_id: transaction.id,
            budget_id: r.budget_id || null,
            amount: parseFloat(r.amount),
            description: r.description.trim() || null,
          }))
        )
      } else if (!isSplit && transaction.is_split) {
        // User converted split back to regular — delete splits
        await supabase.from('transaction_splits').delete().eq('transaction_id', transaction.id)
      }
    } else {
      const { data: insertedTx, error: insertError } = await supabase
        .from('transactions')
        .insert(row)
        .select('id')
        .single()

      if (insertError || !insertedTx) {
        setError(insertError?.message ?? 'Opslaan mislukt')
        setSaving(false)
        return
      }

      // Insert split rows if applicable
      if (isSplit && validSplitRows.length >= 2) {
        await supabase.from('transaction_splits').insert(
          validSplitRows.map(r => ({
            transaction_id: insertedTx.id,
            budget_id: r.budget_id || null,
            amount: parseFloat(r.amount),
            description: r.description.trim() || null,
          }))
        )
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

  const scopeOptions = [
    {
      scope: 'all' as const,
      label: `Alle transacties van "${matchName}", ook eerder`,
      icon: History,
    },
    {
      scope: 'future' as const,
      label: `Transacties van "${matchName}" vanaf ${transaction ? formatDateNL(transaction.date) : ''}`,
      icon: ArrowRight,
    },
    {
      scope: 'single' as const,
      label: 'Alleen deze transactie',
      icon: FileText,
    },
  ]

  return (
    <BottomSheet
      open={true}
      onClose={onClose}
      title={phase === 'analyse' ? (transaction?.counterparty_name ?? 'Tegenpartij analyse') : (isEdit ? 'Transactie bewerken' : 'Nieuwe transactie')}
      size={phase === 'analyse' ? 'lg' : 'md'}
    >
      {phase === 'analyse' && transaction && (
        <CounterpartyAnalysisPanel
          counterpartyName={transaction.counterparty_name}
          counterpartyIban={transaction.counterparty_iban}
          onBack={() => setPhase('form')}
          budgetGroups={budgetGroups}
        />
      )}

      {phase === 'scope' && (
        <div className="p-6 flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setPhase('form')}
            className="self-start inline-flex items-center gap-1.5 text-sm text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
          >
            ← Terug
          </button>

          <p className="text-sm font-semibold text-[var(--ink)]">
            Budget gewijzigd — wat wil je aanpassen?
          </p>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3">
            {scopeOptions.map(({ scope, label, icon: Icon }) => (
              <button
                key={scope}
                type="button"
                onClick={() => handleSaveWithScope(scope)}
                disabled={saving || (phase as string) === 'saving'}
                className="flex items-start gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-all hover:border-kern-300 hover:shadow-[var(--s1)] disabled:opacity-50"
              >
                <Icon className="h-4 w-4 mt-0.5 shrink-0 text-kern-500" />
                <span className="text-sm text-[var(--ink-2)]">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'form' && (
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Type toggle */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">Type</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => update('is_income', false)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    !form.is_income
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
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
                      : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
                  }`}
                >
                  Inkomen
                </button>
              </div>
            </div>

            {/* Date + Amount */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="tx-date" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  Datum
                </label>
                <input
                  id="tx-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => update('date', e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="tx-amount" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  Bedrag (&euro;)
                </label>
                <input
                  id="tx-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => update('amount', e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                  placeholder="0,00"
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="tx-description" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Beschrijving
              </label>
              <input
                id="tx-description"
                type="text"
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                placeholder="bijv. Albert Heijn boodschappen"
                required
              />
            </div>

            {/* Counterparty */}
            <div>
              <label htmlFor="tx-counterparty" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Tegenpartij (optioneel)
              </label>
              <input
                id="tx-counterparty"
                type="text"
                value={form.counterparty_name}
                onChange={(e) => update('counterparty_name', e.target.value)}
                className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                placeholder="bijv. Albert Heijn"
              />
            </div>

            {/* Budget — hidden when split is active */}
            {!isSplit && (
              <div>
                <label htmlFor="tx-budget" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  Budget
                </label>
                <select
                  id="tx-budget"
                  value={form.budget_id}
                  onChange={(e) => update('budget_id', e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
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
                {isEdit && transaction && (transaction.category_source === 'ai' || transaction.category_source === 'rule') && transaction.budget_id && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-wil-700" data-testid="suggested-category-notice">
                    <Sparkles className="h-3 w-3 text-wil-500" />
                    <span>
                      {transaction.category_source === 'ai' ? 'Voorgesteld door AI' : 'Voorgesteld op basis van regel'}
                      {' — opslaan bevestigt deze categorie'}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Split toggle — available for both new and edit */}
            <div className="rounded-lg border border-[var(--border-ed)] p-3">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={isSplit}
                  onChange={e => {
                    setIsSplit(e.target.checked)
                    if (e.target.checked) update('budget_id', '')
                  }}
                  className="h-4 w-4 rounded border-[var(--border-md)] text-kern-600 focus:ring-kern-500"
                />
                <GitFork className="h-4 w-4 text-[var(--ink-3)]" />
                <span className="text-sm font-medium text-[var(--ink-2)]">Verdeel over meerdere budgetten</span>
              </label>

              {/* Warning when un-splitting an existing split transaction */}
              {isEdit && transaction?.is_split && !isSplit && (
                <p className="mt-2 text-xs text-amber-700">
                  Let op: de bestaande splits worden verwijderd als je opslaat.
                </p>
              )}

              {isSplit && (
                <div className="mt-3 space-y-2 border-t border-[var(--border-ed)] pt-3">
                  {splitsLoading ? (
                    <p className="text-xs text-[var(--ink-3)]">Splits laden...</p>
                  ) : (
                    <>
                      <p className="text-xs text-[var(--ink-3)]">
                        Totaal: <span className="font-mono font-medium">{form.amount ? `€${form.amount}` : '€0'}</span>
                        {' — '}
                        Verdeeld: <span className={`font-mono font-medium ${
                          Math.abs(splitRows.filter(r => r.amount).reduce((s, r) => s + parseFloat(r.amount || '0'), 0) - parseFloat(form.amount || '0')) > 0.01
                            ? 'text-red-600' : 'text-emerald-600'
                        }`}>
                          €{splitRows.filter(r => r.amount).reduce((s, r) => s + parseFloat(r.amount || '0'), 0).toFixed(2)}
                        </span>
                      </p>
                      {splitRows.map((row) => (
                        <div key={row.id} className="flex items-start gap-2">
                          <div className="flex-1 space-y-1.5">
                            <select
                              value={row.budget_id}
                              onChange={e => setSplitRows(prev => prev.map(r => r.id === row.id ? { ...r, budget_id: e.target.value } : r))}
                              className="w-full rounded-[var(--r-sm)] border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                            >
                              <option value="">Geen budget</option>
                              {budgetGroups.filter(g => g.children.length > 0).map(group => (
                                <optgroup key={group.parent.id} label={group.parent.name}>
                                  {group.children.map(child => (
                                    <option key={child.id} value={child.id}>{child.name}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            <div className="flex gap-2">
                              <div className="relative w-28">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--ink-3)]">€</span>
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={row.amount}
                                  onChange={e => {
                                    const val = e.target.value
                                    setSplitRows(prev => {
                                      const updated = prev.map(r => r.id === row.id ? { ...r, amount: val } : r)
                                      // Auto-fill the other row when exactly 2 split rows exist
                                      if (prev.length === 2 && val !== '') {
                                        const total = parseFloat(form.amount || '0')
                                        const entered = parseFloat(val) || 0
                                        const remainder = Math.max(0, total - entered)
                                        const otherId = prev.find(r => r.id !== row.id)?.id
                                        if (otherId) {
                                          return updated.map(r =>
                                            r.id === otherId
                                              ? { ...r, amount: remainder > 0 ? remainder.toFixed(2) : '' }
                                              : r
                                          )
                                        }
                                      }
                                      return updated
                                    })
                                  }}
                                  placeholder="0,00"
                                  className="w-full rounded-[var(--r-sm)] border border-[var(--border-md)] py-1.5 pl-5 pr-2 text-right font-mono text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                                />
                              </div>
                              <input
                                type="text"
                                value={row.description}
                                onChange={e => setSplitRows(prev => prev.map(r => r.id === row.id ? { ...r, description: e.target.value } : r))}
                                placeholder="Omschrijving (optioneel)"
                                className="flex-1 rounded-[var(--r-sm)] border border-[var(--border-md)] px-2 py-1.5 text-xs text-[var(--ink)] outline-none focus:border-kern-500"
                              />
                            </div>
                          </div>
                          {splitRows.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setSplitRows(prev => prev.filter(r => r.id !== row.id))}
                              className="mt-1 rounded p-1 text-[var(--ink-4)] hover:text-red-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSplitRows(prev => [...prev, { id: crypto.randomUUID(), budget_id: '', amount: '', description: '' }])}
                        className="inline-flex items-center gap-1 text-xs font-medium text-kern-600 hover:text-kern-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Regel toevoegen
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Recurring toggle — only for new transactions */}
            {!isEdit && (
              <div className="rounded-lg border border-[var(--border-ed)] p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_recurring}
                    onChange={(e) => update('is_recurring', e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border-md)] text-kern-600 focus:ring-kern-500"
                  />
                  <Repeat className="h-4 w-4 text-[var(--ink-3)]" />
                  <span className="text-sm font-medium text-[var(--ink-2)]">Terugkerende transactie</span>
                </label>

                {form.is_recurring && (
                  <div className="mt-3 space-y-3 border-t border-[var(--border-ed)] pt-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="tx-frequency" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                          Frequentie
                        </label>
                        <select
                          id="tx-frequency"
                          value={form.frequency}
                          onChange={(e) => update('frequency', e.target.value)}
                          className="w-full rounded-lg border border-[var(--border-md)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                        >
                          {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </div>
                      {form.frequency === 'weekly' ? (
                        <div>
                          <label htmlFor="tx-dow" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                            Dag van de week
                          </label>
                          <select
                            id="tx-dow"
                            value={form.day_of_week}
                            onChange={(e) => update('day_of_week', e.target.value)}
                            className="w-full rounded-lg border border-[var(--border-md)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                          >
                            {['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'].map((d, i) => (
                              <option key={i} value={i}>{d}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label htmlFor="tx-dom" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                            Dag van de maand
                          </label>
                          <input
                            id="tx-dom"
                            type="number"
                            min="1"
                            max="31"
                            value={form.day_of_month}
                            onChange={(e) => update('day_of_month', e.target.value)}
                            className="w-full rounded-lg border border-[var(--border-md)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <label htmlFor="tx-enddate" className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
                        Einddatum (optioneel)
                      </label>
                      <input
                        id="tx-enddate"
                        type="date"
                        value={form.end_date}
                        onChange={(e) => update('end_date', e.target.value)}
                        className="w-full rounded-lg border border-[var(--border-md)] px-2 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label htmlFor="tx-notes" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Notities (optioneel)
              </label>
              <textarea
                id="tx-notes"
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                className="w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-kern-500 focus:ring-1 focus:ring-kern-500"
                rows={2}
                placeholder="Optionele notities..."
              />
            </div>
          </div>

          {/* Analyse button */}
          {isEdit && !disableAnalysis && (transaction?.counterparty_name || transaction?.counterparty_iban) && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setPhase('analyse')}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
              >
                <BarChart3 className="h-4 w-4" />
                Analyseer tegenpartij
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex items-center justify-between border-t border-[var(--border-ed)] pt-4">
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
                className="rounded-lg border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              >
                Annuleren
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </form>
      )}
    </BottomSheet>
  )
}

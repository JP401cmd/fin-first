'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'
import {
  type Debt,
  type DebtType,
  DEBT_TYPE_LABELS,
  debtProjection,
} from '@/lib/debt-data'

/**
 * Test page for end-to-end debt CRUD workflow (Feature #81).
 * Accessible without auth at /test-debt-crud for Playwright testing.
 */
export default function TestDebtCrud() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logEntries, setLogEntries] = useState<string[]>([])
  const [testDebtId, setTestDebtId] = useState<string | null>(null)

  // Form state for creating
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [formName, setFormName] = useState('TEST_DEBT_81')
  const [formBalance, setFormBalance] = useState('5000')
  const [formOriginal, setFormOriginal] = useState('10000')
  const [formRate, setFormRate] = useState('5.5')
  const [formPayment, setFormPayment] = useState('200')
  const [formMinPayment, setFormMinPayment] = useState('100')
  const [editPayment, setEditPayment] = useState('')
  const [saving, setSaving] = useState(false)

  function addLog(msg: string) {
    const ts = new Date().toLocaleTimeString()
    setLogEntries(prev => [...prev, `[${ts}] ${msg}`])
  }

  const loadDebts = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('debts')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setDebts((data ?? []) as Debt[])
      addLog(`Loaded ${data?.length ?? 0} debts from database`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      addLog(`ERROR loading debts: ${msg}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDebts()
  }, [loadDebts])

  async function handleCreate() {
    if (!formName || !formBalance) return
    setSaving(true)
    addLog(`Creating debt: "${formName}" balance=${formBalance} rate=${formRate}% payment=${formPayment}`)

    try {
      const supabase = createClient()
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id ?? '00000000-0000-0000-0000-000000000000'

      const row = {
        user_id: userId,
        name: formName,
        debt_type: 'personal_loan' as DebtType,
        original_amount: Number(formOriginal) || 0,
        current_balance: Number(formBalance) || 0,
        interest_rate: Number(formRate) || 0,
        minimum_payment: Number(formMinPayment) || 0,
        monthly_payment: Number(formPayment) || 0,
        start_date: new Date().toISOString().split('T')[0],
        creditor: 'Test Kredietverstrekker',
        sort_order: 0,
        is_active: true,
      }

      const { data, error: insertError } = await supabase
        .from('debts')
        .insert(row)
        .select()
        .single()

      if (insertError) throw insertError

      addLog(`SUCCESS: Created debt id=${data.id}`)
      setTestDebtId(data.id)
      setShowCreateForm(false)
      await loadDebts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      addLog(`ERROR creating debt: ${msg}`)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate() {
    if (!testDebtId || !editPayment) return
    setSaving(true)
    addLog(`Updating debt ${testDebtId}: monthly_payment -> ${editPayment}`)

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('debts')
        .update({ monthly_payment: Number(editPayment) })
        .eq('id', testDebtId)

      if (updateError) throw updateError

      addLog(`SUCCESS: Updated monthly payment to ${editPayment}`)
      setShowEditForm(false)
      await loadDebts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      addLog(`ERROR updating debt: ${msg}`)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const debtId = testDebtId || debts.find(d => d.name === 'TEST_DEBT_81')?.id
    if (!debtId) return
    addLog(`Deleting debt ${debtId}`)

    try {
      const supabase = createClient()
      const { error: deleteError } = await supabase
        .from('debts')
        .delete()
        .eq('id', debtId)

      if (deleteError) throw deleteError

      addLog(`SUCCESS: Deleted debt ${debtId}`)
      setTestDebtId(null)
      await loadDebts()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      addLog(`ERROR deleting debt: ${msg}`)
      setError(msg)
    }
  }

  const testDebt = debts.find(d => d.id === testDebtId)
  const testDebtByName = debts.find(d => d.name === 'TEST_DEBT_81')
  const activeTestDebt = testDebt || testDebtByName
  const projection = activeTestDebt ? debtProjection(activeTestDebt) : null

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <p className="text-zinc-500">Loading debts...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900">Debt CRUD Test (Feature #81)</h1>
      <p className="mt-1 text-sm text-zinc-500">End-to-end debt management workflow test</p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 underline">dismiss</button>
        </div>
      )}

      {/* Step 1: Create Debt */}
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-800">Step 1: Create Debt</h2>
        {!showCreateForm ? (
          <button
            data-testid="btn-show-create"
            onClick={() => setShowCreateForm(true)}
            className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            Schuld toevoegen
          </button>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600">Naam</label>
                <input
                  data-testid="input-name"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">Huidig saldo</label>
                <input
                  data-testid="input-balance"
                  type="number"
                  value={formBalance}
                  onChange={e => setFormBalance(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600">Oorspronkelijk bedrag</label>
                <input
                  data-testid="input-original"
                  type="number"
                  value={formOriginal}
                  onChange={e => setFormOriginal(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">Rente (% p.j.)</label>
                <input
                  data-testid="input-rate"
                  type="number"
                  step="0.1"
                  value={formRate}
                  onChange={e => setFormRate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">Maandelijkse betaling</label>
                <input
                  data-testid="input-payment"
                  type="number"
                  value={formPayment}
                  onChange={e => setFormPayment(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                data-testid="btn-create"
                onClick={handleCreate}
                disabled={saving}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? 'Opslaan...' : 'Toevoegen'}
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600"
              >
                Annuleren
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Current Debts List */}
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-800">
          Debt List (<span data-testid="debt-count">{debts.length}</span> debts)
        </h2>
        <div className="mt-3 space-y-2" data-testid="debt-list">
          {debts.map(debt => {
            const isTestDebt = debt.id === testDebtId || debt.name === 'TEST_DEBT_81'
            const proj = debtProjection(debt)
            return (
              <div
                key={debt.id}
                data-testid={isTestDebt ? 'test-debt-item' : `debt-item-${debt.id}`}
                className={`rounded-lg border p-3 ${isTestDebt ? 'border-amber-300 bg-amber-50' : 'border-zinc-200 bg-zinc-50'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-900" data-testid={isTestDebt ? 'test-debt-name' : undefined}>
                      {debt.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {DEBT_TYPE_LABELS[debt.debt_type]} | Rente: {Number(debt.interest_rate)}% | Betaling: {formatCurrency(Number(debt.monthly_payment))}/mnd
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-900" data-testid={isTestDebt ? 'test-debt-balance' : undefined}>
                      {formatCurrency(Number(debt.current_balance))}
                    </p>
                    {proj.isPayable && proj.monthsToPayoff > 0 && (
                      <p className="text-xs text-amber-600" data-testid={isTestDebt ? 'test-debt-timeline' : undefined}>
                        {proj.monthsToPayoff} maanden tot aflossing
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {debts.length === 0 && (
            <p className="text-sm text-zinc-400" data-testid="no-debts">Geen schulden gevonden.</p>
          )}
        </div>
        <button
          data-testid="btn-refresh"
          onClick={() => { setLoading(true); loadDebts() }}
          className="mt-3 text-xs text-amber-600 underline"
        >
          Lijst vernieuwen
        </button>
      </section>

      {/* Step 2: Update Monthly Payment */}
      {activeTestDebt && (
        <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-zinc-800">Step 2: Update Monthly Payment</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Current payment: <span data-testid="current-payment">{formatCurrency(Number(activeTestDebt.monthly_payment))}</span>/mnd
          </p>
          {projection && projection.isPayable && (
            <p className="text-sm text-amber-600" data-testid="current-timeline">
              Payoff timeline: {projection.monthsToPayoff} maanden
            </p>
          )}
          {!showEditForm ? (
            <button
              data-testid="btn-show-edit"
              onClick={() => {
                setEditPayment('350')
                setShowEditForm(true)
                if (!testDebtId && activeTestDebt) setTestDebtId(activeTestDebt.id)
              }}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Betaling wijzigen
            </button>
          ) : (
            <div className="mt-3 flex items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600">Nieuwe maandelijkse betaling</label>
                <input
                  data-testid="input-edit-payment"
                  type="number"
                  value={editPayment}
                  onChange={e => setEditPayment(e.target.value)}
                  className="mt-1 w-40 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
              <button
                data-testid="btn-update"
                onClick={handleUpdate}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Bijwerken...' : 'Bijwerken'}
              </button>
              <button
                onClick={() => setShowEditForm(false)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600"
              >
                Annuleren
              </button>
            </div>
          )}
        </section>
      )}

      {/* Step 3: Payoff Timeline */}
      {activeTestDebt && projection && (
        <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-zinc-800">Step 3: Payoff Timeline</h2>
          <div className="mt-3 grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-xs text-zinc-500">Aflostijd</p>
              <p className="mt-1 text-lg font-bold text-amber-700" data-testid="timeline-months">
                {projection.isPayable ? `${projection.monthsToPayoff} maanden` : 'Onbetaalbaar'}
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-xs text-zinc-500">Totale rente</p>
              <p className="mt-1 text-lg font-bold text-red-600" data-testid="timeline-interest">
                {projection.isPayable ? formatCurrency(projection.totalInterest) : '-'}
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-xs text-zinc-500">Schuldenvrij op</p>
              <p className="mt-1 text-sm font-bold text-zinc-700" data-testid="timeline-date">
                {projection.isPayable && projection.payoffDate
                  ? new Date(projection.payoffDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
                  : '-'}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Step 4: Delete Debt */}
      {activeTestDebt && (
        <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-zinc-800">Step 4: Delete Debt</h2>
          <button
            data-testid="btn-delete"
            onClick={() => {
              if (!testDebtId && activeTestDebt) setTestDebtId(activeTestDebt.id)
              handleDelete()
            }}
            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Schuld verwijderen
          </button>
        </section>
      )}

      {/* Log */}
      <section className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <h2 className="text-lg font-semibold text-zinc-800">Test Log</h2>
        <div className="mt-2 max-h-60 overflow-y-auto font-mono text-xs" data-testid="test-log">
          {logEntries.map((entry, idx) => (
            <div key={idx} className={entry.includes('ERROR') ? 'text-red-600' : entry.includes('SUCCESS') ? 'text-emerald-600' : 'text-zinc-600'}>
              {entry}
            </div>
          ))}
          {logEntries.length === 0 && <p className="text-zinc-400">No log entries yet</p>}
        </div>
      </section>
    </div>
  )
}

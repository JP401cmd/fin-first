'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  Plus, Trash2, Edit3, AlertTriangle, CheckCircle2, X, RefreshCw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
import {
  type Debt,
  type DebtType,
  type RepaymentType,
  type PayoffStrategy,
  DEBT_TYPE_LABELS,
  DEBT_TYPE_ICONS,
  DEBT_SUBTYPE_LABELS,
  DEBT_SUBTYPE_DEFAULTS,
  DEBT_TYPE_FIELDS,
  REPAYMENT_TYPE_LABELS,
  getDefaultDebts,
  debtProjection,
  simulatePayoff,
  payoffSummary,
} from '@/lib/debt-data'
import { type Asset, ASSET_TYPE_LABELS } from '@/lib/asset-data'
import { FeatureGate } from '@/components/app/feature-gate'

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editDebt, setEditDebt] = useState<Debt | null>(null)
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null)
  const [modalStep, setModalStep] = useState<'detail' | 'edit' | 'revalue'>('detail')
  const [strategy, setStrategy] = useState<PayoffStrategy>('avalanche')
  const [extraMonthly, setExtraMonthly] = useState(0)
  const [valuations, setValuations] = useState<Record<string, Valuation[]>>({})
  const [userAssets, setUserAssets] = useState<Asset[]>([])
  const seedingRef = useRef(false)

  const loadDebts = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('debts')
        .select('*')
        .order('sort_order', { ascending: true })

      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        if (seedingRef.current) return
        seedingRef.current = true
        // Double-check: count to prevent race conditions
        const { count } = await supabase.from('debts').select('id', { count: 'exact', head: true })
        if (count && count > 0) { seedingRef.current = false; await loadDebts(); return }
        await seedDebts(supabase)
        return
      }

      setDebts(data as Debt[])
    } catch (err) {
      console.error('Error loading debts:', err)
      setError('Kon schulden niet laden. Probeer het opnieuw.')
    } finally {
      setLoading(false)
    }
  }, [])

  async function seedDebts(supabase: ReturnType<typeof createClient>) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const defaults = getDefaultDebts()
    const rows = defaults.map((d, i) => ({
      user_id: user.id,
      name: d.name,
      debt_type: d.debt_type,
      original_amount: d.original_amount,
      current_balance: d.current_balance,
      interest_rate: d.interest_rate,
      minimum_payment: d.minimum_payment,
      monthly_payment: d.monthly_payment,
      start_date: d.start_date,
      creditor: d.creditor,
      sort_order: i,
      subtype: d.subtype || null,
      is_tax_deductible: d.is_tax_deductible ?? null,
      fixed_rate_end_date: d.fixed_rate_end_date || null,
      nhg: d.nhg ?? null,
      credit_limit: d.credit_limit ?? null,
      repayment_type: d.repayment_type || null,
      draagkrachtmeting_date: d.draagkrachtmeting_date || null,
    }))

    await supabase.from('debts').insert(rows)
    await loadDebts()
  }

  const loadValuations = useCallback(async (debtId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('valuations')
      .select('*')
      .eq('entity_id', debtId)
      .eq('entity_type', 'debt')
      .order('valuation_date', { ascending: false })
      .limit(20)
    if (data) {
      setValuations((prev) => ({ ...prev, [debtId]: data as Valuation[] }))
    }
  }, [])

  const loadUserAssets = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('assets').select('id, name, asset_type').order('name')
    if (data) setUserAssets(data as Asset[])
  }, [])

  useEffect(() => {
    loadDebts()
    loadUserAssets()
  }, [loadDebts, loadUserAssets])

  const activeDebts = debts.filter((d) => d.is_active && Number(d.current_balance) > 0)
  const totalBalance = activeDebts.reduce((s, d) => s + Number(d.current_balance), 0)
  const totalOriginal = activeDebts.reduce((s, d) => s + Number(d.original_amount), 0)
  const totalMonthlyPayments = activeDebts.reduce((s, d) => s + Number(d.monthly_payment), 0)
  const paidOff = totalOriginal > 0 ? ((totalOriginal - totalBalance) / totalOriginal) * 100 : 0

  // Payoff simulation
  const simulation = useMemo(
    () => simulatePayoff(activeDebts, strategy, extraMonthly),
    [activeDebts, strategy, extraMonthly],
  )
  const summary = useMemo(() => payoffSummary(simulation), [simulation])

  // Compare with current strategy
  const currentSim = useMemo(
    () => simulatePayoff(activeDebts, 'current', 0),
    [activeDebts],
  )
  const currentSummary = useMemo(() => payoffSummary(currentSim), [currentSim])

  const interestSaved = currentSummary.totalInterest - summary.totalInterest
  const monthsSaved = currentSummary.totalMonths - summary.totalMonths

  async function deleteDebt(id: string) {
    const supabase = createClient()
    await supabase.from('debts').delete().eq('id', id)
    setDebts((prev) => prev.filter((d) => d.id !== id))
    setSelectedDebt(null)
  }

  function openDebtModal(debt: Debt) {
    setSelectedDebt(debt)
    setModalStep('detail')
    loadValuations(debt.id)
  }

  function closeDebtModal() {
    setSelectedDebt(null)
    setModalStep('detail')
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); loadDebts() }} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header with totals */}
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Schulden</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {activeDebts.length} actieve schuld{activeDebts.length !== 1 ? 'en' : ''}
            </p>
          </div>
          <button
            onClick={() => { setEditDebt(null); setShowForm(true) }}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            <Plus className="h-4 w-4" />
            Schuld toevoegen
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase">Totale schuld</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(totalBalance)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase">Maandelijkse aflossing</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(totalMonthlyPayments)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase">Al afgelost</p>
            <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrency(totalOriginal - totalBalance)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase">Voortgang</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{paidOff.toFixed(1)}%</p>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(paidOff, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Payoff strategy */}
      <FeatureGate featureId="schulden_aflosplan" fallback="locked">
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-zinc-700">Aflosstrategie</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {(['avalanche', 'snowball', 'current'] as PayoffStrategy[]).map((s) => (
            <button
              key={s}
              onClick={() => setStrategy(s)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                strategy === s
                  ? 'border-amber-300 bg-amber-50 text-amber-700'
                  : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
              }`}
            >
              {s === 'avalanche' ? 'Avalanche (hoogste rente eerst)' :
               s === 'snowball' ? 'Sneeuwbal (kleinste schuld eerst)' :
               'Huidig (ongewijzigd)'}
            </button>
          ))}

          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Extra p/m:</label>
            <input
              type="number"
              min={0}
              step={25}
              value={extraMonthly}
              onChange={(e) => setExtraMonthly(Math.max(0, Number(e.target.value)))}
              className="w-20 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900"
            />
          </div>
        </div>

        {/* Strategy results */}
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Schuldenvrij op</p>
            <p className="mt-1 text-sm font-bold text-zinc-900">
              {summary.payoffDate
                ? new Date(summary.payoffDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
                : 'Niet mogelijk'}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Totale rente</p>
            <p className="mt-1 text-sm font-bold text-red-600">{formatCurrency(summary.totalInterest)}</p>
          </div>
          {interestSaved > 0 && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-600">Rente bespaard</p>
              <p className="mt-1 text-sm font-bold text-emerald-700">{formatCurrency(interestSaved)}</p>
            </div>
          )}
          {monthsSaved > 0 && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-600">Maanden eerder vrij</p>
              <p className="mt-1 text-sm font-bold text-emerald-700">{monthsSaved} maanden</p>
            </div>
          )}
        </div>

        {/* Payoff chart */}
        {simulation.length > 0 && (
          <div className="mt-4">
            <PayoffChart months={simulation} debts={activeDebts} />
          </div>
        )}
      </section>
      </FeatureGate>

      {/* Debt list */}
      <section className="mt-6 space-y-2">
        {debts.map((debt) => {
          const balance = Number(debt.current_balance)
          const original = Number(debt.original_amount)
          const pct = original > 0 ? ((original - balance) / original) * 100 : 0
          const icon = DEBT_TYPE_ICONS[debt.debt_type] ?? 'CircleDot'

          return (
            <div
              key={debt.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition-colors hover:border-amber-200 hover:bg-amber-50/30"
              onClick={() => openDebtModal(debt)}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                <BudgetIcon name={icon} className="h-4 w-4 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{debt.name}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {DEBT_TYPE_LABELS[debt.debt_type]}
                      {debt.subtype && DEBT_SUBTYPE_LABELS[debt.debt_type]?.[debt.subtype]
                        ? ` \u2022 ${DEBT_SUBTYPE_LABELS[debt.debt_type]![debt.subtype]}`
                        : ''}
                      {debt.creditor ? ` \u2022 ${debt.creditor}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-zinc-900">{formatCurrency(balance)}</p>
                    <p className="text-xs text-zinc-400">van {formatCurrency(original)}</p>
                  </div>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}

        {debts.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <p className="mt-2 text-sm font-medium text-zinc-600">Geen schulden geregistreerd</p>
            <p className="mt-1 text-xs text-zinc-400">Voeg een schuld toe om je aflosplan te starten.</p>
          </div>
        )}
      </section>

      {/* Debt detail modal */}
      {selectedDebt && modalStep === 'detail' && (
        <DebtDetailModal
          debt={selectedDebt}
          valuations={valuations[selectedDebt.id]}
          userAssets={userAssets}
          onClose={closeDebtModal}
          onEdit={() => setModalStep('edit')}
          onRevalue={() => setModalStep('revalue')}
          onDelete={() => deleteDebt(selectedDebt.id)}
        />
      )}

      {/* Edit form modal */}
      {selectedDebt && modalStep === 'edit' && (
        <DebtForm
          debt={selectedDebt}
          userAssets={userAssets}
          onClose={() => setModalStep('detail')}
          onSaved={() => {
            setModalStep('detail')
            loadDebts().then(() => {
              const supabase = createClient()
              supabase.from('debts').select('*').eq('id', selectedDebt.id).single().then(({ data }) => {
                if (data) setSelectedDebt(data as Debt)
              })
            })
          }}
        />
      )}

      {/* Revaluation modal */}
      {selectedDebt && modalStep === 'revalue' && (
        <ValuationModal
          entityId={selectedDebt.id}
          entityType="debt"
          entityName={selectedDebt.name}
          currentValue={Number(selectedDebt.current_balance)}
          onClose={() => setModalStep('detail')}
          onSaved={() => {
            setModalStep('detail')
            loadDebts().then(() => {
              const supabase = createClient()
              supabase.from('debts').select('*').eq('id', selectedDebt.id).single().then(({ data }) => {
                if (data) setSelectedDebt(data as Debt)
              })
            })
            loadValuations(selectedDebt.id)
          }}
        />
      )}

      {/* New debt form */}
      {showForm && (
        <DebtForm
          debt={editDebt ?? undefined}
          userAssets={userAssets}
          onClose={() => { setShowForm(false); setEditDebt(null) }}
          onSaved={() => {
            setShowForm(false)
            setEditDebt(null)
            loadDebts()
          }}
        />
      )}
    </div>
  )
}

// ── Debt detail modal ────────────────────────────────────────

function DebtDetailModal({
  debt,
  valuations,
  userAssets,
  onClose,
  onEdit,
  onRevalue,
  onDelete,
}: {
  debt: Debt
  valuations: Valuation[] | undefined
  userAssets: Asset[]
  onClose: () => void
  onEdit: () => void
  onRevalue: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const balance = Number(debt.current_balance)
  const original = Number(debt.original_amount)
  const pct = original > 0 ? ((original - balance) / original) * 100 : 0
  const proj = debtProjection(debt)
  const icon = DEBT_TYPE_ICONS[debt.debt_type] ?? 'CircleDot'
  const linkedAsset = debt.linked_asset_id ? userAssets.find((a) => a.id === debt.linked_asset_id) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-zinc-200 px-6 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50">
            <BudgetIcon name={icon} className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-zinc-900">{debt.name}</h2>
            <p className="text-xs text-zinc-500">
              {DEBT_TYPE_LABELS[debt.debt_type]}
              {debt.subtype && DEBT_SUBTYPE_LABELS[debt.debt_type]?.[debt.subtype]
                ? ` \u2022 ${DEBT_SUBTYPE_LABELS[debt.debt_type]![debt.subtype]}`
                : ''}
              {debt.creditor ? ` \u2022 ${debt.creditor}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Balance highlight */}
        <div className="border-b border-zinc-100 px-6 py-4 text-center">
          <p className="text-3xl font-bold text-zinc-900">{formatCurrency(balance)}</p>
          <p className="mt-1 text-sm text-zinc-500">van {formatCurrency(original)} ({pct.toFixed(1)}% afgelost)</p>
          <div className="mx-auto mt-2 h-2 w-48 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          {/* Badges */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            {debt.repayment_type && (
              <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700">
                {REPAYMENT_TYPE_LABELS[debt.repayment_type]}
              </span>
            )}
            {debt.nhg && (
              <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">NHG</span>
            )}
            {debt.is_tax_deductible && (
              <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">Renteaftrek</span>
            )}
          </div>
        </div>

        {/* Details grid */}
        <div className="space-y-4 px-6 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Rente</p>
              <p className="mt-0.5 text-sm font-medium text-zinc-900">{Number(debt.interest_rate)}% p.j.</p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Maandelijkse betaling</p>
              <p className="mt-0.5 text-sm font-medium text-zinc-900">{formatCurrency(Number(debt.monthly_payment))}</p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Aflossing op</p>
              <p className="mt-0.5 text-sm font-medium text-zinc-900">
                {debt.repayment_type === 'aflossingsvrij'
                  ? 'Aflossingsvrij'
                  : proj.isPayable && proj.payoffDate
                    ? new Date(proj.payoffDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
                    : 'Onbekend'}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Resterende rente</p>
              <p className="mt-0.5 text-sm font-medium text-red-600">
                {proj.isPayable ? formatCurrency(proj.totalInterest) : 'Onbetaalbaar'}
              </p>
            </div>
          </div>

          {/* Type-specific details */}
          {(() => {
            const details: { label: string; value: string }[] = []
            if (debt.fixed_rate_end_date) details.push({ label: 'Rentevast tot', value: new Date(debt.fixed_rate_end_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) })
            if (debt.credit_limit) details.push({ label: 'Kredietlimiet', value: formatCurrency(Number(debt.credit_limit)) })
            if (linkedAsset) details.push({ label: 'Gekoppelde woning', value: linkedAsset.name })
            if (debt.draagkrachtmeting_date) details.push({ label: 'Draagkrachtmeting', value: new Date(debt.draagkrachtmeting_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) })
            if (details.length === 0) return null
            return (
              <div className="grid grid-cols-2 gap-3">
                {details.map((d) => (
                  <div key={d.label} className="rounded-lg bg-amber-50/50 p-3">
                    <p className="text-xs text-amber-700/60">{d.label}</p>
                    <p className="mt-0.5 text-sm font-medium text-zinc-900">{d.value}</p>
                  </div>
                ))}
              </div>
            )
          })()}

          {!proj.isPayable && debt.repayment_type !== 'aflossingsvrij' && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
              <p className="text-xs text-red-700">
                De maandelijkse betaling dekt de rente niet. Verhoog de betaling om deze schuld af te lossen.
              </p>
            </div>
          )}

          {debt.notes && <p className="text-xs text-zinc-500">{debt.notes}</p>}

          {/* Valuation history */}
          {valuations && valuations.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-zinc-500 uppercase">Saldohistorie</p>
              <div className="space-y-1">
                {valuations.slice(0, 5).map((v) => {
                  const prev = valuations.find((vv) => vv.valuation_date < v.valuation_date)
                  const diff = prev ? Number(v.value) - Number(prev.value) : null
                  return (
                    <div key={v.id} className="flex items-center gap-3 text-xs">
                      <span className="w-20 shrink-0 text-zinc-400">
                        {new Date(v.valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="font-medium text-zinc-700">{formatCurrency(Number(v.value))}</span>
                      {diff !== null && (
                        <span className={`text-[10px] font-medium ${diff <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-zinc-200 px-6 py-4">
          <button
            onClick={onRevalue}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-200 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Saldo bijwerken
          </button>
          <button
            onClick={onEdit}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Bewerken
          </button>
          {confirmDelete ? (
            <button
              onClick={onDelete}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
            >
              Bevestigen
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Payoff chart (SVG area chart) ────────────────────────────

function PayoffChart({ months, debts }: { months: ReturnType<typeof simulatePayoff>; debts: Debt[] }) {
  if (months.length === 0) return null

  const w = 800
  const h = 200
  const pad = { top: 10, right: 20, bottom: 30, left: 60 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const maxBalance = months[0].totalBalance
  const maxMonth = months.length

  // Sample points (max 80 to keep SVG light)
  const step = Math.max(1, Math.floor(maxMonth / 80))
  const sampled = months.filter((_, i) => i % step === 0 || i === months.length - 1)

  function x(month: number) {
    return pad.left + (month / maxMonth) * chartW
  }
  function y(val: number) {
    return pad.top + chartH - (val / maxBalance) * chartH
  }

  // Stacked areas per debt
  const debtColors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899']
  const debtIds = debts.map((d) => d.id)

  // Build paths per debt (stacked)
  const areas: { id: string; path: string; color: string }[] = []
  for (let di = 0; di < debtIds.length; di++) {
    const id = debtIds[di]
    const color = debtColors[di % debtColors.length]

    const topPoints = sampled.map((m) => {
      let stackedVal = 0
      for (let j = 0; j <= di; j++) {
        const entry = m.debts.find((d) => d.id === debtIds[j])
        stackedVal += entry?.balance ?? 0
      }
      return `${x(m.month).toFixed(1)},${y(stackedVal).toFixed(1)}`
    })

    const bottomPoints = sampled.map((m) => {
      let stackedVal = 0
      for (let j = 0; j < di; j++) {
        const entry = m.debts.find((d) => d.id === debtIds[j])
        stackedVal += entry?.balance ?? 0
      }
      return `${x(m.month).toFixed(1)},${y(stackedVal).toFixed(1)}`
    })

    const path = `M ${topPoints.join(' L ')} L ${bottomPoints.reverse().join(' L ')} Z`
    areas.push({ id, path, color })
  }

  // Y-axis labels
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxBalance * t))

  // X-axis: every 12 months
  const xTicks: number[] = []
  for (let m = 12; m < maxMonth; m += 12) xTicks.push(m)
  if (maxMonth > 6) xTicks.push(maxMonth)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {yTicks.map((val) => (
        <g key={val}>
          <line
            x1={pad.left} y1={y(val)} x2={w - pad.right} y2={y(val)}
            stroke="#e4e4e7" strokeWidth="0.5"
          />
          <text x={pad.left - 8} y={y(val) + 3} textAnchor="end" fontSize="8" fill="#a1a1aa">
            {val >= 1000 ? `${Math.round(val / 1000)}k` : val}
          </text>
        </g>
      ))}

      {/* Areas (reversed so first debt on top) */}
      {areas.reverse().map((a) => (
        <path key={a.id} d={a.path} fill={a.color} fillOpacity="0.5" />
      ))}

      {/* X-axis labels */}
      {xTicks.map((m) => (
        <text key={m} x={x(m)} y={h - 5} textAnchor="middle" fontSize="8" fill="#a1a1aa">
          {m >= 12 ? `${Math.floor(m / 12)}j` : `${m}m`}
        </text>
      ))}

      {/* Legend */}
      {debts.map((d, i) => (
        <g key={d.id} transform={`translate(${pad.left + i * 130}, ${h - 16})`}>
          <rect width="8" height="8" rx="2" fill={debtColors[i % debtColors.length]} fillOpacity="0.7" />
          <text x="12" y="7" fontSize="7" fill="#71717a">{d.name}</text>
        </g>
      ))}
    </svg>
  )
}

// ── Debt form modal ──────────────────────────────────────────

function DebtForm({
  debt,
  userAssets,
  onClose,
  onSaved,
}: {
  debt?: Debt
  userAssets: Asset[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!debt

  const [name, setName] = useState(debt?.name ?? '')
  const [debtType, setDebtType] = useState<DebtType>(debt?.debt_type ?? 'personal_loan')
  const [originalAmount, setOriginalAmount] = useState(String(debt?.original_amount ?? ''))
  const [currentBalance, setCurrentBalance] = useState(String(debt?.current_balance ?? ''))
  const [interestRate, setInterestRate] = useState(String(debt?.interest_rate ?? ''))
  const [minimumPayment, setMinimumPayment] = useState(String(debt?.minimum_payment ?? ''))
  const [monthlyPayment, setMonthlyPayment] = useState(String(debt?.monthly_payment ?? ''))
  const [startDate, setStartDate] = useState(debt?.start_date ?? new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(debt?.end_date ?? '')
  const [creditor, setCreditor] = useState(debt?.creditor ?? '')
  const [notes, setNotes] = useState(debt?.notes ?? '')
  const [saving, setSaving] = useState(false)
  // Type-specific state
  const [subtype, setSubtype] = useState(debt?.subtype ?? '')
  const [repaymentType, setRepaymentType] = useState<string>(debt?.repayment_type ?? '')
  const [isTaxDeductible, setIsTaxDeductible] = useState(debt?.is_tax_deductible ?? false)
  const [fixedRateEndDate, setFixedRateEndDate] = useState(debt?.fixed_rate_end_date ?? '')
  const [nhg, setNhg] = useState(debt?.nhg ?? false)
  const [linkedAssetId, setLinkedAssetId] = useState(debt?.linked_asset_id ?? '')
  const [creditLimit, setCreditLimit] = useState(String(debt?.credit_limit ?? ''))
  const [draagkrachtmetingDate, setDraagkrachtmetingDate] = useState(debt?.draagkrachtmeting_date ?? '')

  const subtypeOptions = DEBT_SUBTYPE_LABELS[debtType]
  const visibleFields = DEBT_TYPE_FIELDS[debtType]

  function handleTypeChange(type: DebtType) {
    setDebtType(type)
    setSubtype('')
    if (!isEdit) {
      setRepaymentType('')
      setIsTaxDeductible(false)
      setNhg(false)
    }
  }

  function handleSubtypeChange(st: string) {
    setSubtype(st)
    if (!isEdit && st) {
      const defaults = DEBT_SUBTYPE_DEFAULTS[st]
      if (defaults) {
        if (defaults.repayment_type) setRepaymentType(defaults.repayment_type)
        if (defaults.is_tax_deductible !== undefined) setIsTaxDeductible(defaults.is_tax_deductible)
      }
    }
  }

  async function handleSave() {
    if (!name || !currentBalance) return
    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const row = {
      user_id: user.id,
      name,
      debt_type: debtType,
      original_amount: Number(originalAmount) || 0,
      current_balance: Number(currentBalance) || 0,
      interest_rate: Number(interestRate) || 0,
      minimum_payment: Number(minimumPayment) || 0,
      monthly_payment: Number(monthlyPayment) || 0,
      start_date: startDate,
      end_date: endDate || null,
      creditor: creditor || null,
      notes: notes || null,
      // Type-specific fields
      subtype: subtype || null,
      repayment_type: repaymentType || null,
      is_tax_deductible: visibleFields.includes('is_tax_deductible') ? isTaxDeductible : null,
      fixed_rate_end_date: fixedRateEndDate || null,
      nhg: visibleFields.includes('nhg') ? nhg : null,
      linked_asset_id: linkedAssetId || null,
      credit_limit: creditLimit ? Number(creditLimit) : null,
      draagkrachtmeting_date: draagkrachtmetingDate || null,
    }

    if (isEdit && debt) {
      await supabase.from('debts').update(row).eq('id', debt.id)
    } else {
      await supabase.from('debts').insert(row)
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-900">
            {isEdit ? 'Schuld bewerken' : 'Nieuwe schuld'}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Naam</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Hypotheek"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Type</label>
              <select
                value={debtType}
                onChange={(e) => handleTypeChange(e.target.value as DebtType)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                {Object.entries(DEBT_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subtype dropdown (conditional) */}
          {subtypeOptions && (
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Subtype</label>
              <select
                value={subtype}
                onChange={(e) => handleSubtypeChange(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="">Selecteer subtype...</option>
                {Object.entries(subtypeOptions).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Oorspronkelijk bedrag</label>
              <input
                type="number"
                value={originalAmount}
                onChange={(e) => setOriginalAmount(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Huidig saldo</label>
              <input
                type="number"
                value={currentBalance}
                onChange={(e) => setCurrentBalance(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Rente (% per jaar)</label>
              <input
                type="number"
                step="0.1"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Min. betaling p/m</label>
              <input
                type="number"
                value={minimumPayment}
                onChange={(e) => setMinimumPayment(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Werkelijke betaling p/m</label>
              <input
                type="number"
                value={monthlyPayment}
                onChange={(e) => setMonthlyPayment(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Startdatum</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Einddatum (optioneel)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Kredietverstrekker</label>
            <input
              value={creditor}
              onChange={(e) => setCreditor(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="ABN AMRO, ING, DUO..."
            />
          </div>

          {/* Type-specific fields */}
          {visibleFields.length > 0 && visibleFields.some((f) => f !== 'subtype') && (
            <div className="space-y-3 rounded-lg border border-amber-100 bg-amber-50/30 p-3">
              <p className="text-xs font-semibold text-amber-700/60 uppercase">Details</p>
              <div className="grid grid-cols-2 gap-3">
                {visibleFields.includes('repayment_type') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Aflossingstype</label>
                    <select
                      value={repaymentType}
                      onChange={(e) => setRepaymentType(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">-</option>
                      {Object.entries(REPAYMENT_TYPE_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>{l}</option>
                      ))}
                    </select>
                  </div>
                )}
                {visibleFields.includes('is_tax_deductible') && (
                  <label className="flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={isTaxDeductible}
                      onChange={(e) => setIsTaxDeductible(e.target.checked)}
                      className="rounded border-zinc-300"
                    />
                    Hypotheekrenteaftrek
                  </label>
                )}
                {visibleFields.includes('nhg') && (
                  <label className="flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={nhg}
                      onChange={(e) => setNhg(e.target.checked)}
                      className="rounded border-zinc-300"
                    />
                    NHG
                  </label>
                )}
                {visibleFields.includes('fixed_rate_end_date') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Rentevast tot</label>
                    <input
                      type="date"
                      value={fixedRateEndDate}
                      onChange={(e) => setFixedRateEndDate(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('linked_asset_id') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Gekoppelde woning</label>
                    <select
                      value={linkedAssetId}
                      onChange={(e) => setLinkedAssetId(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">-</option>
                      {userAssets.filter((a) => a.asset_type === 'real_estate').map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {visibleFields.includes('credit_limit') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Kredietlimiet</label>
                    <input
                      type="number"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('draagkrachtmeting_date') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">Draagkrachtmeting</label>
                    <input
                      type="date"
                      value={draagkrachtmetingDate}
                      onChange={(e) => setDraagkrachtmetingDate(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Notities (optioneel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name || !currentBalance}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? 'Opslaan...' : isEdit ? 'Bijwerken' : 'Toevoegen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Shared types & components for valuations ─────────────────

type Valuation = {
  id: string
  user_id: string
  entity_type: string
  entity_id: string
  valuation_date: string
  value: number
  notes: string | null
  created_at: string
}

function ValuationModal({
  entityId,
  entityType,
  entityName,
  currentValue,
  onClose,
  onSaved,
}: {
  entityId: string
  entityType: 'asset' | 'debt'
  entityName: string
  currentValue: number
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [value, setValue] = useState(String(currentValue))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!value) return
    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: valError } = await supabase.from('valuations').upsert({
      user_id: user.id,
      entity_type: entityType,
      entity_id: entityId,
      valuation_date: date,
      value: Number(value),
      notes: notes || null,
    }, { onConflict: 'entity_id,valuation_date' })

    if (valError) {
      console.error('Valuation error:', valError)
      setSaving(false)
      return
    }

    const table = entityType === 'asset' ? 'assets' : 'debts'
    const column = entityType === 'asset' ? 'current_value' : 'current_balance'
    await supabase.from(table).update({ [column]: Number(value) }).eq('id', entityId)

    setSaving(false)
    onSaved()
  }

  const label = entityType === 'asset' ? 'Herwaarderen' : 'Saldo bijwerken'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-zinc-900">{label}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-zinc-500">{entityName}</p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Datum</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              {entityType === 'asset' ? 'Nieuwe waarde' : 'Nieuw saldo'}
            </label>
            <input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-zinc-400">
              Huidige waarde: {formatCurrency(currentValue)}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Notitie (optioneel)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Reden van waardewijziging..."
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !value}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ValuationHistory({
  entityId,
  valuations,
  onLoad,
}: {
  entityId: string
  valuations: Valuation[] | undefined
  onLoad: () => void
}) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!loaded) {
      setLoaded(true)
      onLoad()
    }
  }, [loaded, onLoad])

  if (!valuations || valuations.length === 0) return null

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <p className="mb-2 text-xs font-semibold text-zinc-500 uppercase">Saldohistorie</p>
      <div className="space-y-1">
        {valuations.map((v) => {
          const prev = valuations.find((vv) => vv.valuation_date < v.valuation_date)
          const diff = prev ? Number(v.value) - Number(prev.value) : null
          return (
            <div key={v.id} className="flex items-center gap-3 text-xs">
              <span className="w-20 shrink-0 text-zinc-400">
                {new Date(v.valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className="font-medium text-zinc-700">{formatCurrency(Number(v.value))}</span>
              {diff !== null && (
                <span className={`text-[10px] font-medium ${diff <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                </span>
              )}
              {v.notes && (
                <span className="truncate text-zinc-400">{v.notes}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

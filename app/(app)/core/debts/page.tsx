'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  Plus, Trash2, Edit3, AlertTriangle, CheckCircle2, X, RefreshCw, TrendingDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
import { calculateFreedomTime, formatFreedomTimeString, formatWithFreedom } from '@/lib/format'
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
  amortizationSchedule,
  linearAmortization,
  interestOnlySchedule,
  simulatePayoff,
  payoffSummary,
} from '@/lib/debt-data'
import { type Asset, ASSET_TYPE_LABELS } from '@/lib/asset-data'
import { FeatureGate } from '@/components/app/feature-gate'
import { LockedFeaturesFooter } from '@/components/app/locked-features-footer'
import { OwnershipToggle, OwnershipBadge, useHouseholdStatus, type OwnershipType } from '@/components/app/ownership-toggle'

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
  const [dailyExpenses, setDailyExpenses] = useState(0)
  const seedingRef = useRef(false)

  // Load monthly expenses to compute daily expenses for freedom-time calculations
  const loadExpenses = useCallback(async () => {
    try {
      const supabase = createClient()
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

      const { data } = await supabase
        .from('transactions')
        .select('amount')
        .lt('amount', 0)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth)

      if (data && data.length > 0) {
        const totalExpenses = data.reduce((sum: number, t: { amount: number }) => sum + Math.abs(Number(t.amount)), 0)
        setDailyExpenses(totalExpenses > 0 ? totalExpenses / 30 : 0)
      }
    } catch (err) {
      console.error('Error loading expenses for freedom-time:', err)
    }
  }, [])

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

  // Load ALL debt valuations at once (for mini sparklines on cards)
  const loadAllDebtValuations = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('valuations')
      .select('*')
      .eq('entity_type', 'debt')
      .order('valuation_date', { ascending: true })
    if (data) {
      const grouped: Record<string, Valuation[]> = {}
      for (const v of data as Valuation[]) {
        if (!grouped[v.entity_id]) grouped[v.entity_id] = []
        grouped[v.entity_id].push(v)
      }
      setValuations(grouped)
    }
  }, [])

  const loadUserAssets = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase.from('assets').select('id, name, asset_type').order('name')
    if (data) setUserAssets(data as Asset[])
  }, [])

  useEffect(() => {
    loadDebts().then(() => loadAllDebtValuations())
    loadUserAssets()
    loadExpenses()
  }, [loadDebts, loadUserAssets, loadExpenses, loadAllDebtValuations])

  const activeDebts = debts.filter((d) => d.is_active && Number(d.current_balance) > 0)
  const totalBalance = activeDebts.reduce((s, d) => s + Number(d.current_balance), 0)
  const totalOriginal = activeDebts.reduce((s, d) => s + Number(d.original_amount), 0)
  const totalMonthlyPayments = activeDebts.reduce((s, d) => s + Number(d.monthly_payment), 0)
  const paidOff = totalOriginal > 0 ? ((totalOriginal - totalBalance) / totalOriginal) * 100 : 0

  // Freedom-time calculations for debts
  const totalDebtFreedom = dailyExpenses > 0 ? calculateFreedomTime(totalBalance, dailyExpenses) : null
  const monthlyPaymentFreedomDays = dailyExpenses > 0 ? Math.round(totalMonthlyPayments / dailyExpenses) : 0

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

  // Snowball vs Avalanche comparison simulations (for trajectory overlay)
  const snowballSim = useMemo(
    () => simulatePayoff(activeDebts, 'snowball', extraMonthly),
    [activeDebts, extraMonthly],
  )
  const avalancheSim = useMemo(
    () => simulatePayoff(activeDebts, 'avalanche', extraMonthly),
    [activeDebts, extraMonthly],
  )
  const snowballSummary = useMemo(() => payoffSummary(snowballSim), [snowballSim])
  const avalancheSummary = useMemo(() => payoffSummary(avalancheSim), [avalancheSim])

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
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); loadDebts() }} className="mt-3 rounded-[var(--r)] bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Header with totals */}
      <section className="rounded-[var(--r-lg)] border border-kern-200 card-editorial p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[var(--ink)]">Schulden</h1>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              {activeDebts.length} actieve schuld{activeDebts.length !== 1 ? 'en' : ''} — vrijheid die je terugkoopt
            </p>
          </div>
          <button
            onClick={() => { setEditDebt(null); setShowForm(true) }}
            className="inline-flex items-center gap-2 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700"
          >
            <Plus className="h-4 w-4" />
            Schuld toevoegen
          </button>
        </div>

        <div className="mt-3 sm:mt-6 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
          <div data-testid="kpi-total-debt">
            <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Totale schuld</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)]">{formatCurrency(totalBalance)}</p>
            {totalDebtFreedom && (
              <p className="mt-0.5 text-xs text-kern-600/80" data-testid="debt-freedom-time">
                je koopt deze tijd terug in {formatFreedomTimeString(totalDebtFreedom, 'long')}
              </p>
            )}
          </div>
          <div data-testid="kpi-monthly-payment">
            <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Maandelijkse aflossing</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)]">{formatCurrency(totalMonthlyPayments)}</p>
            {monthlyPaymentFreedomDays > 0 && (
              <p className="mt-0.5 text-xs text-kern-600/80" data-testid="payment-freedom-days">
                je wint {monthlyPaymentFreedomDays} {monthlyPaymentFreedomDays === 1 ? 'dag' : 'dagen'} per maand terug
              </p>
            )}
          </div>
          <div data-testid="kpi-paid-off">
            <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Al afgelost</p>
            <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrency(totalOriginal - totalBalance)}</p>
            {dailyExpenses > 0 && totalOriginal - totalBalance >= 100 && (
              <p className="mt-0.5 text-xs text-emerald-600/80">
                {formatFreedomTimeString(calculateFreedomTime(totalOriginal - totalBalance, dailyExpenses), 'long')} vrijheid herwonnen
              </p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-[var(--ink-3)] uppercase">Voortgang</p>
            <p className="mt-1 text-xl font-bold text-[var(--ink)]">{paidOff.toFixed(1)}%</p>
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
      <section className="mt-3 sm:mt-6 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-[var(--ink-2)]">Aflosstrategie</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {(['avalanche', 'snowball', 'current'] as PayoffStrategy[]).map((s) => (
            <button
              key={s}
              onClick={() => setStrategy(s)}
              className={`rounded-[var(--r)] border px-4 py-2 text-sm font-medium transition-colors ${
                strategy === s
                  ? 'border-kern-300 bg-kern-50 text-kern-700'
                  : 'border-[var(--border-ed)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink-2)]'
              }`}
            >
              {s === 'avalanche' ? 'Avalanche (hoogste rente eerst)' :
               s === 'snowball' ? 'Sneeuwbal (kleinste schuld eerst)' :
               'Huidig (ongewijzigd)'}
            </button>
          ))}

          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--ink-3)]">Extra p/m:</label>
            <input
              type="number"
              min={0}
              step={25}
              value={extraMonthly}
              onChange={(e) => setExtraMonthly(Math.max(0, Number(e.target.value)))}
              className="w-20 rounded-[var(--r)] border border-[var(--border-ed)] px-2 py-1.5 text-sm text-[var(--ink)]"
            />
          </div>
        </div>

        {/* Strategy results */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3" data-testid="strategy-payoff-date">
            <p className="text-xs text-[var(--ink-3)]">Schuldenvrij op</p>
            <p className="mt-1 text-sm font-bold text-[var(--ink)]">
              {summary.payoffDate
                ? new Date(summary.payoffDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
                : 'Niet mogelijk'}
            </p>
            {summary.payoffDate && (
              <p className="mt-0.5 text-[10px] text-kern-600/80" data-testid="strategy-payoff-freedom">
                Schuldenvrij in {new Date(summary.payoffDate).getFullYear()} — dan verdien je 100% voor jezelf
              </p>
            )}
          </div>
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
            <p className="text-xs text-[var(--ink-3)]">Totale rente</p>
            <p className="mt-1 text-sm font-bold text-red-600">{formatCurrency(summary.totalInterest)}</p>
            {dailyExpenses > 0 && summary.totalInterest >= 100 && (
              <p className="mt-0.5 text-[10px] text-red-500/80">
                {formatFreedomTimeString(calculateFreedomTime(summary.totalInterest, dailyExpenses), 'long')} aan verloren vrijheid
              </p>
            )}
          </div>
          {interestSaved > 0 && (
            <div className="rounded-[var(--r-lg)] border border-emerald-100 bg-emerald-50 p-3">
              <p className="text-xs text-emerald-600">Rente bespaard</p>
              <p className="mt-1 text-sm font-bold text-emerald-700">{formatCurrency(interestSaved)}</p>
              {dailyExpenses > 0 && interestSaved >= 100 && (
                <p className="mt-0.5 text-[10px] text-emerald-600/80">
                  {formatFreedomTimeString(calculateFreedomTime(interestSaved, dailyExpenses), 'long')} vrijheid gered
                </p>
              )}
            </div>
          )}
          {monthsSaved > 0 && (
            <div className="rounded-[var(--r-lg)] border border-emerald-100 bg-emerald-50 p-3">
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

        {/* Strategy comparison: Snowball vs Avalanche trajectory overlay */}
        {activeDebts.length > 0 && snowballSim.length > 0 && avalancheSim.length > 0 && (
          <div className="mt-3 sm:mt-6" data-testid="strategy-comparison-section">
            <DebtPayoffTrajectoryChart
              snowballMonths={snowballSim}
              avalancheMonths={avalancheSim}
              snowballSummary={snowballSummary}
              avalancheSummary={avalancheSummary}
            />
            <StrategyComparisonMessage
              snowballSummary={snowballSummary}
              avalancheSummary={avalancheSummary}
              dailyExpenses={dailyExpenses}
            />
          </div>
        )}
      </section>
      </FeatureGate>

      {/* Debt list */}
      <section className="mt-3 sm:mt-6 space-y-2">
        {debts.map((debt) => {
          const balance = Number(debt.current_balance)
          const original = Number(debt.original_amount)
          const pct = original > 0 ? ((original - balance) / original) * 100 : 0
          const icon = DEBT_TYPE_ICONS[debt.debt_type] ?? 'CircleDot'
          const debtValuations = valuations[debt.id]

          return (
            <div
              key={debt.id}
              className="flex cursor-pointer items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 transition-colors hover:border-kern-200 hover:bg-kern-50/30"
              onClick={() => openDebtModal(debt)}
              data-testid={`debt-card-${debt.id}`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-kern-50">
                <BudgetIcon name={icon} className="h-4 w-4 text-kern-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--ink)] flex items-center gap-1.5">
                      {debt.name}
                      <OwnershipBadge ownership={debt.ownership ?? 'personal'} />
                    </p>
                    <p className="truncate text-xs text-[var(--ink-3)]">
                      {DEBT_TYPE_LABELS[debt.debt_type]}
                      {debt.subtype && DEBT_SUBTYPE_LABELS[debt.debt_type]?.[debt.subtype]
                        ? ` \u2022 ${DEBT_SUBTYPE_LABELS[debt.debt_type]![debt.subtype]}`
                        : ''}
                      {debt.creditor ? ` \u2022 ${debt.creditor}` : ''}
                    </p>
                  </div>
                  {/* Mini sparkline showing balance trend */}
                  <DebtMiniSparkline debtId={debt.id} valuations={debtValuations} currentBalance={balance} />
                  <div className="shrink-0 text-right ml-3">
                    <p className="text-sm font-semibold text-[var(--ink)]">{formatCurrency(balance)}</p>
                    <p className="text-xs text-[var(--ink-3)]">van {formatCurrency(original)}</p>
                    {dailyExpenses > 0 && balance >= 100 && (
                      <p className="text-[10px] text-kern-600/70">
                        {formatFreedomTimeString(calculateFreedomTime(balance, dailyExpenses), 'short')} terug te winnen
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-kern-500 transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}

        {debts.length === 0 && (
          <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <p className="mt-2 text-sm font-medium text-[var(--ink-2)]">Geen schulden geregistreerd</p>
            <p className="mt-1 text-xs text-[var(--ink-3)]">Voeg een schuld toe om je aflosplan te starten.</p>
          </div>
        )}
      </section>

      {/* Debt detail modal */}
      {selectedDebt && modalStep === 'detail' && (
        <DebtDetailModal
          debt={selectedDebt}
          valuations={valuations[selectedDebt.id]}
          userAssets={userAssets}
          dailyExpenses={dailyExpenses}
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

      {/* Locked features footer for debts sub-page */}
      <LockedFeaturesFooter module="kern" featureIds={['schulden_aflosplan']} />

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
  dailyExpenses,
  onClose,
  onEdit,
  onRevalue,
  onDelete,
}: {
  debt: Debt
  valuations: Valuation[] | undefined
  userAssets: Asset[]
  dailyExpenses: number
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
        className="w-full max-w-lg overflow-y-auto rounded-[var(--r-lg)] bg-[var(--paper)] shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--border-ed)] px-6 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] bg-kern-50">
            <BudgetIcon name={icon} className="h-5 w-5 text-kern-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-[var(--ink)]">{debt.name}</h2>
            <p className="text-xs text-[var(--ink-3)]">
              {DEBT_TYPE_LABELS[debt.debt_type]}
              {debt.subtype && DEBT_SUBTYPE_LABELS[debt.debt_type]?.[debt.subtype]
                ? ` \u2022 ${DEBT_SUBTYPE_LABELS[debt.debt_type]![debt.subtype]}`
                : ''}
              {debt.creditor ? ` \u2022 ${debt.creditor}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded-[var(--r)] p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Balance highlight */}
        <div className="border-b border-[var(--border-ed)] px-6 py-4 text-center">
          <p className="text-3xl font-bold text-[var(--ink)]" data-testid="modal-debt-balance">{formatCurrency(balance)}</p>
          {dailyExpenses > 0 && balance >= 100 && (
            <p className="mt-0.5 text-sm text-kern-600" data-testid="modal-debt-freedom-time">
              je koopt deze tijd terug in {formatFreedomTimeString(calculateFreedomTime(balance, dailyExpenses), 'long')}
            </p>
          )}
          <p className="mt-1 text-sm text-[var(--ink-3)]">van {formatCurrency(original)} ({pct.toFixed(1)}% afgelost)</p>
          <div className="mx-auto mt-2 h-2 w-48 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-kern-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          {/* Badges */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            {debt.repayment_type && (
              <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-[var(--ink-2)]">
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
          {/* Payoff timeline highlight */}
          {debt.repayment_type !== 'aflossingsvrij' && proj.isPayable && proj.monthsToPayoff > 0 && (
            <div className="rounded-[var(--r-lg)] border border-kern-200 bg-kern-50 p-3 text-center" data-testid="payoff-timeline">
              <p className="text-xs font-medium text-kern-700/60 uppercase">Aflostijd</p>
              <p className="mt-1 text-2xl font-bold text-kern-700" data-testid="months-to-payoff">
                {proj.monthsToPayoff} maanden
              </p>
              <p className="mt-0.5 text-xs text-kern-600" data-testid="payoff-freedom-message">
                {proj.payoffDate
                  ? `Schuldenvrij in ${new Date(proj.payoffDate).getFullYear()} — dan verdien je 100% voor jezelf`
                  : ''}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Rente</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{Number(debt.interest_rate)}% p.j.</p>
            </div>
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3" data-testid="modal-monthly-payment">
              <p className="text-xs text-[var(--ink-3)]">Maandelijkse betaling</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{formatCurrency(Number(debt.monthly_payment))}</p>
              {dailyExpenses > 0 && Number(debt.monthly_payment) > 0 && (
                <p className="mt-0.5 text-[10px] text-kern-600/80" data-testid="modal-payment-freedom-days">
                  je wint {Math.round(Number(debt.monthly_payment) / dailyExpenses)} {Math.round(Number(debt.monthly_payment) / dailyExpenses) === 1 ? 'dag' : 'dagen'} per maand terug
                </p>
              )}
            </div>
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Aflossing op</p>
              <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">
                {debt.repayment_type === 'aflossingsvrij'
                  ? 'Aflossingsvrij'
                  : proj.isPayable && proj.payoffDate
                    ? new Date(proj.payoffDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
                    : 'Onbekend'}
              </p>
            </div>
            <div className="rounded-[var(--r)] bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Resterende rente</p>
              <p className="mt-0.5 text-sm font-medium text-red-600">
                {proj.isPayable ? formatCurrency(proj.totalInterest) : 'Onbetaalbaar'}
              </p>
              {dailyExpenses > 0 && proj.isPayable && proj.totalInterest >= 100 && (
                <p className="mt-0.5 text-[10px] text-red-500/80">
                  {formatFreedomTimeString(calculateFreedomTime(proj.totalInterest, dailyExpenses), 'long')} verloren tijd
                </p>
              )}
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
                  <div key={d.label} className="rounded-[var(--r)] bg-kern-50/50 p-3">
                    <p className="text-xs text-kern-700/60">{d.label}</p>
                    <p className="mt-0.5 text-sm font-medium text-[var(--ink)]">{d.value}</p>
                  </div>
                ))}
              </div>
            )
          })()}

          {!proj.isPayable && debt.repayment_type !== 'aflossingsvrij' && (
            <div className="flex items-center gap-2 rounded-[var(--r)] border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
              <p className="text-xs text-red-700">
                De maandelijkse betaling dekt de rente niet. Verhoog de betaling om deze schuld af te lossen.
              </p>
            </div>
          )}

          {debt.notes && <p className="text-xs text-[var(--ink-3)]">{debt.notes}</p>}

          {/* Debt trajectory chart: actual vs projected */}
          <DebtTrajectoryChart debt={debt} valuations={valuations} />

          {/* Valuation history */}
          {valuations && valuations.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Saldohistorie</p>
              <div className="space-y-1">
                {valuations.slice(0, 5).map((v) => {
                  const prev = valuations.find((vv) => vv.valuation_date < v.valuation_date)
                  const diff = prev ? Number(v.value) - Number(prev.value) : null
                  return (
                    <div key={v.id} className="flex items-center gap-3 text-xs">
                      <span className="w-20 shrink-0 text-[var(--ink-3)]">
                        {new Date(v.valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      </span>
                      <span className="font-medium text-[var(--ink-2)]">{formatCurrency(Number(v.value))}</span>
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
        <div className="flex gap-2 border-t border-[var(--border-ed)] px-6 py-4">
          <button
            onClick={onRevalue}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r)] border border-kern-200 px-3 py-2 text-xs font-medium text-kern-700 hover:bg-kern-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Saldo bijwerken
          </button>
          <button
            onClick={onEdit}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--r)] bg-kern-600 px-3 py-2 text-xs font-medium text-white hover:bg-kern-700"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Bewerken
          </button>
          {confirmDelete ? (
            <button
              onClick={onDelete}
              className="inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
            >
              Bevestigen
            </button>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-[var(--r)] border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
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

// ── Debt payoff trajectory: Snowball vs Avalanche overlay ─────

function DebtPayoffTrajectoryChart({
  snowballMonths,
  avalancheMonths,
  snowballSummary,
  avalancheSummary,
}: {
  snowballMonths: ReturnType<typeof simulatePayoff>
  avalancheMonths: ReturnType<typeof simulatePayoff>
  snowballSummary: ReturnType<typeof payoffSummary>
  avalancheSummary: ReturnType<typeof payoffSummary>
}) {
  if (snowballMonths.length === 0 && avalancheMonths.length === 0) return null

  const w = 800
  const h = 240
  const pad = { top: 16, right: 24, bottom: 40, left: 60 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  // Determine axis bounds from both simulations
  const maxBalance = Math.max(
    snowballMonths[0]?.totalBalance ?? 0,
    avalancheMonths[0]?.totalBalance ?? 0,
  )
  const maxMonth = Math.max(snowballMonths.length, avalancheMonths.length)

  if (maxBalance <= 0 || maxMonth <= 0) return null

  function x(month: number) {
    return pad.left + (month / maxMonth) * chartW
  }
  function y(val: number) {
    return pad.top + chartH - (val / maxBalance) * chartH
  }

  // Sample points for each strategy (max ~80 each for performance)
  const sampleStep = Math.max(1, Math.floor(maxMonth / 80))

  function buildPath(months: ReturnType<typeof simulatePayoff>) {
    const sampled = months.filter((_, i) => i % sampleStep === 0 || i === months.length - 1)
    return sampled
      .map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(m.month).toFixed(1)},${y(m.totalBalance).toFixed(1)}`)
      .join(' ')
  }

  function buildFillPath(months: ReturnType<typeof simulatePayoff>) {
    const sampled = months.filter((_, i) => i % sampleStep === 0 || i === months.length - 1)
    const linePath = sampled
      .map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(m.month).toFixed(1)},${y(m.totalBalance).toFixed(1)}`)
      .join(' ')
    const last = sampled[sampled.length - 1]
    const first = sampled[0]
    return linePath
      + ` L ${x(last.month).toFixed(1)},${(pad.top + chartH).toFixed(1)}`
      + ` L ${x(first.month).toFixed(1)},${(pad.top + chartH).toFixed(1)} Z`
  }

  const snowballPath = buildPath(snowballMonths)
  const avalanchePath = buildPath(avalancheMonths)
  const snowballFill = buildFillPath(snowballMonths)
  const avalancheFill = buildFillPath(avalancheMonths)

  // Per-debt breakdown lines for snowball strategy
  const debtIds = snowballMonths[0]?.debts.map(d => d.id) ?? []
  const debtNames = snowballMonths[0]?.debts.map(d => d.name) ?? []
  const perDebtColors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899']

  const perDebtPaths: { id: string; name: string; snowballPath: string; avalanchePath: string; color: string }[] = []
  for (let di = 0; di < debtIds.length; di++) {
    const id = debtIds[di]
    const color = perDebtColors[di % perDebtColors.length]

    const snowSampled = snowballMonths.filter((_, i) => i % sampleStep === 0 || i === snowballMonths.length - 1)
    const avSampled = avalancheMonths.filter((_, i) => i % sampleStep === 0 || i === avalancheMonths.length - 1)

    const sPath = snowSampled
      .map((m, i) => {
        const entry = m.debts.find(d => d.id === id)
        return `${i === 0 ? 'M' : 'L'} ${x(m.month).toFixed(1)},${y(entry?.balance ?? 0).toFixed(1)}`
      })
      .join(' ')

    const aPath = avSampled
      .map((m, i) => {
        const entry = m.debts.find(d => d.id === id)
        return `${i === 0 ? 'M' : 'L'} ${x(m.month).toFixed(1)},${y(entry?.balance ?? 0).toFixed(1)}`
      })
      .join(' ')

    perDebtPaths.push({
      id,
      name: debtNames[di],
      snowballPath: sPath,
      avalanchePath: aPath,
      color,
    })
  }

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxBalance * t))

  // X-axis: every 12 months
  const xTicks: number[] = []
  for (let m = 12; m < maxMonth; m += 12) xTicks.push(m)
  if (maxMonth > 6) xTicks.push(maxMonth)

  // Payoff month markers
  const snowballPayoffMonth = snowballMonths.length
  const avalanchePayoffMonth = avalancheMonths.length

  return (
    <div data-testid="debt-payoff-trajectory-chart">
      <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Schuld-trajectvergelijking</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="snowball-fill-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="avalanche-fill-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((val) => (
          <g key={val}>
            <line
              x1={pad.left} y1={y(val)} x2={w - pad.right} y2={y(val)}
              stroke="#e4e4e7" strokeWidth="0.5"
            />
            <text x={pad.left - 8} y={y(val) + 3} textAnchor="end" fontSize="8" fill="#a1a1aa">
              {val >= 1000 ? `€${Math.round(val / 1000)}k` : `€${val}`}
            </text>
          </g>
        ))}

        {/* Fill areas */}
        <path d={snowballFill} fill="url(#snowball-fill-grad)" />
        <path d={avalancheFill} fill="url(#avalanche-fill-grad)" />

        {/* Per-debt lines (thin, for additional detail) */}
        {perDebtPaths.map((dp) => (
          <g key={dp.id}>
            <path
              d={dp.snowballPath}
              fill="none"
              stroke={dp.color}
              strokeWidth="0.75"
              strokeOpacity="0.3"
              strokeLinecap="round"
            />
            <path
              d={dp.avalanchePath}
              fill="none"
              stroke={dp.color}
              strokeWidth="0.75"
              strokeOpacity="0.3"
              strokeDasharray="3,2"
              strokeLinecap="round"
            />
          </g>
        ))}

        {/* Snowball total line (solid blue) */}
        <path
          d={snowballPath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          data-testid="snowball-trajectory-line"
        />

        {/* Avalanche total line (solid red) */}
        <path
          d={avalanchePath}
          fill="none"
          stroke="#ef4444"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          data-testid="avalanche-trajectory-line"
        />

        {/* Snowball payoff marker */}
        {snowballPayoffMonth < maxMonth && (
          <>
            <line
              x1={x(snowballPayoffMonth)} y1={pad.top}
              x2={x(snowballPayoffMonth)} y2={pad.top + chartH}
              stroke="#3b82f6" strokeWidth="1" strokeDasharray="4,3" strokeOpacity="0.5"
            />
            <circle
              cx={x(snowballPayoffMonth)} cy={y(0)}
              r="4" fill="#3b82f6" stroke="white" strokeWidth="1.5"
            />
          </>
        )}

        {/* Avalanche payoff marker */}
        {avalanchePayoffMonth < maxMonth && (
          <>
            <line
              x1={x(avalanchePayoffMonth)} y1={pad.top}
              x2={x(avalanchePayoffMonth)} y2={pad.top + chartH}
              stroke="#ef4444" strokeWidth="1" strokeDasharray="4,3" strokeOpacity="0.5"
            />
            <circle
              cx={x(avalanchePayoffMonth)} cy={y(0)}
              r="4" fill="#ef4444" stroke="white" strokeWidth="1.5"
            />
          </>
        )}

        {/* X-axis labels */}
        {xTicks.map((m) => (
          <text key={m} x={x(m)} y={h - 18} textAnchor="middle" fontSize="8" fill="#a1a1aa">
            {m >= 12 ? `${Math.floor(m / 12)}j` : `${m}m`}
          </text>
        ))}

        {/* Legend */}
        <g transform={`translate(${pad.left}, ${h - 8})`}>
          <line x1="0" y1="0" x2="16" y2="0" stroke="#3b82f6" strokeWidth="2.5" />
          <text x="20" y="3" fontSize="8" fill="#71717a">Sneeuwbal</text>
          <line x1="110" y1="0" x2="126" y2="0" stroke="#ef4444" strokeWidth="2.5" />
          <text x="130" y="3" fontSize="8" fill="#71717a">Avalanche</text>
        </g>
      </svg>
    </div>
  )
}

// ── Strategy comparison contextual message ────────────────────

function StrategyComparisonMessage({
  snowballSummary,
  avalancheSummary,
  dailyExpenses,
}: {
  snowballSummary: ReturnType<typeof payoffSummary>
  avalancheSummary: ReturnType<typeof payoffSummary>
  dailyExpenses: number
}) {
  if (snowballSummary.totalMonths === 0 && avalancheSummary.totalMonths === 0) return null

  const snowMonths = snowballSummary.totalMonths
  const avMonths = avalancheSummary.totalMonths
  const snowInterest = snowballSummary.totalInterest
  const avInterest = avalancheSummary.totalInterest

  const monthDiff = Math.abs(snowMonths - avMonths)
  const interestDiff = Math.abs(snowInterest - avInterest)

  // Determine which strategy wins on time and on interest
  const avalancheFaster = avMonths < snowMonths
  const avalancheCheaper = avInterest < snowInterest
  const sameTime = monthDiff === 0
  const sameInterest = interestDiff < 1

  let message = ''
  let bgClass = ''
  let textClass = ''

  if (sameTime && sameInterest) {
    message = 'Beide strategieën leiden tot hetzelfde resultaat voor jouw schulden.'
    bgClass = 'border-[var(--border-ed)] bg-[var(--subtle)]'
    textClass = 'text-[var(--ink-2)]'
  } else if (avalancheFaster && avalancheCheaper) {
    message = `Bij avalanche-strategie ben je ${monthDiff} ${monthDiff === 1 ? 'maand' : 'maanden'} eerder schuldenvrij en bespaar je ${formatCurrency(interestDiff)} aan rente.`
    bgClass = 'border-red-200 bg-red-50'
    textClass = 'text-red-700'
  } else if (!avalancheFaster && !avalancheCheaper && !sameTime) {
    message = `Bij sneeuwbal-strategie ben je ${monthDiff} ${monthDiff === 1 ? 'maand' : 'maanden'} eerder schuldenvrij en bespaar je ${formatCurrency(interestDiff)} aan rente.`
    bgClass = 'border-blue-200 bg-blue-50'
    textClass = 'text-blue-700'
  } else if (avalancheCheaper) {
    message = `Bij avalanche-strategie bespaar je ${formatCurrency(interestDiff)} aan rente${!sameTime ? ` (${avalancheFaster ? `${monthDiff} maanden sneller` : `${monthDiff} maanden langer`})` : ''}.`
    bgClass = 'border-red-200 bg-red-50'
    textClass = 'text-red-700'
  } else {
    message = `Bij sneeuwbal-strategie ben je ${monthDiff} ${monthDiff === 1 ? 'maand' : 'maanden'} eerder schuldenvrij${!sameInterest ? `, maar betaal je ${formatCurrency(interestDiff)} meer rente` : ''}.`
    bgClass = 'border-blue-200 bg-blue-50'
    textClass = 'text-blue-700'
  }

  // Add freedom-time context if dailyExpenses available
  let freedomNote = ''
  if (dailyExpenses > 0 && interestDiff > 100) {
    const savedDays = Math.round(interestDiff / dailyExpenses)
    if (savedDays > 0) {
      freedomNote = ` Dat is ${savedDays} ${savedDays === 1 ? 'dag' : 'dagen'} aan extra vrijheid.`
    }
  }

  return (
    <div
      className={`mt-3 rounded-[var(--r-lg)] border p-3 text-center ${bgClass}`}
      data-testid="strategy-comparison-message"
    >
      <p className={`text-sm font-medium ${textClass}`} data-testid="strategy-comparison-text">
        {message}
        {freedomNote && <span className="font-normal text-kern-600">{freedomNote}</span>}
      </p>
      {!sameTime && (
        <div className="mt-2 flex items-center justify-center gap-6 text-xs text-[var(--ink-3)]">
          <span data-testid="snowball-months">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-500 mr-1" />
            Sneeuwbal: {snowMonths} mnd
          </span>
          <span data-testid="avalanche-months">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-1" />
            Avalanche: {avMonths} mnd
          </span>
          <span data-testid="time-difference">
            Verschil: {monthDiff} {monthDiff === 1 ? 'maand' : 'maanden'}
          </span>
        </div>
      )}
    </div>
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
  const [validationError, setValidationError] = useState<string | null>(null)
  // Household ownership
  const [ownership, setOwnership] = useState<OwnershipType>(debt?.ownership ?? 'personal')
  const { hasHousehold, householdId } = useHouseholdStatus()

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
    setValidationError(null)

    // Validate no negative monetary values or rates
    const numCurrentBalance = Number(currentBalance)
    const numOriginalAmount = Number(originalAmount)
    const numInterestRate = Number(interestRate)
    const numMinimumPayment = Number(minimumPayment)
    const numMonthlyPayment = Number(monthlyPayment)

    if (numCurrentBalance < 0) {
      setValidationError('Huidig saldo mag niet negatief zijn. Voer een positief bedrag in.')
      return
    }
    if (originalAmount && numOriginalAmount < 0) {
      setValidationError('Oorspronkelijk bedrag mag niet negatief zijn. Voer een positief bedrag in.')
      return
    }
    if (interestRate && numInterestRate < 0) {
      setValidationError('Rentepercentage mag niet negatief zijn. Voer een positief percentage in.')
      return
    }
    if (minimumPayment && numMinimumPayment < 0) {
      setValidationError('Minimale betaling mag niet negatief zijn.')
      return
    }
    if (monthlyPayment && numMonthlyPayment < 0) {
      setValidationError('Werkelijke betaling mag niet negatief zijn.')
      return
    }

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
      // Household fields
      ownership: ownership,
      household_id: ownership === 'shared' ? householdId : null,
    }

    if (isEdit && debt) {
      // When balance reaches 0, mark debt as paid off
      const editRow = { ...row } as Record<string, unknown>
      if ((Number(currentBalance) || 0) <= 0) {
        editRow.is_active = false
      }
      await supabase.from('debts').update(editRow).eq('id', debt.id)

      // Auto-track valuation when current_balance changes
      const newBalance = Number(currentBalance) || 0
      const oldBalance = Number(debt.current_balance)
      if (newBalance !== oldBalance) {
        const valuationNotes = newBalance <= 0
          ? `Schuld afgelost! Saldo bijgewerkt van ${oldBalance} naar ${newBalance}`
          : `Saldo bijgewerkt van ${oldBalance} naar ${newBalance}`
        await supabase.from('valuations').upsert({
          user_id: user.id,
          entity_type: 'debt',
          entity_id: debt.id,
          valuation_date: new Date().toISOString().split('T')[0],
          value: newBalance,
          notes: valuationNotes,
        }, { onConflict: 'entity_id,valuation_date' })
      }
    } else {
      await supabase.from('debts').insert(row)
    }

    setSaving(false)
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[var(--ink)]">
            {isEdit ? 'Schuld bewerken' : 'Nieuwe schuld'}
          </h3>
          <button onClick={onClose} className="rounded-[var(--r)] p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Naam</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
                placeholder="Hypotheek"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Type</label>
              <select
                value={debtType}
                onChange={(e) => handleTypeChange(e.target.value as DebtType)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              >
                {Object.entries(DEBT_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ownership toggle */}
          <OwnershipToggle
            value={ownership}
            onChange={setOwnership}
            hasHousehold={hasHousehold}
          />

          {/* Subtype dropdown (conditional) */}
          {subtypeOptions && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Subtype</label>
              <select
                value={subtype}
                onChange={(e) => handleSubtypeChange(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
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
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Oorspronkelijk bedrag</label>
              <input
                type="number"
                value={originalAmount}
                onChange={(e) => setOriginalAmount(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Huidig saldo</label>
              <input
                type="number"
                value={currentBalance}
                onChange={(e) => setCurrentBalance(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Rente (% per jaar)</label>
              <input
                type="number"
                step="0.1"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Min. betaling p/m</label>
              <input
                type="number"
                value={minimumPayment}
                onChange={(e) => setMinimumPayment(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Werkelijke betaling p/m</label>
              <input
                type="number"
                value={monthlyPayment}
                onChange={(e) => setMonthlyPayment(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Startdatum</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Einddatum (optioneel)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Kredietverstrekker</label>
            <input
              value={creditor}
              onChange={(e) => setCreditor(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              placeholder="ABN AMRO, ING, DUO..."
            />
          </div>

          {/* Type-specific fields */}
          {visibleFields.length > 0 && visibleFields.some((f) => f !== 'subtype') && (
            <div className="space-y-3 rounded-[var(--r)] border border-kern-100 bg-kern-50/30 p-3">
              <p className="text-xs font-semibold text-kern-700/60 uppercase">Details</p>
              <div className="grid grid-cols-2 gap-3">
                {visibleFields.includes('repayment_type') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Aflossingstype</label>
                    <select
                      value={repaymentType}
                      onChange={(e) => setRepaymentType(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    >
                      <option value="">-</option>
                      {Object.entries(REPAYMENT_TYPE_LABELS).map(([k, l]) => (
                        <option key={k} value={k}>{l}</option>
                      ))}
                    </select>
                  </div>
                )}
                {visibleFields.includes('is_tax_deductible') && (
                  <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                    <input
                      type="checkbox"
                      checked={isTaxDeductible}
                      onChange={(e) => setIsTaxDeductible(e.target.checked)}
                      className="rounded border-[var(--border-md)]"
                    />
                    Hypotheekrenteaftrek
                  </label>
                )}
                {visibleFields.includes('nhg') && (
                  <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                    <input
                      type="checkbox"
                      checked={nhg}
                      onChange={(e) => setNhg(e.target.checked)}
                      className="rounded border-[var(--border-md)]"
                    />
                    NHG
                  </label>
                )}
                {visibleFields.includes('fixed_rate_end_date') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Rentevast tot</label>
                    <input
                      type="date"
                      value={fixedRateEndDate}
                      onChange={(e) => setFixedRateEndDate(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('linked_asset_id') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Gekoppelde woning</label>
                    <select
                      value={linkedAssetId}
                      onChange={(e) => setLinkedAssetId(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    >
                      <option value="">-</option>
                      {userAssets.filter((a) => a.asset_type === 'eigen_huis' || a.asset_type === 'real_estate').map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {visibleFields.includes('credit_limit') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Kredietlimiet</label>
                    <input
                      type="number"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
                {visibleFields.includes('draagkrachtmeting_date') && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Draagkrachtmeting</label>
                    <input
                      type="date"
                      value={draagkrachtmetingDate}
                      onChange={(e) => setDraagkrachtmetingDate(e.target.value)}
                      className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Notities (optioneel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
          </div>
        </div>

        {validationError && (
          <div className="mt-3 rounded-[var(--r)] border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" data-testid="debt-validation-error">
            {validationError}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name || !currentBalance}
            className="rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
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
    const newValue = Number(value)
    const updatePayload: Record<string, unknown> = { [column]: newValue }

    // When a debt balance reaches 0, mark it as paid off (is_active = false)
    if (entityType === 'debt' && newValue <= 0) {
      updatePayload.is_active = false
    }

    await supabase.from(table).update(updatePayload).eq('id', entityId)

    setSaving(false)
    onSaved()
  }

  const label = entityType === 'asset' ? 'Herwaarderen' : 'Saldo bijwerken'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[var(--ink)]">{label}</h3>
          <button onClick={onClose} className="rounded-[var(--r)] p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-[var(--ink-3)]">{entityName}</p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Datum</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">
              {entityType === 'asset' ? 'Nieuwe waarde' : 'Nieuw saldo'}
            </label>
            <input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-[var(--ink-3)]">
              Huidige waarde: {formatCurrency(currentValue)}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-2)]">Notitie (optioneel)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2 text-sm"
              placeholder="Reden van waardewijziging..."
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !value}
            className="rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700 disabled:opacity-50"
          >
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Debt trajectory chart (real vs projected overlay) ─────────

function DebtTrajectoryChart({
  debt,
  valuations,
}: {
  debt: Debt
  valuations: Valuation[] | undefined
}) {
  const w = 600
  const h = 220
  const pad = { top: 16, right: 24, bottom: 32, left: 58 }
  const chartW = w - pad.left - pad.right
  const chartH = h - pad.top - pad.bottom

  const balance = Number(debt.current_balance)
  const original = Number(debt.original_amount)
  const rate = Number(debt.interest_rate)
  const payment = Number(debt.monthly_payment)
  const repType = debt.repayment_type

  // Build actual data points from valuations (sorted ascending by date)
  const actualPoints: { date: Date; value: number }[] = []

  // Add original amount at start_date as the first point
  if (debt.start_date && original > 0) {
    actualPoints.push({ date: new Date(debt.start_date), value: original })
  }

  // Add valuation history points
  if (valuations && valuations.length > 0) {
    const sorted = [...valuations].sort(
      (a, b) => new Date(a.valuation_date).getTime() - new Date(b.valuation_date).getTime()
    )
    for (const v of sorted) {
      actualPoints.push({ date: new Date(v.valuation_date), value: Number(v.value) })
    }
  }

  // Always ensure current balance as the last actual point (today)
  const today = new Date()
  actualPoints.push({ date: today, value: balance })

  // Build projected data points from current balance forward
  const projectedPoints: { date: Date; value: number }[] = []
  projectedPoints.push({ date: today, value: balance }) // Start at transition point

  if (balance > 0 && payment > 0) {
    let schedule: { month: number; date: string; balance: number }[] = []

    if (repType === 'aflossingsvrij') {
      // Interest-only: balance stays flat
      let months = 120 // 10 years default
      if (debt.end_date) {
        const end = new Date(debt.end_date)
        months = Math.max(1, Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
      }
      schedule = interestOnlySchedule(balance, rate, Math.min(months, 360), today)
    } else if (repType === 'lineair') {
      const monthlyRate = rate / 100 / 12
      const approxPrincipal = payment - (balance * monthlyRate / 2)
      if (approxPrincipal > 0) {
        const termMonths = Math.ceil(balance / approxPrincipal)
        schedule = linearAmortization(balance, rate, termMonths, today)
      }
    } else {
      // Annuity (default)
      const monthlyInterest = balance * (rate / 100 / 12)
      if (payment > monthlyInterest) {
        schedule = amortizationSchedule(balance, rate, payment, today)
      }
    }

    // Sample projected points (max ~50 for SVG performance)
    const step = Math.max(1, Math.floor(schedule.length / 50))
    for (let i = 0; i < schedule.length; i++) {
      if (i % step === 0 || i === schedule.length - 1) {
        projectedPoints.push({
          date: new Date(schedule[i].date),
          value: schedule[i].balance,
        })
      }
    }
  }

  // Calculate global min/max for axes
  const allPoints = [...actualPoints, ...projectedPoints]
  if (allPoints.length < 2) return null

  const minDate = allPoints.reduce((min, p) => (p.date < min ? p.date : min), allPoints[0].date)
  const maxDate = allPoints.reduce((max, p) => (p.date > max ? p.date : max), allPoints[0].date)
  const maxValue = Math.max(...allPoints.map((p) => p.value))

  const dateRange = maxDate.getTime() - minDate.getTime()
  if (dateRange <= 0 || maxValue <= 0) return null

  function xPos(date: Date) {
    return pad.left + ((date.getTime() - minDate.getTime()) / dateRange) * chartW
  }
  function yPos(val: number) {
    return pad.top + chartH - (val / maxValue) * chartH
  }

  // Build SVG path for actual line
  const actualPath = actualPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.date).toFixed(1)},${yPos(p.value).toFixed(1)}`)
    .join(' ')

  // Build SVG path for projected line
  const projectedPath = projectedPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.date).toFixed(1)},${yPos(p.value).toFixed(1)}`)
    .join(' ')

  // Build fill area for actual (gradient fill below line)
  const actualFill = actualPath
    + ` L ${xPos(actualPoints[actualPoints.length - 1].date).toFixed(1)},${(pad.top + chartH).toFixed(1)}`
    + ` L ${xPos(actualPoints[0].date).toFixed(1)},${(pad.top + chartH).toFixed(1)} Z`

  // Build fill area for projected
  const projectedFill = projectedPath
    + ` L ${xPos(projectedPoints[projectedPoints.length - 1].date).toFixed(1)},${(pad.top + chartH).toFixed(1)}`
    + ` L ${xPos(projectedPoints[0].date).toFixed(1)},${(pad.top + chartH).toFixed(1)} Z`

  // Y-axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxValue * t))

  // X-axis labels: show years
  const xLabels: { date: Date; label: string }[] = []
  const startYear = minDate.getFullYear()
  const endYear = maxDate.getFullYear()
  for (let yr = startYear; yr <= endYear + 1; yr++) {
    const d = new Date(yr, 0, 1)
    if (d >= minDate && d <= maxDate) {
      xLabels.push({ date: d, label: String(yr) })
    }
  }
  // Ensure at most 8 labels for readability
  const labelStep = Math.max(1, Math.ceil(xLabels.length / 8))
  const filteredLabels = xLabels.filter((_, i) => i % labelStep === 0)

  // Transition point (where actual meets projected)
  const transitionX = xPos(today)
  const transitionY = yPos(balance)

  return (
    <div data-testid="debt-trajectory-chart">
      <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Schuldverloop</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={`actual-fill-${debt.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`projected-fill-${debt.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((val) => (
          <g key={val}>
            <line
              x1={pad.left} y1={yPos(val)} x2={w - pad.right} y2={yPos(val)}
              stroke="#e4e4e7" strokeWidth="0.5"
            />
            <text x={pad.left - 8} y={yPos(val) + 3} textAnchor="end" fontSize="8" fill="#a1a1aa">
              {val >= 1000 ? `${Math.round(val / 1000)}k` : val}
            </text>
          </g>
        ))}

        {/* Transition line (today - vertical dashed line) */}
        <line
          x1={transitionX} y1={pad.top}
          x2={transitionX} y2={pad.top + chartH}
          stroke="#a1a1aa" strokeWidth="0.75" strokeDasharray="3,3"
        />
        <text
          x={transitionX} y={pad.top - 4}
          textAnchor="middle" fontSize="7" fill="#71717a"
        >
          vandaag
        </text>

        {/* Actual balance fill area */}
        <path d={actualFill} fill={`url(#actual-fill-${debt.id})`} />

        {/* Projected balance fill area */}
        <path d={projectedFill} fill={`url(#projected-fill-${debt.id})`} />

        {/* Actual balance line (solid blue) */}
        <path
          d={actualPath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          data-testid="actual-balance-line"
        />

        {/* Projected balance line (dashed amber) */}
        <path
          d={projectedPath}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2"
          strokeDasharray="6,3"
          strokeLinecap="round"
          strokeLinejoin="round"
          data-testid="projected-balance-line"
        />

        {/* Actual data points (small dots) */}
        {actualPoints.map((p, i) => (
          <circle
            key={`actual-${i}`}
            cx={xPos(p.date)}
            cy={yPos(p.value)}
            r="2.5"
            fill="#3b82f6"
            stroke="white"
            strokeWidth="1"
          />
        ))}

        {/* Transition point (larger dot) */}
        <circle
          cx={transitionX}
          cy={transitionY}
          r="4"
          fill="#f59e0b"
          stroke="white"
          strokeWidth="1.5"
          data-testid="transition-point"
        />

        {/* X-axis labels */}
        {filteredLabels.map((xl) => (
          <text
            key={xl.label}
            x={xPos(xl.date)}
            y={h - 8}
            textAnchor="middle"
            fontSize="8"
            fill="#a1a1aa"
          >
            {xl.label}
          </text>
        ))}

        {/* Legend */}
        <g transform={`translate(${pad.left}, ${h - 12})`}>
          <line x1="0" y1="0" x2="12" y2="0" stroke="#3b82f6" strokeWidth="2" />
          <text x="16" y="3" fontSize="7" fill="#71717a">Werkelijk</text>
          <line x1="80" y1="0" x2="92" y2="0" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4,2" />
          <text x="96" y="3" fontSize="7" fill="#71717a">Verwacht</text>
        </g>
      </svg>
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
    <div className="mt-4 border-t border-[var(--border-ed)] pt-3">
      <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Saldohistorie</p>
      <div className="space-y-1">
        {valuations.map((v) => {
          const prev = valuations.find((vv) => vv.valuation_date < v.valuation_date)
          const diff = prev ? Number(v.value) - Number(prev.value) : null
          return (
            <div key={v.id} className="flex items-center gap-3 text-xs">
              <span className="w-20 shrink-0 text-[var(--ink-3)]">
                {new Date(v.valuation_date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span className="font-medium text-[var(--ink-2)]">{formatCurrency(Number(v.value))}</span>
              {diff !== null && (
                <span className={`text-[10px] font-medium ${diff <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                </span>
              )}
              {v.notes && (
                <span className="truncate text-[var(--ink-3)]">{v.notes}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Mini sparkline for debt cards ─────────────────────────────

function DebtMiniSparkline({
  debtId,
  valuations,
  currentBalance,
}: {
  debtId: string
  valuations: Valuation[] | undefined
  currentBalance: number
}) {
  // Need at least 2 data points to draw a sparkline
  if (!valuations || valuations.length < 2) return null

  const W = 64
  const H = 24
  const PAD = 2

  // Values sorted ascending by date
  const sorted = [...valuations].sort(
    (a, b) => new Date(a.valuation_date).getTime() - new Date(b.valuation_date).getTime()
  )
  const values = sorted.map(v => Number(v.value))

  // Add current balance as most recent point if different from last valuation
  const lastVal = values[values.length - 1]
  if (Math.abs(lastVal - currentBalance) > 0.01) {
    values.push(currentBalance)
  }

  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2)
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  // For debts: going DOWN is good (green), going UP is bad (red)
  const trend = values[values.length - 1] <= values[0]
  const strokeColor = trend ? '#059669' : '#dc2626' // emerald-600 or red-600

  // Create gradient fill
  const fillPoints = [
    `${PAD},${H - PAD}`,
    ...points,
    `${(PAD + ((values.length - 1) / (values.length - 1)) * (W - PAD * 2)).toFixed(1)},${H - PAD}`,
  ]

  return (
    <div className="shrink-0 hidden sm:block" data-testid={`debt-sparkline-${debtId}`}>
      <svg viewBox={`0 0 ${W} ${H}`} width={64} height={24} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`debtSparkFill-${debtId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon
          points={fillPoints.join(' ')}
          fill={`url(#debtSparkFill-${debtId})`}
        />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Last point dot */}
        {(() => {
          const lastIdx = values.length - 1
          const x = PAD + (lastIdx / (values.length - 1)) * (W - PAD * 2)
          const y = H - PAD - ((values[lastIdx] - min) / range) * (H - PAD * 2)
          return <circle cx={x} cy={y} r="2" fill={strokeColor} />
        })()}
      </svg>
    </div>
  )
}

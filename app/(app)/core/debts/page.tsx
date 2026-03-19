'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  Plus, CheckCircle2, TrendingDown, Wallet, Target, Scale,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BudgetIcon, formatCurrency } from '@/components/app/budget-shared'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import {
  type Debt,
  type PayoffStrategy,
  DEBT_TYPE_LABELS,
  DEBT_TYPE_ICONS,
  DEBT_SUBTYPE_LABELS,
  getDefaultDebts,
  simulatePayoff,
  payoffSummary,
  debtProjection,
} from '@/lib/debt-data'
import type { Asset } from '@/lib/asset-data'
import { FeatureGate } from '@/components/app/feature-gate'
import { OwnershipBadge, useHouseholdStatus } from '@/components/app/ownership-toggle'
import { usePerspective, usePerspectiveAbort } from '@/components/app/perspective-provider'
import { usePartnerPrivacy, PrivacyHiddenNotice } from '@/components/app/privacy-hidden-notice'
import { computeSharePct, SPLIT_MODE_LABELS, type SplitMode } from '@/lib/household-data'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { FhinAvatar } from '@/components/app/avatars'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'

// Extracted components
import type { Valuation } from '@/components/app/core/debts/debt-types'
import { DebtMiniSparkline } from '@/components/app/core/debts/debt-mini-sparkline'
import { DebtDetailModal } from '@/components/app/core/debts/debt-detail-modal'
import { DebtForm } from '@/components/app/core/debts/debt-form'
import { ValuationModal } from '@/components/app/core/debts/debt-valuation-modal'
import { PayoffChart } from '@/components/app/core/debts/debt-payoff-chart'
import { DebtPayoffTrajectoryChart, StrategyComparisonMessage } from '@/components/app/core/debts/debt-comparison-chart'
import { BelastingSection } from '@/components/app/core/debts/belasting-section'
import HypotheekVsBeleggenModal from '@/components/app/core/debts/hypotheek-vs-beleggen-modal'
import { resolveFireParams, type FireParams } from '@/lib/fire-params'

export default function DebtsPage({ initialDebtId }: { initialDebtId?: string } = {}) {
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
  const { perspective } = usePerspective()
  const perspectiveSignal = usePerspectiveAbort(perspective)
  const { partnerPrivacy, hiddenCategories } = usePartnerPrivacy()
  const { ref: debtListRef, hasEntered: debtListEntered } = useInViewAnimation({ duration: 800 })
  const { hasHousehold, householdId } = useHouseholdStatus()
  const [householdSplit, setHouseholdSplit] = useState<{ splitMode: SplitMode; mySharePct: number; myName: string; partnerName: string } | null>(null)

  // Load household split settings for per-partner debt breakdown
  useEffect(() => {
    if (!hasHousehold || !householdId) { setHouseholdSplit(null); return }
    async function loadSplit() {
      try {
        const [statusRes, settingsRes] = await Promise.all([
          fetch('/api/household/status'),
          fetch('/api/household/settings'),
        ])
        if (!statusRes.ok || !settingsRes.ok) return
        const status = await statusRes.json()
        const settings = await settingsRes.json()
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const splitMode: SplitMode = settings.split_mode || 'equal'
        const mySharePct = computeSharePct(
          { splitMode, customSplitPct: settings.custom_split_pct ?? null, primaryPayerId: settings.primary_payer_id ?? null },
          user?.id ?? '',
        )
        const myMember = (status.members ?? []).find((m: { is_current_user: boolean }) => m.is_current_user)
        const partnerMember = (status.members ?? []).find((m: { is_current_user: boolean }) => !m.is_current_user)
        setHouseholdSplit({
          splitMode,
          mySharePct,
          myName: myMember?.full_name || 'Jij',
          partnerName: partnerMember?.full_name || 'Partner',
        })
      } catch {
        // Non-critical
      }
    }
    loadSplit()
  }, [hasHousehold, householdId])

  // HvB modal state
  const [hvbDebt, setHvbDebt] = useState<Debt | null>(null)
  const [fireParams, setFireParams] = useState<FireParams | null>(null)

  // Load fire params for HvB modal
  useEffect(() => {
    async function loadFireParams() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: profile } = await supabase
          .from('profiles')
          .select('expected_return, inflation_rate, box3_method, marginaal_tarief, net_monthly_income')
          .eq('id', user.id)
          .single()
        if (profile) setFireParams(resolveFireParams(profile))
      } catch { /* non-critical */ }
    }
    loadFireParams()
  }, [])

  // Kassabon modal state
  const [showTotalKassabon, setShowTotalKassabon] = useState(false)
  const [showMonthlyKassabon, setShowMonthlyKassabon] = useState(false)
  const [showPaidOffKassabon, setShowPaidOffKassabon] = useState(false)
  const [showProgressKassabon, setShowProgressKassabon] = useState(false)

  // Load monthly expenses to compute daily expenses for freedom-time calculations
  const loadExpenses = useCallback(async (signal?: AbortSignal) => {
    try {
      const supabase = createClient()
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

      let expQuery = supabase
        .from('transactions')
        .select('amount')
        .lt('amount', 0)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth)

      if (perspective === 'personal') {
        expQuery = expQuery.eq('ownership', 'personal')
      }

      const { data } = await expQuery
      if (signal?.aborted) return // Discard stale results

      if (data && data.length > 0) {
        const totalExpenses = data.reduce((sum: number, t: { amount: number }) => sum + Math.abs(Number(t.amount)), 0)
        setDailyExpenses(totalExpenses > 0 ? totalExpenses / 30 : 0)
      }
    } catch (err) {
      console.error('Error loading expenses for freedom-time:', err)
    }
  }, [perspective])

  const loadDebts = useCallback(async (signal?: AbortSignal) => {
    try {
      const supabase = createClient()
      let query = supabase
        .from('debts')
        .select('*')
      if (perspective === 'personal') {
        query = query.eq('ownership', 'personal')
      }
      const { data, error: fetchError } = await query
        .order('sort_order', { ascending: true })

      if (signal?.aborted) return // Discard stale results
      if (fetchError) throw fetchError

      if (!data || data.length === 0) {
        if (seedingRef.current) return
        seedingRef.current = true
        // Double-check: count to prevent race conditions
        const { count } = await supabase.from('debts').select('id', { count: 'exact', head: true })
        if (signal?.aborted) return
        if (count && count > 0) { seedingRef.current = false; await loadDebts(signal); return }
        await seedDebts(supabase)
        return
      }

      // Apply privacy filtering in household mode (Feature #537)
      let filteredData = data as Debt[]
      if (perspective === 'household') {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (signal?.aborted) return
          if (user) {
            const ppRes = await fetch('/api/household/partner-privacy')
            if (ppRes.ok) {
              const ppData = await ppRes.json()
              if (ppData.partnerPrivacy?.debts === 'hidden') {
                filteredData = filteredData.filter(
                  d => d.user_id === user.id || d.ownership === 'shared'
                )
              }
            }
          }
        } catch { /* non-critical */ }
      }
      setDebts(filteredData)
    } catch (err) {
      console.error('Error loading debts:', err)
      if (!signal?.aborted) setError('Kon schulden niet laden. Probeer het opnieuw.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [perspective])

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
    const signal = perspectiveSignal
    loadDebts(signal).then(() => { if (!signal.aborted) loadAllDebtValuations() })
    loadUserAssets()
    loadExpenses(signal)
  }, [loadDebts, loadUserAssets, loadExpenses, loadAllDebtValuations, perspectiveSignal])

  const activeDebts = debts.filter((d) => d.is_active && Number(d.current_balance) > 0)
  const totalBalance = activeDebts.reduce((s, d) => s + Number(d.current_balance), 0)
  const totalOriginal = activeDebts.reduce((s, d) => s + Number(d.original_amount), 0)
  const totalMonthlyPayments = activeDebts.reduce((s, d) => s + Number(d.monthly_payment), 0)
  const paidOff = totalOriginal > 0 ? ((totalOriginal - totalBalance) / totalOriginal) * 100 : 0
  const paidOffAmount = totalOriginal - totalBalance

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

  // Open modal from initialDebtId prop (embedded in core page modal)
  useEffect(() => {
    if (!initialDebtId || loading || debts.length === 0) return
    const found = debts.find(d => d.id === initialDebtId)
    if (found) {
      setSelectedDebt(found)
      setModalStep('detail')
    }
  }, [initialDebtId, loading, debts])

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

  // Payoff date string
  const payoffDateStr = summary.payoffDate
    ? new Date(summary.payoffDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
    : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">

      {/* ═══ 1. HERO ═══ */}
      <section className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)]" data-testid="debts-hero">
        <div className="h-1.5 bg-kern-500" />
        <div className="p-4 sm:p-6 md:p-8">
          <div className="mb-5 flex items-center gap-3">
            <FhinAvatar size={40} />
            <p className="label-editorial text-kern-600">
              Vrijheid die je terugkoopt
            </p>
          </div>

          <span className="font-display text-[36px] font-bold tracking-tight text-[var(--ink)] sm:text-[44px] md:text-[52px]" data-testid="hero-total-debt">
            {formatCurrency(totalBalance)}
          </span>

          {payoffDateStr && (
            <p className="mt-1 font-serif italic text-lg text-[var(--ink-3)]">
              schuldenvrij in <span className="font-semibold not-italic text-[var(--ink-2)]">{payoffDateStr}</span>
            </p>
          )}
          {!payoffDateStr && activeDebts.length > 0 && (
            <p className="mt-1 font-serif italic text-lg text-[var(--ink-3)]">
              {activeDebts.length} actieve schuld{activeDebts.length !== 1 ? 'en' : ''}
            </p>
          )}

          {/* Progress bar */}
          {totalOriginal > 0 && (
            <div className="mt-5">
              <div className="mb-1 flex items-center justify-between text-xs text-[var(--ink-3)]">
                <span>{paidOff.toFixed(1)}% afgelost</span>
                <span>{formatCurrency(paidOffAmount)} van {formatCurrency(totalOriginal)}</span>
              </div>
              <div className="h-[5px] w-full overflow-hidden rounded-full bg-kern-100">
                <div
                  className="h-full rounded-full bg-kern-500 transition-all duration-700"
                  style={{ width: `${Math.min(paidOff, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══ 2. KPI GRID ═══ */}
      <section className="mt-5 sm:mt-8 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="debts-kpi-grid">
        {/* KPI: Totale Schuld */}
        <button
          type="button"
          onClick={() => setShowTotalKassabon(true)}
          className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5 text-left transition-all hover:border-kern-300 hover:shadow-sm"
          data-testid="kpi-total-debt"
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[var(--r)] bg-kern-50">
            <Wallet className="h-5 w-5 text-kern-600" />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">Totale Schuld</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[var(--ink)]">{formatCurrency(totalBalance)}</p>
          <FreedomTimeBadge amount={totalBalance} className="mt-2" />
        </button>

        {/* KPI: Maandelijkse Aflossing */}
        <button
          type="button"
          onClick={() => setShowMonthlyKassabon(true)}
          className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5 text-left transition-all hover:border-kern-300 hover:shadow-sm"
          data-testid="kpi-monthly-payment"
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[var(--r)] bg-kern-50">
            <TrendingDown className="h-5 w-5 text-kern-600" />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">Maandelijkse Aflossing</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[var(--ink)]">{formatCurrency(totalMonthlyPayments)}</p>
          {monthlyPaymentFreedomDays > 0 && (
            <p className="mt-2 text-xs text-kern-600/80">
              {monthlyPaymentFreedomDays} {monthlyPaymentFreedomDays === 1 ? 'dag' : 'dagen'} per maand teruggewonnen
            </p>
          )}
        </button>

        {/* KPI: Al Afgelost */}
        <button
          type="button"
          onClick={() => setShowPaidOffKassabon(true)}
          className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5 text-left transition-all hover:border-kern-300 hover:shadow-sm"
          data-testid="kpi-paid-off"
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[var(--r)] bg-kern-50">
            <CheckCircle2 className="h-5 w-5 text-kern-600" />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">Al Afgelost</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-emerald-600">{formatCurrency(paidOffAmount)}</p>
          {dailyExpenses > 0 && paidOffAmount >= 100 && (
            <p className="mt-2 text-xs text-emerald-600/80">
              {formatFreedomTimeString(calculateFreedomTime(paidOffAmount, dailyExpenses), 'long')} vrijheid herwonnen
            </p>
          )}
        </button>

        {/* KPI: Voortgang */}
        <button
          type="button"
          onClick={() => setShowProgressKassabon(true)}
          className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5 text-left transition-all hover:border-kern-300 hover:shadow-sm"
          data-testid="kpi-progress"
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[var(--r)] bg-kern-50">
            <Target className="h-5 w-5 text-kern-600" />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">Voortgang</p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-[var(--ink)]">{paidOff.toFixed(1)}%</p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${Math.min(paidOff, 100)}%` }}
            />
          </div>
        </button>
      </section>

      {/* ═══ 3. AFLOSSTRATEGIE ═══ */}
      <FeatureGate featureId="schulden_aflosplan" fallback="hidden">
      <section className="mt-5 sm:mt-8" data-testid="strategy-section">
        <div className="mb-4 flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-kern-500" />
          <h2 className="label-editorial text-[var(--ink-2)]">Aflosstrategie</h2>
        </div>

        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
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
        </div>
      </section>
      </FeatureGate>

      {/* ═══ 4. JOUW SCHULDEN ═══ */}
      <section className="mt-5 sm:mt-8" data-testid="debt-list-section">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-1 rounded-full bg-kern-500" />
            <h2 className="label-editorial text-[var(--ink-2)]">Jouw Schulden</h2>
            {perspective === 'household' && hiddenCategories.includes('debts') && (
              <PrivacyHiddenNotice hiddenCategories={hiddenCategories} forCategories={['debts']} />
            )}
          </div>
          <button
            onClick={() => { setEditDebt(null); setShowForm(true) }}
            className="inline-flex items-center gap-2 rounded-[var(--r)] bg-kern-600 px-4 py-2 text-sm font-medium text-white hover:bg-kern-700"
          >
            <Plus className="h-4 w-4" />
            Schuld toevoegen
          </button>
        </div>

        <div className="space-y-2" ref={debtListRef}>
        {debts.map((debt, debtIndex) => {
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
                      {debt.debt_type === 'belastingschuld' && debt.subtype && DEBT_SUBTYPE_LABELS[debt.debt_type]?.[debt.subtype]
                        ? ` \u2022 ${debt.tax_year ? `${DEBT_SUBTYPE_LABELS[debt.debt_type]![debt.subtype].replace(' aanslag', '')} ${debt.tax_year}` : DEBT_SUBTYPE_LABELS[debt.debt_type]![debt.subtype]}`
                        : debt.debt_type === 'belastingschuld' && debt.tax_year
                          ? ` \u2022 ${debt.tax_year}`
                          : debt.subtype && DEBT_SUBTYPE_LABELS[debt.debt_type]?.[debt.subtype]
                            ? ` \u2022 ${DEBT_SUBTYPE_LABELS[debt.debt_type]![debt.subtype]}`
                            : ''}
                      {debt.debt_type === 'dga_schuld' && debt.linked_asset_id
                        ? ` \u2022 ${userAssets.find((a) => a.id === debt.linked_asset_id)?.name ?? 'Deelneming'}`
                        : debt.debt_type !== 'belastingschuld' && debt.creditor ? ` \u2022 ${debt.creditor}` : ''}
                    </p>
                    {debt.debt_type === 'belastingschuld' && debt.has_payment_plan && (
                      <span className="mt-0.5 inline-block rounded bg-emerald-50 border border-emerald-200 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-700">
                        Betalingsregeling
                      </span>
                    )}
                    {debt.debt_type === 'familielening' && !debt.has_written_agreement && (
                      <span className="mt-0.5 inline-block rounded bg-amber-50 border border-amber-200 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-700">
                        Geen overeenkomst
                      </span>
                    )}
                    {debt.debt_type === 'familielening' && Number(debt.interest_rate) === 0 && (
                      <span className="mt-0.5 inline-block rounded bg-blue-50 border border-blue-200 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-blue-600">
                        0% rente
                      </span>
                    )}
                    {(debt.net_worth_inclusion_pct ?? 100) < 100 && (
                      <span className="mt-0.5 inline-block rounded bg-kern-50 border border-kern-200 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-kern-600">
                        {debt.net_worth_inclusion_pct}% meegeteld
                      </span>
                    )}
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
                    className="h-full rounded-full bg-kern-500"
                    style={{
                      width: debtListEntered ? `${Math.min(pct, 100)}%` : '0%',
                      transition: debtListEntered
                        ? `width 500ms cubic-bezier(.22,1,.36,1) ${100 + debtIndex * 80}ms`
                        : 'none',
                    }}
                  />
                </div>
                {/* Per-partner split for shared debts */}
                {debt.ownership === 'shared' && (() => {
                  const debtSplitPct = debt.partner_split_pct != null ? debt.partner_split_pct : householdSplit?.mySharePct
                  const splitInfo = debt.partner_split_pct != null
                    ? { myName: householdSplit?.myName ?? 'Jij', partnerName: householdSplit?.partnerName ?? 'Partner', label: 'Eigen verdeling' }
                    : householdSplit
                      ? { myName: householdSplit.myName, partnerName: householdSplit.partnerName, label: SPLIT_MODE_LABELS[householdSplit.splitMode] }
                      : null
                  if (debtSplitPct == null || !splitInfo) return null
                  return (
                    <p className="mt-1 text-[9px] text-kern-500/70" data-testid="debt-card-partner-split">
                      {splitInfo.myName.split(' ')[0]} {formatCurrency(balance * debtSplitPct / 100)} · {splitInfo.partnerName.split(' ')[0]} {formatCurrency(balance * (100 - debtSplitPct) / 100)}
                      <span className="ml-1 text-[var(--ink-4)]">({splitInfo.label})</span>
                    </p>
                  )
                })()}
                {/* HvB button for mortgage debts */}
                {debt.debt_type === 'mortgage' && Number(debt.interest_rate) > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setHvbDebt(debt) }}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--r)] border border-kern-200 bg-kern-50/50 px-2.5 py-1 text-[11px] font-medium text-kern-600 transition-colors hover:bg-kern-100"
                    data-testid="hvb-card-button"
                  >
                    <Scale className="h-3 w-3" />
                    Aflossen vs Beleggen
                  </button>
                )}
              </div>
            </div>
          )
        })}
        </div>

        {debts.length === 0 && (
          <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <p className="mt-2 text-sm font-medium text-[var(--ink-2)]">Geen schulden geregistreerd</p>
            <p className="mt-1 text-xs text-[var(--ink-3)]">Voeg een schuld toe om je aflosplan te starten.</p>
          </div>
        )}
      </section>

      {/* ═══ 5. BOX 3 BELASTING ═══ */}
      <FeatureGate featureId="box3_belasting" fallback="hidden">
        <BelastingSection dailyExpenses={dailyExpenses} />
      </FeatureGate>

      {/* ═══ 6. MODALS ═══ */}

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
          allDebts={debts}
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
          allDebts={debts}
          onClose={() => { setShowForm(false); setEditDebt(null) }}
          onSaved={() => {
            setShowForm(false)
            setEditDebt(null)
            loadDebts()
          }}
        />
      )}

      {/* ═══ HVB MODAL ═══ */}
      {hvbDebt && (() => {
        const hvbRepaymentType = hvbDebt.repayment_type === 'lineair' ? 'linear' as const
          : hvbDebt.repayment_type === 'aflossingsvrij' ? 'interest_only' as const
          : 'annuity' as const
        const proj = debtProjection(hvbDebt)
        return (
          <HypotheekVsBeleggenModal
            open={true}
            onClose={() => setHvbDebt(null)}
            hypotheekBalance={Number(hvbDebt.current_balance)}
            rente={Number(hvbDebt.interest_rate)}
            repaymentType={hvbRepaymentType}
            restLooptijd={proj.monthsToPayoff > 0 ? proj.monthsToPayoff : 360}
            isTaxDeductible={hvbDebt.is_tax_deductible ?? false}
            marginaalTarief={fireParams?.marginaalTarief ?? 0.3697}
            inflatie={fireParams?.inflationRate ?? 0.02}
            hasPartner={!!householdSplit}
          />
        )
      })()}

      {/* ═══ KASSABON MODALS ═══ */}

      {/* Kassabon: Totale Schuld */}
      <BottomSheet open={showTotalKassabon} onClose={() => setShowTotalKassabon(false)} title="Totale Schuld">
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">TOTALE SCHULD</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">alle actieve schulden samengevat</p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Dit is het totaal van al je openstaande schulden. Elke euro schuld vertegenwoordigt tijd die je moet investeren om die schuld af te lossen.
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              {activeDebts.map(d => (
                <div key={d.id} className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">{d.name}</span>
                  <span className="tabular-nums text-[var(--ink)]">{formatCurrency(Number(d.current_balance))}</span>
                </div>
              ))}
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">Totaal</span>
              <span className="tabular-nums text-[var(--ink)]">{formatCurrency(totalBalance)}</span>
            </div>

            {totalBalance >= 100 && (
              <div className="mt-3 flex justify-center">
                <FreedomTimeBadge amount={totalBalance} />
              </div>
            )}

            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              <p><strong className="font-semibold text-[var(--ink-3)]">Oorspronkelijk:</strong> {formatCurrency(totalOriginal)}</p>
              <p><strong className="font-semibold text-[var(--ink-3)]">Afgelost:</strong> {formatCurrency(paidOffAmount)} ({paidOff.toFixed(1)}%)</p>
            </div>

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">gebaseerd op {activeDebts.length} actieve schulden</p>
          </KassabonShell>
        </div>
      </BottomSheet>

      {/* Kassabon: Maandelijkse Aflossing */}
      <BottomSheet open={showMonthlyKassabon} onClose={() => setShowMonthlyKassabon(false)} title="Maandelijkse Aflossing">
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">MAANDELIJKSE AFLOSSING</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">wat je maandelijks aflost</p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Je maandelijkse aflossing vertegenwoordigt de vrijheid die je elke maand terugkoopt. Hoe hoger de aflossing, hoe sneller je schuldenvrij bent.
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              {activeDebts.map(d => (
                <div key={d.id} className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">{d.name}</span>
                  <span className="tabular-nums text-[var(--ink)]">{formatCurrency(Number(d.monthly_payment))}</span>
                </div>
              ))}
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">Totaal per maand</span>
              <span className="tabular-nums text-[var(--ink)]">{formatCurrency(totalMonthlyPayments)}</span>
            </div>

            {monthlyPaymentFreedomDays > 0 && (
              <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                <p><strong className="font-semibold text-[var(--ink-3)]">Vrijheidsdagen per maand:</strong> {monthlyPaymentFreedomDays} dagen</p>
                <p>Elke maand win je {monthlyPaymentFreedomDays} dagen aan vrijheid terug door af te lossen.</p>
              </div>
            )}

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">gebaseerd op werkelijke maandbetalingen</p>
          </KassabonShell>
        </div>
      </BottomSheet>

      {/* Kassabon: Al Afgelost */}
      <BottomSheet open={showPaidOffKassabon} onClose={() => setShowPaidOffKassabon(false)} title="Al Afgelost">
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">AL AFGELOST</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">voortgang per schuld</p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Dit is het totaalbedrag dat je al hebt afgelost. Elke afgelost bedrag is vrijheid die je hebt teruggewonnen.
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              {activeDebts.map(d => {
                const orig = Number(d.original_amount)
                const bal = Number(d.current_balance)
                const paid = orig - bal
                return (
                  <div key={d.id} className="flex justify-between py-0.5">
                    <span className="font-sans text-sm text-[var(--ink-2)]">{d.name}</span>
                    <span className="tabular-nums text-emerald-600">{formatCurrency(paid)}</span>
                  </div>
                )
              })}
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">Totaal afgelost</span>
              <span className="tabular-nums text-emerald-600">{formatCurrency(paidOffAmount)}</span>
            </div>

            {dailyExpenses > 0 && paidOffAmount >= 100 && (
              <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                <p><strong className="font-semibold text-[var(--ink-3)]">Vrijheidstijd herwonnen:</strong> {formatFreedomTimeString(calculateFreedomTime(paidOffAmount, dailyExpenses), 'long')}</p>
              </div>
            )}

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">oorspronkelijk totaal: {formatCurrency(totalOriginal)}</p>
          </KassabonShell>
        </div>
      </BottomSheet>

      {/* Kassabon: Voortgang */}
      <BottomSheet open={showProgressKassabon} onClose={() => setShowProgressKassabon(false)} title="Voortgang">
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">VOORTGANG</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">gewogen voortgang per schuld</p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              De voortgang wordt berekend op basis van het totale afgeloste bedrag ten opzichte van het oorspronkelijke totaal.
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              {activeDebts.map(d => {
                const orig = Number(d.original_amount)
                const bal = Number(d.current_balance)
                const debtPct = orig > 0 ? ((orig - bal) / orig) * 100 : 0
                return (
                  <div key={d.id} className="flex justify-between py-0.5">
                    <span className="font-sans text-sm text-[var(--ink-2)]">{d.name}</span>
                    <span className="tabular-nums text-[var(--ink)]">{debtPct.toFixed(1)}%</span>
                  </div>
                )
              })}
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">Totale voortgang</span>
              <span className="tabular-nums text-[var(--ink)]">{paidOff.toFixed(1)}%</span>
            </div>

            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              <p><strong className="font-semibold text-[var(--ink-3)]">Formule:</strong> (oorspronkelijk − huidig) / oorspronkelijk × 100</p>
              <p className="mt-1">({formatCurrency(totalOriginal)} − {formatCurrency(totalBalance)}) / {formatCurrency(totalOriginal)} = {paidOff.toFixed(1)}%</p>
            </div>

            {payoffDateStr && (
              <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                <p><strong className="font-semibold text-[var(--ink-3)]">Verwacht schuldenvrij:</strong> {payoffDateStr}</p>
              </div>
            )}

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">op basis van oorspronkelijke en huidige saldi</p>
          </KassabonShell>
        </div>
      </BottomSheet>
    </div>
  )
}

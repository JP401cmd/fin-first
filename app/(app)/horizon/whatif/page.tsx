'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import {
  type HorizonInput,
  type LifeEvent,
  ageAtDate,
  DEFAULT_RETURN,
  INFLATION,
  NL_SWR,
} from '@/lib/horizon-data'
import {
  runSimulation,
  lifeEventsToCashflows,
  type SimResult,
  type SimCashflow,
  type ReturnModel,
} from '@/lib/fire-simulation'
import { computeYearlyMustExpenses, computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import { parseFireStrategy, type FireStrategyConfig, STRATEGY_LABELS } from '@/lib/fire-strategy'
import { SimChart } from '@/components/app/horizon/sim-chart'
import { WhatIfHeader } from '@/components/app/horizon/whatif-header'
import { WhatIfSliders, type WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'
import { WhatIfEventsPanel, type WhatIfEvent } from '@/components/app/horizon/whatif-events'
import { Loader2, AlertTriangle, Hourglass, TrendingUp } from 'lucide-react'

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatFireAge(age: number | null): string {
  if (age === null) return '—'
  const years = Math.floor(age)
  const months = Math.round((age - years) * 12)
  return months > 0 ? `${years} jaar en ${months} mnd` : `${years} jaar`
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function WhatIfPage() {
  // ── Base data state ──────────────────────────────────────
  const [input, setInput] = useState<HorizonInput | null>(null)
  const [events, setEvents] = useState<WhatIfEvent[]>([])
  const [fireStrategy, setFireStrategy] = useState<FireStrategyConfig | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── What-If overrides ────────────────────────────────────
  const [overrides, setOverrides] = useState<WhatIfOverrides | null>(null)

  // ── Load data (same as horizon/page.tsx — single source of truth) ──
  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const now = new Date()
      const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
      const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]
      const twelveMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1)).toISOString().split('T')[0]

      const [txResult, assetsResult, debtsResult, profileResult, essentialBudgetsResult, eventsResult, childBudgetsResult, income12Result, earliestIncomeResult] = await Promise.all([
        supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
        supabase.from('assets').select('current_value, monthly_contribution, net_worth_inclusion_pct').eq('is_active', true),
        supabase.from('debts').select('current_balance, net_worth_inclusion_pct').eq('is_active', true),
        supabase.from('profiles').select('date_of_birth, retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount').single(),
        supabase.from('budgets').select('id, name, default_limit, interval, budget_type, is_essential').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
        supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase.from('budgets').select('id, name, parent_id, default_limit, is_essential, interval, budget_type').not('parent_id', 'is', null).not('budget_type', 'in', '("archive","income","savings")'),
        supabase.from('transactions').select('amount, date').gt('amount', 0).gte('date', twelveMonthsAgo).lt('date', monthEnd),
        supabase.from('transactions').select('date').gt('amount', 0).gte('date', twelveMonthsAgo).order('date', { ascending: true }).limit(1),
      ])

      let monthlyIncome = 0
      let monthlyExpenses = 0
      for (const tx of txResult.data ?? []) {
        const amt = Number(tx.amount)
        if (amt > 0) monthlyIncome += amt
        else monthlyExpenses += Math.abs(amt)
      }

      const totalAssets = (assetsResult.data ?? []).reduce((s, a) =>
        s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
      const totalDebts = (debtsResult.data ?? []).reduce((s, d) =>
        s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
      const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

      const last12Income = income12Result.data?.reduce((s, t) => s + Number(t.amount), 0) ?? 0
      let extrapolatedIncome = last12Income
      const earliestIncomeDate = earliestIncomeResult.data?.[0]?.date
      if (earliestIncomeDate && last12Income > 0) {
        const earliest = new Date(earliestIncomeDate)
        const incomeMonths = Math.max(1, Math.min(12,
          (now.getFullYear() - earliest.getFullYear()) * 12 +
          (now.getMonth() - earliest.getMonth())
        ))
        if (incomeMonths < 12) {
          extrapolatedIncome = (last12Income / incomeMonths) * 12
        }
      }

      const allChildren = childBudgetsResult.data ?? []
      const { yearlyMustExpenses } = computeYearlyMustExpenses(
        essentialBudgetsResult.data ?? [],
        allChildren,
      )

      const yearlyRetirementExpenses = computeRetirementExpenses(
        profileResult.data?.retirement_expense_method as RetirementExpenseMethod,
        yearlyMustExpenses,
        extrapolatedIncome,
        profileResult.data?.retirement_expense_custom_amount,
      )

      const dob = profileResult.data?.date_of_birth ?? null

      setFireStrategy(parseFireStrategy(profileResult.data ?? {}))

      const horizonInput: HorizonInput = {
        totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
        monthlyContributions, yearlyMustExpenses: yearlyRetirementExpenses, dateOfBirth: dob,
      }

      setInput(horizonInput)
      setEvents((eventsResult.data ?? []).map(e => ({ ...e } as WhatIfEvent)))

      // Initialize sliders from real data
      const savingsRate = monthlyIncome > 0
        ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100)
        : 0

      setOverrides({
        monthlyIncome: Math.round(monthlyIncome),
        workDaysPerWeek: 5,
        savingsRate: Math.max(0, Math.min(80, savingsRate)),
        expectedReturn: DEFAULT_RETURN * 100, // as percentage
        extraContribution: 0,
      })
    } catch (err) {
      console.error('Error loading what-if data:', err)
      setError('Kon gegevens niet laden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Event handlers ─────────────────────────────────────────
  const handleToggleEvent = useCallback((id: string) => {
    setEvents(prev => prev.map(e =>
      e.id === id ? { ...e, whatIfDisabled: !e.whatIfDisabled } : e
    ))
  }, [])

  const handleAddEvent = useCallback((event: WhatIfEvent) => {
    setEvents(prev => [...prev, event])
  }, [])

  const handleRemoveEvent = useCallback((id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id))
  }, [])

  // ── Active events (for simulation) ────────────────────────
  const activeEvents = useMemo(() =>
    events.filter(e => !e.whatIfDisabled),
    [events]
  )

  // ── Derived baseline values (snapshot of real data) ──────
  const baseline = useMemo<WhatIfOverrides | null>(() => {
    if (!input) return null
    const savingsRate = input.monthlyIncome > 0
      ? Math.round(((input.monthlyIncome - input.monthlyExpenses) / input.monthlyIncome) * 100)
      : 0
    return {
      monthlyIncome: Math.round(input.monthlyIncome),
      workDaysPerWeek: 5,
      savingsRate: Math.max(0, Math.min(80, savingsRate)),
      expectedReturn: DEFAULT_RETURN * 100,
      extraContribution: 0,
    }
  }, [input])

  // ── Compute what-if HorizonInput from overrides ──────────
  const whatIfInput = useMemo<HorizonInput | null>(() => {
    if (!input || !overrides || !baseline) return null

    // Apply income from slider, adjusted proportionally by work days (5 = full-time)
    const adjustedIncome = overrides.monthlyIncome * (overrides.workDaysPerWeek / 5)

    // Apply savings rate to derive expenses
    const adjustedExpenses = adjustedIncome * (1 - overrides.savingsRate / 100)

    // Monthly contributions = base + extra
    const adjustedContributions = input.monthlyContributions + overrides.extraContribution

    return {
      ...input,
      monthlyIncome: adjustedIncome,
      monthlyExpenses: adjustedExpenses,
      monthlyContributions: adjustedContributions,
      expectedReturn: overrides.expectedReturn / 100,
    }
  }, [input, overrides, baseline])

  // ── Run baseline simulation ──────────────────────────────
  const baselineSim = useMemo<{ result: SimResult; cashflows: SimCashflow[] } | null>(() => {
    if (!input) return null

    const currentAge = input.dateOfBirth ? ageAtDate(input.dateOfBirth) : null
    if (currentAge === null) return null

    const currentPortfolio = Math.max(0, input.totalAssets - input.totalDebts)
    const yearlyExpenses = input.yearlyMustExpenses > 0 ? input.yearlyMustExpenses : 0
    if (yearlyExpenses <= 0) return null

    const annualSavings = (input.monthlyContributions ?? 0) * 12
    const strategyForSim = fireStrategy ?? { strategy: 'deplete' as const, endAge: 90, legacyAmount: 0 }
    const cashflows = lifeEventsToCashflows(activeEvents)

    const result = runSimulation(
      currentAge,
      strategyForSim.endAge,
      currentPortfolio,
      yearlyExpenses,
      annualSavings,
      DEFAULT_RETURN,
      'nl_box3',
      INFLATION,
      cashflows,
      strategyForSim,
    )

    return { result, cashflows }
  }, [input, activeEvents, fireStrategy])

  // ── Run what-if simulation ───────────────────────────────
  const whatIfSim = useMemo<{ result: SimResult; cashflows: SimCashflow[] } | null>(() => {
    if (!whatIfInput) return null

    const currentAge = whatIfInput.dateOfBirth ? ageAtDate(whatIfInput.dateOfBirth) : null
    if (currentAge === null) return null

    const currentPortfolio = Math.max(0, whatIfInput.totalAssets - whatIfInput.totalDebts)
    const yearlyExpenses = whatIfInput.yearlyMustExpenses > 0 ? whatIfInput.yearlyMustExpenses : 0
    if (yearlyExpenses <= 0) return null

    // Use what-if savings: income adjusted by sliders
    const adjustedSavings = (whatIfInput.monthlyIncome - whatIfInput.monthlyExpenses) * 12
    const annualSavings = Math.max(0, adjustedSavings) + (overrides?.extraContribution ?? 0) * 12
    const grossReturn = whatIfInput.expectedReturn ?? DEFAULT_RETURN
    const strategyForSim = fireStrategy ?? { strategy: 'deplete' as const, endAge: 90, legacyAmount: 0 }
    const cashflows = lifeEventsToCashflows(activeEvents)

    const result = runSimulation(
      currentAge,
      strategyForSim.endAge,
      currentPortfolio,
      yearlyExpenses,
      annualSavings,
      grossReturn,
      'nl_box3',
      INFLATION,
      cashflows,
      strategyForSim,
    )

    return { result, cashflows }
  }, [whatIfInput, activeEvents, fireStrategy, overrides?.extraContribution])

  // ── Impact computation (per-event FIRE delta) ──────────────
  const computeImpact = useCallback((eventId: string) => {
    if (!whatIfInput || !fireStrategy) return null

    const event = events.find(e => e.id === eventId)
    if (!event) return null

    const currentAge = whatIfInput.dateOfBirth ? ageAtDate(whatIfInput.dateOfBirth) : null
    if (currentAge === null) return null

    const currentPortfolio = Math.max(0, whatIfInput.totalAssets - whatIfInput.totalDebts)
    const yearlyExpenses = whatIfInput.yearlyMustExpenses > 0 ? whatIfInput.yearlyMustExpenses : 0
    if (yearlyExpenses <= 0) return null

    const adjustedSavings = (whatIfInput.monthlyIncome - whatIfInput.monthlyExpenses) * 12
    const annualSavings = Math.max(0, adjustedSavings) + (overrides?.extraContribution ?? 0) * 12
    const grossReturn = whatIfInput.expectedReturn ?? DEFAULT_RETURN
    const strategyForSim = fireStrategy ?? { strategy: 'deplete' as const, endAge: 90, legacyAmount: 0 }

    // Simulate WITH this event (all active events)
    const eventsWithThis = activeEvents.some(e => e.id === eventId)
      ? activeEvents
      : [...activeEvents, event]
    const cfWith = lifeEventsToCashflows(eventsWithThis)
    const simWith = runSimulation(currentAge, strategyForSim.endAge, currentPortfolio, yearlyExpenses, annualSavings, grossReturn, 'nl_box3', INFLATION, cfWith, strategyForSim)

    // Simulate WITHOUT this event
    const eventsWithout = activeEvents.filter(e => e.id !== eventId)
    const cfWithout = lifeEventsToCashflows(eventsWithout)
    const simWithout = runSimulation(currentAge, strategyForSim.endAge, currentPortfolio, yearlyExpenses, annualSavings, grossReturn, 'nl_box3', INFLATION, cfWithout, strategyForSim)

    // Calculate total cost of the event
    const oneTimeCost = Number(event.one_time_cost ?? 0)
    const monthlyCost = Number(event.monthly_cost_change ?? 0)
    const monthlyIncome = Number(event.monthly_income_change ?? 0)
    const duration = Number(event.duration_months ?? 0) || 240 // assume 20yr if no duration
    const totalCost = oneTimeCost + (monthlyCost - monthlyIncome) * (Number(event.duration_months ?? 0) > 0 ? duration : 0)

    const fireAgeWith = simWith.fireAgeFractional
    const fireAgeWithout = simWithout.fireAgeFractional

    let deltaMonths: number | null = null
    if (fireAgeWith !== null && fireAgeWithout !== null) {
      deltaMonths = Math.round((fireAgeWith - fireAgeWithout) * 12)
    }

    return { event, fireAgeWith, fireAgeWithout, deltaMonths, totalCost }
  }, [whatIfInput, events, activeEvents, fireStrategy, overrides?.extraContribution])

  // ── Derived values for display ───────────────────────────
  const currentAge = input?.dateOfBirth ? ageAtDate(input.dateOfBirth) : null
  const baselineFireAge = baselineSim?.result.fireAgeFractional ?? null
  const whatIfFireAge = whatIfSim?.result.fireAgeFractional ?? null
  const fireAgeDelta = baselineFireAge !== null && whatIfFireAge !== null
    ? whatIfFireAge - baselineFireAge
    : null

  // ── Loading state ────────────────────────────────────────
  if (loading) {
    return (
      <div className="whatif-dimension min-h-screen">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:px-8">
          <WhatIfHeader />
          <div className="mt-12 flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="h-6 w-6 animate-spin text-wil-500" />
            <p className="font-sans text-sm text-[var(--ink-3)]">Scenario laden...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !input || !overrides || !baseline) {
    return (
      <div className="whatif-dimension min-h-screen">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 md:px-8">
          <WhatIfHeader />
          <div className="mt-12 flex flex-col items-center gap-3 py-20">
            <AlertTriangle className="h-6 w-6 text-kern-500" />
            <p className="font-sans text-sm text-[var(--ink-2)]">{error ?? 'Geen data beschikbaar.'}</p>
          </div>
        </div>
      </div>
    )
  }

  const simResult = whatIfSim?.result ?? null
  const simCashflows = whatIfSim?.cashflows ?? []

  return (
    <div className="whatif-dimension min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:px-8">

        {/* ── Header ────────────────────────────────────────── */}
        <WhatIfHeader />

        {/* ── KPI summary strip ─────────────────────────────── */}
        {simResult && (
          <div className="animate-whatif-enter mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" style={{ animationDelay: '100ms' }}>
            {/* FIRE leeftijd */}
            <div className="card-editorial p-3">
              <div className="flex items-center gap-1.5">
                <Hourglass className="h-3.5 w-3.5 text-horizon-500" />
                <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                  FIRE leeftijd
                </span>
              </div>
              <p className="mt-1 font-mono text-base tabular-nums text-[var(--ink)]">
                {whatIfFireAge !== null ? formatFireAge(whatIfFireAge) : '—'}
              </p>
              {fireAgeDelta !== null && Math.abs(fireAgeDelta) > 0.1 && (
                <p className={`mt-0.5 font-mono text-[11px] ${fireAgeDelta < 0 ? 'text-horizon-700' : 'text-kern-700'}`}>
                  {fireAgeDelta < 0 ? '' : '+'}{fireAgeDelta.toFixed(1)} jaar
                </p>
              )}
            </div>

            {/* Doelbedrag */}
            <div className="card-editorial p-3">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-horizon-500" />
                <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                  Doelbedrag
                </span>
              </div>
              <p className="mt-1 font-mono text-lg tabular-nums text-[var(--ink)]">
                {formatCurrency(simResult.requiredFirePortfolio)}
              </p>
            </div>

            {/* Jaarlijkse besparing */}
            <div className="card-editorial p-3">
              <div className="flex items-center gap-1.5">
                <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                  Jaarlijks sparen
                </span>
              </div>
              <p className="mt-1 font-mono text-lg tabular-nums text-[var(--ink)]">
                {formatCurrency(
                  (whatIfInput?.monthlyIncome ?? 0) - (whatIfInput?.monthlyExpenses ?? 0) > 0
                    ? ((whatIfInput?.monthlyIncome ?? 0) - (whatIfInput?.monthlyExpenses ?? 0)) * 12
                    : 0
                )}
              </p>
            </div>

            {/* Strategie */}
            <div className="card-editorial p-3">
              <div className="flex items-center gap-1.5">
                <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                  Strategie
                </span>
              </div>
              <p className="mt-1 font-sans text-sm font-medium text-[var(--ink-2)]">
                {STRATEGY_LABELS[simResult.strategy].name}
              </p>
            </div>
          </div>
        )}

        {/* ── SimChart (hero) ───────────────────────────────── */}
        {simResult && (
          <section
            className="animate-whatif-enter mt-6 card-editorial overflow-hidden"
            style={{ animationDelay: '200ms' }}
          >
            {/* 6px horizon-accent top border */}
            <div className="h-1.5 bg-horizon-500" />

            <div className="p-4 sm:p-6">
              {!simResult.fireReachable && (
                <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-orange-300 bg-orange-50/60 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  <p className="font-sans text-[12px] text-orange-700">
                    FIRE niet bereikbaar voor leeftijd {simResult.displayEndAge} — pas je scenario aan.
                  </p>
                </div>
              )}

              <div className="-mx-4 sm:-mx-6 overflow-hidden">
                <SimChart
                  rows={simResult.rows}
                  fireAge={simResult.fireAge}
                  fireAgeFractional={simResult.fireAgeFractional}
                  currentAge={currentAge ?? 30}
                  endAge={simResult.displayEndAge}
                  cashflows={simCashflows}
                  fireTarget={simResult.requiredFirePortfolio}
                  strategy={simResult.strategy}
                  targetEndPortfolio={simResult.targetEndPortfolio}
                  baselineRows={baselineSim?.result.rows}
                />
              </div>

              {/* Cashflow pills */}
              {simCashflows.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {simCashflows.map(cf => (
                    <span
                      key={cf.id}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-sans text-[10px] font-medium ${
                        cf.direction === 'income'
                          ? 'border-horizon-200 bg-horizon-50 text-horizon-700'
                          : 'border-kern-200 bg-kern-50/60 text-kern-700'
                      }`}
                    >
                      {cf.direction === 'income' ? '↑' : '↓'}{' '}
                      {cf.name} (leeftijd {cf.fromAge})
                    </span>
                  ))}
                </div>
              )}

              {/* Legend: ghost-line + what-if */}
              <div className="mt-3 flex items-center gap-4 font-sans text-[10px] text-[var(--ink-4)]">
                <span className="flex items-center gap-1.5">
                  <svg width="20" height="2" aria-hidden="true">
                    <line x1="0" y1="1" x2="20" y2="1" stroke="var(--ink-4)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />
                  </svg>
                  Huidige realiteit
                </span>
                <span className="flex items-center gap-1.5">
                  <svg width="20" height="2" aria-hidden="true">
                    <line x1="0" y1="1" x2="20" y2="1" stroke="var(--hor-t, #8a6e42)" strokeWidth="2.5" />
                  </svg>
                  Wat-als scenario
                </span>
              </div>
            </div>
          </section>
        )}

        {/* ── Sliders ───────────────────────────────────────── */}
        <div className="animate-whatif-enter mt-4" style={{ animationDelay: '300ms' }}>
          <WhatIfSliders
            overrides={overrides}
            baseline={baseline}
            onChange={setOverrides}
          />
        </div>

        {/* ── Life Events ─────────────────────────────────── */}
        <div className="animate-whatif-enter mt-4" style={{ animationDelay: '400ms' }}>
          <WhatIfEventsPanel
            events={events}
            onToggleEvent={handleToggleEvent}
            onAddEvent={handleAddEvent}
            onRemoveEvent={handleRemoveEvent}
            baselineFireAge={baselineFireAge}
            computeImpact={computeImpact}
          />
        </div>

        {/* ── Footer ────────────────────────────────────────── */}
        <p className="mt-6 pb-8 text-center font-sans text-[10px] text-[var(--ink-4)]">
          Dit is een simulatie — geen financieel advies. Werkelijke resultaten kunnen afwijken.
        </p>
      </div>
    </div>
  )
}

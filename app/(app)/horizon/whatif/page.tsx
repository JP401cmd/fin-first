'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import {
  type FinancialInput,
  ageAtDate,
  DEFAULT_RETURN,
  INFLATION,
  formatFireAge,
  formatFireAgeShort,
  formatFireAgeDelta,
} from '@/lib/horizon-data'
import {
  runSimulation,
  lifeEventsToCashflows,
  type SimResult,
  type SimCashflow,
} from '@/lib/fire-simulation'
import { computeYearlyMustExpenses, computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import { parseFireStrategy, type FireStrategyConfig, STRATEGY_LABELS } from '@/lib/fire-strategy'
import { SimChart } from '@/components/app/horizon/sim-chart'
import { WhatIfHeader } from '@/components/app/horizon/whatif-header'
import { WhatIfSliders, type WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'
import { WhatIfEventsPanel, type WhatIfEvent } from '@/components/app/horizon/whatif-events'
import { WhatIfActions } from '@/components/app/horizon/whatif-actions'
import { WhatIfPresets } from '@/components/app/horizon/whatif-presets'
import { WhatIfChat } from '@/components/app/horizon/whatif-chat'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { Loader2, AlertTriangle, ArrowRight, ChevronRight } from 'lucide-react'

// ── Page ────────────────────────────────────────────────────────────────────

export default function WhatIfPage() {
  // ── Dream gate detection ──────────────────────────────────
  const searchParams = useSearchParams()
  const viaDreamgate = useRef(searchParams.get('via') === 'dreamgate')

  // Clean up the ?via=dreamgate query param after mount
  useEffect(() => {
    if (viaDreamgate.current) {
      window.history.replaceState(null, '', '/horizon/whatif')
    }
  }, [])

  // ── Base data state ──────────────────────────────────────
  const [input, setInput] = useState<FinancialInput | null>(null)
  const [events, setEvents] = useState<WhatIfEvent[]>([])
  const [fireStrategy, setFireStrategy] = useState<FireStrategyConfig | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── What-If overrides ────────────────────────────────────
  const [overrides, setOverrides] = useState<WhatIfOverrides | null>(null)

  // ── BottomSheet for full comparison ─────────────────────
  const [comparisonOpen, setComparisonOpen] = useState(false)

  // ── Set Will's auto-open message for the global chat FAB ──
  const { setAutoOpenMessage } = useChatContext()

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

      const horizonInput: FinancialInput = {
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

  // ── Compute what-if FinancialInput from overrides ──────────
  const whatIfInput = useMemo<FinancialInput | null>(() => {
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

  // Annual savings for scenario summary
  const whatIfAnnualSavings = whatIfInput
    ? Math.max(0, (whatIfInput.monthlyIncome - whatIfInput.monthlyExpenses) * 12) + (overrides?.extraContribution ?? 0) * 12
    : 0
  const baselineAnnualSavings = input
    ? Math.max(0, (input.monthlyIncome - input.monthlyExpenses) * 12)
    : 0

  // ── Scenario key for SimChart animation replay ─────────
  const scenarioKey = useMemo(() => {
    if (!overrides) return 'default'
    return `${overrides.monthlyIncome}-${overrides.workDaysPerWeek}-${overrides.savingsRate}-${overrides.expectedReturn}-${overrides.extraContribution}-${activeEvents.length}`
  }, [overrides, activeEvents.length])

  // ── Build scenario context for Will's global chat (debounced) ──
  const autoOpenTimerRef = useRef<ReturnType<typeof setTimeout>>(null)
  useEffect(() => {
    if (!overrides || !baseline || !input) {
      setAutoOpenMessage(null)
      return () => setAutoOpenMessage(null)
    }

    // Debounce: only update context after 500ms of slider inactivity
    if (autoOpenTimerRef.current) clearTimeout(autoOpenTimerRef.current)
    autoOpenTimerRef.current = setTimeout(() => {
      const scenarioEvents = events.filter(e => !e.whatIfDisabled)
      const eventsDesc = scenarioEvents.length > 0
        ? scenarioEvents.map(e => {
            const parts = [e.name]
            if (e.target_age) parts.push(`leeftijd ${e.target_age}`)
            if (Number(e.one_time_cost) > 0) parts.push(formatCurrency(Number(e.one_time_cost)) + ' eenmalig')
            if (Number(e.monthly_cost_change) !== 0) parts.push(formatCurrency(Number(e.monthly_cost_change)) + '/mnd')
            return parts.join(', ')
          }).join('; ')
        : 'geen'

      const lines = [
        'Ik zit op de Wat-Als scenario pagina. Hier is mijn scenario:',
        '',
        `Werkelijkheid: FIRE op ${baselineFireAge !== null ? Math.floor(baselineFireAge) + ' jaar' : 'onbekend'}, ` +
          `${formatCurrency(baselineAnnualSavings)}/jr sparen, ` +
          `inkomen ${formatCurrency(baseline.monthlyIncome)}/mnd`,
        '',
        `Mijn wat-als scenario: inkomen ${formatCurrency(overrides.monthlyIncome)}/mnd, ` +
          `${overrides.workDaysPerWeek} werkdagen/week, ` +
          `spaarquote ${Math.round(overrides.savingsRate)}%, ` +
          `rendement ${overrides.expectedReturn.toFixed(1)}%` +
          (overrides.extraContribution > 0 ? `, extra inleg ${formatCurrency(overrides.extraContribution)}/mnd` : ''),
        '',
        `Resultaat: FIRE op ${whatIfFireAge !== null ? Math.floor(whatIfFireAge) + ' jaar' : 'onbereikbaar'}` +
          (fireAgeDelta !== null && Math.abs(fireAgeDelta) > 0.1
            ? ` (${formatFireAgeDelta(fireAgeDelta)} verschil)`
            : '') +
          `, ${formatCurrency(whatIfAnnualSavings)}/jr sparen`,
        '',
        `Levensgebeurtenissen in scenario: ${eventsDesc}`,
        '',
        'Help me met concrete acties die ik nu kan nemen om dit scenario werkelijkheid te maken.',
      ]

      setAutoOpenMessage(lines.join('\n'))
    }, 500)

    return () => {
      if (autoOpenTimerRef.current) clearTimeout(autoOpenTimerRef.current)
      setAutoOpenMessage(null)
    }
  }, [
    setAutoOpenMessage, overrides, baseline, input, events,
    baselineFireAge, whatIfFireAge, fireAgeDelta,
    baselineAnnualSavings, whatIfAnnualSavings,
  ])

  // Class for the dimension wrapper — skip own veil when arriving via dream gate
  const dimensionClass = viaDreamgate.current
    ? 'whatif-dimension whatif-dimension--no-veil min-h-screen'
    : 'whatif-dimension min-h-screen'

  // ── Loading state ────────────────────────────────────────
  if (loading) {
    return (
      <div className={dimensionClass}>
        <div className="whatif-world mx-auto max-w-5xl px-4 py-8 sm:px-6 md:px-8">
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
      <div className={dimensionClass}>
        <div className="whatif-world mx-auto max-w-5xl px-4 py-8 sm:px-6 md:px-8">
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

  // ── Shared chart + KPI blocks (rendered in both mobile & desktop positions) ──

  const heroKpiStrip = simResult && baselineSim && (
    <button
      type="button"
      onClick={() => setComparisonOpen(true)}
      className="card-editorial w-full overflow-hidden text-left transition-all hover:border-wil-300 hover:shadow-sm"
    >
      <div className="flex h-[3px]">
        <div className="flex-1 bg-[var(--ink-3)]" />
        <div className="flex-1 bg-wil-500" />
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
            FIRE leeftijd
          </span>
          <p className="font-display text-2xl font-bold tabular-nums text-[var(--ink)]">
            {formatFireAgeShort(whatIfFireAge)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {fireAgeDelta !== null && Math.abs(fireAgeDelta) > 0.1 && (
            <span className={`rounded-full px-2.5 py-1 font-mono text-sm font-semibold ${
              fireAgeDelta < 0 ? 'bg-horizon-50 text-horizon-700' : 'bg-kern-50 text-kern-700'
            }`}>
              {formatFireAgeDelta(fireAgeDelta)}
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-[var(--ink-4)]" />
        </div>
      </div>
    </button>
  )

  const simChartBlock = simResult && (
    <section className="card-editorial overflow-hidden">
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

        <div className="-mx-4 sm:-mx-6 min-h-[220px] overflow-hidden">
          <SimChart
            key={scenarioKey}
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
            baselineFireAge={baselineFireAge}
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

        {/* Legend */}
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
  )

  return (
    <div className={dimensionClass}>
      <div className="whatif-world mx-auto max-w-5xl px-4 py-6 sm:px-6 md:px-8">

        {/* ── Header ────────────────────────────────────────── */}
        <WhatIfHeader />

        {/* ── Hero KPI strip — mobile only ───────────────────── */}
        <div className="lg:hidden">
          {heroKpiStrip}
        </div>

        {/* ── Two-column layout on desktop ────────────────────── */}
        <div className="mt-4 lg:grid lg:grid-cols-[1fr_480px] lg:gap-6">

          {/* ── Left column: controls ──────────────────────────── */}
          <div className="min-w-0 space-y-4">

            {/* Presets in card-editorial */}
            <div className="card-editorial overflow-hidden">
              <div className="h-[3px] bg-wil-500" />
              <div className="px-4 py-3">
                <p className="mb-2.5 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-wil-600">
                  Snelle scenario&apos;s
                </p>
                <WhatIfPresets
                  baseline={baseline}
                  overrides={overrides}
                  onChange={setOverrides}
                />
              </div>
            </div>

            {/* Sliders */}
            <WhatIfSliders
              overrides={overrides}
              baseline={baseline}
              onChange={setOverrides}
            />

            {/* SimChart — mobile only (between sliders and events) */}
            <div className="lg:hidden">
              {simChartBlock}
            </div>

            {/* Life Events */}
            <WhatIfEventsPanel
              events={events}
              onToggleEvent={handleToggleEvent}
              onAddEvent={handleAddEvent}
              onRemoveEvent={handleRemoveEvent}
              baselineFireAge={baselineFireAge}
              computeImpact={computeImpact}
            />

            {/* Scenario Actions */}
            <WhatIfActions
              overrides={overrides}
              baseline={baseline}
              baselineFireAge={baselineFireAge}
              whatIfFireAge={whatIfFireAge}
              whatIfAnnualSavings={whatIfAnnualSavings}
              baselineAnnualSavings={baselineAnnualSavings}
            />

            {/* Chat */}
            <WhatIfChat
              onAddEvent={handleAddEvent}
            />

            {/* Footer */}
            <p className="pb-8 pt-2 text-center font-sans text-[10px] text-[var(--ink-4)]">
              Dit is een simulatie — geen financieel advies. Werkelijke resultaten kunnen afwijken.
            </p>
          </div>

          {/* ── Right column: sticky output (desktop only) ──────── */}
          <div className="hidden lg:block">
            <div className="sticky top-4 space-y-4">
              {heroKpiStrip}
              {simChartBlock}
            </div>
          </div>
        </div>

        {/* ── BottomSheet: full comparison (kassabon) ────────── */}
        {simResult && baselineSim && (
          <BottomSheet
            open={comparisonOpen}
            onClose={() => setComparisonOpen(false)}
            title="Scenariovergelijking"
          >
            <div className="p-5">
              <KassabonShell>
                {/* Header */}
                <div className="mb-3 text-center">
                  <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    SCENARIOVERGELIJKING
                  </p>
                  <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                    Werkelijkheid vs. Wat-als scenario
                  </p>
                </div>

                {/* Column headers */}
                <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3">
                  <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Werkelijkheid
                  </span>
                  <span className="w-4" />
                  <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-wil-600">
                    Wat-als
                  </span>
                </div>

                {/* Comparison rows */}
                <div className="space-y-1">
                  <ComparisonRow
                    label="FIRE leeftijd"
                    baseValue={formatFireAge(baselineFireAge)}
                    whatIfValue={formatFireAge(whatIfFireAge)}
                    delta={fireAgeDelta !== null && Math.abs(fireAgeDelta) > 0.1
                      ? formatFireAgeDelta(fireAgeDelta)
                      : null}
                    isPositive={fireAgeDelta !== null ? fireAgeDelta < 0 : null}
                  />

                  <ComparisonRow
                    label="Doelbedrag"
                    baseValue={formatCurrency(baselineSim.result.requiredFirePortfolio)}
                    whatIfValue={formatCurrency(simResult.requiredFirePortfolio)}
                    delta={
                      Math.abs(simResult.requiredFirePortfolio - baselineSim.result.requiredFirePortfolio) > 100
                        ? formatCurrency(simResult.requiredFirePortfolio - baselineSim.result.requiredFirePortfolio)
                        : null
                    }
                    isPositive={simResult.requiredFirePortfolio < baselineSim.result.requiredFirePortfolio}
                  />

                  <ComparisonRow
                    label="Jaarlijks sparen"
                    baseValue={formatCurrency(baselineAnnualSavings) + '/jr'}
                    whatIfValue={formatCurrency(whatIfAnnualSavings) + '/jr'}
                    delta={
                      Math.abs(whatIfAnnualSavings - baselineAnnualSavings) > 100
                        ? `${whatIfAnnualSavings > baselineAnnualSavings ? '+' : ''}${formatCurrency(whatIfAnnualSavings - baselineAnnualSavings)}`
                        : null
                    }
                    isPositive={whatIfAnnualSavings > baselineAnnualSavings}
                  />
                </div>

                {/* Strategie */}
                <div className="mt-2 border-t-2 border-[var(--ink)] pt-2">
                  <div className="flex justify-between">
                    <span className="font-sans text-xs text-[var(--ink-3)]">Strategie</span>
                    <span className="font-sans text-xs font-medium text-[var(--ink)]">
                      {STRATEGY_LABELS[simResult.strategy].name}
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
                  Gebaseerd op huidige data en scenariosliders
                </p>
              </KassabonShell>
            </div>
          </BottomSheet>
        )}
      </div>
    </div>
  )
}

// ── ComparisonRow ────────────────────────────────────────────────────────────

function ComparisonRow({
  label,
  baseValue,
  whatIfValue,
  delta,
  isPositive,
}: {
  label: string
  baseValue: string
  whatIfValue: string
  delta: string | null
  isPositive: boolean | null
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 border-t border-dashed border-[var(--border-ed)] pt-2">
      {/* Baseline */}
      <div>
        <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">{label}</span>
        <p className="font-mono text-sm tabular-nums text-[var(--ink-3)]">{baseValue}</p>
      </div>

      {/* Arrow */}
      <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-4)]" />

      {/* What-if + delta */}
      <div>
        <p className="font-mono text-sm font-medium tabular-nums text-[var(--ink)]">{whatIfValue}</p>
        {delta && (
          <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium ${
            isPositive
              ? 'bg-horizon-50 text-horizon-700'
              : 'bg-kern-50 text-kern-700'
          }`}>
            {delta}
          </span>
        )}
      </div>
    </div>
  )
}

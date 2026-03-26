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
  LIFE_EVENT_CATALOG,
} from '@/lib/horizon-data'
import { resolveFireParams } from '@/lib/fire-params'
import { lookupAowAge, type AowLeeftijdRow, type AowAge } from '@/lib/aow-leeftijd'
import {
  runSimulation,
  lifeEventsToCashflows,
  type SimResult,
  type SimCashflow,
} from '@/lib/fire-simulation'
import { computeYearlyMustExpenses, computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import { parseFireStrategy, type FireStrategyConfig, STRATEGY_LABELS } from '@/lib/fire-strategy'
import { SimChart } from '@/components/app/horizon/sim-chart'
import { ZoomableChartContainer } from '@/components/app/horizon/zoomable-chart-container'
import { EventsTimeline } from '@/components/app/horizon/events-timeline'
import { WhatIfHeader } from '@/components/app/horizon/whatif-header'
import { WhatIfSliders, type WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'
import { applyWhatIfOverrides, buildBaselineOverrides } from '@/lib/whatif-overrides'
import { WhatIfEventsPanel, type WhatIfEvent } from '@/components/app/horizon/whatif-events'
import { type SuggestedEvent } from '@/components/app/horizon/whatif-suggestion-cards'
import { useWhatIfSuggestions } from '@/lib/hooks/use-whatif-suggestions'
import { usePerspective } from '@/components/app/perspective-provider'
import { WhatIfActions } from '@/components/app/horizon/whatif-actions'
import { WhatIfPresets } from '@/components/app/horizon/whatif-presets'
import { WhatIfChat, type WhatIfScenarioContext } from '@/components/app/horizon/whatif-chat'
import { WhatIfScenarios } from '@/components/app/horizon/whatif-scenarios'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { useChatContext } from '@/components/app/chat/chat-provider'
import { Loader2, AlertTriangle, ArrowRight, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react'
import { IncomeExpenseChart } from '@/components/app/horizon/income-expense-chart'
import { WealthCompositionChart } from '@/components/app/horizon/wealth-composition-chart'
import { type StackedRow } from '@/lib/wealth-composition'
import { buildBreakdownFromSimRows } from '@/lib/income-expense-breakdown'

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

  // ── Household context ───────────────────────────────────
  const { isHousehold } = usePerspective()

  // ── Base data state ──────────────────────────────────────
  const [input, setInput] = useState<FinancialInput | null>(null)
  const [events, setEvents] = useState<WhatIfEvent[]>([])
  const [fireStrategy, setFireStrategy] = useState<FireStrategyConfig | undefined>(undefined)
  const [userGrossReturn, setUserGrossReturn] = useState(DEFAULT_RETURN)
  const [userInflation, setUserInflation] = useState(INFLATION)
  const [userAowAge, setUserAowAge] = useState<AowAge>({ years: 67, months: 0, fractional: 67, isDefinitive: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── What-If overrides ────────────────────────────────────
  const [overrides, setOverrides] = useState<WhatIfOverrides | null>(null)

  // ── BottomSheet for full comparison ─────────────────────
  const [comparisonOpen, setComparisonOpen] = useState(false)

  // ── Chart mode + view mode ──────────────────────────
  const [chartMode, setChartMode] = useState<'vermogenspad' | 'vermogensopbouw'>('vermogenspad')
  const [ieExpanded, setIeExpanded] = useState(typeof window !== 'undefined' && window.innerWidth >= 768)
  const [ieViewMode, setIeViewMode] = useState<'lines' | 'breakdown'>('lines')

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
        supabase.from('profiles').select('date_of_birth, retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount, expected_return, inflation_rate').single(),
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

      // Use fire-settings API which handles app_settings fallback for pensioen
      try {
        const fsRes = await fetch('/api/fire-settings')
        if (fsRes.ok) {
          const fsData = await fsRes.json()
          setFireStrategy({
            strategy: (['perpetual', 'legacy', 'deplete', 'pensioen'].includes(fsData.fire_end_strategy) ? fsData.fire_end_strategy : 'deplete') as FireStrategyConfig['strategy'],
            endAge: fsData.fire_end_age ?? 90,
            legacyAmount: Number(fsData.fire_legacy_amount ?? 0),
          })
        } else {
          setFireStrategy(parseFireStrategy(profileResult.data ?? {}))
        }
      } catch {
        setFireStrategy(parseFireStrategy(profileResult.data ?? {}))
      }

      // AOW-leeftijd ophalen op basis van geboortedatum
      try {
        const aowRes = await supabase
          .from('aow_leeftijd')
          .select('id, birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source')
          .order('birth_date_from', { ascending: true })
        if (aowRes.data && aowRes.data.length > 0) {
          setUserAowAge(lookupAowAge(aowRes.data as AowLeeftijdRow[], dob))
        }
      } catch {
        // Non-critical — fallback to 67
      }

      // Resolve user's FIRE parameters (expected_return + inflation_rate)
      const fireParams = resolveFireParams(profileResult.data ?? {})
      setUserGrossReturn(fireParams.grossReturn)
      setUserInflation(fireParams.inflationRate)

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
        expectedReturn: fireParams.grossReturn * 100, // as percentage, from user profile
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

  const handleEditEvent = useCallback((id: string, updated: WhatIfEvent) => {
    setEvents(prev => prev.map(e => e.id === id ? updated : e))
  }, [])

  // ── Load saved scenario ────────────────────────────────────
  const handleLoadScenario = useCallback((loadedOverrides: WhatIfOverrides, loadedEvents: WhatIfEvent[]) => {
    setOverrides(loadedOverrides)
    setEvents(loadedEvents)
  }, [])

  // ── Active events (for simulation) ────────────────────────
  const activeEvents = useMemo(() =>
    events.filter(e => !e.whatIfDisabled),
    [events]
  )

  // ── Derived baseline values (snapshot of real data) ──────
  const baseline = useMemo<WhatIfOverrides | null>(() => {
    if (!input) return null
    return buildBaselineOverrides(input, userGrossReturn)
  }, [input, userGrossReturn])

  // ── Compute what-if FinancialInput + annual savings from overrides ──────────
  const { adjustedInput: whatIfInput, annualSavings: whatIfAnnualSavings_sim } = useMemo(() => {
    if (!input || !overrides || !baseline) return { adjustedInput: null as FinancialInput | null, annualSavings: 0 }
    return applyWhatIfOverrides(input, overrides, baseline)
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

    let result = runSimulation(
      currentAge,
      strategyForSim.endAge,
      currentPortfolio,
      yearlyExpenses,
      annualSavings,
      userGrossReturn,
      'nl_box3',
      userInflation,
      cashflows,
      strategyForSim,
    )

    // Pensioen-modus override: use AOW age as FIRE age
    if (strategyForSim.strategy === 'pensioen') {
      const aowAge = userAowAge.fractional
      const aowAgeInt = Math.floor(aowAge)
      const rowAtAow = result.rows.find(r => r.age === aowAgeInt)
      result = {
        ...result,
        fireAgeFractional: aowAge,
        fireAge: aowAgeInt,
        requiredFirePortfolio: rowAtAow?.endPortfolio ?? result.requiredFirePortfolio,
        fireReachable: true,
      }
    }

    return { result, cashflows }
  }, [input, activeEvents, fireStrategy, userGrossReturn, userInflation, userAowAge])

  // ── Run what-if simulation ───────────────────────────────
  const whatIfSim = useMemo<{ result: SimResult; cashflows: SimCashflow[] } | null>(() => {
    if (!whatIfInput) return null

    const currentAge = whatIfInput.dateOfBirth ? ageAtDate(whatIfInput.dateOfBirth) : null
    if (currentAge === null) return null

    const currentPortfolio = Math.max(0, whatIfInput.totalAssets - whatIfInput.totalDebts)
    const yearlyExpenses = whatIfInput.yearlyMustExpenses > 0 ? whatIfInput.yearlyMustExpenses : 0
    if (yearlyExpenses <= 0) return null

    // Delta-based savings: identical to horizon at entry, continuous delta on slider change
    const annualSavings = whatIfAnnualSavings_sim
    const grossReturn = whatIfInput.expectedReturn ?? userGrossReturn
    const strategyForSim = fireStrategy ?? { strategy: 'deplete' as const, endAge: 90, legacyAmount: 0 }
    const cashflows = lifeEventsToCashflows(activeEvents)

    let result = runSimulation(
      currentAge,
      strategyForSim.endAge,
      currentPortfolio,
      yearlyExpenses,
      annualSavings,
      grossReturn,
      'nl_box3',
      userInflation,
      cashflows,
      strategyForSim,
    )

    // Pensioen-modus override: use AOW age as FIRE age
    if (strategyForSim.strategy === 'pensioen') {
      const aowAge = userAowAge.fractional
      const aowAgeInt = Math.floor(aowAge)
      const rowAtAow = result.rows.find(r => r.age === aowAgeInt)
      result = {
        ...result,
        fireAgeFractional: aowAge,
        fireAge: aowAgeInt,
        requiredFirePortfolio: rowAtAow?.endPortfolio ?? result.requiredFirePortfolio,
        fireReachable: true,
      }
    }

    return { result, cashflows }
  }, [whatIfInput, activeEvents, fireStrategy, whatIfAnnualSavings_sim, userGrossReturn, userInflation, userAowAge])

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

    const annualSavings = whatIfAnnualSavings_sim
    const grossReturn = whatIfInput.expectedReturn ?? userGrossReturn
    const strategyForSim = fireStrategy ?? { strategy: 'deplete' as const, endAge: 90, legacyAmount: 0 }

    // Simulate WITH this event (all active events)
    const eventsWithThis = activeEvents.some(e => e.id === eventId)
      ? activeEvents
      : [...activeEvents, event]
    const cfWith = lifeEventsToCashflows(eventsWithThis)
    const simWith = runSimulation(currentAge, strategyForSim.endAge, currentPortfolio, yearlyExpenses, annualSavings, grossReturn, 'nl_box3', userInflation, cfWith, strategyForSim)

    // Simulate WITHOUT this event
    const eventsWithout = activeEvents.filter(e => e.id !== eventId)
    const cfWithout = lifeEventsToCashflows(eventsWithout)
    const simWithout = runSimulation(currentAge, strategyForSim.endAge, currentPortfolio, yearlyExpenses, annualSavings, grossReturn, 'nl_box3', userInflation, cfWithout, strategyForSim)

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
  }, [whatIfInput, events, activeEvents, fireStrategy, whatIfAnnualSavings_sim, userGrossReturn, userInflation])

  // ── Derived values for display ───────────────────────────
  const currentAge = input?.dateOfBirth ? ageAtDate(input.dateOfBirth) : null
  const baselineFireAge = baselineSim?.result.fireAgeFractional ?? null
  const whatIfFireAge = whatIfSim?.result.fireAgeFractional ?? null
  const fireAgeDelta = baselineFireAge !== null && whatIfFireAge !== null
    ? whatIfFireAge - baselineFireAge
    : null

  // Annual savings for scenario summary
  const whatIfAnnualSavings = whatIfAnnualSavings_sim
  const baselineAnnualSavings = (input?.monthlyContributions ?? 0) * 12

  // ── Scenario key for SimChart animation replay ─────────
  const scenarioKey = useMemo(() => {
    if (!overrides) return 'default'
    return `${overrides.monthlyIncome}-${overrides.workDaysPerWeek}-${overrides.savingsRate}-${overrides.expectedReturn}-${overrides.extraContribution}-${activeEvents.length}`
  }, [overrides, activeEvents.length])

  // ── Wealth composition (simplified: inleg vs groei) ──────────
  const wealthCompositionRows: StackedRow[] = useMemo(() => {
    if (chartMode !== 'vermogensopbouw') return []
    const rows = whatIfSim?.result.rows
    if (!rows?.length) return []
    let cumulativeSavings = 0
    let cumulativeGrowth = 0
    return rows.map(r => {
      cumulativeSavings += r.savings
      cumulativeGrowth += r.growth
      const portfolio = r.endPortfolio
      // Split portfolio proportionally into "spaargeld" (contributions) and "beleggingen" (growth)
      const total = Math.max(1, cumulativeSavings + cumulativeGrowth)
      const savingsShare = Math.max(0, portfolio * (cumulativeSavings / total))
      const growthShare = Math.max(0, portfolio - savingsShare)
      return {
        age: r.age,
        spaargeld: savingsShare,
        beleggingen: growthShare,
        pensioen: 0,
        vastgoed: 0,
        overig: 0,
        schulden: 0,
      }
    })
  }, [chartMode, whatIfSim])

  // ── Income/Expense breakdown (from SimRow data) ──────────
  const ieBreakdownResult = useMemo(() => {
    if (ieViewMode !== 'breakdown') return null
    const rows = whatIfSim?.result.rows
    if (!rows?.length) return null
    return buildBreakdownFromSimRows(rows)
  }, [ieViewMode, whatIfSim])

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

  // ── Scenario context for WhatIfChat ──────────────────────
  const chatScenarioContext = useMemo<WhatIfScenarioContext | undefined>(() => {
    if (!overrides || !baseline) return undefined
    return {
      sliders: {
        inkomensWijziging: Math.round(overrides.monthlyIncome - baseline.monthlyIncome),
        werkdagenWijziging: Math.round((overrides.workDaysPerWeek - baseline.workDaysPerWeek) * 10) / 10,
        spaarquoteWijziging: Math.round((overrides.savingsRate - baseline.savingsRate) * 10) / 10,
        rendementWijziging: Math.round((overrides.expectedReturn - baseline.expectedReturn) * 10) / 10,
        extraInleg: overrides.extraContribution,
      },
      baselineFireAge: baselineFireAge != null ? Math.round(baselineFireAge * 10) / 10 : null,
      scenarioFireAge: whatIfFireAge != null ? Math.round(whatIfFireAge * 10) / 10 : null,
      fireDeltaMonths: fireAgeDelta != null ? Math.round(fireAgeDelta * 12) : null,
      activeEvents: activeEvents.map(ev => ({
        name: ev.name,
        event_type: ev.event_type,
        target_age: ev.target_age ?? null,
        one_time_cost: Number(ev.one_time_cost) || 0,
        monthly_cost_change: Number(ev.monthly_cost_change) || 0,
        monthly_income_change: Number(ev.monthly_income_change) || 0,
        duration_months: Number(ev.duration_months) || 0,
      })),
    }
  }, [overrides, baseline, baselineFireAge, whatIfFireAge, fireAgeDelta, activeEvents])

  // ── AI suggestions ───────────────────────────────────────
  const { suggestions, loading: suggestionsLoading, dismiss: dismissSuggestion } =
    useWhatIfSuggestions({
      overrides,
      baseline,
      fireAgeDelta,
      activeEventNames: activeEvents.map(e => e.name),
    })

  const handleAddSuggestion = useCallback((s: SuggestedEvent) => {
    handleAddEvent({
      id: crypto.randomUUID(),
      name: s.name,
      event_type: s.event_type,
      target_age: s.target_age,
      target_date: null,
      one_time_cost: s.one_time_cost,
      monthly_cost_change: s.monthly_cost_change,
      monthly_income_change: s.monthly_income_change,
      duration_months: s.duration_months,
      icon: LIFE_EVENT_CATALOG[s.event_type]?.icon ?? 'Calendar',
      is_active: true,
      sort_order: events.length,
      is_indexed: false,
      metadata: {},
    } as WhatIfEvent)
  }, [handleAddEvent, events.length])

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

  return (
    <div className={dimensionClass}>
      <div className="whatif-world mx-auto max-w-5xl px-4 py-6 sm:px-6 md:px-8">

        {/* ── Header ────────────────────────────────────────── */}
        <WhatIfHeader />

        {/* ── KPI strip (full width) ─────────────────────────── */}
        {simResult && baselineSim && (
          <button
            type="button"
            onClick={() => setComparisonOpen(true)}
            className="mt-4 card-editorial w-full overflow-hidden text-left transition-all hover:border-wil-300 hover:shadow-sm"
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
        )}

        {/* ── Full-width chart (like horizon page) ─────────────── */}
        {simResult && (
          <section className="mt-4">
            {!simResult.fireReachable && (
              <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-orange-300 bg-orange-50/60 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                <p className="font-sans text-[12px] text-orange-700">
                  FIRE niet bereikbaar voor leeftijd {simResult.displayEndAge} — pas je scenario aan.
                </p>
              </div>
            )}

            {/* ── Chart mode toggle (Pad / Opbouw) ──────────── */}
            <div className="mb-2 flex items-center justify-end gap-1">
              {(['vermogenspad', 'vermogensopbouw'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setChartMode(mode)}
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors select-none ${
                    chartMode === mode
                      ? 'border-wil-300 bg-wil-50 text-wil-700'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-wil-200 hover:text-[var(--ink-2)]'
                  }`}
                  aria-pressed={chartMode === mode}
                  style={{ minHeight: 32 }}
                >
                  {mode === 'vermogenspad' ? 'Pad' : 'Opbouw'}
                </button>
              ))}
            </div>

            <div className="-mx-4 sm:-mx-6 md:-mx-8 overflow-hidden">
              <ZoomableChartContainer currentAge={currentAge ?? 30} endAge={simResult.displayEndAge}>
                {(visibleMin, visibleMax) => (
                  <>
                    {chartMode === 'vermogenspad' ? (
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
                        dailyExpenseRate={input ? input.yearlyMustExpenses / 365 : undefined}
                        visibleMinAge={visibleMin}
                        visibleMaxAge={visibleMax}
                        aowAgeFractional={userAowAge.fractional}
                      />
                    ) : (
                      <WealthCompositionChart
                        stackedRows={wealthCompositionRows}
                        currentAge={currentAge ?? 30}
                        endAge={simResult.displayEndAge}
                        visibleMinAge={visibleMin}
                        visibleMaxAge={visibleMax}
                        fireAge={simResult.fireAge}
                        fireAgeFractional={simResult.fireAgeFractional}
                      />
                    )}
                    {events.length > 0 && (
                      <EventsTimeline
                        events={events.filter(e => !e.whatIfDisabled)}
                        currentAge={currentAge ?? 30}
                        endAge={simResult.displayEndAge}
                        visibleMinAge={visibleMin}
                        visibleMaxAge={visibleMax}
                      />
                    )}
                    {/* Vermogensstromen toggle + chart */}
                    <div className="border-t border-[var(--border-ed)]">
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => setIeExpanded(prev => !prev)}
                          className="flex flex-1 items-center justify-center gap-2 py-2.5 text-[12px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors cursor-pointer select-none"
                          style={{ minHeight: 44 }}
                          aria-expanded={ieExpanded}
                          aria-label={ieExpanded ? 'Vermogensstromen verbergen' : 'Vermogensstromen tonen'}
                        >
                          <span>Inkomen &amp; Uitgaven</span>
                          {ieExpanded
                            ? <ChevronUp size={14} />
                            : <ChevronDown size={14} />
                          }
                        </button>
                        {ieExpanded && (
                          <div className="flex items-center gap-0.5 pr-3">
                            <button
                              type="button"
                              onClick={() => setIeViewMode('lines')}
                              className={`px-3 py-2.5 text-[10px] uppercase tracking-[0.08em] font-medium transition-colors cursor-pointer ${
                                ieViewMode === 'lines'
                                  ? 'text-[var(--ink)] bg-[var(--subtle)]'
                                  : 'text-[var(--ink-4)] hover:text-[var(--ink-3)]'
                              }`}
                              style={{ minHeight: 32 }}
                            >
                              Lijnen
                            </button>
                            <button
                              type="button"
                              onClick={() => setIeViewMode('breakdown')}
                              className={`px-3 py-2.5 text-[10px] uppercase tracking-[0.08em] font-medium transition-colors cursor-pointer ${
                                ieViewMode === 'breakdown'
                                  ? 'text-[var(--ink)] bg-[var(--subtle)]'
                                  : 'text-[var(--ink-4)] hover:text-[var(--ink-3)]'
                              }`}
                              style={{ minHeight: 32 }}
                            >
                              Bronnen
                            </button>
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          maxHeight: ieExpanded ? 300 : 0,
                          overflow: 'hidden',
                          opacity: ieExpanded ? 1 : 0,
                          transition: 'max-height 0.3s ease, opacity 0.2s ease',
                        }}
                      >
                        <IncomeExpenseChart
                          rows={simResult.rows}
                          baselineRows={baselineSim?.result.rows}
                          currentAge={currentAge ?? 30}
                          endAge={simResult.displayEndAge}
                          visibleMinAge={visibleMin}
                          visibleMaxAge={visibleMax}
                          fireAge={simResult.fireAge}
                          viewMode={ieViewMode}
                          breakdownResult={ieBreakdownResult}
                        />
                      </div>
                    </div>
                  </>
                )}
              </ZoomableChartContainer>
            </div>

            {/* Legenda + cashflow pills */}
            <div className="mt-2 flex flex-wrap items-center gap-4 font-sans text-[10px] text-[var(--ink-4)]">
              <span className="flex items-center gap-1.5">
                <svg width="20" height="3" aria-hidden="true">
                  <line x1="0" y1="1.5" x2="20" y2="1.5" stroke="var(--ink-4)" strokeWidth="2.5" opacity="0.55" />
                </svg>
                Huidige realiteit
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="20" height="2" aria-hidden="true">
                  <line x1="0" y1="1" x2="20" y2="1" stroke="var(--hor-t, #8a6e42)" strokeWidth="2.5" />
                </svg>
                Wat-als scenario
              </span>
              {simCashflows.length > 0 && simCashflows.map(cf => (
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
              {ieExpanded && (
                <>
                  <span className="flex items-center gap-1.5">
                    <svg width="20" height="2" aria-hidden="true">
                      <line x1="0" y1="1" x2="20" y2="1" stroke="var(--horizon-500, #8b5cf6)" strokeWidth="2" />
                    </svg>
                    Instroom
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg width="20" height="2" aria-hidden="true">
                      <line x1="0" y1="1" x2="20" y2="1" stroke="var(--kern-500, #f59e0b)" strokeWidth="2" />
                    </svg>
                    Uitstroom
                  </span>
                </>
              )}
            </div>
          </section>
        )}

        {/* ── Divider ───────────────────────────────────────── */}
        <div className="my-4 border-b border-dashed border-[var(--border-ed)]" />

        {/* ── Two-column layout: controls ────────────────────── */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-6">

          {/* ── Left column: sliders + events ──────────────────── */}
          <div className="min-w-0 space-y-4">
            <WhatIfSliders
              overrides={overrides}
              baseline={baseline}
              onChange={setOverrides}
            />

            <WhatIfEventsPanel
              events={events}
              onToggleEvent={handleToggleEvent}
              onAddEvent={handleAddEvent}
              onRemoveEvent={handleRemoveEvent}
              onEditEvent={handleEditEvent}
              baselineFireAge={baselineFireAge}
              computeImpact={computeImpact}
              dailyExpenses={whatIfInput ? whatIfInput.monthlyExpenses / 30 : undefined}
              isHousehold={isHousehold}
              suggestions={suggestions}
              suggestionsLoading={suggestionsLoading}
              onAddSuggestion={handleAddSuggestion}
              onDismissSuggestion={dismissSuggestion}
            />
          </div>

          {/* ── Right column: presets + saved + actions + chat ── */}
          <div className="mt-4 min-w-0 space-y-4 lg:mt-0">
            {/* Presets */}
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
                  isHousehold={isHousehold}
                />
              </div>
            </div>

            <WhatIfScenarios
              overrides={overrides}
              events={events}
              fireAge={whatIfFireAge}
              onLoadScenario={handleLoadScenario}
            />

            <WhatIfActions
              overrides={overrides}
              baseline={baseline}
              baselineFireAge={baselineFireAge}
              whatIfFireAge={whatIfFireAge}
              whatIfAnnualSavings={whatIfAnnualSavings}
              baselineAnnualSavings={baselineAnnualSavings}
            />

            <WhatIfChat
              onAddEvent={handleAddEvent}
              scenarioContext={chatScenarioContext}
            />
          </div>
        </div>

        {/* Footer */}
        <p className="pb-8 pt-4 text-center font-sans text-[10px] text-[var(--ink-4)]">
          Dit is een simulatie — geen financieel advies. Werkelijke resultaten kunnen afwijken.
        </p>

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

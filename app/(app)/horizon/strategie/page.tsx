'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import { type FinancialInput, ageAtDate, DEFAULT_RETURN, INFLATION } from '@/lib/horizon-data'
import { resolveFireParams } from '@/lib/fire-params'
import { parseFireStrategy, type FireStrategyConfig } from '@/lib/fire-strategy'
import {
  type WithdrawalStrategyConfig,
  type WithdrawalStrategyType,
  WITHDRAWAL_DEFAULTS,
  resolveWithdrawalStrategy,
} from '@/lib/withdrawal-strategy'
import {
  runSimulation,
  lifeEventsToCashflows,
  type SimResult,
  type SimRow,
  type SimCashflow,
} from '@/lib/fire-simulation'
import {
  computeYearlyMustExpenses,
  computeRetirementExpenses,
  type RetirementExpenseMethod,
} from '@/lib/budget-utils'
import { ArrowLeft, Shield, TrendingUp, Landmark, Settings, Info, Check, CircleDot, Loader2 } from 'lucide-react'

// ── Strategy metadata (Dutch) ──────────────────────────────────────────────

interface StrategyInfo {
  label: string
  description: string
  color: string
  /** Tailwind classes for card highlight */
  cardBg: string
  cardBorder: string
  /** SVG stroke color (CSS value) */
  stroke: string
}

const STRATEGY_INFO: Record<WithdrawalStrategyType, StrategyInfo> = {
  static: {
    label: 'Vast (SWR)',
    description: 'Vaste onttrekking gebaseerd op de 4%-regel, jaarlijks gecorrigeerd voor inflatie.',
    color: 'var(--ink-3)',
    cardBg: 'bg-[var(--subtle)]',
    cardBorder: 'border-[var(--border-ed)]',
    stroke: 'var(--ink-3)',
  },
  guardrails: {
    label: 'Guardrails',
    description: 'Guyton-Klinger methode: pas je onttrekking aan op basis van portfolioprestaties, binnen een bandbreedte.',
    color: '#3b82f6',
    cardBg: 'bg-blue-50',
    cardBorder: 'border-blue-300',
    stroke: '#3b82f6',
  },
  vpw: {
    label: 'VPW',
    description: 'Variable Percentage Withdrawal: elk jaar een dynamisch percentage op basis van resterende levensverwachting.',
    color: '#22c55e',
    cardBg: 'bg-green-50',
    cardBorder: 'border-green-300',
    stroke: '#22c55e',
  },
  bucket: {
    label: 'Bucket',
    description: 'Drie emmers (cash, obligaties, aandelen) met automatische hervulling vanuit groei-emmer.',
    color: '#f59e0b',
    cardBg: 'bg-amber-50',
    cardBorder: 'border-amber-300',
    stroke: '#f59e0b',
  },
}

const STRATEGY_ICONS: Record<WithdrawalStrategyType, React.ReactNode> = {
  static: <Shield className="h-4 w-4" />,
  guardrails: <TrendingUp className="h-4 w-4" />,
  vpw: <TrendingUp className="h-4 w-4" />,
  bucket: <Landmark className="h-4 w-4" />,
}

const ALL_STRATEGIES: WithdrawalStrategyType[] = ['static', 'guardrails', 'vpw', 'bucket']

// ── Detailed strategy explanations (Dutch) ─────────────────────────────────

interface StrategyExplanation {
  howItWorks: string
  suitableFor: string
  pros: string[]
  cons: string[]
}

const STRATEGY_EXPLANATIONS: Record<WithdrawalStrategyType, StrategyExplanation> = {
  static: {
    howItWorks: 'Je onttrekt een vast percentage (bijv. 4%) van je startportfolio, jaarlijks gecorrigeerd voor inflatie.',
    suitableFor: 'Mensen die voorspelbaarheid en eenvoud waarderen.',
    pros: ['Voorspelbaar maandelijks bedrag', 'Eenvoudig te plannen', 'Beproefde methode (Trinity Study)'],
    cons: ['Geen aanpassing bij slechte markten', 'Risico op voortijdige uitputting', 'Mist kansen bij goede rendementen'],
  },
  guardrails: {
    howItWorks: 'Start met een basisonttrekking, maar pas aan op basis van portfolioprestaties. Bij sterke groei verhoog je de onttrekking, bij daling verlaag je.',
    suitableFor: 'Flexibele pensioengangers die hun bestedingen kunnen aanpassen.',
    pros: ['Beschermt tegen marktdalingen', 'Profiteert van goede jaren', 'Vermindert risico op uitputting'],
    cons: ['Inkomen varieert per jaar', 'Complexere planning', 'Vereist discipline bij verlagingen'],
  },
  vpw: {
    howItWorks: 'Elk jaar bereken je een nieuw onttrekkingspercentage op basis van je resterende levensverwachting en portfoliowaarde.',
    suitableFor: 'Mathematisch ingestelde beleggers die optimaal rendement willen.',
    pros: ['Wiskundig optimaal', 'Past zich continu aan', 'Vermogen wordt efficiënt benut'],
    cons: ['Grote inkomensvariatie mogelijk', 'Moeilijk te budgetteren', 'Lager inkomen bij slechte markten'],
  },
  bucket: {
    howItWorks: 'Verdeel je vermogen in drie emmers: cash (2 jaar), obligaties (5 jaar) en aandelen (rest). Ontrek uit cash, hervul jaarlijks vanuit groei-emmers.',
    suitableFor: 'Gepensioneerden die mentale rust willen bij marktvolatiliteit.',
    pros: ['Beschermt tegen sequence-of-returns risk', 'Emotioneel rustgevend', 'Duidelijke structuur'],
    cons: ['Lagere totale rendementen door cash-allocatie', 'Hervulling vereist aandacht', 'Cash verliest waarde door inflatie'],
  },
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function StrategiePage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Data from Supabase
  const [input, setInput] = useState<FinancialInput | null>(null)
  const [lifeEvents, setLifeEvents] = useState<SimCashflow[]>([])
  const [lifeEventsRaw, setLifeEventsRaw] = useState<Array<{ name: string; target_age: number | null; event_type: string }>>([])
  const [fireStrategy, setFireStrategy] = useState<FireStrategyConfig | undefined>(undefined)
  const [withdrawalConfig, setWithdrawalConfig] = useState<WithdrawalStrategyConfig>(WITHDRAWAL_DEFAULTS)
  const [userGrossReturn, setUserGrossReturn] = useState(DEFAULT_RETURN)
  const [userInflation, setUserInflation] = useState(INFLATION)

  // Selected strategy for detail view
  const [selectedStrategy, setSelectedStrategy] = useState<WithdrawalStrategyType>('static')

  // Activation state for switching strategies
  const [activating, setActivating] = useState(false)
  const [activateError, setActivateError] = useState<string | null>(null)

  // ── Load data ──────────────────────────────────────────────────────────

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
        supabase.from('profiles').select('date_of_birth, retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount, expected_return, inflation_rate, withdrawal_strategy, guardrail_floor, guardrail_ceiling, guardrail_cut_step, guardrail_raise_step').single(),
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

      // Resolve user's FIRE parameters
      const fireParams = resolveFireParams(profileResult.data ?? {})
      setUserGrossReturn(fireParams.grossReturn)
      setUserInflation(fireParams.inflationRate)

      // Resolve withdrawal strategy from profile data
      const wsConfig = resolveWithdrawalStrategy(profileResult.data ?? {})
      setWithdrawalConfig(wsConfig)
      setSelectedStrategy(wsConfig.strategy)

      const horizonInput: FinancialInput = {
        totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
        monthlyContributions, yearlyMustExpenses: yearlyRetirementExpenses, dateOfBirth: dob,
      }

      setInput(horizonInput)

      // Convert life events to cashflows for simulation
      const eventData = eventsResult.data ?? []
      setLifeEvents(lifeEventsToCashflows(eventData))
      setLifeEventsRaw(eventData.map(e => ({
        name: e.name,
        target_age: e.target_age,
        event_type: e.event_type,
      })))
    } catch (err) {
      console.error('Error loading strategy data:', err)
      setError('Kon gegevens niet laden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Activate a different strategy via API ──────────────────────────────

  const activateStrategy = useCallback(async (strategy: WithdrawalStrategyType) => {
    setActivating(true)
    setActivateError(null)

    try {
      const res = await fetch('/api/withdrawal-strategy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withdrawal_strategy: strategy }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Onbekende fout' }))
        throw new Error(data.error ?? 'Fout bij opslaan')
      }

      // Update local state to reflect the newly active strategy
      setWithdrawalConfig(prev => ({ ...prev, strategy }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Kon strategie niet activeren'
      setActivateError(message)
    } finally {
      setActivating(false)
    }
  }, [])

  // ── Derived values ──────────────────────────────────────────────────────

  const currentAge = input?.dateOfBirth ? ageAtDate(input.dateOfBirth) : null
  const currentPortfolio = input ? Math.max(0, input.totalAssets - input.totalDebts) : 0
  const yearlyExpenses = input?.yearlyMustExpenses ?? 0
  const annualSavings = (input?.monthlyContributions ?? 0) * 12
  const strategyForSim = useMemo<FireStrategyConfig>(
    () => fireStrategy ?? { strategy: 'deplete' as const, endAge: 90, legacyAmount: 0 },
    [fireStrategy],
  )

  // ── Run simulations for all 4 strategies ───────────────────────────────

  const simulations = useMemo<Record<WithdrawalStrategyType, SimResult | null>>(() => {
    if (currentAge === null || yearlyExpenses <= 0) {
      return { static: null, guardrails: null, vpw: null, bucket: null }
    }

    const results: Record<string, SimResult | null> = {}

    for (const strat of ALL_STRATEGIES) {
      const wsOverride: WithdrawalStrategyConfig = {
        ...withdrawalConfig,
        strategy: strat,
      }

      results[strat] = runSimulation(
        currentAge,
        strategyForSim.endAge,
        currentPortfolio,
        yearlyExpenses,
        annualSavings,
        userGrossReturn,
        'nl_box3',
        userInflation,
        lifeEvents,
        strategyForSim,
        wsOverride,
      )
    }

    return results as Record<WithdrawalStrategyType, SimResult | null>
  }, [currentAge, yearlyExpenses, currentPortfolio, annualSavings, userGrossReturn, userInflation, lifeEvents, strategyForSim, withdrawalConfig])

  // ── Extract retirement rows for chart ───────────────────────────────────

  const retirementData = useMemo(() => {
    const data: Record<WithdrawalStrategyType, SimRow[]> = {
      static: [],
      guardrails: [],
      vpw: [],
      bucket: [],
    }

    for (const strat of ALL_STRATEGIES) {
      const sim = simulations[strat]
      if (!sim) continue
      data[strat] = sim.rows.filter(r => r.phase === 'retirement')
    }

    return data
  }, [simulations])

  // ── Compute chart bounds ────────────────────────────────────────────────

  const chartBounds = useMemo(() => {
    let minAge = Infinity
    let maxAge = -Infinity
    let maxPortfolio = 0

    for (const strat of ALL_STRATEGIES) {
      const rows = retirementData[strat]
      if (rows.length === 0) continue
      minAge = Math.min(minAge, rows[0].age)
      maxAge = Math.max(maxAge, rows[rows.length - 1].age)
      for (const row of rows) {
        maxPortfolio = Math.max(maxPortfolio, row.endPortfolio)
      }
    }

    // If no retirement data, use accumulation data to find FIRE age
    if (minAge === Infinity) {
      const anySim = simulations.static
      if (anySim && anySim.rows.length > 0) {
        minAge = anySim.rows[0].age
        maxAge = anySim.rows[anySim.rows.length - 1].age
        maxPortfolio = Math.max(...anySim.rows.map(r => r.endPortfolio))
      } else {
        minAge = currentAge ?? 30
        maxAge = strategyForSim.endAge
        maxPortfolio = 1_000_000
      }
    }

    return { minAge, maxAge, maxPortfolio }
  }, [retirementData, simulations, currentAge, strategyForSim.endAge])

  // ── Spending flexibility for selected strategy ──────────────────────────

  const spendingRange = useMemo(() => {
    const sim = simulations[selectedStrategy]
    if (!sim) return null

    const retRows = retirementData[selectedStrategy]
    if (retRows.length === 0) return null

    let minWithdrawal = Infinity
    let maxWithdrawal = 0

    for (const row of retRows) {
      if (row.withdrawal > 0) {
        minWithdrawal = Math.min(minWithdrawal, row.withdrawal)
        maxWithdrawal = Math.max(maxWithdrawal, row.withdrawal)
      }
    }

    if (minWithdrawal === Infinity) return null

    return {
      minMonthly: Math.round(minWithdrawal / 12),
      maxMonthly: Math.round(maxWithdrawal / 12),
    }
  }, [simulations, retirementData, selectedStrategy])

  // ── Guardrails corridor data (for shaded area) ─────────────────────────

  const guardrailsCorridor = useMemo(() => {
    if (selectedStrategy !== 'guardrails') return null

    const sim = simulations.guardrails
    if (!sim) return null

    const retRows = retirementData.guardrails
    if (retRows.length === 0) return null

    // Compute floor/ceiling withdrawal amounts per year
    return retRows.map(row => {
      const baseWithdrawal = row.withdrawal
      return {
        age: row.age,
        floor: Math.round(baseWithdrawal * withdrawalConfig.guardrailFloor),
        target: baseWithdrawal,
        ceiling: Math.round(baseWithdrawal * withdrawalConfig.guardrailCeiling),
        portfolio: row.endPortfolio,
      }
    })
  }, [selectedStrategy, simulations, retirementData, withdrawalConfig])

  // ── Life event markers with ages ────────────────────────────────────────

  const eventMarkers = useMemo(() => {
    return lifeEventsRaw
      .filter(e => e.target_age !== null)
      .map(e => ({
        name: e.name,
        age: e.target_age!,
        type: e.event_type,
      }))
      .filter(e => e.age >= chartBounds.minAge && e.age <= chartBounds.maxAge)
  }, [lifeEventsRaw, chartBounds])

  // ── Loading state ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6">
          <Link href="/horizon" className="inline-flex items-center gap-1.5 font-sans text-sm text-[var(--ink-3)] hover:text-[var(--ink)]">
            <ArrowLeft className="h-4 w-4" />
            Terug naar Horizon
          </Link>
        </div>
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded-[var(--r)] bg-[var(--subtle)]" />
          <div className="h-4 w-80 animate-pulse rounded-[var(--r)] bg-[var(--subtle)]" />
          <div className="h-64 animate-pulse rounded-[var(--r)] bg-[var(--subtle)]" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-24 animate-pulse rounded-[var(--r)] bg-[var(--subtle)]" />
            ))}
          </div>
          <div className="h-48 animate-pulse rounded-[var(--r)] bg-[var(--subtle)]" />
        </div>
        <p className="mt-4 text-center font-sans text-sm text-[var(--ink-3)]">
          Gegevens laden...
        </p>
      </div>
    )
  }

  if (error || !input) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6">
          <Link href="/horizon" className="inline-flex items-center gap-1.5 font-sans text-sm text-[var(--ink-3)] hover:text-[var(--ink)]">
            <ArrowLeft className="h-4 w-4" />
            Terug naar Horizon
          </Link>
        </div>
        <p className="font-sans text-sm text-[var(--ink-2)]">{error ?? 'Geen data beschikbaar.'}</p>
      </div>
    )
  }

  const selectedSim = simulations[selectedStrategy]
  const selectedInfo = STRATEGY_INFO[selectedStrategy]
  const fireAge = selectedSim?.fireAge ?? null

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">

      {/* ── Back link ───────────────────────────────────────────────── */}
      <div className="mb-4">
        <Link href="/horizon" className="inline-flex items-center gap-1.5 font-sans text-sm text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]">
          <ArrowLeft className="h-4 w-4" />
          Terug naar Horizon
        </Link>
      </div>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-[var(--ink)]">
          Onttrekkingsstrategieën
        </h1>
        <p className="mt-1 font-sans text-sm text-[var(--ink-3)]">
          Vergelijk hoe verschillende onttrekkingsstrategieën je portefeuille beïnvloeden na pensionering.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-horizon-300 bg-horizon-50 px-3 py-1.5">
          <span className="font-sans text-xs font-medium text-horizon-700">
            Actieve strategie: {STRATEGY_INFO[withdrawalConfig.strategy].label}
          </span>
        </div>
      </header>

      {/* ── Strategy selector cards ─────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        {ALL_STRATEGIES.map(strat => {
          const info = STRATEGY_INFO[strat]
          const sim = simulations[strat]
          const isActive = strat === selectedStrategy
          const isCurrent = strat === withdrawalConfig.strategy

          return (
            <button
              key={strat}
              type="button"
              onClick={() => setSelectedStrategy(strat)}
              className={`relative rounded-[var(--r)] border-2 p-3 text-left transition-all ${
                isActive
                  ? `${info.cardBg} ${info.cardBorder} shadow-sm`
                  : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
              }`}
            >
              {isCurrent && (
                <span className="absolute -top-2 right-2 rounded-full bg-horizon-600 px-1.5 py-0.5 font-sans text-[9px] font-bold uppercase tracking-wider text-white">
                  Actief
                </span>
              )}
              <div className="mb-1 flex items-center gap-1.5">
                <span style={{ color: info.color }}>{STRATEGY_ICONS[strat]}</span>
                <span className="font-sans text-sm font-semibold text-[var(--ink)]">
                  {info.label}
                </span>
              </div>
              <p className="font-sans text-[11px] leading-snug text-[var(--ink-3)]">
                {info.description}
              </p>
              {sim && sim.fireReachable && (
                <p className="mt-2 font-mono text-xs tabular-nums text-[var(--ink-2)]">
                  FIRE: {sim.fireAge} jr
                </p>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Activate strategy button (when selection differs from active) ── */}
      {selectedStrategy !== withdrawalConfig.strategy && (
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            disabled={activating}
            onClick={() => activateStrategy(selectedStrategy)}
            className="inline-flex items-center gap-2 rounded-[var(--r)] bg-horizon-600 px-4 py-2 font-sans text-sm font-semibold text-white transition-colors hover:bg-horizon-700 disabled:opacity-60"
          >
            {activating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Activeer {STRATEGY_INFO[selectedStrategy].label}
          </button>
          <span className="font-sans text-xs text-[var(--ink-4)]">
            Huidige strategie: {STRATEGY_INFO[withdrawalConfig.strategy].label}
          </span>
        </div>
      )}

      {/* ── Activation error message ───────────────────────────────── */}
      {activateError && (
        <div className="mb-6 rounded-[var(--r)] border border-red-200 bg-red-50 px-4 py-2">
          <p className="font-sans text-sm text-red-700">{activateError}</p>
        </div>
      )}

      {/* ── Comparison SVG chart ────────────────────────────────────── */}
      <section className="mb-6">
        <div className="card-editorial overflow-hidden">
          <div className="h-[3px] bg-horizon-500" />
          <div className="px-4 py-3">
            <p className="mb-1 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Portefeuillewaarde na FIRE
            </p>

            {/* Legend */}
            <div className="mb-3 flex flex-wrap items-center gap-3">
              {ALL_STRATEGIES.map(strat => {
                const info = STRATEGY_INFO[strat]
                const isSelected = strat === selectedStrategy
                return (
                  <button
                    key={strat}
                    type="button"
                    onClick={() => setSelectedStrategy(strat)}
                    className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 font-sans text-[10px] transition-colors ${
                      isSelected
                        ? 'bg-[var(--subtle)] font-semibold text-[var(--ink)]'
                        : 'text-[var(--ink-4)] hover:text-[var(--ink-3)]'
                    }`}
                  >
                    <svg width="10" height="10" aria-hidden="true">
                      <circle cx="5" cy="5" r="4" fill={info.stroke} opacity={isSelected ? 1 : 0.5} />
                    </svg>
                    {info.label}
                  </button>
                )
              })}
            </div>

            {/* SVG Chart */}
            <ComparisonChart
              retirementData={retirementData}
              chartBounds={chartBounds}
              selectedStrategy={selectedStrategy}
              eventMarkers={eventMarkers}
              guardrailsCorridor={guardrailsCorridor}
            />
          </div>
        </div>
      </section>

      {/* ── Spending flexibility card ──────────────────────────────── */}
      {spendingRange && (
        <section className="mb-6">
          <div className="card-editorial overflow-hidden">
            <div className="px-4 py-3">
              <div className="flex items-start gap-2.5">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-horizon-500" />
                <div>
                  <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                    Bestedingsruimte ({selectedInfo.label})
                  </p>
                  <p className="mt-1 font-sans text-sm text-[var(--ink)]">
                    Je kunt flexen tussen{' '}
                    <span className="font-mono tabular-nums font-semibold">
                      {formatCurrency(spendingRange.minMonthly)}
                    </span>
                    {' '}en{' '}
                    <span className="font-mono tabular-nums font-semibold">
                      {formatCurrency(spendingRange.maxMonthly)}
                    </span>
                    {' '}per maand
                  </p>
                  {selectedStrategy === 'static' && (
                    <p className="mt-1 font-sans text-[11px] text-[var(--ink-4)]">
                      Bij de vaste strategie is je onttrekking constant (gecorrigeerd voor inflatie).
                    </p>
                  )}
                  {selectedStrategy === 'guardrails' && (
                    <p className="mt-1 font-sans text-[11px] text-[var(--ink-4)]">
                      De Guardrails-strategie past je onttrekking aan bij goede en slechte beursjaren.
                    </p>
                  )}
                  {selectedStrategy === 'vpw' && (
                    <p className="mt-1 font-sans text-[11px] text-[var(--ink-4)]">
                      VPW berekent elk jaar een nieuw percentage op basis van je resterende horizon.
                    </p>
                  )}
                  {selectedStrategy === 'bucket' && (
                    <p className="mt-1 font-sans text-[11px] text-[var(--ink-4)]">
                      De bucket-strategie beschermt je onttrekking door verschillende emmers voor korte en lange termijn.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Guardrails bandwidth card (conditional) ────────────────── */}
      {selectedStrategy === 'guardrails' && guardrailsCorridor && guardrailsCorridor.length > 0 && (
        <section className="mb-6">
          <div className="card-editorial overflow-hidden">
            <div className="h-[3px] bg-blue-400" />
            <div className="px-4 py-3">
              <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                Guardrails bandbreedte
              </p>
              <GuardrailsBandwidthChart
                corridor={guardrailsCorridor}
                chartBounds={chartBounds}
              />
              <div className="mt-2 flex items-center justify-between font-sans text-[10px] text-[var(--ink-4)]">
                <span>
                  Floor: {Math.round(withdrawalConfig.guardrailFloor * 100)}% van basis
                </span>
                <span>
                  Ceiling: {Math.round(withdrawalConfig.guardrailCeiling * 100)}% van basis
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Life events timeline ──────────────────────────────────── */}
      {eventMarkers.length > 0 && (
        <section className="mb-6">
          <div className="card-editorial overflow-hidden">
            <div className="px-4 py-3">
              <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                Levensgebeurtenissen op de tijdlijn
              </p>
              <div className="space-y-1.5">
                {eventMarkers.map((marker, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--ink-2)]">
                      {marker.age} jr
                    </span>
                    <div className="h-px flex-1 bg-[var(--border-ed)]" />
                    <span className="font-sans text-xs text-[var(--ink)]">
                      {marker.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Strategy summary ──────────────────────────────────────── */}
      {selectedSim && (
        <section className="mb-6">
          <div className="card-editorial overflow-hidden">
            <div className="px-4 py-3">
              <p className="mb-2 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                Samenvatting ({selectedInfo.label})
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <SummaryRow label="FIRE leeftijd" value={fireAge !== null ? `${fireAge} jaar` : 'Niet bereikbaar'} />
                <SummaryRow label="Doelbedrag" value={formatCurrency(selectedSim.requiredFirePortfolio)} />
                <SummaryRow label="Onttrekkingspercentage" value={`${(selectedSim.implicitWithdrawalRate * 100).toFixed(1)}%`} />
                <SummaryRow label="Eindvermogen" value={
                  selectedSim.rows.length > 0
                    ? formatCurrency(selectedSim.rows[selectedSim.rows.length - 1].endPortfolio)
                    : '—'
                } />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Strategy explanation cards ──────────────────────────── */}
      <section className="mb-6">
        <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          Strategieën uitgelegd
        </p>
        <div className="space-y-3">
          {ALL_STRATEGIES.map(strat => {
            const info = STRATEGY_INFO[strat]
            const explanation = STRATEGY_EXPLANATIONS[strat]
            const isCurrent = strat === withdrawalConfig.strategy

            return (
              <div
                key={strat}
                className={`card-editorial overflow-hidden transition-all ${
                  isCurrent ? 'ring-2 ring-horizon-400 ring-offset-1' : ''
                }`}
              >
                {/* Colored top accent */}
                <div className="h-[3px]" style={{ backgroundColor: info.color }} />

                <div className="px-4 py-3">
                  {/* Header row with icon, name, and active badge */}
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-md"
                      style={{ backgroundColor: info.color + '18', color: info.color }}
                    >
                      {STRATEGY_ICONS[strat]}
                    </span>
                    <span className="font-sans text-sm font-bold text-[var(--ink)]">
                      {info.label}
                    </span>
                    {isCurrent && (
                      <span className="ml-auto rounded-full bg-horizon-600 px-2 py-0.5 font-sans text-[9px] font-bold uppercase tracking-wider text-white">
                        Actief
                      </span>
                    )}
                  </div>

                  {/* How it works */}
                  <div className="mb-2">
                    <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
                      Hoe het werkt
                    </p>
                    <p className="mt-0.5 font-sans text-xs leading-relaxed text-[var(--ink-2)]">
                      {explanation.howItWorks}
                    </p>
                  </div>

                  {/* Suitable for */}
                  <div className="mb-2">
                    <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]">
                      Geschikt voor
                    </p>
                    <p className="mt-0.5 font-sans text-xs leading-relaxed text-[var(--ink-2)]">
                      {explanation.suitableFor}
                    </p>
                  </div>

                  {/* Pros and cons side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[0.06em] text-green-600">
                        Voordelen
                      </p>
                      <ul className="space-y-0.5">
                        {explanation.pros.map((pro, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                            <span className="font-sans text-[11px] leading-snug text-[var(--ink-2)]">
                              {pro}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[0.06em] text-red-500">
                        Nadelen
                      </p>
                      <ul className="space-y-0.5">
                        {explanation.cons.map((con, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                            <span className="font-sans text-[11px] leading-snug text-[var(--ink-2)]">
                              {con}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Secondary link to full settings (guardrail parameters etc.) ── */}
      <Link
        href="/identity/instellingen#onttrekking"
        className="flex items-center justify-between rounded-[var(--r)] border-2 border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 transition-all hover:border-horizon-300 hover:shadow-sm"
      >
        <div className="flex items-center gap-2.5">
          <Settings className="h-4 w-4 text-horizon-500" />
          <div>
            <p className="font-sans text-sm font-medium text-[var(--ink)]">
              Geavanceerde instellingen
            </p>
            <p className="font-sans text-[11px] text-[var(--ink-3)]">
              Pas guardrail-parameters en andere opties aan
            </p>
          </div>
        </div>
        <ArrowLeft className="h-4 w-4 rotate-180 text-[var(--ink-4)]" />
      </Link>

      {/* ── Disclaimer ────────────────────────────────────────────── */}
      <p className="pb-8 pt-4 text-center font-sans text-[10px] text-[var(--ink-4)]">
        Dit is een simulatie — geen financieel advies. Werkelijke resultaten kunnen afwijken.
      </p>
    </div>
  )
}

// ── Summary row ───────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-sans text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">{label}</span>
      <p className="font-mono text-sm font-medium tabular-nums text-[var(--ink)]">{value}</p>
    </div>
  )
}

// ── Comparison Chart (SVG) ──────────────────────────────────────────────────

interface ComparisonChartProps {
  retirementData: Record<WithdrawalStrategyType, SimRow[]>
  chartBounds: { minAge: number; maxAge: number; maxPortfolio: number }
  selectedStrategy: WithdrawalStrategyType
  eventMarkers: Array<{ name: string; age: number; type: string }>
  guardrailsCorridor: Array<{ age: number; floor: number; target: number; ceiling: number; portfolio: number }> | null
}

/** Chart dimensions */
const CHART_W = 640
const CHART_H = 280
const PAD_L = 56
const PAD_R = 16
const PAD_T = 16
const PAD_B = 32

function ComparisonChart({ retirementData, chartBounds, selectedStrategy, eventMarkers, guardrailsCorridor }: ComparisonChartProps) {
  const { minAge, maxAge, maxPortfolio } = chartBounds

  if (maxAge <= minAge || maxPortfolio <= 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="font-sans text-sm text-[var(--ink-3)]">Geen pensioendata beschikbaar</p>
      </div>
    )
  }

  const plotW = CHART_W - PAD_L - PAD_R
  const plotH = CHART_H - PAD_T - PAD_B
  const ageRange = maxAge - minAge
  const portfolioRange = maxPortfolio * 1.1 // Add 10% headroom

  /** Map age to x coordinate */
  const toX = (age: number) => PAD_L + ((age - minAge) / ageRange) * plotW
  /** Map portfolio value to y coordinate */
  const toY = (value: number) => PAD_T + plotH - (value / portfolioRange) * plotH

  /** Build SVG path string from retirement rows */
  function buildPath(rows: SimRow[]): string {
    if (rows.length === 0) return ''
    return rows.map((row, i) => {
      const x = toX(row.age)
      const y = toY(row.endPortfolio)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
  }

  // Y-axis grid lines (5 steps)
  const ySteps = 5
  const yGridLines = Array.from({ length: ySteps + 1 }, (_, i) => {
    const value = (portfolioRange / ySteps) * i
    return { y: toY(value), value: Math.round(value) }
  })

  // X-axis labels (every 5 years)
  const xLabels: number[] = []
  const startLabel = Math.ceil(minAge / 5) * 5
  for (let age = startLabel; age <= maxAge; age += 5) {
    xLabels.push(age)
  }

  // Draw order: non-selected strategies first, then selected on top
  const drawOrder = ALL_STRATEGIES.filter(s => s !== selectedStrategy)
  drawOrder.push(selectedStrategy)

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="w-full"
      aria-label="Vergelijking onttrekkingsstrategieën"
    >
      {/* Y-axis grid lines */}
      {yGridLines.map((line, i) => (
        <g key={i}>
          <line
            x1={PAD_L}
            y1={line.y}
            x2={CHART_W - PAD_R}
            y2={line.y}
            stroke="var(--border-ed)"
            strokeWidth="0.5"
          />
          {i > 0 && (
            <text
              x={PAD_L - 6}
              y={line.y + 3}
              textAnchor="end"
              className="fill-[var(--ink-4)]"
              style={{ fontSize: '8px', fontFamily: 'var(--font-mono, monospace)' }}
            >
              {formatCompactValue(line.value)}
            </text>
          )}
        </g>
      ))}

      {/* X-axis labels */}
      {xLabels.map(age => (
        <text
          key={age}
          x={toX(age)}
          y={CHART_H - 6}
          textAnchor="middle"
          className="fill-[var(--ink-4)]"
          style={{ fontSize: '8px', fontFamily: 'var(--font-mono, monospace)' }}
        >
          {age}
        </text>
      ))}

      {/* Life event markers (vertical dashed lines) */}
      {eventMarkers.map((marker, idx) => {
        const x = toX(marker.age)
        return (
          <g key={idx}>
            <line
              x1={x}
              y1={PAD_T}
              x2={x}
              y2={CHART_H - PAD_B}
              stroke="var(--ink-4)"
              strokeWidth="0.5"
              strokeDasharray="3,3"
              opacity="0.6"
            />
            <text
              x={x}
              y={PAD_T - 4}
              textAnchor="middle"
              className="fill-[var(--ink-4)]"
              style={{ fontSize: '7px', fontFamily: 'var(--font-sans, sans-serif)' }}
            >
              {marker.name}
            </text>
          </g>
        )
      })}

      {/* Guardrails shaded corridor (when selected) */}
      {selectedStrategy === 'guardrails' && guardrailsCorridor && guardrailsCorridor.length > 1 && (
        <path
          d={buildGuardrailsArea(guardrailsCorridor, toX, toY)}
          fill="#3b82f6"
          opacity="0.08"
        />
      )}

      {/* Strategy lines */}
      {drawOrder.map(strat => {
        const rows = retirementData[strat]
        if (rows.length === 0) return null
        const info = STRATEGY_INFO[strat]
        const isSelected = strat === selectedStrategy

        return (
          <path
            key={strat}
            d={buildPath(rows)}
            fill="none"
            stroke={info.stroke}
            strokeWidth={isSelected ? 2.5 : 1.5}
            opacity={isSelected ? 1 : 0.35}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )
      })}

      {/* Zero line */}
      <line
        x1={PAD_L}
        y1={toY(0)}
        x2={CHART_W - PAD_R}
        y2={toY(0)}
        stroke="var(--ink-3)"
        strokeWidth="0.5"
        opacity="0.4"
      />
    </svg>
  )
}

/** Build a closed SVG area path for guardrails corridor based on portfolio values */
function buildGuardrailsArea(
  corridor: Array<{ age: number; portfolio: number }>,
  toX: (age: number) => number,
  toY: (value: number) => number,
): string {
  if (corridor.length < 2) return ''

  // Upper boundary: portfolio * 1.1 (ceiling band approximation)
  const upperPoints = corridor.map(c => `${toX(c.age).toFixed(1)},${toY(c.portfolio * 1.1).toFixed(1)}`)
  // Lower boundary: portfolio * 0.9 (floor band approximation)
  const lowerPoints = [...corridor].reverse().map(c => `${toX(c.age).toFixed(1)},${toY(c.portfolio * 0.9).toFixed(1)}`)

  return `M${upperPoints.join(' L')} L${lowerPoints.join(' L')} Z`
}

/** Format a value compactly for y-axis labels (e.g. 1.2M, 500K) */
function formatCompactValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return String(Math.round(value))
}

// ── Guardrails Bandwidth Chart ────────────────────────────────────────────

interface GuardrailsBandwidthChartProps {
  corridor: Array<{ age: number; floor: number; target: number; ceiling: number }>
  chartBounds: { minAge: number; maxAge: number }
}

const GR_CHART_H = 160

function GuardrailsBandwidthChart({ corridor, chartBounds }: GuardrailsBandwidthChartProps) {
  const { minAge, maxAge } = chartBounds

  if (corridor.length < 2) {
    return <p className="font-sans text-sm text-[var(--ink-3)]">Onvoldoende data</p>
  }

  // Find max withdrawal for scaling
  let maxVal = 0
  for (const c of corridor) {
    maxVal = Math.max(maxVal, c.ceiling)
  }
  const yRange = maxVal * 1.15

  const plotW = CHART_W - PAD_L - PAD_R
  const plotH = GR_CHART_H - PAD_T - PAD_B
  const ageRange = maxAge - minAge || 1

  const toX = (age: number) => PAD_L + ((age - minAge) / ageRange) * plotW
  const toY = (val: number) => PAD_T + plotH - (val / yRange) * plotH

  // Build corridor area (ceiling → floor)
  const ceilingPts = corridor.map(c => `${toX(c.age).toFixed(1)},${toY(c.ceiling).toFixed(1)}`)
  const floorPts = [...corridor].reverse().map(c => `${toX(c.age).toFixed(1)},${toY(c.floor).toFixed(1)}`)
  const areaPath = `M${ceilingPts.join(' L')} L${floorPts.join(' L')} Z`

  // Target line
  const targetPath = corridor.map((c, i) =>
    `${i === 0 ? 'M' : 'L'}${toX(c.age).toFixed(1)},${toY(c.target).toFixed(1)}`
  ).join(' ')

  // Y grid
  const ySteps = 4
  const yGrid = Array.from({ length: ySteps + 1 }, (_, i) => {
    const val = (yRange / ySteps) * i
    return { y: toY(val), value: Math.round(val) }
  })

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${GR_CHART_H}`}
      className="w-full"
      aria-label="Guardrails bandbreedte"
    >
      {/* Y grid */}
      {yGrid.map((line, i) => (
        <g key={i}>
          <line x1={PAD_L} y1={line.y} x2={CHART_W - PAD_R} y2={line.y} stroke="var(--border-ed)" strokeWidth="0.5" />
          {i > 0 && (
            <text
              x={PAD_L - 6}
              y={line.y + 3}
              textAnchor="end"
              className="fill-[var(--ink-4)]"
              style={{ fontSize: '8px', fontFamily: 'var(--font-mono, monospace)' }}
            >
              {formatCompactValue(line.value)}
            </text>
          )}
        </g>
      ))}

      {/* Shaded corridor */}
      <path d={areaPath} fill="#3b82f6" opacity="0.12" />

      {/* Ceiling line (dashed) */}
      <path
        d={corridor.map((c, i) => `${i === 0 ? 'M' : 'L'}${toX(c.age).toFixed(1)},${toY(c.ceiling).toFixed(1)}`).join(' ')}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1"
        strokeDasharray="4,3"
        opacity="0.5"
      />

      {/* Floor line (dashed) */}
      <path
        d={corridor.map((c, i) => `${i === 0 ? 'M' : 'L'}${toX(c.age).toFixed(1)},${toY(c.floor).toFixed(1)}`).join(' ')}
        fill="none"
        stroke="#3b82f6"
        strokeWidth="1"
        strokeDasharray="4,3"
        opacity="0.5"
      />

      {/* Target line (solid) */}
      <path d={targetPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />

      {/* Labels */}
      {corridor.length > 0 && (
        <>
          <text
            x={CHART_W - PAD_R + 2}
            y={toY(corridor[corridor.length - 1].ceiling) + 3}
            className="fill-blue-400"
            style={{ fontSize: '7px', fontFamily: 'var(--font-sans, sans-serif)' }}
          >
            plafond
          </text>
          <text
            x={CHART_W - PAD_R + 2}
            y={toY(corridor[corridor.length - 1].floor) + 3}
            className="fill-blue-400"
            style={{ fontSize: '7px', fontFamily: 'var(--font-sans, sans-serif)' }}
          >
            vloer
          </text>
        </>
      )}
    </svg>
  )
}

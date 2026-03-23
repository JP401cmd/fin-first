'use client'

import { memo, useState, useEffect } from 'react'
import { Briefcase } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import type { SimCashflow } from '@/lib/fire-simulation'
import type { TransitionScenario } from '@/components/app/horizon/phase-modal-overgang'

// ── Types ────────────────────────────────────────────────────────────────────

export interface DeeltijdwerkImpactProps {
  startPortfolio: number
  startAge: number
  endAge: number
  yearlyExpenses: number
  expectedReturn: number
  inflationRate: number
  transitionScenario: TransitionScenario
  /** Current monthly income (full-time equivalent) for scaling part-time scenarios */
  monthlyIncome?: number
  cashflows?: SimCashflow[]
}

interface ScenarioResult {
  werkdagen: number
  label: string
  maandInkomen: number
  jaarInkomen: number
  /** Gap scenario: end portfolio at AOW */
  eindVermogen?: number
  /** Shortfall scenario: FIRE age with this part-time income */
  fireLeeftijd?: number
  /** Difference vs baseline (0 workdays) */
  verschil: number
  /** Freedom days lost per year due to working */
  vrijheidsdagenVerloren: number
}

interface ComputedState {
  scenarios: ScenarioResult[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Simulate portfolio forward through transition phase with part-time income.
 * Each year: portfolio grows by return, receives part-time income, pays expenses + box3.
 */
function simulateGapWithIncome(
  startPortfolio: number,
  years: number,
  yearlyExpenses: number,
  expectedReturn: number,
  inflationRate: number,
  yearlyPartTimeIncome: number,
  cashflows: SimCashflow[],
  startAge: number,
): number {
  let portfolio = startPortfolio

  for (let i = 0; i < years; i++) {
    const age = startAge + i
    const inflatedExpenses = yearlyExpenses * Math.pow(1 + inflationRate, i)
    const inflatedIncome = yearlyPartTimeIncome * Math.pow(1 + inflationRate, i)

    // Cashflow contributions for this year
    const cfNet = cashflows
      .filter(cf => {
        if (cf.type === 'one_time') return Math.round(cf.fromAge) === Math.round(age)
        return cf.fromAge <= age && (cf.toAge == null || cf.toAge > age)
      })
      .reduce((sum, cf) => {
        const sign = cf.direction === 'income' ? 1 : -1
        const inflatedAmount = cf.indexed ? cf.amount * Math.pow(1 + inflationRate, i) : cf.amount
        return sum + sign * inflatedAmount
      }, 0)

    // Growth
    portfolio *= (1 + expectedReturn)
    // Add income, subtract expenses
    portfolio += inflatedIncome - inflatedExpenses + cfNet
  }

  return Math.round(portfolio)
}

/**
 * Estimate FIRE age given part-time income during accumulation.
 * Binary search: find earliest age where portfolio covers remaining expenses.
 */
function estimateFireAgeWithIncome(
  startPortfolio: number,
  startAge: number,
  yearlyExpenses: number,
  expectedReturn: number,
  inflationRate: number,
  yearlyPartTimeIncome: number,
  annualSavings: number,
): number {
  // Simple forward simulation: each year accumulate with savings + part-time income
  // until portfolio covers expenses via SWR
  const swr = Math.max(expectedReturn - inflationRate, 0.025)
  let portfolio = startPortfolio
  const maxAge = 100

  for (let age = startAge; age <= maxAge; age++) {
    const inflatedExpenses = yearlyExpenses * Math.pow(1 + inflationRate, age - startAge)
    const fireTarget = inflatedExpenses / swr

    if (portfolio >= fireTarget) {
      return age
    }

    // Accumulate: savings + part-time income + growth
    portfolio *= (1 + expectedReturn)
    portfolio += annualSavings + yearlyPartTimeIncome
  }

  return maxAge
}

/**
 * Compute all 4 part-time work scenarios.
 */
function computeScenarios(
  props: DeeltijdwerkImpactProps,
): ScenarioResult[] {
  const {
    startPortfolio,
    startAge,
    endAge,
    yearlyExpenses,
    expectedReturn,
    inflationRate,
    transitionScenario,
    monthlyIncome,
    cashflows = [],
  } = props

  const years = Math.max(Math.round(endAge - startAge), 1)

  // Default monthly income: ~50% of monthly expenses as full-time equivalent
  const fullTimeMonthly = monthlyIncome ?? Math.round(yearlyExpenses / 12)

  // Work days per week → income fraction (out of 5 working days)
  const werkdagenOptions = [0, 1, 2, 3]

  // Compute baseline (0 days) first for comparison
  const results: ScenarioResult[] = []
  let baseline: number | undefined

  for (const dagen of werkdagenOptions) {
    const fraction = dagen / 5
    const maandInkomen = Math.round(fullTimeMonthly * fraction)
    const jaarInkomen = maandInkomen * 12

    // Working days lost per year (assuming 52 weeks, minus ~6 weeks vacation = ~46 weeks)
    const werkdagenPerJaar = dagen * 46
    // Freedom days are 365 - werkdagen
    const vrijheidsdagenVerloren = werkdagenPerJaar

    const labels = [
      'Niet werken',
      '1 dag/week',
      '2 dagen/week',
      '3 dagen/week',
    ]

    if (transitionScenario === 'gap') {
      // Forward cascade: simulate portfolio through transition with income
      const eindVermogen = simulateGapWithIncome(
        startPortfolio,
        years,
        yearlyExpenses,
        expectedReturn,
        inflationRate,
        jaarInkomen,
        cashflows,
        startAge,
      )

      if (baseline === undefined) baseline = eindVermogen
      const verschil = eindVermogen - baseline

      results.push({
        werkdagen: dagen,
        label: labels[dagen],
        maandInkomen,
        jaarInkomen,
        eindVermogen,
        verschil,
        vrijheidsdagenVerloren,
      })
    } else {
      // Shortfall: estimate how much earlier FIRE with part-time income supplement
      // In shortfall, the user hasn't reached FIRE yet — part-time work supplements savings
      const fireLeeftijd = simulateGapWithIncome(
        startPortfolio,
        years,
        yearlyExpenses,
        expectedReturn,
        inflationRate,
        jaarInkomen,
        cashflows,
        startAge,
      )

      if (baseline === undefined) baseline = fireLeeftijd
      // For shortfall: more income → higher end portfolio → positive difference
      const verschil = fireLeeftijd - baseline

      results.push({
        werkdagen: dagen,
        label: labels[dagen],
        maandInkomen,
        jaarInkomen,
        eindVermogen: fireLeeftijd,
        verschil,
        vrijheidsdagenVerloren,
      })
    }
  }

  return results
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Part-time work flex impact analysis for the transition phase.
 *
 * Shows 4 scenarios (0, 1, 2, 3 workdays/week) and their impact on either:
 * - Gap scenario: end portfolio at AOW age
 * - Shortfall scenario: end portfolio with AOW supplement
 *
 * Includes a "keerzijde" (downside) block showing lost freedom days per year.
 * Uses lazy computation to avoid blocking the modal open animation.
 */
export const DeeltijdwerkImpact = memo(function DeeltijdwerkImpact(
  props: DeeltijdwerkImpactProps,
) {
  const [state, setState] = useState<ComputedState | null>(null)

  // Lazy compute: defer past first paint
  useEffect(() => {
    const timer = setTimeout(() => {
      const scenarios = computeScenarios(props)
      setState({ scenarios })
    }, 50)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.startPortfolio,
    props.startAge,
    props.endAge,
    props.yearlyExpenses,
    props.expectedReturn,
    props.inflationRate,
    props.transitionScenario,
    props.monthlyIncome,
    props.cashflows,
  ])

  const loading = state === null
  const isGap = props.transitionScenario === 'gap'

  return (
    <AnalysisSection
      title="Deeltijdwerk Flex Impact"
      icon={Briefcase}
      loading={loading}
      willContext={
        state
          ? `Deeltijdwerk impact: ${state.scenarios
              .map(
                (s) =>
                  `${s.label}: ${formatCurrency(s.maandInkomen)}/mnd → ${isGap ? `eindvermogen ${formatCurrency(s.eindVermogen ?? 0)}` : `eindvermogen ${formatCurrency(s.eindVermogen ?? 0)}`}${s.verschil !== 0 ? ` (${s.verschil > 0 ? '+' : ''}${formatCurrency(s.verschil)})` : ''}`,
              )
              .join(', ')}`
          : 'Deeltijdwerk impact (laden...)'
      }
    >
      {state && (
        <div className="space-y-4">
          {/* ── Scenario table ──────────────────────────────────── */}
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                  <th className="px-1 pb-1.5">Werkdagen</th>
                  <th className="px-1 pb-1.5 text-right">Inkomen/mnd</th>
                  <th className="px-1 pb-1.5 text-right">
                    Eindvermogen
                  </th>
                  <th className="px-1 pb-1.5 text-right">Verschil</th>
                </tr>
              </thead>
              <tbody>
                {state.scenarios.map((s) => (
                  <tr
                    key={s.werkdagen}
                    className={`border-b border-dashed border-[var(--border-ed)] last:border-b-0 ${
                      s.werkdagen === 0 ? 'bg-[var(--subtle)]/30' : ''
                    }`}
                  >
                    <td className="px-1 py-2 text-[var(--ink-2)]">
                      {s.label}
                    </td>
                    <td className="px-1 py-2 text-right font-mono tabular-nums text-[var(--ink)]">
                      {s.maandInkomen > 0
                        ? formatCurrency(s.maandInkomen)
                        : '\u2013'}
                    </td>
                    <td className="px-1 py-2 text-right font-mono tabular-nums text-[var(--ink)]">
                      {formatCurrency(s.eindVermogen ?? 0)}
                    </td>
                    <td
                      className={`px-1 py-2 text-right font-mono tabular-nums ${
                        s.verschil > 0
                          ? 'text-[var(--positive)]'
                          : s.verschil < 0
                            ? 'text-[var(--negative)]'
                            : 'text-[var(--ink-4)]'
                      }`}
                    >
                      {s.verschil !== 0
                        ? `${s.verschil > 0 ? '+' : ''}${formatCurrency(s.verschil)}`
                        : '\u2013'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Keerzijde: vrijheidsdagen verloren ─────────────── */}
          <div className="rounded-[var(--r)] border border-dashed border-amber-400/30 bg-amber-50/50 p-3 dark:bg-amber-900/10">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Keerzijde: minder vrije tijd
            </p>
            <div className="space-y-1">
              {state.scenarios
                .filter((s) => s.werkdagen > 0)
                .map((s) => (
                  <div
                    key={s.werkdagen}
                    className="flex justify-between text-xs"
                  >
                    <span className="text-[var(--ink-3)]">{s.label}</span>
                    <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                      &minus;{s.vrijheidsdagenVerloren} dagen/jaar
                    </span>
                  </div>
                ))}
            </div>
            <p className="mt-2 text-[11px] italic leading-relaxed text-[var(--ink-4)]">
              Elke werkdag is een dag minder volledige vrijheid. Weeg het financiele voordeel af tegen de tijd die je inlevert.
            </p>
          </div>
        </div>
      )}
    </AnalysisSection>
  )
})

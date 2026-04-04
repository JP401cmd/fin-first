'use client'

import { useMemo, useState, useCallback } from 'react'
import { ChevronDown, ChevronRight, TrendingDown, Landmark, Target, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { FireParams } from '@/lib/fire-params'
import { parseFireStrategy, STRATEGY_LABELS, type FireEndStrategy, type FireStrategyConfig } from '@/lib/fire-strategy'
import { NL_AOW_AGE, NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND, NL_SWR } from '@/lib/constants'
import { computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'

// ── Helpers ────────────────────────────────────────────────────

function ageFromDob(dob: string): number {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
}

/** Project total portfolio forward to a target age (simple compound growth). */
function projectPortfolio(
  currentNetWorth: number,
  annualSavings: number,
  grossReturn: number,
  inflationRate: number,
  yearsToProject: number,
): number {
  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  let portfolio = currentNetWorth
  for (let y = 0; y < yearsToProject; y++) {
    portfolio = portfolio * (1 + realReturn) + annualSavings
  }
  return portfolio
}

/** Compute crossover age: when portfolio meets FIRE target. Returns null if never reached. */
function computeCrossoverAge(
  currentAge: number,
  currentNetWorth: number,
  annualSavings: number,
  grossReturn: number,
  inflationRate: number,
  fireTarget: number,
  maxAge: number = 100,
): number | null {
  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  let portfolio = currentNetWorth
  for (let y = 0; y <= maxAge - currentAge; y++) {
    if (portfolio >= fireTarget) return currentAge + y
    portfolio = portfolio * (1 + realReturn) + annualSavings
  }
  return null
}

/** Generate withdrawal schedule (decumulation table). */
interface WithdrawalRow {
  age: number
  year: number
  startBalance: number
  withdrawal: number
  aowIncome: number
  growth: number
  endBalance: number
}

function computeWithdrawalSchedule(
  startPortfolio: number,
  retirementAge: number,
  endAge: number,
  yearlyExpenses: number,
  grossReturn: number,
  inflationRate: number,
  hasPartner: boolean,
  strategy: FireEndStrategy,
  legacyAmount: number,
): WithdrawalRow[] {
  const totalYears = endAge - retirementAge
  if (totalYears <= 0 || startPortfolio <= 0) return []

  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const aowYearly = (hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12

  // Determine annual withdrawal amount based on strategy
  let baseWithdrawal: number
  if (strategy === 'perpetual') {
    // SWR-based: withdraw effectiveSwr × portfolio (recalculated yearly)
    baseWithdrawal = startPortfolio * NL_SWR
  } else if (strategy === 'deplete') {
    // Annuity formula: withdraw evenly so portfolio hits 0 at endAge
    if (realReturn === 0) {
      baseWithdrawal = startPortfolio / totalYears
    } else {
      baseWithdrawal = startPortfolio * realReturn / (1 - Math.pow(1 + realReturn, -totalYears))
    }
  } else if (strategy === 'legacy') {
    // Annuity that preserves legacyAmount at endAge
    const netPortfolio = startPortfolio - legacyAmount * Math.pow(1 + realReturn, -totalYears)
    if (realReturn === 0) {
      baseWithdrawal = Math.max(0, netPortfolio / totalYears)
    } else {
      baseWithdrawal = Math.max(0, netPortfolio * realReturn / (1 - Math.pow(1 + realReturn, -totalYears)))
    }
  } else {
    // pensioen / default: SWR-based
    baseWithdrawal = startPortfolio * NL_SWR
  }

  const schedule: WithdrawalRow[] = []
  let balance = startPortfolio

  for (let y = 0; y < totalYears; y++) {
    const age = retirementAge + y
    const startBalance = balance
    const aow = age >= NL_AOW_AGE ? aowYearly : 0

    // How much do we need from portfolio?
    let neededFromPortfolio: number
    if (strategy === 'perpetual') {
      // Variable: SWR of current balance
      neededFromPortfolio = Math.max(0, Math.min(balance * NL_SWR, yearlyExpenses - aow))
    } else {
      neededFromPortfolio = Math.max(0, baseWithdrawal - aow)
    }

    const withdrawal = Math.min(neededFromPortfolio, balance)
    const remaining = balance - withdrawal
    const growth = remaining * realReturn
    const endBalance = remaining + growth

    schedule.push({
      age,
      year: y + 1,
      startBalance: Math.round(startBalance),
      withdrawal: Math.round(withdrawal),
      aowIncome: Math.round(aow),
      growth: Math.round(growth),
      endBalance: Math.max(0, Math.round(endBalance)),
    })

    balance = Math.max(0, endBalance)
    if (balance <= 0) break
  }

  return schedule
}

// ── Display helpers ─────────────────────────────────────────

function getDisplayRows(schedule: WithdrawalRow[]): WithdrawalRow[] {
  if (schedule.length <= 20) return schedule
  // Sample: first 5, then every 5th, last 3
  const result: WithdrawalRow[] = schedule.slice(0, 5)
  for (let i = 5; i < schedule.length - 3; i++) {
    if (i % 5 === 0) result.push(schedule[i])
  }
  result.push(...schedule.slice(-3))
  return result
}

// ── Main Component ──────────────────────────────────────────

export function AfbouwClient({
  assets,
  debts,
  profile,
  fireParams,
  yearlyMustExpenses,
}: {
  assets: Asset[]
  debts: Debt[]
  profile: Record<string, unknown> | null
  fireParams: FireParams
  yearlyMustExpenses: number
}) {
  // ── Profile-derived values ──
  const dateOfBirth = typeof profile?.date_of_birth === 'string' ? profile.date_of_birth : null
  const currentAge = dateOfBirth ? ageFromDob(dateOfBirth) : null
  const profileMonthlyIncome = Number(profile?.net_monthly_income ?? 0)
  const profileMonthlyExpenses = Number(profile?.estimated_monthly_expenses ?? 0)
  const profileSavingsRate = Number(profile?.savings_rate ?? 0)
  const householdType = String(profile?.household_type ?? 'solo')
  const hasPartner = householdType === 'samenwonend' || householdType === 'getrouwd'

  // Retirement expense method
  const retirementMethod = (profile?.retirement_expense_method as RetirementExpenseMethod) ?? 'essential_budgets'
  const retirementCustomAmount = Number(profile?.retirement_expense_custom_amount ?? 0)

  // FIRE strategy
  const strategyConfig: FireStrategyConfig = parseFireStrategy(profile ?? {})

  // ── Computed values ──
  const totalAssets = assets.reduce((s, a) => s + Number(a.current_value ?? 0), 0)
  const totalDebts = debts.reduce((s, d) => s + Number(d.current_balance ?? 0), 0)
  const netWorth = totalAssets - totalDebts
  const annualSavings = profileMonthlyIncome * (profileSavingsRate / 100) * 12

  // Yearly expenses for retirement
  const yearlyRetirementExpenses = useMemo(() => {
    return computeRetirementExpenses(
      retirementMethod,
      yearlyMustExpenses,
      profileMonthlyIncome * 12,
      retirementCustomAmount,
      profileMonthlyExpenses * 12,
    )
  }, [retirementMethod, yearlyMustExpenses, profileMonthlyIncome, retirementCustomAmount, profileMonthlyExpenses])

  const monthlyRetirementExpenses = yearlyRetirementExpenses / 12

  // FIRE target
  const fireTarget = useMemo(() => {
    if (yearlyRetirementExpenses <= 0) return 0
    if (strategyConfig.strategy === 'deplete' && currentAge != null) {
      const yearsInRetirement = Math.max(1, strategyConfig.endAge - (currentAge ?? 67))
      const realReturn = (1 + fireParams.grossReturn) / (1 + fireParams.inflationRate) - 1
      if (realReturn === 0) return yearlyRetirementExpenses * yearsInRetirement
      return yearlyRetirementExpenses * (1 - Math.pow(1 + realReturn, -yearsInRetirement)) / realReturn
    }
    return yearlyRetirementExpenses / NL_SWR
  }, [yearlyRetirementExpenses, strategyConfig, currentAge, fireParams])

  // Cap end age at 100 (consistent with opbouw tables)
  const displayEndAge = Math.max(strategyConfig.endAge, 100)

  // Crossover age
  const crossoverAge = useMemo(() => {
    if (currentAge == null || fireTarget <= 0) return null
    return computeCrossoverAge(
      currentAge, netWorth, annualSavings,
      fireParams.grossReturn, fireParams.inflationRate,
      fireTarget, displayEndAge,
    )
  }, [currentAge, netWorth, annualSavings, fireParams, fireTarget, displayEndAge])

  // Retirement age (crossover or AOW, whichever is later for display)
  const retirementAge = crossoverAge ?? (currentAge != null ? Math.max(currentAge + 5, NL_AOW_AGE) : NL_AOW_AGE)

  // Projected portfolio at retirement
  const portfolioAtRetirement = useMemo(() => {
    if (currentAge == null) return netWorth
    const years = Math.max(0, retirementAge - currentAge)
    return projectPortfolio(netWorth, annualSavings, fireParams.grossReturn, fireParams.inflationRate, years)
  }, [currentAge, netWorth, annualSavings, fireParams, retirementAge])

  // Withdrawal schedule
  const withdrawalSchedule = useMemo(() => {
    return computeWithdrawalSchedule(
      portfolioAtRetirement,
      retirementAge,
      displayEndAge,
      yearlyRetirementExpenses,
      fireParams.grossReturn,
      fireParams.inflationRate,
      hasPartner,
      strategyConfig.strategy,
      strategyConfig.legacyAmount,
    )
  }, [portfolioAtRetirement, retirementAge, strategyConfig, yearlyRetirementExpenses, fireParams, hasPartner])

  const displayRows = useMemo(() => getDisplayRows(withdrawalSchedule), [withdrawalSchedule])
  const depleted = withdrawalSchedule.length > 0 && withdrawalSchedule[withdrawalSchedule.length - 1].endBalance <= 0

  // ── Section state ──
  const [expensesExpanded, setExpensesExpanded] = useState(true)
  const [strategyExpanded, setStrategyExpanded] = useState(true)
  const [crossoverExpanded, setCrossoverExpanded] = useState(true)

  return (
    <div className="space-y-8">
      {/* ── Summary header ── */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
        <h2 className="text-lg font-bold text-[var(--ink)]">Afbouw — Decumulatiefase</h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Hoe je vermogen wordt opgebruikt na financiele onafhankelijkheid
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Huidig netto vermogen</p>
            <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
              {formatCurrency(netWorth)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--ink-4)]">FIRE-doelvermogen</p>
            <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-[var(--ink)]">
              {formatCurrency(fireTarget)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Eindstrategie</p>
            <p className="mt-0.5 text-base font-semibold text-[var(--ink)]">
              {STRATEGY_LABELS[strategyConfig.strategy]?.name ?? strategyConfig.strategy}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--ink-4)]">
              {crossoverAge != null ? 'Kruispunt' : 'Pensioenleeftijd'}
            </p>
            <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-horizon-600">
              {crossoverAge != null ? `${crossoverAge} jaar` : `${retirementAge} jaar`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Section 1: Noodzakelijke uitgaven ── */}
      <section>
        <button
          onClick={() => setExpensesExpanded(!expensesExpanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {expensesExpanded ? <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />}
          <Landmark className="h-4 w-4 text-horizon-500" />
          <h3 className="text-base font-bold text-[var(--ink)]">Noodzakelijke uitgaven</h3>
        </button>

        {expensesExpanded && (
          <>
            {/* Reference strip: expense amount + inflation rate */}
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Maandelijks bedrag</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {monthlyRetirementExpenses > 0 ? formatCurrency(monthlyRetirementExpenses) : '—'}
                </span>
                {monthlyRetirementExpenses <= 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    niet ingesteld
                  </span>
                )}
              </div>
              <div className="h-4 w-px bg-[var(--border-ed)]" />
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Jaarlijks bedrag</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {yearlyRetirementExpenses > 0 ? formatCurrency(yearlyRetirementExpenses) : '—'}
                </span>
              </div>
              <div className="h-4 w-px bg-[var(--border-ed)]" />
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Inflatievoet</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {(fireParams.inflationRate * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
            <div className="overflow-auto max-h-[50vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                    <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Categorie</th>
                    <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Maandelijks</th>
                    <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Jaarlijks</th>
                    <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">% van totaal</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Method info row */}
                  <tr className="border-b border-[var(--border-ed)]/50">
                    <td colSpan={4} className="px-3 py-2 text-xs text-[var(--ink-3)]">
                      Berekeningsmethode:{' '}
                      <span className="font-medium text-[var(--ink-2)]">
                        {retirementMethod === 'essential_budgets' ? 'Essentiële budgetten' :
                         retirementMethod === 'custom_amount' ? 'Handmatig bedrag' :
                         retirementMethod === 'current_income' ? 'Huidig inkomen' : retirementMethod}
                      </span>
                    </td>
                  </tr>

                  {/* Retirement expenses */}
                  <tr className="border-b border-[var(--border-ed)]/50 odd:bg-[var(--subtle)]/30">
                    <td className="px-3 py-1 font-medium text-[var(--ink)]">Levensonderhoud</td>
                    <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                      {formatCurrency(monthlyRetirementExpenses)}
                    </td>
                    <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                      {formatCurrency(yearlyRetirementExpenses)}
                    </td>
                    <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-3)]">100%</td>
                  </tr>

                  {/* AOW income offset */}
                  <tr className="border-b border-[var(--border-ed)]/50 odd:bg-[var(--subtle)]/30">
                    <td className="px-3 py-1 font-medium text-emerald-700">AOW-uitkering (aftrek)</td>
                    <td className="px-3 py-1 text-right font-mono tabular-nums text-emerald-600">
                      -{formatCurrency(hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY)}
                    </td>
                    <td className="px-3 py-1 text-right font-mono tabular-nums text-emerald-600">
                      -{formatCurrency((hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12)}
                    </td>
                    <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-3)]">
                      {yearlyRetirementExpenses > 0
                        ? `${Math.round(((hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12 / yearlyRetirementExpenses) * 100)}%`
                        : '-'}
                    </td>
                  </tr>

                  {/* Net needed from portfolio */}
                  <tr className="border-b border-[var(--border-ed)]/50 bg-horizon-50/30">
                    <td className="px-3 py-1.5 font-bold text-[var(--ink)]">Netto uit vermogen nodig</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-horizon-700">
                      {formatCurrency(Math.max(0, monthlyRetirementExpenses - (hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY)))}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-horizon-700">
                      {formatCurrency(Math.max(0, yearlyRetirementExpenses - (hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12))}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink-3)]">
                      {yearlyRetirementExpenses > 0
                        ? `${Math.max(0, Math.round((1 - ((hasPartner ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY) * 12 / yearlyRetirementExpenses)) * 100))}%`
                        : '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {yearlyRetirementExpenses <= 0 && (
              <div className="border-t border-[var(--border-ed)] bg-amber-50/50 px-3 py-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-800">
                    Geen uitgavenschatting beschikbaar. Stel je pensioenuitgaven in via{' '}
                    <span className="font-medium">Identiteit &rarr; Instellingen &rarr; FIRE Instellingen</span>.
                  </p>
                </div>
              </div>
            )}
          </div>
          </>
        )}
      </section>

      {/* ── Section 2: Eindstrategie-tabellen ── */}
      <section>
        <button
          onClick={() => setStrategyExpanded(!strategyExpanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {strategyExpanded ? <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />}
          <TrendingDown className="h-4 w-4 text-horizon-500" />
          <h3 className="text-base font-bold text-[var(--ink)]">Eindstrategie-tabellen</h3>
          <span className="ml-2 rounded-full bg-horizon-100 px-2 py-0.5 text-[10px] font-semibold text-horizon-700">
            {STRATEGY_LABELS[strategyConfig.strategy]?.name ?? strategyConfig.strategy}
          </span>
        </button>

        {strategyExpanded && (
          <div className="mt-4 space-y-4">
            {/* Strategy info */}
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-3">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Strategie</p>
                  <p className="mt-0.5 text-sm font-semibold text-[var(--ink)]">
                    {STRATEGY_LABELS[strategyConfig.strategy]?.name}
                  </p>
                  <p className="text-[11px] text-[var(--ink-3)]">
                    {STRATEGY_LABELS[strategyConfig.strategy]?.subtitle}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Vermogen bij start</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {formatCurrency(portfolioAtRetirement)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Einddoel</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {strategyConfig.strategy === 'legacy'
                      ? formatCurrency(strategyConfig.legacyAmount)
                      : strategyConfig.strategy === 'perpetual'
                        ? 'Behouden'
                        : strategyConfig.strategy === 'deplete'
                          ? `${formatCurrency(0)} op ${displayEndAge}j`
                          : `AOW op ${NL_AOW_AGE}j`}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Duur</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {Math.max(0, displayEndAge - retirementAge)} jaar
                  </p>
                </div>
              </div>
            </div>

            {/* Withdrawal table */}
            {withdrawalSchedule.length > 0 ? (
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
                <div className="overflow-auto max-h-[70vh]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                        <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Leeftijd</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Startbalans</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Onttrekking</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">AOW</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Rendement</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Eindbalans</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row, idx) => (
                        <tr
                          key={row.age}
                          className={`border-b border-[var(--border-ed)]/50 ${
                            row.endBalance <= 0
                              ? 'bg-emerald-50/60'
                              : idx % 2 === 1
                                ? 'bg-[var(--subtle)]/30'
                                : ''
                          }`}
                        >
                          <td className="px-3 py-1 font-medium text-[var(--ink)]">
                            {row.age}j
                            {row.age === NL_AOW_AGE && (
                              <span className="ml-1 text-[10px] text-emerald-600 font-medium">AOW</span>
                            )}
                          </td>
                          <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                            {formatCurrency(row.startBalance)}
                          </td>
                          <td className="px-3 py-1 text-right font-mono tabular-nums text-red-600">
                            -{formatCurrency(row.withdrawal)}
                          </td>
                          <td className="px-3 py-1 text-right font-mono tabular-nums text-emerald-600">
                            {row.aowIncome > 0 ? `+${formatCurrency(row.aowIncome)}` : '-'}
                          </td>
                          <td className={`px-3 py-1 text-right font-mono tabular-nums ${row.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {row.growth >= 0 ? '+' : ''}{formatCurrency(row.growth)}
                          </td>
                          <td className={`px-3 py-1 text-right font-mono font-semibold tabular-nums ${
                            row.endBalance <= 0 ? 'text-emerald-600' : 'text-[var(--ink)]'
                          }`}>
                            {row.endBalance <= 0 ? `${formatCurrency(0)} \u2713` : formatCurrency(row.endBalance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                        <td className="px-3 py-1.5 font-bold text-[var(--ink)]">Totaal</td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                          {formatCurrency(withdrawalSchedule[0]?.startBalance ?? 0)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-red-600">
                          -{formatCurrency(withdrawalSchedule.reduce((s, r) => s + r.withdrawal, 0))}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-emerald-600">
                          +{formatCurrency(withdrawalSchedule.reduce((s, r) => s + r.aowIncome, 0))}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-emerald-600">
                          +{formatCurrency(withdrawalSchedule.reduce((s, r) => s + r.growth, 0))}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                          {formatCurrency(withdrawalSchedule[withdrawalSchedule.length - 1]?.endBalance ?? 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Status indicator */}
                <div className={`border-t border-[var(--border-ed)] px-3 py-2 text-xs ${
                  depleted ? 'bg-amber-50/50 text-amber-800' : 'bg-emerald-50/50 text-emerald-800'
                }`}>
                  {depleted ? (
                    <span>Vermogen raakt op voor leeftijd {displayEndAge}. Overweeg een langere opbouwfase of lagere uitgaven.</span>
                  ) : strategyConfig.strategy === 'perpetual' ? (
                    <span>Vermogen blijft behouden op {formatCurrency(withdrawalSchedule[withdrawalSchedule.length - 1]?.endBalance ?? 0)} na {withdrawalSchedule.length} jaar.</span>
                  ) : (
                    <span>
                      {strategyConfig.strategy === 'legacy'
                        ? `Restvermogen op ${displayEndAge}j: ${formatCurrency(withdrawalSchedule[withdrawalSchedule.length - 1]?.endBalance ?? 0)} (doel: ${formatCurrency(strategyConfig.legacyAmount)})`
                        : `Vermogen wordt over ${withdrawalSchedule.length} jaar afgebouwd tot ${formatCurrency(withdrawalSchedule[withdrawalSchedule.length - 1]?.endBalance ?? 0)}.`}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/30 px-4 py-8 text-center">
                <TrendingDown className="mx-auto h-8 w-8 text-[var(--ink-4)]" />
                <p className="mt-2 text-sm font-medium text-[var(--ink-3)]">
                  Geen onttrekkingsschema beschikbaar
                </p>
                <p className="mt-1 text-xs text-[var(--ink-4)]">
                  Vul je profiel en financiele gegevens aan om de afbouwfase te berekenen.
                </p>
              </div>
            )}

            {/* Decumulation SVG chart */}
            {withdrawalSchedule.length > 0 && (
              <DecumulationChart schedule={withdrawalSchedule} endAge={displayEndAge} retirementAge={retirementAge} />
            )}
          </div>
        )}
      </section>

      {/* ── Section 3: Kruispuntbepaling ── */}
      <section>
        <button
          onClick={() => setCrossoverExpanded(!crossoverExpanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {crossoverExpanded ? <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />}
          <Target className="h-4 w-4 text-horizon-500" />
          <h3 className="text-base font-bold text-[var(--ink)]">Kruispuntbepaling</h3>
        </button>

        {crossoverExpanded && (
          <div className="mt-4 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
            <div className="p-5">
              {currentAge == null ? (
                <div className="text-center py-6">
                  <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
                  <p className="mt-2 text-sm text-[var(--ink-3)]">
                    Geboortedatum niet ingesteld. Ga naar <span className="font-medium">Identiteit &rarr; Profiel</span> om je leeftijd in te voeren.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Key metrics */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Huidige leeftijd</p>
                      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
                        {currentAge}j
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Kruispuntleeftijd</p>
                      <p className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${crossoverAge != null ? 'text-horizon-600' : 'text-amber-600'}`}>
                        {crossoverAge != null ? `${crossoverAge}j` : 'Niet bereikt'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Jaren tot kruispunt</p>
                      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
                        {crossoverAge != null ? `${crossoverAge - currentAge}j` : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Vermogen bij kruispunt</p>
                      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
                        {crossoverAge != null
                          ? formatCurrency(projectPortfolio(
                              netWorth, annualSavings, fireParams.grossReturn, fireParams.inflationRate, crossoverAge - currentAge
                            ))
                          : '-'}
                      </p>
                    </div>
                  </div>

                  {/* Projection table: net worth vs FIRE target per year */}
                  <CrossoverTable
                    currentAge={currentAge}
                    netWorth={netWorth}
                    annualSavings={annualSavings}
                    grossReturn={fireParams.grossReturn}
                    inflationRate={fireParams.inflationRate}
                    fireTarget={fireTarget}
                    crossoverAge={crossoverAge}
                    maxAge={displayEndAge}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

// ── Crossover Table Component ──────────────────────────────

function CrossoverTable({
  currentAge,
  netWorth,
  annualSavings,
  grossReturn,
  inflationRate,
  fireTarget,
  crossoverAge,
  maxAge,
}: {
  currentAge: number
  netWorth: number
  annualSavings: number
  grossReturn: number
  inflationRate: number
  fireTarget: number
  crossoverAge: number | null
  maxAge: number
}) {
  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const displayMaxAge = Math.min(maxAge, currentAge + 50)

  const rows = useMemo(() => {
    const result: { age: number; portfolio: number; target: number; gap: number; reached: boolean }[] = []
    let portfolio = netWorth
    for (let age = currentAge; age <= displayMaxAge; age++) {
      const gap = portfolio - fireTarget
      result.push({ age, portfolio: Math.round(portfolio), target: Math.round(fireTarget), gap: Math.round(gap), reached: gap >= 0 })
      portfolio = portfolio * (1 + realReturn) + annualSavings
    }
    return result
  }, [currentAge, netWorth, annualSavings, realReturn, fireTarget, displayMaxAge])

  // Sample for display
  const displayRows = useMemo(() => {
    if (rows.length <= 15) return rows
    const result = [rows[0]]
    // Show every 5 years, plus crossover year +/- 1
    for (let i = 1; i < rows.length; i++) {
      const isCrossover = crossoverAge != null && Math.abs(rows[i].age - crossoverAge) <= 1
      const isInterval = i % 5 === 0
      const isLast = i === rows.length - 1
      if (isCrossover || isInterval || isLast) result.push(rows[i])
    }
    return result
  }, [rows, crossoverAge])

  return (
    <div className="rounded-lg border border-[var(--border-ed)] overflow-hidden">
      <div className="overflow-auto max-h-[50vh]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
              <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Leeftijd</th>
              <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Vermogen</th>
              <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">FIRE-doel</th>
              <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Verschil</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => (
              <tr
                key={row.age}
                className={`border-b border-[var(--border-ed)]/50 ${
                  crossoverAge != null && row.age === crossoverAge
                    ? 'bg-horizon-50/60 ring-1 ring-inset ring-horizon-300'
                    : row.reached
                      ? 'bg-emerald-50/30'
                      : idx % 2 === 1
                        ? 'bg-[var(--subtle)]/30'
                        : ''
                }`}
              >
                <td className="px-3 py-1 font-medium text-[var(--ink)]">
                  {row.age}j
                  {crossoverAge != null && row.age === crossoverAge && (
                    <span className="ml-1 inline-flex items-center rounded-full bg-horizon-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      KRUISPUNT
                    </span>
                  )}
                  {row.age === currentAge && (
                    <span className="ml-1 text-[10px] text-[var(--ink-3)] font-medium">nu</span>
                  )}
                </td>
                <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink)]">
                  {formatCurrency(row.portfolio)}
                </td>
                <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-3)]">
                  {formatCurrency(row.target)}
                </td>
                <td className={`px-3 py-1 text-right font-mono font-semibold tabular-nums ${row.gap >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {row.gap >= 0 ? '+' : ''}{formatCurrency(row.gap)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Decumulation Chart Component ────────────────────────────

function DecumulationChart({
  schedule,
  endAge,
  retirementAge,
}: {
  schedule: WithdrawalRow[]
  endAge: number
  retirementAge: number
}) {
  const width = 800
  const height = 200
  const margin = { top: 12, right: 16, bottom: 28, left: 60 }
  const chartW = width - margin.left - margin.right
  const chartH = height - margin.top - margin.bottom

  const maxBalance = Math.max(...schedule.map((r) => r.startBalance), ...schedule.map((r) => r.endBalance))
  const scaleX = (age: number) => margin.left + ((age - retirementAge) / Math.max(1, endAge - retirementAge)) * chartW
  const scaleY = (val: number) => margin.top + chartH - (maxBalance > 0 ? (val / maxBalance) * chartH : 0)

  // Build path for balance line
  const balancePath = schedule.map((r, i) => {
    const x = scaleX(r.age)
    const y = scaleY(r.startBalance)
    return `${i === 0 ? 'M' : 'L'}${x},${y}`
  }).join(' ')
  // Add final end balance
  const lastRow = schedule[schedule.length - 1]
  const fullPath = `${balancePath} L${scaleX(lastRow.age + 1)},${scaleY(lastRow.endBalance)}`

  // Area fill
  const areaPath = `${fullPath} L${scaleX(lastRow.age + 1)},${scaleY(0)} L${scaleX(retirementAge)},${scaleY(0)} Z`

  // X-axis labels
  const xLabels: number[] = []
  const step = endAge - retirementAge <= 20 ? 5 : 10
  for (let age = retirementAge; age <= endAge; age += step) {
    xLabels.push(age)
  }
  if (xLabels[xLabels.length - 1] !== endAge) xLabels.push(endAge)

  // Y-axis labels
  const ySteps = 4
  const yLabels: number[] = []
  for (let i = 0; i <= ySteps; i++) {
    yLabels.push(Math.round((maxBalance / ySteps) * i))
  }

  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
      <h4 className="text-sm font-semibold text-[var(--ink-2)] mb-3">Vermogensverloop afbouwfase</h4>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {yLabels.map((v) => (
          <line
            key={v}
            x1={margin.left}
            y1={scaleY(v)}
            x2={width - margin.right}
            y2={scaleY(v)}
            stroke="var(--border-ed)"
            strokeDasharray="3,3"
          />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="var(--color-horizon-100)" opacity="0.5" />

        {/* Balance line */}
        <path d={fullPath} fill="none" stroke="var(--color-horizon-500)" strokeWidth="2.5" />

        {/* X-axis labels */}
        {xLabels.map((age) => (
          <text
            key={age}
            x={scaleX(age)}
            y={height - 4}
            textAnchor="middle"
            className="text-[10px] fill-[var(--ink-4)]"
          >
            {age}j
          </text>
        ))}

        {/* Y-axis labels */}
        {yLabels.map((v) => (
          <text
            key={v}
            x={margin.left - 4}
            y={scaleY(v) + 3}
            textAnchor="end"
            className="text-[10px] fill-[var(--ink-4)]"
          >
            {v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : v}
          </text>
        ))}
      </svg>
    </div>
  )
}

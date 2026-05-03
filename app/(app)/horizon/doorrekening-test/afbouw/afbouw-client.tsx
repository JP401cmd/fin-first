'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, TrendingDown, Landmark, Target, AlertTriangle, CalendarClock, Shield, Gift, Zap } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { FireParams } from '@/lib/fire-params'
import { STRATEGY_LABELS, type FireEndStrategy, type FireStrategyConfig } from '@/lib/fire-strategy'
import { NL_AOW_AGE, NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND, NL_SWR } from '@/lib/constants'
import { computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import { PerpetualStrategyTables } from './perpetual-tables'
import { LegacyStrategyTables } from './legacy-tables'
import { PensionStrategyTables } from './pension-tables'
import { DepleteStrategyTables } from './deplete-tables'
import { SettingsBanner } from '../settings-banner'
import { useDoorrekeningSim } from '../use-doorrekening-sim'
import { useDoorrekeningSettings } from '../settings-context'
import { CrossCheckPanel } from '@/components/app/doorrekening/cross-check-panel'
import type { HybridProjectionInputs } from '../calc/hybrid-projection'
import type { AfbouwDistributionStrategy, WithdrawalStrategy as AfbouwWithdrawalStrategy } from '../calc/afbouw-projection'
import {
  computeRequiredPortfolio,
  computeMonthlyCrossover,
  computeWithdrawalSchedule,
  computeInflationExpenseSchedule,
  type WithdrawalStrategy,
  type MonthlyCrossover,
  type WithdrawalRow,
  type InflationExpenseRow,
} from '../calc/afbouw-projection'
import { Kicker } from '@/components/editorial'

// ── Withdrawal strategy types ─────────────────────────────────

export type WithdrawalStrategyType = 'swr' | 'guardrails' | 'vpw' | 'bucket'

export const WITHDRAWAL_STRATEGY_LABELS: Record<WithdrawalStrategyType, { name: string; subtitle: string }> = {
  swr: { name: 'Vast (SWR)', subtitle: 'Vaste onttrekking op basis van NL SWR' },
  guardrails: { name: 'Guardrails', subtitle: 'Variabel met vloer- en plafondgrenzen' },
  vpw: { name: 'VPW', subtitle: 'Variabel op basis van resterende levensverwachting' },
  bucket: { name: 'Bucket', subtitle: '3-emmers: cash, obligaties, aandelen' },
}

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

// ── Withdrawal strategy labels (locale labels voor UI) ──

const WITHDRAWAL_LABELS: Record<WithdrawalStrategy, { name: string; desc: string }> = {
  swr: { name: 'SWR', desc: 'Safe Withdrawal Rate' },
  guardrails: { name: 'Guardrails', desc: 'Variabele met bandbreedte' },
  vpw: { name: 'VPW', desc: 'Variable Percentage Withdrawal' },
  bucket: { name: 'Bucket', desc: 'Emmer-strategie' },
}

function getDisplayExpenseRows(rows: InflationExpenseRow[]): InflationExpenseRow[] {
  if (rows.length <= 24) return rows
  // Sample: first 6 months, then every 12th month (January), last 3
  const result: InflationExpenseRow[] = rows.slice(0, 6)
  for (let i = 6; i < rows.length - 3; i++) {
    if (rows[i].ageMonth === 0) result.push(rows[i]) // January of each year
  }
  result.push(...rows.slice(-3))
  return result
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
  lifeEvents,
  cashflows,
  netWorth,
  weightedGrossReturn,
  userAowAge,
  savingsRate6m,
  estimatedYearlyIncome,
}: {
  assets: Asset[]
  debts: Debt[]
  profile: Record<string, unknown> | null
  fireParams: FireParams
  yearlyMustExpenses: number
  lifeEvents: LifeEvent[]
  cashflows: SimCashflow[]
  netWorth: number
  weightedGrossReturn: number
  userAowAge: number
  savingsRate6m: number
  estimatedYearlyIncome: number
}) {
  // ── Profile-derived values ──
  const dateOfBirth = typeof profile?.date_of_birth === 'string' ? profile.date_of_birth : null
  const currentAge = dateOfBirth ? ageFromDob(dateOfBirth) : null
  // Prefer core-data extrapolated values (same source as kern header), fall back to profile.
  const profileMonthlyIncome = estimatedYearlyIncome > 0
    ? estimatedYearlyIncome / 12
    : Number(profile?.net_monthly_income ?? 0)
  const profileMonthlyExpenses = Number(profile?.estimated_monthly_expenses ?? 0)
  const profileSavingsRate = savingsRate6m !== 0
    ? savingsRate6m
    : Number(profile?.savings_rate ?? 0)
  const householdType = String(profile?.household_type ?? 'solo')
  const hasPartner = householdType === 'samenwonend' || householdType === 'getrouwd'

  // Retirement expense method
  const retirementMethod = (profile?.retirement_expense_method as RetirementExpenseMethod) ?? 'essential_budgets'
  const retirementCustomAmount = Number(profile?.retirement_expense_custom_amount ?? 0)

  // ── Instellingen uit layout-Context (gedeeld met /overzicht) ──
  const settings = useDoorrekeningSettings()
  const selectedEndStrategy: FireEndStrategy = settings.endStrategy
  const selectedWithdrawalStrategy: WithdrawalStrategyType = settings.withdrawalStrategy

  // Effective strategyConfig from Context
  const strategyConfig: FireStrategyConfig = useMemo(() => ({
    strategy: settings.endStrategy,
    endAge: settings.endAge,
    legacyAmount: settings.legacyAmount,
  }), [settings.endStrategy, settings.endAge, settings.legacyAmount])

  // ── Gedeelde simulatie — zelfde engine als /overzicht ──
  const sim = useDoorrekeningSim({
    currentAge: currentAge ?? 30,
    netWorth,
    monthlyIncome: profileMonthlyIncome,
    savingsRate: profileSavingsRate,
    yearlyMustExpenses,
    estimatedYearlyIncome,
    weightedGrossReturn,
    fireParams,
    lifeEvents,
    cashflows,
    userAowAge,
    profile: profile ?? {},
  })

  const annualSavings = profileMonthlyIncome * (profileSavingsRate / 100) * 12

  // Yearly expenses for retirement (zelfde resolver als hook, gedupliceerd voor UI-weergave).
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

  // Cross-check (H4) — vergelijkt lokale sim met hybride projectie. Verborgen
  // in productie; activeer met ?check=1 in URL.
  const hybridInputs = useMemo<HybridProjectionInputs>(() => {
    const displayEndAgeHybrid = settings.endStrategy === 'pensioen' ? 100 : settings.endAge
    const withdrawalStrategy: AfbouwWithdrawalStrategy =
      settings.withdrawalStrategy === 'swr' ? 'swr' : settings.withdrawalStrategy
    const distributionStrategy: AfbouwDistributionStrategy =
      settings.distributionStrategy === 'cash_first'
        ? 'cash_first'
        : settings.distributionStrategy === 'lowest_return'
          ? 'lowest_return_first'
          : settings.distributionStrategy === 'highest_return'
            ? 'highest_return_first'
            : 'proportional'
    const outflowDistribution: AfbouwDistributionStrategy =
      settings.outflowDistribution === 'cash_first'
        ? 'cash_first'
        : settings.outflowDistribution === 'lowest_return_first'
          ? 'lowest_return_first'
          : 'proportional'
    const withdrawalOrder: AfbouwDistributionStrategy =
      settings.withdrawalOrder === 'cash_first'
        ? 'cash_first'
        : settings.withdrawalOrder === 'low_return_first'
          ? 'lowest_return_first'
          : settings.withdrawalOrder === 'own_home_last'
            ? 'own_home_last'
            : settings.withdrawalOrder === 'highest_value_first'
              ? 'highest_value_first'
              : 'proportional'
    return {
      assets,
      debts,
      lifeEvents,
      cashflows,
      currentAge: currentAge ?? 30,
      endAge: displayEndAgeHybrid,
      fireParams,
      endStrategy: settings.endStrategy,
      endAgeConfig: settings.endAge,
      legacyAmount: settings.legacyAmount,
      withdrawalStrategy,
      distributionStrategy,
      outflowDistribution,
      withdrawalOrder,
      hasPartner,
      yearlyRetirementExpenses,
      aowAge: userAowAge,
      savingsInflow: { monthlyAmount: (profileMonthlyIncome * profileSavingsRate) / 100 },
    }
  }, [
    assets, debts, lifeEvents, cashflows, currentAge, fireParams,
    settings.endStrategy, settings.endAge, settings.legacyAmount,
    settings.withdrawalStrategy, settings.distributionStrategy, settings.outflowDistribution, settings.withdrawalOrder,
    hasPartner, yearlyRetirementExpenses, userAowAge,
    profileMonthlyIncome, profileSavingsRate,
  ])

  // FIRE-doelbedrag uit gedeelde sim (consistent met overzicht).
  const fireTarget = sim.requiredFirePortfolio

  // Display-horizon uit gedeelde sim — pensioen = 100j, anders endAge uit Context.
  const displayEndAge = sim.displayEndAge

  // Kruispunt uit gedeelde simulatie: sim.fireAge is de overgang opbouw→afbouw.
  const crossoverAge = sim.fireAge

  // Retirement age (crossover of AOW, wat later is voor display).
  const retirementAge = crossoverAge ?? (currentAge != null ? Math.max(currentAge + 5, NL_AOW_AGE) : NL_AOW_AGE)

  // Projected portfolio at retirement — uit gedeelde sim als fireAge bekend is,
  // anders fallback op lokale projectie naar AOW-leeftijd.
  const portfolioAtRetirement = useMemo(() => {
    if (sim.fireAge != null && sim.firePortfolioAtFire > 0) {
      return sim.firePortfolioAtFire
    }
    if (currentAge == null) return netWorth
    const years = Math.max(0, retirementAge - currentAge)
    return projectPortfolio(netWorth, annualSavings, fireParams.grossReturn, fireParams.inflationRate, years)
  }, [sim.fireAge, sim.firePortfolioAtFire, currentAge, netWorth, annualSavings, fireParams, retirementAge])

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
  }, [portfolioAtRetirement, retirementAge, displayEndAge, strategyConfig, yearlyRetirementExpenses, fireParams, hasPartner])

  const displayRows = useMemo(() => getDisplayRows(withdrawalSchedule), [withdrawalSchedule])
  const depleted = withdrawalSchedule.length > 0 && withdrawalSchedule[withdrawalSchedule.length - 1].endBalance <= 0

  // Inflation-adjusted expense schedule (month-by-month from current age to 100)
  const inflationExpenseSchedule = useMemo(() => {
    if (currentAge == null || monthlyRetirementExpenses <= 0) return []
    return computeInflationExpenseSchedule(
      monthlyRetirementExpenses,
      currentAge,
      displayEndAge,
      fireParams.inflationRate,
    )
  }, [currentAge, monthlyRetirementExpenses, displayEndAge, fireParams.inflationRate])

  const displayExpenseRows = useMemo(() => getDisplayExpenseRows(inflationExpenseSchedule), [inflationExpenseSchedule])

  // ── Section state ──
  const [expensesExpanded, setExpensesExpanded] = useState(true)
  const [inflationTableExpanded, setInflationTableExpanded] = useState(false)
  const [strategyExpanded, setStrategyExpanded] = useState(true)
  const [perpetualExpanded, setPerpetualExpanded] = useState(true)
  const [legacyExpanded, setLegacyExpanded] = useState(true)
  const [legacyTarget, setLegacyTarget] = useState(strategyConfig.legacyAmount || 250_000)
  const [depleteExpanded, setDepleteExpanded] = useState(true)
  const [crossoverExpanded, setCrossoverExpanded] = useState(true)
  const [pensionExpanded, setPensionExpanded] = useState(true)
  // NOTE: selectedEndStrategy and selectedWithdrawalStrategy are defined above (lines ~405-406)

  // Portfolio projected to AOW age (for pension strategy tables)
  const portfolioAtAow = useMemo(() => {
    if (currentAge == null) return netWorth
    const yearsToAow = Math.max(0, NL_AOW_AGE - currentAge)
    return projectPortfolio(netWorth, annualSavings, fireParams.grossReturn, fireParams.inflationRate, yearsToAow)
  }, [currentAge, netWorth, annualSavings, fireParams])

  // Annuity withdrawal for deplete strategy info strip
  const annuityWithdrawal = useMemo(() => {
    const totalYears = Math.max(0, displayEndAge - retirementAge)
    if (totalYears <= 0 || portfolioAtRetirement <= 0) return 0
    const realReturn = (1 + fireParams.grossReturn) / (1 + fireParams.inflationRate) - 1
    if (realReturn === 0) return portfolioAtRetirement / totalYears
    return portfolioAtRetirement * realReturn / (1 - Math.pow(1 + realReturn, -totalYears))
  }, [portfolioAtRetirement, retirementAge, displayEndAge, fireParams])

  // Monthly crossover computation (for enhanced kruispuntbepaling)
  const monthlyCrossoverResult = useMemo(() => {
    if (currentAge == null || yearlyRetirementExpenses <= 0) return null
    return computeMonthlyCrossover(
      currentAge, netWorth, annualSavings,
      fireParams.grossReturn, fireParams.inflationRate,
      yearlyRetirementExpenses, displayEndAge,
      selectedEndStrategy, selectedWithdrawalStrategy,
      hasPartner, strategyConfig.legacyAmount,
    )
  }, [currentAge, netWorth, annualSavings, fireParams, yearlyRetirementExpenses, displayEndAge, selectedEndStrategy, selectedWithdrawalStrategy, hasPartner, strategyConfig.legacyAmount])

  return (
    <div className="space-y-6">
      <SettingsBanner />

      <CrossCheckPanel
        pageName="afbouw"
        hybridInputs={hybridInputs}
        localFireAge={sim.fireAge ?? null}
        localEndPortfolio={sim.rows.at(-1)?.endPortfolio ?? null}
      />

      {/* ── Summary header — editorial blueprint ── */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-2">
          <span aria-hidden className="inline-block w-5 h-px shrink-0" style={{ background: 'var(--module-active-500)' }} />
          <span>Doorrekening · Afbouw</span>
        </div>
        <h2
          className="text-[20px] sm:text-[24px] font-black tracking-[-0.02em] leading-tight text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          Afbouw <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >Decumulatiefase</em>
        </h2>
        <p
          className="mt-2 italic text-[13px] text-[var(--ink-3)] leading-snug"
          style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
        >
          Hoe je vermogen wordt opgebruikt na financi&euml;le onafhankelijkheid.
        </p>

        {/* Key metrics */}
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
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Actieve combinatie</p>
            <p className="mt-0.5 text-sm font-semibold text-horizon-600">
              {STRATEGY_LABELS[selectedEndStrategy]?.name} + {WITHDRAWAL_STRATEGY_LABELS[selectedWithdrawalStrategy]?.name}
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

      {/* ── Summary Chart: Strategy Comparison ── */}
      {portfolioAtRetirement > 0 && currentAge != null && (
        <StrategyComparisonChart
          startPortfolio={portfolioAtRetirement}
          retirementAge={retirementAge}
          endAge={displayEndAge}
          yearlyExpenses={yearlyRetirementExpenses}
          grossReturn={fireParams.grossReturn}
          inflationRate={fireParams.inflationRate}
          selectedEndStrategy={selectedEndStrategy}
        />
      )}

      {/* ── Section 1: Noodzakelijke uitgaven ── */}
      <section>
        <button
          onClick={() => setExpensesExpanded(!expensesExpanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {expensesExpanded ? <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />}
          <Kicker>
            <Landmark className="h-3 w-3 -mt-0.5 inline mr-1" aria-hidden />
            Noodzakelijke uitgaven
          </Kicker>
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
                  <tr className="border-b border-[var(--border-ed)]/50 odd:bg-[var(--subtle)]/30 hover:bg-[var(--subtle)]/50">
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
                  <tr className="border-b border-[var(--border-ed)]/50 odd:bg-[var(--subtle)]/30 hover:bg-[var(--subtle)]/50">
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

      {/* ── Section 1b: Noodzakelijke uitgaven met inflatie (maand-op-maand) ── */}
      <section>
        <button
          onClick={() => setInflationTableExpanded(!inflationTableExpanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {inflationTableExpanded ? <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />}
          <Kicker>
            <CalendarClock className="h-3 w-3 -mt-0.5 inline mr-1" aria-hidden />
            Uitgaven met inflatie
          </Kicker>
          <span className="ml-2 rounded-full bg-horizon-100 px-2 py-0.5 text-[10px] font-semibold text-horizon-700">
            {(fireParams.inflationRate * 100).toFixed(1)}% /jr
          </span>
        </button>

        {inflationTableExpanded && (
          <div className="mt-4 space-y-3">
            {/* Info strip */}
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-2.5 text-xs text-[var(--ink-3)]">
              Startbedrag {formatCurrency(monthlyRetirementExpenses)}/mnd &times; maandelijkse inflatiecorrectie ({(fireParams.inflationRate * 100).toFixed(1)}%/jr).
              Tabel loopt van{' '}
              <span className="font-semibold text-[var(--ink-2)]">{currentAge ?? '?'}j</span> tot{' '}
              <span className="font-semibold text-[var(--ink-2)]">{displayEndAge}j</span>
              {' '}({inflationExpenseSchedule.length} maanden).
              Deze tabel dient als input voor alle eindstrategie-tabellen.
            </div>

            {inflationExpenseSchedule.length > 0 ? (
              <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
                <div className="overflow-auto max-h-[70vh]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                        <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Maand</th>
                        <th className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Leeftijd</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Basisuitgave</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Inflatie-correctie</th>
                        <th className="px-3 py-1.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Gecorrigeerd bedrag</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayExpenseRows.map((row, idx) => (
                        <tr
                          key={row.month}
                          className={`border-b border-[var(--border-ed)]/50 hover:bg-[var(--subtle)]/50 ${idx % 2 === 1 ? 'bg-[var(--subtle)]/30' : ''}`}
                        >
                          <td className="px-3 py-1 font-mono tabular-nums text-[var(--ink)]">{row.month}</td>
                          <td className="px-3 py-1 font-mono tabular-nums text-[var(--ink)]">
                            {row.age}j
                            {row.ageMonth > 0 && <span className="text-[var(--ink-4)]">+{row.ageMonth}m</span>}
                          </td>
                          <td className="px-3 py-1 text-right font-mono tabular-nums text-[var(--ink-3)]">
                            {formatCurrency(row.baseExpense)}
                          </td>
                          <td className={`px-3 py-1 text-right font-mono tabular-nums ${row.inflationCorrection > 0 ? 'text-red-500' : 'text-[var(--ink-4)]'}`}>
                            {row.inflationCorrection > 0 ? `+${formatCurrency(row.inflationCorrection)}` : '\u2014'}
                          </td>
                          <td className="px-3 py-1 text-right font-mono font-semibold tabular-nums text-[var(--ink)]">
                            {formatCurrency(row.adjustedExpense)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]">
                        <td colSpan={2} className="px-3 py-1.5 font-bold text-[var(--ink)]">
                          Laatste maand (mnd {inflationExpenseSchedule.length})
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--ink-3)]">
                          {formatCurrency(monthlyRetirementExpenses)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-red-500">
                          +{formatCurrency(inflationExpenseSchedule[inflationExpenseSchedule.length - 1]?.inflationCorrection ?? 0)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--ink)]">
                          {formatCurrency(inflationExpenseSchedule[inflationExpenseSchedule.length - 1]?.adjustedExpense ?? 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/30 px-4 py-8 text-center">
                <CalendarClock className="mx-auto h-8 w-8 text-[var(--ink-4)]" />
                <p className="mt-2 text-sm font-medium text-[var(--ink-3)]">
                  Geen uitgaventabel beschikbaar
                </p>
                <p className="mt-1 text-xs text-[var(--ink-4)]">
                  {currentAge == null
                    ? 'Stel je geboortedatum in via Identiteit → Profiel.'
                    : 'Stel je pensioenuitgaven in via Identiteit → Instellingen → FIRE Instellingen.'}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Section 2: Eindstrategie-tabellen ── */}
      <section>
        <button
          onClick={() => setStrategyExpanded(!strategyExpanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {strategyExpanded ? <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />}
          <Kicker>
            <TrendingDown className="h-3 w-3 -mt-0.5 inline mr-1" aria-hidden />
            Eindstrategie-tabellen
          </Kicker>
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
                  {(strategyConfig.strategy === 'perpetual' || strategyConfig.strategy === 'pensioen') && (
                    <p className="mt-0.5 font-mono text-[11px] font-medium text-horizon-600">
                      Vast (NL SWR {(NL_SWR * 100).toFixed(2).replace('.', ',')}%)
                    </p>
                  )}
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
                          className={`border-b border-[var(--border-ed)]/50 hover:bg-[var(--subtle)]/50 ${
                            row.endBalance <= 0
                              ? 'bg-emerald-50/60'
                              : row.age === retirementAge
                                ? 'bg-horizon-50/60'
                                : idx % 2 === 1
                                  ? 'bg-[var(--subtle)]/30'
                                  : ''
                          }`}
                        >
                          <td className="px-3 py-1 font-mono tabular-nums font-medium text-[var(--ink)]">
                            {row.age}j
                            {row.age === retirementAge && (
                              <span className="ml-1 inline-flex items-center rounded-full bg-horizon-500 px-1.5 py-0.5 text-[9px] font-bold text-white">⚡ KRUISPUNT</span>
                            )}
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

      {/* ── Section: Perpetual — Onttrekkingsstrategieën ── */}
      <section>
        <button
          onClick={() => setPerpetualExpanded(!perpetualExpanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {perpetualExpanded ? <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />}
          <Shield className="h-4 w-4 text-horizon-500" />
          <h3 className="text-base font-bold text-[var(--ink)]">Perpetual — Vermogen blijft intact</h3>
          <span className="ml-1 font-mono text-[11px] text-horizon-600">Vast (NL SWR {(NL_SWR * 100).toFixed(2).replace('.', ',')}%)</span>
        </button>

        {perpetualExpanded && portfolioAtRetirement > 0 && currentAge != null && (
          <div className="mt-4 space-y-6">
            <PerpetualStrategyTables
              startPortfolio={portfolioAtRetirement}
              retirementAge={retirementAge}
              endAge={displayEndAge}
              yearlyExpenses={yearlyRetirementExpenses}
              grossReturn={fireParams.grossReturn}
              inflationRate={fireParams.inflationRate}
              hasPartner={hasPartner}
              activeWithdrawalStrategy={selectedEndStrategy === 'perpetual' ? selectedWithdrawalStrategy : undefined}
            />
          </div>
        )}

        {perpetualExpanded && (portfolioAtRetirement <= 0 || currentAge == null) && (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/30 px-4 py-8 text-center">
            <Shield className="mx-auto h-8 w-8 text-[var(--ink-4)]" />
            <p className="mt-2 text-sm font-medium text-[var(--ink-3)]">
              Geen data beschikbaar voor perpetual-strategieën
            </p>
            <p className="mt-1 text-xs text-[var(--ink-4)]">
              Vul je profiel en financiële gegevens aan.
            </p>
          </div>
        )}
      </section>

      {/* ── Section: Legacy — Vermogen deels nalaten ── */}
      <section>
        <button
          onClick={() => setLegacyExpanded(!legacyExpanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {legacyExpanded ? <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />}
          <Gift className="h-4 w-4 text-horizon-500" />
          <h3 className="text-base font-bold text-[var(--ink)]">Legacy — Vermogen deels nalaten</h3>
        </button>

        {legacyExpanded && portfolioAtRetirement > 0 && currentAge != null && (
          <div className="mt-4 space-y-4">
            {/* Legacy target display / input */}
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Doelvermogen bij leeftijd {displayEndAge}</p>
                  {strategyConfig.legacyAmount > 0 ? (
                    <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                      {formatCurrency(legacyTarget)}
                    </p>
                  ) : (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-[var(--ink-3)]">&euro;</span>
                      <input
                        type="number"
                        value={legacyTarget}
                        onChange={(e) => setLegacyTarget(Math.max(0, Number(e.target.value)))}
                        className="w-32 rounded border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 font-mono text-sm tabular-nums text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-horizon-400"
                        min={0}
                        step={10000}
                      />
                      <span className="text-[11px] text-[var(--ink-4)]">(niet opgeslagen in profiel)</span>
                    </div>
                  )}
                </div>
                <div className="h-8 w-px bg-[var(--border-ed)]" />
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Startportfolio</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {formatCurrency(portfolioAtRetirement)}
                  </p>
                </div>
                <div className="h-8 w-px bg-[var(--border-ed)]" />
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Duur</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                    {Math.max(0, displayEndAge - retirementAge)} jaar
                  </p>
                </div>
              </div>
            </div>

            {legacyTarget > 0 && legacyTarget < portfolioAtRetirement ? (
              <LegacyStrategyTables
                startPortfolio={portfolioAtRetirement}
                retirementAge={retirementAge}
                endAge={displayEndAge}
                yearlyExpenses={yearlyRetirementExpenses}
                grossReturn={fireParams.grossReturn}
                inflationRate={fireParams.inflationRate}
                hasPartner={hasPartner}
                legacyAmount={legacyTarget}
                activeWithdrawalStrategy={selectedEndStrategy === 'legacy' ? selectedWithdrawalStrategy : undefined}
              />
            ) : legacyTarget >= portfolioAtRetirement ? (
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 px-4 py-6 text-center">
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
                <p className="mt-2 text-sm font-medium text-amber-800">
                  Doelvermogen ({formatCurrency(legacyTarget)}) is gelijk aan of groter dan de startportfolio ({formatCurrency(portfolioAtRetirement)}).
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  Er is geen ruimte voor onttrekkingen. Verlaag het doelvermogen of verhoog je portfolio.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/30 px-4 py-6 text-center">
                <Gift className="mx-auto h-8 w-8 text-[var(--ink-4)]" />
                <p className="mt-2 text-sm font-medium text-[var(--ink-3)]">
                  Voer een doelvermogen in om de nalatenschapsstrategieën te berekenen.
                </p>
              </div>
            )}
          </div>
        )}

        {legacyExpanded && (portfolioAtRetirement <= 0 || currentAge == null) && (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/30 px-4 py-8 text-center">
            <Gift className="mx-auto h-8 w-8 text-[var(--ink-4)]" />
            <p className="mt-2 text-sm font-medium text-[var(--ink-3)]">
              Geen data beschikbaar voor legacy-strategieën
            </p>
            <p className="mt-1 text-xs text-[var(--ink-4)]">
              Vul je profiel en financiële gegevens aan.
            </p>
          </div>
        )}
      </section>

      {/* ── Section: Deplete — Vermogen volledig opgebruiken ── */}
      <section>
        <button
          onClick={() => setDepleteExpanded(!depleteExpanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {depleteExpanded ? <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />}
          <Zap className="h-4 w-4 text-horizon-500" />
          <h3 className="text-base font-bold text-[var(--ink)]">Deplete — Vermogen volledig opgebruiken</h3>
        </button>

        {depleteExpanded && portfolioAtRetirement > 0 && currentAge != null && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-2.5 text-xs text-[var(--ink-3)]">
              Vier onttrekkingsmethoden die het vermogen volledig opgebruiken bij leeftijd {displayEndAge}.
              Annuïtaire onttrekking:{' '}
              <span className="font-semibold text-[var(--ink-2)]">{formatCurrency(Math.round(annuityWithdrawal))}</span>/jr.
            </div>
            <DepleteStrategyTables
              startPortfolio={portfolioAtRetirement}
              retirementAge={retirementAge}
              endAge={displayEndAge}
              yearlyExpenses={yearlyRetirementExpenses}
              grossReturn={fireParams.grossReturn}
              inflationRate={fireParams.inflationRate}
              hasPartner={hasPartner}
            />
          </div>
        )}

        {depleteExpanded && (portfolioAtRetirement <= 0 || currentAge == null) && (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/30 px-4 py-8 text-center">
            <Zap className="mx-auto h-8 w-8 text-[var(--ink-4)]" />
            <p className="mt-2 text-sm font-medium text-[var(--ink-3)]">
              Geen data beschikbaar voor deplete-strategieën
            </p>
            <p className="mt-1 text-xs text-[var(--ink-4)]">
              Vul je profiel en financiële gegevens aan.
            </p>
          </div>
        )}
      </section>

      {/* ── Section: Pensioenstrategie vanaf AOW ── */}
      <section>
        <button
          onClick={() => setPensionExpanded(!pensionExpanded)}
          className="flex w-full items-center gap-2 text-left"
        >
          {pensionExpanded ? <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ink-3)]" />}
          <Landmark className="h-4 w-4 text-horizon-500" />
          <h3 className="text-base font-bold text-[var(--ink)]">Pensioenstrategie vanaf AOW-leeftijd</h3>
          <span className="ml-2 rounded-full bg-horizon-100 px-2 py-0.5 text-[10px] font-semibold text-horizon-700">
            {NL_AOW_AGE}j → 100j
          </span>
        </button>

        {pensionExpanded && portfolioAtAow > 0 && currentAge != null && (
          <div className="mt-4 space-y-6">
            <PensionStrategyTables
              portfolioAtAow={portfolioAtAow}
              currentAge={currentAge}
              yearlyExpenses={yearlyRetirementExpenses}
              grossReturn={fireParams.grossReturn}
              inflationRate={fireParams.inflationRate}
              hasPartner={hasPartner}
              activeWithdrawalStrategy={selectedEndStrategy === 'pensioen' ? selectedWithdrawalStrategy : undefined}
            />
          </div>
        )}

        {pensionExpanded && (portfolioAtAow <= 0 || currentAge == null) && (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/30 px-4 py-8 text-center">
            <Landmark className="mx-auto h-8 w-8 text-[var(--ink-4)]" />
            <p className="mt-2 text-sm font-medium text-[var(--ink-3)]">
              Geen data beschikbaar voor pensioenstrategie
            </p>
            <p className="mt-1 text-xs text-[var(--ink-4)]">
              Vul je profiel en financiële gegevens aan.
            </p>
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
          {monthlyCrossoverResult && (
            <span className="ml-2 rounded-full bg-horizon-100 px-2 py-0.5 text-[10px] font-semibold text-horizon-700">
              {monthlyCrossoverResult.ageYears}j{monthlyCrossoverResult.ageMonths > 0 ? `+${monthlyCrossoverResult.ageMonths}m` : ''}
            </span>
          )}
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
                  {/* Monthly crossover result */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Huidige leeftijd</p>
                      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
                        {currentAge}j
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Kruispuntleeftijd</p>
                      <p className={`mt-0.5 font-mono text-lg font-bold tabular-nums ${monthlyCrossoverResult != null ? 'text-horizon-600' : 'text-amber-600'}`}>
                        {monthlyCrossoverResult != null
                          ? `${monthlyCrossoverResult.ageYears}j${monthlyCrossoverResult.ageMonths > 0 ? ` + ${monthlyCrossoverResult.ageMonths}m` : ''}`
                          : 'Niet bereikt'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Vermogen bij kruispunt</p>
                      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--ink)]">
                        {monthlyCrossoverResult != null
                          ? formatCurrency(monthlyCrossoverResult.portfolioAtCrossover)
                          : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-4)]">Benodigd vermogen</p>
                      <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-[var(--ink-2)]">
                        {monthlyCrossoverResult != null
                          ? formatCurrency(monthlyCrossoverResult.requiredPortfolio)
                          : formatCurrency(computeRequiredPortfolio(
                              yearlyRetirementExpenses, currentAge, displayEndAge,
                              fireParams.grossReturn, fireParams.inflationRate,
                              selectedEndStrategy, selectedWithdrawalStrategy,
                              hasPartner, strategyConfig.legacyAmount,
                            ))}
                      </p>
                    </div>
                  </div>

                  {/* Spaarquote stops indicator */}
                  {monthlyCrossoverResult && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-2.5 text-xs text-emerald-800">
                      <p className="font-semibold">
                        Stoppen met werken: {monthlyCrossoverResult.ageYears}j{monthlyCrossoverResult.ageMonths > 0 ? ` + ${monthlyCrossoverResult.ageMonths} maanden` : ''}
                      </p>
                      <p className="mt-0.5 text-emerald-700">
                        Vanaf dit punt worden inleg en spaarquote &rarr; &euro;0. Je vermogen draagt zichzelf via de {WITHDRAWAL_LABELS[selectedWithdrawalStrategy].name}-strategie ({STRATEGY_LABELS[selectedEndStrategy].name}).
                      </p>
                    </div>
                  )}

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
                    monthlyCrossover={monthlyCrossoverResult}
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
  monthlyCrossover,
}: {
  currentAge: number
  netWorth: number
  annualSavings: number
  grossReturn: number
  inflationRate: number
  fireTarget: number
  crossoverAge: number | null
  maxAge: number
  monthlyCrossover?: MonthlyCrossover | null
}) {
  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const displayMaxAge = Math.min(maxAge, currentAge + 50)
  const monthlyCrossoverAge = monthlyCrossover?.ageYears ?? crossoverAge

  const rows = useMemo(() => {
    const result: { age: number; portfolio: number; target: number; gap: number; reached: boolean; savingsActive: boolean }[] = []
    let portfolio = netWorth
    for (let age = currentAge; age <= displayMaxAge; age++) {
      const gap = portfolio - fireTarget
      const savingsActive = monthlyCrossoverAge == null || age < monthlyCrossoverAge
      result.push({ age, portfolio: Math.round(portfolio), target: Math.round(fireTarget), gap: Math.round(gap), reached: gap >= 0, savingsActive })
      // After crossover, savings → €0 (step 6: spaarquote → €0 from kruispunt)
      const effectiveSavings = savingsActive ? annualSavings : 0
      portfolio = portfolio * (1 + realReturn) + effectiveSavings
    }
    return result
  }, [currentAge, netWorth, annualSavings, realReturn, fireTarget, displayMaxAge, monthlyCrossoverAge])

  // Sample for display
  const displayRows = useMemo(() => {
    if (rows.length <= 15) return rows
    const result = [rows[0]]
    const xAge = monthlyCrossoverAge ?? crossoverAge
    for (let i = 1; i < rows.length; i++) {
      const isCrossover = xAge != null && Math.abs(rows[i].age - xAge) <= 1
      const isInterval = i % 5 === 0
      const isLast = i === rows.length - 1
      if (isCrossover || isInterval || isLast) result.push(rows[i])
    }
    return result
  }, [rows, crossoverAge, monthlyCrossoverAge])

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
            {displayRows.map((row, idx) => {
              const isCrossoverRow = monthlyCrossoverAge != null && row.age === monthlyCrossoverAge
              return (
                <tr
                  key={row.age}
                  className={`border-b border-[var(--border-ed)]/50 hover:bg-[var(--subtle)]/50 ${
                    isCrossoverRow
                      ? 'bg-horizon-50/60 ring-1 ring-inset ring-horizon-300'
                      : row.reached
                        ? 'bg-emerald-50/30'
                        : !row.savingsActive
                          ? 'bg-amber-50/20'
                          : idx % 2 === 1
                            ? 'bg-[var(--subtle)]/30'
                            : ''
                  }`}
                >
                  <td className="px-3 py-1 font-mono tabular-nums font-medium text-[var(--ink)]">
                    {row.age}j
                    {isCrossoverRow && (
                      <span className="ml-1 inline-flex items-center rounded-full bg-horizon-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        KRUISPUNT
                      </span>
                    )}
                    {row.age === currentAge && (
                      <span className="ml-1 text-[10px] text-[var(--ink-3)] font-medium">nu</span>
                    )}
                    {!row.savingsActive && !isCrossoverRow && (
                      <span className="ml-1 text-[10px] text-amber-600 font-medium">inleg €0</span>
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
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Decumulation Chart Component ────────────────────────────

// ── Strategy Comparison Chart ──────────────────────────────

/** Compute yearly portfolio balances for a given withdrawal strategy. */
function computeStrategyPath(
  startPortfolio: number,
  retirementAge: number,
  endAge: number,
  yearlyExpenses: number,
  grossReturn: number,
  inflationRate: number,
  strategy: 'swr' | 'guardrails' | 'vpw' | 'bucket',
): { age: number; balance: number }[] {
  const totalYears = Math.max(0, endAge - retirementAge)
  const realReturn = (1 + grossReturn) / (1 + inflationRate) - 1
  const NL_SWR_LOCAL = 0.02883
  const points: { age: number; balance: number }[] = [{ age: retirementAge, balance: startPortfolio }]

  if (strategy === 'swr') {
    let balance = startPortfolio
    for (let y = 0; y < totalYears && balance > 0; y++) {
      const withdrawal = Math.min(balance * NL_SWR_LOCAL, balance)
      const remainder = balance - withdrawal
      balance = remainder + remainder * realReturn
      points.push({ age: retirementAge + y + 1, balance: Math.max(0, balance) })
    }
  } else if (strategy === 'guardrails') {
    let balance = startPortfolio
    let currentWithdrawal = startPortfolio * NL_SWR_LOCAL
    const upperThreshold = startPortfolio * 1.2
    const lowerThreshold = startPortfolio * 0.8
    for (let y = 0; y < totalYears && balance > 0; y++) {
      if (balance > upperThreshold) currentWithdrawal *= 1.1
      else if (balance < lowerThreshold) currentWithdrawal *= 0.9
      const withdrawal = Math.min(currentWithdrawal, balance)
      const remainder = balance - withdrawal
      balance = remainder + remainder * realReturn
      points.push({ age: retirementAge + y + 1, balance: Math.max(0, balance) })
    }
  } else if (strategy === 'vpw') {
    let balance = startPortfolio
    for (let y = 0; y < totalYears && balance > 0; y++) {
      const age = retirementAge + y
      const remYears = Math.max(1, 100 - age)
      let rate: number
      if (remYears <= 1) rate = 1
      else if (realReturn === 0) rate = 1 / remYears
      else rate = realReturn / (1 - Math.pow(1 + realReturn, -remYears))
      const withdrawal = Math.min(balance * rate, balance)
      const remainder = balance - withdrawal
      balance = remainder + remainder * realReturn
      points.push({ age: retirementAge + y + 1, balance: Math.max(0, balance) })
    }
  } else if (strategy === 'bucket') {
    const cashBucket = yearlyExpenses * 2
    const bondBucket = yearlyExpenses * 5
    let cashBalance = Math.min(cashBucket, startPortfolio)
    let bondBalance = Math.min(bondBucket, Math.max(0, startPortfolio - cashBucket))
    let stockBalance = Math.max(0, startPortfolio - cashBucket - bondBucket)
    const bondReturn = realReturn * 0.3
    for (let y = 0; y < totalYears; y++) {
      const totalBalance = cashBalance + bondBalance + stockBalance
      if (totalBalance <= 0) { points.push({ age: retirementAge + y + 1, balance: 0 }); continue }
      const withdrawal = Math.min(yearlyExpenses, totalBalance)
      const fromCash = Math.min(withdrawal, cashBalance)
      cashBalance -= fromCash
      const fromBonds = Math.min(withdrawal - fromCash, bondBalance)
      bondBalance -= fromBonds
      const fromStocks = withdrawal - fromCash - fromBonds
      stockBalance = Math.max(0, stockBalance - fromStocks)
      stockBalance += stockBalance * realReturn
      bondBalance += bondBalance * bondReturn
      const cashTarget = Math.min(yearlyExpenses * 2, stockBalance + bondBalance + cashBalance)
      if (cashBalance < cashTarget && stockBalance > 0) {
        const refill = Math.min(cashTarget - cashBalance, stockBalance)
        cashBalance += refill
        stockBalance -= refill
      }
      points.push({ age: retirementAge + y + 1, balance: Math.max(0, cashBalance + bondBalance + stockBalance) })
    }
  }
  return points
}

const STRATEGY_COLORS: Record<string, { stroke: string; label: string }> = {
  swr: { stroke: '#6366f1', label: 'SWR (Safe Withdrawal Rate)' },       // indigo
  guardrails: { stroke: '#f59e0b', label: 'Guardrails (Variabel)' },      // amber
  vpw: { stroke: '#10b981', label: 'VPW (Variable %)' },                  // emerald
  bucket: { stroke: '#ef4444', label: 'Bucket (Emmers)' },                // red
}

function StrategyComparisonChart({
  startPortfolio,
  retirementAge,
  endAge,
  yearlyExpenses,
  grossReturn,
  inflationRate,
  selectedEndStrategy,
}: {
  startPortfolio: number
  retirementAge: number
  endAge: number
  yearlyExpenses: number
  grossReturn: number
  inflationRate: number
  selectedEndStrategy: string
}) {
  const strategies = ['swr', 'guardrails', 'vpw', 'bucket'] as const

  const paths = useMemo(() => {
    return strategies.map((s) => ({
      key: s,
      points: computeStrategyPath(startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate, s),
    }))
  }, [startPortfolio, retirementAge, endAge, yearlyExpenses, grossReturn, inflationRate])

  const width = 800
  const height = 280
  const margin = { top: 16, right: 16, bottom: 32, left: 68 }
  const chartW = width - margin.left - margin.right
  const chartH = height - margin.top - margin.bottom

  // Compute global max/min across all strategies
  const allBalances = paths.flatMap((p) => p.points.map((pt) => pt.balance))
  const maxBalance = Math.max(...allBalances, 1)
  const minBalance = Math.min(...allBalances, 0)
  const yMin = Math.min(0, minBalance)
  const yMax = maxBalance
  const yRange = yMax - yMin || 1

  const scaleX = (age: number) => margin.left + ((age - retirementAge) / Math.max(1, endAge - retirementAge)) * chartW
  const scaleY = (val: number) => margin.top + chartH - ((val - yMin) / yRange) * chartH

  // X-axis labels
  const xLabels: number[] = []
  const totalYears = endAge - retirementAge
  const step = totalYears <= 20 ? 5 : totalYears <= 40 ? 5 : 10
  for (let age = retirementAge; age <= endAge; age += step) xLabels.push(age)
  if (xLabels[xLabels.length - 1] !== endAge) xLabels.push(endAge)

  // Y-axis labels
  const ySteps = 5
  const yLabels: number[] = []
  for (let i = 0; i <= ySteps; i++) yLabels.push(yMin + (yRange / ySteps) * i)

  // Format Y values
  const fmtY = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`
    if (Math.abs(v) >= 1_000) return `€${Math.round(v / 1_000)}k`
    return `€${Math.round(v)}`
  }

  return (
    <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
      <h4 className="text-sm font-semibold text-[var(--ink)] mb-1">Vermogensverloop per onttrekkingsstrategie</h4>
      <p className="text-[11px] text-[var(--ink-3)] mb-3">
        Vergelijking van 4 strategieën vanaf {retirementAge}j tot {endAge}j · startportfolio {formatCurrency(startPortfolio)}
      </p>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {yLabels.map((v, i) => (
          <line key={i} x1={margin.left} y1={scaleY(v)} x2={width - margin.right} y2={scaleY(v)} stroke="var(--border-ed)" strokeDasharray="3,3" />
        ))}

        {/* €0 reference line */}
        {yMin < 0 && (
          <line x1={margin.left} y1={scaleY(0)} x2={width - margin.right} y2={scaleY(0)} stroke="var(--ink-4)" strokeWidth="1.5" strokeDasharray="6,4" />
        )}
        {yMin >= 0 && (
          <line x1={margin.left} y1={scaleY(0)} x2={width - margin.right} y2={scaleY(0)} stroke="var(--ink-4)" strokeWidth="1" strokeDasharray="6,4" />
        )}

        {/* Strategy lines */}
        {paths.map(({ key, points }) => {
          if (points.length < 2) return null
          const d = points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${scaleX(pt.age).toFixed(1)},${scaleY(pt.balance).toFixed(1)}`).join(' ')
          const color = STRATEGY_COLORS[key]
          const isSelected = selectedEndStrategy === 'perpetual' // all 4 shown for perpetual context
          return (
            <path
              key={key}
              d={d}
              fill="none"
              stroke={color.stroke}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={1}
            />
          )
        })}

        {/* End dots */}
        {paths.map(({ key, points }) => {
          if (points.length === 0) return null
          const last = points[points.length - 1]
          return (
            <circle
              key={`dot-${key}`}
              cx={scaleX(last.age)}
              cy={scaleY(last.balance)}
              r={3.5}
              fill={STRATEGY_COLORS[key].stroke}
              stroke="white"
              strokeWidth={1.5}
            />
          )
        })}

        {/* X-axis labels */}
        {xLabels.map((age) => (
          <text key={age} x={scaleX(age)} y={height - 4} textAnchor="middle" className="text-[10px] fill-[var(--ink-4)] font-mono">
            {age}j
          </text>
        ))}

        {/* Y-axis labels */}
        {yLabels.map((v, i) => (
          <text key={i} x={margin.left - 4} y={scaleY(v) + 3} textAnchor="end" className="text-[10px] fill-[var(--ink-4)] font-mono">
            {fmtY(Math.round(v))}
          </text>
        ))}

        {/* Axis lines */}
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + chartH} stroke="var(--border-ed)" />
        <line x1={margin.left} y1={margin.top + chartH} x2={width - margin.right} y2={margin.top + chartH} stroke="var(--border-ed)" />
      </svg>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {strategies.map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-5 rounded-full" style={{ backgroundColor: STRATEGY_COLORS[s].stroke }} />
            <span className="text-[11px] text-[var(--ink-2)]">{STRATEGY_COLORS[s].label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-[1px] w-5 border-t border-dashed border-[var(--ink-4)]" />
          <span className="text-[11px] text-[var(--ink-4)]">€0 referentie</span>
        </div>
      </div>
    </div>
  )
}

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
            className="text-[10px] fill-[var(--ink-4)] font-mono"
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
            className="text-[10px] fill-[var(--ink-4)] font-mono"
          >
            {v >= 1000000 ? `€${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `€${Math.round(v / 1000)}k` : `€${v}`}
          </text>
        ))}
      </svg>
    </div>
  )
}

'use client'

import { memo, useMemo } from 'react'
import { Landmark, CheckCircle2 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import {
  type Debt,
  type DebtType,
  DEBT_TYPE_LABELS,
  debtProjection,
} from '@/lib/debt-data'

// ── Types ────────────────────────────────────────────────────────────────────

interface SchuldenSamenvattingProps {
  debts: Debt[]
  annualSavings: number
  /** Annual return rate (e.g. 0.07 for 7%) used for FIRE impact calculation */
  annualReturn?: number
}

interface Scenario {
  /** Label: "10%", "20%", "30%" */
  label: string
  /** Percentage of monthly savings (0.1, 0.2, 0.3) */
  pct: number
  /** Extra monthly amount */
  extraPerMonth: number
  /** Months earlier debt-free */
  monthsEarlier: number
  /** Interest savings in EUR */
  interestSaved: number
  /** FIRE months impact: freed monthly payment invested grows to save X months */
  fireMonthsImpact: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a date string (YYYY-MM-DD) as "mrt 2029" style Dutch short date. */
function formatPayoffDate(dateStr: string): string {
  if (!dateStr) return '–'
  const d = new Date(dateStr)
  return d.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
}

/**
 * Estimate months to payoff using the annuity formula:
 *   n = -ln(1 - r·PV / PMT) / ln(1 + r)
 *
 * For zero-interest debts: n = PV / PMT.
 * Returns { months, totalInterest } where totalInterest = n·PMT - PV.
 * Handles edge cases: payment < interest (infinite), aflossingsvrij, etc.
 */
function estimatePayoff(
  balance: number,
  annualRate: number,
  monthlyPayment: number,
): { months: number; totalInterest: number } {
  if (balance <= 0 || monthlyPayment <= 0) {
    return { months: 0, totalInterest: 0 }
  }

  const r = annualRate / 100 / 12 // monthly rate

  if (r < 0.000001) {
    // Zero-interest: simple division
    const months = Math.ceil(balance / monthlyPayment)
    return { months, totalInterest: 0 }
  }

  // Check if payment covers interest: PMT > r·PV
  const monthlyInterest = r * balance
  if (monthlyPayment <= monthlyInterest) {
    // Payment doesn't cover interest — never pays off
    return { months: Infinity, totalInterest: Infinity }
  }

  // Annuity formula: n = -ln(1 - r·PV/PMT) / ln(1+r)
  const n = -Math.log(1 - (r * balance) / monthlyPayment) / Math.log(1 + r)
  const months = Math.ceil(n)
  const totalInterest = Math.max(0, months * monthlyPayment - balance)

  return { months, totalInterest }
}

/**
 * Estimate total months and interest across all active debts,
 * distributing optional extra monthly payment proportionally by balance.
 * Skips aflossingsvrij debts, mortgages (fixed-term), and debts where
 * payment can't cover interest. Extra payments target consumer debts
 * where accelerated payoff is most impactful.
 */
function estimatePortfolioPayoff(
  debts: Debt[],
  extraMonthly: number,
): { totalInterest: number; months: number } {
  // Only include consumer debts that benefit from extra payments
  // Mortgages are excluded (separate refinancing dynamics, fixed terms)
  const payableDebts = debts.filter((d) => {
    if (!d.is_active || d.current_balance <= 0) return false
    if (d.repayment_type === 'aflossingsvrij') return false
    if (d.debt_type === 'mortgage') return false
    // Skip debts where current payment doesn't cover interest
    const r = Number(d.interest_rate) / 100 / 12
    if (r > 0) {
      const monthlyInterest = r * Number(d.current_balance)
      if (Number(d.monthly_payment) <= monthlyInterest) return false
    }
    return true
  })
  if (payableDebts.length === 0) return { totalInterest: 0, months: 0 }

  const totalBalance = payableDebts.reduce((s, d) => s + Number(d.current_balance), 0)

  let maxMonths = 0
  let totalInterest = 0

  for (const debt of payableDebts) {
    const balance = Number(debt.current_balance)
    const rate = Number(debt.interest_rate)
    // Distribute extra proportionally by balance
    const extraForDebt = totalBalance > 0
      ? extraMonthly * (balance / totalBalance)
      : 0
    const payment = Number(debt.monthly_payment) + extraForDebt

    const result = estimatePayoff(balance, rate, payment)
    if (result.months === Infinity) continue // skip if still unpayable
    totalInterest += result.totalInterest
    maxMonths = Math.max(maxMonths, result.months)
  }

  return { totalInterest: Math.round(totalInterest), months: maxMonths }
}

/**
 * Calculate FIRE impact in months:
 * After debt payoff, the total monthly payment becomes available for investment.
 * Over the remaining accumulation years, this extra investment compounds and
 * reduces the time to FIRE.
 *
 * Simplified: extra monthly savings × months earlier × compounding factor
 * translates to freedom-months gained.
 */
function calculateFireMonthsImpact(
  monthlyPaymentFreed: number,
  monthsEarlier: number,
  annualReturn: number,
  annualExpenses: number,
): number {
  if (annualExpenses <= 0 || monthlyPaymentFreed <= 0 || monthsEarlier <= 0) return 0

  // After debt payoff, the freed monthly payment goes into investments.
  // Over the months saved, this compounds and creates additional portfolio value.
  const monthlyReturn = annualReturn / 12
  const monthsInvesting = monthsEarlier

  // Future value of annuity: PMT × ((1+r)^n - 1) / r
  let portfolioGain: number
  if (monthlyReturn > 0.0001) {
    portfolioGain =
      monthlyPaymentFreed *
      ((Math.pow(1 + monthlyReturn, monthsInvesting) - 1) / monthlyReturn)
  } else {
    portfolioGain = monthlyPaymentFreed * monthsInvesting
  }

  // Convert portfolio gain to months of freedom (expenses / 12 = monthly cost)
  const monthlyExpenses = annualExpenses / 12
  if (monthlyExpenses <= 0) return 0

  return Math.round(portfolioGain / monthlyExpenses)
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Compact debt summary for the accumulation phase analysis.
 *
 * Shows total outstanding debt, per-debt details (name, type, balance,
 * monthly payment, estimated payoff date), total monthly burden, and
 * three relative scenario comparisons (10%, 20%, 30% of monthly savings)
 * with months-earlier, interest savings, and FIRE impact.
 *
 * Returns null when there are no active debts with a positive balance.
 */
export const SchuldenSamenvatting = memo(function SchuldenSamenvatting({
  debts,
  annualSavings,
  annualReturn = 0.07,
}: SchuldenSamenvattingProps) {
  // Filter to active debts with a balance > 0
  const activeDebts = useMemo(
    () => debts.filter((d) => d.is_active && d.current_balance > 0),
    [debts],
  )

  // Compute scenarios
  const scenarios = useMemo(() => {
    if (activeDebts.length === 0) return []

    const monthlySavings = annualSavings / 12
    if (monthlySavings <= 0) return []

    const totalMonthlyPayment = activeDebts.reduce(
      (s, d) => s + d.monthly_payment,
      0,
    )

    // Baseline: current payoff without extra (annuity formula)
    const baseline = estimatePortfolioPayoff(activeDebts, 0)

    const percentages = [0.1, 0.2, 0.3]
    const labels = ['10%', '20%', '30%']

    return percentages.map((pct, i): Scenario => {
      const extraPerMonth = Math.round(monthlySavings * pct)
      if (extraPerMonth <= 0) {
        return {
          label: labels[i],
          pct,
          extraPerMonth: 0,
          monthsEarlier: 0,
          interestSaved: 0,
          fireMonthsImpact: 0,
        }
      }

      const accelerated = estimatePortfolioPayoff(activeDebts, extraPerMonth)
      const monthsEarlier = Math.max(0, baseline.months - accelerated.months)
      const interestSaved = Math.max(
        0,
        baseline.totalInterest - accelerated.totalInterest,
      )

      const fireMonthsImpact = calculateFireMonthsImpact(
        totalMonthlyPayment,
        monthsEarlier,
        annualReturn,
        annualSavings - annualSavings * pct, // remaining annual expenses proxy
      )

      return {
        label: labels[i],
        pct,
        extraPerMonth,
        monthsEarlier,
        interestSaved,
        fireMonthsImpact,
      }
    })
  }, [activeDebts, annualSavings, annualReturn])

  // Compute baseline total interest (annuity-based)
  const baselineInterest = useMemo(() => {
    if (activeDebts.length === 0) return 0
    const result = estimatePortfolioPayoff(activeDebts, 0)
    return result.totalInterest === Infinity ? 0 : result.totalInterest
  }, [activeDebts])

  // Show informational message when there are no active debts
  if (activeDebts.length === 0) {
    return (
      <AnalysisSection
        title="Schuldenanalyse"
        icon={Landmark}
        willContext=""
      >
        <div className="flex items-start gap-3 rounded-md bg-[var(--positive)]/8 px-3 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--positive)]" />
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">
              Je hebt geen schulden
            </p>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">
              Deze analyse is niet relevant — je volledige inkomen werkt voor je vrijheid.
            </p>
          </div>
        </div>
      </AnalysisSection>
    )
  }

  const totalDebt = activeDebts.reduce((s, d) => s + d.current_balance, 0)
  const totalMonthlyPayment = activeDebts.reduce(
    (s, d) => s + d.monthly_payment,
    0,
  )

  // Group debts by type for the overview
  const debtsByType = activeDebts.reduce<Record<DebtType, Debt[]>>(
    (acc, d) => {
      ;(acc[d.debt_type] ??= []).push(d)
      return acc
    },
    {} as Record<DebtType, Debt[]>,
  )

  // First scenario (10%) is the most achievable — green highlight
  const hasScenarios = scenarios.length > 0 && scenarios.some((s) => s.monthsEarlier > 0)

  return (
    <AnalysisSection
      title="Schuldenanalyse"
      icon={Landmark}
      willContext={`Schulden opbouwfase: ${activeDebts.length} schulden, totaal ${formatCurrency(totalDebt)}, maandlast ${formatCurrency(totalMonthlyPayment)}.`}
    >
      <div className="space-y-3">
        {/* ── Total overview ─────────────────────────────────── */}
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-[var(--ink-3)]">
            Totale schuld
          </span>
          <span className="font-mono text-sm tabular-nums text-[var(--ink)]">
            {formatCurrency(totalDebt)}
          </span>
        </div>

        {/* ── Per-debt details ───────────────────────────────── */}
        <div className="space-y-2">
          {Object.entries(debtsByType).map(([type, typeDebts]) => (
            <div key={type}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                {DEBT_TYPE_LABELS[type as DebtType] ?? type}
              </p>
              {typeDebts.map((debt) => {
                const projection = debtProjection(debt)
                return (
                  <div
                    key={debt.id}
                    className="mt-1 flex items-start justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[var(--ink-2)]">
                        {debt.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--ink-4)]">
                        {formatCurrency(debt.monthly_payment)}/mnd
                        {projection.payoffDate
                          ? ` · afgelost ${formatPayoffDate(projection.payoffDate)}`
                          : ''}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink)]">
                      {formatCurrency(debt.current_balance)}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* ── Monthly burden ─────────────────────────────────── */}
        <div className="flex items-baseline justify-between border-t border-dashed border-[var(--border-ed)] pt-2">
          <span className="text-xs text-[var(--ink-3)]">
            Totale maandlast
          </span>
          <span className="font-mono text-sm tabular-nums text-[var(--ink)]">
            {formatCurrency(totalMonthlyPayment)}/mnd
          </span>
        </div>

        {/* ── Total interest at current pace ───────────────── */}
        {baselineInterest > 0 && (
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[var(--ink-3)]">
              Totale rentelast
            </span>
            <span className="font-mono text-sm tabular-nums text-[var(--negative)]">
              {formatCurrency(baselineInterest)}
            </span>
          </div>
        )}

        {/* ── Relative scenario table ──────────────────────────── */}
        {hasScenarios && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Extra aflossingsscenario&apos;s
            </p>
            <div className="overflow-x-auto rounded-md border border-[var(--border-ed)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]/50">
                    <th className="px-2 py-1.5 text-left font-medium text-[var(--ink-3)]">
                      Extra/mnd
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium text-[var(--ink-3)]">
                      Eerder klaar
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium text-[var(--ink-3)]">
                      Rentebesparing
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium text-[var(--ink-3)]">
                      FIRE-impact
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((scenario, idx) => {
                    if (scenario.extraPerMonth <= 0) return null
                    // First row (10%) gets green highlight as most achievable
                    const isHighlighted = idx === 0
                    return (
                      <tr
                        key={scenario.label}
                        className={
                          isHighlighted
                            ? 'bg-[var(--positive)]/8'
                            : 'hover:bg-[var(--subtle)]/50'
                        }
                      >
                        <td className="px-2 py-1.5">
                          <span className="font-mono tabular-nums text-[var(--ink-2)]">
                            {formatCurrency(scenario.extraPerMonth)}
                          </span>
                          <span className="ml-1 text-[10px] text-[var(--ink-4)]">
                            ({scenario.label})
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <span
                            className={`font-mono tabular-nums ${
                              isHighlighted
                                ? 'font-semibold text-[var(--positive)]'
                                : 'text-[var(--ink-2)]'
                            }`}
                          >
                            {scenario.monthsEarlier > 0
                              ? `${scenario.monthsEarlier} mnd`
                              : '–'}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                          {scenario.interestSaved > 0
                            ? formatCurrency(scenario.interestSaved)
                            : '–'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                          {scenario.fireMonthsImpact > 0
                            ? `${scenario.fireMonthsImpact} mnd`
                            : '–'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {/* ── Totale rentebesparing footer ── */}
                {(() => {
                  const maxSaved = Math.max(...scenarios.map((s) => s.interestSaved))
                  return maxSaved > 0 ? (
                    <tfoot>
                      <tr className="border-t border-[var(--border-ed)] bg-[var(--subtle)]/30">
                        <td className="px-2 py-1.5 text-xs font-semibold text-[var(--ink-2)]">
                          Totale rentebesparing
                        </td>
                        <td />
                        <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold tabular-nums text-[var(--positive)]">
                          {formatCurrency(maxSaved)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  ) : null
                })()}
              </table>
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--ink-4)]">
              Na aflossing gaat je maandlast ({formatCurrency(totalMonthlyPayment)}/mnd) naar besparingen — dit versnelt je pad naar FIRE.
            </p>
          </div>
        )}

        {/* ── Link to full analysis ──────────────────────────── */}
        <a
          href="/core/debts"
          className="inline-flex min-h-[44px] items-center text-xs font-semibold text-[var(--color-horizon-600)] transition-colors hover:text-[var(--color-horizon-700)]"
        >
          Bekijk volledige schuldenanalyse →
        </a>
      </div>
    </AnalysisSection>
  )
})

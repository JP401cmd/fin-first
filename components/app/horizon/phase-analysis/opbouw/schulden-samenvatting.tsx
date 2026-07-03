'use client'

import { memo, useMemo } from 'react'
import Link from 'next/link'
import { Landmark, CheckCircle2 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import {
  type Debt,
  type DebtType,
  DEBT_TYPE_LABELS,
  debtProjection,
} from '@/lib/debt-data'
import { MaskedAmount } from '@/components/app/masked-amount'
import { NL_SWR } from '@/lib/constants'

// ── Types ────────────────────────────────────────────────────────────────────

interface SchuldenSamenvattingProps {
  debts: Debt[]
  annualSavings: number
  /** Annual return rate (e.g. 0.07 for 7%) used for FIRE impact calculation */
  annualReturn?: number
  /** Annual expenses (€) — used as the freedom yardstick (fallback for fireTarget). */
  yearlyExpenses?: number
  /** FIRE target portfolio (€). When provided, freedom impact is measured against this. */
  fireTarget?: number
  /** Current age — start of the accumulation horizon for the freed-payment investment. */
  currentAge?: number
  /** FIRE age — end of the accumulation horizon. */
  fireAge?: number | null
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
  /**
   * Extra wealth at FIRE (€): the monthly payment freed after debt payoff,
   * invested over the remaining accumulation horizon, compounded to FIRE.
   * A directly-correct quantity (no fragile months conversion).
   */
  extraVermogenBijFire: number
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
 * Calculate the extra wealth at FIRE from freeing the debt's monthly payment.
 *
 * After a debt is paid off, its monthly payment is no longer owed and can be
 * invested. We invest that freed payment as an annuity over the remaining
 * accumulation horizon (from debt payoff until FIRE) and report the future value
 * at FIRE. This is a directly-correct euro quantity — unlike a "months earlier"
 * conversion it does not depend on the (fragile) marginal portfolio growth rate
 * at the FIRE boundary.
 *
 * The freed payment only starts working once the debt is gone, so the investing
 * window is `accumulationMonths − monthsToPayoff` (clamped to ≥ 0).
 *
 * @param monthlyPaymentFreed - total monthly payment that becomes investable (€)
 * @param accumulationMonths  - months from now until FIRE
 * @param monthsToPayoff      - months until the debt is fully repaid (in this scenario)
 * @param annualReturn        - expected annual return (e.g. 0.07)
 */
function calculateExtraWealthAtFire(
  monthlyPaymentFreed: number,
  accumulationMonths: number,
  monthsToPayoff: number,
  annualReturn: number,
): number {
  if (monthlyPaymentFreed <= 0 || accumulationMonths <= 0) return 0

  // The freed payment can only be invested after the debt is repaid.
  const monthsInvesting = Math.max(0, accumulationMonths - monthsToPayoff)
  if (monthsInvesting <= 0) return 0

  const monthlyReturn = annualReturn / 12

  // Future value of an annuity: PMT × ((1+r)^n − 1) / r
  if (monthlyReturn > 0.0001) {
    return Math.round(
      monthlyPaymentFreed *
        ((Math.pow(1 + monthlyReturn, monthsInvesting) - 1) / monthlyReturn),
    )
  }
  return Math.round(monthlyPaymentFreed * monthsInvesting)
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
  yearlyExpenses,
  fireTarget,
  currentAge,
  fireAge,
}: SchuldenSamenvattingProps) {
  // Filter to active debts with a balance > 0
  const activeDebts = useMemo(
    () => debts.filter((d) => d.is_active && d.current_balance > 0),
    [debts],
  )

  // Freedom yardstick: the FIRE target portfolio. Prefer the app-resolved target,
  // fall back to the canonical NL SWR on expenses (geen vaste 4%; deze component
  // krijgt geen per-gebruiker SWR mee). NEVER use savings as the yardstick.
  const resolvedFireTarget = useMemo(() => {
    if (fireTarget != null && fireTarget > 0) return fireTarget
    if (yearlyExpenses != null && yearlyExpenses > 0) return yearlyExpenses / NL_SWR
    return 0
  }, [fireTarget, yearlyExpenses])

  // Remaining accumulation horizon in months (now → FIRE).
  const accumulationMonths = useMemo(() => {
    if (currentAge == null || fireAge == null) return 0
    return Math.max(0, Math.round((fireAge - currentAge) * 12))
  }, [currentAge, fireAge])

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
          extraVermogenBijFire: 0,
        }
      }

      const accelerated = estimatePortfolioPayoff(activeDebts, extraPerMonth)
      const monthsEarlier = Math.max(0, baseline.months - accelerated.months)
      const interestSaved = Math.max(
        0,
        baseline.totalInterest - accelerated.totalInterest,
      )

      // After debt payoff, the freed monthly payment is invested over the
      // remaining accumulation horizon. Accelerated payoff means it starts
      // working sooner (accelerated.months < baseline.months).
      const extraVermogenBijFire = calculateExtraWealthAtFire(
        totalMonthlyPayment,
        accumulationMonths,
        accelerated.months,
        annualReturn,
      )

      return {
        label: labels[i],
        pct,
        extraPerMonth,
        monthsEarlier,
        interestSaved,
        extraVermogenBijFire,
      }
    })
  }, [activeDebts, annualSavings, annualReturn, accumulationMonths])

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

  // ── Rich Will-context: per-scenario cijfers + FIRE-maatstaf ──────────────
  // Money via raw formatCurrency (chat context, niet gemaskeerd).
  const scenarioContext = scenarios
    .filter((s) => s.extraPerMonth > 0)
    .map(
      (s) =>
        `${s.label} (${formatCurrency(s.extraPerMonth)}/mnd): ` +
        `${s.monthsEarlier > 0 ? `${s.monthsEarlier} mnd eerder schuldenvrij` : 'geen versnelling'}, ` +
        `${s.interestSaved > 0 ? `${formatCurrency(s.interestSaved)} rentebesparing` : 'geen rentebesparing'}, ` +
        `${s.extraVermogenBijFire > 0 ? `+${formatCurrency(s.extraVermogenBijFire)} extra vermogen bij FIRE` : 'geen extra vermogen bij FIRE'}`,
    )
    .join('; ')

  const willContext = [
    `Schulden opbouwfase: ${activeDebts.length} schuld(en), totaal ${formatCurrency(totalDebt)}, maandlast ${formatCurrency(totalMonthlyPayment)}.`,
    baselineInterest > 0 ? `Totale rentelast bij huidig tempo: ${formatCurrency(baselineInterest)}.` : '',
    resolvedFireTarget > 0
      ? `Vrijheidsmaatstaf (FIRE-doel): ${formatCurrency(Math.round(resolvedFireTarget))}; na aflossing wordt de vrijgekomen maandlast belegd over de resterende opbouwhorizon (${Math.round(accumulationMonths / 12)} jaar).`
      : '',
    scenarioContext ? `Scenario's: ${scenarioContext}.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <AnalysisSection
      title="Schuldenanalyse"
      icon={Landmark}
      willContext={willContext}
    >
      <div className="space-y-3">
        {/* ── Total overview ─────────────────────────────────── */}
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-[var(--ink-3)]">
            Totale schuld
          </span>
          <span className="font-mono text-sm tabular-nums text-[var(--ink)]">
            {<MaskedAmount value={totalDebt} tone="horizon" />}
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
                        {<MaskedAmount value={debt.monthly_payment} tone="horizon" />}/mnd
                        {projection.payoffDate
                          ? ` · afgelost ${formatPayoffDate(projection.payoffDate)}`
                          : ''}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink)]">
                      {<MaskedAmount value={debt.current_balance} tone="horizon" />}
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
            {<MaskedAmount value={totalMonthlyPayment} tone="horizon" />}/mnd
          </span>
        </div>

        {/* ── Total interest at current pace ───────────────── */}
        {baselineInterest > 0 && (
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-[var(--ink-3)]">
              Totale rentelast
            </span>
            <span className="font-mono text-sm tabular-nums text-[var(--negative)]">
              {<MaskedAmount value={baselineInterest} tone="horizon" />}
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
                      Extra vermogen bij FIRE
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
                            {<MaskedAmount value={scenario.extraPerMonth} tone="horizon" />}
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
                            ? <MaskedAmount value={scenario.interestSaved} tone="horizon" />
                            : '–'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                          {scenario.extraVermogenBijFire > 0
                            ? <MaskedAmount value={scenario.extraVermogenBijFire} signPrefix="+" tone="horizon" />
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
                          {<MaskedAmount value={maxSaved} tone="horizon" />}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  ) : null
                })()}
              </table>
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--ink-4)]">
              Na aflossing komt je maandlast ({<MaskedAmount value={totalMonthlyPayment} tone="horizon" />}/mnd) vrij om te beleggen. De kolom &laquo;Extra vermogen bij FIRE&raquo; toont wat die vrijgekomen inleg, belegd tot je FIRE-leeftijd, oplevert.
            </p>
          </div>
        )}

        {/* ── Link to full analysis ──────────────────────────── */}
        <Link
          href="/core/debts"
          className="inline-flex min-h-[44px] items-center text-xs font-semibold text-[var(--color-horizon-600)] transition-colors hover:text-[var(--color-horizon-700)]"
        >
          Bekijk volledige schuldenanalyse →
        </Link>
      </div>
    </AnalysisSection>
  )
})

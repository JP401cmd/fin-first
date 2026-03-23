'use client'

import { memo, useMemo } from 'react'
import { Landmark } from 'lucide-react'
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
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a date string (YYYY-MM-DD) as "mrt 2029" style Dutch short date. */
function formatPayoffDate(dateStr: string): string {
  if (!dateStr) return '–'
  const d = new Date(dateStr)
  return d.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
}

/**
 * Estimate how many months earlier the accumulation phase could end
 * if the user puts an extra €200/month toward debt repayment.
 * Simplified model: difference in months to pay off total debt.
 */
function estimateEarlyMonths(
  totalDebt: number,
  monthlyFromSavings: number,
  extraPerMonth: number,
): number {
  if (monthlyFromSavings <= 0 || totalDebt <= 0) return 0
  const currentMonths = totalDebt / monthlyFromSavings
  const acceleratedMonths = totalDebt / (monthlyFromSavings + extraPerMonth)
  return Math.max(0, Math.round(currentMonths - acceleratedMonths))
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Compact debt summary for the accumulation phase analysis.
 *
 * Shows total outstanding debt, per-debt details (name, type, balance,
 * monthly payment, estimated payoff date), total monthly burden, and a
 * one-line impact estimate for accelerated repayment.
 *
 * Returns null when there are no active debts with a positive balance,
 * keeping the parent layout clean.
 */
export const SchuldenSamenvatting = memo(function SchuldenSamenvatting({
  debts,
  annualSavings,
}: SchuldenSamenvattingProps) {
  // Filter to active debts with a balance > 0
  const activeDebts = useMemo(
    () => debts.filter((d) => d.is_active && d.current_balance > 0),
    [debts],
  )

  // Bail early if nothing to show
  if (activeDebts.length === 0) return null

  const totalDebt = activeDebts.reduce((s, d) => s + d.current_balance, 0)
  const totalMonthlyPayment = activeDebts.reduce(
    (s, d) => s + d.monthly_payment,
    0,
  )
  const monthlyFromSavings = annualSavings / 12
  const extraPerMonth = 200
  const monthsEarlier = estimateEarlyMonths(
    totalDebt,
    monthlyFromSavings,
    extraPerMonth,
  )

  // Group debts by type for the overview
  const debtsByType = activeDebts.reduce<Record<DebtType, Debt[]>>(
    (acc, d) => {
      ;(acc[d.debt_type] ??= []).push(d)
      return acc
    },
    {} as Record<DebtType, Debt[]>,
  )

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

        {/* ── Accelerated repayment impact ───────────────────── */}
        {monthsEarlier > 0 && (
          <p className="text-xs leading-relaxed text-[var(--ink-3)]">
            Door{' '}
            <span className="font-mono tabular-nums text-[var(--ink-2)]">
              {formatCurrency(extraPerMonth)}/mnd
            </span>{' '}
            extra af te lossen eindig je de opbouwfase{' '}
            <span className="font-semibold text-[var(--positive)]">
              {monthsEarlier} maanden eerder
            </span>
            .
          </p>
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

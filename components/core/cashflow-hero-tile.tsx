'use client'

import Link from 'next/link'
import { ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

interface CashflowHeroTileProps {
  /** Total number of (parent) expense budgets. */
  budgetCount: number
  /** Number of expense budgets that have exceeded their limit. */
  overBudgetCount: number
  /** Total monthly budget limit (all expense budgets). */
  totalBudgetLimit: number
  /** Total spent this month (all expense budgets). */
  totalBudgetSpent: number
  /** Whether the budgeting module is active. */
  budgetingActive: boolean
}

/**
 * Cashflow hero-tegel — prominente tegel op de /core landing die
 * de budgetstatus toont: hoeveel budgetten op schema liggen, totaal
 * besteed vs beschikbaar, en een mini-indicator van cashflow-gezondheid.
 *
 * Klikt door naar /core/budgets.
 */
export function CashflowHeroTile({
  budgetCount,
  overBudgetCount,
  totalBudgetLimit,
  totalBudgetSpent,
  budgetingActive,
}: CashflowHeroTileProps) {
  const { ref, hasEntered } = useInViewAnimation({ duration: 600 })

  // Budget health metrics
  const onTrackCount = budgetCount - overBudgetCount
  const available = totalBudgetLimit - totalBudgetSpent
  const spentPct = totalBudgetLimit > 0
    ? Math.min(100, Math.max(0, (totalBudgetSpent / totalBudgetLimit) * 100))
    : 0

  // Health indicator: green (<80%), amber (80-100%), red (>100%)
  const healthStatus: 'green' | 'amber' | 'red' =
    spentPct > 100 ? 'red' : spentPct > 80 ? 'amber' : 'green'

  const healthColors = {
    green: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
  }

  const healthBgColors = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  }

  const HealthIcon = healthStatus === 'red'
    ? TrendingDown
    : healthStatus === 'amber'
      ? Minus
      : TrendingUp

  // Empty state: no budgets at all
  if (budgetCount === 0 || !budgetingActive) {
    return (
      <section className="border-b border-[var(--border-ed)] bg-[var(--paper)]">
        <div className="px-4 py-5 sm:px-6 sm:py-6">
          <Link
            href="/core/budgets"
            className="group flex items-center justify-between gap-4 transition-opacity hover:opacity-80"
          >
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Cashflow
              </p>
              <p className="font-serif text-sm italic text-[var(--ink-3)]">
                {!budgetingActive
                  ? 'Activeer budgetteren om je cashflow te volgen.'
                  : 'Stel budgetten in om je maandelijkse cashflow te bewaken.'}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section
      data-testid="cashflow-hero-tile"
      className="border-b border-[var(--border-ed)] bg-[var(--paper)]"
    >
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <Link
          href="/core/budgets"
          className="group block transition-opacity hover:opacity-90"
        >
          {/* Header row: kicker + health icon */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Cashflow · budgetstatus
            </p>
            <div className={`flex items-center gap-1.5 ${healthColors[healthStatus]}`}>
              <HealthIcon className="h-3.5 w-3.5" />
              <span className="font-mono text-xs tabular-nums">
                {Math.round(spentPct).toString().replace('.', ',')}%
              </span>
            </div>
          </div>

          {/* Main metric: X van Y op schema */}
          <div className="mt-3 flex items-baseline justify-between gap-4">
            <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)] sm:text-2xl">
              {onTrackCount}{' '}
              <span className="text-sm font-normal text-[var(--ink-3)]">
                van {budgetCount} op schema
              </span>
            </p>
            <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform group-hover:translate-x-0.5" />
          </div>

          {/* Progress bar: spent vs limit */}
          <div ref={ref} className="mt-3">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-mono tabular-nums text-[var(--ink-2)]">
                <MaskedAmount value={totalBudgetSpent} tone="kern" className="text-xs" /> besteed
              </span>
              <span className="font-mono tabular-nums text-[var(--ink-3)]">
                <MaskedAmount value={available} tone="kern" className="text-xs" />{' '}
                {available >= 0 ? 'beschikbaar' : 'over limiet'}
              </span>
            </div>
            <div
              className="mt-1.5 h-[5px] w-full overflow-hidden bg-[var(--subtle)]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(spentPct)}
              aria-label="Budgetvoortgang"
            >
              <div
                className={`h-full transition-all duration-600 ease-out ${healthBgColors[healthStatus]}`}
                style={{
                  width: hasEntered ? `${Math.min(spentPct, 100)}%` : '0%',
                  transition: 'width 600ms cubic-bezier(.22,1,.36,1)',
                }}
              />
            </div>
          </div>
        </Link>
      </div>
    </section>
  )
}

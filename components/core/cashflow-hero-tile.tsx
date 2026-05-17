'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
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

// ── Health status logic ─────────────────────────────────────────
// Based on number of over-budget items:
//   green  = 0 budgetten over (alles op schema)
//   amber  = 1-2 budgetten over
//   red    = 3+ budgetten over of negatieve cashflow

type HealthStatus = 'green' | 'amber' | 'red'

function computeBudgetHealthStatus(
  overBudgetCount: number,
  available: number,
): HealthStatus {
  if (available < 0 || overBudgetCount >= 3) return 'red'
  if (overBudgetCount >= 1) return 'amber'
  return 'green'
}

function getHealthLabel(status: HealthStatus): string {
  switch (status) {
    case 'green':
      return 'Op schema'
    case 'amber':
      return 'Aandacht'
    case 'red':
      return 'Over limiet'
  }
}

function getHealthTooltip(
  status: HealthStatus,
  overBudgetCount: number,
  available: number,
): string {
  switch (status) {
    case 'green':
      return 'Alle budgetten liggen op schema deze maand.'
    case 'amber':
      return `${overBudgetCount} budget${overBudgetCount === 1 ? '' : 'ten'} ${overBudgetCount === 1 ? 'is' : 'zijn'} overschreden. Pas je uitgaven aan om op koers te blijven.`
    case 'red':
      if (available < 0) return 'Je totale uitgaven overschrijden je budgetlimiet. Tijd om bij te sturen.'
      return `${overBudgetCount} budgetten zijn overschreden. Heroverweeg je bestedingspatroon.`
  }
}

const HEALTH_COLORS: Record<HealthStatus, { text: string; bg: string; dot: string; border: string }> = {
  green: {
    text: 'text-emerald-600',
    bg: 'bg-emerald-50',
    dot: 'bg-emerald-500',
    border: 'border-emerald-200',
  },
  amber: {
    text: 'text-amber-600',
    bg: 'bg-amber-50',
    dot: 'bg-amber-500',
    border: 'border-amber-200',
  },
  red: {
    text: 'text-red-600',
    bg: 'bg-red-50',
    dot: 'bg-red-500',
    border: 'border-red-200',
  },
}

// ── Tooltip ─────────────────────────────────────────────────────

function HealthTooltip({
  status,
  label,
  detail,
  children,
}: {
  status: HealthStatus
  label: string
  detail: string
  children: React.ReactNode
}) {
  const [show, setShow] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setShow(true)
  }, [])

  const handleLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setShow(false), 150)
  }, [])

  // Mobile: close on outside tap
  useEffect(() => {
    if (!show) return
    const handleOutsideTap = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShow(false)
      }
    }
    document.addEventListener('pointerdown', handleOutsideTap)
    return () => document.removeEventListener('pointerdown', handleOutsideTap)
  }, [show])

  const colors = HEALTH_COLORS[status]

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onPointerDown={(e) => {
        e.preventDefault()
        setShow((prev) => !prev)
      }}
    >
      {children}
      {show && (
        <div
          className={`absolute z-50 right-0 top-full mt-1.5 max-w-[260px] px-2.5 py-1.5 border ${colors.border} ${colors.bg} shadow-sm pointer-events-none`}
          role="tooltip"
        >
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${colors.dot} shrink-0`} aria-hidden />
            <span className={`text-[11px] font-semibold ${colors.text}`}>
              {label}
            </span>
          </div>
          <div className="text-[10px] text-[var(--ink-3)] mt-0.5 pl-3 whitespace-normal">
            {detail}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────

/**
 * Cashflow hero-tegel — prominente tegel op de /core landing die
 * de budgetstatus toont: hoeveel budgetten op schema liggen, totaal
 * besteed vs beschikbaar, en een mini-indicator van cashflow-gezondheid.
 *
 * Gezondheidsindicator:
 *   groen  — alle budgetten op schema
 *   amber  — 1-2 budgetten overschreden
 *   rood   — 3+ budgetten overschreden of negatieve cashflow
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

  // Health indicator based on over-budget count
  const healthStatus = computeBudgetHealthStatus(overBudgetCount, available)
  const healthLabel = getHealthLabel(healthStatus)
  const healthTooltip = getHealthTooltip(healthStatus, overBudgetCount, available)
  const colors = HEALTH_COLORS[healthStatus]

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
          {/* Header row: kicker + health indicator with tooltip */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Cashflow · budgetstatus
            </p>
            <HealthTooltip
              status={healthStatus}
              label={healthLabel}
              detail={healthTooltip}
            >
              <div
                className={`flex items-center gap-1.5 cursor-default ${colors.text}`}
                aria-label={`Cashflow-gezondheid: ${healthLabel}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} aria-hidden />
                <HealthIcon className="h-3.5 w-3.5" />
                <span className="font-mono text-xs tabular-nums">
                  {healthLabel}
                </span>
              </div>
            </HealthTooltip>
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
                className={`h-full transition-all duration-600 ease-out ${colors.dot}`}
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

'use client'

import { memo } from 'react'
import { Calendar } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { LifeEvent } from '@/lib/horizon-data'

// ── Types ────────────────────────────────────────────────────────────────────

interface LifeEventsInPhaseProps {
  events: LifeEvent[]
  phaseStartAge: number
  phaseEndAge: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format an amount with positive/negative styling.
 * Returns the formatted text and a Tailwind color class.
 */
function formatImpact(amount: number): { text: string; colorClass: string } {
  if (amount === 0) return { text: '', colorClass: '' }
  const sign = amount > 0 ? '+' : ''
  return {
    text: `${sign}${formatCurrency(amount)}`,
    colorClass:
      amount > 0
        ? 'text-[var(--positive)]'
        : 'text-[var(--negative)]',
  }
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Displays life events that fall within a specific phase's age range.
 * Returns null if no active events match, keeping the parent layout clean.
 *
 * Each event shows its name, the age at which it occurs, and the financial
 * impact (one-time cost and/or monthly changes). Amounts use the standard
 * `font-mono tabular-nums` pattern with positive/negative coloring.
 */
export const LifeEventsInPhase = memo(function LifeEventsInPhase({
  events,
  phaseStartAge,
  phaseEndAge,
}: LifeEventsInPhaseProps) {
  // Filter to active events whose target_age falls within the phase range
  const phaseEvents = events.filter((e) => {
    if (!e.is_active || e.target_age == null) return false
    return e.target_age >= phaseStartAge && e.target_age <= phaseEndAge
  })

  if (phaseEvents.length === 0) return null

  return (
    <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] p-3">
      {/* Header */}
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
        Levensgebeurtenissen in deze fase
      </p>

      {/* Event list */}
      <div className="space-y-2">
        {phaseEvents.map((event) => {
          const oneTime = formatImpact(-event.one_time_cost)
          const monthlyCost = formatImpact(-event.monthly_cost_change)
          const monthlyIncome = formatImpact(event.monthly_income_change)

          return (
            <div
              key={event.id}
              className="flex items-start gap-2 text-xs leading-relaxed"
            >
              <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" />

              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-[var(--ink-2)]">
                    {event.name}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-[var(--ink-4)]">
                    {event.target_age} jr
                  </span>
                </div>

                {/* Financial impact details */}
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {oneTime.text && (
                    <span
                      className={`font-mono text-[11px] tabular-nums ${oneTime.colorClass}`}
                    >
                      {oneTime.text} eenmalig
                    </span>
                  )}
                  {monthlyCost.text && (
                    <span
                      className={`font-mono text-[11px] tabular-nums ${monthlyCost.colorClass}`}
                    >
                      {monthlyCost.text}/mnd kosten
                    </span>
                  )}
                  {monthlyIncome.text && (
                    <span
                      className={`font-mono text-[11px] tabular-nums ${monthlyIncome.colorClass}`}
                    >
                      {monthlyIncome.text}/mnd inkomen
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

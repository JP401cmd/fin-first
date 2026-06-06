'use client'

import { useMemo } from 'react'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { Kicker } from '@/components/editorial'
import { periodTrend, type FlowSummary } from '@/lib/transaction-insights'

/**
 * PeriodeTrend — procentuele verandering van uitgaven en inkomsten t.o.v. de
 * even-lange vorige periode.
 *
 * SEMANTIEK / KLEUR:
 * - Uitgaven: een STIJGING (positief %) is ongunstig → expense-kleur + pijl
 *   omhoog; een DALING is gunstig → income-kleur + pijl omlaag.
 * - Inkomsten: een STIJGING is gunstig → income-kleur + pijl omhoog; een
 *   daling ongunstig → expense-kleur + pijl omlaag.
 * - `null` (geen vergelijkingsbasis, prev === 0) → "—" / "geen vergelijking".
 *
 * Presentational: rekent enkel `periodTrend(current, previous)`.
 */

export function PeriodeTrend({
  current,
  previous,
}: {
  current: FlowSummary
  previous: FlowSummary
}) {
  const { incomePct, expensePct } = useMemo(
    () => periodTrend(current, previous),
    [current, previous],
  )

  return (
    <div className="space-y-2.5">
      <Kicker>Trend</Kicker>
      <div className="space-y-1.5">
        {/* Uitgaven: stijging = ongunstig (expense-kleur). */}
        <TrendLine label="Uitgaven" pct={expensePct} increaseIsFavorable={false} />
        {/* Inkomsten: stijging = gunstig (income-kleur). */}
        <TrendLine label="Inkomsten" pct={incomePct} increaseIsFavorable />
      </div>
      <p className="text-[11px] text-[var(--ink-3)]">t.o.v. vorige periode</p>
    </div>
  )
}

function TrendLine({
  label,
  pct,
  increaseIsFavorable,
}: {
  label: string
  pct: number | null
  increaseIsFavorable: boolean
}) {
  // Geen vergelijkingsbasis.
  if (pct === null) {
    return (
      <div className="flex items-center justify-between gap-3 border border-[var(--border-ed)] px-3 py-2">
        <span className="text-sm text-[var(--ink)]">{label}</span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--ink-3)]">
          <Minus className="h-3.5 w-3.5 shrink-0" />
          <span>geen vergelijking</span>
        </span>
      </div>
    )
  }

  const isFlat = pct === 0
  const increased = pct > 0
  // Gunstig wanneer richting overeenkomt met wat voor deze metriek gewenst is.
  const favorable = isFlat ? null : increased === increaseIsFavorable

  const Icon = isFlat ? Minus : increased ? TrendingUp : TrendingDown
  const color = isFlat
    ? 'text-[var(--ink-3)]'
    : favorable
      ? 'text-[var(--color-income-600)]'
      : 'text-[var(--color-expense-600)]'

  return (
    <div className="flex items-center justify-between gap-3 border border-[var(--border-ed)] px-3 py-2">
      <span className="text-sm text-[var(--ink)]">{label}</span>
      <span className={`flex items-center gap-1.5 text-xs font-medium ${color}`}>
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="font-mono tabular-nums">
          {increased ? '+' : ''}
          {pct}%
        </span>
      </span>
    </div>
  )
}

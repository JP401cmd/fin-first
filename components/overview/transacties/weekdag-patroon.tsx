'use client'

import { useMemo } from 'react'
import { Kicker } from '@/components/editorial'
import { formatCurrency } from '@/lib/format'
import { spendByWeekday, type AnalysisTransaction } from '@/lib/transaction-insights'

/**
 * WeekdagPatroon — uitgaven per weekdag (ma…zo) als compacte staafgrafiek.
 * De hoogste staaf krijgt een sterkere kleur als visuele piek-markering;
 * het bedrag verschijnt op hover via een `title`-attribuut.
 *
 * Presentational: rekent enkel `spendByWeekday` over de input.
 */

const WEEKDAY_LABELS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

export function WeekdagPatroon({ transactions }: { transactions: AnalysisTransaction[] }) {
  const byWeekday = useMemo(() => spendByWeekday(transactions), [transactions])

  const max = Math.max(...byWeekday, 0)
  const hasData = max > 0

  return (
    <div className="space-y-2.5">
      <Kicker>Uitgaven per weekdag</Kicker>

      {!hasData ? (
        <p className="text-sm text-[var(--ink-3)]">Geen uitgaven in deze periode.</p>
      ) : (
        <div className="flex items-end gap-1.5" style={{ height: 88 }}>
          {byWeekday.map((value, i) => {
            // Hoogte als percentage van de piek; minimaal 2px zodat lege dagen
            // toch een grondlijn tonen.
            const heightPct = max > 0 ? (value / max) * 100 : 0
            const isPeak = value === max && value > 0
            return (
              <div
                key={WEEKDAY_LABELS[i]}
                className="flex flex-1 flex-col items-center gap-1"
                style={{ height: '100%' }}
                title={`${WEEKDAY_LABELS[i]}: ${formatCurrency(value)}`}
              >
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full transition-colors"
                    style={{
                      height: `${Math.max(heightPct, value > 0 ? 4 : 1)}%`,
                      backgroundColor: isPeak
                        ? 'var(--color-expense-500)'
                        : 'var(--color-expense-200)',
                    }}
                  />
                </div>
                <span
                  className={`text-[9px] font-mono uppercase tracking-[0.08em] ${
                    isPeak ? 'font-semibold text-[var(--ink-2)]' : 'text-[var(--ink-3)]'
                  }`}
                >
                  {WEEKDAY_LABELS[i]}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

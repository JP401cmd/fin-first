'use client'

import { useMemo } from 'react'
import { Kicker } from '@/components/editorial'
import { formatCurrency } from '@/lib/format'
import { spendByWeekday, type AnalysisTransaction } from '@/lib/transaction-insights'

/**
 * WeekdagPatroon — uitgaven per weekdag (ma…zo) als compacte staafgrafiek.
 * De hoogste staaf krijgt een sterkere kleur als visuele piek-markering.
 *
 * Met `onSelectWeekday` is elke kolom klikbaar → weekdag-weergave van de
 * transacties in de gekozen periode. Presentational: rekent enkel
 * `spendByWeekday` over de input.
 */

const WEEKDAY_LABELS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
const WEEKDAY_FULL = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']

export function WeekdagPatroon({
  transactions,
  onSelectWeekday,
}: {
  transactions: AnalysisTransaction[]
  /** Klik op een weekdag-kolom → weekdag-weergave (index 0 = maandag). */
  onSelectWeekday?: (index: number) => void
}) {
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
            const bar = (
              <>
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
              </>
            )

            const shared = 'flex flex-1 flex-col items-center gap-1'
            if (onSelectWeekday) {
              return (
                <button
                  key={WEEKDAY_LABELS[i]}
                  type="button"
                  onClick={() => onSelectWeekday(i)}
                  aria-label={`${WEEKDAY_FULL[i]} bekijken`}
                  title={`${WEEKDAY_FULL[i]}: ${formatCurrency(value)}`}
                  className={`${shared} rounded-none transition-colors hover:bg-[var(--subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}
                  style={{ height: '100%' }}
                >
                  {bar}
                </button>
              )
            }
            return (
              <div
                key={WEEKDAY_LABELS[i]}
                className={shared}
                style={{ height: '100%' }}
                title={`${WEEKDAY_FULL[i]}: ${formatCurrency(value)}`}
              >
                {bar}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

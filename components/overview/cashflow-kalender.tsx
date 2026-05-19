'use client'

import { useMemo } from 'react'
import { formatCurrency } from '@/lib/format'
import {
  getUpcomingTransactions,
  type RecurringTransaction,
} from '@/lib/recurring-data'

/**
 * CashflowKalender — visualiseert recurring transactions over de
 * komende 30 dagen als kalender-grid. Per dag een mini-stack van
 * afschrijvings-markers (rood = uitgave) en inkomens-markers (groen).
 *
 * Plan-context: backlog "Cashflow Sankey-chart, forecast, kalender uit
 * cash-overview". Eerste stap richting Sankey (later) — deze kalender
 * geeft het gevoel "wat komt er deze maand" zonder zware visualisatie.
 *
 * Mounting: nieuwe sub-view op /overzicht/cashflow naast Budget /
 * Transacties / Vaste lasten via de CashflowViewSwitcher.
 *
 * Data: recurring_transactions uit DashboardData (al gefilterd op
 * is_active). getUpcomingTransactions() berekent next-date per
 * recurring; deze component groepeert ze per dag.
 */

type DayBucket = {
  date: Date
  expenses: { name: string; amount: number }[]
  incomes: { name: string; amount: number }[]
}

const WEEKDAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

/**
 * Bouw 35-cel grid (5 weken × 7 dagen) startend op de maandag van de
 * week waarin "vandaag" valt. Eerste cel = maandag van die week;
 * laatste cel = zondag 5 weken later. Bedekt minimaal 30 dagen ahead.
 */
function buildBuckets(
  recurrings: RecurringTransaction[],
  todayISO: string,
): DayBucket[] {
  const today = new Date(todayISO + 'T12:00:00')
  // Vind maandag van huidige week (0 = zondag, 1 = maandag, …)
  const dayOfWeek = today.getDay()
  const daysSinceMonday = (dayOfWeek + 6) % 7 // 0=Mon → 0, 1=Tue → 1, … 0=Sun → 6
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysSinceMonday)

  const buckets: DayBucket[] = []
  for (let i = 0; i < 35; i++) {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    buckets.push({ date, expenses: [], incomes: [] })
  }

  // Get upcoming over 35 dagen (vanaf vandaag) en sorteer in buckets
  const upcoming = getUpcomingTransactions(recurrings, 35)
  for (const { recurring, nextDate } of upcoming) {
    const idx = Math.floor(
      (nextDate.getTime() - monday.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (idx < 0 || idx >= buckets.length) continue
    const bucket = buckets[idx]
    if (!bucket) continue
    const amount = Number(recurring.amount)
    if (amount < 0) {
      bucket.expenses.push({ name: recurring.name, amount })
    } else {
      bucket.incomes.push({ name: recurring.name, amount })
    }
  }

  return buckets
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function CashflowKalender({
  recurrings,
}: {
  recurrings: RecurringTransaction[]
}) {
  // Today gestabiliseerd op render-tijd zodat bucket-buildup pure is.
  const todayISO = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])
  const today = useMemo(() => new Date(todayISO + 'T12:00:00'), [todayISO])

  const buckets = useMemo(
    () => buildBuckets(recurrings, todayISO),
    [recurrings, todayISO],
  )

  // Totalen voor de header
  const totalExpenses = buckets.reduce(
    (s, b) =>
      s + b.expenses.reduce((s2, e) => s2 + Math.abs(e.amount), 0),
    0,
  )
  const totalIncomes = buckets.reduce(
    (s, b) => s + b.incomes.reduce((s2, i) => s2 + i.amount, 0),
    0,
  )

  const hasAny = buckets.some((b) => b.expenses.length + b.incomes.length > 0)

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Cashflow — kalender
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            Komende 5 weken
          </h2>
        </div>
        {hasAny && (
          <div className="flex items-center gap-4 text-xs">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Verwacht uit
              </div>
              <div className="font-serif font-semibold text-red-700 tabular-nums">
                {formatCurrency(totalExpenses)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Verwacht in
              </div>
              <div className="font-serif font-semibold text-emerald-700 tabular-nums">
                {formatCurrency(totalIncomes)}
              </div>
            </div>
          </div>
        )}
      </header>

      {!hasAny ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 text-center">
          <p className="text-sm text-[var(--ink-3)] italic leading-relaxed">
            Geen vaste afschrijvingen of inkomsten gepland in de komende
            5 weken. Voeg recurring transactions toe via{' '}
            <span className="font-medium">/overzicht/cashflow → Vaste lasten</span>.
          </p>
        </div>
      ) : (
        <div>
          {/* Weekday-header */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--ink-3)]"
              >
                {d}
              </div>
            ))}
          </div>
          {/* 35-cell grid */}
          <div
            role="grid"
            aria-label="Cashflow-kalender komende 5 weken"
            className="grid grid-cols-7 gap-1 sm:gap-2"
          >
            {buckets.map((bucket) => {
              const isToday = isSameDay(bucket.date, today)
              const isPast = bucket.date < today && !isToday
              const dayMs = bucket.date.getTime()
              const todayMs = today.getTime()
              const isFuture = dayMs > todayMs
              const expCount = bucket.expenses.length
              const incCount = bucket.incomes.length
              const hasItems = expCount + incCount > 0
              const dayNum = bucket.date.getDate()
              const monthDay = bucket.date.getDate() === 1
              return (
                <div
                  key={bucket.date.toISOString()}
                  role="gridcell"
                  className={`relative rounded-xl border min-h-[64px] sm:min-h-[80px] p-1 sm:p-1.5 flex flex-col ${
                    isToday
                      ? 'border-violet-500 bg-violet-50/40'
                      : isPast
                        ? 'border-[var(--border-ed)] bg-[var(--subtle)]/30 opacity-60'
                        : isFuture && hasItems
                          ? 'border-[var(--border-ed)] bg-[var(--paper)]'
                          : 'border-[var(--border-ed)] bg-[var(--paper)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-[10px] sm:text-xs font-mono tabular-nums ${
                        isToday
                          ? 'text-violet-700 font-bold'
                          : 'text-[var(--ink-3)]'
                      }`}
                    >
                      {dayNum}
                    </span>
                    {monthDay && (
                      <span className="text-[8px] uppercase tracking-[0.08em] text-[var(--ink-4)] font-semibold">
                        {bucket.date.toLocaleDateString('nl-NL', { month: 'short' })}
                      </span>
                    )}
                  </div>
                  {hasItems && (
                    <div className="mt-1 flex flex-col gap-0.5">
                      {bucket.expenses.slice(0, 2).map((e, i) => (
                        <div
                          key={`exp-${i}`}
                          className="text-[8px] sm:text-[9px] text-red-700 font-mono tabular-nums truncate"
                          title={`${e.name}: ${formatCurrency(Math.abs(e.amount))}`}
                        >
                          −{formatCurrency(Math.abs(e.amount)).replace(/\s/g, '')}
                        </div>
                      ))}
                      {bucket.incomes.slice(0, 2).map((i, idx) => (
                        <div
                          key={`inc-${idx}`}
                          className="text-[8px] sm:text-[9px] text-emerald-700 font-mono tabular-nums truncate"
                          title={`${i.name}: ${formatCurrency(i.amount)}`}
                        >
                          +{formatCurrency(i.amount).replace(/\s/g, '')}
                        </div>
                      ))}
                      {expCount + incCount > 2 && (
                        <div className="text-[8px] text-[var(--ink-4)]">
                          +{expCount + incCount - 2} meer
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] italic text-[var(--ink-3)]">
        Afschrijvingen uit recurring transactions. Voor budget-overzicht
        zie tab Budget, voor categorieën zie Vaste lasten.
      </p>
    </div>
  )
}

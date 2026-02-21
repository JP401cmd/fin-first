'use client'

import { useMemo } from 'react'
import { type RecurringTransaction } from '@/lib/recurring-data'

export type { CalendarTransaction }

type CalendarTransaction = {
  id: string
  date: string
  amount: number
  description: string
  counterparty_name: string | null
  transaction_type: string | null
  budget_id: string | null
}

interface BillCalendarProps {
  recurrings: RecurringTransaction[]
  transactions: CalendarTransaction[]
  monthDate: Date
  currentBalance?: number
  onDayClick?: (dateStr: string, transactions: CalendarTransaction[]) => void
}

type CalendarCell = {
  day: number
  dateStr: string
  isCurrentMonth: boolean
  isToday: boolean
  isWeekend: boolean
  expectedRecurrings: RecurringTransaction[]
  confirmedTransactions: CalendarTransaction[]
  projectedBalance: number | null
  hasNegativeBalance: boolean
}

function fmtAmt(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Math.abs(n))
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isRecurringOnDay(
  r: RecurringTransaction,
  year: number,
  month: number,
  day: number,
): boolean {
  if (!r.is_active) return false

  const startDate = new Date(r.start_date)
  const startYear = startDate.getFullYear()
  const startMonth = startDate.getMonth()

  if (r.frequency === 'monthly') {
    return r.day_of_month === day
  }

  if (r.frequency === 'weekly') {
    const cellDay = new Date(year, month, day).getDay()
    return cellDay === r.day_of_week
  }

  if (r.frequency === 'quarterly') {
    if (r.day_of_month !== day) return false
    const monthsSinceStart = (year - startYear) * 12 + (month - startMonth)
    return monthsSinceStart >= 0 && monthsSinceStart % 3 === 0
  }

  if (r.frequency === 'yearly') {
    if (r.day_of_month !== day) return false
    return startDate.getMonth() === month
  }

  return false
}

function isConfirmedMatch(
  r: RecurringTransaction,
  dayTransactions: CalendarTransaction[],
  allTransactions: CalendarTransaction[],
  year: number,
  month: number,
  day: number,
): boolean {
  const rAmount = Math.abs(Number(r.amount))
  const targetDate = new Date(year, month, day)

  return allTransactions.some((tx) => {
    const txDate = new Date(tx.date)
    const diffMs = Math.abs(txDate.getTime() - targetDate.getTime())
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    if (diffDays > 3) return false
    const txAmount = Math.abs(Number(tx.amount))
    if (rAmount === 0) return false
    return Math.abs(txAmount - rAmount) / rAmount <= 0.1
  })
}

export function BillCalendar({
  recurrings,
  transactions,
  monthDate,
  currentBalance,
  onDayClick,
}: BillCalendarProps) {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()

  const today = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }, [])

  const { cells, dailyBalances } = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1)
    let startDow = firstDayOfMonth.getDay()
    startDow = startDow === 0 ? 6 : startDow - 1

    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const daysInPrevMonth = new Date(year, month, 0).getDate()

    const cellArray: CalendarCell[] = []

    for (let i = 0; i < 42; i++) {
      const offset = i - startDow
      let cellYear = year
      let cellMonth = month
      let cellDay: number
      let isCurrentMonth = true

      if (offset < 0) {
        cellDay = daysInPrevMonth + offset + 1
        cellMonth = month - 1
        if (cellMonth < 0) { cellMonth = 11; cellYear = year - 1 }
        isCurrentMonth = false
      } else if (offset >= daysInMonth) {
        cellDay = offset - daysInMonth + 1
        cellMonth = month + 1
        if (cellMonth > 11) { cellMonth = 0; cellYear = year + 1 }
        isCurrentMonth = false
      } else {
        cellDay = offset + 1
      }

      const dateStr = toDateStr(cellYear, cellMonth, cellDay)
      const cellDate = new Date(cellYear, cellMonth, cellDay)
      const isToday = cellDate.getTime() === today.getTime()
      const dow = cellDate.getDay()
      const isWeekend = dow === 0 || dow === 6

      const dayTransactions = transactions.filter((tx) => tx.date === dateStr)

      const expectedRecurrings = isCurrentMonth
        ? recurrings.filter((r) =>
            isRecurringOnDay(r, cellYear, cellMonth, cellDay)
          )
        : []

      cellArray.push({
        day: cellDay,
        dateStr,
        isCurrentMonth,
        isToday,
        isWeekend,
        expectedRecurrings,
        confirmedTransactions: dayTransactions,
        projectedBalance: null,
        hasNegativeBalance: false,
      })
    }

    const balances: number[] = []
    if (currentBalance !== undefined) {
      let runningBalance = currentBalance

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = toDateStr(year, month, d)
        const dayTxs = transactions.filter((tx) => tx.date === dateStr)
        const dayRecurrings = recurrings.filter((r) =>
          isRecurringOnDay(r, year, month, d)
        )

        for (const tx of dayTxs) {
          runningBalance += Number(tx.amount)
        }

        for (const r of dayRecurrings) {
          const alreadyConfirmed = isConfirmedMatch(r, dayTxs, transactions, year, month, d)
          if (!alreadyConfirmed) {
            runningBalance += Number(r.amount)
          }
        }

        balances.push(runningBalance)
      }

      for (const cell of cellArray) {
        if (!cell.isCurrentMonth) continue
        const idx = cell.day - 1
        if (idx >= 0 && idx < balances.length) {
          cell.projectedBalance = balances[idx]
          cell.hasNegativeBalance = balances[idx] < 0
        }
      }
    }

    return { cells: cellArray, dailyBalances: balances }
  }, [recurrings, transactions, year, month, today, currentBalance])

  const DAY_HEADERS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

  const sparklineSvg = useMemo(() => {
    if (!currentBalance || dailyBalances.length < 2) return null

    const svgW = 600
    const svgH = 48
    const pad = { t: 4, b: 4, l: 2, r: 2 }
    const cW = svgW - pad.l - pad.r
    const cH = svgH - pad.t - pad.b

    const minVal = Math.min(...dailyBalances)
    const maxVal = Math.max(...dailyBalances)
    const range = maxVal - minVal || 1

    const pts = dailyBalances.map((v, i) => ({
      x: pad.l + (i / (dailyBalances.length - 1)) * cW,
      y: pad.t + cH - ((v - minVal) / range) * cH,
    }))

    let linePath = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`
    for (let i = 1; i < pts.length; i++) {
      linePath += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`
    }

    const zeroY = minVal >= 0 ? svgH : pad.t + cH - ((0 - minVal) / range) * cH
    const negFillSegments: string[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      if (dailyBalances[i] < 0 || dailyBalances[i + 1] < 0) {
        const x1 = pts[i].x
        const x2 = pts[i + 1].x
        const y1 = pts[i].y
        const y2 = pts[i + 1].y
        negFillSegments.push(
          `M ${x1.toFixed(2)} ${Math.min(y1, zeroY).toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x2.toFixed(2)} ${Math.min(y2, zeroY).toFixed(2)} Z`
        )
      }
    }

    const todayIdx = today.getFullYear() === year && today.getMonth() === month
      ? today.getDate() - 1
      : -1
    const todayX = todayIdx >= 0 && todayIdx < pts.length
      ? pts[todayIdx].x
      : -1

    return { linePath, negFillSegments, todayX, svgW, svgH }
  }, [dailyBalances, currentBalance, today, year, month])

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 border-b border-[var(--border-ed)] pb-1">
        {DAY_HEADERS.map((h) => (
          <div
            key={h}
            className="py-1 text-center text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-3)] font-sans"
          >
            {h}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-[var(--border-ed)] rounded-[var(--r-lg)] overflow-hidden border border-[var(--border-ed)]">
        {cells.map((cell, idx) => {
          const visibleRecurrings = cell.expectedRecurrings.slice(0, 2)
          const overflow = cell.expectedRecurrings.length - 2

          return (
            <div
              key={`${cell.dateStr}-${idx}`}
              className={[
                'relative flex min-h-[72px] sm:min-h-[88px] flex-col gap-0.5 p-1 sm:p-1.5 transition-colors',
                onDayClick ? 'cursor-pointer' : 'cursor-default',
                !cell.isCurrentMonth ? 'opacity-40' : '',
                cell.isCurrentMonth && cell.hasNegativeBalance
                  ? 'bg-red-50/70 ring-1 ring-inset ring-red-200'
                  : cell.isWeekend && cell.isCurrentMonth
                  ? 'bg-[var(--subtle)]'
                  : 'bg-[var(--paper)]',
                cell.isToday ? 'ring-2 ring-kern-600 ring-inset z-10' : '',
                'hover:bg-[var(--subtle)]',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={onDayClick ? () => onDayClick(cell.dateStr, cell.confirmedTransactions) : undefined}
            >
              <span
                className={[
                  'self-start text-[12px] font-semibold font-mono tabular-nums leading-none mb-0.5',
                  cell.isToday
                    ? 'text-kern-600'
                    : cell.isCurrentMonth
                    ? 'text-[var(--ink-2)]'
                    : 'text-[var(--ink-4)]',
                ].join(' ')}
              >
                {cell.day}
              </span>

              <div className="flex flex-col gap-0.5">
                {visibleRecurrings.map((r) => {
                  const isIncome = Number(r.amount) > 0
                  const hasConfirmed = isConfirmedMatch(
                    r,
                    cell.confirmedTransactions,
                    transactions,
                    cell.isCurrentMonth ? year : new Date(cell.dateStr).getFullYear(),
                    cell.isCurrentMonth ? month : new Date(cell.dateStr).getMonth(),
                    cell.day,
                  )
                  const shortName =
                    r.name.length > 14 ? r.name.slice(0, 14) + '…' : r.name

                  return (
                    <div
                      key={r.id}
                      className={[
                        'flex items-center gap-0.5 rounded-[var(--r-sm)] border px-1 py-0.5',
                        isIncome
                          ? 'bg-income-50 border-income-200 text-income-700'
                          : 'bg-kern-50 border-kern-200 text-kern-700',
                      ].join(' ')}
                      title={`${r.name} — ${isIncome ? '+' : '-'}${fmtAmt(r.amount)}`}
                    >
                      {hasConfirmed && (
                        <span className="text-emerald-500 text-[8px] shrink-0">✓</span>
                      )}
                      <span className="text-[10px] truncate hidden sm:inline">
                        {shortName}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums ml-auto shrink-0 hidden sm:inline">
                        {isIncome ? '+' : '-'}{fmtAmt(r.amount)}
                      </span>
                      <span
                        className={[
                          'inline-block w-2.5 h-2.5 rounded-full shrink-0 sm:hidden',
                          isIncome ? 'bg-income-500' : 'bg-kern-500',
                        ].join(' ')}
                        title={`${r.name}: ${isIncome ? '+' : '-'}${fmtAmt(r.amount)}`}
                      />
                    </div>
                  )
                })}

                {overflow > 0 && (
                  <span className="text-[10px] text-[var(--ink-3)] pl-1">
                    +{overflow} meer
                  </span>
                )}
              </div>

              {cell.confirmedTransactions.length > 0 && (
                <div className="mt-auto flex flex-wrap gap-0.5 pt-0.5">
                  {cell.confirmedTransactions.slice(0, 3).map((tx) => (
                    <span
                      key={tx.id}
                      className={[
                        'inline-block h-1.5 w-1.5 rounded-full',
                        Number(tx.amount) > 0 ? 'bg-income-400' : 'bg-[var(--ink-3)]',
                      ].join(' ')}
                      title={`${tx.description} — ${fmtAmt(tx.amount)}`}
                    />
                  ))}
                  {cell.confirmedTransactions.length > 3 && (
                    <span className="text-[8px] text-[var(--ink-4)] font-mono">
                      +{cell.confirmedTransactions.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {sparklineSvg && (
        <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-3">
          <div className="flex items-center justify-between mb-2 px-0.5">
            <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-[var(--ink-3)]">
              Saldo verloop deze maand
            </p>
            <span className="font-mono text-[10px] tabular-nums text-[var(--ink-3)]">
              {Math.min(...dailyBalances) < 0
                ? `Min: ${fmtAmt(Math.min(...dailyBalances))}`
                : `Max: ${fmtAmt(Math.max(...dailyBalances))}`}
            </span>
          </div>
          <svg
            viewBox={`0 0 ${sparklineSvg.svgW} ${sparklineSvg.svgH}`}
            preserveAspectRatio="none"
            className="w-full"
            style={{ height: '48px' }}
            aria-hidden="true"
          >
            {/* Gridlijnen */}
            <line x1="0" y1={sparklineSvg.svgH * 0.25} x2={sparklineSvg.svgW} y2={sparklineSvg.svgH * 0.25} stroke="#e2e0d8" strokeWidth="1"/>
            <line x1="0" y1={sparklineSvg.svgH * 0.5}  x2={sparklineSvg.svgW} y2={sparklineSvg.svgH * 0.5}  stroke="#e2e0d8" strokeWidth="1"/>
            <line x1="0" y1={sparklineSvg.svgH * 0.75} x2={sparklineSvg.svgW} y2={sparklineSvg.svgH * 0.75} stroke="#e2e0d8" strokeWidth="1"/>

            {sparklineSvg.negFillSegments.map((d, i) => (
              <path key={i} d={d} fill="#ef4444" opacity={0.15} />
            ))}

            <path
              d={sparklineSvg.linePath}
              fill="none"
              stroke="var(--color-kern-500, var(--ink-2))"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {sparklineSvg.todayX >= 0 && (
              <line
                x1={sparklineSvg.todayX}
                y1={0}
                x2={sparklineSvg.todayX}
                y2={sparklineSvg.svgH}
                stroke="var(--ink-4)"
                strokeWidth={1}
                strokeDasharray="3 2"
              />
            )}
          </svg>
          <div className="flex justify-between mt-1 px-0.5">
            <span className="text-[9px] text-[var(--ink-4)] font-mono">1</span>
            <span className="text-[9px] text-[var(--ink-4)] font-mono">
              {Math.ceil(dailyBalances.length / 2)}
            </span>
            <span className="text-[9px] text-[var(--ink-4)] font-mono">
              {dailyBalances.length}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--ink-3)] border-t border-[var(--border-ed)] pt-2">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-income-400" />
          Verwacht inkomen
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-kern-400" />
          Verwachte uitgave
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-[var(--ink-3)]" />
          Afgeboekt
        </span>
        {sparklineSvg && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-[2px] w-4 border-t border-dashed border-[var(--ink-4)]" />
            Vandaag
          </span>
        )}
      </div>
    </div>
  )
}

'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Clock } from 'lucide-react'
import { formatWithFreedom } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'

/**
 * Context that provides the user's real daily expense rate
 * calculated from actual transaction data in Supabase.
 */
interface DailyExpenseContextValue {
  dailyExpenseRate: number  // EUR per day
  loading: boolean
  source: 'transactions' | 'none'
  dataMonths: number
}

const DailyExpenseContext = createContext<DailyExpenseContextValue>({
  dailyExpenseRate: 0,
  loading: true,
  source: 'none',
  dataMonths: 0,
})

/**
 * Provider that loads the user's real daily expense rate from transaction data.
 * Wrap your layout/page with this to enable FreedomTimeLabel components.
 */
export function DailyExpenseProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<DailyExpenseContextValue>({
    dailyExpenseRate: 0,
    loading: true,
    source: 'none',
    dataMonths: 0,
  })

  const loadExpenseRate = useCallback(async () => {
    try {
      const supabase = createClient()

      const now = new Date()
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0]

      // Fetch expense transactions from the last 12 months
      const [expenseResult, earliestTxResult] = await Promise.all([
        supabase
          .from('transactions')
          .select('amount, date')
          .lt('amount', 0)
          .gte('date', twelveMonthsAgo)
          .lt('date', monthEnd),
        supabase
          .from('transactions')
          .select('date')
          .lt('amount', 0)
          .gte('date', twelveMonthsAgo)
          .order('date', { ascending: true })
          .limit(1),
      ])

      if (expenseResult.error || earliestTxResult.error) {
        setValue(prev => ({ ...prev, loading: false }))
        return
      }

      const expenses = expenseResult.data ?? []
      const earliestDate = earliestTxResult.data?.[0]?.date

      if (expenses.length > 0 && earliestDate) {
        const earliest = new Date(earliestDate)
        let dataMonths = Math.max(1,
          (now.getFullYear() - earliest.getFullYear()) * 12 +
          (now.getMonth() - earliest.getMonth()) + 1
        )
        dataMonths = Math.min(dataMonths, 12)

        const totalExpenses = expenses.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0)
        const monthlyExpenses = totalExpenses / dataMonths
        const yearlyExpenses = monthlyExpenses * 12
        const dailyExpenseRate = yearlyExpenses / 365

        setValue({
          dailyExpenseRate,
          loading: false,
          source: 'transactions',
          dataMonths,
        })
      } else {
        setValue(prev => ({ ...prev, loading: false, source: 'none' }))
      }
    } catch {
      setValue(prev => ({ ...prev, loading: false }))
    }
  }, [])

  useEffect(() => {
    loadExpenseRate()
  }, [loadExpenseRate])

  return (
    <DailyExpenseContext.Provider value={value}>
      {children}
    </DailyExpenseContext.Provider>
  )
}

/**
 * Hook to access the daily expense rate context.
 */
export function useDailyExpenseRate() {
  return useContext(DailyExpenseContext)
}

/**
 * Convert a EUR amount to freedom time using real daily expenses.
 */
export function eurToFreedomTime(amount: number, dailyExpenseRate: number): {
  days: number
  months: number
  years: number
  formatted: string
  formattedDagen: string
} {
  if (dailyExpenseRate <= 0 || amount <= 0) {
    return { days: 0, months: 0, years: 0, formatted: '-', formattedDagen: '0 dagen' }
  }

  const totalDays = amount / dailyExpenseRate
  const years = Math.floor(totalDays / 365)
  const months = Math.floor((totalDays % 365) / 30)
  const days = Math.round(totalDays % 30)

  let formatted: string
  if (years > 0) {
    formatted = months > 0 ? `${years}j ${months}mnd` : `${years}j`
  } else if (months > 0) {
    formatted = days > 0 ? `${months}mnd ${days}d` : `${months}mnd`
  } else {
    formatted = `${Math.max(days, 1)}d`
  }

  // Dutch-locale decimal days format for budget displays: "2,4 dagen"
  const formattedDagen = totalDays < 1
    ? `${totalDays.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dagen`
    : totalDays < 30
      ? `${totalDays.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dagen`
      : totalDays < 365
        ? `${(totalDays / 30).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} maanden`
        : `${(totalDays / 365).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} jaar`

  return { days: Math.round(totalDays), months, years, formatted, formattedDagen }
}

/**
 * FreedomTimeLabel — Reusable component showing EUR amount + freedom time equivalent.
 *
 * Philosophy: "Geld is opgeslagen tijd" — every EUR represents stored life time.
 * This component translates EUR amounts into how many days/months/years of
 * financial freedom they represent, based on the user's actual daily expenses.
 *
 * Uses formatWithFreedom() utility internally for consistent formatting.
 *
 * Usage:
 *   <FreedomTimeLabel amount={50000} />
 *   → "€50.000 ≈ 2j 3mnd vrijheid"
 *
 *   <FreedomTimeLabel amount={50000} format="long" />
 *   → "€50.000 ≈ 2 jaar en 3 maanden vrijheid"
 *
 * Props:
 *   amount: EUR amount to display (required)
 *   dailyExpenses: optional daily expense rate (overrides context)
 *   showCurrency: whether to show the EUR amount (default true)
 *   showIcon: whether to show clock icon (default false)
 *   size: text size variant (default 'sm')
 *   format: 'short' (e.g. "2j 3m") or 'long' (e.g. "2 jaar en 3 maanden") (default 'short')
 *   className: additional CSS classes
 *   variant: 'inline' shows on same line, 'block' on separate lines
 */
interface FreedomTimeLabelProps {
  amount: number
  dailyExpenses?: number
  showCurrency?: boolean
  showIcon?: boolean
  size?: 'xs' | 'sm' | 'base'
  format?: 'short' | 'long'
  className?: string
  variant?: 'inline' | 'block'
  currencyClassName?: string
  timeClassName?: string
}

export function FreedomTimeLabel({
  amount,
  dailyExpenses,
  showCurrency = true,
  showIcon = false,
  size = 'sm',
  format = 'short',
  className = '',
  variant = 'inline',
  currencyClassName = '',
  timeClassName = '',
}: FreedomTimeLabelProps) {
  const { dailyExpenseRate: contextRate, loading, source } = useDailyExpenseRate()

  // Guard against NaN/undefined/Infinity — treat as 0
  const safeAmount = (amount == null || typeof amount !== 'number' || !isFinite(amount)) ? 0 : amount

  // Use prop dailyExpenses if provided, otherwise use context
  const effectiveDailyRate = dailyExpenses ?? contextRate
  // Guard daily rate against NaN/Infinity
  const safeDailyRate = (effectiveDailyRate == null || typeof effectiveDailyRate !== 'number' || !isFinite(effectiveDailyRate)) ? 0 : effectiveDailyRate

  const hasExpenseData = dailyExpenses != null ? dailyExpenses > 0 : (source === 'transactions' && contextRate > 0)

  // Determine if the amount is a deficit (negative)
  const isDeficit = safeAmount < 0
  const absAmount = Math.abs(safeAmount)

  // Edge case: zero daily expenses with amount >= €100 → show "∞ vrijheid"
  const isZeroExpenses = dailyExpenses != null ? safeDailyRate <= 0 : false
  const showInfinite = absAmount >= 100 && isZeroExpenses && !isDeficit

  // Only show freedom time for amounts over €100 (per spec)
  const showFreedomTime = absAmount >= 100 && hasExpenseData && safeDailyRate > 0

  // Use formatWithFreedom() utility internally for freedom time string
  // Pass original amount (not abs) so deficit framing ("achter") is applied
  const freedomTimeStr = showFreedomTime
    ? formatWithFreedom(safeAmount, safeDailyRate, { format, includeCurrency: false })
    : null

  const sizeClasses = {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
  }

  // Build the time annotation text
  let timeAnnotation: string | null = null
  if (showInfinite) {
    timeAnnotation = '∞ vrijheid'
  } else if (showFreedomTime && freedomTimeStr) {
    // formatWithFreedom with includeCurrency:false returns just the time string
    // For negative amounts it already includes " achter" suffix
    timeAnnotation = isDeficit
      ? `${freedomTimeStr}`
      : `${freedomTimeStr} vrijheid`
  }

  if (variant === 'block') {
    return (
      <span className={`${className}`} data-testid="freedom-time-label">
        {showCurrency && (
          <span className={`font-bold ${sizeClasses[size]} ${currencyClassName}`} data-testid="freedom-time-label-currency">
            <MaskedAmount value={safeAmount} tone="ink" />
          </span>
        )}
        {timeAnnotation && !loading && (
          <span className={`flex items-center gap-1 text-sm italic font-normal text-[var(--ink-3)] ${timeClassName}`} data-testid="freedom-time-label-time">
            {showIcon && <Clock className="h-3 w-3" />}
            ≈ {timeAnnotation}
          </span>
        )}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} data-testid="freedom-time-label">
      {showCurrency && (
        <span className={`font-semibold ${sizeClasses[size]} ${currencyClassName}`} data-testid="freedom-time-label-currency">
          <MaskedAmount value={safeAmount} tone="ink" />
        </span>
      )}
      {timeAnnotation && !loading && (
        <span className={`inline-flex items-center gap-0.5 text-sm italic font-normal text-[var(--ink-3)] ${timeClassName}`} data-testid="freedom-time-label-time">
          {showIcon && <Clock className="h-3 w-3" />}
          <span>≈ {timeAnnotation}</span>
        </span>
      )}
    </span>
  )
}

/**
 * Standalone freedom time display (no EUR amount, just time).
 * For cases where the EUR is shown separately.
 */
export function FreedomTimeBadge({
  amount,
  className = '',
  showIcon = true,
}: {
  amount: number
  className?: string
  showIcon?: boolean
}) {
  const { dailyExpenseRate, loading, source } = useDailyExpenseRate()

  if (loading || source === 'none' || dailyExpenseRate <= 0 || Math.abs(amount) < 100) {
    return null
  }

  const freedom = eurToFreedomTime(Math.abs(amount), dailyExpenseRate)

  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-kern-50 px-2 py-0.5 text-xs font-medium text-kern-700 ${className}`}>
      {showIcon && <Clock className="h-3 w-3" />}
      <span className="font-mono">{freedom.formatted}</span> vrijheid
    </span>
  )
}

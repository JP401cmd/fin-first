'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Clock } from 'lucide-react'

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
} {
  if (dailyExpenseRate <= 0 || amount <= 0) {
    return { days: 0, months: 0, years: 0, formatted: '-' }
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

  return { days: Math.round(totalDays), months, years, formatted }
}

/**
 * FreedomTimeLabel — Reusable component showing EUR amount + freedom time equivalent.
 *
 * Philosophy: "Geld is opgeslagen tijd" — every EUR represents stored life time.
 * This component translates EUR amounts into how many days/months/years of
 * financial freedom they represent, based on the user's actual daily expenses.
 *
 * Usage:
 *   <FreedomTimeLabel amount={50000} />
 *   → "€50.000 ≈ 2j 3mnd vrijheid"
 *
 * Props:
 *   amount: EUR amount to display (required)
 *   showCurrency: whether to show the EUR amount (default true)
 *   showIcon: whether to show clock icon (default false)
 *   size: text size variant (default 'sm')
 *   className: additional CSS classes
 *   variant: 'inline' shows on same line, 'block' on separate lines
 */
interface FreedomTimeLabelProps {
  amount: number
  showCurrency?: boolean
  showIcon?: boolean
  size?: 'xs' | 'sm' | 'base'
  className?: string
  variant?: 'inline' | 'block'
  currencyClassName?: string
  timeClassName?: string
}

export function FreedomTimeLabel({
  amount,
  showCurrency = true,
  showIcon = false,
  size = 'sm',
  className = '',
  variant = 'inline',
  currencyClassName = '',
  timeClassName = '',
}: FreedomTimeLabelProps) {
  const { dailyExpenseRate, loading, source } = useDailyExpenseRate()

  // Only show freedom time for amounts over €100 (per spec)
  const showFreedomTime = Math.abs(amount) >= 100 && source === 'transactions' && dailyExpenseRate > 0

  const formattedCurrency = new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)

  const freedom = showFreedomTime
    ? eurToFreedomTime(Math.abs(amount), dailyExpenseRate)
    : null

  const sizeClasses = {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
  }

  if (variant === 'block') {
    return (
      <span className={`${className}`}>
        {showCurrency && (
          <span className={`font-bold ${sizeClasses[size]} ${currencyClassName}`}>
            {formattedCurrency}
          </span>
        )}
        {showFreedomTime && freedom && !loading && (
          <span className={`flex items-center gap-1 text-xs text-amber-600/80 ${timeClassName}`}>
            {showIcon && <Clock className="h-3 w-3" />}
            ≈ {freedom.formatted} vrijheid
          </span>
        )}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {showCurrency && (
        <span className={`font-semibold ${sizeClasses[size]} ${currencyClassName}`}>
          {formattedCurrency}
        </span>
      )}
      {showFreedomTime && freedom && !loading && (
        <span className={`inline-flex items-center gap-0.5 text-xs text-amber-600/80 ${timeClassName}`}>
          {showIcon && <Clock className="h-3 w-3" />}
          <span>≈ {freedom.formatted}</span>
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
    <span className={`inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ${className}`}>
      {showIcon && <Clock className="h-3 w-3" />}
      {freedom.formatted} vrijheid
    </span>
  )
}

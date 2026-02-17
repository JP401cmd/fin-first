/**
 * Shared formatting utilities (server-safe, no 'use client').
 */

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatCurrencyDecimals(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Freedom time breakdown from a EUR amount and daily expenses.
 */
export interface FreedomTimeBreakdown {
  years: number
  months: number
  days: number
  totalDays: number
}

/**
 * Options for formatWithFreedom().
 */
export interface FormatWithFreedomOptions {
  /** Output format: 'long' = "12 jaar en 3 maanden", 'short' = "12j 3m" */
  format?: 'long' | 'short'
  /** Whether to include the EUR amount before the freedom time. Default: true */
  includeCurrency?: boolean
  /** Whether to include days in the output (only when < 1 month). Default: true */
  includeDays?: boolean
}

/**
 * Calculate freedom time breakdown from EUR amount and daily expenses.
 *
 * @param amount - EUR amount to convert
 * @param dailyExpenses - Daily expenses in EUR (amount / dailyExpenses = freedom days)
 * @returns Breakdown of years, months, days, and totalDays
 */
export function calculateFreedomTime(
  amount: number,
  dailyExpenses: number
): FreedomTimeBreakdown {
  // Handle zero or negative daily expenses
  if (dailyExpenses <= 0) {
    return { years: 0, months: 0, days: 0, totalDays: 0 }
  }

  // Handle negative amounts (debt / spending)
  const absoluteAmount = Math.abs(amount)
  const totalDays = absoluteAmount / dailyExpenses

  // Cap at a reasonable maximum (9999 years) to prevent display issues
  const cappedDays = Math.min(totalDays, 9999 * 365)

  const years = Math.floor(cappedDays / 365)
  const remainingAfterYears = cappedDays - years * 365
  const months = Math.floor(remainingAfterYears / 30)
  const days = Math.round(remainingAfterYears - months * 30)

  return {
    years,
    months,
    days,
    totalDays: Math.round(totalDays * 10) / 10,
  }
}

/**
 * Format freedom time breakdown as a Dutch string.
 *
 * @param breakdown - Freedom time breakdown from calculateFreedomTime()
 * @param format - 'long' for "12 jaar en 3 maanden", 'short' for "12j 3m"
 * @param includeDays - Whether to include days (shown when < 1 month)
 * @returns Formatted Dutch freedom time string
 */
export function formatFreedomTimeString(
  breakdown: FreedomTimeBreakdown,
  format: 'long' | 'short' = 'long',
  includeDays: boolean = true
): string {
  const { years, months, days } = breakdown

  if (years === 0 && months === 0 && days === 0) {
    return format === 'long' ? '0 dagen' : '0d'
  }

  if (format === 'short') {
    const parts: string[] = []
    if (years > 0) parts.push(`${years}j`)
    if (months > 0) parts.push(`${months}m`)
    if (includeDays && years === 0 && months === 0 && days > 0) {
      parts.push(`${days}d`)
    }
    return parts.join(' ') || '0d'
  }

  // Long format
  const parts: string[] = []
  if (years > 0) {
    parts.push(`${years} jaar`)
  }
  if (months > 0) {
    parts.push(`${months} ${months === 1 ? 'maand' : 'maanden'}`)
  }
  if (includeDays && years === 0 && months === 0 && days > 0) {
    parts.push(`${days} ${days === 1 ? 'dag' : 'dagen'}`)
  }

  if (parts.length === 0) {
    return '0 dagen'
  }

  if (parts.length === 1) {
    return parts[0]
  }

  // Join with "en" for the last part: "12 jaar en 3 maanden"
  return parts.slice(0, -1).join(', ') + ' en ' + parts[parts.length - 1]
}

/**
 * Convert a EUR amount to a formatted string with freedom-time equivalent.
 *
 * Core utility for the TriFinity philosophy: "Geld is opgeslagen tijd"
 * (Money is stored time). Every EUR amount represents freedom time.
 *
 * @param amount - EUR amount to convert
 * @param dailyExpenses - User's daily expenses in EUR
 * @param options - Formatting options
 * @returns Formatted string, e.g. "€450.000 (12 jaar en 3 maanden)"
 *
 * @example
 * // Long format (default)
 * formatWithFreedom(450000, 100) // "€ 450.000 (12 jaar en 3 maanden)"
 *
 * // Short format
 * formatWithFreedom(450000, 100, { format: 'short' }) // "€ 450.000 (12j 3m)"
 *
 * // Without currency
 * formatWithFreedom(450000, 100, { includeCurrency: false }) // "12 jaar en 3 maanden"
 *
 * // Zero expenses edge case
 * formatWithFreedom(450000, 0) // "€ 450.000 (∞ vrijheid)"
 *
 * // Negative amount (debt/spending)
 * formatWithFreedom(-5000, 100) // "-€ 5.000 (1 maand en 20 dagen)"
 */
export function formatWithFreedom(
  amount: number,
  dailyExpenses: number,
  options: FormatWithFreedomOptions = {}
): string {
  const {
    format = 'long',
    includeCurrency = true,
    includeDays = true,
  } = options

  const currencyStr = formatCurrency(amount)

  // Edge case: zero or negative daily expenses → infinite freedom
  if (dailyExpenses <= 0) {
    if (!includeCurrency) {
      return '∞ vrijheid'
    }
    return amount === 0
      ? `${currencyStr} (0 dagen)`
      : `${currencyStr} (∞ vrijheid)`
  }

  // Edge case: zero amount
  if (amount === 0) {
    const zeroTime = format === 'long' ? '0 dagen' : '0d'
    return includeCurrency ? `${currencyStr} (${zeroTime})` : zeroTime
  }

  const breakdown = calculateFreedomTime(amount, dailyExpenses)
  const timeStr = formatFreedomTimeString(breakdown, format, includeDays)

  if (!includeCurrency) {
    return timeStr
  }

  return `${currencyStr} (${timeStr})`
}

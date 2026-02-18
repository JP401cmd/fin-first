/**
 * Shared formatting utilities (server-safe, no 'use client').
 */

/**
 * Guard against NaN/undefined/Infinity — returns 0 for any non-finite input.
 */
function safeNumber(value: unknown): number {
  if (value == null || typeof value !== 'number' || !isFinite(value)) {
    return 0
  }
  return value
}

export function formatCurrency(value: number): string {
  const safe = safeNumber(value)
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safe)
}

export function formatCurrencyDecimals(value: number): string {
  const safe = safeNumber(value)
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe)
}

/**
 * Freedom time breakdown from a EUR amount and daily expenses.
 */
export interface FreedomTimeBreakdown {
  years: number
  months: number
  days: number
  totalDays: number
  /** Whether the original amount was negative (deficit/debt) */
  isDeficit: boolean
  /** Whether the result represents infinite freedom (zero daily expenses with positive amount) */
  isInfinite: boolean
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
 * Handles edge cases:
 * - NaN/undefined/Infinity inputs → returns zero breakdown
 * - Zero daily expenses with non-zero amount → isInfinite: true
 * - Negative amounts → isDeficit: true (uses absolute value for calculation)
 * - Very large amounts → capped at 9999 years
 *
 * @param amount - EUR amount to convert
 * @param dailyExpenses - Daily expenses in EUR (amount / dailyExpenses = freedom days)
 * @returns Breakdown of years, months, days, totalDays, isDeficit, and isInfinite
 */
export function calculateFreedomTime(
  amount: number,
  dailyExpenses: number
): FreedomTimeBreakdown {
  const safeAmount = safeNumber(amount)
  const safeExpenses = safeNumber(dailyExpenses)

  // Handle zero or negative daily expenses
  if (safeExpenses <= 0) {
    return {
      years: 0,
      months: 0,
      days: 0,
      totalDays: 0,
      isDeficit: safeAmount < 0,
      isInfinite: safeAmount !== 0,
    }
  }

  // Track deficit state before using absolute value
  const isDeficit = safeAmount < 0

  // Handle negative amounts (debt / spending)
  const absoluteAmount = Math.abs(safeAmount)
  const totalDays = absoluteAmount / safeExpenses

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
    isDeficit,
    isInfinite: false,
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
 * Edge cases handled:
 * - NaN/undefined/Infinity → returns "€ 0 (0 dagen)" or "0 dagen" (does not crash)
 * - Zero daily expenses → shows "∞ vrijheid" (oneindig, not JavaScript Infinity)
 * - Negative amounts → shows deficit framing: "X dagen achter" (debt = time owed)
 * - Amounts under €100 → shows currency only (no freedom time) when threshold enforced
 * - Very large amounts → capped at 9999 years for display
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
 * // Negative amount (debt/spending) — deficit framing
 * formatWithFreedom(-5000, 100) // "-€ 5.000 (1 maand en 20 dagen achter)"
 *
 * // NaN/undefined safety
 * formatWithFreedom(NaN, 100) // "€ 0 (0 dagen)"
 * formatWithFreedom(5000, NaN) // "€ 5.000 (∞ vrijheid)"
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

  // Sanitize inputs — NaN, undefined, Infinity all become 0
  const safeAmount = safeNumber(amount)
  const safeExpenses = safeNumber(dailyExpenses)

  const currencyStr = formatCurrency(safeAmount)

  // Edge case: zero or negative daily expenses → infinite freedom (oneindig)
  if (safeExpenses <= 0) {
    if (!includeCurrency) {
      return safeAmount === 0 ? (format === 'long' ? '0 dagen' : '0d') : '∞ vrijheid'
    }
    return safeAmount === 0
      ? `${currencyStr} (${format === 'long' ? '0 dagen' : '0d'})`
      : `${currencyStr} (∞ vrijheid)`
  }

  // Edge case: zero amount
  if (safeAmount === 0) {
    const zeroTime = format === 'long' ? '0 dagen' : '0d'
    return includeCurrency ? `${currencyStr} (${zeroTime})` : zeroTime
  }

  const breakdown = calculateFreedomTime(safeAmount, safeExpenses)
  const timeStr = formatFreedomTimeString(breakdown, format, includeDays)

  // Deficit framing for negative amounts: "X dagen achter" (time behind/owed)
  const isNegative = safeAmount < 0
  const deficitSuffix = isNegative ? ' achter' : ''

  if (!includeCurrency) {
    return `${timeStr}${deficitSuffix}`
  }

  return `${currencyStr} (${timeStr}${deficitSuffix})`
}

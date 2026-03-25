/**
 * Pure computation functions for counterparty transaction analysis.
 * No React or Supabase dependencies — server-safe.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CounterpartyTransaction = {
  id: string
  date: string
  amount: number
  description: string
  budget_id: string | null
  is_income: boolean
  budget: { name: string } | null
}

export type MonthlyBreakdown = {
  /** 'YYYY-MM' key */
  month: string
  /** Display label, e.g. 'jan 2026' */
  label: string
  /** Sum of amounts (negative = expenses) */
  total: number
  /** Number of transactions */
  count: number
}

export type CategoryBreakdown = {
  budgetId: string | null
  budgetName: string
  total: number
  count: number
  /** 0–100 */
  percentage: number
}

export type FrequencyPattern = {
  /** Dutch label: 'Maandelijks', 'Wekelijks', etc. */
  label: string
  /** Average days between transactions */
  averageDaysBetween: number
  confidence: 'high' | 'medium' | 'low'
}

export type CounterpartyStats = {
  totalSpent: number
  totalReceived: number
  transactionCount: number
  averageAmount: number
  firstDate: string
  lastDate: string
  monthlyBreakdown: MonthlyBreakdown[]
  categoryBreakdown: CategoryBreakdown[]
  frequency: FrequencyPattern
}

// ── Dutch month abbreviations ────────────────────────────────────────────────

const MONTH_ABBR = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a)
  const db = new Date(b)
  return Math.abs(Math.round((db.getTime() - da.getTime()) / 86_400_000))
}

function classifyFrequency(medianDays: number, stdDev: number): FrequencyPattern {
  const ratio = medianDays > 0 ? stdDev / medianDays : 1

  if (medianDays >= 5 && medianDays <= 9) {
    return { label: 'Wekelijks', averageDaysBetween: medianDays, confidence: ratio < 0.3 ? 'high' : ratio < 0.6 ? 'medium' : 'low' }
  }
  if (medianDays >= 12 && medianDays <= 18) {
    return { label: 'Tweewekelijks', averageDaysBetween: medianDays, confidence: ratio < 0.3 ? 'high' : ratio < 0.6 ? 'medium' : 'low' }
  }
  if (medianDays >= 25 && medianDays <= 35) {
    return { label: 'Maandelijks', averageDaysBetween: medianDays, confidence: ratio < 0.3 ? 'high' : ratio < 0.6 ? 'medium' : 'low' }
  }
  if (medianDays >= 85 && medianDays <= 100) {
    return { label: 'Per kwartaal', averageDaysBetween: medianDays, confidence: ratio < 0.3 ? 'high' : ratio < 0.6 ? 'medium' : 'low' }
  }
  if (medianDays >= 350 && medianDays <= 380) {
    return { label: 'Jaarlijks', averageDaysBetween: medianDays, confidence: ratio < 0.3 ? 'high' : ratio < 0.6 ? 'medium' : 'low' }
  }
  return { label: 'Onregelmatig', averageDaysBetween: medianDays, confidence: 'low' }
}

// ── Category breakdown helper ────────────────────────────────────────────────

function buildCategoryBreakdown(transactions: CounterpartyTransaction[]): CategoryBreakdown[] {
  if (transactions.length === 0) return []

  const catMap = new Map<string, { budgetName: string; total: number; count: number }>()
  for (const tx of transactions) {
    const key = tx.budget_id ?? '__none__'
    const entry = catMap.get(key) ?? { budgetName: tx.budget?.name ?? 'Niet gecategoriseerd', total: 0, count: 0 }
    entry.total += tx.amount
    entry.count++
    catMap.set(key, entry)
  }

  const totalAbs = transactions.reduce((s, t) => s + Math.abs(t.amount), 0)
  return Array.from(catMap.entries())
    .map(([budgetId, { budgetName, total, count }]) => ({
      budgetId: budgetId === '__none__' ? null : budgetId,
      budgetName,
      total,
      count,
      percentage: totalAbs > 0 ? Math.round((Math.abs(total) / totalAbs) * 100) : 0,
    }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
}

/**
 * Compute category breakdown for a subset of transactions (e.g. filtered by month).
 */
export function computeMonthCategoryBreakdown(
  transactions: CounterpartyTransaction[],
): CategoryBreakdown[] {
  return buildCategoryBreakdown(transactions)
}

// ── Main computation ─────────────────────────────────────────────────────────

export function computeCounterpartyStats(
  transactions: CounterpartyTransaction[],
): CounterpartyStats {
  if (transactions.length === 0) {
    return {
      totalSpent: 0, totalReceived: 0, transactionCount: 0, averageAmount: 0,
      firstDate: '', lastDate: '',
      monthlyBreakdown: [], categoryBreakdown: [],
      frequency: { label: 'Onregelmatig', averageDaysBetween: 0, confidence: 'low' },
    }
  }

  // Sort ascending by date
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

  // ── Totals ───────────────────────────────────────────────────────────
  let totalSpent = 0
  let totalReceived = 0
  for (const tx of sorted) {
    if (tx.amount < 0) totalSpent += tx.amount
    else totalReceived += tx.amount
  }
  const totalAmount = sorted.reduce((s, t) => s + t.amount, 0)
  const averageAmount = totalAmount / sorted.length

  // ── Monthly breakdown ────────────────────────────────────────────────
  const monthMap = new Map<string, { total: number; count: number }>()
  for (const tx of sorted) {
    const key = tx.date.slice(0, 7) // 'YYYY-MM'
    const entry = monthMap.get(key) ?? { total: 0, count: 0 }
    entry.total += tx.amount
    entry.count++
    monthMap.set(key, entry)
  }

  const monthlyBreakdown: MonthlyBreakdown[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { total, count }]) => {
      const [y, m] = month.split('-')
      return { month, label: `${MONTH_ABBR[parseInt(m, 10) - 1]} ${y}`, total, count }
    })

  // ── Category breakdown ───────────────────────────────────────────────
  const categoryBreakdown = buildCategoryBreakdown(sorted)

  // ── Frequency detection ──────────────────────────────────────────────
  let frequency: FrequencyPattern = { label: 'Onregelmatig', averageDaysBetween: 0, confidence: 'low' }

  if (sorted.length >= 3) {
    const intervals: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i - 1].date, sorted[i].date))
    }
    intervals.sort((a, b) => a - b)
    const med = median(intervals)
    const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length
    const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length
    const stdDev = Math.sqrt(variance)
    frequency = classifyFrequency(med, stdDev)
  }

  return {
    totalSpent,
    totalReceived,
    transactionCount: sorted.length,
    averageAmount,
    firstDate: sorted[0].date,
    lastDate: sorted[sorted.length - 1].date,
    monthlyBreakdown,
    categoryBreakdown,
    frequency,
  }
}

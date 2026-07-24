/**
 * Recurring transaction types and helpers.
 */

export type RecurringCategoryOverride = 'subscription' | 'vaste_kosten' | 'excluded'

export type RecurringTransaction = {
  id: string
  user_id: string
  account_id: string
  budget_id: string | null
  name: string
  amount: number
  description: string | null
  counterparty_name: string | null
  frequency: 'monthly' | 'weekly' | 'yearly' | 'quarterly'
  day_of_month: number | null
  day_of_week: number | null
  start_date: string
  end_date: string | null
  is_active: boolean
  last_generated: string | null
  sort_order: number
  created_at: string
  /** User override for category: null = auto-detect */
  category_override: RecurringCategoryOverride | null
}

export const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Maandelijks',
  weekly: 'Wekelijks',
  yearly: 'Jaarlijks',
  quarterly: 'Per kwartaal',
}

const DAY_NAMES = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']

/**
 * Whether a recurring rule's end_date has already passed relative to
 * `referenceDate` (default: local today). A rule zonder end_date (NULL) is NOOIT
 * verlopen. Eén gedeelde grens zodat elke consument van "telt deze regel nog mee?"
 * (maandtotaal, kalender, vaste-lasten) dezelfde beslissing neemt — consume,
 * don't recompute.
 */
export function isRecurringExpired(
  r: Pick<RecurringTransaction, 'end_date'>,
  referenceDate?: Date,
): boolean {
  if (!r.end_date) return false
  const now = referenceDate ?? new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return new Date(r.end_date) < today
}

/**
 * Get the expected monthly cost/income from a set of recurring transactions.
 */
export function getExpectedMonthlyTotal(recurrings: RecurringTransaction[]): number {
  let total = 0
  const now = new Date()
  for (const r of recurrings) {
    if (!r.is_active) continue
    if (isRecurringExpired(r, now)) continue
    const amount = Number(r.amount)
    switch (r.frequency) {
      case 'weekly':
        total += amount * (52 / 12)
        break
      case 'monthly':
        total += amount
        break
      case 'quarterly':
        total += amount / 3
        break
      case 'yearly':
        total += amount / 12
        break
    }
  }
  return Math.round(total * 100) / 100
}

/**
 * Dag-van-de-maand (1–31) uit een 'YYYY-MM-DD'(…)-datumstring — LOKAAL geparsed,
 * nooit via `new Date()`/UTC. Een 'YYYY-MM-DD'-string als `new Date(str)` wordt
 * op UTC-middernacht gezet; `.getDate()` kan de dag dan over een maandgrens
 * heen schuiven (de bekende TZ-trap). Stringparsing is dag-stabiel.
 */
export function dayOfMonthFromISODate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!m) return null
  const day = parseInt(m[3], 10)
  return day >= 1 && day <= 31 ? day : null
}

/**
 * Meest voorkomende dag-van-de-maand uit een set incasso-datums. Telt naburige
 * dagen (±1) half mee zodat maand-eind-variaties (28/29/30/31) niet versplinteren;
 * bij gelijke score wint de laagste dag (deterministisch). Lokaal geparsed.
 */
function mostCommonDayOfMonth(dates: string[]): number | null {
  const counts = new Map<number, number>()
  for (const d of dates) {
    const day = dayOfMonthFromISODate(d)
    if (day == null) continue
    counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  let best: number | null = null
  let bestScore = -1
  for (const [day, count] of counts) {
    let score = count
    for (const [other, otherCount] of counts) {
      if (other !== day && Math.abs(other - day) <= 1) score += otherCount * 0.5
    }
    if (score > bestScore || (score === bestScore && (best == null || day < best))) {
      bestScore = score
      best = day
    }
  }
  return best
}

function normalizeCounterparty(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim()
}

/** Minimale transactievorm die de incassodag-afleiding nodig heeft. */
export type DayDerivationTx = {
  counterparty_name?: string | null
  date: string
  amount?: number | null
}

/**
 * Vult ontbrekende `day_of_month` op recurrings aan uit de transactiegeschiedenis
 * — dé beschikbare bron voor de wérkelijke incassodag. Zonder deze afleiding valt
 * `getNextOccurrence` terug op één vaste dag, waardoor álle vaste lasten op de
 * kalender op dezelfde rand-dag samenklonteren (de gerapporteerde bug).
 *
 * Match: counterparty_name (genormaliseerd) + teken (uitgave ↔ uitgave, inkomen ↔
 * inkomen). Neemt de meest voorkomende dag-van-de-maand uit de matchende posten.
 * Geen match → dag-van-de-maand van `start_date`. Zo landt elke post op zíjn eigen
 * dag. Alleen `day_of_month == null` en niet-wekelijkse regels worden aangevuld;
 * bestaande waarden blijven ongemoeid (consume, don't recompute).
 */
export function withDerivedDayOfMonth(
  recurrings: RecurringTransaction[],
  transactions: DayDerivationTx[],
): RecurringTransaction[] {
  // Index incasso-datums per counterparty + teken (expense/income).
  const byKey = new Map<string, string[]>()
  for (const t of transactions) {
    const key = normalizeCounterparty(t.counterparty_name)
    if (!key || !t.date) continue
    const sign = Number(t.amount ?? 0) < 0 ? 'exp' : 'inc'
    const k = `${sign}:${key}`
    const list = byKey.get(k)
    if (list) list.push(t.date)
    else byKey.set(k, [t.date])
  }

  return recurrings.map((r) => {
    if (r.day_of_month != null) return r
    if (r.frequency === 'weekly') return r
    const key = normalizeCounterparty(r.counterparty_name ?? r.name)
    const sign = Number(r.amount) < 0 ? 'exp' : 'inc'
    const dates = key ? byKey.get(`${sign}:${key}`) ?? [] : []
    const derived = mostCommonDayOfMonth(dates) ?? dayOfMonthFromISODate(r.start_date)
    return derived != null ? { ...r, day_of_month: derived } : r
  })
}

/**
 * Get the next occurrence date for a recurring transaction.
 */
export function getNextOccurrence(r: RecurringTransaction): Date | null {
  if (!r.is_active) return null

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (isRecurringExpired(r, now)) return null

  if (r.frequency === 'weekly' && r.day_of_week != null) {
    const currentDay = today.getDay()
    let daysAhead = r.day_of_week - currentDay
    if (daysAhead <= 0) daysAhead += 7
    const next = new Date(today)
    next.setDate(next.getDate() + daysAhead)
    return next
  }

  if (r.frequency === 'monthly' || r.frequency === 'quarterly') {
    // Per-regel dag: expliciete day_of_month → dag uit start_date → 1. Nooit een
    // globale vaste dag als val-terug, anders klonteren alle regels samen.
    const day = r.day_of_month ?? dayOfMonthFromISODate(r.start_date) ?? 1
    let next = new Date(today.getFullYear(), today.getMonth(), day)
    if (next <= today) {
      const monthsAhead = r.frequency === 'quarterly' ? 3 : 1
      next = new Date(today.getFullYear(), today.getMonth() + monthsAhead, day)
    }
    return next
  }

  if (r.frequency === 'yearly') {
    const day = r.day_of_month ?? dayOfMonthFromISODate(r.start_date) ?? 1
    const startDate = new Date(r.start_date)
    let next = new Date(today.getFullYear(), startDate.getMonth(), day)
    if (next <= today) {
      next = new Date(today.getFullYear() + 1, startDate.getMonth(), day)
    }
    return next
  }

  return null
}

/**
 * Get upcoming transactions within a number of days.
 */
export function getUpcomingTransactions(
  recurrings: RecurringTransaction[],
  daysAhead: number = 30,
): { recurring: RecurringTransaction; nextDate: Date }[] {
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() + daysAhead)

  const upcoming: { recurring: RecurringTransaction; nextDate: Date }[] = []

  for (const r of recurrings) {
    const next = getNextOccurrence(r)
    if (next && next <= cutoff) {
      upcoming.push({ recurring: r, nextDate: next })
    }
  }

  return upcoming.sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime())
}

/**
 * Format the schedule description for display.
 */
export function formatSchedule(r: RecurringTransaction): string {
  const freq = FREQUENCY_LABELS[r.frequency] ?? r.frequency
  if (r.frequency === 'weekly' && r.day_of_week != null) {
    return `${freq} op ${DAY_NAMES[r.day_of_week]}`
  }
  if ((r.frequency === 'monthly' || r.frequency === 'quarterly') && r.day_of_month) {
    return `${freq} op de ${r.day_of_month}e`
  }
  return freq
}

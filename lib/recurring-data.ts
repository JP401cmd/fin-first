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
 * Maand-index (0-11) uit een 'YYYY-MM-DD'-string — lokaal geparsed, net als
 * `dayOfMonthFromISODate`. `new Date(str).getMonth()` zet de string op
 * UTC-middernacht en kan in een negatieve offset een maand terugvallen.
 */
export function monthFromISODate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!m) return null
  const month = parseInt(m[2], 10) - 1
  return month >= 0 && month <= 11 ? month : null
}

/** Jaartal uit een 'YYYY-MM-DD'-string. */
function yearFromISODate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Datum in een maand, GEKLEMD op de laatste dag van die maand.
 *
 * `new Date(2026, 1, 31)` (31 februari) rolt in JS door naar 3 maart — een
 * incasso op de 31e sprong daardoor over de maandgrens heen en landde in de
 * verkeerde kalenderweek. Klemmen op de laatste dag is wat een incassant
 * feitelijk doet.
 */
function dateInMonth(year: number, monthIndex: number, day: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(Math.max(day, 1), lastDay))
}

/**
 * ROOSTER — de kale feiten waaruit "wanneer komt dit weer" volgt.
 *
 * Bewust losgekoppeld van `RecurringTransaction`, zodat óók een nog niet
 * bevestigde detectie (`DetectedRecurring` uit lib/recurring-detection.ts, met
 * `dayOfMonth`/`dayOfWeek`/`dates[0]`) door DEZELFDE motor gaat als een
 * bevestigde rij. Bevinding M21: de kalender liet gedetecteerde vaste lasten weg
 * omdat er geen datum bij zat; een tweede, eigen datumheuristiek ernaast zou
 * gegarandeerde drift zijn.
 */
export type RecurringSchedule = {
  frequency: 'monthly' | 'weekly' | 'yearly' | 'quarterly'
  /** Incassodag 1-31, of null → afgeleid uit `startDate`. */
  dayOfMonth: number | null
  /** 0 = zondag … 6 = zaterdag. Alleen voor `weekly`. */
  dayOfWeek: number | null
  /**
   * Anker: eerste (waargenomen of ingestelde) datum, 'YYYY-MM-DD'.
   * Bepaalt de FASE van een kwartaal-/jaarrooster — zonder anker weet je niet
   * of "per kwartaal" in jan/apr/jul/okt of in feb/mei/aug/nov valt.
   */
  startDate: string | null
}

/**
 * Eerstvolgende voorkomen ná `referenceDate` (default: vandaag, lokaal).
 *
 * Regels per frequentie:
 *  · **weekly** — vereist `dayOfWeek`; zonder die dag is er niets eerlijks te
 *    zeggen en geeft de functie `null` (liever geen marker dan een verzonnen).
 *  · **monthly** — de incassodag in deze maand; is die geweest, dan volgende
 *    maand. Geklemd op de maandlengte (de 31e → 28/29/30 in een korte maand).
 *  · **quarterly** — stapt in blokken van drie maanden vanaf de ANKERMAAND uit
 *    `startDate`, zodat de fase klopt. (Voorheen werd altijd vanaf de HUIDIGE
 *    maand gestapt, waardoor een kwartaalpost in het verkeerde kwartaal viel.)
 *  · **yearly** — de ankermaand + incassodag, dit jaar of anders volgend jaar.
 *
 * Val-terug voor de dag: expliciete `dayOfMonth` → dag uit `startDate` → 1.
 * Nooit een globaal vaste dag, anders klonteren alle regels op één kalenderdag.
 */
export function nextOccurrenceFromSchedule(
  schedule: RecurringSchedule,
  referenceDate?: Date,
): Date | null {
  const now = referenceDate ?? new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (schedule.frequency === 'weekly') {
    if (schedule.dayOfWeek == null) return null
    let daysAhead = schedule.dayOfWeek - today.getDay()
    if (daysAhead <= 0) daysAhead += 7
    const next = new Date(today)
    next.setDate(next.getDate() + daysAhead)
    return next
  }

  const day = schedule.dayOfMonth ?? dayOfMonthFromISODate(schedule.startDate) ?? 1

  if (schedule.frequency === 'monthly') {
    const next = dateInMonth(today.getFullYear(), today.getMonth(), day)
    return next > today ? next : dateInMonth(today.getFullYear(), today.getMonth() + 1, day)
  }

  if (schedule.frequency === 'quarterly') {
    // Absolute maandindex, zodat de jaargrens vanzelf goed gaat.
    const anchorMonth = monthFromISODate(schedule.startDate) ?? today.getMonth()
    const anchorYear = yearFromISODate(schedule.startDate) ?? today.getFullYear()
    const anchor = anchorYear * 12 + anchorMonth
    const current = today.getFullYear() * 12 + today.getMonth()
    const steps = Math.max(0, Math.ceil((current - anchor) / 3))
    let index = anchor + steps * 3
    let next = dateInMonth(Math.floor(index / 12), index % 12, day)
    if (next <= today) {
      index += 3
      next = dateInMonth(Math.floor(index / 12), index % 12, day)
    }
    return next
  }

  if (schedule.frequency === 'yearly') {
    const anchorMonth = monthFromISODate(schedule.startDate) ?? today.getMonth()
    const next = dateInMonth(today.getFullYear(), anchorMonth, day)
    return next > today ? next : dateInMonth(today.getFullYear() + 1, anchorMonth, day)
  }

  return null
}

/**
 * Get the next occurrence date for a recurring transaction.
 *
 * Dunne schil om `nextOccurrenceFromSchedule` — die is de motor; hier staan
 * alleen de rij-specifieke poorten (inactief / verlopen).
 */
export function getNextOccurrence(
  r: RecurringTransaction,
  referenceDate?: Date,
): Date | null {
  if (!r.is_active) return null

  const now = referenceDate ?? new Date()
  if (isRecurringExpired(r, now)) return null

  return nextOccurrenceFromSchedule(
    {
      frequency: r.frequency,
      dayOfMonth: r.day_of_month,
      dayOfWeek: r.day_of_week,
      startDate: r.start_date,
    },
    now,
  )
}

/**
 * Get upcoming transactions within a number of days.
 */
export function getUpcomingTransactions(
  recurrings: RecurringTransaction[],
  daysAhead: number = 30,
  referenceDate?: Date,
): { recurring: RecurringTransaction; nextDate: Date }[] {
  const now = referenceDate ?? new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() + daysAhead)

  const upcoming: { recurring: RecurringTransaction; nextDate: Date }[] = []

  for (const r of recurrings) {
    const next = getNextOccurrence(r, now)
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

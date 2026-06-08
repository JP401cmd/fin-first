/**
 * Pure rekenfuncties voor de transactie-analysepagina
 * (/overzicht/cashflow/transacties). Geen React- of Supabase-afhankelijkheden —
 * server-safe en los te unit-testen (zie transaction-insights.test.ts).
 *
 * Conventies:
 *  - `amount` < 0 = uitgave, > 0 = inkomst (perspectief-geschaald bij weergave).
 *  - `transaction_type === 'transfer'` (eigen-rekening-overboeking) wordt in ALLE
 *    aggregaten uitgesloten — anders blazen transfers in- én uitstroom dubbel op
 *    (de bug in de oude TransactiesGeldstroom). Spiegelt cash-account-view.tsx.
 *  - Datums zijn ISO 'yyyy-mm-dd' en worden lokaal geparsed (geen UTC-drift).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type PeriodKind = '30d' | 'month' | 'quarter' | 'year'

/** Minimale transactievorm die de inzichten nodig hebben. */
export interface AnalysisTransaction {
  id: string
  date: string // ISO yyyy-mm-dd
  amount: number // < 0 = uitgave, > 0 = inkomst
  description: string
  counterparty_name: string | null
  counterparty_iban: string | null
  budget_id: string | null
  category: string | null // budgetnaam, reeds opgelost
  account_id: string | null
  account_name: string | null
  is_income: boolean
  transaction_type: string | null
  running_balance: number | null
  creditor_id: string | null
  fx_amount: number | null
  fx_currency: string | null
  fx_rate: number | null
}

export interface PeriodWindow {
  /** Inclusieve startdatum (gte). */
  since: string
  /** Inclusieve einddatum (lte). */
  until: string
  /** Leesbaar label, bv. "juni 2026" of "Afgelopen 30 dagen". */
  label: string
  /** Start van de even-lange voorgaande periode (voor trend + fetch-venster). */
  prevSince: string
  /** Einde van de voorgaande periode. */
  prevUntil: string
}

export interface FlowSummary {
  income: number
  expense: number
  net: number
  savingsRate: number
  count: number
}

export interface CounterpartyAgg {
  name: string
  iban: string | null
  count: number
  total: number
}

export interface TopCounterpartyOptions {
  direction: 'expense' | 'income'
  sortBy: 'total' | 'count'
  limit: number
}

export interface LargestOptions {
  direction: 'expense' | 'income'
  limit: number
}

// ── Datum-helpers ──────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// ── Periodevenster ───────────────────────────────────────────────────────────

/**
 * Bepaal het datumvenster voor een periode + kalender-offset (0 = huidige,
 * negatief = terug in de tijd). Levert ook de even-lange voorgaande periode.
 */
export function resolvePeriodWindow(
  period: PeriodKind,
  offset: number,
  now: Date,
): PeriodWindow {
  const y = now.getFullYear()
  const m = now.getMonth()

  if (period === 'month') {
    const start = new Date(y, m + offset, 1)
    const end = new Date(y, m + offset + 1, 0)
    const prevStart = new Date(y, m + offset - 1, 1)
    const prevEnd = new Date(y, m + offset, 0)
    return {
      since: iso(start),
      until: iso(end),
      label: `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`,
      prevSince: iso(prevStart),
      prevUntil: iso(prevEnd),
    }
  }

  if (period === 'quarter') {
    const q = Math.floor(m / 3) + offset
    const start = new Date(y, q * 3, 1)
    const end = new Date(y, q * 3 + 3, 0)
    const prevStart = new Date(y, (q - 1) * 3, 1)
    const prevEnd = new Date(y, (q - 1) * 3 + 3, 0)
    const qnum = Math.floor(start.getMonth() / 3) + 1
    return {
      since: iso(start),
      until: iso(end),
      label: `Q${qnum} ${start.getFullYear()}`,
      prevSince: iso(prevStart),
      prevUntil: iso(prevEnd),
    }
  }

  if (period === 'year') {
    const start = new Date(y + offset, 0, 1)
    const end = new Date(y + offset, 11, 31)
    const prevStart = new Date(y + offset - 1, 0, 1)
    const prevEnd = new Date(y + offset - 1, 11, 31)
    return {
      since: iso(start),
      until: iso(end),
      label: `${start.getFullYear()}`,
      prevSince: iso(prevStart),
      prevUntil: iso(prevEnd),
    }
  }

  // '30d' — rollend venster van 30 dagen inclusief, per blok van 30 dagen.
  const blockEnd = addDays(now, offset * 30)
  const since = addDays(blockEnd, -29)
  const prevUntil = addDays(since, -1)
  const prevSince = addDays(prevUntil, -29)
  const label =
    offset === 0
      ? 'Afgelopen 30 dagen'
      : `${since.getDate()} ${MONTH_NAMES[since.getMonth()].slice(0, 3)} – ${blockEnd.getDate()} ${MONTH_NAMES[blockEnd.getMonth()].slice(0, 3)}`
  return {
    since: iso(since),
    until: iso(blockEnd),
    label,
    prevSince: iso(prevSince),
    prevUntil: iso(prevUntil),
  }
}

// ── Tegenpartij-normalisatie ─────────────────────────────────────────────────

/** Stabiele groepeersleutel: naam (case-insensitief) > IBAN > onbekend. */
export function counterpartyKey(name: string | null, iban: string | null): string {
  if (name && name.trim()) return name.trim().toLowerCase()
  if (iban && iban.trim()) return iban.replace(/\s/g, '').toUpperCase()
  return '__unknown__'
}

function displayName(t: AnalysisTransaction): string {
  return t.counterparty_name?.trim() || t.counterparty_iban || 'Onbekend'
}

// ── Aggregaten ─────────────────────────────────────────────────────────────

/** Inkomsten/uitgaven/netto/spaarquote over de set; transfers uitgesloten. */
export function summarizeFlow(txns: AnalysisTransaction[]): FlowSummary {
  let income = 0
  let expense = 0
  let count = 0
  for (const t of txns) {
    if (t.transaction_type === 'transfer') continue
    count++
    if (t.amount > 0) income += t.amount
    else if (t.amount < 0) expense += Math.abs(t.amount)
  }
  const net = income - expense
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0
  return { income, expense, net, savingsRate, count }
}

/** Top-N tegenpartijen in één richting (uitgaven/inkomsten), op bedrag of aantal. */
export function topCounterparties(
  txns: AnalysisTransaction[],
  opts: TopCounterpartyOptions,
): CounterpartyAgg[] {
  const map = new Map<string, CounterpartyAgg>()
  for (const t of txns) {
    if (t.transaction_type === 'transfer') continue
    if (opts.direction === 'expense' && !(t.amount < 0)) continue
    if (opts.direction === 'income' && !(t.amount > 0)) continue
    const key = counterpartyKey(t.counterparty_name, t.counterparty_iban)
    const amt = Math.abs(t.amount)
    const existing = map.get(key)
    if (existing) {
      existing.count++
      existing.total += amt
      if (!existing.iban && t.counterparty_iban) existing.iban = t.counterparty_iban
    } else {
      map.set(key, { name: displayName(t), iban: t.counterparty_iban ?? null, count: 1, total: amt })
    }
  }
  const arr = Array.from(map.values())
  arr.sort((a, b) => {
    if (opts.sortBy === 'count') {
      if (b.count !== a.count) return b.count - a.count
      return b.total - a.total
    }
    if (b.total !== a.total) return b.total - a.total
    return b.count - a.count
  })
  return arr.slice(0, opts.limit)
}

/** Grootste enkele transacties in één richting; transfers uitgesloten. */
export function largestTransactions(
  txns: AnalysisTransaction[],
  opts: LargestOptions,
): AnalysisTransaction[] {
  const filtered = txns.filter(
    (t) =>
      t.transaction_type !== 'transfer' &&
      (opts.direction === 'expense' ? t.amount < 0 : t.amount > 0),
  )
  filtered.sort((a, b) => (opts.direction === 'expense' ? a.amount - b.amount : b.amount - a.amount))
  return filtered.slice(0, opts.limit)
}

/** Tegenpartijen in de periode die niet in de prior-set (eerdere keys) zaten. */
export function newCounterparties(
  periodTxns: AnalysisTransaction[],
  priorKeys: Set<string>,
): CounterpartyAgg[] {
  const map = new Map<string, CounterpartyAgg>()
  for (const t of periodTxns) {
    if (t.transaction_type === 'transfer') continue
    const key = counterpartyKey(t.counterparty_name, t.counterparty_iban)
    if (key === '__unknown__') continue
    if (priorKeys.has(key)) continue
    const amt = Math.abs(t.amount)
    const existing = map.get(key)
    if (existing) {
      existing.count++
      existing.total += amt
      if (!existing.iban && t.counterparty_iban) existing.iban = t.counterparty_iban
    } else {
      map.set(key, { name: displayName(t), iban: t.counterparty_iban ?? null, count: 1, total: amt })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

/** Uitgaven per weekdag (index 0 = maandag … 6 = zondag); transfers uitgesloten. */
export function spendByWeekday(txns: AnalysisTransaction[]): number[] {
  const out = new Array<number>(7).fill(0)
  for (const t of txns) {
    if (t.transaction_type === 'transfer') continue
    if (!(t.amount < 0)) continue
    const d = parseLocalDate(t.date)
    const idx = (d.getDay() + 6) % 7 // maandag-eerst
    out[idx] += Math.abs(t.amount)
  }
  return out
}

/** Procentueel verschil inkomsten/uitgaven t.o.v. de vorige periode (null bij prev=0). */
export function periodTrend(
  current: FlowSummary,
  previous: FlowSummary,
): { incomePct: number | null; expensePct: number | null } {
  const pct = (cur: number, prev: number) =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null
  return {
    incomePct: pct(current.income, previous.income),
    expensePct: pct(current.expense, previous.expense),
  }
}

// ── Uitgaven-heatmap (GitHub-stijl kalender) ─────────────────────────────────

const MONTH_ABBR = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

export interface HeatmapWindow {
  start: string
  end: string
}

/** Vast venster van 12 kalendermaanden t/m de vorige maand (los van de periode). */
export function resolveHeatmapWindow(now: Date): HeatmapWindow {
  const y = now.getFullYear()
  const m = now.getMonth()
  const end = new Date(y, m, 0) // dag 0 van deze maand = laatste dag vorige maand
  const start = new Date(y, m - 12, 1) // eerste dag, 12 maanden eerder
  return { start: iso(start), end: iso(end) }
}

/** Uitgaven per kalenderdag (ISO 'yyyy-mm-dd' → bedrag); transfers/inkomsten uitgesloten. */
export function spendByDay(txns: AnalysisTransaction[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of txns) {
    if (t.transaction_type === 'transfer') continue
    if (!(t.amount < 0)) continue
    m.set(t.date, (m.get(t.date) ?? 0) + Math.abs(t.amount))
  }
  return m
}

export interface HeatCell {
  /** ISO-datum, of null voor opvul-cellen buiten [start, end]. */
  date: string | null
  amount: number
}

export interface HeatmapGrid {
  /** Kolommen = weken (maandag-eerst); elke kolom = 7 cellen (ma…zo). */
  weeks: HeatCell[][]
  /** Maand-labels boven de kolom waar een nieuwe maand begint. */
  monthLabels: { col: number; label: string }[]
}

/** Bouw een GitHub-achtige week×dag-rooster voor [start, end] met dag-bedragen. */
export function buildHeatmapWeeks(
  start: string,
  end: string,
  daily: Map<string, number>,
): HeatmapGrid {
  const startD = parseLocalDate(start)
  const endD = parseLocalDate(end)
  // gridStart = maandag op/voor start; gridEnd = zondag op/na end.
  const gridStart = new Date(startD)
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7))
  const gridEnd = new Date(endD)
  gridEnd.setDate(gridEnd.getDate() + (6 - ((gridEnd.getDay() + 6) % 7)))

  const weeks: HeatCell[][] = []
  const monthLabels: { col: number; label: string }[] = []
  const cur = new Date(gridStart)
  let col = 0
  let prevMonth = -1
  while (cur <= gridEnd) {
    const column: HeatCell[] = []
    let firstActiveMonth: number | null = null
    for (let r = 0; r < 7; r++) {
      const active = cur >= startD && cur <= endD
      if (active) {
        const isoDate = iso(cur)
        column.push({ date: isoDate, amount: daily.get(isoDate) ?? 0 })
        if (firstActiveMonth === null) firstActiveMonth = cur.getMonth()
      } else {
        column.push({ date: null, amount: 0 })
      }
      cur.setDate(cur.getDate() + 1)
    }
    if (firstActiveMonth !== null && firstActiveMonth !== prevMonth) {
      monthLabels.push({ col, label: MONTH_ABBR[firstActiveMonth] })
      prevMonth = firstActiveMonth
    }
    weeks.push(column)
    col++
  }
  return { weeks, monthLabels }
}

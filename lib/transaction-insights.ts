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

import { savingsRateFromAggregates } from '@/lib/savings-source'
import { currentMonthWindowLabel } from '@/lib/cashflow-cards'

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
  bank_code: string | null
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
  // Consume, don't recompute: de spaarquote-formule woont in lib/savings-source.ts
  // (`savingsRateFromAggregates`, (I − E + aflossing) / I × 100). Hier is er geen
  // aflossings-term — dit is een kaal periode-aggregaat over transacties — maar de
  // deling zelf hoort niet voor de derde keer in de codebase te staan.
  const savingsRate = Math.round(savingsRateFromAggregates(income, expense, 0))
  return { income, expense, net, savingsRate, count }
}

// ── Geldstroom in woorden (S3) ─────────────────────────────────────────────
//
// AANLEIDING. In de weergavemodus "Eenvoudig" verbergt de transactiepagina zes
// analyseblokken; wat er als DUIDING overblijft is de `GeldstroomGauge` — een
// naald op een −100…+100-schaal met een etiket "spaarquote". Voor een beginner
// is dat een expertinstrument zonder omringende context: er staat geen trend,
// geen heatmap en geen vergelijking meer omheen die 'm leesbaar maakt.
//
// TWEE HARDE GRENZEN, allebei bewust:
//
//  1. `summarizeFlow` HIERBOVEN WORDT NIET AANGERAAKT. De twee bekende
//     mankementen aan het GETAL — het ongeclampte leescijfer en de 0%-uitkomst
//     bij `income === 0` — zijn eigendom van bevinding C6 en gelden in BEIDE
//     modi. Ze hier "even" repareren zou C6's reproductie uit Volledig halen
//     terwijl die kaart nog loopt. `describeFlow` is een tweede, ONAFHANKELIJKE
//     lezing van dezelfde `FlowSummary`; hij herberekent niets.
//
//  2. GEEN VOORSPELLING. De oorspronkelijke wens was "salaris komt nog" — dat
//     is een projectie over de rest van de maand, die bestaat nog niet (en is
//     zelf een C6-optie). Wat hier staat is de WAARNEMINGSVORM: "er is nog
//     niets binnengekomen", volledig afleidbaar uit de twee samenvattingen die
//     het component al in geheugen heeft. Geen nieuwe query, geen nieuw veld,
//     geen belofte die de app niet waar kan maken (Wft).
//
// SEGMENTEN, GEEN STRING. De functie geeft bedragen als getallen terug en niet
// als kant-en-klare zin: de UI moet ze door `<MaskedAmount>` halen, anders lekt
// een `formatCurrency`-string dwars door de privacy-modus heen.

/**
 * Welke lezing van het venster van toepassing is.
 *  · `empty`         — geen enkele transactie; de call-site toont zijn eigen regel.
 *  · `no-income-yet` — het venster loopt nog, er ging wel geld uit maar er kwam
 *                      nog niets binnen. De stand die de meter het slechtst leest.
 *  · `running`       — het venster loopt nog, met in- én uitstroom.
 *  · `complete`      — het venster is afgesloten; hier mag een eindstand staan.
 */
export type FlowDescriptionKind = 'empty' | 'no-income-yet' | 'running' | 'complete'

export interface FlowDescription {
  kind: FlowDescriptionKind
  /** Loopt het venster nog? Bepaalt of een eindoordeel eerlijk is. */
  windowRunning: boolean
  /** Venster in gewone taal — "augustus tot nu toe", "juli 2026", "Q3 2026". */
  windowLabel: string
  income: number
  expense: number
  /** income − expense. Negatief = er ging meer uit dan er binnenkwam. */
  net: number
  /**
   * De spaarquote als EINDSTAND — uitsluitend gevuld bij een afgesloten venster
   * mét inkomen. Bij een lopend venster bewust `null`: een quote over een halve
   * maand is precies het oordeel dat deze kaart wil vermijden.
   */
  savingsRate: number | null
  /**
   * Het inkomen van de vorige, even lange periode — alleen gevuld als het > 0
   * is én de huidige periode nog niets ontving. Dat maakt van "er kwam nog
   * niets binnen" een waarneming met context, zonder iets te voorspellen.
   */
  prevIncome: number | null
}

/**
 * Het venster-label voor deze pagina, in ÉÉN formulering.
 *
 * Voor de lopende kalendermaand hergebruikt hij `currentMonthWindowLabel` uit
 * `lib/cashflow-cards.ts` — dezelfde zin die de hub-kaart draagt (CF-3). Bewust
 * geen tweede formulering: hub en detailpagina beschrijven hier hetzelfde
 * venster, en twee formuleringen zijn binnen een maand twee betekenissen.
 *
 * Alle overige gevallen nemen het label dat `resolvePeriodWindow` al maakte.
 */
export function flowWindowLabel(
  period: PeriodKind,
  offset: number,
  window: PeriodWindow,
  now: Date,
): string {
  if (period === 'month' && offset === 0) return currentMonthWindowLabel(now)
  return window.label
}

/**
 * Beschrijf de geldstroom van één periode in termen die zonder meter te lezen
 * zijn. Puur: leest alleen wat er in gaat.
 *
 * @param current - `summarizeFlow` over het gekozen venster.
 * @param prev - `summarizeFlow` over de even lange voorgaande periode.
 * @param period - de gekozen periodesoort.
 * @param offset - 0 = huidige periode, negatief = terug in de tijd.
 * @param window - het venster uit `resolvePeriodWindow` (voor het label).
 * @param now - expliciet meegegeven zodat het resultaat deterministisch is.
 */
export function describeFlow(
  current: FlowSummary,
  prev: FlowSummary,
  period: PeriodKind,
  offset: number,
  window: PeriodWindow,
  now: Date,
): FlowDescription {
  // Een venster "loopt nog" wanneer de einddatum in de toekomst ligt. Bij '30d'
  // eindigt het venster per definitie vandaag (rollend, inclusief), dus dat is
  // altijd compleet — ook bij offset 0.
  const windowRunning = offset === 0 && period !== '30d'
  const windowLabel = flowWindowLabel(period, offset, window, now)

  const base = {
    windowRunning,
    windowLabel,
    income: current.income,
    expense: current.expense,
    net: current.net,
  }

  if (current.income === 0 && current.expense === 0) {
    return { ...base, kind: 'empty', savingsRate: null, prevIncome: null }
  }

  if (windowRunning) {
    if (current.income === 0) {
      return {
        ...base,
        kind: 'no-income-yet',
        savingsRate: null,
        prevIncome: prev.income > 0 ? prev.income : null,
      }
    }
    return { ...base, kind: 'running', savingsRate: null, prevIncome: null }
  }

  return {
    ...base,
    kind: 'complete',
    // Alleen zinvol met inkomen als noemer; `summarizeFlow` levert bij
    // `income === 0` een 0 die niets betekent (C6-terrein — hier niet getoond
    // in plaats van hier gerepareerd).
    savingsRate: current.income > 0 ? current.savingsRate : null,
    prevIncome: null,
  }
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

/** Zelfde ISO-datum, `months` maanden eerder; lokaal gerekend (geen UTC-round-trip). */
function monthsBefore(isoDate: string, months: number): string {
  const d = parseLocalDate(isoDate)
  return iso(new Date(d.getFullYear(), d.getMonth() - months, d.getDate()))
}

/**
 * Het venster dat de analysepagina in één keer ophaalt: 12 maanden vóór de
 * periode t/m het periode-einde. Dekt de huidige periode, de vorige periode
 * (trend) én de prior-historie (nieuwe-tegenpartij-detectie) — en normaal ook
 * het heatmap-venster, zie {@link heatmapWindowCovered}.
 */
export function resolveFetchWindow(period: PeriodWindow): { since: string; until: string } {
  return { since: monthsBefore(period.since, 12), until: period.until }
}

/**
 * Omvat het opgehaalde venster het heatmap-venster volledig?
 *
 * De analysepagina haalt één ruim venster op (12 maanden vóór de periode t/m
 * het periode-einde). Zolang dát venster het vaste heatmap-venster omsluit, is
 * de heatmap er een deelverzameling van en hoeft hij niet apart gedownload te
 * worden. BEIDE randen tellen: terugbladeren verschuift `until` naar het
 * verleden en laat de recentste heatmap-maanden buiten beeld vallen, ook al
 * blijft `since` ver genoeg terug liggen. ISO 'yyyy-mm-dd' vergelijkt
 * lexicografisch gelijk aan chronologisch, dus stringvergelijking volstaat.
 */
export function heatmapWindowCovered(
  fetched: { since: string; until: string },
  heatmap: HeatmapWindow,
): boolean {
  return fetched.since <= heatmap.start && fetched.until >= heatmap.end
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

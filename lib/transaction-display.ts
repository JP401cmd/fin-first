/**
 * Pure, budget-vrije displaylogica voor de verrijkte transactie-tijdlijn.
 * Geen React/Supabase. Zie transaction-display.test.ts.
 */

import { calculateFreedomTime } from '@/lib/format'
import { counterpartyKey } from '@/lib/transaction-insights'

// ─── Task 5: cleanMerchantName ────────────────────────────────────────────────

const KNOWN: { test: RegExp; name: string }[] = [
  { test: /\bshell\b/i, name: 'Shell' },
  { test: /\besso\b/i, name: 'Esso' },
  { test: /\btinq\b/i, name: 'Tinq' },
  { test: /\bpaypal\b/i, name: 'PayPal' },
  { test: /\bamazon\b/i, name: 'Amazon' },
  { test: /\bhornbach\b/i, name: 'Hornbach' },
  { test: /\bbol\.com\b/i, name: 'bol.com' },
  { test: /albert heijn/i, name: 'Albert Heijn' },
]

export function cleanMerchantName(raw: string | null): string {
  let s = (raw ?? '').trim()
  if (!s) return 'Onbekend'
  // Strip PSP prefix before KNOWN lookup so "BCK*SHELL T KEMPKE" → "SHELL T KEMPKE"
  // Only check KNOWN AFTER prefix stripping to avoid over-matching location suffixes
  const hasPsp = /^[A-Za-z.]{2,8}\*/.test(s)
  if (!hasPsp) {
    // For non-PSP inputs, check KNOWN first (catches "Esso Arnhem IJsseloo" → "Esso")
    for (const k of KNOWN) if (k.test.test(s)) return k.name
  }
  s = s.replace(/^[A-Za-z.]{2,8}\*/, '').replace(/^iZ\s+/i, '').trim()
  s = s.replace(/\s+(b\.?v\.?|n\.?v\.?)$/i, '').trim()
  s = s.replace(/\s+\d{2,5}(\s+[A-Za-zÀ-ÿ]+)?$/, '').trim()
  if (!s) return 'Onbekend'
  // Title-case the result for PSP-stripped names
  if (hasPsp) {
    s = s.replace(/\b[A-Za-zÀ-ÿ]/g, (c) => c.toUpperCase()).replace(/\b[A-Z][A-Z]+/g, (w) => w[0] + w.slice(1).toLowerCase())
  }
  return s.replace(/\s+/g, ' ')
}

// ─── Task 6: deriveType ───────────────────────────────────────────────────────

export type TxKind =
  | 'pin' | 'incasso' | 'ideal' | 'overboeking'
  | 'bijschrijving' | 'betaalverzoek' | 'bankkosten' | 'onbekend'

export interface TypeInfo { kind: TxKind; glyph: string; label: string }

const TYPE_BY_KIND: Record<TxKind, Omit<TypeInfo, 'kind'>> = {
  pin:           { glyph: '↘', label: 'pinbetaling' },
  incasso:       { glyph: '⟳', label: 'incasso' },
  ideal:         { glyph: '↘', label: 'iDEAL' },
  overboeking:   { glyph: '→', label: 'overboeking' },
  bijschrijving: { glyph: '↗', label: 'bijschrijving' },
  betaalverzoek: { glyph: '↔', label: 'betaalverzoek' },
  bankkosten:    { glyph: '•', label: 'bankkosten' },
  onbekend:      { glyph: '·', label: '' },
}

const CODE_MAP: Record<string, TxKind> = {
  bc: 'pin', ba: 'pin', ga: 'pin', gm: 'pin',
  ei: 'incasso',
  id: 'ideal',
  bg: 'overboeking', ov: 'overboeking',
  cb: 'bijschrijving',
  bv: 'betaalverzoek',
  db: 'bankkosten',
}

export function deriveType(
  code: string | null,
  _counterpartyName: string | null,
  amount: number,
): TypeInfo {
  const c = (code ?? '').trim().toLowerCase()
  let kind: TxKind | undefined = c ? CODE_MAP[c] : undefined
  if (!kind) kind = amount >= 0 ? 'bijschrijving' : 'pin'
  return { kind, ...TYPE_BY_KIND[kind] }
}

// ─── Task 7: parseLocationTime ────────────────────────────────────────────────

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-zà-ÿ]/g, (c) => c.toUpperCase())
}

export function parseLocationTime(description: string | null): { place: string | null; time: string | null } {
  const s = (description ?? '').trim()
  if (!s) return { place: null, time: null }
  const time = s.match(/\b(\d{2}:\d{2})\b/)?.[1] ?? null
  const m = s.match(/^([A-Za-zÀ-ÿ .'-]+?),\s*\d{4}\s?[A-Z]{2}\b/)
  const place = m ? titleCase(m[1].trim()) : null
  if (!place && !time) return { place: null, time: null }
  return { place, time }
}

// ─── Task 8: avgDailyExpense + freedomDays ────────────────────────────────────

export function avgDailyExpense(
  txns: { amount: number; transaction_type: string | null }[],
  windowDays: number,
): number {
  if (windowDays <= 0) return 0
  let expense = 0
  for (const t of txns) {
    if (t.transaction_type === 'transfer') continue
    if (t.amount < 0) expense += Math.abs(t.amount)
  }
  return expense / windowDays
}

export function freedomDays(amount: number, dailyExpense: number): number {
  if (dailyExpense <= 0) return 0
  return calculateFreedomTime(Math.abs(amount), dailyExpense).totalDays
}

// ─── Task 9: detectRecurring ──────────────────────────────────────────────────

export interface RecurringInput {
  id: string
  counterparty_name: string | null
  counterparty_iban: string | null
  creditor_id?: string | null
  amount: number
  date: string
}

export function detectRecurring(txns: RecurringInput[]): Set<string> {
  const result = new Set<string>()
  const byCreditor = new Map<string, RecurringInput[]>()
  for (const t of txns) {
    const c = (t.creditor_id ?? '').trim()
    if (!c) continue
    ;(byCreditor.get(c) ?? byCreditor.set(c, []).get(c)!).push(t)
  }
  for (const group of byCreditor.values()) {
    if (group.length >= 2) for (const t of group) result.add(t.id)
  }
  const byCp = new Map<string, RecurringInput[]>()
  for (const t of txns) {
    if (result.has(t.id)) continue
    if ((t.creditor_id ?? '').trim()) continue
    const k = counterpartyKey(t.counterparty_name, t.counterparty_iban)
    if (k === '__unknown__') continue
    ;(byCp.get(k) ?? byCp.set(k, []).get(k)!).push(t)
  }
  for (const group of byCp.values()) {
    if (group.length < 3) continue
    const avg = group.reduce((s, t) => s + Math.abs(t.amount), 0) / group.length
    const stable = group.every((t) => Math.abs(Math.abs(t.amount) - avg) <= avg * 0.15)
    if (stable) for (const t of group) result.add(t.id)
  }
  return result
}

// ─── Task 10: groupByDay + parseSmartQuery + monogram ─────────────────────────

export interface DayGroup<T> { date: string; rows: T[]; expenseTotal: number; incomeTotal: number }

export function groupByDay<T extends { date: string; amount: number; transaction_type: string | null }>(
  txns: T[],
): DayGroup<T>[] {
  const map = new Map<string, DayGroup<T>>()
  for (const t of txns) {
    let g = map.get(t.date)
    if (!g) { g = { date: t.date, rows: [], expenseTotal: 0, incomeTotal: 0 }; map.set(t.date, g) }
    g.rows.push(t)
    if (t.transaction_type !== 'transfer') {
      if (t.amount < 0) g.expenseTotal += Math.abs(t.amount)
      else if (t.amount > 0) g.incomeTotal += t.amount
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1))
}

const NL_MONTHS = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december']

export interface SmartQuery {
  text: string
  amountMin: number | null
  amountMax: number | null
  dateFrom: string | null
  dateTo: string | null
  direction: 'expense' | 'income' | null
}

function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseSmartQuery(query: string, now: Date): SmartQuery {
  let s = ` ${query.toLowerCase().trim()} `
  let amountMin: number | null = null
  let amountMax: number | null = null
  let dateFrom: string | null = null
  let dateTo: string | null = null
  let direction: 'expense' | 'income' | null = null

  const amt = (v: string) => parseFloat(v.replace('.', '').replace(',', '.'))
  s = s.replace(/\b(boven|>|meer dan)\s*€?\s*([\d.,]+)/g, (_, __, v) => { amountMin = amt(v); return ' ' })
  s = s.replace(/\b(onder|<|minder dan)\s*€?\s*([\d.,]+)/g, (_, __, v) => { amountMax = amt(v); return ' ' })

  if (/\bvorige maand\b/.test(s)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    dateFrom = isoOf(d.getFullYear(), d.getMonth(), 1)
    dateTo = isoOf(end.getFullYear(), end.getMonth(), end.getDate())
    s = s.replace(/\bvorige maand\b/, ' ')
  } else if (/\bdit jaar\b/.test(s)) {
    dateFrom = isoOf(now.getFullYear(), 0, 1); dateTo = isoOf(now.getFullYear(), 11, 31)
    s = s.replace(/\bdit jaar\b/, ' ')
  } else {
    for (let i = 0; i < 12; i++) {
      if (new RegExp(`\\b${NL_MONTHS[i]}\\b`).test(s)) {
        const end = new Date(now.getFullYear(), i + 1, 0)
        dateFrom = isoOf(now.getFullYear(), i, 1); dateTo = isoOf(now.getFullYear(), i, end.getDate())
        s = s.replace(new RegExp(`\\b${NL_MONTHS[i]}\\b`), ' ')
        break
      }
    }
  }
  if (/\buitgaven?\b/.test(s)) { direction = 'expense'; s = s.replace(/\buitgaven?\b/, ' ') }
  else if (/\binkomsten?\b/.test(s)) { direction = 'income'; s = s.replace(/\binkomsten?\b/, ' ') }

  return { text: s.replace(/\s+/g, ' ').trim(), amountMin, amountMax, dateFrom, dateTo, direction }
}

export function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

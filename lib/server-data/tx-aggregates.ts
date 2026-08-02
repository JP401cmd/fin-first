// lib/server-data/tx-aggregates.ts
//
// TRANSACTIE-MAANDAGGREGAAT (FASE 2 · Task 2.2)
// ───────────────────────────────────────────────────────────────────────────
// Consumeer de SQL-functie `public.tx_month_aggregate` (migratie
// 20260719131916) i.p.v. duizenden ruwe transactie-rijen op te halen om er in
// JS een SUM/GROUP-BY op te draaien. Dat lost tegelijk een STILLE REKENFOUT op:
// PostgREST kapt elk antwoord af op `max_rows` (config.toml = 1000) — óók als de
// client een hogere `.limit()` vraagt — waardoor 12-/6-maands sommen (inkomen-
// extrapolatie, spaarquote, dagtarief) voor tx-rijke gebruikers STIL te laag
// werden. Een aggregaat levert per definitie enkele rijen en kan niet afkappen.
//
// PARITY-CONTRACT
//   • De functie geeft één rij per (maand 'YYYY-MM', budget_id, transaction_type)
//     met de som van de positieve en de negatieve bedragen + de telling.
//   • De transfer-filter (`isRealTx`) blijft in JS en verschilt PER LOADER:
//     dashboard/lever filteren transfers eruit, horizon telt ze bewust mee. De
//     reducers hieronder nemen daarom een expliciete `realOnly`-vlag — nooit een
//     verborgen default die één loader stilzwijgend verandert.
//   • `buildMonthAggregatesFromRows` reproduceert de SQL in TS zodat de
//     parity-test kan bewijzen: oude JS-reductie(ruwe rijen) ==
//     nieuwe reductie(aggregaat) — inclusief een >1000-rijen-getuige.
//
// RLS/BEVEILIGING: de functie is SECURITY INVOKER; ze MOET met de anon/
// authenticated RLS-client (createClient uit lib/supabase/server.ts) worden
// aangeroepen — nooit met getServiceClient(). `ownOnly` beperkt tot de eigen
// rijen (excl. gedeeld huishouden), voor loaders die vroeger `.eq('user_id')`
// deden (lever-scores).

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'

/** Één aggregaat-rij zoals `tx_month_aggregate` teruggeeft. */
export interface TxMonthAggregateRow {
  /** Kalendermaand als 'YYYY-MM'. */
  month: string
  budget_id: string | null
  transaction_type: string | null
  /** Som van de positieve bedragen in de groep (≥ 0). */
  sum_positief: number | string
  /** Som van de negatieve bedragen in de groep (≤ 0). */
  sum_negatief: number | string
  /** Aantal transacties in de groep. */
  count: number | string
}

const TRANSFER_TYPES = new Set(['transfer', 'joint_transfer'])

/** Spiegelt `isRealTx`: alles behalve (joint_)transfer telt als echte transactie. */
export function isRealAggRow(row: { transaction_type?: string | null }): boolean {
  return !TRANSFER_TYPES.has(row.transaction_type ?? '')
}

interface ReduceOpts {
  /** Sluit (joint_)transfer-rijen uit (dashboard/lever); false = alles (horizon). */
  realOnly?: boolean
  /** Ondergrens 'YYYY-MM' (inclusief) voor een sub-venster (bv. 6-maands). */
  sinceMonth?: string
  /** Beperk tot deze budget-ids (bv. spaarbudget-correctie). */
  budgetIds?: Set<string>
}

function passes(row: TxMonthAggregateRow, opts: ReduceOpts): boolean {
  if (opts.realOnly && !isRealAggRow(row)) return false
  if (opts.sinceMonth && row.month < opts.sinceMonth) return false
  if (opts.budgetIds && !(row.budget_id && opts.budgetIds.has(row.budget_id))) return false
  return true
}

/** Σ positieve bedragen (bv. inkomen) over de gefilterde rijen. */
export function aggSumPositief(rows: TxMonthAggregateRow[], opts: ReduceOpts = {}): number {
  let s = 0
  for (const r of rows) if (passes(r, opts)) s += Number(r.sum_positief)
  return s
}

/** Σ |negatieve bedragen| (bv. uitgaven, absoluut) over de gefilterde rijen. */
export function aggSumNegatiefAbs(rows: TxMonthAggregateRow[], opts: ReduceOpts = {}): number {
  let s = 0
  for (const r of rows) if (passes(r, opts)) s += Math.abs(Number(r.sum_negatief))
  return s
}

/** Map maand → Σ positieve bedragen (inkomen per maand). */
export function aggIncomeByMonth(rows: TxMonthAggregateRow[], opts: ReduceOpts = {}): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!passes(r, opts)) continue
    m.set(r.month, (m.get(r.month) ?? 0) + Number(r.sum_positief))
  }
  return m
}

/** Map maand → Σ |negatieve bedragen| (uitgaven per maand, absoluut). */
export function aggExpenseByMonthAbs(rows: TxMonthAggregateRow[], opts: ReduceOpts = {}): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!passes(r, opts)) continue
    m.set(r.month, (m.get(r.month) ?? 0) + Math.abs(Number(r.sum_negatief)))
  }
  return m
}

/**
 * Map maand → Σ |alle bedragen| voor rijen waarvan het budget in `budgetIds`
 * zit (bv. schuld-budgetten). Telt zowel de positieve als de |negatieve| som,
 * identiek aan de vroegere `Math.abs(amount)`-reductie over income+expense-rijen.
 */
export function aggAbsByMonthForBudgets(
  rows: TxMonthAggregateRow[],
  budgetIds: Set<string>,
  opts: ReduceOpts = {},
): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!passes(r, { ...opts, budgetIds })) continue
    const v = Number(r.sum_positief) + Math.abs(Number(r.sum_negatief))
    if (v !== 0) m.set(r.month, (m.get(r.month) ?? 0) + v)
  }
  return m
}

/**
 * Map budget_id → maand → Σ |alle bedragen| (positief + |negatief|), voor de
 * budget-sparklines: die tonen per budget wat er in een maand omging, ongeacht
 * teken. Rijen zonder budget_id vallen weg (spiegelt de vroegere `if (t.budget_id)`-
 * guard). Complement van `aggAbsByMonthForBudgets`, dat over een budget-SET
 * platslaat; hier blijft de budget-dimensie juist behouden.
 */
export function aggAbsByBudgetMonth(
  rows: TxMonthAggregateRow[],
  opts: ReduceOpts = {},
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (!passes(r, opts)) continue
    if (!r.budget_id) continue
    const v = Number(r.sum_positief) + Math.abs(Number(r.sum_negatief))
    if (v === 0) continue
    let m = out.get(r.budget_id)
    if (!m) {
      m = new Map<string, number>()
      out.set(r.budget_id, m)
    }
    m.set(r.month, (m.get(r.month) ?? 0) + v)
  }
  return out
}

/**
 * Bouw synthetische uitgaven-rijen ({amount ≤ 0, date = 'YYYY-MM-01'}) uit het
 * aggregaat, zodat een bestaande rij-verwachtende helper (bv.
 * `recentDailyExpenseRateFromRows`) ONGEWIJZIGD gevoed kan worden. Alleen groepen
 * met een echte negatieve som doen mee (spiegelt de vroegere `.lt('amount',0)`-
 * fetch): het totaal én de vroegste maand — de enige twee dingen die die helper
 * gebruikt — blijven daardoor byte-identiek.
 */
export function aggToExpenseRows(
  rows: TxMonthAggregateRow[],
  opts: ReduceOpts = {},
): { amount: number; date: string }[] {
  const out: { amount: number; date: string }[] = []
  for (const r of rows) {
    if (!passes(r, opts)) continue
    const neg = Number(r.sum_negatief)
    if (neg < 0) out.push({ amount: neg, date: `${r.month}-01` })
  }
  return out
}

/**
 * Haal het maandaggregaat op via de RLS-veilige RPC. `from`/`to` als lokale
 * datum-strings ('YYYY-MM-DD', `to` exclusief). Retourneert de rauwe
 * PostgREST-vorm zodat consumers `.data ?? []` / `.error` ongewijzigd houden.
 *
 * MOET met de authenticated/anon RLS-client worden aangeroepen (nooit
 * getServiceClient): de functie is SECURITY INVOKER en leunt op de RLS van
 * `transactions`.
 */
export async function fetchTxMonthAggregate(
  supabase: SupabaseClient,
  args: { from: string; to: string; ownOnly?: boolean },
): Promise<{ data: TxMonthAggregateRow[] | null; error: unknown }> {
  const { data, error } = await supabase.rpc('tx_month_aggregate', {
    p_from: args.from,
    p_to: args.to,
    p_own_only: args.ownOnly ?? false,
  })
  return { data: (data as TxMonthAggregateRow[] | null) ?? null, error }
}

/**
 * Het ROLLENDE 12-MAANDS maandaggregaat `[maandstart 11 mnd terug, maandeinde)`,
 * `cache()`-gewrapt zodat dashboard- en core-loader binnen één request ÉÉN RPC
 * delen i.p.v. beide dezelfde te draaien. Op de cashflow-hub draaien ze allebei
 * (`loadDashboardData` én `loadCashflowSettingsData` → `loadCoreData`), dus dat
 * was per request een volledig dubbele RPC + payload.
 *
 * WAAROM HET VENSTER HIER BINNEN WORDT BEREKEND — en niet als argument komt.
 * React `cache()` keyt op argument-IDENTITEIT (Object.is per argument). Een
 * `cache()` om `fetchTxMonthAggregate` zelf zou dus een stille no-op zijn: elke
 * callsite bouwt een VERS `{ from, to }`-object, en twee verse objecten zijn
 * nooit identiek → altijd een miss. Het enige argument hier is daarom de
 * supabase-client, precies zoals in lib/server-data/base.ts: `createClient()`
 * (lib/supabase/server.ts) is zelf `cache()`-gewrapt → één instantie per
 * RSC-render, dus alle loaders binnen één request raken dezelfde cache-entry.
 *
 * Het venster komt uit de tijdzone-veilige helpers (lib/month-range.ts) en is
 * byte-identiek aan de twee inline `Date.UTC(jaar, maand ± n, 1).toISOString()`-
 * berekeningen die het vervangt (beide leveren altijd dag-01 op UTC-middernacht).
 * `tx-aggregates.cache.test.ts` pint die gelijkheid vast als anti-drift-getuige.
 *
 * `ownOnly` blijft weg (default false) = RLS-breed (eigen + gedeeld huishouden),
 * identiek aan beide vervangen callsites. Loaders met een ANDER venster houden
 * bewust hun eigen `fetchTxMonthAggregate`-call: een ander venster is een andere
 * cache-entry (lib/lever-scores-loader.ts, 6 maanden). NB: horizon-data-loader
 * draait hetzelfde 12-maands venster nog via een eigen call — die omzetting valt
 * buiten deze wijziging.
 *
 * MOET met de authenticated/anon RLS-client worden aangeroepen (nooit
 * getServiceClient) — zie `fetchTxMonthAggregate`.
 */
export const getTxAgg12m = cache(async (supabase: SupabaseClient) => {
  const now = new Date()
  return fetchTxMonthAggregate(supabase, {
    from: localMonthStartMonthsAgo(now, 11),
    to: localMonthBounds(now).end,
  })
})

// ── Test-hulp: reproduceer de SQL in TS ─────────────────────────────────────
/**
 * Bouw hetzelfde maandaggregaat als de SQL-functie uit ruwe transactie-rijen.
 * Uitsluitend voor de parity-test: bewijst dat de aggregaat-vorm genoeg
 * informatie draagt om elke oude JS-reductie byte-identiek te reproduceren.
 * `to_char(date,'YYYY-MM')` == `date.slice(0,7)` voor 'YYYY-MM-DD'-strings.
 */
export function buildMonthAggregatesFromRows(
  rawRows: { amount: number | string; date: string; budget_id?: string | null; transaction_type?: string | null }[],
): TxMonthAggregateRow[] {
  const groups = new Map<string, TxMonthAggregateRow>()
  for (const r of rawRows) {
    const month = r.date.slice(0, 7)
    const bid = r.budget_id ?? null
    const type = r.transaction_type ?? null
    const key = `${month} ${bid ?? ''} ${type ?? ''}`
    let g = groups.get(key)
    if (!g) {
      g = { month, budget_id: bid, transaction_type: type, sum_positief: 0, sum_negatief: 0, count: 0 }
      groups.set(key, g)
    }
    const amt = Number(r.amount)
    if (amt > 0) g.sum_positief = Number(g.sum_positief) + amt
    else if (amt < 0) g.sum_negatief = Number(g.sum_negatief) + amt
    g.count = Number(g.count) + 1
  }
  return [...groups.values()]
}

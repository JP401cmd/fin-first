/**
 * Nep-Supabase voor de END-TO-END pariteitstests van de slanke cashflow-lagen
 * (`lib/cashflow-kpis.parity.test.ts`, `lib/cashflow-kpis.forecast-parity.test.ts`).
 *
 * Die tests draaien BEIDE paden écht — de volledige `loadDashboardData` én de
 * slanke loader — tegen dezelfde nep-database. Dat werkt alleen als de mock
 * datum- en cap-getrouw is:
 *
 *   • `.gte/.lt/.eq/...` worden ECHT toegepast, zodat maandgrenzen betekenis
 *     hebben (een `toISOString()`-terugschuif zou hier zichtbaar worden);
 *   • elk `from(...)`-antwoord wordt op 1000 rijen afgekapt — precies wat
 *     PostgREST doet (`supabase/config.toml` → `max_rows = 1000`), zodat de
 *     stille afkap gereproduceerd wordt in plaats van beweerd;
 *   • de `tx_month_aggregate`-RPC wordt uit dezelfde rijen opgebouwd met
 *     `buildMonthAggregatesFromRows` (de geteste TS-spiegel van de SQL) en kent
 *     die afkap NIET — precies zoals een SQL-aggregaat.
 *
 * GEDEELD, niet gekopieerd: twee kopieën van deze mock zouden onafhankelijk van
 * elkaar kunnen wegdrijven (een cap die in de ene kopie verdwijnt, een filter dat
 * in de andere een no-op wordt) en dan meet de ene test iets anders dan de
 * andere, zonder dat er iets rood wordt. De mock draagt zelf GEEN assertie — hij
 * is scaffolding; de betekenis zit in de fixtures en de verwachtingen van de
 * tests die 'm gebruiken.
 */

import { buildMonthAggregatesFromRows } from '@/lib/server-data/tx-aggregates'
import type { SupabaseClient } from '@supabase/supabase-js'

export type Row = Record<string, unknown>

type Filter = { op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in'; col: string; val: unknown }

/** De PostgREST-cap uit supabase/config.toml — geldt voor élk tabel-antwoord. */
export const MAX_ROWS = 1000

type Order = { col: string; ascending: boolean }

/**
 * `.order(col, { ascending })` wordt ECHT uitgevoerd, en dat is geen luxe:
 * `getEarliestIncomeDate` is een `order(date asc).limit(1).maybeSingle()`. Met een
 * passthrough-`order` zou die de EERSTE rij uit de fixture-array teruggeven in
 * plaats van de vroegste datum — een fixture waarin de rijen niet toevallig
 * chronologisch staan, zou dan stil een andere `dataMonths6` (en dus een andere
 * spaarquote-extrapolatie) meten dan productie.
 *
 * Sorteert stabiel en vóór de limiet, net als PostgREST. `undefined`/`null`
 * sorteren achteraan bij oplopend.
 */
function applyOrders(rows: Row[], orders: Order[]): Row[] {
  if (orders.length === 0) return rows
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      for (const o of orders) {
        const av = a.row[o.col]
        const bv = b.row[o.col]
        if (av === bv) continue
        if (av == null) return 1
        if (bv == null) return -1
        const cmp = (av as never) < (bv as never) ? -1 : 1
        return o.ascending ? cmp : -cmp
      }
      return a.i - b.i
    })
    .map(({ row }) => row)
}

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  return rows.filter((r) =>
    filters.every((f) => {
      const v = r[f.col]
      switch (f.op) {
        case 'eq': return v === f.val
        case 'neq': return v !== f.val
        case 'gt': return (v as never) > (f.val as never)
        case 'gte': return (v as never) >= (f.val as never)
        case 'lt': return (v as never) < (f.val as never)
        case 'lte': return (v as never) <= (f.val as never)
        case 'in': return Array.isArray(f.val) && (f.val as unknown[]).includes(v)
      }
    }),
  )
}

/**
 * De tabellen die een fixture kan vullen. Alles wat hier niet in staat levert een
 * lege lijst op — precies zoals een account zonder rijen in die tabel.
 */
export interface FakeDb {
  /** De ENE profielrij (RLS geeft er per definitie één; `getOwnProfile` doet `.single()`). */
  profile: Row
  budgets?: Row[]
  transactions?: Row[]
  debts?: Row[]
  assets?: Row[]
  netWorthSnapshots?: Row[]
}

export interface FakeSupabase {
  client: SupabaseClient
  /** Aantal `from(...)`-aanroepen — de query-teller van de test. */
  tableQueries: () => number
  /** Namen van de aangeroepen RPC's, in volgorde. */
  rpcCalls: () => string[]
}

export function makeSupabase(db: FakeDb): FakeSupabase {
  let tableQueries = 0
  const rpcCalls: string[] = []
  const transactions = db.transactions ?? []

  const tables: Record<string, Row[]> = {
    profiles: [db.profile],
    budgets: db.budgets ?? [],
    transactions,
    debts: db.debts ?? [],
    assets: db.assets ?? [],
    net_worth_snapshots: db.netWorthSnapshots ?? [],
  }

  function builder(table: string) {
    const rows = tables[table] ?? []
    const filters: Filter[] = []
    const orders: Order[] = []
    let limit = MAX_ROWS
    let offset = 0
    const settle = () => {
      const out = applyOrders(applyFilters(rows, filters), orders).slice(offset)
      // PostgREST kapt af op min(client-limit, max_rows) — een client-`.limit()`
      // bóven max_rows is een no-op, exact zoals in productie.
      return { data: out.slice(0, Math.min(limit, MAX_ROWS)), error: null }
    }
    const q: Record<string, unknown> = {}
    const passthrough = ['select', 'not', 'or', 'is', 'filter', 'contains', 'overlaps', 'match', 'textSearch']
    for (const m of passthrough) q[m] = () => q
    q.order = (col: string, opts?: { ascending?: boolean }) => {
      orders.push({ col, ascending: opts?.ascending !== false })
      return q
    }
    for (const op of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'] as const) {
      q[op] = (col: string, val: unknown) => { filters.push({ op, col, val }); return q }
    }
    q.limit = (n: number) => { limit = n; return q }
    // `.range(from, to)` is inclusief aan beide kanten — de paginatie in
    // lib/vaste-lasten-summary.ts leunt erop, dus de mock moet 'm echt uitvoeren
    // (anders paginert die lus eeuwig door).
    q.range = (from: number, to: number) => { offset = from; limit = to - from + 1; return q }
    q.single = () => Promise.resolve({ data: settle().data[0] ?? null, error: null })
    q.maybeSingle = () => Promise.resolve({ data: settle().data[0] ?? null, error: null })
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(res, rej)
    return q
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-parity' } }, error: null }) },
    from: (table: string) => { tableQueries++; return builder(table) },
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push(fn)
      if (fn === 'tx_month_aggregate') {
        // Een aggregaat kent de rij-cap NIET: het telt in de database.
        const from = String(args.p_from ?? '')
        const to = String(args.p_to ?? '')
        const inWindow = transactions.filter(
          (t) => String(t.date) >= from && String(t.date) < to,
        ) as { amount: number; date: string; budget_id?: string | null; transaction_type?: string | null }[]
        return { data: buildMonthAggregatesFromRows(inWindow), error: null }
      }
      return { data: [], error: null }
    },
  } as unknown as SupabaseClient

  return { client, tableQueries: () => tableQueries, rpcCalls: () => rpcCalls }
}

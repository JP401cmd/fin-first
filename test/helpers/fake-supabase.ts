/**
 * Nep-Supabase voor de END-TO-END pariteitstests van de slanke cashflow-lagen
 * (`lib/cashflow-kpis.parity.test.ts`, `lib/cashflow-kpis.forecast-parity.test.ts`)
 * en voor de keyset-/cache-tests van de vaste-lastensamenvatting
 * (`lib/vaste-lasten-summary.keyset.test.ts`, `lib/vaste-lasten-cache.test.ts`).
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
 *   • `.or(...)` wordt ECHT toegepast voor de vormen die de mock herkent
 *     (`col.op.waarde` en `and(...)`-groepen), zodat een keyset-cursor die op de
 *     tweede pagina de eerste opnieuw zou opleveren hier zichtbaar wordt;
 *   • `.select(cols, { count, head })` levert een `count` die de rij-cap NIET
 *     kent — een count telt immers in de database;
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

type Filter = {
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'or'
  col: string
  val: unknown
}

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

function matches(row: Row, f: Filter): boolean {
  const v = row[f.col]
  switch (f.op) {
    case 'eq': return v === f.val
    case 'neq': return v !== f.val
    case 'gt': return (v as never) > (f.val as never)
    case 'gte': return (v as never) >= (f.val as never)
    case 'lt': return (v as never) < (f.val as never)
    case 'lte': return (v as never) <= (f.val as never)
    case 'in': return Array.isArray(f.val) && (f.val as unknown[]).includes(v)
    case 'or': return (f.val as OrBranch[]).some((branch) => branch.every((b) => matches(row, b)))
  }
}

function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  return rows.filter((r) => filters.every((f) => matches(r, f)))
}

/**
 * Splits een PostgREST-filterlijst op komma's op het BUITENSTE niveau —
 * `a.eq.1,and(b.eq.2,c.gt.3)` wordt twee takken, niet vier.
 */
function splitTopLevel(expr: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(expr.slice(start, i))
      start = i + 1
    }
  }
  parts.push(expr.slice(start))
  return parts.filter((p) => p.length > 0)
}

/**
 * Eén tak van een `.or(...)`: een lijst voorwaarden die ALLE moeten kloppen
 * (`and(...)`-groep), of een enkele voorwaarde (lijst van één).
 */
type OrBranch = Filter[]

/** `col.op.waarde` → een `Filter`. Onbekende operatoren geven `null`. */
function parseCondition(cond: string): Filter | null {
  const first = cond.indexOf('.')
  const second = cond.indexOf('.', first + 1)
  if (first < 0 || second < 0) return null
  const col = cond.slice(0, first)
  const op = cond.slice(first + 1, second)
  const raw = cond.slice(second + 1)
  if (!['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(op)) return null
  return { op: op as Filter['op'], col, val: raw }
}

/**
 * `.or('date.gt.X,and(date.eq.X,id.gt.Y)')` — de keyset-cursor uit
 * `lib/vaste-lasten-summary.ts`. Levert `null` bij een vorm die deze mock niet
 * kent; de aanroeper valt dan terug op passthrough (geen filtering), zodat een
 * onbekende `.or` een test nooit stil van rijen berooft.
 */
function parseOr(expr: string): OrBranch[] | null {
  const branches: OrBranch[] = []
  for (const part of splitTopLevel(expr)) {
    if (part.startsWith('and(') && part.endsWith(')')) {
      const inner = splitTopLevel(part.slice(4, -1)).map(parseCondition)
      if (inner.some((c) => c === null)) return null
      branches.push(inner as Filter[])
      continue
    }
    const single = parseCondition(part)
    if (!single) return null
    branches.push([single])
  }
  return branches.length > 0 ? branches : null
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
  recurringTransactions?: Row[]
}

export interface FakeSupabase {
  client: SupabaseClient
  /** Aantal `from(...)`-aanroepen — de query-teller van de test. */
  tableQueries: () => number
  /** Aantal `from(...)`-aanroepen per tabel — fijnmaziger dan `tableQueries`. */
  tableQueriesFor: (table: string) => number
  /** Namen van de aangeroepen RPC's, in volgorde. */
  rpcCalls: () => string[]
}

/**
 * De gebruiker die `auth.getUser()` van deze mock teruggeeft. Ook de `id` van de
 * profielrij in de fixtures, zodat "de ingelogde gebruiker" overal hetzelfde is.
 */
export const FAKE_USER_ID = 'user-parity'

/**
 * Stempelt `user_id` op fixture-rijen die 'm weglaten.
 *
 * In de echte database is `user_id` op deze tabellen NOT NULL — een rij zónder
 * bestaat niet. Een fixture die 'm wegliet was tot nu toe onschuldig omdat élke
 * gescande query RLS-gescoped was (geen kolom-predicaat), maar zodra één loader
 * een expliciete `.eq('user_id', …)` doet — zoals `getEarliestIncomeDate` sinds
 * de perf-fix moet — filtert dit ECHT toegepaste predicaat zulke rijen weg en
 * meet de test stil iets anders dan productie. Dat is precies het "de mock mag
 * een test hooguit minder scherp maken, nooit stil van rijen beroven"-principe
 * uit de kop van dit bestand.
 *
 * Blijft scherp: er wordt één vaste id gestempeld (dezelfde als `auth.getUser()`),
 * dus een query die op een ÁNDERE user_id filtert levert nog steeds niets — en een
 * fixture die bewust een vreemde `user_id` zet, houdt die.
 *
 * `profiles` doet hier NIET aan mee: die tabel heeft geen `user_id`-kolom (de
 * eigen rij is `id`), dus een stempel zou daar een fantoomkolom introduceren.
 */
const withUserId = (rows: Row[]): Row[] =>
  rows.map((r) => (r.user_id === undefined ? { ...r, user_id: FAKE_USER_ID } : r))

export function makeSupabase(db: FakeDb): FakeSupabase {
  let tableQueries = 0
  const perTable = new Map<string, number>()
  const rpcCalls: string[] = []
  const transactions = withUserId(db.transactions ?? [])

  const tables: Record<string, Row[]> = {
    profiles: [db.profile],
    budgets: withUserId(db.budgets ?? []),
    transactions,
    debts: withUserId(db.debts ?? []),
    assets: withUserId(db.assets ?? []),
    net_worth_snapshots: withUserId(db.netWorthSnapshots ?? []),
    recurring_transactions: withUserId(db.recurringTransactions ?? []),
  }

  function builder(table: string) {
    const rows = tables[table] ?? []
    const filters: Filter[] = []
    const orders: Order[] = []
    let limit = MAX_ROWS
    let offset = 0
    let headOnly = false
    let wantCount = false
    const settle = () => {
      const matched = applyOrders(applyFilters(rows, filters), orders).slice(offset)
      // PostgREST kapt af op min(client-limit, max_rows) — een client-`.limit()`
      // bóven max_rows is een no-op, exact zoals in productie. De `count` telt
      // in de database en kent die cap dus NIET.
      const data = headOnly ? [] : matched.slice(0, Math.min(limit, MAX_ROWS))
      return { data, error: null, count: wantCount ? matched.length : null }
    }
    const q: Record<string, unknown> = {}
    const passthrough = ['not', 'is', 'filter', 'contains', 'overlaps', 'match', 'textSearch']
    for (const m of passthrough) q[m] = () => q
    q.select = (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count) wantCount = true
      if (opts?.head) headOnly = true
      return q
    }
    // `.or(...)` wordt ECHT toegepast zodra de vorm herkend wordt — de
    // keyset-cursor van lib/vaste-lasten-summary.ts leunt erop dat de tweede
    // pagina de rijen van de eerste NIET meer bevat. Een niet-herkende vorm valt
    // terug op passthrough (geen filtering): een mock hoort een test hooguit
    // minder scherp te maken, nooit stil van rijen te beroven.
    q.or = (expr: string) => {
      const branches = parseOr(expr)
      if (branches) filters.push({ op: 'or', col: '', val: branches })
      return q
    }
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
    auth: { getUser: async () => ({ data: { user: { id: FAKE_USER_ID } }, error: null }) },
    from: (table: string) => {
      tableQueries++
      perTable.set(table, (perTable.get(table) ?? 0) + 1)
      return builder(table)
    },
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

  return {
    client,
    tableQueries: () => tableQueries,
    tableQueriesFor: (table: string) => perTable.get(table) ?? 0,
    rpcCalls: () => rpcCalls,
  }
}

/**
 * Laat de OPHAAL-queries op `transactions` met de opgegeven volgnummers (1-based,
 * over alle aanroepen heen geteld) een PostgREST-fout teruggeven; de rest gaat
 * gewoon door. `[1]` laat de eerste ophaalpoging falen, `[2]` de tweede pagina
 * van de eerste poging.
 *
 * "Ophaal" = de query met de volledige kolomlijst (de gepagineerde fetch van
 * `lib/vaste-lasten-summary.ts`), herkenbaar aan `counterparty_name` in de
 * select. De aggregaten van de vingerafdrukronde vragen één kolom en blijven dus
 * ongemoeid — precies het scenario dat ertoe doet: de goedkope ronde slaagt, de
 * dure niet.
 *
 * Alleen `.select()` wordt onderschept; dat is altijd de eerste schakel van de
 * keten, dus de rest loopt daarna over de echte builder (of over de foutketen).
 */
export function withFailingTxFetches(fake: FakeSupabase, pogingen: number[]): SupabaseClient {
  const echt = fake.client.from.bind(fake.client)
  const faalt = new Set(pogingen)
  let ophaalPoging = 0
  const foutKeten = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = new Proxy(
      {
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: { message: 'ophaal mislukt' }, count: null }).then(res),
      },
      {
        get: (target, prop) =>
          prop in target ? (target as Record<string | symbol, unknown>)[prop] : () => b,
      },
    )
    return b
  }
  return {
    ...fake.client,
    auth: fake.client.auth,
    from: (naam: string) => {
      const builder = echt(naam)
      if (naam !== 'transactions') return builder
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Proxy(builder as any, {
        get: (target, prop) => {
          if (prop !== 'select') return Reflect.get(target, prop)
          return (cols: string, opts?: unknown) => {
            if (typeof cols === 'string' && cols.includes('counterparty_name')) {
              ophaalPoging += 1
              if (faalt.has(ophaalPoging)) return foutKeten()
            }
            return (target as { select: (c: string, o?: unknown) => unknown }).select(cols, opts)
          }
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
    },
  } as unknown as SupabaseClient
}

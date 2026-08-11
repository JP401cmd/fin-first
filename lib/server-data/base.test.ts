/**
 * Tests voor de gedeelde basisdata-laag (lib/server-data/base.ts).
 *
 * Twee dingen worden bewezen:
 *   1. QUERY-VORM — elke fetcher richt zich op de juiste tabel, met de juiste
 *      `select(...)`/filters, en geeft de rauwe `{ data, error }`-vorm terug die de
 *      consumers verwachten.
 *   2. CACHE-HIT DEDUPE (de kernvereiste van Task 2.1) — twee "loaders" die binnen
 *      één request dezelfde fetcher met dezelfde supabase-client aanroepen, laten de
 *      onderliggende query maar ÉÉN keer uitvoeren.
 *
 * React `cache()` is buiten een RSC-render (dus óók in vitest) een PASSTHROUGH —
 * het memoiseert daar niet. Om het productie-gedrag (memoisatie per (fn, args)) toch
 * deterministisch te toetsen, mocken we `cache` met een echte, op het eerste argument
 * (de supabase-client) gekeyde memoizer. Zo bewijst de teller dat elke fetcher
 * daadwerkelijk in `cache()` gewrapt is én op de client keyt: een niet-gewrapte
 * fetcher zou de mock omzeilen en de query twee keer uitvoeren → test rood.
 */

import { describe, it, expect, vi } from 'vitest'

// Memoizer die React's cache() nabootst: per gewrapte functie een eigen store,
// gekeyed op het eerste argument (onze fetchers nemen alleen `supabase`).
vi.mock('react', () => ({
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    const store = new Map<unknown, R>()
    return (...args: A): R => {
      const key = args[0]
      if (!store.has(key)) store.set(key, fn(...args))
      return store.get(key) as R
    }
  },
}))

// `getEarliestIncomeDate` leest de ingelogde gebruiker om zijn eigen-tak
// expliciet op `user_id` te kunnen filteren (zie de perf-doc in base.ts).
// `getCachedUser` is zelf cache()-gewrapt; hier stubben we 'm.
const mockCachedUser = vi.hoisted(() => ({ current: { id: 'u1' } as { id: string } | null }))
vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: async () => mockCachedUser.current,
}))

import {
  getActiveAssets,
  getActiveDebts,
  getOwnProfile,
  getBudgets,
  getUnlinkedBankAccounts,
  getCurrentMonthTx,
  getTx12m,
  getEarliestIncomeDate,
} from './base'
import { ASSET_CLIENT_COLUMNS } from '@/lib/asset-data'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'

// ── Counting mock-client ─────────────────────────────────────────────────────
// Registreert per query de tabel + select + filter-calls, en telt hoe vaak
// `.from(<tabel>)` is aangeroepen (= hoeveel echte queries er zijn gebouwd).

type FilterCall = [method: string, ...args: unknown[]]
interface QuerySpec {
  table: string
  select?: string
  filters: FilterCall[]
}

function makeCountingSupabase(
  rowsByTable: Record<string, unknown[]> = {},
  // Optioneel: rijen per AFZONDERLIJKE query bepalen i.p.v. per tabel. Nodig
  // zodra één fetcher meerdere queries op dezelfde tabel doet met verschillende
  // filters (zie `getEarliestIncomeDate`: een eigen-tak en een gedeelde-tak).
  // Krijgt de tot dan toe opgebouwde spec en valt terug op `rowsByTable`.
  resolveRows?: (spec: QuerySpec) => unknown[] | undefined,
) {
  const queries: QuerySpec[] = []
  const fromCounts: Record<string, number> = {}

  function from(table: string) {
    fromCounts[table] = (fromCounts[table] ?? 0) + 1
    const spec: QuerySpec = { table, filters: [] }
    queries.push(spec)
    // Lazy: pas uitlezen op het moment dat de query wordt geawait, zodat
    // `resolveRows` de complete filterlijst ziet.
    const rowsNow = () => resolveRows?.(spec) ?? rowsByTable[table] ?? []

    const record = (method: string) => (...args: unknown[]) => {
      spec.filters.push([method, ...args])
      return q
    }
    const q: Record<string, unknown> = {
      select: (s: string) => {
        spec.select = s
        return q
      },
      eq: record('eq'),
      is: record('is'),
      gt: record('gt'),
      gte: record('gte'),
      lt: record('lt'),
      order: record('order'),
      limit: record('limit'),
      single: () => Promise.resolve({ data: rowsNow()[0] ?? null, error: null }),
      maybeSingle: () => Promise.resolve({ data: rowsNow()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rowsNow(), error: null }).then(resolve, reject),
    }
    return q
  }

  return { supabase: { from } as never, queries, fromCounts }
}

const findQuery = (queries: QuerySpec[], table: string) => queries.find((q) => q.table === table)!

// ── 1. Query-vorm per fetcher ────────────────────────────────────────────────

describe('base fetchers — query-vorm', () => {
  it('getActiveAssets: assets.select(kolomlijst).eq(is_active, true) → rauwe rows', async () => {
    const { supabase, queries, fromCounts } = makeCountingSupabase({
      assets: [{ id: 'a1', is_active: true }],
    })
    const res = await getActiveAssets(supabase)
    expect(res.data).toEqual([{ id: 'a1', is_active: true }])
    expect(fromCounts.assets).toBe(1)
    const q = findQuery(queries, 'assets')
    expect(q.select).toBe(ASSET_CLIENT_COLUMNS)
    expect(q.filters).toContainEqual(['eq', 'is_active', true])
  })

  // Deze fetcher voedt o.a. horizon-data-loader → `<HorizonPage>` (client), dus
  // de rijen belanden in de RSC-payload. `select('*')` zou daar de drie
  // account-nummer-kolommen in zetten — bij een gedeelde bezitting die van de
  // PARTNER (huishoud-gedeelde SELECT-policy). Op de losse namen toetsen en niet
  // met `toContain`: 'account_number' zit als substring in de andere twee.
  it('getActiveAssets: vraagt geen enkele account-nummer-kolom op', async () => {
    const { supabase, queries } = makeCountingSupabase({ assets: [] })
    await getActiveAssets(supabase)
    const requested = findQuery(queries, 'assets').select!.split(', ')
    expect(requested).not.toContain('account_number')
    expect(requested).not.toContain('account_number_encrypted')
    expect(requested).not.toContain('account_number_hash')
  })

  it('getActiveDebts: debts.select(*).eq(is_active, true)', async () => {
    const { supabase, queries } = makeCountingSupabase({ debts: [{ id: 'd1' }] })
    const res = await getActiveDebts(supabase)
    expect(res.data).toEqual([{ id: 'd1' }])
    const q = findQuery(queries, 'debts')
    expect(q.select).toBe('*')
    expect(q.filters).toContainEqual(['eq', 'is_active', true])
  })

  it('getOwnProfile: profiles.select(*).single() → enkele rij (RLS → eigen rij)', async () => {
    const { supabase, queries } = makeCountingSupabase({
      profiles: [{ id: 'u1', full_name: 'Test' }],
    })
    const res = await getOwnProfile(supabase)
    expect(res.data).toEqual({ id: 'u1', full_name: 'Test' })
    const q = findQuery(queries, 'profiles')
    expect(q.select).toBe('*')
    // Geen expliciete .eq('id'/'user_id') — RLS scopet al op de eigen rij.
    expect(q.filters.some((f) => f[0] === 'eq')).toBe(false)
  })

  it('getBudgets: budgets.select(*).order(sort_order)', async () => {
    const { supabase, queries } = makeCountingSupabase({ budgets: [{ id: 'b1' }] })
    const res = await getBudgets(supabase)
    expect(res.data).toEqual([{ id: 'b1' }])
    const q = findQuery(queries, 'budgets')
    expect(q.select).toBe('*')
    expect(q.filters).toContainEqual(['order', 'sort_order', { ascending: true }])
  })

  it('getUnlinkedBankAccounts: bank_accounts.select(id,name,balance).eq(is_active).is(linked_asset_id,null)', async () => {
    const { supabase, queries } = makeCountingSupabase({
      bank_accounts: [{ id: 'ba1', name: 'Spaar', balance: 1000 }],
    })
    const res = await getUnlinkedBankAccounts(supabase)
    expect(res.data).toEqual([{ id: 'ba1', name: 'Spaar', balance: 1000 }])
    const q = findQuery(queries, 'bank_accounts')
    expect(q.select).toBe('id, name, balance')
    expect(q.filters).toContainEqual(['eq', 'is_active', true])
    expect(q.filters).toContainEqual(['is', 'linked_asset_id', null])
  })
})

// ── 2. Transactievensters (tijdzone-veilige grenzen) ─────────────────────────

describe('base fetchers — transactievensters', () => {
  it('getCurrentMonthTx: transactions in [monthStart, monthEnd) met de ruimste kolomset', async () => {
    const { supabase, queries } = makeCountingSupabase({ transactions: [{ amount: 10 }] })
    const res = await getCurrentMonthTx(supabase)
    expect(res.data).toEqual([{ amount: 10 }])
    const q = findQuery(queries, 'transactions')
    expect(q.select).toBe('amount, date, budget_id, transaction_type')
    const { start, end } = localMonthBounds(new Date())
    expect(q.filters).toContainEqual(['gte', 'date', start])
    expect(q.filters).toContainEqual(['lt', 'date', end])
  })

  it('getTx12m: transactions in [localMonthStartMonthsAgo(now,11), monthEnd)', async () => {
    const { supabase, queries } = makeCountingSupabase({ transactions: [{ amount: -5 }] })
    const res = await getTx12m(supabase)
    expect(res.data).toEqual([{ amount: -5 }])
    const q = findQuery(queries, 'transactions')
    expect(q.select).toBe('amount, date, budget_id, transaction_type')
    const now = new Date()
    expect(q.filters).toContainEqual(['gte', 'date', localMonthStartMonthsAgo(now, 11)])
    expect(q.filters).toContainEqual(['lt', 'date', localMonthBounds(now).end])
    // BEWUST geen .limit(...) — de gemigreerde consumers hadden hier geen limiet.
    expect(q.filters.some((f) => f[0] === 'limit')).toBe(false)
  })
})

// ── 2b. getEarliestIncomeDate — twee indexeerbare takken, één minimum ────────
//
// Deze fetcher is de uitzondering op de T2.1-conventie: hij filtert WÉL
// expliciet op kolommen, omdat de planner de RLS-OR anders niet in een
// index-conditie kan duwen en op de globale datum-index terugvalt (kosten
// schalen dan met de rijen van ándere gebruikers — gemeten 12.202 buffers).
// De prijs daarvan mag NOOIT een scope-wijziging zijn: tak A dekt policy-tak 1
// (eigen rijen), tak B dekt policy-tak 2 (huishoud-gedeelde rijen), samen exact
// de RLS-verzameling. Onderstaande tests bewaken beide helften van die claim.

// Herkent welke van de twee takken een query is aan zijn filters.
const isOwnBranch = (q: QuerySpec) => q.filters.some((f) => f[0] === 'eq' && f[1] === 'user_id')
const isSharedBranch = (q: QuerySpec) =>
  q.filters.some((f) => f[0] === 'eq' && f[1] === 'ownership' && f[2] === 'shared')

describe('getEarliestIncomeDate — vroegste inkomstendatum over eigen + gedeelde rijen', () => {
  // Beide takken krijgen hun eigen datum mee, zodat we kunnen zien wélke wint.
  const twoBranches = (ownDate: string | null, sharedDate: string | null) =>
    makeCountingSupabase({}, (spec) => {
      if (spec.table !== 'transactions') return undefined
      if (isSharedBranch(spec)) return sharedDate ? [{ date: sharedDate }] : []
      if (isOwnBranch(spec)) return ownDate ? [{ date: ownDate }] : []
      return undefined
    })

  it('stelt beide takken indexeerbaar op: eigen op user_id, gedeeld op ownership', async () => {
    const { supabase, queries, fromCounts } = twoBranches('2020-03-01', null)
    await getEarliestIncomeDate(supabase)

    expect(fromCounts.transactions).toBe(2)
    const own = queries.find(isOwnBranch)!
    const shared = queries.find(isSharedBranch)!

    for (const q of [own, shared]) {
      expect(q.select).toBe('date')
      expect(q.filters).toContainEqual(['gt', 'amount', 0])
      expect(q.filters).toContainEqual(['order', 'date', { ascending: true }])
      expect(q.filters).toContainEqual(['limit', 1])
    }
    expect(own.filters).toContainEqual(['eq', 'user_id', 'u1'])
  })

  // DE SCOPE-VANGRAIL. Collapst iemand dit later terug naar één query met
  // `.eq('user_id', …)` — de voor de hand liggende "vereenvoudiging" — dan
  // verdwijnt policy-tak 2 en tellen de gedeelde inkomsten van de partner niet
  // meer mee in het extrapolatievenster. Deze test wordt dan rood.
  it('versmalt de scope niet: de gedeelde tak filtert niet op user_id', async () => {
    const { supabase, queries } = twoBranches(null, null)
    await getEarliestIncomeDate(supabase)

    const shared = queries.find(isSharedBranch)!
    expect(shared.filters.some((f) => f[0] === 'eq' && f[1] === 'user_id')).toBe(false)
    // …en verruimt 'm ook niet: het household_id-predicaat blijft van RLS komen,
    // wij zetten er zelf géén (fout) huishouden-filter overheen.
    expect(shared.filters.some((f) => f[1] === 'household_id')).toBe(false)
  })

  it('neemt het minimum: een eerdere gedeelde inkomstenrij wint van de eigen rij', async () => {
    const { supabase } = twoBranches('2021-07-01', '2019-02-15')
    const res = await getEarliestIncomeDate(supabase)
    expect(res.data).toEqual({ date: '2019-02-15' })
  })

  it('neemt het minimum: een eerdere eigen rij wint van de gedeelde rij', async () => {
    const { supabase } = twoBranches('2019-02-15', '2021-07-01')
    const res = await getEarliestIncomeDate(supabase)
    expect(res.data).toEqual({ date: '2019-02-15' })
  })

  it('één lege tak is geen probleem — de andere levert de datum', async () => {
    const alleenEigen = twoBranches('2022-01-01', null)
    expect((await getEarliestIncomeDate(alleenEigen.supabase)).data).toEqual({ date: '2022-01-01' })

    const alleenGedeeld = twoBranches(null, '2022-05-09')
    expect((await getEarliestIncomeDate(alleenGedeeld.supabase)).data).toEqual({
      date: '2022-05-09',
    })
  })

  it('geen enkele inkomstenrij → data null (consumers vallen terug op hun default)', async () => {
    const { supabase } = twoBranches(null, null)
    const res = await getEarliestIncomeDate(supabase)
    expect(res.data).toBeNull()
    expect(res.error).toBeNull()
  })

  it('zonder sessie: geen query, en dezelfde lege vorm als PostgREST', async () => {
    mockCachedUser.current = null
    try {
      const { supabase, fromCounts } = twoBranches('2020-01-01', '2020-01-01')
      const res = await getEarliestIncomeDate(supabase)
      expect(res.data).toBeNull()
      expect(fromCounts.transactions).toBeUndefined()
    } finally {
      mockCachedUser.current = { id: 'u1' }
    }
  })
})

// ── 3. Cache-hit dedupe (de kernvereiste) ────────────────────────────────────

describe('base fetchers — cache-hit dedupe binnen één request', () => {
  it('twee loaders die dezelfde fetcher + client aanroepen → ÉÉN query', async () => {
    const { supabase, fromCounts } = makeCountingSupabase({ assets: [{ id: 'a1' }] })

    // Twee onafhankelijke "loaders" binnen hetzelfde request.
    const [a, b] = await Promise.all([getActiveAssets(supabase), getActiveAssets(supabase)])

    // Zelfde uitkomst, maar de assets-tabel is maar ÉÉN keer bevraagd.
    expect(a).toBe(b)
    expect(fromCounts.assets).toBe(1)
  })

  it('elke tabel-fetcher dedupt onafhankelijk; het 12-maands venster deelt één tx-query', async () => {
    const { supabase, fromCounts } = makeCountingSupabase()
    await Promise.all([
      getActiveAssets(supabase),
      getActiveAssets(supabase),
      getActiveDebts(supabase),
      getOwnProfile(supabase),
      getOwnProfile(supabase),
      getTx12m(supabase),
      getTx12m(supabase),
      getTx12m(supabase),
    ])
    expect(fromCounts.assets).toBe(1)
    expect(fromCounts.debts).toBe(1)
    expect(fromCounts.profiles).toBe(1)
    expect(fromCounts.transactions).toBe(1)
  })

  it('een andere client-instantie is een aparte cache-key → aparte query', async () => {
    const first = makeCountingSupabase({ assets: [{ id: 'a1' }] })
    const second = makeCountingSupabase({ assets: [{ id: 'a2' }] })
    await getActiveAssets(first.supabase)
    await getActiveAssets(second.supabase)
    expect(first.fromCounts.assets).toBe(1)
    expect(second.fromCounts.assets).toBe(1)
  })
})

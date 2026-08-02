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

import {
  getActiveAssets,
  getActiveDebts,
  getOwnProfile,
  getBudgets,
  getUnlinkedBankAccounts,
  getCurrentMonthTx,
  getTx12m,
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

function makeCountingSupabase(rowsByTable: Record<string, unknown[]> = {}) {
  const queries: QuerySpec[] = []
  const fromCounts: Record<string, number> = {}

  function from(table: string) {
    fromCounts[table] = (fromCounts[table] ?? 0) + 1
    const spec: QuerySpec = { table, filters: [] }
    queries.push(spec)
    const rows = rowsByTable[table] ?? []

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
      gte: record('gte'),
      lt: record('lt'),
      order: record('order'),
      single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve, reject),
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

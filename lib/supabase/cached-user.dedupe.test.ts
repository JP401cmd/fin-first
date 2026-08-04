/**
 * AUTH-DEDUPE OP HET CASHFLOW-DATAPAD (T1.2).
 *
 * `/overzicht/cashflow` draait vijf loaders naast elkaar in één `Promise.all`.
 * Drie daarvan deden hun eigen rauwe `supabase.auth.getUser()` — elk een volle
 * `/auth/v1/user`-roundtrip, en elk als EERSTE, BLOKKERENDE stap vóór hun eigen
 * queries. Ze lopen nu alle drie via `getCachedUser`, die React `cache()` op de
 * client-instantie keyt en dus binnen één request één keer uitvoert.
 *
 * Deze test telt de echte `auth.getUser()`-aanroepen op één mock-client terwijl
 * de drie loaders samen draaien: verwacht is precies 1. Vóór deze wijziging
 * waren dat er 3.
 *
 * React `cache()` is buiten een RSC-render (dus óók in vitest) een PASSTHROUGH.
 * Om het productiegedrag te toetsen vervangen we `cache` — net als in
 * `lib/server-data/tx-aggregates.cache.test.ts` — door een memoizer die op de
 * identiteit van álle argumenten keyt (`Object.is` per argument), precies zoals
 * React dat doet. De rest van de react-export blijft intact.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    const entries: { args: A; result: R }[] = []
    return (...args: A): R => {
      const hit = entries.find(
        (e) => e.args.length === args.length && e.args.every((a, i) => Object.is(a, args[i])),
      )
      if (hit) return hit.result
      const result = fn(...args)
      entries.push({ args, result })
      return result
    }
  },
}))

// De core-loader is een zware, breed vertakte afhankelijkheid van
// `loadCashflowSettingsData` en niet wat hier getest wordt: alleen de auth-stap
// ervóór telt. Vervangen door een stub, zodat deze test puur over auth-calls gaat.
vi.mock('@/lib/core-data-loader', () => ({
  loadCoreData: vi.fn(async () => CORE_STUB),
}))

import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { loadCashflowSettingsData } from '@/lib/cashflow-settings-data'
import { getCachedPerspectiveContext } from '@/lib/household/perspective-loader-server'
import { __resetVasteLastenCache } from '@/lib/vaste-lasten-cache'
import { getCachedUser } from './cached-user'

/**
 * Minimale `CorePageData`-stub: alleen de velden die
 * `loadCashflowSettingsData` uitleest. Bewust een partiële cast — de bundel is
 * groot en de rest is voor deze test irrelevant.
 */
const CORE_STUB = {
  rawFinancials: {
    totalAssets: 0,
    totalDebts: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    yearlyMustExpenses: 0,
    yearlyRetirementExpenses: 0,
    extrapolatedIncome: 0,
  },
  fullAssets: [],
  savingsRate6m: 0,
  budgetingActive: false,
  fireParams: { grossReturn: 0, effectiveSwr: 0, inflationRate: 0 },
  fireStrategy: { strategy: 'perpetual', endAge: 90 },
  retirementMethodUsed: 'must',
  savingsRateMethod: 'transaction',
  savingsReceiptData: { extHalfYearExpenses: 0 },
  monthlyIncomeExpenseSeries: [],
  savingsBudgetTotal6m: 0,
  debtAflossingTotal6m: 0,
} as unknown as Awaited<ReturnType<typeof import('@/lib/core-data-loader').loadCoreData>>

/**
 * Eén bevestigde vaste last. Dient als "de loader kwam voorbij de auth-gate"-
 * signaal: bij een lege/ontbrekende sessie retourneert `loadVasteLastenSummary`
 * de EMPTY-bundel (count 0) en zou de assertie hieronder omvallen.
 */
const RECURRING_ROWS = [
  {
    id: 'r1',
    counterparty_name: 'Verhuurder',
    amount: -100,
    name: 'Huur',
    frequency: 'monthly',
    category_override: 'vaste_kosten',
    end_date: null,
  },
]

/**
 * Chainbare mock-client die élke `auth.getUser()` telt. Alleen
 * `recurring_transactions` levert rijen; de overige tabellen zijn leeg, zodat de
 * loaders hun deterministische pad volgen en de test puur over auth-roundtrips gaat.
 */
function makeCountingSupabase() {
  const counts = { getUser: 0 }
  const tables: Record<string, unknown[]> = { recurring_transactions: RECURRING_ROWS }
  const builder = (rows: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      gte: () => b,
      lte: () => b,
      order: () => b,
      limit: () => b,
      range: () => b,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: rows, error: null }),
    }
    return b
  }
  const supabase = {
    auth: {
      getUser: async () => {
        counts.getUser += 1
        return { data: { user: { id: 'u1' } }, error: null }
      },
    },
    from: (table: string) => builder(tables[table] ?? []),
    rpc: () => Promise.resolve({ data: [], error: null }),
  } as unknown as SupabaseClient
  return { supabase, counts }
}

describe('auth-dedupe op het cashflow-datapad', () => {
  // Elke test hier gebruikt dezelfde gebruiker en dezelfde rijen, dus dezelfde
  // vingerafdruk. Zonder deze wis zou de tweede test de vaste-lastencache (T3.3)
  // raken en niet meer het loaderpad meten dat hij beschrijft.
  beforeEach(() => __resetVasteLastenCache())

  it('de drie loaders delen samen ÉÉN auth.getUser()-roundtrip', async () => {
    const { supabase, counts } = makeCountingSupabase()

    const [vasteLasten, settings, context] = await Promise.all([
      loadVasteLastenSummary(supabase),
      loadCashflowSettingsData(supabase),
      getCachedPerspectiveContext(supabase),
    ])

    expect(counts.getUser).toBe(1)
    // Alle drie kwamen voorbij de auth-gate met dezelfde gebruiker: geen van de
    // loaders viel stil terug op zijn "niet ingelogd"-pad (EMPTY / null / throw).
    expect(vasteLasten.count).toBe(1)
    expect(settings).not.toBeNull()
    expect(context.userId).toBe('u1')
  })

  it('de shell-/dashboard-call vóór de loaders kost geen extra roundtrip', async () => {
    const { supabase, counts } = makeCountingSupabase()

    // Spiegelt app/(app)/layout.tsx: de shell resolvet de gebruiker als eerste,
    // daarna draaien de paginaloaders. Samen blijft dat één roundtrip.
    await getCachedUser(supabase)
    await Promise.all([
      loadVasteLastenSummary(supabase),
      loadCashflowSettingsData(supabase),
      getCachedPerspectiveContext(supabase),
    ])

    expect(counts.getUser).toBe(1)
  })

  it('een andere client-instantie is een aparte cache-key (geen cross-request-lek)', async () => {
    const first = makeCountingSupabase()
    const second = makeCountingSupabase()

    await getCachedPerspectiveContext(first.supabase)
    await getCachedPerspectiveContext(second.supabase)

    expect(first.counts.getUser).toBe(1)
    expect(second.counts.getUser).toBe(1)
  })
})

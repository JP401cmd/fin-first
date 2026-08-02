/**
 * Tests voor de `cache()`-gewrapte 12-maands aggregaat-fetcher (`getTxAgg12m`).
 *
 * Twee dingen worden bewezen:
 *   1. DEDUPE — de drie "loaders" (dashboard + core + horizon) die binnen één
 *      request het 12-maands aggregaat vragen, laten de `tx_month_aggregate`-RPC
 *      maar ÉÉN keer draaien. Dat is het hele punt van T1.1.
 *   2. ANTI-DRIFT OP HET VENSTER — het venster dat `getTxAgg12m` intern berekent is
 *      byte-identiek aan de twee inline `Date.UTC(...).toISOString()`-berekeningen
 *      die het in dashboard-/core-data-loader vervangt. Wijkt dat ooit af, dan is
 *      de wrap géén dedupe meer maar een stille gedragswijziging.
 *
 * React `cache()` is buiten een RSC-render (dus óók in vitest) een PASSTHROUGH.
 * Om het productiegedrag deterministisch te toetsen mocken we `cache` met een
 * echte memoizer die — net als React — op de identiteit van ÁLLE argumenten keyt
 * (`Object.is` per argument). Dat is bewust strenger dan de memoizer in
 * `base.test.ts` (die alleen op het eerste argument keyt): juist die strengheid
 * vangt de valkuil van deze taak. Een wrap om `fetchTxMonthAggregate` zélf zou een
 * vers `{ from, to }`-object als tweede argument krijgen, twee verse objecten zijn
 * nooit identiek → cache-miss → 2 RPC's → test rood.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('react', () => ({
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

import { getTxAgg12m } from './tx-aggregates'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'

// ── De vervangen inline-berekeningen, letterlijk overgenomen ─────────────────
// Uit `lib/dashboard-data-loader.ts` (was r233/r232) en `lib/core-data-loader.ts`
// (was r263/r262) — daar stonden ze karakter voor karakter gelijk. Deze twee
// functies zijn de getuige: verandert `getTxAgg12m`'s venster, dan valt de
// vergelijking hieronder om.
const oldInlineTwelveMonthsAgo = (now: Date) =>
  new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1)).toISOString().split('T')[0]
const oldInlineMonthEnd = (now: Date) =>
  new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]

// ── Tellende mock-client ────────────────────────────────────────────────────
function makeCountingSupabase(rows: unknown[] = []) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
  const supabase = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return Promise.resolve({ data: rows, error: null })
    },
  } as never
  return { supabase, rpcCalls }
}

// ── 1. Dedupe binnen één request ────────────────────────────────────────────

describe('getTxAgg12m — cache-hit dedupe binnen één request', () => {
  it('dashboard-, core- én horizon-loader delen ÉÉN tx_month_aggregate-RPC', async () => {
    const { supabase, rpcCalls } = makeCountingSupabase([
      { month: '2026-07', budget_id: null, transaction_type: null, sum_positief: 100, sum_negatief: -40, count: 2 },
    ])

    // Drie onafhankelijke "loaders" binnen hetzelfde request. Op de cashflow-hub
    // draaien ze alle drie: loadDashboardData, loadCashflowSettingsData →
    // loadCoreData, en loadDashboardData → computeHorizonFireSim → loadHorizonData.
    const [a, b, c] = await Promise.all([
      getTxAgg12m(supabase),
      getTxAgg12m(supabase),
      getTxAgg12m(supabase),
    ])

    expect(rpcCalls).toHaveLength(1)
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(a.data).toHaveLength(1)
    expect(a.error).toBeNull()
  })

  it('een andere client-instantie is een aparte cache-key → aparte RPC', async () => {
    const first = makeCountingSupabase()
    const second = makeCountingSupabase()
    await getTxAgg12m(first.supabase)
    await getTxAgg12m(second.supabase)
    expect(first.rpcCalls).toHaveLength(1)
    expect(second.rpcCalls).toHaveLength(1)
  })
})

// ── 2. Venster + RPC-vorm ───────────────────────────────────────────────────

describe('getTxAgg12m — venster en RPC-vorm', () => {
  it('roept tx_month_aggregate aan met het venster van de vervangen callsites', async () => {
    const { supabase, rpcCalls } = makeCountingSupabase()
    await getTxAgg12m(supabase)

    const now = new Date()
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].fn).toBe('tx_month_aggregate')
    expect(rpcCalls[0].args).toEqual({
      p_from: oldInlineTwelveMonthsAgo(now),
      p_to: oldInlineMonthEnd(now),
      // Beide callsites lieten `ownOnly` weg → RLS-breed (eigen + gedeeld huishouden).
      p_own_only: false,
    })
  })
})

// ── 3. Anti-drift: de helpers reproduceren de oude inline-berekening ────────
// De dedupe is alleen een dedupe als het nieuwe venster exact het oude is. De test
// hierboven bewijst dat voor "vandaag"; deze doet het over de datums waar de twee
// vormen uit elkaar zouden kunnen lopen (jaargrenzen, schrikkeljaar, DST-omslag).

describe('12-maands venster — helpers == de oude inline Date.UTC-berekening', () => {
  const referentieDatums: [label: string, date: Date][] = [
    ['jaargrens terug (jan → vorig jaar)', new Date(2026, 0, 15, 12)],
    ['jaargrens vooruit (dec → volgend jaar)', new Date(2026, 11, 31, 12)],
    ['schrikkeljaar (29 feb)', new Date(2024, 1, 29, 12)],
    ['DST-start NL', new Date(2026, 2, 29, 12)],
    ['DST-eind NL', new Date(2026, 9, 25, 12)],
    ['eerste dag van de maand', new Date(2026, 6, 1, 12)],
  ]

  it.each(referentieDatums)('%s: ondergrens en bovengrens blijven gelijk', (_label, date) => {
    expect(localMonthStartMonthsAgo(date, 11)).toBe(oldInlineTwelveMonthsAgo(date))
    expect(localMonthBounds(date).end).toBe(oldInlineMonthEnd(date))
  })

  it('de ondergrens ligt exact 11 maanden vóór de maand van de bovengrens', () => {
    // Vangt een off-by-one (10/12 i.p.v. 11 maanden terug) die de gelijkheid
    // hierboven niet zou zien als iemand béíde kanten tegelijk verzet.
    const now = new Date(2026, 7, 2, 12)
    expect(localMonthStartMonthsAgo(now, 11)).toBe('2025-09-01')
    expect(localMonthBounds(now).end).toBe('2026-09-01')
  })
})

/**
 * Tests voor de `cache()`-gewrapte realisatie-fetcher (`getRealizedBudgetAmounts`).
 *
 * Dit bewijst met een tellende stub, niet met een redenering, drie dingen die de
 * module-kop claimt maar die vóór deze test nergens werden geverifieerd:
 *
 *   1. DEDUPE — de zeven aanroepers van `loadBudgetBasis` die binnen één request
 *      de budgetgrondslag opvragen, laten de drie `tx_month_aggregate`-chunks
 *      maar ÉÉN keer draaien (3 RPC's, niet 21).
 *   2. CHUNKING — het venster wordt in drie chunks van vier maanden geknipt, op
 *      exact de grenzen die de module-kop beschrijft.
 *   3. ROBUUSTHEID — één gefaalde chunk trekt de andere twee niet om: het
 *      resultaat bevat hun rijen, en een leesfout zet de truncatie-kanarie NIET
 *      (dat is iets anders dan een afkapping). Faalt élke chunk, dan is het
 *      resultaat het lege venster — de terugval naar geplande limieten.
 *
 * Zelfde mock-constructie als `lib/server-data/tx-aggregates.cache.test.ts`:
 * React `cache()` is buiten een RSC-render een passthrough, dus we mocken 'm met
 * een echte memoizer die op de identiteit van het (enige) argument keyt — de
 * supabase-client. Dat is precies de aanname die `getRealizedBudgetAmounts`
 * documenteert ("nooit op een vers {from,to}-object — dat zou een stille no-op
 * zijn").
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

import { getRealizedBudgetAmounts, POSTGREST_MAX_ROWS } from './budget-realized'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'

type RpcArgs = { p_from: string; p_to: string; p_own_only: boolean }

/** Tellende nep-client. `perCall` levert per RPC-aanroep (in volgorde) een uitkomst. */
function makeCountingSupabase(
  perCall: Array<{ rows?: unknown[]; error?: unknown }>,
) {
  const rpcCalls: { fn: string; args: RpcArgs }[] = []
  let i = 0
  const supabase = {
    rpc: (fn: string, args: RpcArgs) => {
      rpcCalls.push({ fn, args })
      const outcome = perCall[i] ?? { rows: [] }
      i += 1
      if (outcome.error) return Promise.resolve({ data: null, error: outcome.error })
      return Promise.resolve({ data: outcome.rows ?? [], error: null })
    },
  } as never
  return { supabase, rpcCalls }
}

function aggRow(month: string, budgetId: string, neg: number): Record<string, unknown> {
  return { month, budget_id: budgetId, transaction_type: 'expense', sum_positief: 0, sum_negatief: neg, count: 1 }
}

describe('getRealizedBudgetAmounts — cache-hit dedupe binnen één request', () => {
  it('zeven "loaders" delen drie tx_month_aggregate-RPC\'s, niet 21', async () => {
    const { supabase, rpcCalls } = makeCountingSupabase([{ rows: [] }, { rows: [] }, { rows: [] }])

    // De zeven aanroepers van loadBudgetBasis (core-, dashboard-, horizon-loader,
    // twee cashflow-KPI-loaders, lever-scores, doelen-loader) — hier gesimuleerd
    // als zeven parallelle aanroepen binnen hetzelfde "request".
    const results = await Promise.all(Array.from({ length: 7 }, () => getRealizedBudgetAmounts(supabase)))

    expect(rpcCalls).toHaveLength(3)
    // Alle zeven kregen hetzelfde (gememoized) resultaat-object terug.
    for (const r of results) expect(r).toBe(results[0])
  })

  it('een andere client-instantie is een aparte cache-key → weer drie RPC\'s', async () => {
    const first = makeCountingSupabase([{ rows: [] }, { rows: [] }, { rows: [] }])
    const second = makeCountingSupabase([{ rows: [] }, { rows: [] }, { rows: [] }])
    await getRealizedBudgetAmounts(first.supabase)
    await getRealizedBudgetAmounts(second.supabase)
    expect(first.rpcCalls).toHaveLength(3)
    expect(second.rpcCalls).toHaveLength(3)
  })
})

describe('getRealizedBudgetAmounts — chunking op vier maanden', () => {
  it('knipt het 12-maands venster in drie chunks van vier maanden, oud naar nieuw', async () => {
    const now = new Date(2026, 7, 8) // 8 augustus 2026, bevroren via de expected-berekening zelf
    vi.useFakeTimers()
    vi.setSystemTime(now)
    try {
      const { supabase, rpcCalls } = makeCountingSupabase([{ rows: [] }, { rows: [] }, { rows: [] }])
      await getRealizedBudgetAmounts(supabase)

      expect(rpcCalls).toHaveLength(3)
      // Chunk 1: [11 mnd terug, 7 mnd terug)
      expect(rpcCalls[0].args).toEqual({
        p_from: localMonthStartMonthsAgo(now, 11),
        p_to: localMonthStartMonthsAgo(now, 7),
        p_own_only: false,
      })
      // Chunk 2: [7 mnd terug, 3 mnd terug)
      expect(rpcCalls[1].args).toEqual({
        p_from: localMonthStartMonthsAgo(now, 7),
        p_to: localMonthStartMonthsAgo(now, 3),
        p_own_only: false,
      })
      // Chunk 3: [3 mnd terug, maandeinde van nu) — de laatste chunk sluit af op
      // hetzelfde punt als `getTxAgg12m`'s bovengrens.
      expect(rpcCalls[2].args).toEqual({
        p_from: localMonthStartMonthsAgo(now, 3),
        p_to: localMonthBounds(now).end,
        p_own_only: false,
      })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('getRealizedBudgetAmounts — robuustheid: één gefaalde chunk trekt de rest niet om', () => {
  // HERZIEN na de eindreview (11 aug 2026): een GEDEELTELIJKE ronde is geen
  // geldige ronde. Deze twee tests asserteerden eerst dat de overgebleven chunks
  // hun rijen leveren. Dat is precies de fout die de review vond: bij een gefaalde
  // chunk ontbreken vier maanden aan sommen terwijl de deler (de leeftijd van het
  // budget) 12 blijft — een structureel TE LAGE realisatie, die bovendien nog
  // steeds `source: 'realized'` heet en dus nergens als onvolledig herkenbaar is.
  // Voor uitgaven is te laag optimistisch (te vroege FIRE-datum).
  //
  // De KERN van beide tests blijft ongewijzigd en is nog steeds cruciaal: een
  // gefaalde of afgewezen chunk mag de hele call NOOIT laten rejecten. Alleen de
  // verwachte INHOUD is omgedraaid naar het lege venster, waarmee elke post
  // zichtbaar op `'planned'` terugvalt.
  it('een afgewezen chunk levert het LEGE venster — geen reject, maar ook geen halve waarheid', async () => {
    const { supabase } = makeCountingSupabase([
      { rows: [aggRow('2025-09', 'b1', -300)] },
      { error: new Error('netwerkfout') },
      { rows: [aggRow('2026-07', 'b1', -400)] },
    ])

    const result = await getRealizedBudgetAmounts(supabase)

    expect(result.byBudgetId).toEqual({})
    // Een leesfout is geen afkapping — de kanarie mag hier NIET aanslaan.
    expect(result.truncationSuspected).toBe(false)
  })

  it('een chunk-promise die REJECT (niet resolve-met-error) trekt de Promise.all niet om', async () => {
    // Simuleert het scenario uit de module-kop: zonder de .then(ok, error)-guard
    // zou één afgewezen RPC de hele Promise.all — en dus de aanroepende loader —
    // laten rejecten. De call moet dus RESOLVEN; de inhoud is het lege venster.
    const rpcCalls: RpcArgs[] = []
    let i = 0
    const supabase = {
      rpc: (_fn: string, args: RpcArgs) => {
        rpcCalls.push(args)
        i += 1
        if (i === 2) return Promise.reject(new Error('hard netwerkfalen'))
        return Promise.resolve({ data: [aggRow('2026-07', 'b1', -100)], error: null })
      },
    } as never

    await expect(getRealizedBudgetAmounts(supabase)).resolves.toBeTruthy()
    const result = await getRealizedBudgetAmounts(supabase)
    expect(result.byBudgetId).toEqual({})
  })

  it('falen ALLE drie chunks, dan is het resultaat het lege venster (terugval op de planning)', async () => {
    const { supabase } = makeCountingSupabase([
      { error: 'x' }, { error: 'x' }, { error: 'x' },
    ])
    const result = await getRealizedBudgetAmounts(supabase)
    expect(result.byBudgetId).toEqual({})
    expect(result.truncationSuspected).toBe(false)
    expect(result.windowMonths).toBe(12)
  })
})

describe('getRealizedBudgetAmounts — truncatie-kanarie op de echte RPC-respons', () => {
  it('een chunk die exact POSTGREST_MAX_ROWS rijen teruggeeft zet de kanarie', async () => {
    const fullChunk = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) =>
      aggRow('2026-07', `b${i}`, -1),
    )
    const { supabase } = makeCountingSupabase([{ rows: fullChunk }, { rows: [] }, { rows: [] }])
    const result = await getRealizedBudgetAmounts(supabase)
    expect(result.truncationSuspected).toBe(true)
  })

  it('één rij onder de cap zet de kanarie NIET', async () => {
    const almostFull = Array.from({ length: POSTGREST_MAX_ROWS - 1 }, (_, i) =>
      aggRow('2026-07', `b${i}`, -1),
    )
    const { supabase } = makeCountingSupabase([{ rows: almostFull }, { rows: [] }, { rows: [] }])
    const result = await getRealizedBudgetAmounts(supabase)
    expect(result.truncationSuspected).toBe(false)
  })
})

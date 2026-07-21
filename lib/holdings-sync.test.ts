import { describe, it, expect } from 'vitest'
import {
  assetsWithActiveHoldings,
  syncHoldingAggregatesFromTransactions,
} from './holdings-sync'

/**
 * Tests voor `assetsWithActiveHoldings` — de batch-variant die de check-in- en
 * herwaardeer-pagina's gebruiken om in 2 queries (i.p.v. N calls) te bepalen
 * welke assets actieve holdings hebben.
 *
 * De helper doet per tabel: `.select('asset_id').in('asset_id', ids)
 * .eq('user_id', userId).eq('is_active', true)`. We mocken een Supabase-client
 * die per tabel een vaste rijenset teruggeeft, zodat we de union-logica en de
 * guards (dedupe, lege lijst) kunnen asserteren. De echte DB filtert op
 * user_id/is_active; hier leveren we al de "reeds gefilterde" rijen aan.
 */

type Row = { asset_id: string }

function makeSupabase(tables: {
  investment_holdings?: Row[]
  crypto_holdings?: Row[]
}) {
  function builder(rows: Row[]) {
    const q = {
      select: () => q,
      in: () => q,
      eq: () => q,
      then: (resolve: (v: { data: Row[]; error: null }) => void) =>
        resolve({ data: rows, error: null }),
    }
    return q
  }
  return {
    from: (table: string) =>
      builder(tables[table as keyof typeof tables] ?? []),
  } as never
}

const USER = 'user-1'

describe('assetsWithActiveHoldings', () => {
  it('neemt een asset met actieve investment-holding op in de set', async () => {
    const supabase = makeSupabase({
      investment_holdings: [{ asset_id: 'inv-1' }],
    })
    const set = await assetsWithActiveHoldings(supabase, ['inv-1', 'other'], USER)
    expect(set.has('inv-1')).toBe(true)
    expect(set.has('other')).toBe(false)
  })

  it('neemt een asset met actieve crypto-holding op in de set', async () => {
    const supabase = makeSupabase({
      crypto_holdings: [{ asset_id: 'cry-1' }],
    })
    const set = await assetsWithActiveHoldings(supabase, ['cry-1'], USER)
    expect(set.has('cry-1')).toBe(true)
  })

  it('verenigt investment- en crypto-treffers in één set', async () => {
    const supabase = makeSupabase({
      investment_holdings: [{ asset_id: 'inv-1' }],
      crypto_holdings: [{ asset_id: 'cry-1' }],
    })
    const set = await assetsWithActiveHoldings(
      supabase,
      ['inv-1', 'cry-1', 'plain'],
      USER
    )
    expect(set).toEqual(new Set(['inv-1', 'cry-1']))
  })

  it('laat een asset zonder holdings (of enkel inactieve) buiten de set', async () => {
    // De DB-query filtert al op is_active=true, dus een inactieve holding komt
    // hier simpelweg niet in de rijenset terug → asset zit niet in de set.
    const supabase = makeSupabase({ investment_holdings: [] })
    const set = await assetsWithActiveHoldings(supabase, ['inv-1'], USER)
    expect(set.has('inv-1')).toBe(false)
    expect(set.size).toBe(0)
  })

  it('geeft een lege set voor een lege id-lijst zonder query te doen', async () => {
    let called = false
    const supabase = {
      from: () => {
        called = true
        return { select: () => ({}) }
      },
    } as never
    const set = await assetsWithActiveHoldings(supabase, [], USER)
    expect(set.size).toBe(0)
    expect(called).toBe(false)
  })

  it('dedupliceert gevraagde ids', async () => {
    const supabase = makeSupabase({
      investment_holdings: [{ asset_id: 'inv-1' }],
    })
    const set = await assetsWithActiveHoldings(
      supabase,
      ['inv-1', 'inv-1', 'inv-1'],
      USER
    )
    expect(set).toEqual(new Set(['inv-1']))
  })
})

/**
 * Tests voor `syncHoldingAggregatesFromTransactions` — de write-path die na elke
 * transactie-mutatie units + avg_purchase_price uit de VOLLEDIGE historie
 * herberekent via de canonieke engine, zodat het opgeslagen veld nooit meer kan
 * afwijken van de transactie-afgeleide waarde (fix UAT-BEZIT-16). We mocken een
 * Supabase-client die transacties teruggeeft en de holding-update-payload vangt.
 */
type Tx = {
  type: string
  units: number | string
  price_per_unit: number | string | null
  total_amount?: number | string | null
  date: string | null
  created_at?: string | null
}

function makeHoldingSupabase(txRows: Tx[], capture: { payload?: Record<string, unknown> }) {
  const txBuilder: Record<string, unknown> = {
    select: () => txBuilder,
    eq: () => txBuilder,
    order: () => txBuilder,
    limit: () => Promise.resolve({ data: txRows, error: null }),
  }
  const updateChain: Record<string, unknown> = {
    eq: () => updateChain,
    then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
  }
  const holdingBuilder = {
    update: (payload: Record<string, unknown>) => {
      capture.payload = payload
      return updateChain
    },
  }
  return {
    from: (table: string) =>
      table === 'investment_transactions' ? txBuilder : holdingBuilder,
  } as never
}

const TABLES = { holdings: 'investment_holdings', transactions: 'investment_transactions' }

describe('syncHoldingAggregatesFromTransactions', () => {
  it('schrijft de transactie-afgeleide avg terug — nooit een stale opgeslagen basis', async () => {
    // Exact de Meesman-koophistorie (persona compleet): Σ 226.140 over 2.215
    // eenheden → gewogen gemiddelde 102,0948. Het oude stale seed-veld was 94,81.
    const txRows: Tx[] = [
      { type: 'buy', units: 700, price_per_unit: 84, total_amount: 58800, date: '2016-01-01' },
      { type: 'buy', units: 520, price_per_unit: 96, total_amount: 49920, date: '2019-01-01' },
      { type: 'buy', units: 430, price_per_unit: 108, total_amount: 46440, date: '2022-01-01' },
      { type: 'buy', units: 360, price_per_unit: 122, total_amount: 43920, date: '2024-01-01' },
      { type: 'buy', units: 205, price_per_unit: 132, total_amount: 27060, date: '2025-07-01' },
      { type: 'dividend', units: 0, price_per_unit: 0, total_amount: 1850, date: '2025-07-01' },
    ]
    const capture: { payload?: Record<string, unknown> } = {}
    const supabase = makeHoldingSupabase(txRows, capture)

    const result = await syncHoldingAggregatesFromTransactions(supabase, TABLES, 'h-1', USER)

    expect(result.synced).toBe(true)
    expect(result.units).toBe(2215)
    expect(result.avgPurchasePrice).toBeCloseTo(102.0948, 4)
    // De holding-update krijgt de engine-waarde, niet 94,81.
    expect(capture.payload?.units).toBe(2215)
    expect(capture.payload?.avg_purchase_price).toBeCloseTo(102.0948, 4)
    expect(capture.payload?.avg_purchase_price).not.toBeCloseTo(94.81, 2)
  })

  it('behandelt PostgREST-string-NUMERIEK correct (units/price als string)', async () => {
    const txRows: Tx[] = [
      { type: 'buy', units: '10', price_per_unit: '10', total_amount: '100', date: '2024-01-01' },
      { type: 'buy', units: '10', price_per_unit: '20', total_amount: '200', date: '2024-02-01' },
    ]
    const capture: { payload?: Record<string, unknown> } = {}
    const supabase = makeHoldingSupabase(txRows, capture)

    const result = await syncHoldingAggregatesFromTransactions(supabase, TABLES, 'h-2', USER)

    expect(result.units).toBe(20)
    expect(result.avgPurchasePrice).toBeCloseTo(15, 6)
  })
})

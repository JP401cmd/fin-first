import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadHoldingsPnL,
  attachPnLToHoldings,
  type HoldingPnL,
} from './holdings-pnl-enrichment'

/**
 * loadHoldingsPnL is een data-loading-laag bovenop de canonieke aggregatie-
 * engine (computePositionFromTransactions + valuePosition). Deze tests pinnen
 * vast dat:
 *   - er ÉÉN batch-query op investment_transactions.holding_id wordt gedaan
 *     (geen N+1) en op user_id wordt gescoped;
 *   - transacties correct per holding worden gegroepeerd;
 *   - de engine-uitkomst (gerealiseerd/ongerealiseerd/totaal + %) klopt;
 *   - holdings zonder transacties NIET in de map verschijnen (UI valt terug op
 *     de units-kolom);
 *   - de /0-guard op totalPnLPct werkt;
 *   - een DB-fout een lege map oplevert (graceful fallback);
 *   - attachPnLToHoldings de pnl_*-velden additief op de rij hangt.
 */

type TxRow = {
  holding_id: string
  type: string
  units: number | string | null
  price_per_unit: number | string | null
  total_amount: number | string | null
  date: string | null
}

function mockSupabase(
  txRows: TxRow[] | null,
  error: unknown = null,
): { supabase: SupabaseClient; inSpy: ReturnType<typeof vi.fn>; eqSpy: ReturnType<typeof vi.fn> } {
  const eqSpy = vi.fn()
  const inSpy = vi.fn()
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  // .in(...) gevolgd door .eq(...); de laatste is awaitable (thenable).
  builder.in = inSpy.mockImplementation(() => builder)
  builder.eq = eqSpy.mockImplementation(() => builder)
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: txRows, error }).then(resolve)

  const from = vi.fn(() => builder)
  return { supabase: { from } as unknown as SupabaseClient, inSpy, eqSpy }
}

describe('loadHoldingsPnL', () => {
  it('geeft een lege map zonder holdings (en doet geen query)', async () => {
    const { supabase } = mockSupabase([])
    const map = await loadHoldingsPnL(supabase, [], 'user-1')
    expect(map.size).toBe(0)
    // from() wordt niet aangeroepen bij lege id-set.
    expect((supabase.from as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('doet ÉÉN batch-query op alle holding-ids, gescoped op user_id', async () => {
    const { supabase, inSpy, eqSpy } = mockSupabase([])
    await loadHoldingsPnL(
      supabase,
      [{ id: 'h1', current_price: 10 }, { id: 'h2', current_price: 20 }],
      'user-1',
    )
    expect((supabase.from as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
    expect(inSpy).toHaveBeenCalledWith('holding_id', ['h1', 'h2'])
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('gesloten positie: 10 kopen @10 + 10 verkopen @12 → totalPnL === realized = 20', async () => {
    const { supabase } = mockSupabase([
      { holding_id: 'h1', type: 'buy', units: 10, price_per_unit: 10, total_amount: 100, date: '2024-01-01' },
      { holding_id: 'h1', type: 'sell', units: 10, price_per_unit: 12, total_amount: 120, date: '2024-06-01' },
    ])
    const map = await loadHoldingsPnL(supabase, [{ id: 'h1', current_price: 12 }], 'user-1')
    const pnl = map.get('h1') as HoldingPnL
    expect(pnl.isClosed).toBe(true)
    expect(pnl.realizedPnL).toBeCloseTo(20, 6)
    expect(pnl.unrealizedPnL).toBeCloseTo(0, 6)
    expect(pnl.totalPnL).toBeCloseTo(20, 6) // gesloten → totaal === gerealiseerd
    expect(pnl.totalInvested).toBeCloseTo(100, 6)
    expect(pnl.totalPnLPct).toBeCloseTo(20, 6) // 20 / 100 × 100
  })

  it('open positie: ongerealiseerd telt mee in totalPnL', async () => {
    const { supabase } = mockSupabase([
      { holding_id: 'h1', type: 'buy', units: 10, price_per_unit: 10, total_amount: 100, date: '2024-01-01' },
      { holding_id: 'h1', type: 'sell', units: 5, price_per_unit: 15, total_amount: 75, date: '2024-06-01' },
    ])
    const map = await loadHoldingsPnL(supabase, [{ id: 'h1', current_price: 20 }], 'user-1')
    const pnl = map.get('h1') as HoldingPnL
    expect(pnl.isClosed).toBe(false)
    expect(pnl.realizedPnL).toBeCloseTo(25, 6) // 5×(15−10)
    expect(pnl.unrealizedPnL).toBeCloseTo(50, 6) // 5×(20−10)
    expect(pnl.totalPnL).toBeCloseTo(75, 6)
  })

  it('groepeert transacties per holding (twee holdings in één batch)', async () => {
    const { supabase } = mockSupabase([
      { holding_id: 'h1', type: 'buy', units: 1, price_per_unit: 100, total_amount: 100, date: '2024-01-01' },
      { holding_id: 'h2', type: 'buy', units: 2, price_per_unit: 50, total_amount: 100, date: '2024-01-01' },
      { holding_id: 'h2', type: 'sell', units: 2, price_per_unit: 60, total_amount: 120, date: '2024-02-01' },
    ])
    const map = await loadHoldingsPnL(
      supabase,
      [{ id: 'h1', current_price: 110 }, { id: 'h2', current_price: 60 }],
      'user-1',
    )
    expect(map.get('h1')?.isClosed).toBe(false)
    expect(map.get('h2')?.isClosed).toBe(true)
    expect(map.get('h2')?.realizedPnL).toBeCloseTo(20, 6) // 2×(60−50)
  })

  it('holding zonder transacties verschijnt NIET in de map', async () => {
    const { supabase } = mockSupabase([
      { holding_id: 'h1', type: 'buy', units: 1, price_per_unit: 100, total_amount: 100, date: '2024-01-01' },
    ])
    const map = await loadHoldingsPnL(
      supabase,
      [{ id: 'h1', current_price: 100 }, { id: 'h2', current_price: 5 }],
      'user-1',
    )
    expect(map.has('h1')).toBe(true)
    expect(map.has('h2')).toBe(false)
  })

  it('totalPnLPct = null bij 0 inleg (guard tegen /0)', async () => {
    // Alleen een dividend, geen aankoop → totalInvested 0.
    const { supabase } = mockSupabase([
      { holding_id: 'h1', type: 'dividend', units: 0, price_per_unit: 0, total_amount: 5, date: '2024-03-01' },
    ])
    const map = await loadHoldingsPnL(supabase, [{ id: 'h1', current_price: null }], 'user-1')
    const pnl = map.get('h1') as HoldingPnL
    expect(pnl.totalInvested).toBe(0)
    expect(pnl.totalPnLPct).toBeNull()
    expect(pnl.dividends).toBeCloseTo(5, 6)
  })

  it('geeft een lege map bij een DB-fout (graceful fallback)', async () => {
    const { supabase } = mockSupabase(null, { message: 'relation does not exist' })
    const map = await loadHoldingsPnL(supabase, [{ id: 'h1', current_price: 10 }], 'user-1')
    expect(map.size).toBe(0)
  })
})

describe('attachPnLToHoldings', () => {
  it('hangt pnl_*-velden additief op de rij; ontbrekende holding → null-velden', () => {
    const pnlMap = new Map<string, HoldingPnL>([
      [
        'h1',
        {
          totalPnL: 20,
          realizedPnL: 20,
          unrealizedPnL: 0,
          totalInvested: 100,
          dividends: 0,
          totalFees: 0,
          totalPnLPct: 20,
          isClosed: true,
        },
      ],
    ])
    const rows = [
      { id: 'h1', name: 'Closed', units: 0 },
      { id: 'h2', name: 'NoTx', units: 5 },
    ]
    const enriched = attachPnLToHoldings(rows, pnlMap)

    // Bestaande velden blijven intact (additief).
    expect(enriched[0].name).toBe('Closed')
    expect(enriched[0].units).toBe(0)
    // P&L-velden voor de holding mét transacties.
    expect(enriched[0].pnl_total).toBe(20)
    expect(enriched[0].pnl_realized).toBe(20)
    expect(enriched[0].pnl_total_pct).toBe(20)
    expect(enriched[0].pnl_is_closed).toBe(true)
    // Holding zonder transacties → alle pnl_*-velden null.
    expect(enriched[1].pnl_total).toBeNull()
    expect(enriched[1].pnl_is_closed).toBeNull()
  })
})

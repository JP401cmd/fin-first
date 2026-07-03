import { describe, it, expect } from 'vitest'
import { assetsWithActiveHoldings } from './holdings-sync'

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

import { describe, it, expect } from 'vitest'
import { hasBox2RelevanceFromRows, loadBox2Materiality } from './box2-relevance'
import { DGA_LENING_DREMPEL } from './box2-data'

/**
 * Twee gates, twee vragen (bevinding L8):
 *  · relevantie  = "bestaat er een Box 2-positie?"  → stuurt oppervlakken
 *  · materialiteit = "valt er iets te DOEN?"        → stuurt de statusbanner
 *
 * De banner mapte tot 26-08-2026 op relevantie, waardoor een DGA met een klein
 * belang en geen uitkering een "AANDACHT"-banner kreeg bij een heffing van €0.
 */

const USER = 'u1'
const PARTNER = 'u2'

describe('hasBox2RelevanceFromRows', () => {
  it('herkent een deelneming van de gebruiker', () => {
    expect(
      hasBox2RelevanceFromRows([{ asset_type: 'deelneming', user_id: USER }], [], USER),
    ).toBe(true)
  })

  it('herkent een DGA-vordering (vordering + subtype dga_lening)', () => {
    expect(
      hasBox2RelevanceFromRows(
        [{ asset_type: 'vordering', subtype: 'dga_lening', user_id: USER }],
        [],
        USER,
      ),
    ).toBe(true)
  })

  it('herkent een DGA-schuld', () => {
    expect(
      hasBox2RelevanceFromRows([], [{ debt_type: 'dga_schuld', user_id: USER }], USER),
    ).toBe(true)
  })

  it('een gewone vordering zonder dga_lening-subtype telt niet mee', () => {
    expect(
      hasBox2RelevanceFromRows(
        [{ asset_type: 'vordering', subtype: 'lening_particulier', user_id: USER }],
        [],
        USER,
      ),
    ).toBe(false)
  })

  it('rijen van de partner tellen niet mee (user-scoped, net als de DB-gate)', () => {
    expect(
      hasBox2RelevanceFromRows(
        [{ asset_type: 'deelneming', user_id: PARTNER }],
        [{ debt_type: 'dga_schuld', user_id: PARTNER }],
        USER,
      ),
    ).toBe(false)
  })

  it('geen userId (niet ingelogd) → false', () => {
    expect(
      hasBox2RelevanceFromRows([{ asset_type: 'deelneming', user_id: USER }], [], null),
    ).toBe(false)
  })

  it('lege set → false', () => {
    expect(hasBox2RelevanceFromRows([], [], USER)).toBe(false)
  })
})

/**
 * Minimale fake-Supabase voor `loadBox2Materiality`. De loader doet drie
 * gefilterde selects; we routeren op de meegegeven filters i.p.v. op volgorde,
 * zodat de test niet breekt als de Promise.all-volgorde verandert.
 */
function makeSupabase(rows: {
  deelnemingen?: { annual_dividend: number | null }[]
  vorderingen?: { current_value: number }[]
  schulden?: { current_balance: number }[]
}) {
  const deelnemingen = rows.deelnemingen ?? []
  const vorderingen = rows.vorderingen ?? []
  const schulden = rows.schulden ?? []

  function assetBuilder() {
    const filters: Record<string, unknown> = {}
    const builder: Record<string, unknown> = {}
    // `eq` is chainable en de laatste schakel is awaitable (thenable).
    builder.select = () => builder
    builder.eq = (col: string, val: unknown) => {
      filters[col] = val
      return builder
    }
    builder.then = (resolve: (v: unknown) => unknown) => {
      const data =
        filters.asset_type === 'deelneming'
          ? deelnemingen
          : vorderingen.map((v) => ({ ...v, user_id: USER, ownership: 'personal' }))
      return Promise.resolve({ data, error: null }).then(resolve)
    }
    return builder
  }

  function debtBuilder() {
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = () => builder
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: schulden.map((s) => ({ ...s, user_id: USER, ownership: 'personal' })),
        error: null,
      }).then(resolve)
    return builder
  }

  return {
    from: (table: string) => (table === 'assets' ? assetBuilder() : debtBuilder()),
  } as never
}

describe('loadBox2Materiality', () => {
  it('geen enkele Box 2-positie → niet relevant en niet materieel', async () => {
    const r = await loadBox2Materiality(makeSupabase({}), USER)
    expect(r).toEqual({ relevant: false, material: false })
  })

  it('DE KERN VAN L8: een belang zonder uitkering is relevant maar NIET materieel', async () => {
    const r = await loadBox2Materiality(
      makeSupabase({ deelnemingen: [{ annual_dividend: 0 }] }),
      USER,
    )
    expect(r.relevant).toBe(true)
    expect(r.material).toBe(false)
  })

  it('een niet-ingevuld dividend (NULL) is evenmin materieel', async () => {
    // NULL ≠ 0 in de motor, maar levert nog steeds geen heffing → geen banner.
    const r = await loadBox2Materiality(
      makeSupabase({ deelnemingen: [{ annual_dividend: null }] }),
      USER,
    )
    expect(r.relevant).toBe(true)
    expect(r.material).toBe(false)
  })

  it('een symbolische DGA-lening ver onder de drempel is niet materieel', async () => {
    // Het gemelde scenario: €200 van €500.000 benut.
    const r = await loadBox2Materiality(
      makeSupabase({ deelnemingen: [{ annual_dividend: 0 }], schulden: [{ current_balance: 200 }] }),
      USER,
    )
    expect(r.material).toBe(false)
  })

  it('dividend boven nul is wél materieel', async () => {
    const r = await loadBox2Materiality(
      makeSupabase({ deelnemingen: [{ annual_dividend: 20_000 }] }),
      USER,
    )
    expect(r.material).toBe(true)
  })

  it('een DGA-lening boven de €500.000-drempel is materieel', async () => {
    const r = await loadBox2Materiality(
      makeSupabase({ schulden: [{ current_balance: DGA_LENING_DREMPEL + 50_000 }] }),
      USER,
    )
    expect(r.relevant).toBe(true)
    expect(r.material).toBe(true)
  })

  it('exact óp de drempel is nog geen bovenmatig deel → niet materieel', async () => {
    const r = await loadBox2Materiality(
      makeSupabase({ schulden: [{ current_balance: DGA_LENING_DREMPEL }] }),
      USER,
    )
    expect(r.material).toBe(false)
  })

  it('vordering en schuld tellen OP richting de drempel (Wet excessief lenen, optie B)', async () => {
    const r = await loadBox2Materiality(
      makeSupabase({
        vorderingen: [{ current_value: 300_000 }],
        schulden: [{ current_balance: 250_000 }],
      }),
      USER,
    )
    // 300k + 250k = 550k > 500k → bovenmatig deel → heffing.
    expect(r.material).toBe(true)
  })
})

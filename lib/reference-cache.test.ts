import { describe, it, expect, beforeEach } from 'vitest'
import {
  getAowLeeftijden,
  getNibudReferenceRows,
  _clearReferenceCacheForTests,
} from './reference-cache'

/**
 * Task 1.7 — module-level TTL-cache voor statische referentiedata (AOW + NIBUD).
 *
 * Deze suite bewaakt het cache-contract zelf (query-dedup binnen TTL, reset via
 * `_clearReferenceCacheForTests`, geen cache-vulling bij een fout) — los van de
 * kolomprojectie die elke call-site zelf doet.
 */

// ── Generieke thenable query-builder mock ───────────────────────────────────
// Ondersteunt willekeurige chains (.select().eq().order() etc.) door telkens
// zichzelf terug te geven; `then` levert het opgegeven { data, error }-resultaat.
function makeQueryBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.select = chain
  builder.eq = chain
  builder.order = chain
  builder.limit = chain
  builder.then = (
    onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return builder
}

type TableResponder = () => { data: unknown; error: unknown }

function makeSupabaseMock(responders: Record<string, TableResponder>) {
  const callCounts: Record<string, number> = {}
  const supabase = {
    from(table: string) {
      callCounts[table] = (callCounts[table] ?? 0) + 1
      const responder = responders[table]
      const result = responder ? responder() : { data: [], error: null }
      return makeQueryBuilder(result)
    },
  }
  return { supabase, callCounts }
}

const AOW_ROWS = [
  {
    id: '02',
    birth_date_from: '1957-03-01',
    birth_date_through: '1960-12-31',
    aow_years: 67,
    aow_months: 0,
    is_definitive: true,
    source: 'SVB 2026',
  },
]

const NIBUD_ROWS = [
  {
    nibud_category_key: 'boodschappen',
    nibud_category_name: 'Boodschappen',
    basis_amount: 300,
    voorbeeld_amount: 350,
    mapped_budget_slug: 'boodschappen',
  },
]

describe('reference-cache — getAowLeeftijden', () => {
  beforeEach(() => {
    _clearReferenceCacheForTests()
  })

  it('doet exact één query bij de eerste call', async () => {
    const { supabase, callCounts } = makeSupabaseMock({
      aow_leeftijd: () => ({ data: AOW_ROWS, error: null }),
    })

    const rows = await getAowLeeftijden(supabase as never)

    expect(rows).toEqual(AOW_ROWS)
    expect(callCounts.aow_leeftijd).toBe(1)
  })

  it('doet nul queries bij een tweede call binnen de TTL en geeft dezelfde referentie terug', async () => {
    const { supabase, callCounts } = makeSupabaseMock({
      aow_leeftijd: () => ({ data: AOW_ROWS, error: null }),
    })

    const first = await getAowLeeftijden(supabase as never)
    const second = await getAowLeeftijden(supabase as never)

    expect(callCounts.aow_leeftijd).toBe(1)
    expect(second).toBe(first)
  })

  it('na _clearReferenceCacheForTests() volgt weer een query', async () => {
    const { supabase, callCounts } = makeSupabaseMock({
      aow_leeftijd: () => ({ data: AOW_ROWS, error: null }),
    })

    await getAowLeeftijden(supabase as never)
    _clearReferenceCacheForTests()
    await getAowLeeftijden(supabase as never)

    expect(callCounts.aow_leeftijd).toBe(2)
  })

  it('foutpad: query-error vult de cache niet — de volgende call probeert opnieuw', async () => {
    let attempt = 0
    const { supabase, callCounts } = makeSupabaseMock({
      aow_leeftijd: () => {
        attempt += 1
        if (attempt === 1) return { data: null, error: { message: 'boom', code: 'PGRST000' } }
        return { data: AOW_ROWS, error: null }
      },
    })

    await expect(getAowLeeftijden(supabase as never)).rejects.toBeTruthy()
    expect(callCounts.aow_leeftijd).toBe(1)

    const rows = await getAowLeeftijden(supabase as never)
    expect(rows).toEqual(AOW_ROWS)
    expect(callCounts.aow_leeftijd).toBe(2)
  })
})

describe('reference-cache — getNibudReferenceRows', () => {
  beforeEach(() => {
    _clearReferenceCacheForTests()
  })

  it('doet exact één query bij de eerste call', async () => {
    const { supabase, callCounts } = makeSupabaseMock({
      nibud_reference_data: () => ({ data: NIBUD_ROWS, error: null }),
    })

    const rows = await getNibudReferenceRows(supabase as never, 'alleenstaand', 2026)

    expect(rows).toEqual(NIBUD_ROWS)
    expect(callCounts.nibud_reference_data).toBe(1)
  })

  it('doet nul queries bij een tweede call binnen de TTL voor dezelfde sleutel', async () => {
    const { supabase, callCounts } = makeSupabaseMock({
      nibud_reference_data: () => ({ data: NIBUD_ROWS, error: null }),
    })

    const first = await getNibudReferenceRows(supabase as never, 'alleenstaand', 2026)
    const second = await getNibudReferenceRows(supabase as never, 'alleenstaand', 2026)

    expect(callCounts.nibud_reference_data).toBe(1)
    expect(second).toBe(first)
  })

  it('een andere householdType/jaar-combinatie is een eigen cache-sleutel (nieuwe query)', async () => {
    const { supabase, callCounts } = makeSupabaseMock({
      nibud_reference_data: () => ({ data: NIBUD_ROWS, error: null }),
    })

    await getNibudReferenceRows(supabase as never, 'alleenstaand', 2026)
    await getNibudReferenceRows(supabase as never, 'paar', 2026)
    await getNibudReferenceRows(supabase as never, 'alleenstaand', 2025)

    expect(callCounts.nibud_reference_data).toBe(3)
  })

  it('na _clearReferenceCacheForTests() volgt weer een query', async () => {
    const { supabase, callCounts } = makeSupabaseMock({
      nibud_reference_data: () => ({ data: NIBUD_ROWS, error: null }),
    })

    await getNibudReferenceRows(supabase as never, 'alleenstaand', 2026)
    _clearReferenceCacheForTests()
    await getNibudReferenceRows(supabase as never, 'alleenstaand', 2026)

    expect(callCounts.nibud_reference_data).toBe(2)
  })

  it('foutpad: query-error vult de cache niet — de volgende call probeert opnieuw', async () => {
    let attempt = 0
    const { supabase, callCounts } = makeSupabaseMock({
      nibud_reference_data: () => {
        attempt += 1
        if (attempt === 1) return { data: null, error: { message: 'boom', code: 'PGRST000' } }
        return { data: NIBUD_ROWS, error: null }
      },
    })

    await expect(getNibudReferenceRows(supabase as never, 'alleenstaand', 2026)).rejects.toBeTruthy()
    expect(callCounts.nibud_reference_data).toBe(1)

    const rows = await getNibudReferenceRows(supabase as never, 'alleenstaand', 2026)
    expect(rows).toEqual(NIBUD_ROWS)
    expect(callCounts.nibud_reference_data).toBe(2)
  })
})

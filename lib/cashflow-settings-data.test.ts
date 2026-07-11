import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadParameterSavingsRateTarget } from './cashflow-settings-data'

/**
 * Tests voor `loadParameterSavingsRateTarget` — het leespad van het spaarquote-doel
 * uit de goals-bron (ronde 4, besluit 3). Borgt:
 *   - een parameter-savings_rate-rij WINT (levert het doel-%);
 *   - geen rij → `null` (caller valt terug op de profielkolom);
 *   - een DB-fout (bv. `metadata`-kolom ontbreekt op legacy-DB) → `null` (fallback);
 *   - een niet-eindige `target_value` → `null` (geen rommel doorgeven).
 *
 * De Supabase-mock is een chainbare query-builder; `maybeSingle` resolt het
 * geconfigureerde `(data, error)`-paar. Zo verifiëren we ook de kolom-scoped filters.
 */

type QueryResult = { data: unknown; error: unknown }

function makeSupabase(result: QueryResult): {
  supabase: SupabaseClient
  filters: Array<[string, unknown]>
  state: { selected: string | null }
} {
  const filters: Array<[string, unknown]> = []
  const state = { selected: null as string | null }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: (cols: string) => {
      state.selected = cols
      return builder
    },
    eq: (col: string, val: unknown) => {
      filters.push([col, val])
      return builder
    },
    limit: () => builder,
    maybeSingle: () => Promise.resolve(result),
  }
  const supabase = {
    from: vi.fn(() => builder),
  } as unknown as SupabaseClient
  return { supabase, filters, state }
}

describe('loadParameterSavingsRateTarget', () => {
  it('goals-rij wint: levert het doel-% uit de parameter-savings_rate-rij', async () => {
    const { supabase, filters, state } = makeSupabase({ data: { target_value: 42 }, error: null })
    const v = await loadParameterSavingsRateTarget(supabase, 'user-1')
    expect(v).toBe(42)
    // Kolom-scoped: exact de vier verwachte filters (user, type, bron, niet-afgerond).
    expect(filters).toEqual([
      ['user_id', 'user-1'],
      ['goal_type', 'savings_rate'],
      ['metadata->>bron', 'parameter'],
      ['is_completed', false],
    ])
    expect(state.selected).toBe('target_value')
  })

  it('geen rij → null (caller valt terug op de profielkolom)', async () => {
    const { supabase } = makeSupabase({ data: null, error: null })
    expect(await loadParameterSavingsRateTarget(supabase, 'user-1')).toBeNull()
  })

  it('DB-fout (bv. metadata-kolom ontbreekt) → null (tolerante fallback)', async () => {
    const { supabase } = makeSupabase({ data: null, error: { code: '42703' } })
    expect(await loadParameterSavingsRateTarget(supabase, 'user-1')).toBeNull()
  })

  it('niet-eindige target_value → null (geen rommel doorgeven)', async () => {
    const { supabase } = makeSupabase({ data: { target_value: 'abc' }, error: null })
    expect(await loadParameterSavingsRateTarget(supabase, 'user-1')).toBeNull()
  })
})

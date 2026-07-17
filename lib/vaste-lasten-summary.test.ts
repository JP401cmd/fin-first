import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadVasteLastenSummary } from './vaste-lasten-summary'

/**
 * Borgt de één-bron-van-waarheid die de Vaste-Lasten-widget consumeert.
 * De dashboard-bundel voedt `totalRecurringAmount` (== totalMonthly) en de count
 * (== count) rechtstreeks uit deze summary; widget-totaal == paginatotaal staat
 * of valt dus met dit contract:
 *  - alleen uitgaven (amount < 0) tellen mee — recurring INKOMEN niet;
 *  - als 'excluded' gemarkeerde items tellen niet mee.
 */

type RecurringRow = {
  id: string
  counterparty_name: string | null
  amount: number
  name: string
  frequency: string
  category_override: string | null
}

// Minimal thenable query-builder mock. Met < 3 transacties slaat de summary de
// auto-detectie over en werkt puur op de confirmed recurring-rijen (deterministisch).
function makeSupabase(recurrings: RecurringRow[]): SupabaseClient {
  const tables: Record<string, unknown[]> = {
    transactions: [],
    recurring_transactions: recurrings,
    budgets: [],
  }
  const builder = (rows: unknown[]) => {
    const b: Record<string, unknown> = {
      select: () => b,
      gte: () => b,
      order: () => b,
      eq: () => b,
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: rows, error: null }),
    }
    return b
  }
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => builder(tables[table] ?? []),
  } as unknown as SupabaseClient
}

describe('loadVasteLastenSummary — bundel/widget-contract', () => {
  it('telt alleen uitgaven; recurring inkomen en excluded tellen niet mee', async () => {
    const supabase = makeSupabase([
      { id: 'r1', counterparty_name: 'Verhuurder', amount: -100, name: 'Huur', frequency: 'monthly', category_override: 'vaste_kosten' },
      { id: 'r2', counterparty_name: 'Werkgever', amount: 2500, name: 'Salaris', frequency: 'monthly', category_override: null },
      { id: 'r3', counterparty_name: 'Oud', amount: -50, name: 'Opgezegd', frequency: 'monthly', category_override: 'excluded' },
      { id: 'r4', counterparty_name: 'Netflix', amount: -14, name: 'Netflix', frequency: 'monthly', category_override: 'subscription' },
    ])

    const summary = await loadVasteLastenSummary(supabase)

    // Inkomen (2500) en excluded (50) zijn uitgesloten → 100 + 14.
    expect(summary.totalMonthly).toBe(114)
    expect(summary.count).toBe(2)
    expect(summary.totalMonthlySubscriptions).toBe(14)
    expect(summary.totalMonthlyVasteKosten).toBe(100)
  })

  it('normaliseert frequenties naar maandbedrag', async () => {
    const supabase = makeSupabase([
      { id: 'r1', counterparty_name: 'Verzekeraar', amount: -1200, name: 'Jaarpolis', frequency: 'yearly', category_override: 'vaste_kosten' },
    ])
    const summary = await loadVasteLastenSummary(supabase)
    expect(summary.totalMonthly).toBe(100)
    expect(summary.count).toBe(1)
  })
})

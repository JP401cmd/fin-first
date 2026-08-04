import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { __resetVasteLastenCache } from '@/lib/vaste-lasten-cache'
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
  end_date?: string | null
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
      // De keyset-paginatie (fetchAllRecurringTx) eindigt de keten op .limit();
      // één pagina met de volledige rijenset is genoeg voor deze deterministische
      // mock, want `transactions` is hier leeg en de lus stopt na de eerste ronde.
      // De cursor-`.or()` komt dus niet langs. Voor een échte
      // paginatie-/volgorde-getuige: lib/vaste-lasten-summary.keyset.test.ts.
      limit: () => b,
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
  // De vaste-lastencache (T3.3) leeft op moduleniveau en overleeft dus een `it`.
  // Elke test hoort de loader écht te draaien, niet de vorige uitkomst te lezen.
  beforeEach(() => __resetVasteLastenCache())

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

  it('sluit een actieve regel met verstreken einddatum uit (regressie: bonus finding UAT §2.7 A.9)', async () => {
    const supabase = makeSupabase([
      { id: 'r1', counterparty_name: 'Verhuurder', amount: -100, name: 'Huur', frequency: 'monthly', category_override: 'vaste_kosten', end_date: null },
      // Verlopen tijdelijk abonnement: is_active blijft true, einddatum ver in het verleden.
      { id: 'r2', counterparty_name: 'Sportschool', amount: -40, name: 'Tijdelijk lidmaatschap', frequency: 'monthly', category_override: 'vaste_kosten', end_date: '2020-01-01' },
    ])
    const summary = await loadVasteLastenSummary(supabase)
    // Alleen de lopende huur (100) telt mee; het verlopen lidmaatschap (40) niet.
    expect(summary.totalMonthly).toBe(100)
    expect(summary.count).toBe(1)
  })

  it('einddatum ver in de toekomst blijft meetellen', async () => {
    const supabase = makeSupabase([
      { id: 'r1', counterparty_name: 'Verzekeraar', amount: -50, name: 'Polis', frequency: 'monthly', category_override: 'vaste_kosten', end_date: '2099-12-31' },
    ])
    const summary = await loadVasteLastenSummary(supabase)
    expect(summary.totalMonthly).toBe(50)
    expect(summary.count).toBe(1)
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

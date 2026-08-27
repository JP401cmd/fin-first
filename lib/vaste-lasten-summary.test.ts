import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { __resetVasteLastenCache } from '@/lib/vaste-lasten-cache'
import { loadVasteLastenSummary, isTerugkerendVariabel } from './vaste-lasten-summary'

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
      // De vingerafdrukronde telt apart hoeveel rijen als overboeking zijn
      // gemarkeerd (`.in('transaction_type', …)`); passthrough volstaat hier,
      // want deze mock levert toch nul transacties.
      in: () => b,
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

/**
 * H14 — TERUGKEREND, MAAR VARIABEL.
 *
 * Het defect: onherkende terugkerende uitgaven (supermarkt, tanken, horeca,
 * winkelen) vielen door `detectCategory` heen naar `other_expense` en telden
 * daarna ONVOORWAARDELIJK als vaste last — quote 58% waar 43% klopt, mét een
 * "Aandacht"-banner die naar de verkeerde post wees.
 *
 * De belangrijkste test hieronder is de SPIEGELFOUT-test: een echte vaste last
 * met onherkende tegenpartij (particuliere verhuurder) moet in de quote BLIJVEN.
 * Te veel eruit filteren geeft een vals "gezond", en een te lage quote alarmeert
 * niet — dat faalpad is gevaarlijker dan het defect zelf.
 */
describe('isTerugkerendVariabel — de frequentie-snede + variabele tegenpartijen', () => {
  const item = (over: Partial<Parameters<typeof isTerugkerendVariabel>[0]>) => ({
    name: 'Onbekend',
    category: 'other_expense' as const,
    frequency: 'monthly' as const,
    categoryOverride: null,
    ...over,
  })

  it('wekelijkse onherkende uitgave is variabel (de structurele regel)', () => {
    expect(isTerugkerendVariabel(item({ name: 'Albert Heijn', frequency: 'weekly' }))).toBe(true)
    // Ook zonder herkenbare naam: de frequentie alleen is genoeg.
    expect(isTerugkerendVariabel(item({ name: 'Kassa 4 Utrecht', frequency: 'weekly' }))).toBe(true)
  })

  it('maandelijkse winkel/tank/horeca is variabel (de aanvulling)', () => {
    for (const naam of ['Shell Amsterdam', 'H&M', 'Restaurant De Kade', 'Action 1234', 'Jumbo']) {
      expect(isTerugkerendVariabel(item({ name: naam }))).toBe(true)
    }
  })

  it('SPIEGELFOUT: onherkende maandpost blijft een vaste last', () => {
    // Een particuliere verhuurder, alimentatie of boekhouder wordt door geen
    // enkel patroon herkend en rekent maandelijks af — die MOET in de quote
    // blijven staan, anders liegt de app "gezond".
    expect(isTerugkerendVariabel(item({ name: 'J. Jansen' }))).toBe(false)
    expect(isTerugkerendVariabel(item({ name: 'Boekhouder Van Dijk' }))).toBe(false)
    expect(isTerugkerendVariabel(item({ name: 'Alimentatie' }))).toBe(false)
  })

  it('een herkende categorie wordt nooit alsnog variabel', () => {
    expect(isTerugkerendVariabel(item({ category: 'rent', frequency: 'weekly' }))).toBe(false)
    expect(isTerugkerendVariabel(item({ category: 'utility', name: 'Shell Energie' }))).toBe(false)
  })

  it('de gebruiker wint altijd: een expliciete override overrulet beide signalen', () => {
    expect(
      isTerugkerendVariabel(
        item({ name: 'Albert Heijn', frequency: 'weekly', categoryOverride: 'vaste_kosten' }),
      ),
    ).toBe(false)
    expect(
      isTerugkerendVariabel(item({ name: 'Picnic', categoryOverride: 'subscription' })),
    ).toBe(false)
  })
})

describe('loadVasteLastenSummary — variabele groep buiten het totaal', () => {
  beforeEach(() => __resetVasteLastenCache())

  it('houdt een wekelijkse supermarkt buiten de quote maar toont hem wel', async () => {
    const supabase = makeSupabase([
      { id: 'r1', counterparty_name: 'Verhuurder BV', amount: -900, name: 'Huur', frequency: 'monthly', category_override: 'vaste_kosten' },
      // €125/week → €541,67/mnd; hoorde nooit in een vaste-lastenquote.
      { id: 'r2', counterparty_name: 'Albert Heijn', amount: -125, name: 'Albert Heijn', frequency: 'weekly', category_override: null },
    ])
    const summary = await loadVasteLastenSummary(supabase)

    expect(summary.totalMonthly).toBe(900)
    expect(summary.count).toBe(1)
    expect(summary.terugkerendVariabel.map((i) => i.name)).toEqual(['Albert Heijn'])
    expect(summary.totalMonthlyVariabel).toBeCloseTo(541.67, 2)
    // De variabele groep zit NIET in het totaal — dat is de hele fix.
    expect(summary.totalMonthly).not.toBeCloseTo(1441.67, 2)
  })

  it('SPIEGELFOUT: onherkende maandpost blijft in het totaal', async () => {
    const supabase = makeSupabase([
      { id: 'r1', counterparty_name: 'J. Jansen', amount: -750, name: 'J. Jansen', frequency: 'monthly', category_override: null },
    ])
    const summary = await loadVasteLastenSummary(supabase)
    expect(summary.totalMonthly).toBe(750)
    expect(summary.terugkerendVariabel).toHaveLength(0)
  })

  it('een als vaste kost bevestigde supermarkt telt gewoon mee', async () => {
    const supabase = makeSupabase([
      { id: 'r1', counterparty_name: 'Albert Heijn', amount: -100, name: 'Albert Heijn', frequency: 'monthly', category_override: 'vaste_kosten' },
    ])
    const summary = await loadVasteLastenSummary(supabase)
    expect(summary.totalMonthly).toBe(100)
    expect(summary.terugkerendVariabel).toHaveLength(0)
  })
})

/**
 * ACCOUNTCOUNT ZONDER DE VOLLE LOADER (T1.7).
 *
 * /overzicht/budget/transacties draaide `loadCashflowData` — perspectief-keten,
 * 6 maanden transactiepaginatie, recurring-detectie en een naam-decoratie per
 * getoonde feed-rij — om er precies één integer uit te lezen: `accountCount`,
 * voor de koppel-banner.
 * `loadAccountCount` haalt datzelfde getal met één count-query op.
 *
 * De correctheidskern is de SCOPING, niet de snelheid. Daarom twee lagen:
 *
 *  1. **Filterkeuze per perspectief**: welke query gaat er precies de deur uit —
 *     tabel, count-vorm en de `.eq()`-filters, per perspectief. Dit is de test
 *     die bijt als iemand het partner-filter laat vallen (of het juist bij
 *     personal/household toevoegt).
 *  2. **Gedragspin tegen de echte loader**: dezelfde fixture door ZOWEL
 *     `loadCashflowData` (in-memory scoping) ALS `loadAccountCount` (SQL-scoping),
 *     via één mock-client die `.eq()`-filters daadwerkelijk toepast. De twee
 *     paden moeten in alle drie de perspectieven hetzelfde getal geven — dat is
 *     het bewijs dat de banner niets anders toont dan voorheen.
 *
 * React `cache()` is buiten een RSC-render een passthrough (zie
 * lib/supabase/cached-user.dedupe.test.ts), dus de echte loader is hier gewoon
 * aanroepbaar.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perspective } from '@/lib/household-data'

const { mockLoadPerspectiveTransactionsServer } = vi.hoisted(() => ({
  mockLoadPerspectiveTransactionsServer: vi.fn(),
}))

// De transactie-as van loadCashflowData is hier niet in beeld: de bankrekening-
// scoping loopt volledig langs de perspectief-loader heen. Stub 'm, zodat deze
// test puur over `accountCount` gaat.
vi.mock('@/lib/household/perspective-loader-server', () => ({
  loadPerspectiveTransactionsServer: mockLoadPerspectiveTransactionsServer,
}))

import { loadAccountCount } from './account-count'
import { loadCashflowData } from './cashflow-data-loader'

// ── Fixture ────────────────────────────────────────────────────
// Wat RLS voor deze gebruiker oplevert: eigen-persoonlijk + gedeeld van het
// huishouden. Inclusief één inactieve rekening (mag nooit meetellen) en één
// gedeelde rekening op naam van de partner (telt in élk perspectief mee).
const BANK_ACCOUNTS = [
  { id: 'a1', name: 'Eigen betaalrekening', balance: 1000, ownership: 'personal', user_id: 'me', is_active: true },
  { id: 'a2', name: 'Gedeelde huishoudrekening', balance: 2000, ownership: 'shared', user_id: 'me', is_active: true },
  { id: 'a3', name: 'Gedeelde spaarrekening', balance: 3000, ownership: 'shared', user_id: 'partner', is_active: true },
  { id: 'a4', name: 'Opgeheven rekening', balance: 40, ownership: 'personal', user_id: 'me', is_active: false },
]

const PERSPECTIVES: Perspective[] = ['personal', 'household', 'partner']

/**
 * Mock-client die `.eq()`-filters ECHT toepast op een fixture-tabel en zowel de
 * rijen-vorm als de `head: true`-count-vorm kan beantwoorden. Registreert per
 * query wat eruit ging, zodat de filterkeuze los te inspecteren is.
 */
function makeClient(tables: Record<string, Record<string, unknown>[]> = { bank_accounts: BANK_ACCOUNTS }) {
  const queries: Array<{
    table: string
    columns: string | null
    options: Record<string, unknown> | null
    filters: Array<[string, unknown]>
  }> = []

  function builder(table: string) {
    const record = {
      table,
      columns: null as string | null,
      options: null as Record<string, unknown> | null,
      filters: [] as Array<[string, unknown]>,
    }
    queries.push(record)

    const rows = () =>
      (tables[table] ?? []).filter((r) => record.filters.every(([col, val]) => r[col] === val))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: (columns: string, options?: Record<string, unknown>) => {
        record.columns = columns
        record.options = options ?? null
        return b
      },
      eq: (col: string, val: unknown) => {
        record.filters.push([col, val])
        return b
      },
      gte: () => b,
      lte: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      // `loadCashflowData` leest de profielrij via de gedeelde basisdata-laag
      // (`getOwnProfile` → `.single()`). Zonder fixture-rij is `data` null —
      // dezelfde vorm die PostgREST bij nul rijen teruggeeft, en precies wat de
      // loader met `?? null` afvangt.
      single: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown; count?: number; error: null }) => unknown) => {
        const matched = rows()
        return Promise.resolve(
          resolve(
            record.options?.head === true
              ? { data: null, count: matched.length, error: null }
              : { data: matched, error: null },
          ),
        )
      },
    }
    return b
  }

  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'me' } }, error: null }) },
    from: (table: string) => builder(table),
    rpc: () => Promise.resolve({ data: [], error: null }),
  } as unknown as SupabaseClient

  return { supabase, queries }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadPerspectiveTransactionsServer.mockImplementation(async (
    _supabase: SupabaseClient,
    perspective: Perspective,
  ) => ({
    perspective,
    context: {
      userId: 'me',
      hasHousehold: true,
      householdId: 'h1',
      partnerId: 'partner',
      partnerName: 'Partner',
      splitMode: 'equal',
      customSplitPct: null,
      primaryPayerId: null,
      mySharePct: 50,
      partnerPrivacy: null,
      budgetModel: 'separate',
    },
    transactions: [],
    partnerMonthlyIncome: null,
  }))
})

describe('loadAccountCount — filterkeuze per perspectief', () => {
  it.each([
    { perspective: 'personal' as const, expectedFilters: [['is_active', true]] },
    { perspective: 'household' as const, expectedFilters: [['is_active', true]] },
    {
      perspective: 'partner' as const,
      expectedFilters: [
        ['is_active', true],
        ['ownership', 'shared'],
      ],
    },
  ])('$perspective stuurt exact de verwachte query', async ({ perspective, expectedFilters }) => {
    const { supabase, queries } = makeClient()
    await loadAccountCount(supabase, perspective)

    expect(queries).toHaveLength(1)
    const [q] = queries
    expect(q.table).toBe('bank_accounts')
    // Count-only: één kolom, geen rijen over de lijn.
    expect(q.columns).toBe('id')
    expect(q.options).toEqual({ count: 'exact', head: true })
    expect(q.filters).toEqual(expectedFilters)
  })

  it('default-perspectief is personal (geen ownership-filter)', async () => {
    const { supabase, queries } = makeClient()
    await loadAccountCount(supabase)
    expect(queries[0].filters).toEqual([['is_active', true]])
  })
})

/**
 * Een client waarvan de count-query een DB-fout teruggeeft. `.eq()` is
 * thenable, net als in `makeClient`, zodat de keten met of zonder
 * ownership-filter in beide perspectieven op dezelfde fout uitkomt.
 */
function failingClient(): SupabaseClient {
  const failing = {
    eq: () => failing,
    then: (resolve: (v: { count: null; error: { message: string } }) => unknown) =>
      Promise.resolve(resolve({ count: null, error: { message: 'boom' } })),
  }
  return {
    from: () => ({ select: () => failing }),
  } as unknown as SupabaseClient
}

describe('loadAccountCount — uitkomst', () => {
  it.each([
    { perspective: 'personal' as const, expected: 3 },
    { perspective: 'household' as const, expected: 3 },
    // Partner ziet alleen de gedeelde rekeningen (a2 + a3), niet de eigen-
    // persoonlijke a1 — en nooit de inactieve a4.
    { perspective: 'partner' as const, expected: 2 },
  ])('telt in $perspective $expected rekeningen', async ({ perspective, expected }) => {
    const { supabase } = makeClient()
    expect(await loadAccountCount(supabase, perspective)).toBe(expected)
  })

  it('telt 0 als er geen rekeningen zichtbaar zijn', async () => {
    const { supabase } = makeClient({ bank_accounts: [] })
    expect(await loadAccountCount(supabase, 'personal')).toBe(0)
  })

  it('valt bij een query-fout terug op 0 (zoals de data ?? []-terugval van de loader)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await loadAccountCount(failingClient(), 'personal')).toBe(0)
    } finally {
      spy.mockRestore()
    }
  })
})

// ── Faalgedrag ─────────────────────────────────────────────────

/**
 * De 0-terugval hierboven is pariteit met de oude loader en blijft, maar 0 is
 * op deze pagina niet neutraal: het toont "koppel je rekening" aan iemand die
 * er wél heeft. Sinds de omzetting is dit het ENIGE serverwerk op
 * /overzicht/budget/transacties — er is geen tweede query meer die de storing
 * zou verraden. Dus moet hij in de logs vindbaar zijn, en nergens anders.
 */
describe('loadAccountCount — een gefaalde telling is luidruchtig, niet stil', () => {
  it('logt server-side met een grep-bare tag', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await loadAccountCount(failingClient(), 'partner')

      expect(spy).toHaveBeenCalledTimes(1)
      const [melding] = spy.mock.calls[0]
      expect(String(melding)).toContain('[cashflow:account-count]')
      // Het perspectief hoort erbij: de scoping verschilt per perspectief, dus
      // zonder dat is de melding niet terug te leiden naar de query die faalde.
      expect(String(melding)).toContain('partner')
    } finally {
      spy.mockRestore()
    }
  })

  it('zwijgt op het geslaagde pad', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { supabase } = makeClient()
      await loadAccountCount(supabase, 'personal')
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('loadAccountCount — gedragspin tegen loadCashflowData', () => {
  it.each(PERSPECTIVES)(
    'geeft in %s exact hetzelfde getal als de volle loader',
    async (perspective) => {
      // Aparte clients: loadCashflowData is React-cache()-gewrapt en keyt op de
      // client-identiteit, dus per aanroep een verse instantie.
      const viaLoader = makeClient()
      const viaCount = makeClient()

      const loaderCount = (await loadCashflowData(viaLoader.supabase, perspective)).accountCount
      const helperCount = await loadAccountCount(viaCount.supabase, perspective)

      expect(helperCount).toBe(loaderCount)
    },
  )

  it('scheelt op deze pagina alle overige queries van de bundel', async () => {
    const viaLoader = makeClient()
    const viaCount = makeClient()

    await loadCashflowData(viaLoader.supabase, 'personal')
    await loadAccountCount(viaCount.supabase, 'personal')

    // De loader raakt bank_accounts plus profiles en recurring_transactions
    // (de feed-decoratie blijft hier uit: de gestubde perspectief-set is leeg);
    // de helper precies één tabel.
    expect(viaLoader.queries.length).toBeGreaterThan(1)
    expect(viaCount.queries.map((q) => q.table)).toEqual(['bank_accounts'])
  })
})

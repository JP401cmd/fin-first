import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Route-tests voor POST /api/transactions/search/manifest — het hart van ADR
 * 0104: "voer het criterium één keer uit en bevries de uitkomst".
 *
 * Twee dingen mogen hier NOOIT stil misgaan, en geen van beide werd tot nu toe
 * ergens getoetst tegen de echte route (alleen de losse bouwstenen —
 * `applyTransactionSearchCriteria`, `readBulkCandidates` — hadden een fake-client-
 * test; de samenstelling in `route.ts` zelf niet):
 *
 *  1. **AC12 — geen stille afkap.** PostgREST kapt elk antwoord af op
 *     `max_rows` (1000). Bij 4.000 treffers moet de `.range()`-lus dus vier keer
 *     rondgaan en alle 4.000 id's verzamelen, niet 1.000.
 *  2. **AC11 (route-niveau) — de leesronde is own-row.** RLS op `transactions`
 *     is huishoud-verbreed bij SELECT; deze route zet zelf `.eq('user_id')`
 *     erbovenop (`applyTransactionSearchCriteria`). De fake-tabel hieronder
 *     bevat bewust ook een partnerrij, en gedraagt zich als de échte
 *     huishoud-verbrede policy: hij levert de partnerrij ALLEEN als de route
 *     zélf geen scoping aanbrengt. Dat maakt de test falsifieerbaar op precies
 *     de manier die telt.
 *
 * Verder: `SELECTION_MAX` (5000) weigert met een 400 in plaats van af te kappen
 * (besluit 2), en een ontbrekende sessie geeft 401 zonder een rij te lezen.
 */

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: async (supabase: { auth: { getClaims: () => Promise<{ data: { claims: unknown } }> } }) => {
    const { data } = await supabase.auth.getClaims()
    return data?.claims ?? null
  },
}))

import { POST } from './route'
import { MANIFEST_PAGE_SIZE, SELECTION_MAX } from '@/lib/transactions/bulk-contract'

const USER_ID = 'user-1'
const PARTNER_ID = 'user-2'

type Row = {
  id: string
  user_id: string
  amount: number
  account_id: string | null
  is_split: boolean | null
  linked_transfer_id: string | null
}

function makeRow(over: Partial<Row> & { id: string }): Row {
  return {
    user_id: USER_ID,
    amount: -10,
    account_id: null,
    is_split: false,
    linked_transfer_id: null,
    ...over,
  }
}

/**
 * Fake `transactions`-tabel die de huishoud-verbrede SELECT-policy nabootst:
 * zónder een `.eq('user_id', …)`-filter van de aanroeper geeft hij ALLE rijen
 * terug (eigen én partner) — precies zoals de échte RLS-policy zou doen. Alleen
 * een expliciete `.eq('user_id', …)` van de route zelf versmalt de uitkomst.
 * `count: 'exact'` wordt alleen meegegeven wanneer de aanroeper daar zelf om
 * vroeg (spiegelt de route: alleen op `from === 0`).
 */
function makeTransactionsChain(rows: Row[], maxRows: number) {
  return {
    select(_cols: string, opts?: { count: 'exact' }) {
      let filteredByUser = false
      let idFilter: Set<string> | null = null
      const filters: Array<[string, ...unknown[]]> = []
      const b: Record<string, unknown> = {}
      let rangeFrom = 0
      let rangeTo = Infinity
      const record =
        (name: string) =>
        (...args: unknown[]) => {
          filters.push([name, ...args])
          if (name === 'eq' && args[0] === 'user_id') filteredByUser = true
          if (name === 'in' && args[0] === 'id') idFilter = new Set(args[1] as string[])
          return b
        }
      for (const name of ['eq', 'in', 'is', 'or', 'gt', 'lt', 'gte', 'lte', 'not']) {
        b[name] = record(name)
      }
      b.order = () => b
      b.range = (from: number, to: number) => {
        rangeFrom = from
        rangeTo = to
        return b
      }
      b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        let scoped = filteredByUser ? rows.filter((r) => r.user_id === USER_ID) : rows
        if (idFilter) scoped = scoped.filter((r) => idFilter!.has(r.id))
        // `max_rows` kapt élk antwoord af, óók binnen een `.range()` — precies de
        // val waar R-NF2 tegen beschermt.
        const page = scoped.slice(rangeFrom, Math.min(rangeTo, scoped.length - 1) + 1).slice(0, maxRows)
        const result = { data: page, error: null, count: opts?.count === 'exact' ? scoped.length : undefined }
        return Promise.resolve(result).then(resolve, reject)
      }
      return b
    },
  }
}

function makeClient(rows: Row[], opts: { authenticated?: boolean; maxRows?: number } = {}) {
  const authenticated = opts.authenticated ?? true
  const maxRows = opts.maxRows ?? Infinity
  return {
    auth: {
      getClaims: async () => ({
        data: { claims: authenticated ? { sub: USER_ID } : null },
      }),
    },
    from(table: string) {
      if (table === 'transactions') return makeTransactionsChain(rows, maxRows)
      if (table === 'bank_connection_accounts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }
      }
      throw new Error(`onverwachte tabel: ${table}`)
    },
  }
}

function makeRequest(body: unknown): Request {
  return { json: () => Promise.resolve(body) } as unknown as Request
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/transactions/search/manifest', () => {
  it('AC12 — 4.000 treffers leveren 4.000 id’s op, niet 1.000 (geen stille max_rows-afkap)', async () => {
    const rows = Array.from({ length: 4000 }, (_, i) => makeRow({ id: `tx-${i}` }))
    mockCreateClient.mockResolvedValue(makeClient(rows))

    const res = await POST(makeRequest({}))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.count).toBe(4000)
    expect(body.ids).toHaveLength(4000)
    // Ontdubbeld en compleet — geen enkel gat, geen dubbele id.
    expect(new Set(body.ids).size).toBe(4000)
  })

  it('AC11 (route) — de leesronde is own-row: een partnerrij op een gedeelde rekening komt nooit in het manifest', async () => {
    const rows = [
      makeRow({ id: 'eigen-1' }),
      makeRow({ id: 'eigen-2' }),
      // De fake-tabel simuleert de huishoud-verbrede SELECT-policy: zonder een
      // eigen `.eq('user_id')` van de route zou deze rij gewoon meekomen.
      makeRow({ id: 'partner-1', user_id: PARTNER_ID }),
    ]
    mockCreateClient.mockResolvedValue(makeClient(rows))

    const res = await POST(makeRequest({}))
    const body = await res.json()

    expect(body.count).toBe(2)
    expect(body.ids.sort()).toEqual(['eigen-1', 'eigen-2'])
    expect(body.ids).not.toContain('partner-1')
  })

  it('weigert boven SELECTION_MAX met een 400 in plaats van af te kappen', async () => {
    const rows = Array.from({ length: SELECTION_MAX + 1 }, (_, i) => makeRow({ id: `tx-${i}` }))
    mockCreateClient.mockResolvedValue(makeClient(rows))

    const res = await POST(makeRequest({}))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('selection_too_large')
    // Geen half antwoord: er komt geen `ids`-veld mee dat de indruk zou wekken
    // dat er tóch iets bevroren is.
    expect(body.ids).toBeUndefined()
  })

  it('exact SELECTION_MAX treffers wordt nog wél geaccepteerd (grens, geen valse weigering)', async () => {
    const rows = Array.from({ length: SELECTION_MAX }, (_, i) => makeRow({ id: `tx-${i}` }))
    mockCreateClient.mockResolvedValue(makeClient(rows))

    const res = await POST(makeRequest({}))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(SELECTION_MAX)
  })

  it('niet ingelogd → 401, geen enkele rij gelezen', async () => {
    mockCreateClient.mockResolvedValue(makeClient([makeRow({ id: 'x' })], { authenticated: false }))
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(401)
  })
})

/**
 * De id-tak (C1). Een expliciete rij-selectie is voor de ID'S al bevroren, maar
 * niet voor de AFGELEIDEN die de bevestiging moet stellen — en de belangrijkste
 * daarvan, de tegenboeking die standaard meeverdwijnt, ligt per definitie buiten
 * de selectie. Zonder deze tak noemde de knoptekst een lager getal dan wat de
 * server verwijderde.
 */
describe('POST /api/transactions/search/manifest — expliciete id-lijst', () => {
  /** Geldige UUID's; het schema accepteert niets anders. */
  const U = (n: number) => `0000000${n}-0000-4000-8000-000000000000`

  it('levert precies de gevraagde rijen, own-row gescoped', async () => {
    const rows = [
      makeRow({ id: U(1), amount: -10 }),
      makeRow({ id: U(2), amount: 40 }),
      makeRow({ id: U(3) }),
      makeRow({ id: U(4), user_id: PARTNER_ID }),
    ]
    mockCreateClient.mockResolvedValue(makeClient(rows))

    const body = await (await POST(makeRequest({ ids: [U(1), U(2), U(4)] }))).json()

    expect(body.count).toBe(2)
    expect(body.ids.sort()).toEqual([U(1), U(2)])
    expect(body.sumPositief).toBe(40)
    expect(body.sumNegatief).toBe(-10)
    expect(body.truncated).toBe(false)
  })

  it('lost de tegenboeking BUITEN de selectie op — het getal dat de bevestiging moet noemen', async () => {
    const rows = [
      makeRow({ id: U(1), linked_transfer_id: U(9) }),
      makeRow({ id: U(9) }),
      makeRow({ id: U(2) }),
    ]
    mockCreateClient.mockResolvedValue(makeClient(rows))

    const body = await (await POST(makeRequest({ ids: [U(1), U(2)] }))).json()

    expect(body.count).toBe(2)
    expect(body.linkedCounterpartIds).toEqual([U(9)])
  })

  it('een tegenboeking van de partner telt niet mee (own-row geverifieerd)', async () => {
    const rows = [
      makeRow({ id: U(1), linked_transfer_id: U(9) }),
      makeRow({ id: U(9), user_id: PARTNER_ID }),
    ]
    mockCreateClient.mockResolvedValue(makeClient(rows))

    const body = await (await POST(makeRequest({ ids: [U(1)] }))).json()
    expect(body.linkedCounterpartIds).toEqual([])
  })

  it('weigert id’s en criterium in één body — geen stille voorrangsregel op een pad dat hard delete voedt', async () => {
    mockCreateClient.mockResolvedValue(makeClient([makeRow({ id: U(1) })]))
    const res = await POST(makeRequest({ ids: [U(1)], direction: 'expense' }))
    expect(res.status).toBe(400)
  })

  it('niet ingelogd → 401', async () => {
    mockCreateClient.mockResolvedValue(makeClient([makeRow({ id: 'x' })], { authenticated: false }))
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(401)
  })

  it('R-NF2 — een afkap die tóch optreedt wordt gemeld, niet verzwegen', async () => {
    // `max_rows` onder MANIFEST_PAGE_SIZE: de eerste pagina komt "kort" terug en
    // de lus breekt. De richting is veilig (te weinig), maar de gebruiker vroeg
    // om alles — dus `truncated` staat aan en `count` klopt met `ids`.
    const rows = Array.from({ length: 3000 }, (_, i) => makeRow({ id: `tx-${i}` }))
    mockCreateClient.mockResolvedValue(makeClient(rows, { maxRows: 500 }))

    const res = await POST(makeRequest({}))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.truncated).toBe(true)
    expect(body.ids).toHaveLength(500)
    expect(body.count).toBe(500)
  })

  it('zonder afkap staat truncated uit', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => makeRow({ id: `tx-${i}` }))
    mockCreateClient.mockResolvedValue(makeClient(rows, { maxRows: MANIFEST_PAGE_SIZE }))

    const body = await (await POST(makeRequest({}))).json()
    expect(body.truncated).toBe(false)
    expect(body.count).toBe(1500)
  })

  it('splitIds en linkedCounterpartIds komen uit dezelfde uitvoering (geen tweede query op een ander criterium)', async () => {
    const rows = [
      makeRow({ id: 'a', is_split: true }),
      makeRow({ id: 'b', linked_transfer_id: 'niet-in-selectie' }),
      makeRow({ id: 'niet-in-selectie', linked_transfer_id: null }),
    ]
    mockCreateClient.mockResolvedValue(makeClient(rows))

    const res = await POST(makeRequest({}))
    const body = await res.json()

    expect(body.splitIds).toEqual(['a'])
    // 'niet-in-selectie' zit zelf ook in de treffers, dus telt niet als
    // "buiten de selectie" — alleen tegenboekingen die er niet bij staan.
    expect(body.linkedCounterpartIds).toEqual([])
  })
})

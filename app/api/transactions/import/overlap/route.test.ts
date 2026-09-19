import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/transactions/import/overlap — "X regels staan al op rekening Y".
 *
 * Wat hier vastligt:
 *  1. De vergelijking loopt ALLEEN over eigen rijen (`user_id = ik`) op ANDERE
 *     rekeningen dan de doelrekening — partnerrijen komen er nooit in, ook al
 *     zijn ze via RLS zichtbaar.
 *  2. De route schrijft niets en blokkeert niets: alleen een telling per
 *     rekening mét naam.
 *  3. Een doelrekening die de gebruiker niet ziet → 403.
 *
 * De Supabase-stub past de filters écht toe (zelfde discipline als
 * ../route.test.ts), zodat het scope-gedrag bewezen wordt en niet de
 * aanroepvolgorde.
 */

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))

import { POST } from './route'

const USER_ID = 'user-1'
const PARTNER_ID = 'user-2'
const DOEL = '11111111-1111-4111-8111-111111111111'
const CREDITCARD = '22222222-2222-4222-8222-222222222222'
const SPAAR = '33333333-3333-4333-8333-333333333333'

type TxRow = {
  user_id: string
  account_id: string
  date: string
  amount: number
  counterparty_iban?: string | null
  counterparty_name?: string | null
}

function makeSupabase(existing: TxRow[], opts: { visibleAccounts?: string[] } = {}) {
  const visibleAccounts = opts.visibleAccounts ?? [DOEL, CREDITCARD, SPAAR]
  const names: Record<string, string> = { [DOEL]: 'PayPal', [CREDITCARD]: 'Creditcard', [SPAAR]: 'Spaarrekening' }
  const mutations: string[] = []
  const txQueries: { eqs: Record<string, unknown>; neqs: Record<string, unknown> }[] = []

  function builder(table: string) {
    const eqs: Record<string, unknown> = {}
    const neqs: Record<string, unknown> = {}
    let inList: unknown[] | null = null
    let gte: string | null = null
    let lte: string | null = null
    let range: [number, number] | null = null
    const b: Record<string, unknown> = {}
    const self = () => b
    b.select = self
    b.order = self
    b.eq = (col: string, val: unknown) => { eqs[col] = val; return b }
    b.neq = (col: string, val: unknown) => { neqs[col] = val; return b }
    b.in = (_c: string, vals: unknown[]) => { inList = vals; return b }
    b.gte = (_c: string, val: string) => { gte = val; return b }
    b.lte = (_c: string, val: string) => { lte = val; return b }
    b.range = (from: number, to: number) => { range = [from, to]; return b }
    for (const m of ['insert', 'update', 'delete', 'upsert']) {
      b[m] = () => { mutations.push(`${table}.${m}`); return b }
    }

    function resolve(): { data: unknown; error: null } {
      if (table === 'bank_accounts') {
        if (eqs['id'] !== undefined) {
          return { data: visibleAccounts.includes(eqs['id'] as string) ? { id: eqs['id'] } : null, error: null }
        }
        const ids = (inList ?? []) as string[]
        return {
          data: ids
            .filter((id) => eqs['user_id'] === undefined || eqs['user_id'] === USER_ID)
            .map((id) => ({ id, name: names[id] })),
          error: null,
        }
      }
      if (table === 'transactions') {
        txQueries.push({ eqs: { ...eqs }, neqs: { ...neqs } })
        let rows = existing.filter(
          (r) =>
            (eqs['user_id'] === undefined || r.user_id === eqs['user_id']) &&
            (neqs['account_id'] === undefined || r.account_id !== neqs['account_id']) &&
            (gte === null || r.date >= gte) &&
            (lte === null || r.date <= lte),
        )
        if (range) rows = rows.slice(range[0], range[1] + 1)
        return {
          data: rows.map((r) => ({
            account_id: r.account_id,
            date: r.date,
            // NUMERIC komt als string uit PostgREST — de loader moet coerceren.
            amount: String(r.amount),
            counterparty_iban: r.counterparty_iban ?? null,
            counterparty_name: r.counterparty_name ?? null,
          })),
          error: null,
        }
      }
      return { data: [], error: null }
    }

    b.maybeSingle = () => Promise.resolve(resolve())
    b.then = (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
      Promise.resolve(resolve()).then(ok, fail)
    return b
  }

  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } } })) },
      from: vi.fn((table: string) => builder(table)),
    },
    mutations,
    txQueries,
  }
}

function request(body: unknown) {
  return new Request('https://app.trifinity.nl/api/transactions/import/overlap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const paypalExport = [
  { date: '2026-09-01', amount: -9.99, counterparty_name: 'Spotify', counterparty_iban: null },
  { date: '2026-09-03', amount: -13.99, counterparty_name: 'Netflix', counterparty_iban: null },
  { date: '2026-09-05', amount: -55, counterparty_name: 'Ziggo', counterparty_iban: null },
]

beforeEach(() => mockCreateClient.mockReset())

describe('POST /api/transactions/import/overlap', () => {
  it('telt per ANDERE eigen rekening, mét naam, en laat de doelrekening zelf buiten beschouwing', async () => {
    const sb = makeSupabase([
      // Zelfde export, al op de creditcard (een dag verschoven geboekt).
      { user_id: USER_ID, account_id: CREDITCARD, date: '2026-09-02', amount: -9.99, counterparty_name: 'SPOTIFY' },
      { user_id: USER_ID, account_id: CREDITCARD, date: '2026-09-03', amount: -13.99, counterparty_name: 'Netflix' },
      { user_id: USER_ID, account_id: SPAAR, date: '2026-09-05', amount: -55, counterparty_name: 'Ziggo B.V.' },
      // Op de DOELrekening zelf: dat is werk voor laag 1/2, niet voor deze route.
      { user_id: USER_ID, account_id: DOEL, date: '2026-09-01', amount: -9.99, counterparty_name: 'Spotify' },
    ])
    mockCreateClient.mockResolvedValue(sb.client)

    const res = await POST(request({ account_id: DOEL, rows: paypalExport }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      overlaps: [
        { account_id: CREDITCARD, account_name: 'Creditcard', count: 2 },
        { account_id: SPAAR, account_name: 'Spaarrekening', count: 1 },
      ],
      checked: 3,
    })
    expect(sb.mutations).toEqual([])
    // Scoping volgt eigenaarschap: eigen rijen, andere rekening.
    expect(sb.txQueries[0].eqs['user_id']).toBe(USER_ID)
    expect(sb.txQueries[0].neqs['account_id']).toBe(DOEL)
  })

  it('ziet partnerrijen NIET, ook niet op een andere rekening', async () => {
    const sb = makeSupabase([
      { user_id: PARTNER_ID, account_id: CREDITCARD, date: '2026-09-01', amount: -9.99, counterparty_name: 'Spotify' },
    ])
    mockCreateClient.mockResolvedValue(sb.client)

    const res = await POST(request({ account_id: DOEL, rows: paypalExport }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ overlaps: [], checked: 3 })
  })

  it('weigert een doelrekening die de gebruiker niet ziet (403)', async () => {
    const sb = makeSupabase([], { visibleAccounts: [CREDITCARD] })
    mockCreateClient.mockResolvedValue(sb.client)

    const res = await POST(request({ account_id: DOEL, rows: paypalExport }))
    expect(res.status).toBe(403)
    expect(sb.txQueries).toEqual([])
  })

  it('valideert de body: lege rijenlijst → 400 met client-veilige fout', async () => {
    const sb = makeSupabase([])
    mockCreateClient.mockResolvedValue(sb.client)

    const res = await POST(request({ account_id: DOEL, rows: [] }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(typeof body.error).toBe('string')
  })
})

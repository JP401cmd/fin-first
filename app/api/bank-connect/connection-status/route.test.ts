import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/bank-connect/connection-status — volgt één koppelpoging voor het
 * wachtscherm van de geïnstalleerde app (B-051). Vastgepind: sessie verplicht,
 * id gevalideerd, scope op de eigen `user_id`, en alleen een uitkomst terug.
 */

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))

import { GET } from './route'

const CONN = '11111111-1111-4111-8111-111111111111'

type Answer = { data?: unknown; error?: unknown; count?: number | null }

function makeStub(opts: { user?: unknown; connection?: Answer; accounts?: Answer }) {
  const eqCalls: Record<string, Array<[string, unknown]>> = {}
  function builder(table: string): any {
    const answer =
      table === 'bank_connections' ? opts.connection ?? { data: null } : opts.accounts ?? { count: 0 }
    eqCalls[table] = []
    const b: any = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        eqCalls[table].push([col, val])
        return b
      },
      maybeSingle: () => Promise.resolve({ error: null, ...answer }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ error: null, ...answer }).then(resolve, reject),
    }
    return b
  }
  const user = opts.user === undefined ? { id: 'user-1' } : opts.user
  return {
    eqCalls,
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from: (table: string) => builder(table),
    },
  }
}

const req = (id: string | null) =>
  new Request(
    `https://app.example/api/bank-connect/connection-status${id === null ? '' : `?id=${id}`}`,
  )

beforeEach(() => mockCreateClient.mockReset())

describe('GET /api/bank-connect/connection-status', () => {
  it('zonder sessie → 401', async () => {
    mockCreateClient.mockResolvedValue(makeStub({ user: null }).client)
    expect((await GET(req(CONN))).status).toBe(401)
  })

  it('ongeldige of ontbrekende id → 400', async () => {
    mockCreateClient.mockResolvedValue(makeStub({}).client)
    expect((await GET(req('abc'))).status).toBe(400)
    expect((await GET(req(null))).status).toBe(400)
  })

  it('niet de eigen rij → 404', async () => {
    mockCreateClient.mockResolvedValue(makeStub({ connection: { data: null } }).client)
    expect((await GET(req(CONN))).status).toBe(404)
  })

  it('actieve rij met koppelrij → gelukt, gescoped op de eigen user_id', async () => {
    const stub = makeStub({
      connection: { data: { id: CONN, status: 'active', authorized_at: new Date().toISOString() } },
      accounts: { count: 2 },
    })
    mockCreateClient.mockResolvedValue(stub.client)

    const res = await GET(req(CONN))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ outcome: 'gelukt' })
    expect(stub.eqCalls.bank_connections).toContainEqual(['user_id', 'user-1'])
    expect(stub.eqCalls.bank_connection_accounts).toContainEqual(['user_id', 'user-1'])
    expect(stub.eqCalls.bank_connection_accounts).toContainEqual(['connection_id', CONN])
  })

  it('pending → wachten', async () => {
    mockCreateClient.mockResolvedValue(
      makeStub({ connection: { data: { id: CONN, status: 'pending', authorized_at: null } } }).client,
    )
    expect(await (await GET(req(CONN))).json()).toEqual({ outcome: 'wachten' })
  })

  it('databasefout → 500 zonder rauwe fouttekst', async () => {
    mockCreateClient.mockResolvedValue(
      makeStub({ connection: { data: null, error: { message: 'relation secret kapot' } } }).client,
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET(req(CONN))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret')
  })
})

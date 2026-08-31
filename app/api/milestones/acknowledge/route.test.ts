import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/milestones/acknowledge — het enige client-geïnitieerde mutatiepad van de
 * mijlpalen-motor (ADR 0123).
 *
 * De nep-supabase is geen passieve stub: de `.eq()`/`.is()`-filters die de
 * route zet worden daadwerkelijk toegepast op een fixture die óók een rij van
 * een ándere gebruiker en een al bevestigde eigen rij bevat. Vergeet de route
 * zijn `user_id`-filter of de `is('acknowledged_at', null)`-idempotentie, dan
 * valt de test om.
 */

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

import { POST } from './route'

const USER = 'user-1'
const OTHER = 'user-2'

type Row = {
  user_id: string
  milestone_key: string
  acknowledged_at: string | null
}

let rows: Row[] = []

function makeClient(user: { id: string } | null) {
  return {
    auth: {
      getUser: async () => ({ data: { user } }),
    },
    from(table: string) {
      expect(table).toBe('achieved_milestones')
      const filters: ((r: Row) => boolean)[] = []
      let payload: Partial<Row> = {}
      const builder = {
        update(p: Partial<Row>) {
          payload = p
          return builder
        },
        eq(col: keyof Row, val: unknown) {
          filters.push((r) => r[col] === val)
          return builder
        },
        is(col: keyof Row, val: null) {
          filters.push((r) => r[col] === val)
          return builder
        },
        then<R>(onFulfilled: (v: { error: null }) => R): Promise<R> {
          for (const r of rows) {
            if (filters.every((f) => f(r))) Object.assign(r, payload)
          }
          return Promise.resolve(onFulfilled({ error: null }))
        },
      }
      return builder
    },
  }
}

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/milestones/acknowledge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  rows = [
    { user_id: USER, milestone_key: 'vermogen-100k', acknowledged_at: null },
    { user_id: USER, milestone_key: 'vrijheid-25', acknowledged_at: '2026-08-01T00:00:00.000Z' },
    { user_id: OTHER, milestone_key: 'vermogen-100k', acknowledged_at: null },
  ]
  mockCreateClient.mockReset()
})

describe('POST /api/milestones/acknowledge', () => {
  it('zonder sessie: 401 met de canonieke envelope, niets gemuteerd', async () => {
    mockCreateClient.mockResolvedValue(makeClient(null))
    const res = await POST(postReq({ key: 'vermogen-100k' }))
    expect(res.status).toBe(401)
    expect(rows[0].acknowledged_at).toBeNull()
  })

  it('ongeldige body: 400, niets gemuteerd', async () => {
    mockCreateClient.mockResolvedValue(makeClient({ id: USER }))
    const res = await POST(postReq({}))
    expect(res.status).toBe(400)
    expect(rows[0].acknowledged_at).toBeNull()
  })

  it('bevestigt uitsluitend de EIGEN onbevestigde rij met die sleutel', async () => {
    mockCreateClient.mockResolvedValue(makeClient({ id: USER }))
    const res = await POST(postReq({ key: 'vermogen-100k' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    expect(rows[0].acknowledged_at).not.toBeNull()
    // De rij van de ander met exact dezelfde sleutel blijft onaangeraakt.
    expect(rows[2].acknowledged_at).toBeNull()
  })

  it('is idempotent: een al bevestigde sleutel behoudt zijn oorspronkelijke tijdstip', async () => {
    mockCreateClient.mockResolvedValue(makeClient({ id: USER }))
    const res = await POST(postReq({ key: 'vrijheid-25' }))
    expect(res.status).toBe(200)
    expect(rows[1].acknowledged_at).toBe('2026-08-01T00:00:00.000Z')
  })

  it('een onbekende sleutel is geen fout — de client heeft niets meer te doen', async () => {
    mockCreateClient.mockResolvedValue(makeClient({ id: USER }))
    const res = await POST(postReq({ key: 'bestaat-niet' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})

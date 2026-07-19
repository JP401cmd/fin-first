import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor de SERVER-side dag-gate op GET /api/snapshots/auto (perf fase 1).
 *
 * Contract:
 *  - Kale trigger (zónder ?source) + bestaande snapshot voor vandaag → goedkope
 *    no-op ({ updated:false, skipped:true }) ZONDER herberekening: de enige
 *    DB-touch is de gate-count, de 8-query databatch draait niet.
 *  - Kale trigger zónder snapshot vandaag → gaat door de gate (herberekent).
 *  - ?source=daily-open → gate wordt overgeslagen (prijs-sync herberekent altijd).
 */

const mockAuthGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
}))

import { GET } from './route'

const USER = { id: 'user-1' }

/**
 * Universele, thenable query-chain. `resolve` is de waarde die await'en van de
 * chain oplevert ({ data, error, count }); `single`/`maybeSingle` leveren 'm ook.
 */
function makeChain(resolve: Record<string, unknown>) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'lt', 'gt', 'gte', 'is', 'in', 'order', 'limit', 'update', 'delete', 'upsert']) {
    chain[m] = () => chain
  }
  chain.single = () => Promise.resolve(resolve)
  chain.maybeSingle = () => Promise.resolve(resolve)
  chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(resolve).then(onF, onR)
  return chain
}

function req(source?: string) {
  const qs = source ? `?source=${source}` : ''
  return new Request(`http://localhost/api/snapshots/auto${qs}`)
}

beforeEach(() => {
  mockAuthGetUser.mockReset()
  mockFrom.mockReset()
  mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
})

describe('GET /api/snapshots/auto — dag-gate', () => {
  it('401 zonder sessie', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(req())
    expect(res.status).toBe(401)
  })

  it('bestaande snapshot vandaag → no-op ZONDER herberekening (geen databatch)', async () => {
    // Gate-count = 1 → de route hoort direct te stoppen.
    mockFrom.mockImplementation(() => makeChain({ count: 1, error: null }))

    const res = await GET(req())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.updated).toBe(false)
    expect(body.skipped).toBe(true)
    // Bewijs "geen herberekening": de ENIGE DB-touch is de gate-query op
    // net_worth_snapshots. De 8-query databatch (assets/debts/…) draaide niet.
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('net_worth_snapshots')
  })

  it('geen snapshot vandaag → gaat door de gate (herberekent)', async () => {
    // Gate-count = 0 → doorgaan. We laten de assets-query een error geven zodat
    // de route direct met 500 stopt — genoeg bewijs dat de gate is gepasseerd,
    // zonder de volledige rekenketen te hoeven mocken.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'net_worth_snapshots') return makeChain({ count: 0, error: null })
      if (table === 'assets') return makeChain({ data: null, error: { message: 'boom' } })
      return makeChain({ data: [], error: null })
    })

    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(mockFrom).toHaveBeenCalledWith('assets')
  })

  it('?source=daily-open → gate wordt overgeslagen (eerste DB-touch is de databatch)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'assets') return makeChain({ data: null, error: { message: 'boom' } })
      return makeChain({ data: [], error: null, count: 1 })
    })

    const res = await GET(req('daily-open'))
    expect(res.status).toBe(500)
    // Gate-query overgeslagen: de allereerste from() is de databatch ('assets'),
    // niet de gate-count op net_worth_snapshots.
    expect(mockFrom.mock.calls[0][0]).toBe('assets')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PUT /api/krant/bezwaar { bezwaar: boolean } (art. 21 AVG, besluit 28-09):
 *   - 401 zonder sessie;
 *   - 400 op een ongeldige body;
 *   - 200 anders, via de service-client met het eigen id.
 */

const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })) }))
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: vi.fn(() => ({ marker: 'service' })) }))

const mockZetSchaduwBezwaar = vi.fn()
vi.mock('@/lib/krant/tijdlijn-keuzes', () => ({ zetSchaduwBezwaar: (...a: unknown[]) => mockZetSchaduwBezwaar(...a) }))

import { PUT } from './route'

const req = (body: unknown) => new Request('https://x.test/api/krant/bezwaar', { method: 'PUT', body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
  mockZetSchaduwBezwaar.mockResolvedValue({ bezwaar: true, schaduwGewist: 0, profielGewist: false })
})

describe('auth', () => {
  it('401 zonder sessie, geen schrijving', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await PUT(req({ bezwaar: true }))
    expect(res.status).toBe(401)
    expect(mockZetSchaduwBezwaar).not.toHaveBeenCalled()
  })
})

describe('validatie', () => {
  it('400 bij een ontbrekende bezwaar-waarde', async () => {
    const res = await PUT(req({}))
    expect(res.status).toBe(400)
  })

  it('400 als bezwaar geen boolean is', async () => {
    const res = await PUT(req({ bezwaar: 'ja' }))
    expect(res.status).toBe(400)
  })

  it('400 bij ongeldig JSON', async () => {
    const res = await PUT(new Request('https://x.test/api/krant/bezwaar', { method: 'PUT', body: '{niet-json' }))
    expect(res.status).toBe(400)
  })
})

describe('schrijven', () => {
  it('200: bezwaar=true via de service-client met het eigen id', async () => {
    const res = await PUT(req({ bezwaar: true }))
    expect(res.status).toBe(200)
    expect(mockZetSchaduwBezwaar).toHaveBeenCalledWith({ marker: 'service' }, 'user-a', true)
    expect(await res.json()).toEqual({ bezwaar: true, schaduwGewist: 0, profielGewist: false })
  })

  it('200: bezwaar=false (intrekken) via de service-client met het eigen id', async () => {
    mockZetSchaduwBezwaar.mockResolvedValue({ bezwaar: false, schaduwGewist: 0, profielGewist: false })
    const res = await PUT(req({ bezwaar: false }))
    expect(res.status).toBe(200)
    expect(mockZetSchaduwBezwaar).toHaveBeenCalledWith({ marker: 'service' }, 'user-a', false)
  })
})

describe('foutafhandeling', () => {
  it('een onverwachte fout wordt een generieke 500, nooit de rauwe message', async () => {
    mockZetSchaduwBezwaar.mockRejectedValue(new Error('relation "profiles" does not exist'))
    const res = await PUT(req({ bezwaar: true }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.error).not.toContain('relation')
  })
})

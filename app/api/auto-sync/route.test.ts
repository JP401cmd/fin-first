import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PUT /api/auto-sync — de schakelaar "Automatisch bijwerken" (W-018, ADR 0182).
 *
 * De schakelaar zet optimistisch en rolt terug op een niet-ok antwoord; de
 * statuscodes zijn dus het contract. Expliciet vastgepind: de update gaat op de
 * EIGEN rij (`.eq('id', user.id)`) via de anon-client — verdwijnt die filter, dan
 * schrijft de call over alle rijen die de policy toelaat.
 */

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom, auth: { getUser: mockGetUser } })),
}))

import { PUT } from './route'

const USER = { id: 'user-1' }

function putRequest(body: unknown) {
  return new Request('http://localhost/api/auto-sync', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function malformedRequest() {
  return new Request('http://localhost/api/auto-sync', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: '{niet-json',
  })
}

function mockUpdateChain(error: unknown = null) {
  const eq = vi.fn().mockResolvedValue({ error })
  const update = vi.fn().mockReturnValue({ eq })
  mockFrom.mockReturnValue({ update })
  return { update, eq }
}

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: USER } })
  mockFrom.mockReset()
})

describe('PUT /api/auto-sync', () => {
  it('401 zonder sessie, en raakt de database niet', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PUT(putRequest({ enabled: false }))
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it.each([
    [{}],
    [{ enabled: 'ja' }],
    [{ enabled: 1 }],
    [{ enabled: null }],
  ])('400 bij een ongeldige body %j', async (body) => {
    const res = await PUT(putRequest(body))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij malformed JSON', async () => {
    const res = await PUT(malformedRequest())
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: unknown }
    expect(typeof json.error).toBe('string')
  })

  it.each([true, false])('zet enabled=%s op de eigen rij', async (enabled) => {
    const { update, eq } = mockUpdateChain()
    const res = await PUT(putRequest({ enabled }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, enabled })
    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ auto_sync_enabled: enabled })
    expect(eq).toHaveBeenCalledWith('id', USER.id)
  })

  it('500 met een generieke tekst bij een DB-fout — nooit de rauwe melding', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockUpdateChain({ message: 'column "auto_sync_enabled" does not exist' })
    const res = await PUT(putRequest({ enabled: true }))
    expect(res.status).toBe(500)
    const json = (await res.json()) as { error: string }
    expect(json.error).not.toContain('auto_sync_enabled')
    spy.mockRestore()
  })
})

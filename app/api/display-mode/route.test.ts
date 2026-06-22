import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor PUT /api/display-mode — de profiel-brede weergavemodus.
 * Borgt het contract waar de DisplayModeProvider op leunt:
 *   - 401 zonder sessie
 *   - 400 bij ongeldige / ontbrekende waarde of malformed body
 *   - 200 + own-row update (`.eq('id', user.id)`) bij 'simple' / 'full'
 *   - 500 → client kan optimistisch terugrollen
 * Verifieert expliciet dat de update op de EIGEN rij gaat (RLS, geen service-role).
 */

const mockGetCachedUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))
vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: (...args: unknown[]) => mockGetCachedUser(...args),
}))

import { PUT } from './route'

const USER = { id: 'user-1' }

beforeEach(() => {
  mockGetCachedUser.mockReset()
  mockFrom.mockReset()
})

function putRequest(body: unknown, malformed = false) {
  return {
    json: () => (malformed ? Promise.reject(new Error('bad json')) : Promise.resolve(body)),
  } as unknown as import('next/server').NextRequest
}

// .update().eq() → { error }
function mockUpdateChain(error: unknown = null) {
  const eq = vi.fn().mockResolvedValue({ error })
  const update = vi.fn().mockReturnValue({ eq })
  mockFrom.mockReturnValue({ update, eq })
  return { update, eq }
}

describe('PUT /api/display-mode', () => {
  it('401 zonder sessie', async () => {
    mockGetCachedUser.mockResolvedValue(null)
    const res = await PUT(putRequest({ mode: 'full' }))
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij malformed body', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    const res = await PUT(putRequest(null, true))
    expect(res.status).toBe(400)
  })

  it('400 bij ongeldige modus', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    const res = await PUT(putRequest({ mode: 'xxx' }))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij ontbrekende modus', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    const res = await PUT(putRequest({}))
    expect(res.status).toBe(400)
  })

  it.each(['simple', 'full'] as const)('200 + own-row update voor %s', async (mode) => {
    mockGetCachedUser.mockResolvedValue(USER)
    const { update, eq } = mockUpdateChain()
    const res = await PUT(putRequest({ mode }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, mode })
    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ display_mode: mode })
    expect(eq).toHaveBeenCalledWith('id', USER.id) // RLS-scoped op eigen rij
  })

  it('500 bij DB-fout (client kan terugrollen)', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockUpdateChain({ message: 'boom' })
    const res = await PUT(putRequest({ mode: 'full' }))
    expect(res.status).toBe(500)
  })
})

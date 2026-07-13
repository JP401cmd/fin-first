import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor GET /api/report/totaalplan — borgt dat de route zonder ingelogde
 * gebruiker 401 teruggeeft en de DB niet aanraakt (spiegel het auth-gate-patroon
 * uit app/api/parameters/route.test.ts en app/api/toekomst-doel/route.test.ts).
 */

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
}))

import { GET } from './route'

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({
    data: { user: null },
    error: { message: 'not authenticated' },
  })
  mockFrom.mockReset()
})

describe('GET /api/report/totaalplan — auth-gate', () => {
  it('401 zonder sessie, geen DB-aanraking', async () => {
    const res = await GET()
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBeTruthy()
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

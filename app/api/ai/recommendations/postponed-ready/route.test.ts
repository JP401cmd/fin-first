import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor GET /api/ai/recommendations/postponed-ready — telt postponed
 * voorstellen waarvan postponed_until verstreken is. Gebruikt door de
 * chat-FAB-badge.
 */

const mockAuthGetUser = vi.fn()
const mockSelect = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: () => ({
      select: mockSelect,
    }),
  })),
}))

beforeEach(() => {
  mockAuthGetUser.mockReset()
  mockSelect.mockReset()
})

async function callRoute() {
  const mod = await import('./route')
  return mod.GET()
}

describe('GET /api/ai/recommendations/postponed-ready', () => {
  it('returns 401 with count:0 when not authenticated', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } })

    const res = await callRoute()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ count: 0 })
  })

  it('returns count of postponed-ready recommendations', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    const chain = {
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockResolvedValue({ count: 3, error: null }),
    }
    mockSelect.mockReturnValue(chain)

    const res = await callRoute()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ count: 3 })
    expect(mockSelect).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'u-1')
    expect(chain.eq).toHaveBeenCalledWith('status', 'postponed')
    // postponed_until <= now → check we pass an ISO date to lte
    const lteArg = chain.lte.mock.calls[0]
    expect(lteArg[0]).toBe('postponed_until')
    expect(typeof lteArg[1]).toBe('string')
    expect(lteArg[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns count:0 when supabase errors', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    const chain = {
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockResolvedValue({ count: null, error: { message: 'boom' } }),
    }
    mockSelect.mockReturnValue(chain)

    const res = await callRoute()
    const body = await res.json()

    expect(body).toEqual({ count: 0 })
  })

  it('handles null count gracefully (no postponed recs found)', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    const chain = {
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockResolvedValue({ count: null, error: null }),
    }
    mockSelect.mockReturnValue(chain)

    const res = await callRoute()
    const body = await res.json()

    expect(body).toEqual({ count: 0 })
  })
})

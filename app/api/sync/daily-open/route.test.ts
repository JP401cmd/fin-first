import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor /api/sync/daily-open — de server-side dag-gate voor de
 * eerste-open-van-de-dag prijs-sync (`profiles.last_price_sync_at`).
 *
 * Pint naast het due/niet-due-contract expliciet de QUERY-VORM vast
 * (productie-incident 17 jul 2026): de update MOET `{ count: 'exact' }`
 * gebruiken en mag GEEN `.select()` achter de or-filter hangen — PostgREST
 * past bij return=representation de or-filter toe op de teruggave-projectie,
 * waardoor de claim met 42703 faalt zodra de filterkolom niet in de select
 * staat. Een mock ziet dat runtime-gedrag niet; daarom borgen deze tests de
 * vorm (count-optie aanwezig, geen select in de keten).
 */

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

import { POST } from './route'

const USER = { id: 'user-1' }

// .update(payload, opts).eq().or() → thenable met { count, error }
function mockUpdateChain(result: { count?: number | null; error?: unknown }) {
  const or = vi.fn().mockResolvedValue({ count: result.count ?? null, error: result.error ?? null })
  const eq = vi.fn().mockReturnValue({ or })
  const update = vi.fn().mockReturnValue({ eq })
  mockFrom.mockReturnValue({ update })
  return { update, eq, or }
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockFrom.mockReset()
})

describe('POST /api/sync/daily-open', () => {
  it('401 zonder sessie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST()
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('claimt de dag: count 1 → due true, update met count-exact en zonder select', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } })
    const { update, eq, or } = mockUpdateChain({ count: 1 })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ due: true })
    // Vorm-borging: payload + { count: 'exact' } als tweede argument…
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ last_price_sync_at: expect.any(String) }),
      { count: 'exact' },
    )
    expect(eq).toHaveBeenCalledWith('id', USER.id)
    // …en de keten eindigt op .or(...) — er is geen select in de chain (de
    // mock-chain zou anders crashen omdat .or geen .select teruggeeft).
    expect(or).toHaveBeenCalledWith(expect.stringContaining('last_price_sync_at.is.null'))
  })

  it('dag al geclaimd: count 0 → due false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } })
    mockUpdateChain({ count: 0 })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ due: false })
  })

  it('500 bij DB-fout', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } })
    mockUpdateChain({ count: null, error: { message: 'boom' } })
    const res = await POST()
    expect(res.status).toBe(500)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Tests voor de PATCH-route van een recommendation — specifiek de
 * nieuwe `expire`-tak die bij chat-sluit zonder beslissing wordt
 * aangeroepen. Verifieert:
 *   - 401 zonder auth
 *   - 404 wanneer recommendation niet bestaat
 *   - alleen pending recs worden ge-expired (`.eq('status','pending')`)
 *   - GEEN recommendation_feedback-insert (zou een CHECK constraint
 *     schenden op feedback_type — alleen rec-status wijzigt)
 */

const mockAuthGetUser = vi.fn()
const mockFrom = vi.fn()
let feedbackInsertCalled = false

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
}))

beforeEach(() => {
  mockAuthGetUser.mockReset()
  mockFrom.mockReset()
  feedbackInsertCalled = false
})

function makeRequest(body: unknown): NextRequest {
  return {
    json: () => Promise.resolve(body),
  } as unknown as NextRequest
}

function makeChainMock(options: {
  fetchedRow?: Record<string, unknown> | null
  fetchError?: unknown
  updateError?: unknown
}) {
  const updateChain = {
    eq: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  }
  // .update().eq().eq().eq() resolves with { error }
  // Simulate via .eq returning a promise on the final call.
  const updateResult = { error: options.updateError ?? null }
  let eqCallCount = 0
  updateChain.eq = vi.fn().mockImplementation(() => {
    eqCallCount++
    // We chain at most 3× .eq for expire (id, user_id, status).
    if (eqCallCount >= 3) {
      return Promise.resolve(updateResult)
    }
    return updateChain
  })

  const fetchChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: options.fetchedRow ?? null,
      error: options.fetchError ?? null,
    }),
  }

  const feedbackChain = {
    insert: vi.fn().mockImplementation((row: unknown) => {
      feedbackInsertCalled = true
      void row
      return Promise.resolve({ error: null })
    }),
  }

  mockFrom.mockImplementation((table: string) => {
    if (table === 'recommendation_feedback') return feedbackChain
    // For recommendations table: depending on the call ordering, the
    // first call is fetch (select), second is update.
    if (mockFrom.mock.calls.length === 1) return fetchChain
    return {
      update: vi.fn().mockReturnValue(updateChain),
    }
  })

  return { updateChain, fetchChain, feedbackChain }
}

async function callRoute(req: NextRequest, id: string) {
  const mod = await import('./route')
  return mod.PATCH(req, { params: Promise.resolve({ id }) })
}

describe('PATCH /api/ai/recommendations/[id] — expire action', () => {
  it('returns 401 when not authenticated', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } })

    const res = await callRoute(makeRequest({ action: 'expire' }), 'rec-1')
    expect(res.status).toBe(401)
  })

  it('returns 404 when the recommendation does not exist', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    makeChainMock({ fetchedRow: null, fetchError: { message: 'not found' } })

    const res = await callRoute(makeRequest({ action: 'expire' }), 'rec-1')
    expect(res.status).toBe(404)
  })

  it('updates rec to expired and does NOT insert feedback', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    const { updateChain } = makeChainMock({
      fetchedRow: {
        id: 'rec-1',
        user_id: 'u-1',
        recommendation_type: 'budget_optimization',
        related_budget_slug: 'boodschappen',
        freedom_days_per_year: 5,
        status: 'pending',
      },
    })

    const res = await callRoute(makeRequest({ action: 'expire' }), 'rec-1')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'expired' })

    // Verifieer dat de update-chain de status='pending' guard heeft
    // (voorkomt dat al-besliste recs alsnog ge-expired worden).
    const eqCalls = updateChain.eq.mock.calls
    const hasPendingGuard = eqCalls.some(
      (args: unknown[]) => args[0] === 'status' && args[1] === 'pending',
    )
    expect(hasPendingGuard).toBe(true)

    // Cruciaal: GEEN recommendation_feedback-insert — 'expired' is geen
    // geldige feedback_type-enum.
    expect(feedbackInsertCalled).toBe(false)
  })

  it('returns 500 when the update fails', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    makeChainMock({
      fetchedRow: {
        id: 'rec-1',
        recommendation_type: 'savings_boost',
        related_budget_slug: null,
        freedom_days_per_year: 1,
      },
      updateError: { message: 'db error' },
    })

    const res = await callRoute(makeRequest({ action: 'expire' }), 'rec-1')
    expect(res.status).toBe(500)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor /api/privacy-mode — de per-gebruiker privé-modus voor lokale
 * transactie-categorisatie (`profiles.privacy_mode`, scope A / ADR 0043).
 * Borgt het contract waar de toggle op /mijn/privacy op leunt:
 *   - GET: 401 zonder sessie · eigen waarde teruggeven (default false)
 *   - POST: 401 zonder sessie · 400 bij malformed body of niet-boolean waarde ·
 *     200 + own-row update (`.eq('id', user.id)`) bij true/false
 *   - POST tier-gate (eigenaarsbesluit, requirements §5 optie 2): AANzetten zonder
 *     'ai'-abonnement → 403 `tier_required` zonder update; UITzetten roept de gate
 *     nooit aan (blijft altijd vrij)
 *   - 500 → client kan optimistisch terugrollen
 * Verifieert expliciet dat lezen én schrijven op de EIGEN rij gaan
 * (RLS, geen service-role).
 */

const mockGetCachedUser = vi.fn()
const mockFrom = vi.fn()
const mockCheckTierGate = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))
vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: (...args: unknown[]) => mockGetCachedUser(...args),
}))
vi.mock('@/lib/require-tier', () => ({
  checkTierGate: (...args: unknown[]) => mockCheckTierGate(...args),
}))

import { GET, POST } from './route'

const USER = { id: 'user-1' }

beforeEach(() => {
  mockGetCachedUser.mockReset()
  mockFrom.mockReset()
  // Default: tier aanwezig (gate open) zodat álle bestaande cases ongewijzigd
  // groen blijven; per tier-case wordt dit overschreven.
  mockCheckTierGate.mockReset()
  mockCheckTierGate.mockResolvedValue(null)
})

function postRequest(body: unknown, malformed = false) {
  return {
    json: () => (malformed ? Promise.reject(new Error('bad json')) : Promise.resolve(body)),
  } as unknown as import('next/server').NextRequest
}

// .select().eq().maybeSingle() → { data, error }
function mockSelectChain(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  mockFrom.mockReturnValue({ select })
  return { select, eq, maybeSingle }
}

// .update().eq() → { error }
function mockUpdateChain(error: unknown = null) {
  const eq = vi.fn().mockResolvedValue({ error })
  const update = vi.fn().mockReturnValue({ eq })
  mockFrom.mockReturnValue({ update })
  return { update, eq }
}

describe('GET /api/privacy-mode', () => {
  it('401 zonder sessie', async () => {
    mockGetCachedUser.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('geeft de eigen opgeslagen waarde terug', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    const { eq } = mockSelectChain({ privacy_mode: true })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ privacyMode: true })
    expect(eq).toHaveBeenCalledWith('id', USER.id) // RLS-scoped op eigen rij
  })

  it('valt terug op false wanneer er (nog) geen rij/waarde is', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockSelectChain(null)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ privacyMode: false })
  })
})

describe('POST /api/privacy-mode', () => {
  it('401 zonder sessie', async () => {
    mockGetCachedUser.mockResolvedValue(null)
    const res = await POST(postRequest({ enabled: true }))
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij malformed body', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    const res = await POST(postRequest(null, true))
    expect(res.status).toBe(400)
  })

  it('400 bij niet-boolean waarde', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    const res = await POST(postRequest({ enabled: 'ja' }))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij ontbrekende waarde', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    const res = await POST(postRequest({}))
    expect(res.status).toBe(400)
  })

  it.each([true, false])('200 + own-row update voor %s', async (enabled) => {
    mockGetCachedUser.mockResolvedValue(USER)
    const { update, eq } = mockUpdateChain()
    const res = await POST(postRequest({ enabled }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, privacyMode: enabled })
    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ privacy_mode: enabled })
    expect(eq).toHaveBeenCalledWith('id', USER.id) // RLS-scoped op eigen rij
  })

  it('500 bij DB-fout (client kan terugrollen)', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockUpdateChain({ message: 'boom' })
    const res = await POST(postRequest({ enabled: true }))
    expect(res.status).toBe(500)
  })

  // ── Tier-gate (eigenaarsbesluit 17 jul 2026, requirements §5 optie 2) ──────
  it('403 bij aanzetten zonder AI-tier — geen own-row update', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockCheckTierGate.mockResolvedValue({
      subscriptions: [],
      error: 'Deze functie vereist een AI abonnement',
    })
    const res = await POST(postRequest({ enabled: true }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: 'Deze functie vereist een AI abonnement',
      code: 'tier_required',
    })
    // De gate blokkeert vóór de update — er wordt niets naar `profiles` geschreven.
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('aanzetten mét AI-tier: gate wordt met (supabase, userId, "ai") aangeroepen → 200', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    mockUpdateChain()
    const res = await POST(postRequest({ enabled: true }))
    expect(res.status).toBe(200)
    expect(mockCheckTierGate).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Function) }), // de anon supabase-client
      USER.id,
      'ai',
    )
  })

  it('uitzetten is altijd vrij: geen tier-check, ook niet zonder abonnement', async () => {
    mockGetCachedUser.mockResolvedValue(USER)
    // Zou 403 geven als de gate wél zou draaien — bewust om te bewijzen dat hij
    // bij uitzetten niet wordt aangeroepen.
    mockCheckTierGate.mockResolvedValue({
      subscriptions: [],
      error: 'Deze functie vereist een AI abonnement',
    })
    const { update, eq } = mockUpdateChain()
    const res = await POST(postRequest({ enabled: false }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, privacyMode: false })
    expect(mockCheckTierGate).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledWith({ privacy_mode: false })
    expect(eq).toHaveBeenCalledWith('id', USER.id)
  })
})

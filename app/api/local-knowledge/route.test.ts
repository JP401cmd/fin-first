import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor /api/local-knowledge — de lees-API van de kennisbank voor de lokale
 * Will-chat (fase C1b). Contract:
 *   - GET: 401 zonder sessie; 403 zonder 'ai'-abonnement (checkTierGate)
 *   - GET: alleen ACTIEVE items, en enkel {titel, tags, tekst} (geen id/volgorde)
 *   - GET: korte privé-cache-header; 500 bij DB-fout
 *   - DB-toegang via getServiceClient (app_settings = beheer-eigendom, ADR 0006)
 */

const mockGetUser = vi.fn()
const mockAuthFrom = vi.fn() // ingelogde client — profiles-lees voor checkTierGate
const mockServiceFrom = vi.fn() // service-client — app_settings-lees

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockAuthFrom })),
}))
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: vi.fn(() => ({ from: mockServiceFrom })),
}))

import { GET } from './route'

const USER = { id: 'user-1', email: 'u@test.nl' }

const ACTIEF_ITEM = {
  id: '11111111-1111-4111-8111-111111111111',
  titel: 'Box 3',
  tekst: 'Box 3 belast een forfaitair rendement op je vermogen.',
  tags: ['box3', 'vermogensbelasting'],
  actief: true,
  volgorde: 0,
  bijgewerkt: '2026-07-19T00:00:00.000Z',
}
const INACTIEF_ITEM = {
  id: '22222222-2222-4222-8222-222222222222',
  titel: 'Verborgen begrip',
  tekst: 'Deze uitleg staat uit en mag niet terugkomen.',
  tags: ['verborgen'],
  actief: false,
  volgorde: 1,
  bijgewerkt: '2026-07-19T00:00:00.000Z',
}

/** Zet de tier-lees op de ingelogde client (checkTierGate leest active_subscriptions). */
function stubTier(subs: string[]) {
  const single = vi.fn().mockResolvedValue({ data: { active_subscriptions: subs }, error: null })
  const eq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq })
  mockAuthFrom.mockReturnValue({ select })
}

/** Zet de app_settings-lees op de service-client. */
function stubKnowledge(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  mockServiceFrom.mockReturnValue({ select })
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockAuthFrom.mockReset()
  mockServiceFrom.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: USER } })
  stubTier(['ai']) // default: geldige AI-abonnee
})

describe('GET /api/local-knowledge — gating', () => {
  it('401 zonder sessie, geen service-client-aanraking', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('403 zonder AI-abonnement', async () => {
    stubTier([]) // geen 'ai'
    const res = await GET()
    expect(res.status).toBe(403)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })
})

describe('GET /api/local-knowledge — inhoud', () => {
  it('geeft alleen ACTIEVE items, enkel {titel, tags, tekst}', async () => {
    stubKnowledge({ data: { value: JSON.stringify([ACTIEF_ITEM, INACTIEF_ITEM]) }, error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      items: [{ titel: 'Box 3', tags: ['box3', 'vermogensbelasting'], tekst: ACTIEF_ITEM.tekst }],
    })
    // Geen lekken van interne velden.
    expect(body.items[0]).not.toHaveProperty('id')
    expect(body.items[0]).not.toHaveProperty('volgorde')
  })

  it('lege lijst wanneer er nog niets is opgeslagen, met privé-cache-header', async () => {
    stubKnowledge({ data: null, error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [] })
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300')
  })

  it('500 bij een DB-fout', async () => {
    stubKnowledge({ data: null, error: { message: 'boom' } })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})

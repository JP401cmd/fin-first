import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor /api/admin/local-knowledge — de superadmin-beheer-API achter de
 * kennisbank lokale AI (fase K1). Contract:
 *   - GET/PUT: 401 zonder sessie, 403 zonder superadmin-rol (server-side via
 *     isSuperAdmin op de ingelogde client — nooit client-vertrouwd)
 *   - GET: default lege lijst als er nog niets is opgeslagen; 500 bij DB-fout
 *   - PUT: 400 bij malformed JSON of een ongeldig item (zod), round-trip via
 *     JSON in app_settings.local_knowledge; 500 bij DB-fout
 *   - Alle DB-toegang via getServiceClient (service-role, ADR 0006), nooit anon
 */

const mockGetUser = vi.fn()
const mockIsSuperAdmin = vi.fn()
const mockServiceFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: vi.fn(() => ({ from: mockServiceFrom })),
}))
vi.mock('@/lib/admin', () => ({
  isSuperAdmin: (...args: unknown[]) => mockIsSuperAdmin(...args),
}))

import { GET, PUT } from './route'

const SUPERADMIN = { id: 'admin-1', email: 'admin@trifinity.nl' }

// Geldige RFC-4122-uuid (versie 4, variant 8) — zod valideert die bits strikt.
const VALID_ITEM = {
  id: '11111111-1111-4111-8111-111111111111',
  titel: 'Wat is Box 3',
  tekst: 'Box 3 gaat over de belasting op je vermogen.',
  tags: ['box3'],
  actief: true,
  volgorde: 0,
  bijgewerkt: '2026-07-19T00:00:00.000Z',
}

function jsonRequest(body: unknown, malformed = false) {
  return {
    json: () => (malformed ? Promise.reject(new Error('bad json')) : Promise.resolve(body)),
  } as unknown as Request
}

function mockGetChain(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  mockServiceFrom.mockReturnValue({ select })
  return { select, eq, maybeSingle }
}

function mockUpsertChain(result: { error: unknown }) {
  const upsert = vi.fn().mockResolvedValue(result)
  mockServiceFrom.mockReturnValue({ upsert })
  return { upsert }
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockIsSuperAdmin.mockReset()
  mockServiceFrom.mockReset()
  // Default: ingelogde superadmin, zodat elk case alleen het relevante stuk overschrijft.
  mockGetUser.mockResolvedValue({ data: { user: SUPERADMIN } })
  mockIsSuperAdmin.mockResolvedValue(true)
})

describe('superadmin-gate (GET/PUT)', () => {
  it('GET → 401 zonder sessie, geen service-client-aanraking', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('GET → 403 voor een ingelogde niet-superadmin', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await GET()
    expect(res.status).toBe(403)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('PUT → 401 zonder sessie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PUT(jsonRequest({ items: [VALID_ITEM] }))
    expect(res.status).toBe(401)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('PUT → 403 voor een ingelogde niet-superadmin, ook met geldige body', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await PUT(jsonRequest({ items: [VALID_ITEM] }))
    expect(res.status).toBe(403)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/local-knowledge', () => {
  it('geeft een lege lijst als er nog niets is opgeslagen', async () => {
    mockGetChain({ data: null, error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [] })
  })

  it('parseert de opgeslagen JSON-lijst terug', async () => {
    mockGetChain({ data: { value: JSON.stringify([VALID_ITEM]) }, error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ items: [VALID_ITEM] })
  })

  it('500 bij een DB-fout', async () => {
    mockGetChain({ data: null, error: { message: 'boom' } })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('PUT /api/admin/local-knowledge', () => {
  it('400 bij malformed JSON', async () => {
    const res = await PUT(jsonRequest(null, true))
    expect(res.status).toBe(400)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('400 bij een ongeldig item (geen uuid als id)', async () => {
    const res = await PUT(jsonRequest({ items: [{ ...VALID_ITEM, id: 'geen-uuid' }] }))
    expect(res.status).toBe(400)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('400 bij een leeg tekstveld', async () => {
    const res = await PUT(jsonRequest({ items: [{ ...VALID_ITEM, tekst: '   ' }] }))
    expect(res.status).toBe(400)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('slaat de lijst op en round-trip: value bevat exact de items als JSON', async () => {
    const { upsert } = mockUpsertChain({ error: null })
    const res = await PUT(jsonRequest({ items: [VALID_ITEM] }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })

    expect(upsert).toHaveBeenCalledTimes(1)
    const [payload, opts] = upsert.mock.calls[0]
    expect(payload).toMatchObject({ key: 'local_knowledge', updated_by: SUPERADMIN.id })
    expect(opts).toEqual({ onConflict: 'key' })
    // De opgeslagen JSON parset terug naar exact de ingestuurde items.
    expect(JSON.parse(payload.value)).toEqual([VALID_ITEM])
  })

  it('accepteert een lege lijst (alle items verwijderd)', async () => {
    const { upsert } = mockUpsertChain({ error: null })
    const res = await PUT(jsonRequest({ items: [] }))
    expect(res.status).toBe(200)
    expect(JSON.parse(upsert.mock.calls[0][0].value)).toEqual([])
  })

  it('500 bij een DB-fout', async () => {
    mockUpsertChain({ error: { message: 'boom' } })
    const res = await PUT(jsonRequest({ items: [VALID_ITEM] }))
    expect(res.status).toBe(500)
  })
})

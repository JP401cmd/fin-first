import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor /api/admin/signup-allowlist — de superadmin-beheer-UI achter de
 * registratie-allowlist van de besloten testfase (ADR 0047). De harde poort
 * zit in de SQL-hook (zie de statische review van de migratie in het
 * testrapport); deze route is uitsluitend CRUD erachter. Contract:
 *   - GET/POST/DELETE: 401 zonder sessie, 403 zonder superadmin-rol
 *     (server-side, via isSuperAdmin op de ingelogde client — nooit
 *     client-vertrouwd)
 *   - POST: 400 bij ongeldige body (zod), normaliseert e-mail (trim+lowercase)
 *     vóór de insert, 409 bij duplicaat (unique-violation 23505), 201 + audit-log
 *     bij succes
 *   - DELETE: 400 bij ongeldige/ontbrekende id, 404 als er niets verwijderd is,
 *     200 + audit-log bij succes
 *   - Alle DB-toegang via getServiceClient (service-role), nooit de anon client
 */

const mockGetUser = vi.fn()
const mockIsSuperAdmin = vi.fn()
const mockLogAdminAction = vi.fn()
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
vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}))

import { GET, POST, DELETE } from './route'

const SUPERADMIN = { id: 'admin-1', email: 'admin@trifinity.nl' }

function jsonRequest(body: unknown, malformed = false) {
  return {
    json: () => (malformed ? Promise.reject(new Error('bad json')) : Promise.resolve(body)),
  } as unknown as Request
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockIsSuperAdmin.mockReset()
  mockLogAdminAction.mockReset().mockResolvedValue(undefined)
  mockServiceFrom.mockReset()
  // Default: ingelogde superadmin, zodat elk case alleen het relevante stuk overschrijft.
  mockGetUser.mockResolvedValue({ data: { user: SUPERADMIN } })
  mockIsSuperAdmin.mockResolvedValue(true)
})

describe('superadmin-gate (GET/POST/DELETE)', () => {
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

  it('POST → 401 zonder sessie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(jsonRequest({ email: 'nieuw@test.nl' }))
    expect(res.status).toBe(401)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('POST → 403 voor een ingelogde niet-superadmin, ook met geldige body', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await POST(jsonRequest({ email: 'nieuw@test.nl' }))
    expect(res.status).toBe(403)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('DELETE → 401 zonder sessie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(jsonRequest({ id: '11111111-1111-1111-1111-111111111111' }))
    expect(res.status).toBe(401)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('DELETE → 403 voor een ingelogde niet-superadmin', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await DELETE(jsonRequest({ id: '11111111-1111-1111-1111-111111111111' }))
    expect(res.status).toBe(403)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/signup-allowlist', () => {
  it('geeft de lijst terug, nieuwste eerst (server bepaalt sortering)', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ id: '1', email_normalized: 'a@test.nl', label: null, created_at: '2026-01-01' }],
      error: null,
    })
    const select = vi.fn().mockReturnValue({ order })
    mockServiceFrom.mockReturnValue({ select })

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      entries: [{ id: '1', email_normalized: 'a@test.nl', label: null, created_at: '2026-01-01' }],
    })
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('500 bij een DB-fout', async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const select = vi.fn().mockReturnValue({ order })
    mockServiceFrom.mockReturnValue({ select })

    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('POST /api/admin/signup-allowlist', () => {
  function mockInsertChain(result: { data: unknown; error: unknown }) {
    const single = vi.fn().mockResolvedValue(result)
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    mockServiceFrom.mockReturnValue({ insert })
    return { insert, select, single }
  }

  it('400 bij een ongeldig e-mailadres (zod)', async () => {
    const res = await POST(jsonRequest({ email: 'niet-geldig' }))
    expect(res.status).toBe(400)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('400 bij malformed JSON', async () => {
    const res = await POST(jsonRequest(null, true))
    expect(res.status).toBe(400)
  })

  it('normaliseert case+whitespace (trim+lowercase) vóór de insert', async () => {
    const { insert } = mockInsertChain({
      data: { id: '1', email_normalized: 'nieuw@test.nl', label: null, created_at: 'now' },
      error: null,
    })
    const res = await POST(jsonRequest({ email: '  Nieuw@Test.NL  ' }))
    expect(res.status).toBe(201)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ email_normalized: 'nieuw@test.nl', created_by: SUPERADMIN.id }),
    )
  })

  it('trimt een optioneel label, of zet null als het leeg is', async () => {
    const { insert } = mockInsertChain({
      data: { id: '1', email_normalized: 'x@test.nl', label: 'Beta-tester', created_at: 'now' },
      error: null,
    })
    await POST(jsonRequest({ email: 'x@test.nl', label: '  Beta-tester  ' }))
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ label: 'Beta-tester' }))
  })

  it('201 + audit-log "allowlist.add" bij succes', async () => {
    mockInsertChain({
      data: { id: '1', email_normalized: 'x@test.nl', label: null, created_at: 'now' },
      error: null,
    })
    const res = await POST(jsonRequest({ email: 'x@test.nl' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      entry: { id: '1', email_normalized: 'x@test.nl', label: null, created_at: 'now' },
    })
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: SUPERADMIN.id,
        action: 'allowlist.add',
        targetLabel: 'x@test.nl',
      }),
    )
  })

  it('409 bij een duplicaat (unique-violation 23505) — geen onthullende foutmelding', async () => {
    mockInsertChain({ data: null, error: { code: '23505', message: 'duplicate key' } })
    const res = await POST(jsonRequest({ email: 'al-erbij@test.nl' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Dit adres staat al op de lijst.')
    // Platte error-envelope (ADR 0044): geen geneste { ok, error: {...} }.
    expect(typeof body.error).toBe('string')
  })

  it('500 bij een andere DB-fout (geen 23505)', async () => {
    mockInsertChain({ data: null, error: { code: 'XX000', message: 'boom' } })
    const res = await POST(jsonRequest({ email: 'x@test.nl' }))
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/admin/signup-allowlist', () => {
  function mockDeleteChain(result: { data: unknown; error: unknown }) {
    const select = vi.fn().mockResolvedValue(result)
    const eq = vi.fn().mockReturnValue({ select })
    const del = vi.fn().mockReturnValue({ eq })
    mockServiceFrom.mockReturnValue({ delete: del })
    return { del, eq, select }
  }

  // Geldige RFC-4122-uuid (versie 4, variant 8) — zod v4 valideert die bits strikt.
  const ID = '11111111-1111-4111-8111-111111111111'

  it('400 bij een ongeldige id (geen uuid)', async () => {
    const res = await DELETE(jsonRequest({ id: 'niet-een-uuid' }))
    expect(res.status).toBe(400)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('404 als er niets verwijderd is (onbekend id)', async () => {
    mockDeleteChain({ data: [], error: null })
    const res = await DELETE(jsonRequest({ id: ID }))
    expect(res.status).toBe(404)
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })

  it('200 + audit-log "allowlist.remove" met het verwijderde adres bij succes', async () => {
    mockDeleteChain({ data: [{ email_normalized: 'weg@test.nl' }], error: null })
    const res = await DELETE(jsonRequest({ id: ID }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: SUPERADMIN.id,
        action: 'allowlist.remove',
        targetLabel: 'weg@test.nl',
      }),
    )
  })

  it('500 bij een DB-fout', async () => {
    mockDeleteChain({ data: null, error: { message: 'boom' } })
    const res = await DELETE(jsonRequest({ id: ID }))
    expect(res.status).toBe(500)
  })
})

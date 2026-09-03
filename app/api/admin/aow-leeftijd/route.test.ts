import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor /api/admin/aow-leeftijd — de superadmin-beheer-API van de
 * AOW-referentietabel (WF-BEHEER-15).
 *
 * Defect (UAT 16 aug 2026, ronde eb81eda0): élke POST/PUT/DELETE gaf een
 * generieke 500 — de route schreef met de anon sessie-client, terwijl
 * `aow_leeftijd` bewust alléén een SELECT-policy heeft (default-deny voor
 * mutaties). Contract ná de fix:
 *   - GET/POST/PUT/DELETE: 401 zonder sessie, 403 zonder superadmin-rol
 *   - alle mutaties lopen via getServiceClient (service-role) ná de rolcheck;
 *     de anon client raakt de tabel nooit aan
 *   - POST/PUT: 400 bij ongeldige body (zod), 409 bij een cohortbereik dat een
 *     bestaand cohort overlapt (server-validatie onderscheidt geldig/ongeldig)
 *   - PUT/DELETE: 404 bij een onbekende id
 *   - succes: 200 + audit-log-entry
 */

const mockGetUser = vi.fn()
const mockIsSuperAdmin = vi.fn()
const mockLogAdminAction = vi.fn()
const mockAnonFrom = vi.fn()
const mockServiceFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockAnonFrom })),
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

import { GET, POST, PUT, DELETE } from './route'

const SUPERADMIN = { id: 'admin-1', email: 'admin@trifinity.nl' }
// Geldige RFC-4122-uuid (versie 4, variant 8) — zod valideert die bits strikt.
const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'

const EXISTING = [
  { id: ID_A, birth_date_from: '1956-06-01', birth_date_through: '1957-02-28' },
  { id: ID_B, birth_date_from: '1957-03-01', birth_date_through: '1960-12-31' },
]

const VALID_ROW = {
  birth_date_from: '1950-01-01',
  birth_date_through: '1956-05-31',
  aow_years: 66,
  aow_months: 0,
}

function jsonRequest(body: unknown, malformed = false) {
  return {
    json: () => (malformed ? Promise.reject(new Error('bad json')) : Promise.resolve(body)),
  } as unknown as Request
}

/**
 * Bouwt een service-client-mock voor één handler-aanroep: de eerste `.from()`
 * levert de bestaande cohorten (overlap-toets), de tweede de mutatie-keten.
 */
function mockOverlapRead(rows: unknown[] = EXISTING) {
  const select = vi.fn().mockResolvedValue({ data: rows, error: null })
  return { select }
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockIsSuperAdmin.mockReset()
  mockLogAdminAction.mockReset().mockResolvedValue(undefined)
  mockAnonFrom.mockReset()
  mockServiceFrom.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: SUPERADMIN } })
  mockIsSuperAdmin.mockResolvedValue(true)
})

describe('superadmin-gate', () => {
  it('GET → 401 zonder sessie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('POST → 403 voor een ingelogde niet-superadmin, ook met geldige body', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await POST(jsonRequest(VALID_ROW))
    expect(res.status).toBe(403)
    expect(mockServiceFrom).not.toHaveBeenCalled()
    expect(mockAnonFrom).not.toHaveBeenCalled()
  })

  it('PUT → 401 zonder sessie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PUT(jsonRequest({ id: ID_A, aow_years: 67 }))
    expect(res.status).toBe(401)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('DELETE → 403 voor een ingelogde niet-superadmin', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await DELETE(jsonRequest({ id: ID_A }))
    expect(res.status).toBe(403)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/aow-leeftijd', () => {
  function mockInsertChain(result: { data: unknown; error: unknown }) {
    const single = vi.fn().mockResolvedValue(result)
    const select = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select })
    mockServiceFrom
      .mockReturnValueOnce(mockOverlapRead())
      .mockReturnValueOnce({ insert })
    return { insert }
  }

  it('schrijft via de service-role-client ná de rolcheck — nooit via de anon sessie-client (de bug)', async () => {
    const { insert } = mockInsertChain({ data: { id: 'new', ...VALID_ROW }, error: null })
    const res = await POST(jsonRequest(VALID_ROW))
    expect(res.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        birth_date_from: '1950-01-01',
        birth_date_through: '1956-05-31',
        aow_years: 66,
        aow_months: 0,
        is_definitive: false,
        source: 'SVB',
      }),
    )
    expect(mockAnonFrom).not.toHaveBeenCalled()
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actorId: SUPERADMIN.id, action: 'aow.add' }),
    )
  })

  it('400 bij ontbrekende verplichte velden (zod) — geen DB-aanraking', async () => {
    const res = await POST(jsonRequest({ birth_date_through: '2000-12-31', aow_years: 68 }))
    expect(res.status).toBe(400)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('400 als de begindatum ná de einddatum ligt', async () => {
    const res = await POST(
      jsonRequest({ ...VALID_ROW, birth_date_from: '1956-05-31', birth_date_through: '1950-01-01' }),
    )
    expect(res.status).toBe(400)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('400 bij malformed JSON', async () => {
    const res = await POST(jsonRequest(null, true))
    expect(res.status).toBe(400)
  })

  it('409 bij een bereik dat een bestaand cohort overlapt — onderscheidend van een geldige rij', async () => {
    mockServiceFrom.mockReturnValueOnce(mockOverlapRead())
    const res = await POST(
      jsonRequest({ ...VALID_ROW, birth_date_from: '1957-01-01', birth_date_through: '1957-12-31' }),
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.code).toBe('overlap')
    // Alleen de leesquery voor de overlap-toets, géén insert.
    expect(mockServiceFrom).toHaveBeenCalledTimes(1)
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })

  it('500 bij een DB-fout op de insert — generieke envelope, geen rauwe message', async () => {
    mockInsertChain({ data: null, error: { code: 'XX000', message: 'geheime driver-details' } })
    const res = await POST(jsonRequest(VALID_ROW))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).not.toContain('geheime')
  })
})

describe('PUT /api/admin/aow-leeftijd', () => {
  function mockUpdateChain(result: { data: unknown; error: unknown }) {
    const single = vi.fn().mockResolvedValue(result)
    const select = vi.fn().mockReturnValue({ single })
    const eq = vi.fn().mockReturnValue({ select })
    const update = vi.fn().mockReturnValue({ eq })
    mockServiceFrom
      .mockReturnValueOnce(mockOverlapRead())
      .mockReturnValueOnce({ update })
    return { update, eq }
  }

  it('400 bij een ongeldige id (geen uuid)', async () => {
    const res = await PUT(jsonRequest({ id: 'fake-id', aow_years: 68 }))
    expect(res.status).toBe(400)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('no-op update (alleen id + bestaande source) slaagt via de service-client', async () => {
    const { update, eq } = mockUpdateChain({ data: { id: ID_A, source: 'SVB 2026' }, error: null })
    const res = await PUT(jsonRequest({ id: ID_A, source: 'SVB 2026' }))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ source: 'SVB 2026' }))
    expect(eq).toHaveBeenCalledWith('id', ID_A)
    expect(mockAnonFrom).not.toHaveBeenCalled()
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'aow.update', targetLabel: ID_A }),
    )
  })

  it('404 bij een onbekende id', async () => {
    mockServiceFrom.mockReturnValueOnce(mockOverlapRead())
    const res = await PUT(jsonRequest({ id: '33333333-3333-4333-8333-333333333333', aow_years: 68 }))
    expect(res.status).toBe(404)
    expect(mockServiceFrom).toHaveBeenCalledTimes(1)
  })

  it('409 als het nieuwe bereik een ÁNDER cohort overlapt (eigen rij telt niet mee)', async () => {
    // Eigen rij A verruimen tot in B → overlap met B.
    mockServiceFrom.mockReturnValueOnce(mockOverlapRead())
    const res = await PUT(jsonRequest({ id: ID_A, birth_date_through: '1957-06-30' }))
    expect(res.status).toBe(409)
    expect(mockServiceFrom).toHaveBeenCalledTimes(1)
  })

  it('eigen bereik ongewijzigd laten (deel-update) overlapt niet met zichzelf', async () => {
    mockUpdateChain({ data: { id: ID_A, aow_years: 67 }, error: null })
    const res = await PUT(jsonRequest({ id: ID_A, aow_years: 67 }))
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/admin/aow-leeftijd', () => {
  function mockDeleteChain(result: { data: unknown; error: unknown }) {
    const select = vi.fn().mockResolvedValue(result)
    const eq = vi.fn().mockReturnValue({ select })
    const del = vi.fn().mockReturnValue({ eq })
    mockServiceFrom.mockReturnValue({ delete: del })
    return { del, eq }
  }

  it('400 bij een ongeldige id', async () => {
    const res = await DELETE(jsonRequest({ id: 'fake-id' }))
    expect(res.status).toBe(400)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('404 als er niets verwijderd is', async () => {
    mockDeleteChain({ data: [], error: null })
    const res = await DELETE(jsonRequest({ id: ID_A }))
    expect(res.status).toBe(404)
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })

  it('200 + audit-log via de service-client bij succes', async () => {
    const { eq } = mockDeleteChain({ data: [{ id: ID_A }], error: null })
    const res = await DELETE(jsonRequest({ id: ID_A }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(eq).toHaveBeenCalledWith('id', ID_A)
    expect(mockAnonFrom).not.toHaveBeenCalled()
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'aow.remove', targetLabel: ID_A }),
    )
  })

  it('500 bij een DB-fout', async () => {
    mockDeleteChain({ data: null, error: { message: 'boom' } })
    const res = await DELETE(jsonRequest({ id: ID_A }))
    expect(res.status).toBe(500)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/krant/tijdlijn/vernieuwen (U11 "en een knop"):
 *   - 401 zonder sessie;
 *   - 403 bij status "geen-tijdlijn";
 *   - 429 met code 'te_snel' + Retry-After bij de rem;
 *   - 200 bij ververst/niets-nieuws;
 *   - een onverwachte fout wordt een generieke 500.
 */

const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })) }))
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: vi.fn(() => ({ marker: 'service' })) }))

const mockVerversEigenTijdlijn = vi.fn()
vi.mock('@/lib/krant/tijdlijn-vernieuwen', () => ({ verversEigenTijdlijn: (...a: unknown[]) => mockVerversEigenTijdlijn(...a) }))

import { POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
})

describe('auth', () => {
  it('401 zonder sessie', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await POST()
    expect(res.status).toBe(401)
    expect(mockVerversEigenTijdlijn).not.toHaveBeenCalled()
  })
})

describe('geen-tijdlijn', () => {
  it('403 wanneer deze lezer de tijdlijn niet leest', async () => {
    mockVerversEigenTijdlijn.mockResolvedValue({ status: 'geen-tijdlijn' })
    const res = await POST()
    expect(res.status).toBe(403)
  })
})

describe('de rem', () => {
  it("429 met code 'te_snel' en een Retry-After-header ≥ 1", async () => {
    const opnieuwVanaf = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    mockVerversEigenTijdlijn.mockResolvedValue({ status: 'te-snel', opnieuwVanaf })
    const res = await POST()
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.code).toBe('te_snel')
    const retryAfter = Number(res.headers.get('Retry-After'))
    expect(retryAfter).toBeGreaterThanOrEqual(1)
    expect(retryAfter).toBeLessThanOrEqual(301)
  })

  it('Retry-After is nooit 0 of negatief, ook net ná het venster', async () => {
    mockVerversEigenTijdlijn.mockResolvedValue({ status: 'te-snel', opnieuwVanaf: new Date(Date.now() - 1000).toISOString() })
    const res = await POST()
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1)
  })
})

describe('succes', () => {
  it("200 met { status: 'ververst', items, leeg }", async () => {
    mockVerversEigenTijdlijn.mockResolvedValue({ status: 'ververst', items: 4, leeg: false })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ververst', items: 4, leeg: false })
  })

  it("200 met { status: 'niets-nieuws' }", async () => {
    mockVerversEigenTijdlijn.mockResolvedValue({ status: 'niets-nieuws' })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'niets-nieuws' })
  })

  it('roept verversEigenTijdlijn aan met de service-client en het eigen id uit de sessie', async () => {
    mockVerversEigenTijdlijn.mockResolvedValue({ status: 'niets-nieuws' })
    await POST()
    expect(mockVerversEigenTijdlijn).toHaveBeenCalledWith({ marker: 'service' }, 'user-a')
  })
})

describe('foutafhandeling', () => {
  it('een onverwachte fout wordt een generieke 500, nooit de rauwe message', async () => {
    mockVerversEigenTijdlijn.mockRejectedValue(new Error('relation "krant_edities" does not exist'))
    const res = await POST()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.error).not.toContain('relation')
  })
})

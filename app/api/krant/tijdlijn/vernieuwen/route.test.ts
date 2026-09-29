import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/krant/tijdlijn/vernieuwen (U11 "en een knop"):
 *   - 401 zonder sessie;
 *   - 403 bij status "geen-tijdlijn";
 *   - 429 met code 'te_snel' + Retry-After bij de rem;
 *   - 200 bij ververst/niets-nieuws;
 *   - een onverwachte fout wordt een generieke 500.
 *   - Krant 1E: de privacy-poort (isCloudAllowed, groep 'nieuws') draait in de
 *     route vóór de AI-laag bestaat, en zijn uitkomst gaat de laag in; een
 *     leesfout telt als "nee" (fail-closed). Een weigering is géén 403.
 */

const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })) }))
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: vi.fn(() => ({ marker: 'service' })) }))

const mockIsCloudAllowed = vi.fn()
vi.mock('@/lib/ai/privacy-gate', () => ({ isCloudAllowed: (...a: unknown[]) => mockIsCloudAllowed(...a) }))
const mockMaakAiStap = vi.fn((opties: { cloudToegestaan: boolean; deadline?: number }) => ({ stap: 'ai', cloudToegestaan: opties.cloudToegestaan }))
vi.mock('@/lib/krant/tijdlijn-ai', () => ({ maakAiStap: (o: { cloudToegestaan: boolean; deadline?: number }) => mockMaakAiStap(o) }))

const mockVerversEigenTijdlijn = vi.fn()
vi.mock('@/lib/krant/tijdlijn-vernieuwen', () => ({ verversEigenTijdlijn: (...a: unknown[]) => mockVerversEigenTijdlijn(...a) }))

import { POST, maxDuration } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
  mockIsCloudAllowed.mockResolvedValue(true)
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
    expect(mockVerversEigenTijdlijn).toHaveBeenCalledWith({ marker: 'service' }, 'user-a', { aiStap: { stap: 'ai', cloudToegestaan: true } })
  })
})

describe('de privacy-poort vóór de AI-laag (Krant 1E, K6)', () => {
  it("toetst isCloudAllowed voor de groep 'nieuws' met het eigen id", async () => {
    mockVerversEigenTijdlijn.mockResolvedValue({ status: 'niets-nieuws' })
    await POST()
    expect(mockIsCloudAllowed).toHaveBeenCalledTimes(1)
    expect(mockIsCloudAllowed.mock.calls[0][1]).toBe('user-a')
    expect(mockIsCloudAllowed.mock.calls[0][2]).toBe('nieuws')
  })

  it('lokaal / privé-modus / kill-switch uit: de laag krijgt cloudToegestaan false — en de verversing gaat gewoon door (geen 403)', async () => {
    mockIsCloudAllowed.mockResolvedValue(false)
    mockVerversEigenTijdlijn.mockResolvedValue({ status: 'ververst', items: 2, leeg: false, ai: 'geweigerd' })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(mockMaakAiStap).toHaveBeenCalledWith(expect.objectContaining({ cloudToegestaan: false }))
  })

  it('Y5: maxDuration 90 en een deadline binnen die tijd voor de modelcall', async () => {
    expect(maxDuration).toBe(90)
    mockVerversEigenTijdlijn.mockResolvedValue({ status: 'niets-nieuws' })
    const voor = Date.now()
    await POST()
    const { deadline } = mockMaakAiStap.mock.calls[0][0]
    expect(deadline).toBeGreaterThanOrEqual(voor + 90_000)
    expect(deadline).toBeLessThanOrEqual(Date.now() + 90_000)
  })

  it('een leesfout op de poort telt als "nee" (fail-closed), niet als 500', async () => {
    mockIsCloudAllowed.mockRejectedValue(new Error('db weg'))
    mockVerversEigenTijdlijn.mockResolvedValue({ status: 'niets-nieuws' })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(mockMaakAiStap).toHaveBeenCalledWith(expect.objectContaining({ cloudToegestaan: false }))
  })

  it('401 zonder sessie: geen poort, geen laag', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    await POST()
    expect(mockIsCloudAllowed).not.toHaveBeenCalled()
    expect(mockMaakAiStap).not.toHaveBeenCalled()
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

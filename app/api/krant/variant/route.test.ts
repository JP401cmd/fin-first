import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PUT /api/krant/variant { variant } (B40; security G3/Y2, 29-09):
 *   - 401 zonder sessie;
 *   - 400 op een ongeldige body (zod, incl. een onbekende extra sleutel — .strict());
 *   - krantBronVoor wordt ALTIJD aangeroepen (ook voor 'tijdlijn') en 403 zodra
 *     de tijdlijn voor deze lezer nog dicht is (!inBeta) — anders blijft een
 *     bij dichte vlag gezette 'ai' na het openen stil staan;
 *   - voor 'ai': 403 als het een Krant-account is, en 403 met code
 *     'ai_niet_beschikbaar' zonder AI-toegang (kanAiKiezen) — checkTierGate
 *     wordt niet meer gebruikt;
 *   - 200 anders, met de service-client en het eigen id.
 */

const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })) }))
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: vi.fn(() => ({ marker: 'service' })) }))

const mockKrantBronVoor = vi.fn()
vi.mock('@/lib/krant/tijdlijn-bron', () => ({ krantBronVoor: (...a: unknown[]) => mockKrantBronVoor(...a) }))

const mockZetKrantVariant = vi.fn()
vi.mock('@/lib/krant/tijdlijn-keuzes', () => ({ zetKrantVariant: (...a: unknown[]) => mockZetKrantVariant(...a) }))

import { PUT } from './route'

const req = (body: unknown) => new Request('https://x.test/api/krant/variant', { method: 'PUT', body: JSON.stringify(body) })

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
  mockKrantBronVoor.mockResolvedValue({ bron: 'tijdlijn', krantAccount: false, variant: null, inBeta: true, kanAiKiezen: true })
  mockZetKrantVariant.mockResolvedValue({ variant: 'ai', gewist: 2, profielGewist: false })
})

describe('auth', () => {
  it('401 zonder sessie, vóór enige validatie of bronkeuze', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await PUT(req({ variant: 'ai' }))
    expect(res.status).toBe(401)
    expect(mockKrantBronVoor).not.toHaveBeenCalled()
    expect(mockZetKrantVariant).not.toHaveBeenCalled()
  })
})

describe('validatie (zod, .strict())', () => {
  it('400 bij een ontbrekende variant', async () => {
    const res = await PUT(req({}))
    expect(res.status).toBe(400)
    expect(mockKrantBronVoor).not.toHaveBeenCalled()
  })

  it('400 bij een onbekende variant-waarde', async () => {
    const res = await PUT(req({ variant: 'schaduw' }))
    expect(res.status).toBe(400)
  })

  it('400 bij een onbekende extra sleutel (.strict())', async () => {
    const res = await PUT(req({ variant: 'ai', extra: 'iets' }))
    expect(res.status).toBe(400)
  })

  it('400 bij ongeldig JSON', async () => {
    const res = await PUT(new Request('https://x.test/api/krant/variant', { method: 'PUT', body: '{niet-json' }))
    expect(res.status).toBe(400)
  })
})

describe('bronkeuze: 403 zolang de tijdlijn voor deze lezer dicht is (security G3)', () => {
  it('403 bij variant "tijdlijn" en !inBeta — nooit stilzwijgend een oude "ai"-keuze laten staan', async () => {
    mockKrantBronVoor.mockResolvedValue({ bron: 'ai', krantAccount: false, variant: null, inBeta: false, kanAiKiezen: false })
    const res = await PUT(req({ variant: 'tijdlijn' }))
    expect(res.status).toBe(403)
    expect(mockZetKrantVariant).not.toHaveBeenCalled()
  })

  it('403 bij variant "ai" en !inBeta, zelfs als kanAiKiezen toevallig true is', async () => {
    mockKrantBronVoor.mockResolvedValue({ bron: 'ai', krantAccount: false, variant: null, inBeta: false, kanAiKiezen: true })
    const res = await PUT(req({ variant: 'ai' }))
    expect(res.status).toBe(403)
    expect(mockZetKrantVariant).not.toHaveBeenCalled()
  })
})

describe("variant 'ai': Krant-account en AI-toegang (kanAiKiezen)", () => {
  it('403 als het een Krant-account is — nooit een AI-variant', async () => {
    mockKrantBronVoor.mockResolvedValue({ bron: 'wacht', krantAccount: true, variant: null, inBeta: true, kanAiKiezen: false })
    const res = await PUT(req({ variant: 'ai' }))
    expect(res.status).toBe(403)
    expect(mockZetKrantVariant).not.toHaveBeenCalled()
  })

  it('403 met code ai_niet_beschikbaar zonder AI-toegang (kanAiKiezen false — kill-switch of geen abonnement)', async () => {
    mockKrantBronVoor.mockResolvedValue({ bron: 'tijdlijn', krantAccount: false, variant: null, inBeta: true, kanAiKiezen: false })
    const res = await PUT(req({ variant: 'ai' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('ai_niet_beschikbaar')
    expect(mockZetKrantVariant).not.toHaveBeenCalled()
  })

  it('200 met AI-toegang: schrijft via de service-client met het eigen id', async () => {
    const res = await PUT(req({ variant: 'ai' }))
    expect(res.status).toBe(200)
    expect(mockZetKrantVariant).toHaveBeenCalledWith({ marker: 'service' }, 'user-a', 'ai')
  })
})

describe("variant 'tijdlijn': geen Krant-account-check, geen AI-toegangscheck — maar krantBronVoor loopt wél mee", () => {
  it('200, roept krantBronVoor aan voor de !inBeta-poort en schrijft via de service-client', async () => {
    mockZetKrantVariant.mockResolvedValue({ variant: null, gewist: 0, profielGewist: false })
    const res = await PUT(req({ variant: 'tijdlijn' }))
    expect(res.status).toBe(200)
    expect(mockKrantBronVoor).toHaveBeenCalledTimes(1)
    expect(mockZetKrantVariant).toHaveBeenCalledWith({ marker: 'service' }, 'user-a', 'tijdlijn')
  })
})

describe('foutafhandeling', () => {
  it('een onverwachte fout wordt een generieke 500, nooit de rauwe message', async () => {
    mockZetKrantVariant.mockRejectedValue(new Error('relation "nieuwsprofiel" does not exist'))
    const res = await PUT(req({ variant: 'tijdlijn' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.error).not.toContain('relation')
  })
})

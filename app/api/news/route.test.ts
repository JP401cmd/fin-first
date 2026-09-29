import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/news — UITGEFASEERD SINDS KRANT 1E (ADR 0190). Deze route dient
 * alleen nog bron 'oud' (een gewone lezer zolang de tijdlijn-bèta dicht is).
 * Security-run Y2 (29-09): een lezer wiens /nieuws de tijdlijn is (met of zonder
 * AI-laag) of het wachtscherm, mag hier geen generatie meer starten — anders
 * kreeg hij een tweede AI-Krant buiten het quotum en de guards van de laag.
 * De peek blijft open (alleen leeswerk).
 */

const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  })),
}))
vi.mock('@/lib/ai/privacy-gate', () => ({ assertCloudAllowed: vi.fn(async () => null) }))
vi.mock('@/lib/require-tier', () => ({ checkTierGate: vi.fn(async () => null) }))
vi.mock('@/lib/ai/config', () => ({ getModel: vi.fn(async () => { throw new Error('mag niet') }) }))
const mockKrantBronVoor = vi.fn()
vi.mock('@/lib/krant/tijdlijn-bron', () => ({ krantBronVoor: (...a: unknown[]) => mockKrantBronVoor(...a) }))
const mockGetCachedNews = vi.fn()
vi.mock('@/lib/news-edition-store', () => ({
  archiveCurrentEdition: vi.fn(),
  checkRefreshLimit: vi.fn(async () => ({ allowed: true, remaining: 3, limit: 3 })),
  currentJaargang: () => 1,
  getCachedNews: (...a: unknown[]) => mockGetCachedNews(...a),
  getNextEditionNr: vi.fn(async () => 1),
  getRecentHeadlines: vi.fn(async () => []),
  loadNewsSourceArticles: vi.fn(async () => []),
  markUsedArticles: vi.fn(),
  setCachedNews: vi.fn(),
}))

import { GET } from './route'

const req = (q = '') => new Request(`https://x.test/api/news${q}`)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
  mockGetCachedNews.mockResolvedValue({ items: [], generatedAt: '2026-09-29T08:00:00Z' })
})

describe('GET /api/news — alleen nog bron oud (Krant 1E, Y2)', () => {
  it.each(['tijdlijn', 'ai', 'wacht'])('bron %s → 403, geen editie', async (bron) => {
    mockKrantBronVoor.mockResolvedValue({ bron })
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(mockGetCachedNews).not.toHaveBeenCalled()
  })

  it("bron 'oud' → de oude Krant werkt zoals vóór 1E (hier: de cache)", async () => {
    mockKrantBronVoor.mockResolvedValue({ bron: 'oud' })
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ cached: true, editionNr: 1 })
  })

  it('de peek blijft open (alleen leeswerk) — ook zonder bron-toets', async () => {
    mockKrantBronVoor.mockResolvedValue({ bron: 'tijdlijn' })
    const res = await GET(req('?peek=1'))
    expect(res.status).toBe(200)
    expect(mockKrantBronVoor).not.toHaveBeenCalled()
  })

  it('401 zonder sessie', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET(req())).status).toBe(401)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/krant/tijdlijn (Krant 1C fase 2, B31/B32):
 *   - 401 zonder sessie;
 *   - 400 op een ongeldige cursor of week;
 *   - 403 zolang deze lezer de tijdlijn niet leest (bepaalKrantBron/B40);
 *   - ?peek=1 → alleen { nieuw };
 *   - anders de pagina;
 *   - een lees-fout wordt een generieke 500 (serverError), nooit de rauwe message.
 */

const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })) }))

const mockKrantBronVoor = vi.fn()
// leestTijdlijn blijft de echte (pure) functie: welke bron de tijdlijn leest, is hier juist de toets.
vi.mock('@/lib/krant/tijdlijn-bron', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/krant/tijdlijn-bron')>()
  return { ...actual, krantBronVoor: (...a: unknown[]) => mockKrantBronVoor(...a) }
})

const mockHeeftNieuw = vi.fn()
const mockLaadTijdlijnPagina = vi.fn()
vi.mock('@/lib/krant/tijdlijn-lezen', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/krant/tijdlijn-lezen')>()
  return { ...actual, heeftNieuw: (...a: unknown[]) => mockHeeftNieuw(...a), laadTijdlijnPagina: (...a: unknown[]) => mockLaadTijdlijnPagina(...a) }
})

import { codeerCursor } from '@/lib/krant/tijdlijn-lezen'
import { GET } from './route'

const req = (qs = '') => new Request(`https://x.test/api/krant/tijdlijn${qs}`)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
  mockKrantBronVoor.mockResolvedValue({ bron: 'tijdlijn', krantAccount: false, variant: null, inBeta: true })
  mockLaadTijdlijnPagina.mockResolvedValue({ berichten: [], volgende: null })
  mockHeeftNieuw.mockResolvedValue(false)
})

describe('auth', () => {
  it('401 zonder sessie, vóór elke lezing', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(mockKrantBronVoor).not.toHaveBeenCalled()
  })
})

describe('validatie', () => {
  it('400 bij een ongeldige cursor', async () => {
    const res = await GET(req('?cursor=niet-geldig'))
    expect(res.status).toBe(400)
    expect(mockKrantBronVoor).not.toHaveBeenCalled()
  })

  it('een geldige cursor gaat gewoon door', async () => {
    const cursor = codeerCursor({ createdAt: '2026-09-29T08:00:00Z', positie: 0, id: '11111111-1111-1111-1111-111111111111' })
    const res = await GET(req(`?cursor=${cursor}`))
    expect(res.status).toBe(200)
  })

  it('400 bij een ongeldige week', async () => {
    const res = await GET(req('?week=2026-40'))
    expect(res.status).toBe(400)
    expect(mockKrantBronVoor).not.toHaveBeenCalled()
  })

  it('een geldige week (2026-W40) gaat door', async () => {
    const res = await GET(req('?week=2026-W40'))
    expect(res.status).toBe(200)
  })
})

describe('bronkeuze', () => {
  it('403 zolang deze lezer de tijdlijn niet leest', async () => {
    mockKrantBronVoor.mockResolvedValue({ bron: 'wacht', krantAccount: true, variant: null, inBeta: false })
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(mockLaadTijdlijnPagina).not.toHaveBeenCalled()
  })

  it('200 voor bron "ai" — de Krant met AI leest sinds 1E dezelfde tijdlijn', async () => {
    mockKrantBronVoor.mockResolvedValue({ bron: 'ai', krantAccount: false, variant: 'ai', inBeta: true })
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(mockLaadTijdlijnPagina).toHaveBeenCalledTimes(1)
  })

  it('403 voor bron "oud" (de oude Krant bij een dichte vlag)', async () => {
    mockKrantBronVoor.mockResolvedValue({ bron: 'oud', krantAccount: false, variant: null, inBeta: false })
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(mockLaadTijdlijnPagina).not.toHaveBeenCalled()
  })
})

describe('peek', () => {
  it('?peek=1 geeft alleen { nieuw }, geen pagina', async () => {
    mockHeeftNieuw.mockResolvedValue(true)
    const res = await GET(req('?peek=1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ nieuw: true })
    expect(mockLaadTijdlijnPagina).not.toHaveBeenCalled()
  })
})

describe('pagina', () => {
  it('200 met { pagina } zonder peek', async () => {
    mockLaadTijdlijnPagina.mockResolvedValue({ berichten: [{ id: 'i1' }], volgende: 'cursor-x' })
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ pagina: { berichten: [{ id: 'i1' }], volgende: 'cursor-x' } })
  })

  it('een leesfout wordt een generieke 500, nooit de rauwe message', async () => {
    mockLaadTijdlijnPagina.mockRejectedValue(new Error('relation "krant_editie_items" does not exist'))
    const res = await GET(req())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.error).not.toContain('relation')
  })
})

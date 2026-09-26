import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * PUT /api/overzicht/page-status — de schrijf-allowlist na ADR 0179 D6.
 *
 * Vastgepind:
 *   - de drie katern-routes (/toekomst, /toekomst/doelen, /toekomst/instellingen)
 *     worden met een stoplicht-niveau opgeslagen, en `null` wist de sleutel;
 *   - elke andere /toekomst/…-sleutel → 400 'Onbekende route', er wordt niets gelezen
 *     of geschreven;
 *   - een ongeldig niveau (getal, 'good', onbekende string) op een katern-route → 400
 *     'Ongeldig niveau';
 *   - de read-modify-write laat de andere sleutels in de map staan (own-row);
 *   - de GET-scope groeit niet mee: GET voor een katern-route → `{ info: null }`
 *     zonder data-load.
 *
 * De zware /overzicht-loaders worden gemockt: deze test gaat over de allowlist,
 * niet over de statusberekening.
 */

const mockGetUser = vi.fn()
const mockSingle = vi.fn()
const mockUpdateEq = vi.fn()
const mockUpdate = vi.fn<(row: unknown) => { eq: typeof mockUpdateEq }>(() => ({ eq: mockUpdateEq }))
const mockSelect = vi.fn(() => ({ eq: () => ({ single: mockSingle }) }))
const mockFrom = vi.fn(() => ({ select: mockSelect, update: mockUpdate }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

// vi.hoisted: de vi.mock-factories hieronder worden boven de imports gehesen.
const { mockLoader } = vi.hoisted(() => ({ mockLoader: vi.fn() }))
vi.mock('@/lib/lever-scores-loader', () => ({ loadLeverScores: mockLoader }))
vi.mock('@/lib/dashboard-data-loader', () => ({ loadDashboardData: mockLoader }))
vi.mock('@/lib/horizon-data-loader', () => ({ loadHorizonData: mockLoader }))
vi.mock('@/lib/cashflow-data-loader', () => ({ loadCashflowData: mockLoader }))
vi.mock('@/lib/vaste-lasten-summary', () => ({ loadVasteLastenSummary: mockLoader }))
vi.mock('@/lib/box2-relevance', () => ({ loadBox2Materiality: mockLoader }))
vi.mock('@/lib/household/server-perspective', () => ({
  getServerPerspective: vi.fn(async () => 'mine'),
}))

import { GET, PUT } from './route'

const USER = { id: 'user-1' }
const BESTAANDE_MAP = { '/overzicht/budget': 'warn', '/toekomst/tekort-lening': 12000 }

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: USER } })
  mockSingle.mockResolvedValue({
    data: { status_banner_minimized: { ...BESTAANDE_MAP } },
    error: null,
  })
  mockUpdateEq.mockResolvedValue({ error: null })
})

function put(body: unknown) {
  return new NextRequest('http://localhost/api/overzicht/page-status', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** De map die naar de update ging. */
function geschrevenMap(): Record<string, unknown> {
  expect(mockUpdate).toHaveBeenCalledTimes(1)
  const arg = mockUpdate.mock.calls[0][0] as { status_banner_minimized: Record<string, unknown> }
  return arg.status_banner_minimized
}

const KATERN_ROUTES = ['/toekomst', '/toekomst/doelen', '/toekomst/instellingen']

describe('PUT /api/overzicht/page-status — katern-routes (ADR 0179 D6)', () => {
  for (const route of KATERN_ROUTES) {
    for (const level of ['warn', 'bad', 'info'] as const) {
      it(`${route} + '${level}' → 200, opgeslagen naast de bestaande sleutels`, async () => {
        const res = await PUT(put({ route, level }))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, minimized: level })
        expect(geschrevenMap()).toEqual({ ...BESTAANDE_MAP, [route]: level })
        expect(mockUpdateEq).toHaveBeenCalledWith('id', USER.id)
      })
    }
  }

  it('trailing slash wordt genormaliseerd naar de katern-sleutel', async () => {
    const res = await PUT(put({ route: '/toekomst/doelen/', level: 'warn' }))
    expect(res.status).toBe(200)
    expect(geschrevenMap()).toHaveProperty('/toekomst/doelen', 'warn')
  })

  it('level null wist alleen de katern-sleutel', async () => {
    mockSingle.mockResolvedValue({
      data: { status_banner_minimized: { ...BESTAANDE_MAP, '/toekomst': 'bad' } },
      error: null,
    })
    const res = await PUT(put({ route: '/toekomst', level: null }))
    expect(res.status).toBe(200)
    expect(geschrevenMap()).toEqual(BESTAANDE_MAP)
  })
})

describe('PUT /api/overzicht/page-status — wat níét door kan', () => {
  const ONBEKEND = [
    '/toekomst/verzonnen',
    '/toekomst/doelen/abc',
    '/toekomst/instellingen?regel=aow',
    '/TOEKOMST',
    'toekomst',
    'toString',
  ]
  for (const route of ONBEKEND) {
    it(`route '${route}' → 400 'Onbekende route', niets gelezen of geschreven`, async () => {
      const res = await PUT(put({ route, level: 'warn' }))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Onbekende route' })
      expect(mockFrom).not.toHaveBeenCalled()
    })
  }

  const ONGELDIG = [5, 0, 'good', 'neutral', 'WARN', '', true, {}]
  for (const level of ONGELDIG) {
    it(`katern-route met niveau ${JSON.stringify(level)} → 400 'Ongeldig niveau'`, async () => {
      const res = await PUT(put({ route: '/toekomst/instellingen', level }))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Ongeldig niveau' })
      expect(mockFrom).not.toHaveBeenCalled()
    })
  }

  it('niet-string route → 400', async () => {
    const res = await PUT(put({ route: 42, level: 'warn' }))
    expect(res.status).toBe(400)
  })
})

describe('GET /api/overzicht/page-status — scope groeit niet mee', () => {
  for (const route of KATERN_ROUTES) {
    it(`${route} → { info: null, minimized: null } zonder data-load`, async () => {
      const res = await GET(
        new NextRequest(`http://localhost/api/overzicht/page-status?route=${encodeURIComponent(route)}`),
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ info: null, minimized: null })
      expect(mockLoader).not.toHaveBeenCalled()
      expect(mockFrom).not.toHaveBeenCalled()
    })
  }
})

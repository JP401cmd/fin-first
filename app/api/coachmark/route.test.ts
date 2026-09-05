import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/coachmark — eenmalige uitleg-hints, uitgebreid met de rondleiding
 * (ADR 0130).
 *
 * Twee eigenschappen die deze suite vastlegt:
 *  1. READ-MODIFY-WRITE. `profiles.module_guide_state` wordt gedeeld met de
 *     welkomstgids (`welcome:guide`), de coach-staat (`coach:state`) en de
 *     rondleiding-vlag (`rondleiding:pending`). Een blinde overschrijving zou
 *     die wissen — precies waarom hier een test staat en niet alleen een comment.
 *  2. De allowlist is DICHT. Een onbekend id levert een 400 en schrijft niets;
 *     zonder die grens is de jsonb-kolom een open schrijfoppervlak voor elke
 *     ingelogde gebruiker.
 */

const { mockCreateClient, mockGetAuthClaims } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetAuthClaims: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
  getAuthClaims: mockGetAuthClaims,
}))

import { GET, PUT, coachmarkStateKey } from './route'

const USER = 'user-1'

let updatePayloads: Record<string, unknown>[] = []

function buildClient(existingMap: Record<string, unknown> | null) {
  return {
    from(table: string) {
      if (table !== 'profiles') throw new Error(`onverwachte tabel: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { module_guide_state: existingMap }, error: null }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          updatePayloads.push(patch)
          return { eq: async () => ({ error: null }) }
        },
      }
    },
  }
}

function req(body: unknown): Request {
  return new Request('http://localhost/api/coachmark', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

function writtenMap(): Record<string, unknown> {
  return updatePayloads.at(-1)?.module_guide_state as Record<string, unknown>
}

beforeEach(() => {
  updatePayloads = []
  mockCreateClient.mockReset()
  mockGetAuthClaims.mockReset()
  mockGetAuthClaims.mockResolvedValue({ sub: USER })
})

describe('PUT /api/coachmark — allowlist', () => {
  it('accepteert het nieuwe id overzicht-rondleiding', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    const res = await PUT(req({ id: 'overzicht-rondleiding' }))
    expect(res.status).toBe(200)
    expect(writtenMap()['coachmark:overzicht-rondleiding']).toMatchObject({
      dismissedAt: expect.any(String),
    })
  })

  it('weigert een onbekend id met 400 en schrijft niets', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    const res = await PUT(req({ id: 'verzonnen-hint' }))
    expect(res.status).toBe(400)
    expect(updatePayloads).toHaveLength(0)
  })

  it('weigert een onbekende uitkomst met 400', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    const res = await PUT(req({ id: 'overzicht-rondleiding', outcome: 'afgebroken' }))
    expect(res.status).toBe(400)
    expect(updatePayloads).toHaveLength(0)
  })

  it('401 zonder sessie, en schrijft niets', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    mockGetAuthClaims.mockResolvedValue(null)
    const res = await PUT(req({ id: 'euro-view' }))
    expect(res.status).toBe(401)
    expect(updatePayloads).toHaveLength(0)
  })
})

describe('PUT /api/coachmark — uitkomst', () => {
  it('slaat de uitkomst op naast het tijdstip', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    await PUT(req({ id: 'overzicht-rondleiding', outcome: 'onderbroken' }))
    expect(writtenMap()['coachmark:overzicht-rondleiding']).toMatchObject({ outcome: 'onderbroken' })
  })

  it('laat de uitkomst weg wanneer hij niet wordt meegestuurd (euro-view)', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    await PUT(req({ id: 'euro-view' }))
    expect(writtenMap()['coachmark:euro-view']).not.toHaveProperty('outcome')
  })
})

describe('PUT /api/coachmark — read-modify-write', () => {
  it('bewaart welcome:guide, coach:state en de rondleiding-vlag', async () => {
    const bestaand = {
      'welcome:guide': { status: 'active', completedStepIds: ['s1'] },
      'coach:state': { dismissed: ['gap_bank'], lastDismissedAt: null, guideLastShownAt: null },
      'rondleiding:pending': { since: '2026-09-05T10:00:00.000Z' },
    }
    mockCreateClient.mockResolvedValue(buildClient(bestaand))

    await PUT(req({ id: 'overzicht-rondleiding', outcome: 'voltooid' }))

    const map = writtenMap()
    expect(map['welcome:guide']).toEqual(bestaand['welcome:guide'])
    expect(map['coach:state']).toEqual(bestaand['coach:state'])
    expect(map['rondleiding:pending']).toEqual(bestaand['rondleiding:pending'])
  })

  it('schrijft uitsluitend de module_guide_state-kolom', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    await PUT(req({ id: 'euro-view' }))
    expect(Object.keys(updatePayloads[0])).toEqual(['module_guide_state'])
  })
})

describe('GET /api/coachmark', () => {
  it('geeft dismissed én outcome voor élk bekend id terug', async () => {
    mockCreateClient.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                module_guide_state: {
                  [coachmarkStateKey('overzicht-rondleiding')]: {
                    dismissedAt: '2026-09-05T10:00:00.000Z',
                    outcome: 'onderbroken',
                  },
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    })

    const res = await GET()
    const body = (await res.json()) as {
      dismissed: Record<string, boolean>
      outcome: Record<string, string | null>
    }

    expect(body.dismissed).toEqual({ 'euro-view': false, 'overzicht-rondleiding': true })
    expect(body.outcome).toEqual({ 'euro-view': null, 'overzicht-rondleiding': 'onderbroken' })
  })

  it('geeft outcome null voor een oude rij die alleen dismissedAt draagt', async () => {
    mockCreateClient.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                module_guide_state: {
                  [coachmarkStateKey('euro-view')]: { dismissedAt: '2026-08-01T00:00:00.000Z' },
                },
              },
              error: null,
            }),
          }),
        }),
      }),
    })

    const body = (await (await GET()).json()) as { outcome: Record<string, string | null> }
    expect(body.outcome['euro-view']).toBeNull()
  })

  it('401 zonder sessie', async () => {
    mockCreateClient.mockResolvedValue(buildClient({}))
    mockGetAuthClaims.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })
})

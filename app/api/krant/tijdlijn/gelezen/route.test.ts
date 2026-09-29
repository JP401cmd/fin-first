import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * PUT /api/krant/tijdlijn/gelezen — "tot hier gelezen" (own-row upsert via de
 * SESSIE-client, geen service-role):
 *   - 401 zonder sessie;
 *   - 403 tenzij deze lezer de tijdlijn leest (bepaalKrantBron/B40, security G3) —
 *     buiten de bèta maakt niemand zo een nieuwsprofiel-rij aan;
 *   - upsert met de eigen user_id, via de sessie-client;
 *   - een schrijffout wordt een generieke 500.
 */

const mockGetUser = vi.fn()
const mockUpsert = vi.fn()
const upsertCalls: unknown[][] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => ({
      upsert: (...args: unknown[]) => {
        upsertCalls.push([table, ...args])
        return mockUpsert(...args)
      },
    }),
  })),
}))

const mockKrantBronVoor = vi.fn()
// leestTijdlijn blijft de echte (pure) functie: welke bron de tijdlijn leest, is hier juist de toets.
vi.mock('@/lib/krant/tijdlijn-bron', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/krant/tijdlijn-bron')>()
  return { ...actual, krantBronVoor: (...a: unknown[]) => mockKrantBronVoor(...a) }
})

import { PUT } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  upsertCalls.length = 0
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } } })
  mockKrantBronVoor.mockResolvedValue({ bron: 'tijdlijn', krantAccount: false, variant: null, inBeta: true, kanAiKiezen: false })
  mockUpsert.mockResolvedValue({ error: null })
})

describe('auth', () => {
  it('401 zonder sessie, geen bronkeuze, geen upsert', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const res = await PUT()
    expect(res.status).toBe(401)
    expect(mockKrantBronVoor).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})

describe('bronkeuze (security G3)', () => {
  it('403 zolang deze lezer de tijdlijn niet leest (bv. bron "wacht" of "oud"), geen upsert', async () => {
    mockKrantBronVoor.mockResolvedValue({ bron: 'wacht', krantAccount: true, variant: null, inBeta: false, kanAiKiezen: false })
    const res = await PUT()
    expect(res.status).toBe(403)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('403 ook voor bron "oud" (de oude Krant bij een dichte vlag)', async () => {
    mockKrantBronVoor.mockResolvedValue({ bron: 'oud', krantAccount: false, variant: null, inBeta: false, kanAiKiezen: true })
    const res = await PUT()
    expect(res.status).toBe(403)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('bron "ai" (1E): de Krant met AI is dezelfde tijdlijn — gelezen-tot wordt gewoon gezet', async () => {
    mockKrantBronVoor.mockResolvedValue({ bron: 'ai', krantAccount: false, variant: 'ai', inBeta: true, kanAiKiezen: true })
    const res = await PUT()
    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledTimes(1)
  })
})

describe('schrijven', () => {
  it('upsert op nieuwsprofiel met de eigen user_id en onConflict user_id, geen body nodig', async () => {
    const res = await PUT()
    expect(res.status).toBe(200)
    expect(upsertCalls).toHaveLength(1)
    const [table, payload, opties] = upsertCalls[0] as [string, Record<string, unknown>, { onConflict?: string }]
    expect(table).toBe('nieuwsprofiel')
    expect(payload.user_id).toBe('user-a')
    expect(typeof payload.tijdlijn_gelezen_tot).toBe('string')
    expect(opties.onConflict).toBe('user_id')
  })

  it('geeft { gelezenTot } terug, gelijk aan de geschreven waarde', async () => {
    const res = await PUT()
    const body = await res.json()
    const [, payload] = upsertCalls[0] as [string, Record<string, unknown>]
    expect(body).toEqual({ gelezenTot: payload.tijdlijn_gelezen_tot })
  })

  it('een schrijffout wordt een generieke 500, nooit de rauwe message', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'kolom "tijdlijn_gelezen_tot" bestaat niet' } })
    const res = await PUT()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.error).not.toContain('kolom')
  })
})

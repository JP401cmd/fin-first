import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor PUT /api/toekomst-scenario — persistentie van de wat-als-scenario-
 * voorkeuren op de eigen profielrij. Borgt het contract waar de scenariolaag op leunt:
 *   - 401 zonder sessie (en geen DB-aanraking)
 *   - 400 bij malformed JSON / ongeldige (parser → null) body
 *   - 200 + own-row VOLLEDIGE overwrite (`.update({toekomst_scenario_prefs}).eq('id', user.id)`)
 *   - 500 → client kan optimistisch terugrollen
 * Verifieert expliciet dat de update op de EIGEN rij gaat (RLS, geen service-role) en dat
 * de geparste (geclampte) waarde — niet de rauwe body — wordt weggeschreven.
 */

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
}))

import { PUT } from './route'

const USER = { id: 'user-1' }

beforeEach(() => {
  mockGetUser.mockReset()
  mockFrom.mockReset()
})

/** Minimal NextRequest-dubbel: alleen text() + headers.get() worden gebruikt. */
function putRequest(rawBody: string, contentLength?: string) {
  return {
    headers: { get: (k: string) => (k === 'content-length' ? (contentLength ?? String(rawBody.length)) : null) },
    text: () => Promise.resolve(rawBody),
  } as unknown as import('next/server').NextRequest
}

// .update().eq() → { error }
function mockUpdateChain(error: unknown = null) {
  const eq = vi.fn().mockResolvedValue({ error })
  const update = vi.fn().mockReturnValue({ eq })
  mockFrom.mockReturnValue({ update, eq })
  return { update, eq }
}

describe('PUT /api/toekomst-scenario', () => {
  it('401 zonder sessie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PUT(putRequest(JSON.stringify({ v: 1 })))
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij malformed JSON', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } })
    const res = await PUT(putRequest('{ niet-geldig json'))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij body die de parser afwijst (verkeerde versie)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } })
    const res = await PUT(putRequest(JSON.stringify({ v: 99, sliders: { income: 1000 } })))
    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('200 + own-row overwrite met de GEPARSTE (geclampte) waarde', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } })
    const { update, eq } = mockUpdateChain()

    // income 99999 wordt door de parser geclampt naar de slider-max (15000);
    // rommelvelden worden weggegooid. De parser normaliseert v1-input ALTIJD naar v:2
    // (transparant voor de schrijfpoort — zelfde velden), dus we verwachten de v:2-blob.
    const res = await PUT(
      putRequest(
        JSON.stringify({
          v: 1,
          sliders: { income: 99999, junk: 'x' },
          showScenarioLine: true,
          rogueField: 'weg',
        }),
      ),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({
      toekomst_scenario_prefs: { v: 2, sliders: { income: 15000 }, showScenarioLine: true },
    })
    expect(eq).toHaveBeenCalledWith('id', USER.id) // RLS-scoped op eigen rij
  })

  it('500 bij DB-fout (client kan terugrollen)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: USER } })
    mockUpdateChain({ code: 'XX000', message: 'boom' })
    const res = await PUT(putRequest(JSON.stringify({ v: 1, showScenarioLine: false })))
    expect(res.status).toBe(500)
  })
})

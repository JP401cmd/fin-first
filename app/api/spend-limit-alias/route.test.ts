import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor PUT /api/spend-limit-alias — de profiel-brede weergavenaam.
 *
 * Borgt het contract waar `SpendLimitAliasProvider`
 * (lib/hooks/use-spend-limit-alias.tsx) op leunt. Die provider zet de keuze
 * OPTIMISTISCH en rolt alleen terug op een niet-ok antwoord — hij leest verder
 * niets uit de body. De statuscodes zijn dus het hele contract:
 *   - 401 zonder sessie (app-brede tekst 'Niet ingelogd')
 *   - 400 bij een ongeldige/ontbrekende `alias` en bij malformed JSON (AC-B5-06:
 *     nooit een 500 op invoer die de zod-enum niet kent)
 *   - 200 + own-row update (`.eq('id', user.id)`) voor beide aliassen
 *   - 500 bij een DB-fout → de client rolt terug, zonder DB-details in de body
 *
 * Gespiegeld op app/api/euro-view/route.test.ts, inclusief het werken met échte
 * `Request`-objecten zodat `parseBody` en het malformed-JSON-pad daadwerkelijk
 * doorlopen worden.
 */

const mockGetCachedUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))
vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: (...args: unknown[]) => mockGetCachedUser(...args),
}))

import { PUT } from './route'

const USER = { id: 'user-1' }

beforeEach(() => {
  mockGetCachedUser.mockReset()
  mockFrom.mockReset()
  mockGetCachedUser.mockResolvedValue(USER)
})

function putRequest(body: unknown) {
  return new Request('http://localhost/api/spend-limit-alias', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Body die geen geldige JSON is — treft het parse-guard-pad van parseBody. */
function malformedRequest() {
  return new Request('http://localhost/api/spend-limit-alias', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: '{ dit is geen json',
  })
}

/** `.update().eq()` → `{ error }`, met de aanroepen zichtbaar voor asserties. */
function mockUpdateChain(error: unknown = null) {
  const eq = vi.fn().mockResolvedValue({ error })
  const update = vi.fn().mockReturnValue({ eq })
  mockFrom.mockReturnValue({ update })
  return { update, eq }
}

describe('PUT /api/spend-limit-alias', () => {
  it('401 zonder sessie, met de app-brede tekst', async () => {
    mockGetCachedUser.mockResolvedValue(null)

    const res = await PUT(putRequest({ alias: 'schaamtepot' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Niet ingelogd' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 (geen 500) bij een onbekende alias — en er wordt niets geschreven', async () => {
    const res = await PUT(putRequest({ alias: 'potje' }))

    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij een ontbrekende alias', async () => {
    const res = await PUT(putRequest({}))

    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij malformed JSON in plaats van een 500', async () => {
    const res = await PUT(malformedRequest())

    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it.each(['grenzenpot', 'schaamtepot'] as const)(
    '200 + own-row update voor %s',
    async (alias) => {
      const { update, eq } = mockUpdateChain()

      const res = await PUT(putRequest({ alias }))

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, alias })
      expect(mockFrom).toHaveBeenCalledWith('profiles')
      expect(update).toHaveBeenCalledWith({ spend_limit_alias: alias })
      expect(eq).toHaveBeenCalledWith('id', USER.id) // RLS-scoped op de eigen rij
    },
  )

  it('500 bij een DB-fout, zonder de rauwe fouttekst te lekken', async () => {
    mockUpdateChain({ message: 'kolom bestaat niet', code: '42703' })

    const res = await PUT(putRequest({ alias: 'schaamtepot' }))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('42703')
    expect(JSON.stringify(body)).not.toContain('kolom bestaat niet')
  })
})

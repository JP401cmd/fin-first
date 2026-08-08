import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor PUT /api/euro-view — de profiel-brede euro-weergave.
 *
 * Borgt het contract waar `EuroViewProvider` (lib/hooks/use-euro-view.tsx) op
 * leunt. Die provider zet de keuze OPTIMISTISCH en rolt alleen terug op een
 * niet-ok antwoord — hij leest verder niets uit de body. De statuscodes zijn dus
 * het hele contract:
 *   - 401 zonder sessie (app-brede tekst 'Niet ingelogd')
 *   - 400 bij een ongeldige/ontbrekende `view` en bij malformed JSON
 *   - 200 + own-row update (`.eq('id', user.id)`) bij 'nominal' / 'real'
 *   - 500 bij een DB-fout → de client rolt terug
 *
 * Twee dingen worden hier expliciet vastgepind omdat ze eerder fout gingen:
 *   1. Het body-veld heet `view`, NIET `mode` — `mode` is display-mode. Een
 *      route die `mode` zou lezen, geeft op elke echte client-call een 400.
 *   2. De update gaat op de EIGEN rij via de anon RLS-client. Verdwijnt de
 *      `.eq('id', user.id)`, dan schrijft de call over alle rijen die de policy
 *      toelaat — dat mag nooit stil regresseren.
 *
 * Er wordt bewust met échte `Request`-objecten gewerkt (zoals
 * app/api/ai-execution-prefs/route.test.ts) i.p.v. een handmatig `json()`-stub,
 * zodat `parseBody` en het malformed-JSON-pad daadwerkelijk doorlopen worden.
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
  return new Request('http://localhost/api/euro-view', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Body die geen geldige JSON is — treft het parse-guard-pad van parseBody. */
function malformedRequest() {
  return new Request('http://localhost/api/euro-view', {
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

describe('PUT /api/euro-view', () => {
  it('401 zonder sessie, met de app-brede tekst', async () => {
    mockGetCachedUser.mockResolvedValue(null)

    const res = await PUT(putRequest({ view: 'real' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Niet ingelogd' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij een ongeldige view — en er wordt niets geschreven', async () => {
    const res = await PUT(putRequest({ view: 'toekomstig' }))

    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij een ontbrekende view', async () => {
    const res = await PUT(putRequest({}))

    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij malformed JSON in plaats van een 500', async () => {
    const res = await PUT(malformedRequest())

    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it("400 wanneer de client 'mode' stuurt in plaats van 'view'", async () => {
    // Regressiepin op het contract: display-mode gebruikt `mode`, deze route
    // niet. Zou de route beide accepteren, dan verhult dat een verkeerd veld.
    const res = await PUT(putRequest({ mode: 'real' }))

    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it.each(['nominal', 'real'] as const)('200 + own-row update voor %s', async (view) => {
    const { update, eq } = mockUpdateChain()

    const res = await PUT(putRequest({ view }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, view })
    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ euro_view: view })
    expect(eq).toHaveBeenCalledWith('id', USER.id) // RLS-scoped op de eigen rij
  })

  it('500 bij een DB-fout, zonder de rauwe fouttekst te lekken', async () => {
    mockUpdateChain({ message: 'relation "profiles" kapot', code: '42P01' })

    const res = await PUT(putRequest({ view: 'real' }))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('42P01')
    expect(JSON.stringify(body)).not.toContain('kapot')
  })
})

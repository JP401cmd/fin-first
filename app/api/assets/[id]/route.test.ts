import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Tests voor DELETE /api/assets/[id] — de SOFT-delete van een bezitting.
 *
 * Twee dingen worden hier vastgezet, en beide zijn eerder misgegaan:
 *
 * 1. **Geen valse succesmelding.** De oude client-update
 *    (`components/app/core/assets/asset-pane.tsx`) deed `.update()` zónder
 *    `.eq('user_id')` en zónder `.select()`. Op een huishoud-gedeelde rij van de
 *    partner blokkeert RLS de schrijfactie, maar 0 geraakte rijen levert
 *    `error: null` — de gebruiker kreeg "verwijderd" te zien terwijl er niets
 *    gebeurde. De route moet daarom 404 geven zodra `maybeSingle()` `null`
 *    teruggeeft, en de eigenaarsfilter moet in de keten zitten.
 *
 * 2. **Geen hard delete.** `assets` heeft zes `ON DELETE CASCADE`-kinderen
 *    (`crypto_holdings`, `investment_holdings`, `broker_connections`,
 *    `exchange_connections`, `wallet_addresses`, `_legacy_holdings`). Eén hard
 *    delete wist daarmee het complete holdings-grootboek van dat bezit. De
 *    `chain.delete`-tripwire hieronder is de enige mechanische bescherming van
 *    dat feit — zie ook `app/api/budgets/[id]/route.test.ts`, waar dezelfde
 *    truc de archiveer-semantiek bewaakt.
 *
 * Mocking-strategie één-op-één van `app/api/budgets/[id]/route.test.ts`.
 */

const mockAuthGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
}))

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const USER_ID = 'user-uuid-1111'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function callDelete(id: string) {
  const mod = await import('./route')
  const req = {} as unknown as NextRequest
  return mod.DELETE(req, makeParams(id))
}

/**
 * Chainable query-builder mock. `resolveWith` is wat de keten oplevert bij
 * `.maybeSingle()` of bij `await`. `updateSpy` vangt de update-payload op.
 * `chain.delete` gooit: deze route mag NOOIT hard verwijderen.
 */
function makeChain(resolveWith: unknown, updateSpy?: (...args: unknown[]) => void) {
  const chain: Record<string, unknown> = {}
  const self = () => chain

  chain.select = vi.fn(self)
  chain.eq = vi.fn(self)
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolveWith))
  chain.single = vi.fn(() => Promise.resolve(resolveWith))
  chain.update = updateSpy
    ? vi.fn((...args: unknown[]) => { updateSpy(...args); return chain })
    : vi.fn(self)
  chain.delete = vi.fn(() => {
    throw new Error(
      'DELETE /api/assets/[id] mag NOOIT .delete() aanroepen: een hard delete op ' +
        '`assets` vaagt via ON DELETE CASCADE zes kindtabellen weg ' +
        '(crypto_holdings, investment_holdings, broker_connections, ' +
        'exchange_connections, wallet_addresses, _legacy_holdings) — het complete ' +
        'holdings-grootboek van dat bezit. Soft delete via is_active=false.',
    )
  })

  ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolveWith).then(resolve)

  return chain
}

describe('DELETE /api/assets/[id] — soft delete met eerlijke 404', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAuthGetUser.mockReset()
    mockFrom.mockReset()
  })

  it('geeft 401 wanneer niet ingelogd', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await callDelete(VALID_UUID)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/ingelogd/i)
    // Geen enkele query bij een niet-ingelogde aanroeper.
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('geeft 404 bij een malformed uuid (niet 400, niet 500)', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const res = await callDelete('not-a-uuid')

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('Bezitting niet gevonden')
    // De vorm-controle staat vóór de query — Postgres zou anders 500'en op de cast.
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('REGRESSIE: geeft 404 wanneer 0 rijen geraakt zijn (gedeelde rij van de partner)', async () => {
    // Dit is de kern van de bug: RLS blokkeert de update op een partner-rij,
    // maar Postgrest meldt geen error — alleen `data: null`. Zonder deze 404
    // toont de UI een succes-toast voor een actie die niet gebeurd is.
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))

    const res = await callDelete(VALID_UUID)

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('Bezitting niet gevonden')
  })

  it('geeft 500 (generieke tekst) wanneer de update een PostgrestError oplevert', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockFrom.mockReturnValue(
      makeChain({ data: null, error: { message: 'permission denied for table assets' } }),
    )

    const res = await callDelete(VALID_UUID)

    expect(res.status).toBe(500)
    const body = await res.json()
    // Nooit de rauwe DB-melding naar de client (ADR 0044 / AVG).
    expect(body.error).not.toContain('permission denied')
  })

  it('happy path: zet is_active=false op de eigen rij en geeft 200', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const updateSpy = vi.fn()
    const chain = makeChain({ data: { id: VALID_UUID }, error: null }, updateSpy)
    mockFrom.mockReturnValue(chain)

    const res = await callDelete(VALID_UUID)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ id: VALID_UUID })

    expect(mockFrom).toHaveBeenCalledWith('assets')
    // Precies één schrijfpad, en dat is de soft-delete-vlag.
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy.mock.calls[0][0]).toEqual({ is_active: false })

    // Eigenaarsfilter én id-filter zitten in de keten. De user_id-filter is wat
    // de partner-rij tot 0 rijen (en dus 404) maakt in plaats van een stille no-op.
    const eqCalls = (chain.eq as ReturnType<typeof vi.fn>).mock.calls
    expect(eqCalls).toContainEqual(['id', VALID_UUID])
    expect(eqCalls).toContainEqual(['user_id', USER_ID])

    // Tripwire: de route heeft geen hard delete geprobeerd.
    expect(chain.delete).not.toHaveBeenCalled()
  })

  it('gebruikt geen .eq("is_active", true) — een tweede klik blijft idempotent 200', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const chain = makeChain({ data: { id: VALID_UUID }, error: null })
    mockFrom.mockReturnValue(chain)

    const res = await callDelete(VALID_UUID)

    expect(res.status).toBe(200)
    const eqCalls = (chain.eq as ReturnType<typeof vi.fn>).mock.calls
    expect(eqCalls.map((c) => c[0])).not.toContain('is_active')
  })
})

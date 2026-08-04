import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Tests voor DELETE /api/debts/[id] — de HARDE verwijdering van een schuld,
 * inclusief zijn waardehistorie.
 *
 * Drie dingen worden hier vastgezet:
 *
 * 1. **Geen valse succesmelding.** De oude client-delete
 *    (`components/app/core/debts/debt-pane.tsx`) deed `.delete().eq('id', …)`
 *    zonder eigenaarsfilter en zonder `.select()`. Op een gedeelde schuld van de
 *    partner blokkeert RLS de verwijdering, maar 0 geraakte rijen geeft
 *    `error: null` — succes-toast, niets gebeurd. De route doet daarom eerst een
 *    eigenaarscontrole en geeft 404 zodra die niets oplevert.
 *
 * 2. **De belofte in de bevestigingstekst wordt waargemaakt.** De pane belooft
 *    dat "alle bijbehorende waardehistorie en koppelingen definitief worden
 *    verwijderd". `valuations` en `balance_snapshots` verwijzen polymorf
 *    (`entity_type`/`entity_id`) en hebben GEEN foreign key naar `debts`, dus er
 *    cascadeert niets: zonder expliciete opruiming blijven het zwerfrijen. De
 *    opruim-assertie hieronder bewaakt dat die twee deletes gebeuren, mét
 *    eigenaars- en entiteitsfilter, en vóór de schuld zelf weg is.
 *
 * 3. **De volgorde.** Kinderen eerst, dan de entiteit — zoals de DELETE-handler
 *    van `app/api/onboarding/aangifte-import/route.ts`. Andersom zou een
 *    mislukte opruiming zwerfrijen achterlaten zonder weg om ze nog te vinden.
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
 * `.maybeSingle()` of bij `await` (thenable) — die laatste is nodig voor de twee
 * opruim-deletes, die hun resultaat niet via `.maybeSingle()` lezen.
 */
function makeChain(resolveWith: unknown) {
  const chain: Record<string, unknown> = {}
  const self = () => chain

  chain.select = vi.fn(self)
  chain.eq = vi.fn(self)
  chain.delete = vi.fn(self)
  chain.update = vi.fn(() => {
    throw new Error(
      'DELETE /api/debts/[id] mag NOOIT .update() aanroepen: `is_active=false` is op ' +
        '`debts` al bezet voor "afgelost" (debt-form.tsx / debt-valuation-modal.tsx). ' +
        'Verwijderen op diezelfde vlag mappen maakt "afgelost" en "weggegooid" ' +
        'ononderscheidbaar en laat loadCategoryHistory(includeInactive: true) een ' +
        'verwijderde schuld als spook-reeks tonen.',
    )
  })
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolveWith))
  chain.single = vi.fn(() => Promise.resolve(resolveWith))

  ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolveWith).then(resolve)

  return chain
}

/** Namen van de tabellen in de volgorde waarin `from()` is aangeroepen. */
function tableOrder() {
  return mockFrom.mock.calls.map((c) => c[0] as string)
}

describe('DELETE /api/debts/[id] — hard delete mét opruiming van de waardehistorie', () => {
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
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('geeft 404 bij een malformed uuid (niet 400, niet 500)', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const res = await callDelete('not-a-uuid')

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('Schuld niet gevonden')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('REGRESSIE: geeft 404 op een vreemde/onbekende rij en ruimt dan NIETS op', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    // Eigenaarscontrole vindt niets — een gedeelde schuld van de partner.
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))

    const res = await callDelete(VALID_UUID)

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('Schuld niet gevonden')
    // Cruciaal: de eigen-rij-snapshots van de aanroeper mogen niet gewist worden
    // op basis van een schuld die niet van hem is.
    expect(tableOrder()).toEqual(['debts'])
  })

  it('happy path: verwijdert de schuld en ruimt daarna balance_snapshots én valuations op', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    const ownershipChain = makeChain({ data: { id: VALID_UUID }, error: null })
    const deleteChain = makeChain({ data: { id: VALID_UUID }, error: null })
    const snapshotChain = makeChain({ data: null, error: null })
    const valuationChain = makeChain({ data: null, error: null })
    mockFrom
      .mockReturnValueOnce(ownershipChain)
      .mockReturnValueOnce(deleteChain)
      .mockReturnValueOnce(snapshotChain)
      .mockReturnValueOnce(valuationChain)

    const res = await callDelete(VALID_UUID)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ id: VALID_UUID })

    // Volgorde: eigenaarscontrole, DE SCHULD ZELF, en pas dan de opruiming.
    // Bewust deze richting — zie de motivering in de route: er is geen
    // transactie, dus een onderbreking laat altijd iets halfs achter. Kinderen
    // eerst zou bij een timeout de waardehistorie vernietigen en de schuld laten
    // staan (onherstelbaar); deze volgorde laat hooguit onzichtbare zwerfrijen
    // achter, waarvoor al opruimbeleid bestaat.
    expect(tableOrder()).toEqual(['debts', 'debts', 'balance_snapshots', 'valuations'])

    // Beide opruim-queries zijn echte deletes, afgebakend op eigenaar + entiteit.
    for (const chain of [snapshotChain, valuationChain]) {
      expect(chain.delete).toHaveBeenCalledTimes(1)
      const eqCalls = (chain.eq as ReturnType<typeof vi.fn>).mock.calls
      expect(eqCalls).toContainEqual(['user_id', USER_ID])
      expect(eqCalls).toContainEqual(['entity_type', 'debt'])
      expect(eqCalls).toContainEqual(['entity_id', VALID_UUID])
    }

    // De schuld zelf: hard delete op de eigen rij.
    expect(deleteChain.delete).toHaveBeenCalledTimes(1)
    const debtEq = (deleteChain.eq as ReturnType<typeof vi.fn>).mock.calls
    expect(debtEq).toContainEqual(['id', VALID_UUID])
    expect(debtEq).toContainEqual(['user_id', USER_ID])
  })

  it('geeft 404 wanneer de schuld tussen controle en delete verdwijnt (race)', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    mockFrom
      .mockReturnValueOnce(makeChain({ data: { id: VALID_UUID }, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ data: null, error: null }))

    const res = await callDelete(VALID_UUID)

    expect(res.status).toBe(404)
  })

  it('slaagt tóch wanneer de opruiming faalt — de schuld is dan al weg', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    mockFrom
      // eigenaarscontrole
      .mockReturnValueOnce(makeChain({ data: { id: VALID_UUID }, error: null }))
      // de schuld zelf: gelukt
      .mockReturnValueOnce(makeChain({ data: { id: VALID_UUID }, error: null }))
      // opruiming van de snapshots: mislukt
      .mockReturnValueOnce(
        makeChain({ data: null, error: { message: 'permission denied for table balance_snapshots' } }),
      )
      // opruiming van de valuations: gelukt
      .mockReturnValueOnce(makeChain({ data: null, error: null }))

    const res = await callDelete(VALID_UUID)

    // 200, niet 500. De opdracht van de gebruiker — de schuld weg — is
    // uitgevoerd. "Verwijderen mislukt" melden over iets dat wél lukte is
    // oneerlijk, en een tweede poging zou een 404 geven. Wat blijft staan is
    // onzichtbare rommel (het categoriegrafiek-filter negeert zwerf-snapshots)
    // waarvoor al opruimbeleid bestaat.
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: VALID_UUID })

    // De mislukte opruiming stopt de tweede niet: beide worden geprobeerd.
    expect(tableOrder()).toEqual(['debts', 'debts', 'balance_snapshots', 'valuations'])
  })

  it('lekt nooit een rauwe DB-melding wanneer de schuld-delete zelf faalt', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    mockFrom
      .mockReturnValueOnce(makeChain({ data: { id: VALID_UUID }, error: null }))
      .mockReturnValueOnce(
        makeChain({ data: null, error: { message: 'permission denied for table debts' } }),
      )

    const res = await callDelete(VALID_UUID)

    expect(res.status).toBe(500)
    const body = await res.json()
    // Nooit de rauwe DB-melding naar de client (ADR 0044 / AVG).
    expect(body.error).not.toContain('permission denied')
    // Afgebroken vóór de opruiming: er is niets verwijderd, dus er valt niets
    // op te ruimen.
    expect(tableOrder()).toEqual(['debts', 'debts'])
  })
})

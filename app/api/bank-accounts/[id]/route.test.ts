import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

/**
 * Tests voor GET + DELETE /api/bank-accounts/[id] — de impact-preview en de
 * verwijdering van een betaalrekening.
 *
 * Twee dingen staan hier op het spel en allebei zijn ze onomkeerbaar:
 *
 * 1. De preview voedt de tekst van een destructieve bevestiging. Een teller die
 *    stilzwijgend 0 wordt terwijl er duizenden boekingen hangen, is erger dan
 *    geen teller. Daarom de expliciete `count: null → transactionCount: null`-test.
 * 2. De verwijdering zelf hoort volledig in de RPC te zitten. Zodra de route
 *    zélf iets weggooit, valt die schrijfactie buiten de transactie en kan een
 *    fout halverwege een half opgeruimde rekening achterlaten.
 *
 * Mocking-strategie gespiegeld op app/api/budgets/[id]/route.test.ts.
 */

const mockAuthGetUser = vi.fn()
const mockAuthGetClaims = vi.fn()
const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase/server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/server')>(
    '@/lib/supabase/server',
  )
  return {
    ...actual,
    createClient: vi.fn(async () => ({
      auth: { getUser: mockAuthGetUser, getClaims: mockAuthGetClaims },
      from: mockFrom,
      rpc: mockRpc,
    })),
  }
})

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const USER_ID = 'user-uuid-1111'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

/**
 * Chainable query-builder mock. `resolveWith` is wat de chain oplevert bij
 * `await` (thenable) of via `.maybeSingle()`/`.single()`.
 *
 * `delete`/`insert`/`update` gooien: dit routebestand mag voor de verwijdering
 * geen enkele eigen schrijfactie doen — alles hoort in `delete_bank_account`.
 * Zelfde vangnet als budgets/[id]/route.test.ts:57.
 */
function makeChain(resolveWith: unknown) {
  const chain: Record<string, unknown> = {}
  const self = () => chain

  chain.select = vi.fn(self)
  chain.eq = vi.fn(self)
  chain.in = vi.fn(self)
  chain.limit = vi.fn(self)
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolveWith))
  chain.single = vi.fn(() => Promise.resolve(resolveWith))
  const forbid = (verb: string) => () => {
    throw new Error(`route mag NOOIT .${verb}() aanroepen — alle mutatie hoort in de RPC`)
  }
  chain.delete = vi.fn(forbid('delete'))
  chain.insert = vi.fn(forbid('insert'))
  chain.update = vi.fn(forbid('update'))

  ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(resolveWith).then(resolve)

  return chain
}

/** Request-dubbel met een body; `undefined` bootst een verzoek zónder body na. */
function makeReq(body?: unknown): NextRequest {
  return {
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected end of JSON input')
      return body
    },
  } as unknown as NextRequest
}

async function callDelete(id: string, body?: unknown) {
  const mod = await import('./route')
  return mod.DELETE(makeReq(body), makeParams(id))
}

async function callGet(id: string) {
  const mod = await import('./route')
  return mod.GET({} as unknown as NextRequest, makeParams(id))
}

/** Standaard-tabelmocks voor het GET-pad; per test te overschrijven. */
function mockGetTables(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    bank_accounts: { data: { id: VALID_UUID, name: 'Betaalrekening', is_archive_bucket: false }, error: null },
    transactions: { count: 12, error: null },
    recurring_transactions: { count: 3, error: null },
    bank_connection_accounts: { data: [], error: null },
  }
  const table = { ...defaults, ...overrides }
  mockFrom.mockImplementation((name: string) => makeChain(table[name]))
}

beforeEach(() => {
  vi.resetModules()
  mockAuthGetUser.mockReset()
  mockAuthGetClaims.mockReset()
  mockFrom.mockReset()
  mockRpc.mockReset()
})

describe('DELETE /api/bank-accounts/[id]', () => {
  const OK_ROW = {
    archive_account_id: null,
    moved_transactions: 0,
    deleted_transactions: 0,
    stopped_recurrings: 0,
    released_links: 0,
    deactivated_asset_id: null,
  }

  function authenticated() {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
  }

  it('geeft 401 zonder sessie', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null })

    const res = await callDelete(VALID_UUID, { transactions: 'keep' })

    expect(res.status).toBe(401)
    expect((await res.json()).error).toMatch(/ingelogd/i)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('geeft 404 bij een malformed uuid — zonder de database aan te raken', async () => {
    authenticated()

    const res = await callDelete('geen-uuid', { transactions: 'delete' })

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Rekening niet gevonden')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('geeft 400 bij een ontbrekende body — nooit stil in de destructieve tak', async () => {
    authenticated()

    const res = await callDelete(VALID_UUID)

    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('geeft 400 bij een onbekende waarde voor `transactions`', async () => {
    authenticated()

    const res = await callDelete(VALID_UUID, { transactions: 'iets-anders' })

    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('happy path "keep": roept de RPC aan met p_keep_transactions true', async () => {
    authenticated()
    mockRpc.mockResolvedValue({
      data: [{ ...OK_ROW, moved_transactions: 42, stopped_recurrings: 2 }],
      error: null,
    })

    const res = await callDelete(VALID_UUID, { transactions: 'keep' })

    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('delete_bank_account', {
      p_account_id: VALID_UUID,
      p_keep_transactions: true,
    })
    // camelCase naar de client; de RPC levert snake_case.
    expect(await res.json()).toEqual({
      id: VALID_UUID,
      movedTransactions: 42,
      deletedTransactions: 0,
      stoppedRecurrings: 2,
    })
  })

  it('happy path "delete": roept de RPC aan met p_keep_transactions false', async () => {
    authenticated()
    mockRpc.mockResolvedValue({ data: [{ ...OK_ROW, deleted_transactions: 42 }], error: null })

    const res = await callDelete(VALID_UUID, { transactions: 'delete' })

    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('delete_bank_account', {
      p_account_id: VALID_UUID,
      p_keep_transactions: false,
    })
    expect((await res.json()).deletedTransactions).toBe(42)
  })

  it('verwijdert NIETS buiten de RPC om — geen enkele eigen tabel-mutatie', async () => {
    authenticated()
    mockRpc.mockResolvedValue({ data: [OK_ROW], error: null })
    // Elke .delete()/.update()/.insert() op een tabel gooit (zie makeChain).
    // Zo'n schrijfactie zou buiten de transactie van delete_bank_account vallen
    // en bij een fout een half opgeruimde rekening achterlaten.
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))

    const res = await callDelete(VALID_UUID, { transactions: 'delete' })

    expect(res.status).toBe(200)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  const FOUTMAPPING: Array<[string, number, RegExp]> = [
    ['TF404', 404, /niet gevonden/i],
    ['TF409', 409, /archiefrekening/i],
    ['TF410', 409, /partner/i],
    ['23503', 409, /gekoppeld/i],
    // 55000 = het archief kon niet worden aangemaakt. De RPC gooit dit in stap 4,
    // dus vóór élke destructieve stap: rekening, transacties en koppeling zijn
    // dan nog ongemoeid. Daarom een herhaalbaar advies met "er is niets
    // gewijzigd" i.p.v. een kale 500 — die belofte moet blijven kloppen.
    ['55000', 409, /niets gewijzigd/i],
  ]

  it.each(FOUTMAPPING)(
    'vertaalt SQLSTATE %s naar de afgesproken status en vaste tekst',
    async (code, status, textPattern) => {
      authenticated()
      mockRpc.mockResolvedValue({
        data: null,
        error: { code, message: 'rauwe db-melding met interne details', details: '', hint: '' },
      })

      const res = await callDelete(VALID_UUID, { transactions: 'delete' })

      expect(res.status).toBe(status)
      const body = await res.json()
      expect(body.error).toMatch(textPattern)
      // De rauwe DB-melding blijft server-side (CLAUDE.md/AVG).
      expect(JSON.stringify(body)).not.toContain('rauwe db-melding')
    },
  )

  it('geeft 500 bij een onbekende fout, zonder de rauwe melding in de body', async () => {
    authenticated()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42P01', message: 'relation "bank_accounts" does not exist' },
    })

    const res = await callDelete(VALID_UUID, { transactions: 'delete' })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('does not exist')
    spy.mockRestore()
  })

  it('geeft 500 als de RPC geen rij teruggeeft — nooit stilzwijgend "gelukt"', async () => {
    authenticated()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({ data: [], error: null })

    const res = await callDelete(VALID_UUID, { transactions: 'keep' })

    expect(res.status).toBe(500)
    spy.mockRestore()
  })
})

describe('GET /api/bank-accounts/[id] — impact-preview', () => {
  function authenticated() {
    mockAuthGetClaims.mockResolvedValue({ data: { claims: { sub: USER_ID } }, error: null })
  }

  it('geeft 401 zonder sessie', async () => {
    mockAuthGetClaims.mockResolvedValue({ data: null, error: null })

    const res = await callGet(VALID_UUID)

    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('geeft 404 bij een malformed uuid', async () => {
    authenticated()

    const res = await callGet('geen-uuid')

    expect(res.status).toBe(404)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('geeft 404 als de rekening niet van deze gebruiker is', async () => {
    authenticated()
    mockGetTables({ bank_accounts: { data: null, error: null } })

    const res = await callGet(VALID_UUID)

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Rekening niet gevonden')
  })

  it('levert de tellingen en de koppelstatus', async () => {
    authenticated()
    mockGetTables({
      bank_connection_accounts: { data: [{ id: 'link-1' }], error: null },
    })

    const res = await callGet(VALID_UUID)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      id: VALID_UUID,
      name: 'Betaalrekening',
      transactionCount: 12,
      recurringCount: 3,
      hasBankLink: true,
      isArchiveBucket: false,
    })
  })

  it('markeert de archiefrekening als zodanig', async () => {
    authenticated()
    mockGetTables({
      bank_accounts: { data: { id: VALID_UUID, name: 'Archief', is_archive_bucket: true }, error: null },
    })

    const res = await callGet(VALID_UUID)

    expect((await res.json()).isArchiveBucket).toBe(true)
  })

  it('geeft transactionCount null als de count ontbreekt — NOOIT 0', async () => {
    authenticated()
    // `error: null` én `count: null`: een geslaagde respons zonder getal, bv.
    // doordat de Content-Range-header onderweg gestript is. Als 0 tellen zou de
    // bevestiging "0 boekingen" beloven boven een knop die er duizenden weggooit.
    mockGetTables({
      transactions: { count: null, error: null },
      recurring_transactions: { count: null, error: null },
    })

    const res = await callGet(VALID_UUID)

    const body = await res.json()
    expect(body.transactionCount).toBeNull()
    expect(body.recurringCount).toBeNull()
  })

  it('geeft transactionCount null als de telling faalt', async () => {
    authenticated()
    mockGetTables({ transactions: { count: null, error: { message: 'boom' } } })

    const res = await callGet(VALID_UUID)

    expect((await res.json()).transactionCount).toBeNull()
  })

  it('gaat bij een onleesbare koppeling uit van een koppeling (waarschuwing te veel is onschadelijk)', async () => {
    authenticated()
    mockGetTables({ bank_connection_accounts: { data: null, error: { message: 'boom' } } })

    const res = await callGet(VALID_UUID)

    expect((await res.json()).hasBankLink).toBe(true)
  })
})

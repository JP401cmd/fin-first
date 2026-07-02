import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Contract-test voor GET/PUT /api/horizon-kernel-flags — de beheer-toggle van de
 * FASE 5-kernel-vlaggen (ADR 0032 §6). Spiegelt het mock-patroon van
 * `app/api/display-mode/route.test.ts`: `@/lib/supabase/server` gemockt, het
 * profielen-chain-mock levert zowel de own-row `.select().eq().single()`-read als de
 * `.update().eq()`-write. Borgt:
 *   - 401 zonder sessie (GET + PUT);
 *   - GET leest own-row en vertaalt naar de vlaggen-stand;
 *   - PUT-whitelist-afwijzing (onbekende vlag) + non-boolean `enabled` → 400;
 *   - aanzetten schrijft uitsluitend een letterlijke `true`;
 *   - uitzetten VERWIJDERT de sleutel (JSONB schoon);
 *   - beide DB-paden op de EIGEN rij (`.eq('id', user.id)`), geen service-role;
 *   - 500 bij DB-fout.
 */

const mockCreateClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

import { GET, PUT } from '@/app/api/horizon-kernel-flags/route'

const USER = { id: 'user-1' }

interface ClientOpts {
  user?: { id: string } | null
  readData?: { feature_preferences?: Record<string, unknown> | null } | null
  readError?: unknown
  writeError?: unknown
}

/**
 * Bouwt een supabase-clientmock met losse spies voor de select- en update-chain,
 * zodat een test kan asserten dat beide op de eigen rij scopen.
 */
function makeClient(opts: ClientOpts = {}) {
  const { user = USER, readData = { feature_preferences: {} }, readError = null, writeError = null } = opts

  const single = vi.fn().mockResolvedValue({ data: readData, error: readError })
  const selectEq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq: selectEq })

  const updateEq = vi.fn().mockResolvedValue({ error: writeError })
  const update = vi.fn().mockReturnValue({ eq: updateEq })

  const from = vi.fn().mockReturnValue({ select, update })
  const getUser = vi.fn().mockResolvedValue({ data: { user } })

  const client = { auth: { getUser }, from }
  mockCreateClient.mockResolvedValue(client)
  return { client, spies: { from, select, selectEq, single, update, updateEq, getUser } }
}

function putRequest(body: unknown, malformed = false) {
  return {
    json: () => (malformed ? Promise.reject(new Error('bad json')) : Promise.resolve(body)),
  } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  mockCreateClient.mockReset()
})

describe('GET /api/horizon-kernel-flags', () => {
  it('401 zonder sessie', async () => {
    const { spies } = makeClient({ user: null })
    const res = await GET()
    expect(res.status).toBe(401)
    expect(spies.from).not.toHaveBeenCalled()
  })

  it('leest own-row en vertaalt naar vlaggen-stand', async () => {
    const { spies } = makeClient({
      readData: { feature_preferences: { horizon_kernel_convergentie: true } },
    })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      flags: { convergentie: true, whatif: false, household: false, scalar: false },
    })
    expect(spies.from).toHaveBeenCalledWith('profiles')
    expect(spies.selectEq).toHaveBeenCalledWith('id', USER.id) // own-row
  })

  it('500 bij DB-fout', async () => {
    makeClient({ readError: { message: 'boom' } })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('PUT /api/horizon-kernel-flags', () => {
  it('401 zonder sessie', async () => {
    const { spies } = makeClient({ user: null })
    const res = await PUT(putRequest({ flag: 'convergentie', enabled: true }))
    expect(res.status).toBe(401)
    expect(spies.from).not.toHaveBeenCalled()
  })

  it('400 bij malformed body', async () => {
    makeClient()
    const res = await PUT(putRequest(null, true))
    expect(res.status).toBe(400)
  })

  it('400 bij onbekende vlag (whitelist)', async () => {
    const { spies } = makeClient()
    const res = await PUT(putRequest({ flag: 'horizon_kernel_convergentie', enabled: true }))
    expect(res.status).toBe(400)
    expect(spies.update).not.toHaveBeenCalled()
  })

  it('400 bij non-boolean enabled', async () => {
    const { spies } = makeClient()
    const res = await PUT(putRequest({ flag: 'convergentie', enabled: 'true' }))
    expect(res.status).toBe(400)
    expect(spies.update).not.toHaveBeenCalled()
  })

  it('aanzetten schrijft uitsluitend een letterlijke true (own-row)', async () => {
    const { spies } = makeClient({ readData: { feature_preferences: {} } })
    const res = await PUT(putRequest({ flag: 'convergentie', enabled: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      flags: { convergentie: true, whatif: false, household: false, scalar: false },
    })
    expect(spies.update).toHaveBeenCalledWith({
      feature_preferences: { horizon_kernel_convergentie: true },
    })
    expect(spies.updateEq).toHaveBeenCalledWith('id', USER.id) // own-row
  })

  it('uitzetten VERWIJDERT de sleutel (JSONB schoon)', async () => {
    const { spies } = makeClient({
      readData: { feature_preferences: { horizon_kernel_whatif: true, iets_anders: 1 } },
    })
    const res = await PUT(putRequest({ flag: 'whatif', enabled: false }))
    expect(res.status).toBe(200)
    // whatif-sleutel weg, ongerelateerde sleutel blijft staan
    expect(spies.update).toHaveBeenCalledWith({ feature_preferences: { iets_anders: 1 } })
    const { flags } = (await res.json()) as { flags: Record<string, boolean> }
    expect(flags.whatif).toBe(false)
  })

  it('500 bij write-fout', async () => {
    makeClient({ writeError: { message: 'boom' } })
    const res = await PUT(putRequest({ flag: 'scalar', enabled: true }))
    expect(res.status).toBe(500)
  })

  it('500 bij read-fout', async () => {
    makeClient({ readError: { message: 'boom' } })
    const res = await PUT(putRequest({ flag: 'scalar', enabled: true }))
    expect(res.status).toBe(500)
  })
})

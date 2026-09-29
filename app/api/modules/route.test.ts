import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALL_MODULES } from '@/lib/module-registry'

/**
 * Tests voor PUT /api/modules — de productkeuze Krant ⇄ Geheel (ADR 0184).
 *
 * Borgt:
 *   - 401 zonder sessie (app-brede tekst 'Niet ingelogd'), niets geschreven
 *   - 400 bij een onbekend product, een modulelijst i.p.v. een product, een
 *     extra veld (strictObject) en malformed JSON — nooit een 500 op invoer
 *   - beide presets: krant → ['nieuws'] + home 'nieuws'; geheel → alle
 *     modules + home 'overzicht', in één update op de eigen rij
 *   - geen delete: alleen `.update()` op `profiles`, nergens anders
 *   - 500 zonder DB-details bij een DB-fout (bv. de oude CHECK, 23514)
 *   - de route importeert de service-client niet (bron-scan)
 *
 * Gespiegeld op app/api/home-screen/route.test.ts, met échte
 * `Request`-objecten zodat `parseBody` en het malformed-JSON-pad doorlopen
 * worden.
 */

const mockGetVerifiedUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))
vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: (...args: unknown[]) => mockGetVerifiedUser(...args),
  getVerifiedUser: (...args: unknown[]) => mockGetVerifiedUser(...args),
}))

import { PUT } from './route'

const USER = { id: 'user-1' }

beforeEach(() => {
  mockGetVerifiedUser.mockReset()
  mockFrom.mockReset()
  mockGetVerifiedUser.mockResolvedValue(USER)
})

function putRequest(body: unknown) {
  return new Request('http://localhost/api/modules', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function malformedRequest() {
  return new Request('http://localhost/api/modules', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: '{ dit is geen json',
  })
}

/**
 * `.update().eq()` → `{ error }`. Een `delete`/`upsert`/`insert` op de chain
 * bestaat bewust niet: roept de route die aan, dan crasht de test.
 */
function mockUpdateChain(error: unknown = null) {
  const eq = vi.fn().mockResolvedValue({ error })
  const update = vi.fn().mockReturnValue({ eq })
  mockFrom.mockReturnValue({ update })
  return { update, eq }
}

describe('PUT /api/modules — toegang en invoer', () => {
  it('401 zonder sessie, met de app-brede tekst, en er wordt niets geschreven', async () => {
    mockGetVerifiedUser.mockResolvedValue(null)

    const res = await PUT(putRequest({ product: 'krant' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Niet ingelogd' })
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it.each([
    ['een onbekend product', { product: 'budget' }],
    ['een ontbrekend product', {}],
    ['een modulelijst in plaats van een product', { modules: ['nieuws'] }],
    ['een extra veld naast het product', { product: 'krant', home_screen: 'budget' }],
    ['een extra modules-veld naast het product', { product: 'geheel', modules: ['nieuws'] }],
    ['een niet-string product', { product: 1 }],
  ])('400 (geen 500) bij %s — en er wordt niets geschreven', async (_naam, body) => {
    const res = await PUT(putRequest(body))

    expect(res.status).toBe(400)
    expect(typeof (await res.json()).error).toBe('string')
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij malformed JSON in plaats van een 500', async () => {
    const res = await PUT(malformedRequest())

    expect(res.status).toBe(400)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('PUT /api/modules — de twee presets', () => {
  it("krant → active_modules ['nieuws'] en home_screen 'nieuws', op de eigen rij", async () => {
    const { update, eq } = mockUpdateChain()

    const res = await PUT(putRequest({ product: 'krant' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, modules: ['nieuws'], homeScreen: 'nieuws' })
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({ active_modules: ['nieuws'], home_screen: 'nieuws' })
    expect(eq).toHaveBeenCalledWith('id', USER.id) // RLS-scoped op de eigen rij
  })

  it("geheel → alle modules in catalogusvolgorde en home_screen 'overzicht', op de eigen rij", async () => {
    const { update, eq } = mockUpdateChain()

    const res = await PUT(putRequest({ product: 'geheel' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, modules: ALL_MODULES, homeScreen: 'overzicht' })
    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(update).toHaveBeenCalledWith({ active_modules: ALL_MODULES, home_screen: 'overzicht' })
    expect(eq).toHaveBeenCalledWith('id', USER.id)
  })

  it('schrijft een verse array — de preset en ALL_MODULES blijven onaangeraakt', async () => {
    const { update } = mockUpdateChain()

    await PUT(putRequest({ product: 'geheel' }))

    const geschreven = update.mock.calls[0][0].active_modules as string[]
    expect(geschreven).not.toBe(ALL_MODULES)
    geschreven.pop()
    expect(ALL_MODULES).toHaveLength(6)
  })

  it('500 bij een DB-fout (bv. de oude CHECK), zonder de rauwe fouttekst te lekken', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockUpdateChain({ message: 'violates check constraint "profiles_home_screen_check"', code: '23514' })

    const res = await PUT(putRequest({ product: 'krant' }))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('23514')
    expect(JSON.stringify(body)).not.toContain('profiles_home_screen_check')
    spy.mockRestore()
  })
})

describe('PUT /api/modules — bron-scan', () => {
  const src = readFileSync(join(__dirname, 'route.ts'), 'utf8')

  it('gebruikt nooit de service-client', () => {
    expect(src).not.toMatch(/supabase\/service/)
    expect(src).not.toMatch(/getServiceClient|SERVICE_ROLE/)
  })

  it('schrijft uitsluitend met update op de eigen rij — geen delete, insert of upsert', () => {
    expect(src).toMatch(/\.eq\('id', user\.id\)/)
    expect(src).not.toMatch(/\.(delete|insert|upsert)\(/)
  })
})

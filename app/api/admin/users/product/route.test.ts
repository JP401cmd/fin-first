import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALL_MODULES } from '@/lib/module-registry'
import { PRODUCT_PRESETS } from '@/lib/modules/resolve'

/**
 * Tests voor POST /api/admin/users/product — beheer zet een account om naar
 * Krant of Geheel (Krant 2D fase 1, besluit B12: terug naar alleen de Krant
 * loopt via support).
 *
 * Borgt:
 *   - 401 zonder sessie, 403 voor een niet-superadmin — service-client onaangeraakt
 *   - 400 (zod strict) bij een ongeldige userId, onbekend product, extra veld
 *   - beide presets, uit PRODUCT_PRESETS: krant → ['nieuws'] + home 'nieuws';
 *     geheel → alle modules + home 'overzicht'
 *   - 404 als het account niet bestaat, zonder schrijfactie
 *   - logAdminAction met actie 'user.product'
 *   - NIETS GEWIST: de enige schrijfactie is één update op `profiles`; de
 *     mock-chain kent geen delete (een aanroep zou crashen), en een bron-scan
 *     weigert .delete(/.insert(/.upsert( in de route
 *   - geen inhoud (ADR 0146): van `profiles` leest de route alleen id + full_name
 */

const mockGetUser = vi.fn()
const mockIsSuperAdmin = vi.fn()
const mockLogAdminAction = vi.fn()
const mockServiceFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: vi.fn(() => ({ from: mockServiceFrom })),
}))
vi.mock('@/lib/admin', () => ({
  isSuperAdmin: (...args: unknown[]) => mockIsSuperAdmin(...args),
}))
vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}))

import { POST } from './route'

const SUPERADMIN = { id: 'admin-1', email: 'admin@trifinity.nl' }
const TARGET_ID = '4f1c2a7e-9b3d-4e8a-8c21-5d6f7a8b9c0d'

function postRequest(body: unknown) {
  return new Request('http://localhost/api/admin/users/product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * De service-client: `select().eq().maybeSingle()` voor de bestaanscontrole en
 * `update().eq()` voor de schrijfactie. Een `delete`/`insert`/`upsert` bestaat
 * bewust niet op deze chain: roept de route die aan, dan crasht de test.
 */
function mockService(target: { id: string; full_name: string | null } | null = {
  id: TARGET_ID,
  full_name: 'Test Lezer',
}) {
  const select = vi.fn()
  const update = vi.fn()
  const updateEq = vi.fn().mockResolvedValue({ error: null })
  const selectEq = vi.fn()
  const maybeSingle = vi.fn().mockResolvedValue({ data: target, error: null })
  select.mockReturnValue({ eq: selectEq })
  selectEq.mockReturnValue({ maybeSingle })
  update.mockReturnValue({ eq: updateEq })
  mockServiceFrom.mockImplementation(() => ({ select, update }))
  return { select, selectEq, update, updateEq }
}

beforeEach(() => {
  mockGetUser.mockReset()
  mockIsSuperAdmin.mockReset()
  mockLogAdminAction.mockReset().mockResolvedValue(undefined)
  mockServiceFrom.mockReset()
  mockGetUser.mockResolvedValue({ data: { user: SUPERADMIN } })
  mockIsSuperAdmin.mockResolvedValue(true)
})

describe('POST /api/admin/users/product — toegang', () => {
  it('401 zonder sessie, geen service-client-aanraking', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(postRequest({ userId: TARGET_ID, product: 'krant' }))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'Niet ingelogd' })
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })

  it('403 voor een ingelogde niet-superadmin, geen service-client-aanraking', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await POST(postRequest({ userId: TARGET_ID, product: 'geheel' }))
    expect(res.status).toBe(403)
    expect(mockServiceFrom).not.toHaveBeenCalled()
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/users/product — invoer (zod strict)', () => {
  it.each([
    ['een ontbrekende userId', { product: 'krant' }],
    ['een userId die geen uuid is', { userId: 'user-1', product: 'krant' }],
    ['een onbekend product', { userId: TARGET_ID, product: 'budget' }],
    ['een modulelijst in plaats van een product', { userId: TARGET_ID, modules: ['nieuws'] }],
    ['een extra veld', { userId: TARGET_ID, product: 'geheel', home_screen: 'budget' }],
  ])('400 bij %s — en er wordt niets geschreven', async (_naam, body) => {
    const res = await POST(postRequest(body))
    expect(res.status).toBe(400)
    expect(typeof (await res.json()).error).toBe('string')
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/users/product — de presets', () => {
  it("krant → active_modules ['nieuws'] en home_screen 'nieuws', op de doelrij", async () => {
    const { update, updateEq } = mockService()

    const res = await POST(postRequest({ userId: TARGET_ID, product: 'krant' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, product: 'krant', modules: ['nieuws'], homeScreen: 'nieuws' })
    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({ active_modules: ['nieuws'], home_screen: 'nieuws' })
    expect(updateEq).toHaveBeenCalledWith('id', TARGET_ID)
  })

  it("geheel → alle modules en home_screen 'overzicht', gelijk aan PRODUCT_PRESETS", async () => {
    const { update, updateEq } = mockService()

    const res = await POST(postRequest({ userId: TARGET_ID, product: 'geheel' }))

    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({
      active_modules: [...PRODUCT_PRESETS.geheel.modules],
      home_screen: PRODUCT_PRESETS.geheel.homeScreen,
    })
    expect(update.mock.calls[0][0].active_modules).toEqual(ALL_MODULES)
    expect(update.mock.calls[0][0].home_screen).toBe('overzicht')
    expect(updateEq).toHaveBeenCalledWith('id', TARGET_ID)
  })

  it('logt de beheeractie als user.product, met alleen het doel', async () => {
    mockService()

    await POST(postRequest({ userId: TARGET_ID, product: 'krant' }))

    expect(mockLogAdminAction).toHaveBeenCalledTimes(1)
    expect(mockLogAdminAction.mock.calls[0][1]).toEqual({
      actorId: SUPERADMIN.id,
      actorEmail: SUPERADMIN.email,
      action: 'user.product',
      targetUser: TARGET_ID,
      targetLabel: 'Test Lezer',
      detail: { to: 'krant' },
    })
  })

  it('404 als het account niet bestaat — geen schrijfactie, geen log', async () => {
    const { update } = mockService(null)

    const res = await POST(postRequest({ userId: TARGET_ID, product: 'geheel' }))

    expect(res.status).toBe(404)
    expect(update).not.toHaveBeenCalled()
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/users/product — er wordt niets gewist', () => {
  it('raakt uitsluitend profiles aan: één select (id, full_name) en één update', async () => {
    const { select, update } = mockService()

    await POST(postRequest({ userId: TARGET_ID, product: 'krant' }))

    // Elke tabel die de route aanraakt: alleen profiles.
    expect(mockServiceFrom.mock.calls.map((c) => c[0])).toEqual(['profiles', 'profiles'])
    expect(select).toHaveBeenCalledWith('id, full_name')
    expect(update).toHaveBeenCalledTimes(1)
    // De update schrijft precies de twee productkolommen — niets anders.
    expect(Object.keys(update.mock.calls[0][0]).sort()).toEqual(['active_modules', 'home_screen'])
  })

  it('bron-scan: geen delete, insert of upsert in de route', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/admin/users/product/route.ts'), 'utf8')
    expect(src).not.toMatch(/\.(delete|insert|upsert)\(/)
  })
})

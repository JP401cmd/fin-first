import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET/POST /api/admin/user-groups — gebruikersgroepen beheren (ADR 0147, fase 3).
 *
 * Vastgelegd:
 *   - superadmin-gate: 401/403, en dan géén service-role-aanraking;
 *   - GET telt leden per statische groep (dynamisch: 0), leest met de
 *     service-role en geeft bij een niet-uitgerolde tabel een lege lijst;
 *   - POST valideert met zod (statisch zonder regels, dynamisch met), schrijft
 *     `regels: null` bij statisch, antwoordt 201 en logt `group.create`;
 *   - POST op een niet-uitgerolde tabel is een nette 503, geen 500.
 */

type Resultaat = { data?: unknown; error: unknown; count?: number | null }
interface Aanroep {
  tabel: string
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete'
  payload?: unknown
  selectOpts?: unknown
  eq: [string, unknown][]
}

let serviceResultaten: Record<string, Resultaat[]>
let serviceCalls: Aanroep[]
const mockGetUser = vi.fn()
const mockIsSuperAdmin = vi.fn()
const mockLogAdminAction = vi.fn()

function keten(tabel: string) {
  const call: Aanroep = { tabel, op: 'select', eq: [] }
  serviceCalls.push(call)
  const volgende = (): Resultaat => serviceResultaten[tabel]?.shift() ?? { data: null, error: null }
  const k: Record<string, unknown> = {}
  k.select = (_kolommen?: string, opts?: unknown) => ((call.selectOpts = opts), k)
  for (const m of ['order', 'range', 'in']) k[m] = () => k
  k.eq = (kolom: string, waarde: unknown) => (call.eq.push([kolom, waarde]), k)
  k.insert = (rij: unknown) => ((call.op = 'insert'), (call.payload = rij), k)
  k.maybeSingle = async () => volgende()
  k.single = async () => volgende()
  k.then = (resolve: (r: Resultaat) => unknown) => resolve(volgende())
  return k
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: vi.fn(() => ({ from: (t: string) => keten(t) })),
}))
vi.mock('@/lib/admin', () => ({ isSuperAdmin: (...a: unknown[]) => mockIsSuperAdmin(...a) }))
vi.mock('@/lib/admin-audit', () => ({ logAdminAction: (...a: unknown[]) => mockLogAdminAction(...a) }))

import { GET, POST } from './route'

const SUPERADMIN = { id: 'admin-1', email: 'admin@trifinity.nl' }
const G1 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const G2 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'

function groepRij(over: Record<string, unknown> = {}) {
  return {
    id: G1,
    naam: 'Interviewkandidaten',
    omschrijving: null,
    soort: 'statisch',
    regels: null,
    created_at: '2026-09-15T10:00:00.000Z',
    updated_at: '2026-09-15T10:00:00.000Z',
    ...over,
  }
}

function req(body: unknown) {
  return new Request('http://localhost/api/admin/user-groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  serviceResultaten = {}
  serviceCalls = []
  mockGetUser.mockReset().mockResolvedValue({ data: { user: SUPERADMIN } })
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  mockLogAdminAction.mockReset().mockResolvedValue(undefined)
})

describe('superadmin-gate', () => {
  it('GET → 401 zonder sessie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    expect((await GET()).status).toBe(401)
    expect(serviceCalls).toHaveLength(0)
  })

  it('POST → 403 zonder superadmin, ook met geldige body', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await POST(req({ naam: 'X', soort: 'statisch' }))
    expect(res.status).toBe(403)
    expect(serviceCalls).toHaveLength(0)
  })
})

describe('GET', () => {
  it('geeft groepen met hun ledental; dynamisch telt geen leden', async () => {
    serviceResultaten = {
      user_groups: [
        {
          data: [
            groepRij(),
            groepRij({ id: G2, naam: 'Toekomstgebruikers', soort: 'dynamisch', regels: [{ soort: 'actieve_dagen_30', min: 3 }] }),
          ],
          error: null,
        },
      ],
      user_group_members: [{ count: 3, error: null }],
    }

    const res = await GET()
    expect(res.status).toBe(200)
    const data = (await res.json()) as { groepen: Record<string, unknown>[] }
    expect(data.groepen).toEqual([
      expect.objectContaining({ id: G1, soort: 'statisch', regels: null, leden: 3 }),
      expect.objectContaining({ id: G2, soort: 'dynamisch', regels: [{ soort: 'actieve_dagen_30', min: 3 }], leden: 0 }),
    ])

    // Eén head-telling, alleen voor de statische groep.
    const tellingen = serviceCalls.filter((c) => c.tabel === 'user_group_members')
    expect(tellingen).toHaveLength(1)
    expect(tellingen[0].selectOpts).toEqual({ count: 'exact', head: true })
    expect(tellingen[0].eq).toEqual([['group_id', G1]])
  })

  it('een mislukte telling is 0, geen 500', async () => {
    serviceResultaten = {
      user_groups: [{ data: [groepRij()], error: null }],
      user_group_members: [{ count: null, error: { code: '42P01' } }],
    }
    const data = (await (await GET()).json()) as { groepen: { leden: number }[] }
    expect(data.groepen[0].leden).toBe(0)
  })

  it('tabel nog niet uitgerold → lege lijst', async () => {
    serviceResultaten = { user_groups: [{ data: null, error: { code: 'PGRST205', message: 'not found' } }] }
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ groepen: [] })
  })

  it('een andere DB-fout is een 500 zonder rauwe tekst', async () => {
    serviceResultaten = { user_groups: [{ data: null, error: { code: '42501', message: 'geheim-detail' } }] }
    const res = await GET()
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('geheim-detail')
  })
})

describe('POST', () => {
  it('maakt een statische groep met regels null, 201 en audit', async () => {
    serviceResultaten = { user_groups: [{ data: groepRij({ omschrijving: 'Voor de interviews' }), error: null }] }

    const res = await POST(req({ naam: ' Interviewkandidaten ', omschrijving: 'Voor de interviews', soort: 'statisch' }))
    expect(res.status).toBe(201)

    const insert = serviceCalls.find((c) => c.op === 'insert')
    expect(insert?.tabel).toBe('user_groups')
    expect(insert?.payload).toEqual({
      naam: 'Interviewkandidaten',
      omschrijving: 'Voor de interviews',
      soort: 'statisch',
      regels: null,
    })

    const data = (await res.json()) as { groep: Record<string, unknown> }
    expect(data.groep).toMatchObject({ id: G1, soort: 'statisch', regels: null, leden: 0 })

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'group.create',
        targetLabel: 'Interviewkandidaten',
        detail: { id: G1, soort: 'statisch', regels: 0 },
      }),
    )
  })

  it('maakt een dynamische groep mét regels', async () => {
    const regels = [{ soort: 'dominante_stroom', stroom: 'toekomst' }]
    serviceResultaten = { user_groups: [{ data: groepRij({ id: G2, soort: 'dynamisch', regels }), error: null }] }

    const res = await POST(req({ naam: 'Toekomst', soort: 'dynamisch', regels }))
    expect(res.status).toBe(201)
    expect((serviceCalls.find((c) => c.op === 'insert')?.payload as { regels: unknown }).regels).toEqual(regels)
  })

  it('400 op een dynamische groep zonder regels, zonder schrijfactie', async () => {
    const res = await POST(req({ naam: 'Leeg', soort: 'dynamisch', regels: [] }))
    expect(res.status).toBe(400)
    expect(serviceCalls).toHaveLength(0)
  })

  it('400 op een statische groep met regels', async () => {
    const res = await POST(req({ naam: 'Mix', soort: 'statisch', regels: [{ soort: 'actieve_dagen_30', min: 3 }] }))
    expect(res.status).toBe(400)
    expect(serviceCalls).toHaveLength(0)
  })

  it('tabel nog niet uitgerold → 503, geen audit', async () => {
    serviceResultaten = { user_groups: [{ data: null, error: { code: '42P01' } }] }
    const res = await POST(req({ naam: 'X', soort: 'statisch' }))
    expect(res.status).toBe(503)
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })
})

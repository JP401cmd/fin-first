import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET/PUT/DELETE /api/admin/user-groups/[id] — één gebruikersgroep (ADR 0147,
 * fase 3).
 *
 * Vastgelegd:
 *   - superadmin-gate (401/403) vóór alles; een niet-uuid is een 404 zonder
 *     service-role-aanroep;
 *   - GET: 404 op onbekend; leden met e-mail via de RPC, en `email: null` als
 *     die RPC faalt; een dynamische groep heeft geen leden;
 *   - PUT: de soort is onveranderlijk (400, geen update); 404 op onbekend en op
 *     een groep die tussen lezen en schrijven verdween; audit `group.update`;
 *   - DELETE: 404 op onbekend; audit `group.delete` met naam, soort en het
 *     aantal leden.
 */

type Resultaat = { data?: unknown; error: unknown; count?: number | null }
interface Aanroep {
  tabel: string
  op: 'select' | 'update' | 'delete'
  payload?: unknown
  eq: [string, unknown][]
}

let serviceResultaten: Record<string, Resultaat[]>
let serviceCalls: Aanroep[]
let rpcResultaat: Resultaat
const mockRpc = vi.fn()
const mockGetUser = vi.fn()
const mockIsSuperAdmin = vi.fn()
const mockLogAdminAction = vi.fn()

function keten(tabel: string) {
  const call: Aanroep = { tabel, op: 'select', eq: [] }
  serviceCalls.push(call)
  const volgende = (): Resultaat => serviceResultaten[tabel]?.shift() ?? { data: null, error: null }
  const k: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'range', 'in']) k[m] = () => k
  k.eq = (kolom: string, waarde: unknown) => (call.eq.push([kolom, waarde]), k)
  k.update = (rij: unknown) => ((call.op = 'update'), (call.payload = rij), k)
  k.delete = () => ((call.op = 'delete'), k)
  k.maybeSingle = async () => volgende()
  k.single = async () => volgende()
  k.then = (resolve: (r: Resultaat) => unknown) => resolve(volgende())
  return k
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: vi.fn(() => ({ from: (t: string) => keten(t), rpc: (...a: unknown[]) => mockRpc(...a) })),
}))
vi.mock('@/lib/admin', () => ({ isSuperAdmin: (...a: unknown[]) => mockIsSuperAdmin(...a) }))
vi.mock('@/lib/admin-audit', () => ({ logAdminAction: (...a: unknown[]) => mockLogAdminAction(...a) }))

import { DELETE, GET, PUT } from './route'

const SUPERADMIN = { id: 'admin-1', email: 'admin@trifinity.nl' }
const GID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const U1 = '11111111-2222-4333-8444-555555555555'
const U2 = '66666666-7777-4888-8999-000000000000'
const params = (id = GID) => ({ params: Promise.resolve({ id }) })

function groepRij(over: Record<string, unknown> = {}) {
  return {
    id: GID,
    naam: 'Interviewkandidaten',
    omschrijving: null,
    soort: 'statisch',
    regels: null,
    created_at: '2026-09-15T10:00:00.000Z',
    updated_at: '2026-09-15T10:00:00.000Z',
    ...over,
  }
}

function put(body: unknown) {
  return new Request(`http://localhost/api/admin/user-groups/${GID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const leeg = new Request('http://localhost')

beforeEach(() => {
  serviceResultaten = {}
  serviceCalls = []
  rpcResultaat = { data: [], error: null }
  mockRpc.mockReset().mockImplementation(async () => rpcResultaat)
  mockGetUser.mockReset().mockResolvedValue({ data: { user: SUPERADMIN } })
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  mockLogAdminAction.mockReset().mockResolvedValue(undefined)
})

describe('poort en id', () => {
  it('403 zonder superadmin op alle drie de methodes', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    expect((await GET(leeg, params())).status).toBe(403)
    expect((await PUT(put({ naam: 'X', soort: 'statisch' }), params())).status).toBe(403)
    expect((await DELETE(leeg, params())).status).toBe(403)
    expect(serviceCalls).toHaveLength(0)
  })

  it('401 zonder sessie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    expect((await GET(leeg, params())).status).toBe(401)
  })

  it('404 op een niet-uuid, zonder service-role-aanroep', async () => {
    expect((await GET(leeg, params('geen-uuid'))).status).toBe(404)
    expect((await DELETE(leeg, params('geen-uuid'))).status).toBe(404)
    expect(serviceCalls).toHaveLength(0)
  })
})

describe('GET', () => {
  it('404 op een onbekende groep', async () => {
    serviceResultaten = { user_groups: [{ data: null, error: null }] }
    expect((await GET(leeg, params())).status).toBe(404)
  })

  it('statische groep: leden met e-mail via de RPC', async () => {
    serviceResultaten = {
      user_groups: [{ data: groepRij(), error: null }],
      user_group_members: [
        {
          data: [
            { user_id: U1, added_at: '2026-09-15T11:00:00.000Z' },
            { user_id: U2, added_at: '2026-09-15T12:00:00.000Z' },
          ],
          error: null,
        },
      ],
    }
    rpcResultaat = { data: [{ id: U1, email: 'een@test.nl' }], error: null }

    const res = await GET(leeg, params())
    expect(res.status).toBe(200)
    const data = (await res.json()) as { groep: Record<string, unknown>; leden: unknown[] }
    expect(data.groep).toMatchObject({ id: GID, soort: 'statisch', regels: null })
    expect(data.leden).toEqual([
      { user_id: U1, email: 'een@test.nl', added_at: '2026-09-15T11:00:00.000Z' },
      { user_id: U2, email: null, added_at: '2026-09-15T12:00:00.000Z' },
    ])
    expect(mockRpc).toHaveBeenCalledWith('admin_emails_for_user_ids', { p_ids: [U1, U2] })
    // De inzage in adressen wordt gelogd — met het aantal, niet de adressen.
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'group.leden.inzage', targetLabel: GID, detail: { leden: 2 } }),
    )
  })

  it('een falende e-mail-RPC geeft email null, geen 500', async () => {
    serviceResultaten = {
      user_groups: [{ data: groepRij(), error: null }],
      user_group_members: [{ data: [{ user_id: U1, added_at: null }], error: null }],
    }
    rpcResultaat = { data: null, error: { code: 'PGRST202' } }

    const res = await GET(leeg, params())
    expect(res.status).toBe(200)
    const data = (await res.json()) as { leden: { email: string | null }[] }
    expect(data.leden).toEqual([{ user_id: U1, email: null, added_at: null }])
  })

  it('dynamische groep: geen ledenquery en geen leden', async () => {
    serviceResultaten = {
      user_groups: [{ data: groepRij({ soort: 'dynamisch', regels: [{ soort: 'actieve_dagen_30', min: 3 }] }), error: null }],
    }
    const data = (await (await GET(leeg, params())).json()) as { leden: unknown[] }
    expect(data.leden).toEqual([])
    expect(serviceCalls.filter((c) => c.tabel === 'user_group_members')).toHaveLength(0)
    // Geen leden, geen adressen, dus ook geen inzage-regel.
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })
})

describe('PUT', () => {
  it('de soort kan niet veranderen: 400 en geen update', async () => {
    serviceResultaten = { user_groups: [{ data: { id: GID, soort: 'statisch' }, error: null }] }
    const res = await PUT(put({ naam: 'X', soort: 'dynamisch', regels: [{ soort: 'actieve_dagen_30', min: 3 }] }), params())
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe(
      'De soort van een groep kan niet veranderen — maak een nieuwe groep',
    )
    expect(serviceCalls.filter((c) => c.op === 'update')).toHaveLength(0)
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })

  it('404 op een onbekende groep', async () => {
    serviceResultaten = { user_groups: [{ data: null, error: null }] }
    expect((await PUT(put({ naam: 'X', soort: 'statisch' }), params())).status).toBe(404)
    expect(serviceCalls.filter((c) => c.op === 'update')).toHaveLength(0)
  })

  it('404 als de groep tussen lezen en schrijven verdween', async () => {
    serviceResultaten = {
      user_groups: [
        { data: { id: GID, soort: 'statisch' }, error: null },
        { data: null, error: null },
      ],
    }
    expect((await PUT(put({ naam: 'X', soort: 'statisch' }), params())).status).toBe(404)
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })

  it('wijzigt naam, omschrijving en regels en logt group.update', async () => {
    const regels = [{ soort: 'laatst_actief_binnen', dagen: 14 }]
    serviceResultaten = {
      user_groups: [
        { data: { id: GID, soort: 'dynamisch' }, error: null },
        { data: groepRij({ naam: 'Recent actief', soort: 'dynamisch', regels }), error: null },
      ],
    }

    const res = await PUT(put({ naam: 'Recent actief', omschrijving: null, soort: 'dynamisch', regels }), params())
    expect(res.status).toBe(200)

    const update = serviceCalls.find((c) => c.op === 'update')
    expect(update?.eq).toEqual([['id', GID]])
    expect(update?.payload).toMatchObject({ naam: 'Recent actief', omschrijving: null, regels })
    // De soort zelf staat nooit in de update.
    expect(update?.payload).not.toHaveProperty('soort')

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'group.update',
        targetLabel: 'Recent actief',
        detail: { id: GID, soort: 'dynamisch', regels: 1 },
      }),
    )
  })
})

describe('DELETE', () => {
  it('404 op een onbekende groep, zonder audit', async () => {
    serviceResultaten = {
      user_group_members: [{ count: 0, error: null }],
      user_groups: [{ data: null, error: null }],
    }
    expect((await DELETE(leeg, params())).status).toBe(404)
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })

  it('wist de groep en logt naam, soort en het aantal leden', async () => {
    serviceResultaten = {
      user_group_members: [{ count: 7, error: null }],
      user_groups: [{ data: { id: GID, naam: 'Interviewkandidaten', soort: 'statisch' }, error: null }],
    }

    const res = await DELETE(leeg, params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })

    const del = serviceCalls.find((c) => c.op === 'delete')
    expect(del?.tabel).toBe('user_groups')
    expect(del?.eq).toEqual([['id', GID]])

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'group.delete',
        targetLabel: 'Interviewkandidaten',
        detail: { id: GID, soort: 'statisch', leden: 7 },
      }),
    )
  })
})

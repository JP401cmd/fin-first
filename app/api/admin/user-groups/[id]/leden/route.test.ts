import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PUT /api/admin/user-groups/[id]/leden — de volledige ledenlijst van een
 * statische groep (ADR 0147, fase 3).
 *
 * Vastgelegd:
 *   - superadmin-gate (403) en 404 op een niet-uuid of onbekende groep;
 *   - 400 op een dynamische groep (die heeft regels, geen leden);
 *   - synchronisatie: ontbrekende leden upsert met ON CONFLICT DO NOTHING,
 *     weggehaalde leden eruit via `.in('user_id', …)` — ongewijzigd = niets;
 *   - een onbekende user_id (FK 23503) is een 400, geen 500;
 *   - audit `group.leden` met de toegevoegde en verwijderde id's;
 *   - het antwoord geeft de leden met e-mail (RPC).
 */

type Resultaat = { data?: unknown; error: unknown }
interface Aanroep {
  tabel: string
  op: 'select' | 'upsert' | 'delete'
  payload?: unknown
  opts?: unknown
  eq: [string, unknown][]
  in: [string, unknown[]][]
}

let serviceResultaten: Record<string, Resultaat[]>
let serviceCalls: Aanroep[]
let rpcResultaat: Resultaat
const mockRpc = vi.fn()
const mockGetUser = vi.fn()
const mockIsSuperAdmin = vi.fn()
const mockLogAdminAction = vi.fn()

function keten(tabel: string) {
  const call: Aanroep = { tabel, op: 'select', eq: [], in: [] }
  serviceCalls.push(call)
  const volgende = (): Resultaat => serviceResultaten[tabel]?.shift() ?? { data: null, error: null }
  const k: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'range']) k[m] = () => k
  k.eq = (kolom: string, waarde: unknown) => (call.eq.push([kolom, waarde]), k)
  k.in = (kolom: string, waarden: unknown[]) => (call.in.push([kolom, waarden]), k)
  k.upsert = (rij: unknown, opts?: unknown) => ((call.op = 'upsert'), (call.payload = rij), (call.opts = opts), k)
  k.delete = () => ((call.op = 'delete'), k)
  k.maybeSingle = async () => volgende()
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

import { PUT } from './route'

const SUPERADMIN = { id: 'admin-1', email: 'admin@trifinity.nl' }
const GID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const U1 = '11111111-2222-4333-8444-555555555555'
const U2 = '66666666-7777-4888-8999-000000000000'
const U3 = '99999999-8888-4777-8666-555555555555'
const params = (id = GID) => ({ params: Promise.resolve({ id }) })

function req(body: unknown) {
  return new Request(`http://localhost/api/admin/user-groups/${GID}/leden`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const STATISCH = { data: { id: GID, naam: 'Interviewkandidaten', soort: 'statisch' }, error: null }

beforeEach(() => {
  serviceResultaten = {}
  serviceCalls = []
  rpcResultaat = { data: [], error: null }
  mockRpc.mockReset().mockImplementation(async () => rpcResultaat)
  mockGetUser.mockReset().mockResolvedValue({ data: { user: SUPERADMIN } })
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  mockLogAdminAction.mockReset().mockResolvedValue(undefined)
})

describe('PUT /api/admin/user-groups/[id]/leden', () => {
  it('403 zonder superadmin, geen service-role-aanroep', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    expect((await PUT(req({ user_ids: [U1] }), params())).status).toBe(403)
    expect(serviceCalls).toHaveLength(0)
  })

  it('404 op een niet-uuid en op een onbekende groep', async () => {
    expect((await PUT(req({ user_ids: [] }), params('x'))).status).toBe(404)
    expect(serviceCalls).toHaveLength(0)

    serviceResultaten = { user_groups: [{ data: null, error: null }] }
    expect((await PUT(req({ user_ids: [U1] }), params())).status).toBe(404)
  })

  it('400 op een ongeldige user_id (zod), vóór elke service-aanroep', async () => {
    expect((await PUT(req({ user_ids: ['geen-uuid'] }), params())).status).toBe(400)
    expect(serviceCalls).toHaveLength(0)
  })

  it('400 op een dynamische groep, zonder schrijfactie', async () => {
    serviceResultaten = { user_groups: [{ data: { id: GID, naam: 'Dyn', soort: 'dynamisch' }, error: null }] }
    const res = await PUT(req({ user_ids: [U1] }), params())
    expect(res.status).toBe(400)
    expect(serviceCalls.filter((c) => c.op !== 'select')).toHaveLength(0)
  })

  it('synchroniseert: ontbrekende erbij, weggehaalde eruit, en logt beide', async () => {
    serviceResultaten = {
      user_groups: [STATISCH],
      user_group_members: [
        { data: [{ user_id: U1, added_at: null }, { user_id: U2, added_at: null }], error: null }, // bestaand
        { data: null, error: null }, // upsert
        { data: null, error: null }, // delete
      ],
    }
    rpcResultaat = { data: [{ id: U2, email: 'twee@test.nl' }, { id: U3, email: 'drie@test.nl' }], error: null }

    const res = await PUT(req({ user_ids: [U2, U3, U3] }), params())
    expect(res.status).toBe(200)

    const upsert = serviceCalls.find((c) => c.op === 'upsert')
    expect(upsert?.payload).toEqual([{ group_id: GID, user_id: U3 }])
    expect(upsert?.opts).toEqual({ onConflict: 'group_id,user_id', ignoreDuplicates: true })

    const del = serviceCalls.find((c) => c.op === 'delete')
    expect(del?.eq).toEqual([['group_id', GID]])
    expect(del?.in).toEqual([['user_id', [U1]]])

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'group.leden',
        targetLabel: 'Interviewkandidaten',
        detail: { id: GID, leden: 2, toegevoegd: [U3], verwijderd: [U1] },
      }),
    )

    expect(await res.json()).toEqual({
      leden: [
        { user_id: U2, email: 'twee@test.nl' },
        { user_id: U3, email: 'drie@test.nl' },
      ],
    })
  })

  it('een ongewijzigde lijst schrijft niets', async () => {
    serviceResultaten = {
      user_groups: [STATISCH],
      user_group_members: [{ data: [{ user_id: U1, added_at: null }], error: null }],
    }
    const res = await PUT(req({ user_ids: [U1] }), params())
    expect(res.status).toBe(200)
    expect(serviceCalls.filter((c) => c.op === 'upsert' || c.op === 'delete')).toHaveLength(0)
  })

  it('een onbekende gebruiker (FK 23503) is een 400 zonder audit', async () => {
    serviceResultaten = {
      user_groups: [STATISCH],
      user_group_members: [
        { data: [], error: null },
        { data: null, error: { code: '23503', message: 'violates foreign key constraint' } },
      ],
    }
    const res = await PUT(req({ user_ids: [U1] }), params())
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('Een of meer gebruikers bestaan niet')
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })
})

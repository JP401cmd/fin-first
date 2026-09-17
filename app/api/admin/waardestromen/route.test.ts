import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ACTIVITY_MODULES } from '@/lib/activity/modules'
import { STANDAARD_WAARDESTROMEN } from '@/lib/waardestromen'

/**
 * GET/PUT /api/admin/waardestromen — beheer stelt de waardestromen samen
 * (ADR 0147, fase 2).
 *
 * Vastgelegd:
 *   - superadmin-gate: 401 zonder sessie, 403 zonder rol, en dan géén
 *     service-role-aanroep en geen schrijfactie;
 *   - GET zonder opgeslagen rij → de standaardindeling; de telling per app-deel
 *     heeft altijd precies één rij per module (onbekend eruit, ontbrekend 0);
 *   - een falende telling-RPC → `gebruik: null`, geen 500;
 *   - PUT schrijft de config als JSON-string via de sessie-client en logt het
 *     aantal stromen en hun id's;
 *   - een dubbele stroom-id is een 400, vóór elke schrijfactie.
 */

type Resultaat = { data: unknown; error: unknown }
interface Aanroep {
  tabel: string
  op: 'select' | 'upsert'
  payload?: unknown
  opts?: unknown
  eq: [string, unknown][]
}

let sessieResultaten: Record<string, Resultaat[]>
let sessieCalls: Aanroep[]
let rpcResultaat: Resultaat
const mockRpc = vi.fn()
const mockGetUser = vi.fn()
const mockIsSuperAdmin = vi.fn()
const mockLogAdminAction = vi.fn()

function keten(tabel: string) {
  const call: Aanroep = { tabel, op: 'select', eq: [] }
  sessieCalls.push(call)
  const volgende = (): Resultaat => sessieResultaten[tabel]?.shift() ?? { data: null, error: null }
  const k: Record<string, unknown> = {}
  k.select = () => k
  k.eq = (kolom: string, waarde: unknown) => (call.eq.push([kolom, waarde]), k)
  k.upsert = (rij: unknown, opts?: unknown) => ((call.op = 'upsert'), (call.payload = rij), (call.opts = opts), k)
  k.maybeSingle = async () => volgende()
  k.then = (resolve: (r: Resultaat) => unknown) => resolve(volgende())
  return k
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: (t: string) => keten(t) })),
}))
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: vi.fn(() => ({ rpc: (...a: unknown[]) => mockRpc(...a) })),
}))
vi.mock('@/lib/admin', () => ({ isSuperAdmin: (...a: unknown[]) => mockIsSuperAdmin(...a) }))
vi.mock('@/lib/admin-audit', () => ({ logAdminAction: (...a: unknown[]) => mockLogAdminAction(...a) }))

import { GET, PUT } from './route'

const SUPERADMIN = { id: 'admin-1', email: 'admin@trifinity.nl' }

function req(body: unknown) {
  return new Request('http://localhost/api/admin/waardestromen', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  sessieResultaten = {}
  sessieCalls = []
  rpcResultaat = { data: [], error: null }
  mockRpc.mockReset().mockImplementation(async () => rpcResultaat)
  mockGetUser.mockReset().mockResolvedValue({ data: { user: SUPERADMIN } })
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  mockLogAdminAction.mockReset().mockResolvedValue(undefined)
})

describe('superadmin-gate', () => {
  it('GET → 401 zonder sessie', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    expect((await GET()).status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('GET → 403 zonder superadmin, geen service-role-aanroep', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    expect((await GET()).status).toBe(403)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('PUT → 403 zonder superadmin, geen schrijfactie', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await PUT(req(STANDAARD_WAARDESTROMEN))
    expect(res.status).toBe(403)
    expect(sessieCalls.filter((c) => c.op === 'upsert')).toHaveLength(0)
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })
})

describe('GET', () => {
  it('zonder opgeslagen rij de standaardindeling, en één gebruik-rij per module', async () => {
    sessieResultaten = { app_settings: [{ data: null, error: null }] }
    rpcResultaat = {
      data: [
        { module: 'toekomst', gebruikers: '12' },
        { module: 'fin', gebruikers: 3 },
        { module: '/beheer', gebruikers: 99 },
      ],
      error: null,
    }

    const res = await GET()
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      waardestromen: unknown
      gebruik: { module: string; gebruikers: number }[]
    }

    expect(data.waardestromen).toEqual(STANDAARD_WAARDESTROMEN)
    expect(mockRpc).toHaveBeenCalledWith('admin_module_activity_counts')
    expect(data.gebruik.map((r) => r.module)).toEqual([...ACTIVITY_MODULES])
    expect(data.gebruik.find((r) => r.module === 'toekomst')?.gebruikers).toBe(12)
    expect(data.gebruik.find((r) => r.module === 'fin')?.gebruikers).toBe(3)
    expect(data.gebruik.find((r) => r.module === 'budget')?.gebruikers).toBe(0)
  })

  it('leest een opgeslagen JSON-string terug', async () => {
    const eigen = { stromen: [{ id: 'alles', naam: 'Alles', modules: ['overzicht', 'fin'] }] }
    sessieResultaten = { app_settings: [{ data: { value: JSON.stringify(eigen) }, error: null }] }
    const data = (await (await GET()).json()) as { waardestromen: unknown }
    expect(data.waardestromen).toEqual(eigen)
  })

  it('een falende telling-RPC (niet uitgerold) geeft gebruik null, geen 500', async () => {
    sessieResultaten = { app_settings: [{ data: null, error: null }] }
    rpcResultaat = { data: null, error: { code: 'PGRST202', message: 'function not found' } }

    const res = await GET()
    expect(res.status).toBe(200)
    const data = (await res.json()) as { gebruik: unknown }
    expect(data.gebruik).toBeNull()
  })
})

describe('PUT', () => {
  it('schrijft de config als JSON-string via de sessie-client en logt stromen + ids', async () => {
    sessieResultaten = { app_settings: [{ data: null, error: null }] }

    const res = await PUT(req(STANDAARD_WAARDESTROMEN))
    expect(res.status).toBe(200)

    const upsert = sessieCalls.find((c) => c.op === 'upsert')
    expect(upsert?.tabel).toBe('app_settings')
    expect(upsert?.opts).toEqual({ onConflict: 'key' })
    const rij = upsert?.payload as { key: string; value: string; updated_by: string }
    expect(rij.key).toBe('waardestromen')
    expect(rij.updated_by).toBe(SUPERADMIN.id)
    expect(JSON.parse(rij.value)).toEqual(STANDAARD_WAARDESTROMEN)

    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'config.update',
        targetLabel: 'waardestromen',
        detail: { stromen: 5, ids: ['vermogen', 'budget', 'toekomst', 'grip', 'fin'] },
      }),
    )
    const data = (await res.json()) as { success: boolean; waardestromen: unknown }
    expect(data).toEqual({ success: true, waardestromen: STANDAARD_WAARDESTROMEN })
  })

  it('400 op een dubbele stroom-id, zonder schrijfactie', async () => {
    const res = await PUT(
      req({
        stromen: [
          { id: 'budget', naam: 'Budget', modules: ['budget'] },
          { id: 'budget', naam: 'Budget 2', modules: ['toekomst'] },
        ],
      }),
    )
    expect(res.status).toBe(400)
    expect(sessieCalls.filter((c) => c.op === 'upsert')).toHaveLength(0)
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })

  it('400 op een id buiten de regex', async () => {
    const res = await PUT(req({ stromen: [{ id: 'Budget Sparen', naam: 'Budget', modules: ['budget'] }] }))
    expect(res.status).toBe(400)
  })

  it('500 als het wegschrijven faalt, zonder audit', async () => {
    sessieResultaten = { app_settings: [{ data: null, error: { code: '42501', message: 'denied' } }] }
    const res = await PUT(req(STANDAARD_WAARDESTROMEN))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('denied')
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })
})

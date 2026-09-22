import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/admin/news-duiding/terugtrekken (B4, ADR 0171). Contract:
 *  - 401 zonder sessie, 403 zonder superadmin — vóór er iets gelezen/geschreven wordt;
 *  - zod via parseBody (400 bij ongeldige body);
 *  - één geconditioneerde UPDATE (id + status 'geduid') die status, tijdstip,
 *    wie en reden in één keer schrijft;
 *  - idempotent (al teruggetrokken → 200, geen tweede audit), 404 bij onbekend,
 *    409 bij elke andere status;
 *  - audit in admin_actions_log; herberekening via de service-role, die bij
 *    falen de terugtrekking laat staan.
 */

const mockGetUser = vi.fn()
const mockIsSuperAdmin = vi.fn()
const mockLogAdminAction = vi.fn()
const mockHerbereken = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
}))
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: vi.fn(() => ({ service: true })),
}))
vi.mock('@/lib/admin', () => ({
  isSuperAdmin: (...args: unknown[]) => mockIsSuperAdmin(...args),
}))
vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}))
vi.mock('@/lib/krant/editie-herberekening', () => ({
  herberekenNaTerugtrekking: (...args: unknown[]) => mockHerbereken(...args),
}))

import { POST } from './route'

const ID = '3e2f9e8d-568a-4199-bf7e-f2f7e5b7091e'
const SUPERADMIN = { id: 'admin-1', email: 'admin@trifinity.nl' }

interface Staat {
  update: { data: unknown[] | null; error: unknown }
  lees: { data: unknown; error: unknown }
}
let staat: Staat
const updates: Array<{ velden: Record<string, unknown>; eq: Array<[string, unknown]> }> = []

function bouwMock() {
  mockFrom.mockImplementation((tabel: string) => {
    expect(tabel).toBe('news_articles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    let modus: 'update' | 'lees' = 'lees'
    const eq: Array<[string, unknown]> = []
    b.update = (velden: Record<string, unknown>) => {
      modus = 'update'
      updates.push({ velden, eq })
      return b
    }
    b.eq = (k: string, v: unknown) => {
      eq.push([k, v])
      return b
    }
    b.select = () => (modus === 'update' ? Promise.resolve(staat.update) : b)
    b.maybeSingle = () => Promise.resolve(staat.lees)
    return b
  })
}

function req(body: unknown) {
  return new Request('http://localhost/api/admin/news-duiding/terugtrekken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: SUPERADMIN } })
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  mockLogAdminAction.mockReset().mockResolvedValue(undefined)
  mockHerbereken.mockReset().mockResolvedValue({ edities: 2 })
  mockFrom.mockReset()
  updates.length = 0
  staat = { update: { data: [{ id: ID, title: 'Box 3 omhoog' }], error: null }, lees: { data: null, error: null } }
  bouwMock()
})

describe('gate', () => {
  it('401 zonder sessie, zonder DB-aanraking', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(req({ id: ID, reden: 'fout-getal' }))
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('403 zonder superadmin, zonder DB-aanraking', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await POST(req({ id: ID, reden: 'fout-getal' }))
    expect(res.status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })

  it('400 bij ongeldige body (geen JSON, onbekende reden, anders zonder toelichting)', async () => {
    for (const body of ['{kapot', { id: ID, reden: 'vrijgeven' }, { id: ID, reden: 'anders' }, { id: 'x', reden: 'fout-getal' }]) {
      const res = await POST(req(body))
      expect(res.status).toBe(400)
    }
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('terugtrekken', () => {
  it('schrijft status + wie + wanneer + waarom in één geconditioneerde update', async () => {
    const res = await POST(req({ id: ID, reden: 'fout-getal', toelichting: 'bron zegt 2,9%' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'teruggetrokken', alTeruggetrokken: false, edities: 2, herberekeningMislukt: false })
    expect(updates).toHaveLength(1)
    const { velden, eq } = updates[0]
    expect(velden.duiding_status).toBe('teruggetrokken')
    expect(velden.teruggetrokken_door).toBe(SUPERADMIN.id)
    expect(velden.teruggetrokken_reden).toBe('fout-getal')
    expect(typeof velden.teruggetrokken_at).toBe('string')
    // De duiding-jsonb blijft staan (de meting leest er het mechanisme van).
    expect(velden).not.toHaveProperty('duiding')
    expect(eq).toEqual([
      ['id', ID],
      ['duiding_status', 'geduid'],
    ])
  })

  it('logt de actie in admin_actions_log met reden en toelichting', async () => {
    await POST(req({ id: ID, reden: 'fout-getal', toelichting: 'bron zegt 2,9%' }))
    expect(mockLogAdminAction).toHaveBeenCalledTimes(1)
    expect(mockLogAdminAction.mock.calls[0][1]).toMatchObject({
      actorId: SUPERADMIN.id,
      actorEmail: SUPERADMIN.email,
      action: 'nieuws.duiding.terugtrekken',
      targetLabel: 'Box 3 omhoog',
      detail: { articleId: ID, reden: 'fout-getal', toelichting: 'bron zegt 2,9%' },
    })
  })

  it('herberekent de edities via de service-client met het artikel-id', async () => {
    await POST(req({ id: ID, reden: 'verkeerde-doelgroep' }))
    expect(mockHerbereken).toHaveBeenCalledWith({ service: true }, ID)
  })

  it('faalt de herberekening, dan blijft de terugtrekking staan en meldt de respons dat', async () => {
    mockHerbereken.mockRejectedValue(new Error('db weg: secret detail'))
    const res = await POST(req({ id: ID, reden: 'fout-getal' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: 'teruggetrokken', alTeruggetrokken: false, edities: null, herberekeningMislukt: true })
    expect(JSON.stringify(body)).not.toContain('secret')
  })
})

describe('idempotentie en statusregels', () => {
  it('al teruggetrokken → 200 zonder tweede audit, wel een (idempotente) herberekening', async () => {
    staat.update = { data: [], error: null }
    staat.lees = { data: { id: ID, duiding_status: 'teruggetrokken' }, error: null }
    mockHerbereken.mockResolvedValue({ edities: 0 })
    const res = await POST(req({ id: ID, reden: 'anders', toelichting: 'dubbelklik' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'teruggetrokken', alTeruggetrokken: true, edities: 0, herberekeningMislukt: false })
    expect(mockLogAdminAction).not.toHaveBeenCalled()
    expect(mockHerbereken).toHaveBeenCalledWith({ service: true }, ID)
    // Geen tweede UPDATE van wie/wanneer/waarom: alleen de ene geconditioneerde poging.
    expect(updates).toHaveLength(1)
  })

  it('onbekend artikel → 404', async () => {
    staat.update = { data: [], error: null }
    staat.lees = { data: null, error: null }
    expect((await POST(req({ id: ID, reden: 'fout-getal' }))).status).toBe(404)
  })

  it.each(['wacht', 'afgewezen', 'mislukt'])('status %s → 409, niets gelogd', async (status) => {
    staat.update = { data: [], error: null }
    staat.lees = { data: { id: ID, duiding_status: status }, error: null }
    const res = await POST(req({ id: ID, reden: 'fout-getal' }))
    expect(res.status).toBe(409)
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })

  it('DB-fout → 500 met generieke tekst, nooit de rauwe fout', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    staat.update = { data: null, error: { message: 'relation leak detail', code: '42P01' } }
    const res = await POST(req({ id: ID, reden: 'fout-getal' }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('leak detail')
    spy.mockRestore()
  })
})

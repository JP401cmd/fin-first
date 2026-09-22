import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * POST /api/admin/news-duiding/opnieuw — alleen afgewezen/mislukt terug op
 * 'wacht'; nooit geduid of teruggetrokken (B4). Gate, zod, audit, idempotent.
 */

const mockGetUser = vi.fn()
const mockIsSuperAdmin = vi.fn()
const mockLogAdminAction = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
}))
vi.mock('@/lib/admin', () => ({
  isSuperAdmin: (...args: unknown[]) => mockIsSuperAdmin(...args),
}))
vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}))

import { POST } from './route'

const ID = '3e2f9e8d-568a-4199-bf7e-f2f7e5b7091e'

let updateUitkomst: { data: unknown[] | null; error: unknown }
let leesUitkomst: { data: unknown; error: unknown }
const updates: Array<{ velden: Record<string, unknown>; inStatus: unknown }> = []

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'admin-1', email: 'a@b.nl' } } })
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  mockLogAdminAction.mockReset().mockResolvedValue(undefined)
  updates.length = 0
  updateUitkomst = { data: [{ id: ID, title: 'T' }], error: null }
  leesUitkomst = { data: null, error: null }
  mockFrom.mockReset().mockImplementation(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    let modus: 'update' | 'lees' = 'lees'
    b.update = (velden: Record<string, unknown>) => {
      modus = 'update'
      updates.push({ velden, inStatus: null })
      return b
    }
    b.eq = () => b
    b.in = (_k: string, v: unknown) => {
      updates[updates.length - 1].inStatus = v
      return b
    }
    b.select = () => (modus === 'update' ? Promise.resolve(updateUitkomst) : b)
    b.maybeSingle = () => Promise.resolve(leesUitkomst)
    return b
  })
})

function req(body: unknown) {
  return new Request('http://localhost/api/admin/news-duiding/opnieuw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/news-duiding/opnieuw', () => {
  it('401/403 vóór de DB', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await POST(req({ id: ID }))).status).toBe(401)
    mockIsSuperAdmin.mockResolvedValueOnce(false)
    expect((await POST(req({ id: ID }))).status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij een ongeldige body', async () => {
    expect((await POST(req({ id: 'x' }))).status).toBe(400)
  })

  it('zet alleen afgewezen/mislukt terug op wacht, met pogingen en fout gewist, en logt', async () => {
    const res = await POST(req({ id: ID }))
    expect(res.status).toBe(200)
    expect(updates[0].velden).toEqual({
      duiding_status: 'wacht',
      duiding_pogingen: 0,
      duiding_fout: null,
      duiding: null,
      duiding_versie: null,
      geduid_at: null,
    })
    expect(updates[0].inStatus).toEqual(['afgewezen', 'mislukt'])
    expect(mockLogAdminAction.mock.calls[0][1]).toMatchObject({ action: 'nieuws.duiding.opnieuw', detail: { articleId: ID } })
  })

  it('al in de wachtrij → 200 zonder audit', async () => {
    updateUitkomst = { data: [], error: null }
    leesUitkomst = { data: { id: ID, duiding_status: 'wacht' }, error: null }
    const res = await POST(req({ id: ID }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'wacht', alInWachtrij: true })
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })

  it.each(['geduid', 'teruggetrokken'])('status %s → 409 (geen terugweg via een knop)', async (status) => {
    updateUitkomst = { data: [], error: null }
    leesUitkomst = { data: { id: ID, duiding_status: status }, error: null }
    expect((await POST(req({ id: ID }))).status).toBe(409)
  })

  it('onbekend → 404', async () => {
    updateUitkomst = { data: [], error: null }
    expect((await POST(req({ id: ID }))).status).toBe(404)
  })
})

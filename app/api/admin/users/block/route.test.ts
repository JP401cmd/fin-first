import { beforeEach, describe, expect, it, vi } from 'vitest'

// Blokkeren sluit ook de sessie af (concern `blokkade-geen-api-barriere`,
// security-run 0.92.28 🟡-2): naast profiles.blocked_at zet de route een ban in
// Supabase Auth, zodat een bewaard refresh-token en opnieuw inloggen falen.
// Deblokkeren haalt de ban weer weg.

const mockIsSuperAdmin = vi.fn()
const mockGetUser = vi.fn()
const mockUpdateUserById = vi.fn()
const mockLogAdminAction = vi.fn()
let profiel: Record<string, unknown> | null
let updateFout: { message: string } | null
const updates: Array<Record<string, unknown>> = []

vi.mock('@/lib/admin', () => ({ isSuperAdmin: (...a: unknown[]) => mockIsSuperAdmin(...a) }))
vi.mock('@/lib/admin-audit', () => ({ logAdminAction: (...a: unknown[]) => mockLogAdminAction(...a) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}))
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profiel, error: null }) }) }),
      update: (waarden: Record<string, unknown>) => {
        updates.push(waarden)
        return { eq: async () => ({ error: updateFout }) }
      },
    }),
    auth: { admin: { updateUserById: (...a: unknown[]) => mockUpdateUserById(...a) } },
  }),
}))

import { BLOKKADE_BAN_DUUR, POST } from './route'

const DOEL = '11111111-1111-4111-8111-111111111111'
const BEHEER = '22222222-2222-4222-8222-222222222222'

function req(body: unknown) {
  return new Request('https://x.test/api/admin/users/block', { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
  updateFout = null
  profiel = { role: 'user', blocked_at: null, full_name: 'Proef' }
  mockIsSuperAdmin.mockResolvedValue(true)
  mockGetUser.mockResolvedValue({ data: { user: { id: BEHEER, email: 'beheer@example.test' } } })
  mockUpdateUserById.mockResolvedValue({ data: {}, error: null })
})

describe('POST /api/admin/users/block', () => {
  it('blokkeren zet blocked_at én een ban in Supabase Auth', async () => {
    const res = await POST(req({ userId: DOEL, blocked: true }))
    expect(res.status).toBe(200)
    expect(updates[0].blocked_at).toEqual(expect.any(String))
    expect(mockUpdateUserById).toHaveBeenCalledWith(DOEL, { ban_duration: BLOKKADE_BAN_DUUR })
  })

  it('deblokkeren wist blocked_at én haalt de ban weg', async () => {
    profiel = { role: 'user', blocked_at: '2026-10-01T00:00:00Z', full_name: 'Proef' }
    const res = await POST(req({ userId: DOEL, blocked: false }))
    expect(res.status).toBe(200)
    expect(updates[0].blocked_at).toBeNull()
    expect(mockUpdateUserById).toHaveBeenCalledWith(DOEL, { ban_duration: 'none' })
  })

  it('faalt de ban, dan een generieke 500 zonder details — blocked_at staat al (de app-shell en de API blijven dicht)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockUpdateUserById.mockResolvedValue({ data: null, error: { message: 'geheime interne fout' } })
    const res = await POST(req({ userId: DOEL, blocked: true }))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('geheime')
    // De toestandswijziging staat wél in de audit, ook al faalde de ban.
    expect(mockLogAdminAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'user.block', targetUser: DOEL }))
    spy.mockRestore()
  })

  it('faalt het zetten van blocked_at, dan geen ban', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    updateFout = { message: 'kapot' }
    const res = await POST(req({ userId: DOEL, blocked: true }))
    expect(res.status).toBe(500)
    expect(mockUpdateUserById).not.toHaveBeenCalled()
    expect(mockLogAdminAction).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('een superadmin blokkeren of jezelf blokkeren kan niet — en dan ook geen ban', async () => {
    profiel = { role: 'superadmin', blocked_at: null, full_name: 'Beheer' }
    expect((await POST(req({ userId: DOEL, blocked: true }))).status).toBe(400)
    expect((await POST(req({ userId: BEHEER, blocked: true }))).status).toBe(400)
    expect(mockUpdateUserById).not.toHaveBeenCalled()
  })

  it('een body buiten het schema (geen uuid, geen boolean, extra veld) → 400 en niets gewijzigd', async () => {
    expect((await POST(req({ userId: 'u1', blocked: true }))).status).toBe(400)
    expect((await POST(req({ userId: DOEL, blocked: 'ja' }))).status).toBe(400)
    expect((await POST(req({ userId: DOEL, blocked: true, role: 'superadmin' }))).status).toBe(400)
    expect(updates).toHaveLength(0)
    expect(mockUpdateUserById).not.toHaveBeenCalled()
  })
})

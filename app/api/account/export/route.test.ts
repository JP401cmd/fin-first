import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/account/export is sinds ADR 0146 de enige route voor een AVG-inzage.
 * Hij leest daarom óók de persoonlijke tabellen zonder eigen-rij SELECT via de
 * service-role. Deze tests pinnen het veiligheidscontract van dat pad vast:
 * service-role uitsluitend op de vers geverifieerde eigen id, en nooit als die
 * verificatie ontbreekt of afwijkt van de claims.
 */

const USER_ID = 'aaaaaaaa-1111-2222-3333-444444444444'

const sessionEq = vi.fn()
const serviceEq = vi.fn()
const serviceFrom = vi.fn()
const mockGetUser = vi.fn()
const mockClaims = vi.fn()

function sessionClient() {
  return {
    auth: { getUser: mockGetUser },
    from: () => ({
      select: () => ({
        eq: (col: string, val: string) => {
          sessionEq(col, val)
          const res = { data: [], error: null }
          return Object.assign(Promise.resolve(res), { maybeSingle: async () => ({ data: { id: USER_ID }, error: null }) })
        },
      }),
    }),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => sessionClient()),
  getAuthClaims: (...a: unknown[]) => mockClaims(...a),
}))

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      serviceFrom(table)
      return {
        select: () => ({
          eq: async (col: string, val: string) => {
            serviceEq(table, col, val)
            if (table === 'tier_assignments_log') {
              return {
                data: [
                  { old_tier: 'gratis', new_tier: 'ai (beta-keuze)', created_at: '2026-09-17T10:00:00Z', assigned_by: val },
                  { old_tier: 'ai', new_tier: 'ai+connected', created_at: '2026-09-18T10:00:00Z', assigned_by: 'admin-id' },
                ],
                error: null,
              }
            }
            return { data: [{ id: `${table}-1`, user_id: val }], error: null }
          },
        }),
      }
    },
  }),
}))

vi.mock('@/lib/crypto/field-encryption', () => ({ decryptField: (v: unknown) => v }))

import { GET } from './route'
import { EXPORT_SERVICE_TABLES } from '@/lib/user-data-tables'

beforeEach(() => {
  sessionEq.mockReset()
  serviceEq.mockReset()
  serviceFrom.mockReset()
  mockGetUser.mockReset()
  mockClaims.mockReset()
})

describe('GET /api/account/export — service-role-tabellen (ADR 0146)', () => {
  it('401 zonder sessie, geen enkele service-read', async () => {
    mockClaims.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(serviceFrom).not.toHaveBeenCalled()
  })

  it('neemt de tabellen zonder eigen-rij SELECT mee, gefilterd op de geverifieerde eigen id', async () => {
    mockClaims.mockResolvedValue({ sub: USER_ID })
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = JSON.parse(await res.text())
    for (const table of EXPORT_SERVICE_TABLES) {
      expect(body.tables[table], table).toEqual([{ id: `${table}-1`, user_id: USER_ID }])
      expect(serviceEq).toHaveBeenCalledWith(table, 'user_id', USER_ID)
    }
    // Nooit een andere filter dan de eigen id (het abonnementslogboek noemt die kolom target_user).
    for (const [table, col, val] of serviceEq.mock.calls) {
      expect([col, val]).toEqual([table === 'tier_assignments_log' ? 'target_user' : 'user_id', USER_ID])
    }
  })

  it('neemt de abonnementsgeschiedenis mee zonder het id van een beheerder (ADR 0157)', async () => {
    mockClaims.mockResolvedValue({ sub: USER_ID })
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const body = JSON.parse(await (await GET()).text())
    expect(body.tables.tier_assignments_log).toEqual([
      { old_tier: 'gratis', new_tier: 'ai (beta-keuze)', created_at: '2026-09-17T10:00:00Z', gekozen_door: 'zelf' },
      { old_tier: 'ai', new_tier: 'ai+connected', created_at: '2026-09-18T10:00:00Z', gekozen_door: 'beheer' },
    ])
    expect(JSON.stringify(body)).not.toContain('admin-id')
  })

  it('geen service-read als getUser() geen gebruiker oplevert — en de export benoemt het gat', async () => {
    mockClaims.mockResolvedValue({ sub: USER_ID })
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(serviceFrom).not.toHaveBeenCalled()
    const body = JSON.parse(await res.text())
    expect(body.onvolledig).toEqual([...EXPORT_SERVICE_TABLES, 'tier_assignments_log'])
  })

  it('een volledige export draagt geen onvolledig-veld', async () => {
    mockClaims.mockResolvedValue({ sub: USER_ID })
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const body = JSON.parse(await (await GET()).text())
    expect(body).not.toHaveProperty('onvolledig')
  })

  it('geen service-read als de geverifieerde id afwijkt van de claims', async () => {
    mockClaims.mockResolvedValue({ sub: USER_ID })
    mockGetUser.mockResolvedValue({ data: { user: { id: 'bbbbbbbb-1111-2222-3333-444444444444' } } })
    await GET()
    expect(serviceFrom).not.toHaveBeenCalled()
  })
})

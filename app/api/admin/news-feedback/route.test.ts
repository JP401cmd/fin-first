import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor /api/admin/news-feedback — het alleen-lezen aggregaat op
 * `/beheer/nieuws` (ADR 0113). Deze route leest via SERVICE-ROLE (besluit C2:
 * geen superadmin-policy op een user-scoped, AVG-exporteerbare tabel), en dan
 * is RLS géén tweede slot. Contract:
 *   - 401 zonder sessie / 403 zonder superadmin-rol, vóór de service-client
 *     ook maar wordt aangeraakt;
 *   - de gate draait op de INGELOGDE client, nooit op de service-client;
 *   - de respons bevat uitsluitend aggregaten — nooit een `user_id`;
 *   - elke geslaagde inzage komt in het auditlog;
 *   - er is bewust geen mutatiepad (geen POST/PATCH): dit is geen inbox.
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

import * as route from './route'

const { GET } = route
const SUPERADMIN = { id: 'admin-1', email: 'admin@trifinity.nl' }

function serviceRows(rows: unknown[], total?: number) {
  mockServiceFrom.mockImplementation(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: (_cols: string, opts?: { head?: boolean }) =>
        opts?.head
          ? Promise.resolve({ data: null, error: null, count: total ?? rows.length })
          : b,
      order: () => b,
      limit: () => Promise.resolve({ data: rows, error: null }),
    }
    return b
  })
}

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: SUPERADMIN } })
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  mockLogAdminAction.mockReset().mockResolvedValue(undefined)
  mockServiceFrom.mockReset()
  serviceRows([])
})

describe('superadmin-gate', () => {
  it('401 zonder sessie, zonder service-client-aanraking', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockServiceFrom).not.toHaveBeenCalled()
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })

  it('403 voor een ingelogde niet-superadmin', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    const res = await GET()
    expect(res.status).toBe(403)
    expect(mockServiceFrom).not.toHaveBeenCalled()
  })
})

describe('aggregaat', () => {
  it('lege inbak → 200 met een leeg aggregaat', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.summary.totalRows).toBe(0)
    expect(body.truncated).toBe(false)
  })

  it('geeft nooit een user_id terug', async () => {
    serviceRows([
      {
        user_id: 'geheime-uuid',
        article_id: 'a1',
        headline: 'Kop',
        category: 'beleggen',
        verdict: 'less',
        created_at: new Date().toISOString(),
      },
    ])
    const res = await GET()
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('geheime-uuid')
    expect(body.summary.users).toBe(1)
    expect(body.summary.less).toBe(1)
  })

  it('truncated komt uit een head-count, niet uit rows.length', async () => {
    serviceRows(
      [
        {
          user_id: 'u1',
          article_id: 'a1',
          headline: 'Kop',
          category: 'beleggen',
          verdict: 'less',
          created_at: new Date().toISOString(),
        },
      ],
      9000,
    )
    const body = await (await GET()).json()
    expect(body.truncated).toBe(true)
  })

  it('zet no-store op de respons', async () => {
    const res = await GET()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('logt de inzage in het auditlog', async () => {
    await GET()
    expect(mockLogAdminAction).toHaveBeenCalledTimes(1)
    const [, params] = mockLogAdminAction.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(params).toMatchObject({ action: 'news-feedback.read', actorId: SUPERADMIN.id })
  })
})

describe('geen mutatiepad', () => {
  it('exporteert bewust alleen GET — dit is een venster, geen inbox', () => {
    expect(Object.keys(route).filter((k) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(k))).toEqual(
      [],
    )
  })
})

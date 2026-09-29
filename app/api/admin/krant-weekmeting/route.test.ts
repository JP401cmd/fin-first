import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/admin/krant-weekmeting — gate, vaste kolomlijst, en dat de route
 * uitsluitend `job_runs` raakt (ADR 0146; de gate hoeft niet te verruimen).
 */

const mockGetUser = vi.fn()
const mockIsSuperAdmin = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
}))
vi.mock('@/lib/admin', () => ({
  isSuperAdmin: (...args: unknown[]) => mockIsSuperAdmin(...args),
}))

import { GET } from './route'
import { bouwWeekmeting, WEEKMETING_KOLOMMEN, WEEKMETING_WEKEN_MAX, WEEKMETING_WEKEN_STANDAARD } from '@/lib/krant/weekmeting'

const tabellen: string[] = []
const selects: string[] = []
const limits: number[] = []
const eqs: Array<[string, unknown]> = []
let rijen: unknown[] = []
let fout: { message: string } | null = null

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  tabellen.length = 0
  selects.length = 0
  limits.length = 0
  eqs.length = 0
  rijen = []
  fout = null
  mockFrom.mockReset().mockImplementation((tabel: string) => {
    tabellen.push(tabel)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    b.select = (k: string) => {
      selects.push(k)
      return b
    }
    b.eq = (k: string, v: unknown) => {
      eqs.push([k, v])
      return b
    }
    b.order = () => b
    b.limit = (n: number) => {
      limits.push(n)
      return Promise.resolve({ data: rijen, error: fout })
    }
    return b
  })
})

const req = (q = '') => new Request(`http://localhost/api/admin/krant-weekmeting${q}`)

const RECORD = bouwWeekmeting({
  week: '2026-W40',
  editieWeek: '2026-W41',
  gemetenOp: '2026-10-05T06:04:00.000Z',
  duiding: null,
  artikelen: [],
  metSamenvattingPerBronsoort: { rss: 0, web_lijst: 0, web_pagina: 0 },
  metSamenvattingTotaal: 0,
  editieOnvolledig: false,
  vorigeWeek: null,
  backfillResterend: 0,
  edities: [],
  testaccountIds: new Set(),
  tokens: [],
  afgekapt: false,
  leesfouten: [],
  rekent: () => false,
})

describe('GET /api/admin/krant-weekmeting', () => {
  it('401 zonder sessie, 403 zonder superadmin — geen lezing', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET(req())).status).toBe(401)
    mockIsSuperAdmin.mockResolvedValueOnce(false)
    expect((await GET(req())).status).toBe(403)
    expect(tabellen).toEqual([])
  })

  it('leest alleen job_runs, taak krant-weekmeting, vaste kolommen, vier runs per week', async () => {
    rijen = [{ status: 'partial', started_at: '2026-10-05T06:04:00Z', summary: RECORD, error: 'geen-artikelen' }]
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(tabellen).toEqual(['job_runs'])
    expect(selects).toEqual([WEEKMETING_KOLOMMEN])
    expect(eqs).toEqual([['job', 'krant-weekmeting']])
    expect(limits).toEqual([WEEKMETING_WEKEN_STANDAARD * 4])
    const body = await res.json()
    expect(body.weken).toHaveLength(1)
    expect(body.weken[0].record.week).toBe('2026-W40')
  })

  it('begrenst ?weken', async () => {
    await GET(req('?weken=999'))
    expect(limits).toEqual([WEEKMETING_WEKEN_MAX * 4])
  })

  it('DB-fout → generieke 500 zonder de DB-tekst', async () => {
    fout = { message: 'relation "job_runs" geheim detail' }
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('geheim')
  })
})

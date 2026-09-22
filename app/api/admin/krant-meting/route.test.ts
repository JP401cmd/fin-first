import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/admin/krant-meting — gate, vaste kolomlijst, en het punt van G6:
 * de route raakt uitsluitend `job_runs`, dus de ADR 0146-gate hoeft niet te
 * worden verruimd voor `krant_edities`/`krant_editie_items`.
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
import { KRANT_METING_KOLOMMEN, KRANT_METING_RUNS_MAX, KRANT_METING_RUNS_STANDAARD } from '@/lib/krant/meting-beheer'

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

const req = (q = '') => new Request(`http://localhost/api/admin/krant-meting${q}`)

const SUMMARY = {
  week: '2026-W39',
  gebruikers: 9,
  edities: 8,
  leeg: 2,
  perProfieltype: { a: { edities: 'klein', leeg: 'klein' } },
  testaccounts: { gemeten: 5, overlapBeide: 3, alleenMatcher: 4, alleenModel: 5, perProfieltype: { a: { edities: 1, leeg: 0 } } },
}

describe('GET /api/admin/krant-meting', () => {
  it('401/403 vóór de DB', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET(req())).status).toBe(401)
    mockIsSuperAdmin.mockResolvedValueOnce(false)
    expect((await GET(req())).status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('leest alleen job_runs van de krant-cron, met de vaste kolomlijst', async () => {
    rijen = [{ status: 'success', started_at: '2026-09-21T06:00:00Z', duration_ms: 1200, summary: SUMMARY, error: null }]
    await GET(req())
    expect(tabellen).toEqual(['job_runs'])
    expect(selects).toEqual([KRANT_METING_KOLOMMEN])
    expect(eqs).toEqual([['job', 'krant-editie']])
  })

  it('raakt krant_edities, krant_editie_items en nieuwsprofiel niet aan (G6: geen gate-verruiming nodig)', async () => {
    await GET(req())
    for (const tabel of ['krant_edities', 'krant_editie_items', 'nieuwsprofiel', 'profiles']) {
      expect(tabellen, tabel).not.toContain(tabel)
    }
  })

  it('geeft de onderdrukte cellen ongewijzigd door en telt de testaccounts op', async () => {
    rijen = [
      { status: 'success', started_at: '2026-09-21T06:00:00Z', duration_ms: 1, summary: SUMMARY, error: null },
      { status: 'success', started_at: '2026-09-14T06:00:00Z', duration_ms: 1, summary: { ...SUMMARY, week: '2026-W38' }, error: null },
    ]
    const body = await (await GET(req())).json()
    expect(body.runs).toHaveLength(2)
    expect(body.runs[0].perProfieltype.a).toEqual({ edities: 'klein', leeg: 'klein' })
    expect(body.totalen.edities).toBe(16)
    expect(body.totalen.testaccounts.perProfieltype.a).toEqual({ edities: 2, leeg: 0 })
  })

  it('klemt ?runs= tussen 1 en het maximum en valt terug op de standaard', async () => {
    await GET(req())
    await GET(req('?runs=0'))
    await GET(req('?runs=999'))
    await GET(req('?runs=abc'))
    expect(limits).toEqual([KRANT_METING_RUNS_STANDAARD, 1, KRANT_METING_RUNS_MAX, KRANT_METING_RUNS_STANDAARD])
  })

  it('een DB-fout wordt een generieke 500-envelope, geen rauwe message', async () => {
    fout = { message: 'relation "job_runs" does not exist' }
    const res = await GET(req())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.error).not.toContain('relation')
  })
})

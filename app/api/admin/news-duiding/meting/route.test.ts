import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/admin/news-duiding/meting — gate, vaste kolomlijst, en paginering
 * over de PostgREST-cap van 1000 (anders zakt de dekking stil).
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
import { METING_KOLOMMEN } from '@/lib/krant/duiding-beheer'

let paginas: unknown[][]
const ranges: Array<[number, number]> = []
const selects: string[] = []

function rijen(aantal: number, fetchedAt: string, pagina = 0) {
  return Array.from({ length: aantal }, (_, i) => ({
    id: `id-${pagina}-${fetchedAt}-${i}`,
    title: 't',
    category: 'fiscaal',
    fetched_at: fetchedAt,
    duiding_status: 'geduid',
    duiding_fout: null,
    teruggetrokken_reden: null,
    mechanisme: i % 2 === 0 ? 'box3-parameter' : null,
    brontekst: 'teaser',
  }))
}

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  ranges.length = 0
  selects.length = 0
  paginas = []
  mockFrom.mockReset().mockImplementation(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    b.select = (k: string) => {
      selects.push(k)
      return b
    }
    b.gte = () => b
    b.order = () => b
    b.range = (van: number, tot: number) => {
      ranges.push([van, tot])
      const count = paginas.reduce((s, p) => s + p.length, 0)
      return Promise.resolve({ data: paginas[ranges.length - 1] ?? [], error: null, count })
    }
    return b
  })
})

const req = (q = '') => new Request(`http://localhost/api/admin/news-duiding/meting${q}`)

describe('GET /api/admin/news-duiding/meting', () => {
  it('401/403 vóór de DB', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET(req())).status).toBe(401)
    mockIsSuperAdmin.mockResolvedValueOnce(false)
    expect((await GET(req())).status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('leest alleen de vaste meting-kolommen', async () => {
    await GET(req())
    expect(selects).toEqual([METING_KOLOMMEN])
    expect(METING_KOLOMMEN).not.toMatch(/samenvatting|params|grond|summary|raw_content/)
  })

  it('pagineert tot een korte pagina: 1000 + 1000 + 3 rijen worden allemaal geteld', async () => {
    const nu = new Date().toISOString()
    paginas = [rijen(1000, nu, 0), rijen(1000, nu, 1), rijen(3, nu, 2)]
    const res = await GET(req())
    const body = await res.json()
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
    expect(body.afgekapt).toBe(false)
    const totaal = body.weken.reduce((s: number, w: { binnen: number }) => s + w.binnen, 0)
    expect(totaal).toBe(2003)
  })

  it('een lagere hosted max_rows (500) stopt niet na één pagina: de telling is het stopcriterium', async () => {
    const nu = new Date().toISOString()
    paginas = [rijen(500, nu, 0), rijen(500, nu, 1), rijen(200, nu, 2)]
    const body = await (await GET(req())).json()
    expect(ranges.map((r) => r[0])).toEqual([0, 500, 1000])
    expect(body.afgekapt).toBe(false)
    expect(body.weken.reduce((s: number, w: { binnen: number }) => s + w.binnen, 0)).toBe(1200)
  })

  it('laat een week vóór de eerste hele week weg', async () => {
    const oud = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString()
    const nu = new Date().toISOString()
    paginas = [[...rijen(2, nu), ...rijen(2, oud)]]
    const body = await (await GET(req('?weken=2'))).json()
    expect(body.weken.every((w: { week: string }) => w.week >= body.eersteWeek)).toBe(true)
    expect(body.weken.reduce((s: number, w: { binnen: number }) => s + w.binnen, 0)).toBe(2)
  })
})

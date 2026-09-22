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
import { amsterdamWeekKey } from '@/lib/briefing/snapshot'

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
    grondslag: 'fragment',
    poort_status: 'groen',
    poort_reden: null,
    kop_bron: 'bron',
  }))
}

/** Het G7-register zoals het in app_settings staat (of null = nog niets vastgelegd). */
let steekproefWaarde: unknown = null

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  ranges.length = 0
  selects.length = 0
  paginas = []
  steekproefWaarde = null
  mockFrom.mockReset().mockImplementation((tabel: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    if (tabel === 'app_settings') {
      b.select = () => b
      b.eq = () => b
      b.maybeSingle = () => Promise.resolve({ data: steekproefWaarde === null ? null : { value: steekproefWaarde }, error: null })
      return b
    }
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
    // Geen modeltekst en geen params. ("grondslag" is de metadata-ENUM van de
    // grondslagsoort, niet het grond-citaat — vandaar de negatieve lookahead.)
    //
    // DE GUARD BEWIJST EERST ZICHZELF. Hier stond tot de eindreview van 1F fase 2
    // `\bgrond\b` met twee LITERAL 0x08-bytes (backspace) in plaats van de
    // escape: grep en een editor renderen die onzichtbaar, dus de alternatief
    // eiste `\x08grond\x08` en was vacuously groen. Een guard die stil niets
    // toetst is erger dan geen guard — daarom toont deze test nu eerst dat het
    // patroon discrimineert, en pas daarna dat de kolomlijst hem haalt.
    const VERBODEN = /samenvatting|params|grond(?![a-z])|summary|raw_content|bron_fragment|bron_kop/
    expect('grond:duiding->>grond').toMatch(VERBODEN)
    expect('grondslag:duiding->meta->>grondslag').not.toMatch(VERBODEN)
    expect(METING_KOLOMMEN).not.toMatch(VERBODEN)
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

  it('leest het G7-register mee en leidt g7Gehaald af (geen teller)', async () => {
    const nu = new Date()
    const vorige = new Date(nu.getTime() - 7 * 24 * 3600 * 1000)
    const deze = amsterdamWeekKey(nu)
    const ervoor = amsterdamWeekKey(vorige)
    paginas = [[...rijen(2, nu.toISOString()), ...rijen(2, vorige.toISOString())]]
    steekproefWaarde = JSON.stringify({
      [deze]: { gecontroleerd: 20, fouten: 0, op: nu.toISOString() },
      [ervoor]: { gecontroleerd: 20, fouten: 1, op: vorige.toISOString() },
    })
    const body = await (await GET(req())).json()
    expect(body.weken.map((w: { week: string }) => w.week)).toEqual([deze, ervoor])
    expect(body.steekproef[deze]).toMatchObject({ gecontroleerd: 20, fouten: 0 })
    expect(body.g7Gehaald).toBe(true)
  })

  it('zonder register is G7 niet gehaald', async () => {
    paginas = [rijen(2, new Date().toISOString())]
    const body = await (await GET(req())).json()
    expect(body.steekproef).toEqual({})
    expect(body.g7Gehaald).toBe(false)
  })

  it('een kapot G7-register maakt de meting niet stuk en telt nooit als gehaald', async () => {
    paginas = [rijen(2, new Date().toISOString())]
    steekproefWaarde = '{kapot'
    const body = await (await GET(req())).json()
    expect(body.steekproef).toEqual({})
    expect(body.g7Gehaald).toBe(false)
    expect(body.weken.length).toBeGreaterThan(0)
  })
})

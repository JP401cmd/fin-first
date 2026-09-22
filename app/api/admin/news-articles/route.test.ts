import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/admin/news-articles (1A fase 2, ADR 0171).
 *  GET    — gate, filters (status, rekenende mechanismen via het json-pad),
 *           gesaniteerde zoekterm, paginering, duiding alleen als weergavevorm,
 *           source_url alleen http(s).
 *  DELETE — gate, zod, weigert geduid/teruggetrokken (409), audit.
 * De PostgREST-syntax van het json-pad is niet unit-bewijsbaar: dit pint wat de
 * route aan supabase-js doorgeeft; een ingelogde smoke bewijst de rest.
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

import { DELETE, GET } from './route'
import { REKENENDE_MECHANISMEN } from '@/lib/krant/duiding-beheer'

const ID = '3e2f9e8d-568a-4199-bf7e-f2f7e5b7091e'

type Aanroep = [string, ...unknown[]]
let aanroepen: Aanroep[]
let resultaat: { data: unknown; error: unknown; count?: number }
let leesResultaat: { data: unknown; error: unknown }

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'admin-1', email: 'a@b.nl' } } })
  mockIsSuperAdmin.mockReset().mockResolvedValue(true)
  mockLogAdminAction.mockReset().mockResolvedValue(undefined)
  aanroepen = []
  resultaat = { data: [], error: null, count: 0 }
  leesResultaat = { data: null, error: null }
  mockFrom.mockReset().mockImplementation(() => {
    // Een keten die elke builder-methode vastlegt; `await` geeft `resultaat`,
    // `.maybeSingle()` (de statuslezing na een geweigerde mutatie) `leesResultaat`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') return (ok: (v: unknown) => unknown) => Promise.resolve(resultaat).then(ok)
          if (prop === 'maybeSingle') return () => Promise.resolve(leesResultaat)
          return (...args: unknown[]) => {
            aanroepen.push([prop, ...args])
            return b
          }
        },
      },
    )
    return b
  })
})

const get = (q = '') => GET(new Request(`http://localhost/api/admin/news-articles${q}`))
const del = (body: unknown) =>
  DELETE(
    new Request('http://localhost/api/admin/news-articles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )

describe('GET', () => {
  it('403 zonder superadmin, vóór de DB', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)
    expect((await get()).status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('filtert op status en op rekenende mechanismen via het json-pad', async () => {
    await get('?status=geduid&rekenend=1')
    expect(aanroepen).toContainEqual(['eq', 'duiding_status', 'geduid'])
    expect(aanroepen).toContainEqual(['in', 'duiding->mechanisme->>soort', [...REKENENDE_MECHANISMEN]])
  })

  it('negeert een onbekende status (geen vrije filterwaarde naar PostgREST)', async () => {
    await get('?status=geduid)or(1')
    expect(aanroepen.some((a) => a[0] === 'eq')).toBe(false)
  })

  it('stuurt een gesaniteerde zoekterm in de .or()', async () => {
    await get(`?search=${encodeURIComponent('box3,id.eq.x)')}`)
    const or = aanroepen.find((a) => a[0] === 'or')
    expect(or?.[1]).toBe('title.ilike.%box3 id.eq.x%,summary.ilike.%box3 id.eq.x%,source_name.ilike.%box3 id.eq.x%')
  })

  it('pagineert per 50 en meldt heeftMeer', async () => {
    resultaat = { data: [], error: null, count: 120 }
    const body = await (await get('?pagina=1')).json()
    expect(aanroepen).toContainEqual(['range', 50, 99])
    expect(body).toMatchObject({ pagina: 1, paginaGrootte: 50, heeftMeer: true, total: 120 })
  })

  it('geeft de duiding alleen als weergavevorm en source_url alleen als http(s)', async () => {
    resultaat = {
      data: [
        { id: 'a', title: 't', source_url: 'javascript:alert(1)', duiding: { rommel: true }, duiding_status: 'geduid' },
        { id: 'b', title: 't', source_url: 'https://www.belastingdienst.nl/x', duiding: null, duiding_status: 'wacht' },
      ],
      error: null,
      count: 2,
    }
    const { articles } = await (await get()).json()
    expect(articles[0].source_url).toBeNull()
    expect(articles[0].duiding).toEqual({ ok: false })
    expect(articles[1].source_url).toBe('https://www.belastingdienst.nl/x')
    expect(articles[1].duiding).toBeNull()
  })
})

describe('DELETE', () => {
  it('401/403 vóór de DB', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await del({ id: ID })).status).toBe(401)
    mockIsSuperAdmin.mockResolvedValueOnce(false)
    expect((await del({ id: ID })).status).toBe(403)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('400 bij een ongeldige body', async () => {
    expect((await del('{kapot')).status).toBe(400)
    expect((await del({ id: 'x' })).status).toBe(400)
  })

  it('verwijdert alleen buiten geduid/teruggetrokken en logt', async () => {
    resultaat = { data: [{ id: ID, title: 'T', duiding_status: 'wacht' }], error: null }
    const res = await del({ id: ID })
    expect(res.status).toBe(200)
    expect(aanroepen).toContainEqual(['not', 'duiding_status', 'in', '(geduid,teruggetrokken)'])
    expect(mockLogAdminAction.mock.calls[0][1]).toMatchObject({
      action: 'nieuws.artikel.verwijderen',
      detail: { articleId: ID, duidingStatus: 'wacht' },
    })
  })

  it('geduid → 409 (eerst terugtrekken), niets gelogd', async () => {
    resultaat = { data: [], error: null }
    leesResultaat = { data: { id: ID, duiding_status: 'geduid' }, error: null }
    const res = await del({ id: ID })
    expect(res.status).toBe(409)
    expect(mockLogAdminAction).not.toHaveBeenCalled()
  })

  it('onbekend → 404', async () => {
    resultaat = { data: [], error: null }
    leesResultaat = { data: null, error: null }
    expect((await del({ id: ID })).status).toBe(404)
  })
})

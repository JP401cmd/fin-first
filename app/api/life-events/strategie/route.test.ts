import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/life-events/strategie (TPR-15 stap 3) — schrijfroute voor AOW, werk en pensioenpotten.
 *
 * Invarianten: (a) 401 zonder sessie, zonder DB-call; (b) elke lezing en write filtert op
 * eigen `user_id` (SELECT-policy is huishoud-gedeeld) en op het type; (c) AOW/werk: bestaande
 * eigen rij bijwerken, anders aanmaken — AOW ontstaat pas bij opslaan; (d) pensioen per id,
 * een vreemd id → 404, nooit een stille succes; (e) het maandbedrag bepaalt de server;
 * (f) gesloten schema (onbekende sleutel, verkeerde duur, buiten bereik → 400);
 * (g) `tot_stopmoment` verdwijnt, andere metadata blijft; (h) DELETE alleen werk/pensioen,
 * eigen rij, 404 bij 0 rijen; (i) DB-fouten lekken geen interne tekst.
 */

const USER = '33333333-3333-4333-8333-333333333333'
const POT = '11111111-1111-4111-8111-111111111111'

type Op = 'select' | 'update' | 'insert' | 'delete'
interface Call {
  op: Op
  payload?: unknown
  eq: [string, unknown][]
  in: [string, unknown][]
}

let user: { id: string } | null
let calls: Call[]
/** Resultaat per operatie; `select` = lezing van de bestaande rij, `sort` = de sort_order-lezing. */
let result: Record<'select' | 'sort' | 'update' | 'insert' | 'delete', { data: unknown; error: unknown }>

function chain() {
  const call: Call = { op: 'select', eq: [], in: [] }
  let selectKolommen = ''
  calls.push(call)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {}
  c.select = vi.fn((kolommen: string) => {
    selectKolommen = kolommen
    return c
  })
  for (const op of ['update', 'insert', 'delete'] as const) {
    c[op] = vi.fn((payload?: unknown) => {
      call.op = op
      call.payload = payload
      return c
    })
  }
  c.eq = vi.fn((k: string, v: unknown) => (call.eq.push([k, v]), c))
  c.in = vi.fn((k: string, v: unknown) => (call.in.push([k, v]), c))
  c.order = vi.fn(() => c)
  c.limit = vi.fn(() => c)
  const uitkomst = () => (call.op === 'select' && selectKolommen === 'sort_order' ? result.sort : result[call.op])
  c.maybeSingle = vi.fn(() => Promise.resolve(uitkomst()))
  c.single = vi.fn(() => Promise.resolve(uitkomst()))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c.then = (onF: any, onR: any) => Promise.resolve(uitkomst()).then(onF, onR)
  return c
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user } }) },
    from: (table: string) => {
      if (table !== 'life_events') throw new Error(`onverwachte tabel ${table}`)
      return chain()
    },
  }),
}))

import { PUT, DELETE } from './route'

function put(body: unknown) {
  return PUT(
    new Request('http://x/api/life-events/strategie', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
  )
}
function del(id: string | null) {
  const url = new URL('http://x/api/life-events/strategie')
  if (id != null) url.searchParams.set('id', id)
  const r = new Request(url, { method: 'DELETE' }) as never as { nextUrl: URL }
  ;(r as { nextUrl: URL }).nextUrl = url
  return DELETE(r as never)
}

const AOW = { event_type: 'aow', target_age: 68, leefsituatie: 'samenwonend', jarenBuitenNL: 5 }
const POTBODY = {
  name: ' Pensioenfonds ',
  pensioenType: 'bedrijf',
  ingangLeeftijd: 68,
  invoermodus: 'maand',
  brutoBedrag: 800,
  inlegBedrag: 0,
  uitkeringsduur: 'levenslang',
  isGeindexeerd: false,
  partnerUitkeringPct: 70,
}
const WERK = {
  event_type: 'werk',
  target_age: 42,
  metadata: { huidigNettoMaand: 3200, reeleGroeiPct: 0.01, faseStappen: [], sprongen: [] },
}

beforeEach(() => {
  user = { id: USER }
  calls = []
  result = {
    select: { data: null, error: null },
    sort: { data: [], error: null },
    update: { data: { id: 'e1' }, error: null },
    insert: { data: { id: 'nieuw' }, error: null },
    delete: { data: { id: POT }, error: null },
  }
})

const heeftEq = (c: Call, k: string, v: unknown) => c.eq.some(([a, b]) => a === k && b === v)

describe('PUT /api/life-events/strategie', () => {
  it('401 zonder sessie, zonder DB-call', async () => {
    user = null
    const res = await put(AOW)
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('AOW zonder eigen rij: maakt hem aan met het server-berekende bedrag', async () => {
    const res = await put(AOW)
    expect(res.status).toBe(201)
    const [lees, insert] = calls
    expect(heeftEq(lees!, 'user_id', USER) && heeftEq(lees!, 'event_type', 'aow')).toBe(true)
    expect(insert!.op).toBe('insert')
    const rij = insert!.payload as Record<string, unknown>
    expect(rij.user_id).toBe(USER)
    // samenwonend, 5 jaar buiten NL → 90% van het samenwonend-bedrag (computeAowMonthly).
    const { computeAowMonthly } = await import('@/lib/horizon-data')
    expect(rij.monthly_income_change).toBe(computeAowMonthly('samenwonend', 5))
    expect(rij.metadata).toEqual({ leefsituatie: 'samenwonend', jarenBuitenNL: 5 })
  })

  it('AOW met eigen rij: werkt die bij, eigen user_id + type in de update, tot_stopmoment weg', async () => {
    result.select = { data: { id: 'e1', metadata: { jarenBuitenNL: 0, tot_stopmoment: true, bron: 'upo' } }, error: null }
    const res = await put(AOW)
    expect(res.status).toBe(200)
    const update = calls.find((c) => c.op === 'update')!
    expect(heeftEq(update, 'id', 'e1') && heeftEq(update, 'user_id', USER) && heeftEq(update, 'event_type', 'aow')).toBe(true)
    expect((update.payload as { metadata: unknown }).metadata).toEqual({
      bron: 'upo',
      leefsituatie: 'samenwonend',
      jarenBuitenNL: 5,
    })
    expect(calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('update die 0 rijen raakt → 404, geen stille succes', async () => {
    result.select = { data: { id: 'e1', metadata: {} }, error: null }
    result.update = { data: null, error: null }
    const res = await put(AOW)
    expect(res.status).toBe(404)
  })

  it('pensioen met een vreemd id → 404 zonder write', async () => {
    const res = await put({ event_type: 'pension', id: POT, pot: POTBODY })
    expect(res.status).toBe(404)
    expect(calls.every((c) => c.op === 'select')).toBe(true)
    expect(heeftEq(calls[0]!, 'id', POT) && heeftEq(calls[0]!, 'user_id', USER)).toBe(true)
  })

  it('nieuwe pensioenpot: achteraan (sort_order > 1000), naam getrimd, bedrag uit de pot', async () => {
    result.sort = { data: [{ sort_order: 1003 }, { sort_order: 5 }], error: null }
    const res = await put({ event_type: 'pension', pot: POTBODY })
    expect(res.status).toBe(201)
    const insert = calls.find((c) => c.op === 'insert')!
    const rij = insert.payload as Record<string, unknown>
    expect(rij.sort_order).toBe(1004)
    expect(rij.name).toBe('Pensioenfonds')
    expect(rij.monthly_income_change).toBe(800)
    expect(rij.user_id).toBe(USER)
    const sortLees = calls.find((c) => c.op === 'select' && heeftEq(c, 'event_type', 'pension'))!
    expect(heeftEq(sortLees, 'user_id', USER)).toBe(true)
  })

  it('werk: bestaand plafond verdwijnt wanneer het niet meer meegestuurd wordt', async () => {
    result.select = { data: { id: 'w1', metadata: { plafondNettoMaand: 5000, huidigNettoMaand: 1 } }, error: null }
    const res = await put(WERK)
    expect(res.status).toBe(200)
    const meta = (calls.find((c) => c.op === 'update')!.payload as { metadata: Record<string, unknown> }).metadata
    expect(meta.plafondNettoMaand).toBeUndefined()
    expect(meta.huidigNettoMaand).toBe(3200)
    expect(meta.source).toBe('werk-strategy')
  })

  it.each([
    ['onbekende sleutel', { ...AOW, user_id: 'ander' }],
    ['onbekend type', { ...AOW, event_type: 'children' }],
    ['duur past niet bij type', { event_type: 'pension', pot: { ...POTBODY, uitkeringsduur: '5' } }],
    ['lege naam', { event_type: 'pension', pot: { ...POTBODY, name: '   ' } }],
    ['jaren buiten NL buiten bereik', { ...AOW, jarenBuitenNL: 51 }],
    ['pensioen-id geen uuid', { event_type: 'pension', id: 'abc', pot: POTBODY }],
  ])('400 bij %s, zonder DB-call', async (_naam, body) => {
    const res = await put(body)
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  it('DB-fout lekt geen interne tekst', async () => {
    result.insert = { data: null, error: { message: 'relation "life_events" violates GEHEIM' } }
    const res = await put(AOW)
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('GEHEIM')
  })
})

describe('DELETE /api/life-events/strategie', () => {
  it('verwijdert alleen een eigen werk- of pensioenrij', async () => {
    const res = await del(POT)
    expect(res.status).toBe(200)
    const c = calls[0]!
    expect(c.op).toBe('delete')
    expect(heeftEq(c, 'id', POT) && heeftEq(c, 'user_id', USER)).toBe(true)
    expect(c.in).toEqual([['event_type', ['werk', 'pension']]])
  })

  it('404 bij 0 rijen (vreemd id, AOW) en bij een malformed id zonder DB-call', async () => {
    result.delete = { data: null, error: null }
    expect((await del(POT)).status).toBe(404)
    calls = []
    expect((await del('abc')).status).toBe(404)
    expect(calls).toHaveLength(0)
    expect((await del(null)).status).toBe(400)
  })
})

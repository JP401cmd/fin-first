import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * PATCH /api/assets/[id]/expected-return (TPR-15, laag 2) — de smalle schrijfroute voor het
 * rendement van één bezitting.
 *
 * Invarianten: (a) 401 zonder sessie; (b) 404 op een malformed of vreemd id en op 0 rijen
 * (partnerrij — de SELECT-policy is huishoud-gedeeld) — nooit een stille succes; (c) lezen
 * én schrijven expliciet op eigen `user_id`; de update schrijft ALLEEN `expected_return` en
 * pint het gelezen type (geen lees-dan-schrijf-race op een typewissel); (d) gesloten schema
 * (extra sleutels, geen getal → 400); (e) band per type uit `lib/asset-parameter-bands.ts`,
 * dezelfde tekst als het formulier; (f) afschrijvend bezit (depreciation_rate > 0) → 409:
 * daar is het rendement per definitie 0 en toont het formulier het veld niet; (g) DB-fouten
 * lekken geen interne tekst.
 */

const ID = '11111111-1111-4111-8111-111111111111'
const USER = '33333333-3333-4333-8333-333333333333'

let user: { id: string } | null
let readResult: { data: unknown; error: unknown }
let writeResult: { data: unknown; error: unknown }
type Calls = Record<string, unknown[][]>
let calls: Calls[]

function chain() {
  const c: Calls = {}
  calls.push(c)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {}
  let isUpdate = false
  for (const m of ['select', 'eq', 'in', 'or', 'update']) {
    b[m] = vi.fn((...args: unknown[]) => {
      if (m === 'update') isUpdate = true
      ;(c[m] ||= []).push(args)
      return b
    })
  }
  b.maybeSingle = vi.fn(() => Promise.resolve(isUpdate ? writeResult : readResult))
  return b
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (table: string) => {
      if (table !== 'assets') throw new Error(`onverwachte tabel ${table}`)
      return chain()
    },
  }),
}))

import { PATCH } from './route'

function req(body: unknown) {
  return new Request('http://x/api/assets/id/expected-return', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as never
}
const params = (id = ID) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  user = { id: USER }
  readResult = { data: { id: ID, asset_type: 'investment', depreciation_rate: null }, error: null }
  writeResult = { data: { id: ID }, error: null }
  calls = []
})

describe('PATCH /api/assets/[id]/expected-return', () => {
  it('401 zonder sessie, zonder DB-toegang', async () => {
    user = null
    const res = await PATCH(req({ expected_return: 6 }), params())
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('404 op een malformed id, zonder DB-toegang', async () => {
    const res = await PATCH(req({ expected_return: 6 }), params('abc'))
    expect(res.status).toBe(404)
    expect(calls).toHaveLength(0)
  })

  it('leest en schrijft op eigen rij; schrijft alleen expected_return en pint het type', async () => {
    const res = await PATCH(req({ expected_return: 5.5 }), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: ID, expected_return: 5.5 })
    const [lees, schrijf] = calls
    expect(lees.select).toEqual([['id, asset_type, depreciation_rate']])
    expect(lees.eq).toEqual([
      ['id', ID],
      ['user_id', USER],
    ])
    expect(schrijf.update).toEqual([[{ expected_return: 5.5 }]])
    expect(schrijf.eq).toEqual([
      ['id', ID],
      ['user_id', USER],
      ['asset_type', 'investment'],
    ])
    expect(schrijf.or).toEqual([['depreciation_rate.is.null,depreciation_rate.lte.0']])
    expect(schrijf.select).toEqual([['id']])
  })

  it('vreemde of partnerrij (lezen levert 0 rijen) → 404, geen write', async () => {
    readResult = { data: null, error: null }
    const res = await PATCH(req({ expected_return: 6 }), params())
    expect(res.status).toBe(404)
    expect(calls).toHaveLength(1)
  })

  it('0 geraakte rijen bij de write (type gewisseld, rij weg) → 404, geen succes', async () => {
    writeResult = { data: null, error: null }
    const res = await PATCH(req({ expected_return: 6 }), params())
    expect(res.status).toBe(404)
  })

  it('buiten de band van het type → 400 met de tekst van het formulier, geen write', async () => {
    readResult = { data: { id: ID, asset_type: 'savings', depreciation_rate: null }, error: null }
    const res = await PATCH(req({ expected_return: -1 }), params())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Rendement moet tussen 0% en 15% per jaar liggen')
    expect(calls).toHaveLength(1)
  })

  it('een negatief rendement binnen de band (auto zonder afschrijving) is geldig', async () => {
    readResult = { data: { id: ID, asset_type: 'vehicle', depreciation_rate: 0 }, error: null }
    const res = await PATCH(req({ expected_return: -12 }), params())
    expect(res.status).toBe(200)
  })

  it('afschrijvend bezit → 409, geen write', async () => {
    readResult = { data: { id: ID, asset_type: 'vehicle', depreciation_rate: 15 }, error: null }
    const res = await PATCH(req({ expected_return: 2 }), params())
    expect(res.status).toBe(409)
    expect(calls).toHaveLength(1)
  })

  it.each([
    ['extra sleutel', { expected_return: 6, user_id: 'u2' }],
    ['geen getal', { expected_return: '6' }],
    ['geen veld', {}],
    ['geen JSON', 'nee'],
  ])('400 bij %s, zonder DB-toegang', async (_naam, body) => {
    const res = await PATCH(req(body), params())
    expect(res.status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  // OMGEKLAPT met ADR 0166 (TPR-02 vervolg). `null` was hier een 400: de kolom
  // was NOT NULL DEFAULT 0 en "geen eigen rendement" bestond niet als keuze.
  // Sinds migratie 20260919140000 IS het een keuze, en deze route is het
  // schrijfpad ervoor. De oude assertie stond in de 400-tabel hierboven; dat
  // deze test van betekenis omklapt is het bewijs dat de semantiek daadwerkelijk
  // is veranderd en niet alleen het schema.
  it('null wordt opgeslagen als "geen eigen rendement", niet geweigerd', async () => {
    readResult = { data: { id: ID, asset_type: 'investment', depreciation_rate: 0 }, error: null }
    const res = await PATCH(req({ expected_return: null }), params())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ id: ID, expected_return: null })
  })

  it('null slaat de rendementsband over — een band begrenst een getal dat er niet is', async () => {
    // `savings` heeft een smalle band; 999 zou hier een 400 geven. `null` niet:
    // er valt niets te begrenzen, de terugval heeft zijn eigen grens op het profiel.
    readResult = { data: { id: ID, asset_type: 'savings', depreciation_rate: 0 }, error: null }
    expect((await PATCH(req({ expected_return: 999 }), params())).status).toBe(400)
    expect((await PATCH(req({ expected_return: null }), params())).status).toBe(200)
  })

  it('afschrijvend bezit blijft 409, ook bij null', async () => {
    // Een afschrijvende auto moet een BEWUSTE 0 houden. Zou null hier passeren,
    // dan ging hij op het profielrendement (bv. 7%) GROEIEN in plaats van dalen.
    readResult = { data: { id: ID, asset_type: 'vehicle', depreciation_rate: 15 }, error: null }
    const res = await PATCH(req({ expected_return: null }), params())
    expect(res.status).toBe(409)
    expect(calls).toHaveLength(1)
  })

  it('DB-fout: generieke 500 zonder interne tekst', async () => {
    readResult = { data: null, error: { message: 'pg: permission denied for secret_table' } }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await PATCH(req({ expected_return: 6 }), params())
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret_table')
    spy.mockRestore()
  })
})

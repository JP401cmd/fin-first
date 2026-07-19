import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor /api/parameters — het lees-/schrijfcontract rond het spaarquote-doel
 * na de samenvoeging (ronde 4, besluit 3):
 *   - GET geeft de goals-gebaseerde `target_savings_rate` (parameter-doel wint);
 *   - GET valt terug op de profielkolom als er geen parameter-rij is;
 *   - GET → null als er geen van beide is (default-gedrag);
 *   - PUT met `target_savings_rate` in de body muteert de (DEPRECATED) kolom NIET meer.
 *
 * De Supabase-mock is een chainbare query-builder die per (tabel:op) resolvt en
 * upsert-payloads vangt, zodat we kunnen asserten wat er wél/niet naar `profiles` gaat.
 */

const { mockGetUser, mockGetAuthClaims, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetAuthClaims: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFrom })),
  getAuthClaims: mockGetAuthClaims,
}))

import { GET, PUT } from './route'

const USER = { id: 'user-1' }
const CLAIMS = { sub: USER.id }

const results = {
  profilesSelect: vi.fn(),
  goalsSelect: vi.fn(),
  profilesUpsert: vi.fn(),
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let upserted: Array<{ table: string; payload: any }> = []

function resolveFor(table: string, op: string | undefined): Promise<unknown> {
  const key = `${table}:${op}`
  switch (key) {
    case 'profiles:select':
      return Promise.resolve(results.profilesSelect())
    case 'goals:select':
      return Promise.resolve(results.goalsSelect())
    case 'profiles:upsert':
      return Promise.resolve(results.profilesUpsert())
    default:
      return Promise.resolve({ data: null, error: null })
  }
}

function builder(table: string) {
  let op: string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {
    select: () => {
      if (op === undefined) op = 'select'
      return b
    },
    upsert: (payload: unknown) => {
      op = 'upsert'
      upserted.push({ table, payload })
      return b
    },
    eq: () => b,
    limit: () => b,
    maybeSingle: () => resolveFor(table, op),
    single: () => resolveFor(table, op),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then: (onF: any, onR: any) => resolveFor(table, op).then(onF, onR),
  }
  return b
}

function putRequest(body: unknown) {
  return {
    json: () => Promise.resolve(body),
  } as unknown as import('next/server').NextRequest
}

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: USER } })
  mockGetAuthClaims.mockReset().mockResolvedValue(CLAIMS)
  mockFrom.mockReset().mockImplementation((table: string) => builder(table))
  upserted = []
  results.profilesSelect.mockReset().mockReturnValue({ data: {}, error: null })
  results.goalsSelect.mockReset().mockReturnValue({ data: null, error: null })
  results.profilesUpsert.mockReset().mockReturnValue({ error: null })
})

describe('GET /api/parameters — spaarquote-doel resolutie', () => {
  it('goals-rij wint over de profielkolom', async () => {
    results.profilesSelect.mockReturnValue({ data: { target_savings_rate: 40 }, error: null })
    results.goalsSelect.mockReturnValue({ data: { target_value: 55 }, error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).target_savings_rate).toBe(55)
  })

  it('geen goals-rij → fallback op de profielkolom', async () => {
    results.profilesSelect.mockReturnValue({ data: { target_savings_rate: 40 }, error: null })
    results.goalsSelect.mockReturnValue({ data: null, error: null })
    const res = await GET()
    expect((await res.json()).target_savings_rate).toBe(40)
  })

  it('geen van beide → null (default-gedrag)', async () => {
    results.profilesSelect.mockReturnValue({ data: { target_savings_rate: null }, error: null })
    results.goalsSelect.mockReturnValue({ data: null, error: null })
    const res = await GET()
    expect((await res.json()).target_savings_rate).toBeNull()
  })
})

describe('PUT /api/parameters — marginaal_tarief range-validatie (Arch F1)', () => {
  it('accepteert het jaar-afgeleide 2026-tarief (0.3575) — vroeger door de whitelist geweigerd', async () => {
    const res = await PUT(putRequest({ marginaal_tarief: 0.3575 }))
    expect(res.status).toBe(200)
    const upsert = upserted.find((u) => u.table === 'profiles')
    expect(upsert!.payload.marginaal_tarief).toBe(0.3575)
  })

  it('weigert een tarief buiten [0,30; 0,60]', async () => {
    const res = await PUT(putRequest({ marginaal_tarief: 0.9 }))
    expect(res.status).toBe(400)
  })

  it('null blijft "automatisch" (jaar-afgeleid)', async () => {
    const res = await PUT(putRequest({ marginaal_tarief: null }))
    expect(res.status).toBe(200)
    const upsert = upserted.find((u) => u.table === 'profiles')
    expect(upsert!.payload.marginaal_tarief).toBeNull()
  })
})

describe('PUT /api/parameters — schrijfpad dicht', () => {
  it('target_savings_rate in de body muteert de kolom NIET meer', async () => {
    const res = await PUT(putRequest({ net_monthly_income: 3500, target_savings_rate: 30 }))
    expect(res.status).toBe(200)

    const upsert = upserted.find((u) => u.table === 'profiles')
    expect(upsert).toBeTruthy()
    // De legitieme cash-setting wordt wél geschreven ...
    expect(upsert!.payload.net_monthly_income).toBe(3500)
    // ... maar target_savings_rate zit NIET in de payload (goals is dé bron).
    expect('target_savings_rate' in upsert!.payload).toBe(false)

    // En het staat ook niet in de response-echo.
    expect('target_savings_rate' in (await res.json())).toBe(false)
  })
})

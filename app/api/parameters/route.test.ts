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

describe('PUT /api/parameters — box3_method (TPR-10: instelbaar, zod-enum)', () => {
  it('accepteert "werkelijk" en schrijft de kolom', async () => {
    const res = await PUT(putRequest({ box3_method: 'werkelijk' }))
    expect(res.status).toBe(200)
    const upsert = upserted.find((u) => u.table === 'profiles')
    expect(upsert!.payload.box3_method).toBe('werkelijk')
    expect((await res.json()).box3_method).toBe('werkelijk')
  })

  it('accepteert "forfaitair"', async () => {
    const res = await PUT(putRequest({ box3_method: 'forfaitair' }))
    expect(res.status).toBe(200)
    expect(upserted.find((u) => u.table === 'profiles')!.payload.box3_method).toBe('forfaitair')
  })

  it('weigert elke andere waarde met een platte error-envelope (400)', async () => {
    for (const bad of ['fictief', '', 1, null, true]) {
      upserted = []
      const res = await PUT(putRequest({ box3_method: bad }))
      expect(res.status).toBe(400)
      expect(typeof (await res.json()).error).toBe('string')
      expect(upserted).toHaveLength(0)
    }
  })

  it('niet meegestuurd = kolom ongemoeid (deelpatch)', async () => {
    const res = await PUT(putRequest({ net_monthly_income: 3500 }))
    expect(res.status).toBe(200)
    const upsert = upserted.find((u) => u.table === 'profiles')
    expect('box3_method' in upsert!.payload).toBe(false)
    // …en de echo bevestigt geen methode die niet is opgeslagen.
    expect('box3_method' in (await res.json())).toBe(false)
  })
})

describe('PUT /api/parameters — box3_heffingvrij_inkomen (TPR-12: server-band uit PARAMETER_BANDS)', () => {
  it('accepteert een bedrag binnen de band en schrijft + echoot het', async () => {
    const res = await PUT(putRequest({ box3_heffingvrij_inkomen: 2500 }))
    expect(res.status).toBe(200)
    const upsert = upserted.find((u) => u.table === 'profiles')
    expect(upsert!.payload.box3_heffingvrij_inkomen).toBe(2500)
    expect((await res.json()).box3_heffingvrij_inkomen).toBe(2500)
  })

  it('null wist de keuze (→ kernel-default 1800 in de adapter)', async () => {
    const res = await PUT(putRequest({ box3_heffingvrij_inkomen: null }))
    expect(res.status).toBe(200)
    const upsert = upserted.find((u) => u.table === 'profiles')
    expect(upsert!.payload.box3_heffingvrij_inkomen).toBeNull()
  })

  it('buiten de band of geen getal → 400 met de gedeelde bandtekst, niets geschreven', async () => {
    for (const bad of [100_001, -1, 'veel', true]) {
      upserted = []
      const res = await PUT(putRequest({ box3_heffingvrij_inkomen: bad }))
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/Heffingvrij inkomen moet tussen/)
      expect(upserted).toHaveLength(0)
    }
  })

  it('niet meegestuurd = kolom ongemoeid én niet in de echo', async () => {
    const res = await PUT(putRequest({ box3_method: 'werkelijk' }))
    expect(res.status).toBe(200)
    const upsert = upserted.find((u) => u.table === 'profiles')
    expect('box3_heffingvrij_inkomen' in upsert!.payload).toBe(false)
    expect('box3_heffingvrij_inkomen' in (await res.json())).toBe(false)
  })

  it('GET geeft de kolom terug (NULL = niet gekozen)', async () => {
    results.profilesSelect.mockReturnValue({ data: { box3_heffingvrij_inkomen: 2400 }, error: null })
    expect((await (await GET()).json()).box3_heffingvrij_inkomen).toBe(2400)
    results.profilesSelect.mockReturnValue({ data: {}, error: null })
    expect((await (await GET()).json()).box3_heffingvrij_inkomen).toBeNull()
  })
})

describe('PUT /api/parameters — marginaal_tarief is geen invoer meer (TPR-10)', () => {
  it('een meegestuurd marginaal_tarief wordt genegeerd: niet in de payload, niet in de echo', async () => {
    const res = await PUT(putRequest({ marginaal_tarief: 0.3575, expected_return: 0.07 }))
    expect(res.status).toBe(200)
    const upsert = upserted.find((u) => u.table === 'profiles')
    expect('marginaal_tarief' in upsert!.payload).toBe(false)
    expect('marginaal_tarief' in (await res.json())).toBe(false)
  })

  it('GET geeft geen marginaal_tarief meer terug', async () => {
    results.profilesSelect.mockReturnValue({ data: { marginaal_tarief: 0.495 }, error: null })
    const res = await GET()
    expect('marginaal_tarief' in (await res.json())).toBe(false)
  })
})

describe('PUT /api/parameters — AC7: bronwaarde + selectie landen in ÉÉN upsert-call (ADR 0103)', () => {
  // Het uitgesloten id moet uuid-vormig zijn: `parseCashflowBasisPrefs` weigert
  // sinds de security-review elke andere vorm (budgets.id is een uuid, dus een
  // niet-uuid is een betekenisloze uitsluiting). Assertions ongewijzigd.
  const BUDGET_ID = '11111111-1111-4111-8111-111111111111'

  it('income_source en cashflow_basis_prefs landen in DEZELFDE upsert-payload, en er is precies één upsert-call', async () => {
    const res = await PUT(
      putRequest({
        income_source: 'budget',
        cashflow_basis_prefs: { v: 1, excludedIncomeBudgetIds: [BUDGET_ID], excludedExpenseBudgetIds: [] },
      }),
    )
    expect(res.status).toBe(200)

    const profileUpserts = upserted.filter((u) => u.table === 'profiles')
    // Nooit twee calls: bron los van selectie zou een waarneembare tussentoestand
    // geven (grondslag al gewijzigd, uitsluitlijst nog niet — of andersom bij een
    // gefaalde tweede call).
    expect(profileUpserts).toHaveLength(1)
    expect(profileUpserts[0].payload.income_source).toBe('budget')
    expect(profileUpserts[0].payload.cashflow_basis_prefs).toEqual({
      v: 1, excludedIncomeBudgetIds: [BUDGET_ID], excludedExpenseBudgetIds: [],
    })
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

/**
 * TPR-15 — de retry zonder de optionele kolommen is een vangnet voor een DB waarop een
 * migratie nog niet draaide (ontbrekende kolom). Hij mag NIET vuren op elke andere fout:
 * dan zou bv. een CHECK-schending of een tijdelijke storing stil worden "opgelost" door
 * de optionele velden weg te laten, en de response bevestigt dan minder dan gevraagd.
 */
describe('PUT /api/parameters — retry alleen bij een ontbrekende kolom', () => {
  it('ontbrekende kolom (PGRST204) → één retry zonder de optionele kolommen', async () => {
    results.profilesUpsert
      .mockReturnValueOnce({ error: { code: 'PGRST204', message: "Could not find the 'box3_heffingvrij_inkomen' column" } })
      .mockReturnValueOnce({ error: null })
    const res = await PUT(putRequest({ box3_method: 'werkelijk', box3_heffingvrij_inkomen: 2500 }))
    expect(res.status).toBe(200)
    const profileUpserts = upserted.filter((u) => u.table === 'profiles')
    expect(profileUpserts).toHaveLength(2)
    expect('box3_heffingvrij_inkomen' in profileUpserts[1].payload).toBe(false)
    expect('box3_heffingvrij_inkomen' in (await res.json())).toBe(false)
  })

  it('ontbrekende kolom (42703) → ook een retry', async () => {
    results.profilesUpsert
      .mockReturnValueOnce({ error: { code: '42703', message: 'column does not exist' } })
      .mockReturnValueOnce({ error: null })
    const res = await PUT(putRequest({ pension_factor_a: 1000 }))
    expect(res.status).toBe(200)
    expect(upserted.filter((u) => u.table === 'profiles')).toHaveLength(2)
  })

  it('een andere fout (bv. CHECK-schending 23514) → géén retry, generieke 500', async () => {
    results.profilesUpsert.mockReturnValue({ error: { code: '23514', message: 'violates check constraint' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await PUT(putRequest({ box3_heffingvrij_inkomen: 2500 }))
    spy.mockRestore()
    expect(res.status).toBe(500)
    expect(upserted.filter((u) => u.table === 'profiles')).toHaveLength(1)
    expect(JSON.stringify(await res.json())).not.toMatch(/violates|constraint/)
  })
})

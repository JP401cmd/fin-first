import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Tests voor POST /api/web-vitals — de ontvangstkant van de eigen
 * web-vitals/RUM-collectie (feature 884). Dekt:
 *   AC1 — geldige body → 204 + insert met juiste kolommen
 *   AC2 — de handler scrubt `route` server-side (client niet vertrouwen)
 *   AC3 — met sessie → user_id uit getClaims
 *   AC4 — zonder/ongeldige sessie → user_id null, meting niet verloren (204)
 *   AC5 — validatiefouten (onbekende metric, waarde buiten bereik, ongeldige
 *         JSON, body > 4096 bytes) → 4xx zonder insert, platte { error }-envelope
 *   AC7 — `environment` komt server-side uit VERCEL_ENV (T0.1), met
 *         'development' als fallback voor zowel ontbrekende als lege waarde,
 *         en is niet te spoofen via de body
 *   + user_id komt nooit uit de payload, alleen uit getClaims
 * AC6 (fire-and-forget/sendBeacon) is client-gedrag en hier bewust niet getest.
 */

const mockInsert = vi.fn()
const mockGetClaims = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: () => ({
    from: (table: string) => ({
      insert: (payload: unknown) => mockInsert(table, payload),
    }),
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getClaims: () => mockGetClaims() },
  }),
}))

import { POST } from './route'

beforeEach(() => {
  mockInsert.mockReset()
  mockInsert.mockResolvedValue({ error: null })
  mockGetClaims.mockReset()
  mockGetClaims.mockResolvedValue({ data: null })
  // Lokale ontwikkel-situatie als uitgangspunt: Vercel zet deze var, wij niet.
  // Via stubEnv i.p.v. `process.env = {...}`: dat laatste vervangt de echte
  // env-binding door een plat object, en `process` is gedeeld binnen een
  // vitest-worker — latere testbestanden zouden die vervanging erven.
  vi.stubEnv('VERCEL_ENV', undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function req(body: unknown, raw?: string): Request {
  const text = raw ?? JSON.stringify(body)
  return new Request('https://x.test/api/web-vitals', { method: 'POST', body: text })
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    metric: 'LCP',
    value: 1234.5,
    rating: 'good',
    route: '/overzicht',
    ...overrides,
  }
}

describe('POST /api/web-vitals', () => {
  it('AC1 — geldige LCP-body → 204 + insert met juiste kolommen', async () => {
    const res = await POST(req(validBody()))
    expect(res.status).toBe(204)
    expect(mockInsert).toHaveBeenCalledTimes(1)
    const [table, payload] = mockInsert.mock.calls[0]
    expect(table).toBe('web_vitals')
    expect(payload).toMatchObject({
      metric: 'LCP',
      value: 1234.5,
      route: '/overzicht',
    })
  })

  it('AC2 — scrubt route server-side vóór insert', async () => {
    await POST(
      req(
        validBody({
          route: '/overzicht/bezittingen/woning/3fa85f64-5717-4562-b3fc-2c963f66afa6',
        }),
      ),
    )
    const [, payload] = mockInsert.mock.calls[0]
    expect(payload).toMatchObject({ route: '/overzicht/bezittingen/woning/[id]' })
  })

  it('AC3 — met sessie: user_id komt uit getClaims', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-123' } } })
    const res = await POST(req(validBody()))
    expect(res.status).toBe(204)
    const [, payload] = mockInsert.mock.calls[0]
    expect(payload).toMatchObject({ user_id: 'user-123' })
  })

  it('AC4a — zonder sessie (lege claims): user_id null, meting niet verloren (204)', async () => {
    mockGetClaims.mockResolvedValue({ data: null })
    const res = await POST(req(validBody()))
    expect(res.status).toBe(204)
    const [, payload] = mockInsert.mock.calls[0]
    expect(payload).toMatchObject({ user_id: null })
  })

  it('AC4b — getClaims gooit een fout: user_id null, meting niet verloren (204)', async () => {
    mockGetClaims.mockRejectedValue(new Error('geen geldige sessie'))
    const res = await POST(req(validBody()))
    expect(res.status).toBe(204)
    const [, payload] = mockInsert.mock.calls[0]
    expect(payload).toMatchObject({ user_id: null })
  })

  it('AC5a — onbekende metric → 400, geen insert', async () => {
    const res = await POST(req(validBody({ metric: 'XYZ' })))
    expect(res.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({ error: expect.any(String) })
  })

  it.each([
    ['boven MAX_METRIC_VALUE', 3_600_001],
    ['negatief', -1],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ])('AC5b — value %s → 400, geen insert', async (_label, value) => {
    const res = await POST(req(validBody({ value })))
    expect(res.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({ error: expect.any(String) })
  })

  it('AC5c — ongeldige JSON → 400, geen insert', async () => {
    const res = await POST(req(undefined, '{not valid json'))
    expect(res.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({ error: expect.any(String) })
  })

  it('AC5d — body > 4096 bytes → 413, geen insert, platte envelope', async () => {
    const oversized = JSON.stringify(validBody({ route: '/x/' + 'a'.repeat(5000) }))
    const res = await POST(req(undefined, oversized))
    expect(res.status).toBe(413)
    expect(mockInsert).not.toHaveBeenCalled()
    expect(await res.json()).toEqual({ error: expect.any(String) })
  })

  it.each([
    ['production', 'production'],
    ['preview', 'preview'],
  ])('AC7a — VERCEL_ENV=%s → insert-payload environment %s', async (vercelEnv, expected) => {
    vi.stubEnv('VERCEL_ENV', vercelEnv)
    const res = await POST(req(validBody()))
    expect(res.status).toBe(204)
    const [, payload] = mockInsert.mock.calls[0]
    expect(payload).toMatchObject({ environment: expected })
  })

  it('AC7b — zonder VERCEL_ENV (lokaal) → environment "development"', async () => {
    const res = await POST(req(validBody()))
    expect(res.status).toBe(204)
    const [, payload] = mockInsert.mock.calls[0]
    expect(payload).toMatchObject({ environment: 'development' })
  })

  it('AC7b2 — lege VERCEL_ENV telt als niet-gezet, niet als environment ""', async () => {
    // Een lege string zou als '' wegschrijven en daarmee in geen enkele
    // omgevingsselectie op /beheer/webprestaties meer terugkomen.
    vi.stubEnv('VERCEL_ENV', '')
    const res = await POST(req(validBody()))
    expect(res.status).toBe(204)
    const [, payload] = mockInsert.mock.calls[0]
    expect(payload).toMatchObject({ environment: 'development' })
  })

  it('AC7c — environment komt nooit uit de payload (spoof genegeerd)', async () => {
    // Lokale meting die zich voordoet als productie: zou de productie-p75
    // vervuilen — precies wat de kolom moet voorkomen.
    const res = await POST(req(validBody({ environment: 'production' })))
    expect(res.status).toBe(204)
    const [, payload] = mockInsert.mock.calls[0]
    expect(payload).toMatchObject({ environment: 'development' })
  })

  it('AC7d — een gespoofte environment overschrijft de echte VERCEL_ENV niet', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const res = await POST(req(validBody({ environment: 'production' })))
    expect(res.status).toBe(204)
    const [, payload] = mockInsert.mock.calls[0]
    expect(payload).toMatchObject({ environment: 'preview' })
  })

  it('user_id komt nooit uit de payload, ook niet als het er expliciet in staat', async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: { sub: 'echte-user' } } })
    const res = await POST(
      req(validBody({ user_id: 'gespoofte-user', userId: 'gespoofte-user' })),
    )
    expect(res.status).toBe(204)
    const [, payload] = mockInsert.mock.calls[0]
    expect(payload).toMatchObject({ user_id: 'echte-user' })
  })
})

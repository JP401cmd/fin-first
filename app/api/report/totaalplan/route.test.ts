import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor GET /api/report/totaalplan — borgt dat de route zonder ingelogde
 * gebruiker 401 teruggeeft en de DB niet aanraakt (spiegel het auth-gate-patroon
 * uit app/api/parameters/route.test.ts en app/api/toekomst-doel/route.test.ts),
 * én dat de beheerde jaarlaag `fire_assumptions.volatility` (ADR 0117) uit de
 * horizon-bundel op de kernel-context belandt — tot 3 sep 2026 liet de route
 * dat veld vallen, waardoor de slagingskans van het rapport op de default-σ
 * rekende terwijl /toekomst de jaarlaag al droeg.
 */

const { mockGetAuthClaims, mockFrom, mockLoadHorizonRaw, mockAssemble } = vi.hoisted(() => ({
  mockGetAuthClaims: vi.fn(),
  mockFrom: vi.fn(),
  mockLoadHorizonRaw: vi.fn(),
  mockAssemble: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
  getAuthClaims: mockGetAuthClaims,
}))
vi.mock('@/lib/horizon-data-loader', () => ({ loadHorizonRaw: mockLoadHorizonRaw }))
vi.mock('@/lib/aandachtspunten-loader', () => ({ collectAandachtspunten: vi.fn(async () => []) }))
// De input-assemblage is hier niet onder test; `null` laat de route op zijn
// jaaruitgaven-terugval lopen zonder een volledige HorizonRawData te vergen.
vi.mock('@/lib/horizon/build-input', () => ({ buildHorizonInput: vi.fn(() => null) }))
vi.mock('@/lib/totaalplan-data', () => ({ assembleTotaalplan: mockAssemble }))

import { GET } from './route'

/**
 * Minimale PostgREST-query-builder: elke keten-methode geeft zichzelf terug en
 * het object is thenable, zodat `await sb.from(t).select(…).single()` én
 * `await sb.from(t).select('*')` beide `result` opleveren.
 */
function queryChain(result: { data: unknown; error: null }) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  for (const m of ['select', 'eq', 'in', 'order', 'single', 'maybeSingle']) chain[m] = self
  chain.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(onOk, onErr)
  return chain
}

beforeEach(() => {
  mockGetAuthClaims.mockReset().mockResolvedValue(null)
  mockFrom.mockReset()
  mockLoadHorizonRaw.mockReset()
  mockAssemble.mockReset()
})

describe('GET /api/report/totaalplan — auth-gate', () => {
  it('401 zonder sessie, geen DB-aanraking', async () => {
    const res = await GET()
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBeTruthy()
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

describe('GET /api/report/totaalplan — marktVolatiliteit uit de horizon-bundel (ADR 0117)', () => {
  it('zet HorizonRawData.marktVolatiliteit op kernelContext.marktVolatiliteit', async () => {
    mockGetAuthClaims.mockResolvedValue({ sub: 'user-1' })
    mockFrom.mockImplementation((table: string) =>
      queryChain(table === 'profiles' ? { data: {}, error: null } : { data: [], error: null }),
    )
    mockLoadHorizonRaw.mockResolvedValue({
      effectiveInput: { dateOfBirth: null, monthlyExpenses: 2500 },
      events: [],
      assets: [],
      debts: [],
      rawProfile: null,
      dailyExpenseRate: 80,
      fireParams: { grossReturn: 0.07, inflationRate: 0.02 },
      // De beheerde jaarlaag — bewust NIET de default (0,15), anders bewijst de
      // toets niets.
      marktVolatiliteit: 0.22,
    })
    mockAssemble.mockReturnValue({ generatedAt: 'x', projectie: { ok: false } })

    const res = await GET()
    expect(res.status).toBe(200)
    expect(mockAssemble).toHaveBeenCalledTimes(1)
    const raw = mockAssemble.mock.calls[0][0] as { kernelContext: { marktVolatiliteit?: number } }
    expect(raw.kernelContext.marktVolatiliteit).toBe(0.22)
  })
})

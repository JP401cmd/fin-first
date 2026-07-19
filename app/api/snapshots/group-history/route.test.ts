import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor GET /api/snapshots/group-history — "Netto vermogen — verloop" (B2a).
 *
 * Verifieert het VASTE contract waartegen de UI koppelt:
 *   { months, assetGroups, debtGroups, rest, net, hasData, provenance }
 * met:
 *   - 401 zonder sessie
 *   - as-uitlijning van net/rest op de loader-maand-as
 *   - restband-identiteit rest[m] = net[m] − (Σassets[m] − Σdebts[m]), incl.
 *     negatief geval en null waar er geen maandstand is
 *   - 'manual'-detectie op de net-provenance (snapshot_date op de 1e = handmatig)
 *   - hasData=false bij lege balance_snapshots-bron
 *
 * De B1-loader wordt gemockt (deze test bewaakt de route-samenstelling, niet de
 * loader-aggregatie); `net_worth_snapshots` + de `balance_snapshots`-count
 * worden via de gemockte Supabase-client geleverd.
 */

const { mockGetAuthClaims, mockFrom, mockLoadWealthGroupHistory } = vi.hoisted(() => ({
  mockGetAuthClaims: vi.fn(),
  mockFrom: vi.fn(),
  mockLoadWealthGroupHistory: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
  })),
  getAuthClaims: mockGetAuthClaims,
}))

vi.mock('@/lib/load-category-history', () => ({
  loadWealthGroupHistory: (...args: unknown[]) => mockLoadWealthGroupHistory(...args),
}))

import { GET } from './route'

const USER = { id: 'user-1' }
const CLAIMS = { sub: USER.id }

beforeEach(() => {
  mockGetAuthClaims.mockReset()
  mockFrom.mockReset()
  mockLoadWealthGroupHistory.mockReset()
})

function getRequest(months?: string) {
  const qs = months !== undefined ? `?months=${months}` : ''
  return new Request(`http://localhost/api/snapshots/group-history${qs}`)
}

type ProvKind = 'measured' | 'locf' | 'manual'

/** Bouwt een complete GroupHistoryData-vorm (alle 5 asset- + 3 schuldgroepen). */
function buildGroups(overrides: {
  months?: string[]
  assetGroups?: Partial<Record<string, number[]>>
  debtGroups?: Partial<Record<string, number[]>>
  provenance?: Record<string, ProvKind[]>
} = {}) {
  const months = overrides.months ?? ['2026-03', '2026-04', '2026-05']
  const n = months.length
  const zeros = () => new Array(n).fill(0)
  const assetGroups: Record<string, number[]> = {
    spaargeld: zeros(), beleggingen: zeros(), pensioen: zeros(), vastgoed: zeros(), overig: zeros(),
    ...(overrides.assetGroups ?? {}),
  }
  const debtGroups: Record<string, number[]> = {
    wonen: zeros(), consumptief: zeros(), overig: zeros(),
    ...(overrides.debtGroups ?? {}),
  }
  const provenance: Record<string, ProvKind[]> = {}
  for (const g of Object.keys(assetGroups)) provenance[`asset:${g}`] = new Array(n).fill('measured') as ProvKind[]
  for (const g of Object.keys(debtGroups)) provenance[`debt:${g}`] = new Array(n).fill('measured') as ProvKind[]
  Object.assign(provenance, overrides.provenance ?? {})
  return { months, assetGroups, debtGroups, provenance }
}

/** Mockt de twee `from()`-tabellen: net_worth_snapshots + balance_snapshots-count. */
function configureFrom(opts: {
  netRows?: { snapshot_date: string; net_worth: number }[]
  netError?: unknown
  balanceCount?: number
  countError?: unknown
} = {}) {
  const netChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: opts.netRows ?? [], error: opts.netError ?? null }),
  }
  const balanceChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockResolvedValue({ count: opts.balanceCount ?? 0, error: opts.countError ?? null }),
  }
  mockFrom.mockImplementation((table: string) => {
    if (table === 'net_worth_snapshots') return netChain
    if (table === 'balance_snapshots') return balanceChain
    throw new Error(`unexpected table: ${table}`)
  })
  return { netChain, balanceChain }
}

describe('GET /api/snapshots/group-history', () => {
  it('401 zonder sessie', async () => {
    mockGetAuthClaims.mockResolvedValue(null)
    const res = await GET(getRequest())
    expect(res.status).toBe(401)
    expect(mockLoadWealthGroupHistory).not.toHaveBeenCalled()
  })

  it('happy path: vorm, as-uitlijning, restband (incl. negatief), net-null-maand', async () => {
    mockGetAuthClaims.mockResolvedValue(CLAIMS)
    mockLoadWealthGroupHistory.mockResolvedValue(
      buildGroups({
        months: ['2026-03', '2026-04', '2026-05'],
        assetGroups: {
          spaargeld: [1000, 1000, 1000],
          beleggingen: [0, 500, 500],
        },
        debtGroups: {
          wonen: [200, 200, 200],
        },
        // Groep-provenance moet ongemoeid worden doorgegeven.
        provenance: { 'asset:spaargeld': ['measured', 'measured', 'locf'] },
      }),
    )
    configureFrom({
      netRows: [
        { snapshot_date: '2026-03-15', net_worth: 900 }, // measured (dag 15)
        // geen 2026-04-rij → net null
        { snapshot_date: '2026-05-01', net_worth: 500 }, // manual (dag 01)
      ],
      balanceCount: 4,
    })

    const res = await GET(getRequest('24'))
    expect(res.status).toBe(200)
    const json = await res.json()

    expect(json.months).toEqual(['2026-03', '2026-04', '2026-05'])
    // Groepen ongewijzigd doorgegeven.
    expect(json.assetGroups.spaargeld).toEqual([1000, 1000, 1000])
    expect(json.assetGroups.beleggingen).toEqual([0, 500, 500])
    expect(json.debtGroups.wonen).toEqual([200, 200, 200])
    // net uitgelijnd op de maand-as, null waar geen stand.
    expect(json.net).toEqual([900, null, 500])
    // rest = net − (Σassets − Σdebts):
    //   mrt: 900 − (1000 − 200) = 100  (positief)
    //   apr: null (net null)
    //   mei: 500 − (1500 − 200) = -800 (negatief — nooit weggelaten)
    expect(json.rest).toEqual([100, null, -800])
    expect(json.hasData).toBe(true)
    // Groep-provenance behouden + net-lijn toegevoegd.
    expect(json.provenance['asset:spaargeld']).toEqual(['measured', 'measured', 'locf'])
    expect(json.provenance.net).toEqual(['measured', 'measured', 'manual'])
  })

  it("net-provenance: 'manual' bij een stand op de 1e, anders 'measured'", async () => {
    mockGetAuthClaims.mockResolvedValue(CLAIMS)
    mockLoadWealthGroupHistory.mockResolvedValue(buildGroups({ months: ['2026-03', '2026-04', '2026-05'] }))
    configureFrom({
      netRows: [
        { snapshot_date: '2026-03-01', net_worth: 1000 }, // manual
        { snapshot_date: '2026-04-28', net_worth: 1100 }, // measured
        // 2026-05: geen stand → 'measured' (neutraal default)
      ],
      balanceCount: 2,
    })

    const res = await GET(getRequest())
    const json = await res.json()
    expect(json.provenance.net).toEqual(['manual', 'measured', 'measured'])
  })

  it('hasData=false bij lege balance_snapshots-bron', async () => {
    mockGetAuthClaims.mockResolvedValue(CLAIMS)
    mockLoadWealthGroupHistory.mockResolvedValue(buildGroups({ months: ['2026-04', '2026-05'] }))
    configureFrom({ netRows: [], balanceCount: 0 })

    const res = await GET(getRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.hasData).toBe(false)
    // Lege bron: net overal null, rest overal null.
    expect(json.net).toEqual([null, null])
    expect(json.rest).toEqual([null, null])
  })

  it('clamp: months wordt naar 1..24 begrensd voor de loader', async () => {
    mockGetAuthClaims.mockResolvedValue(CLAIMS)
    mockLoadWealthGroupHistory.mockResolvedValue(buildGroups({ months: ['2026-05'] }))
    configureFrom({ netRows: [], balanceCount: 0 })

    await GET(getRequest('999'))
    expect(mockLoadWealthGroupHistory).toHaveBeenCalledWith(expect.anything(), { months: 24 })
  })

  it('500 bij DB-fout op de net-query (geen rauwe error naar client)', async () => {
    mockGetAuthClaims.mockResolvedValue(CLAIMS)
    mockLoadWealthGroupHistory.mockResolvedValue(buildGroups({ months: ['2026-05'] }))
    configureFrom({ netError: { message: 'boom' }, balanceCount: 0 })

    const res = await GET(getRequest())
    expect(res.status).toBe(500)
    // Generieke, client-veilige tekst — nooit de rauwe DB-message.
    expect((await res.json()).error).toBe('Er ging iets mis. Probeer het later opnieuw.')
  })
})

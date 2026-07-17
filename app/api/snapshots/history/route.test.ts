import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor /api/snapshots/history — het handmatige historische
 * netto-vermogen-pad. Verifieert het VASTE contract waartegen de UI-stream
 * koppelt:
 *   GET  → { entries: { month: 'YYYY-MM', netWorth }[] } oplopend, byMonth-dedupe,
 *          clamp months 1..24, 401 zonder sessie.
 *   POST → valideert maand-formaat/-bereik en finite netWorth; verwijdert per
 *          maand bestaande rijen en upsert één rij '<month>-01' (gezaghebbend +
 *          idempotent); 400/401/500-paden.
 */

const mockAuthGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockAuthGetUser },
    from: mockFrom,
  })),
}))

import { GET, POST } from './route'

const USER = { id: 'user-1' }

beforeEach(() => {
  mockAuthGetUser.mockReset()
  mockFrom.mockReset()
})

function getRequest(months?: string) {
  const qs = months !== undefined ? `?months=${months}` : ''
  return new Request(`http://localhost/api/snapshots/history${qs}`)
}
function postRequest(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as Request
}

// ── GET-select chain: .select().eq().gte().order() → { data, error } ──
function mockSelectChain(rows: { snapshot_date: string; net_worth: number }[] | null, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error }),
  }
  mockFrom.mockReturnValue(chain)
  return chain
}

describe('GET /api/snapshots/history', () => {
  it('401 zonder sessie', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(getRequest())
    expect(res.status).toBe(401)
  })

  it('dedupe per kalendermaand (laatste snapshot_date wint), oplopend', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    mockSelectChain([
      { snapshot_date: '2026-04-10', net_worth: 100 },
      { snapshot_date: '2026-04-28', net_worth: 150 }, // wint binnen april
      { snapshot_date: '2026-05-01', net_worth: 200 },
    ])
    const res = await GET(getRequest('24'))
    const json = await res.json()
    expect(json.entries).toEqual([
      { month: '2026-04', netWorth: 150 },
      { month: '2026-05', netWorth: 200 },
    ])
  })

  it('clamp: months wordt begrensd op 1..24 (gte-grens gezet)', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const chain = mockSelectChain([])
    await GET(getRequest('999'))
    // gte-ondergrens = eerste dag van 23 maanden terug (24 mnd incl. nu).
    const gteArg = chain.gte.mock.calls[0]?.[1] as string
    expect(gteArg).toMatch(/^\d{4}-\d{2}-01$/)
  })

  it('500 bij DB-fout', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    mockSelectChain(null, { message: 'boom' })
    const res = await GET(getRequest())
    expect(res.status).toBe(500)
    // Error-envelope (ADR 0044): rauwe DB-boodschap ('boom') mag NOOIT naar de
    // client lekken — serverError() stuurt een generieke tekst, logt server-side.
    const body = await res.json()
    expect(body.error).not.toBe('boom')
    expect(body.error).toBe('Er ging iets mis. Probeer het later opnieuw.')
  })
})

describe('POST /api/snapshots/history', () => {
  function mockWriteChains() {
    const deleteCalls: Array<[string, string]> = []
    const upserts: Array<Record<string, unknown>> = []
    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn(function (this: unknown, _c: string, v: string) {
        // @ts-expect-error capture
        this.__from = v
        return this
      }),
      lt: vi.fn(function (this: unknown, _c: string, v: string) {
        // @ts-expect-error capture
        deleteCalls.push([this.__from, v])
        return Promise.resolve({ error: null })
      }),
    }
    const upsertChain = {
      upsert: vi.fn((row: Record<string, unknown>) => {
        upserts.push(row)
        return Promise.resolve({ error: null })
      }),
    }
    // from() returns delete-chain on .delete() use and upsert-chain on .upsert().
    // We branch by inspecting the method the route calls: easiest is a combined object.
    const combined = { ...deleteChain, ...upsertChain }
    mockFrom.mockReturnValue(combined)
    return { deleteCalls, upserts }
  }

  it('401 zonder sessie', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(postRequest({ entries: [{ month: '2026-05', netWorth: 1 }] }))
    expect(res.status).toBe(401)
  })

  it('400 bij lege entries', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const res = await POST(postRequest({ entries: [] }))
    expect(res.status).toBe(400)
  })

  it('400 bij ongeldig maand-formaat', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const res = await POST(postRequest({ entries: [{ month: '2026-13', netWorth: 1 }] }))
    expect(res.status).toBe(400)
  })

  it('400 bij maand in de toekomst', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const future = new Date()
    future.setMonth(future.getMonth() + 2)
    const m = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}`
    const res = await POST(postRequest({ entries: [{ month: m, netWorth: 1 }] }))
    expect(res.status).toBe(400)
  })

  it('400 bij niet-finite netWorth', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const res = await POST(postRequest({ entries: [{ month: '2026-05', netWorth: Infinity }] }))
    expect(res.status).toBe(400)
  })

  it('accepteert negatief netto vermogen', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const { upserts } = mockWriteChains()
    const now = new Date()
    const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const res = await POST(postRequest({ entries: [{ month: m, netWorth: -5000 }] }))
    expect(res.status).toBe(200)
    expect(upserts[0].net_worth).toBe(-5000)
    expect(upserts[0].total_assets).toBe(-5000)
    expect(upserts[0].total_debts).toBe(0)
    expect(upserts[0].snapshot_date).toBe(`${m}-01`)
  })

  it('verwijdert de hele maand vóór upsert (gezaghebbend, idempotent)', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const { deleteCalls } = mockWriteChains()
    const res = await POST(postRequest({ entries: [{ month: '2026-05', netWorth: 1000 }] }))
    expect(res.status).toBe(200)
    expect(deleteCalls).toEqual([['2026-05-01', '2026-06-01']])
  })

  it('december rolt correct naar volgend jaar', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const { deleteCalls } = mockWriteChains()
    await POST(postRequest({ entries: [{ month: '2025-12', netWorth: 1 }] }))
    expect(deleteCalls).toEqual([['2025-12-01', '2026-01-01']])
  })

  it('400 bij dubbele maand in invoer', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: USER } })
    const res = await POST(
      postRequest({ entries: [{ month: '2026-05', netWorth: 1 }, { month: '2026-05', netWorth: 2 }] }),
    )
    expect(res.status).toBe(400)
  })
})

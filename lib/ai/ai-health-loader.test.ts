import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * UR3-09 / ADR 0132. Twee sloten (spiegelt `lib/beheer-inbox-counts.ts`):
 *  1. `isSuperAdmin(supabase)` op de sessie van de aanroeper — vóórdat
 *     `getServiceClient()` ooit wordt aangeroepen.
 *  2. Pas ná die check leest de service-role uit `ai_token_usage` +
 *     `error_logs`, filtert op created_at > lastSuccessAt en voedt
 *     `deriveAiHealth` (die zelf al apart getest is in ai-health.test.ts —
 *     hier draait de echte functie, geen mock, om de integratie te bewijzen).
 */

const { mockIsSuperAdmin, mockGetServiceClient, mockFrom } = vi.hoisted(() => ({
  mockIsSuperAdmin: vi.fn(),
  mockGetServiceClient: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/admin', () => ({ isSuperAdmin: mockIsSuperAdmin }))
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: mockGetServiceClient }))

import { loadAiHealth } from './ai-health-loader'

/** Thenable/awaitable query-chain: `.select().order().limit().maybeSingle()`
 *  (ai_token_usage) of `.select().like().order().limit()` — direct awaited
 *  zonder maybeSingle (error_logs). */
const bovenkanten: { kolom: string; waarde: string }[] = []

function chain(resolve: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'limit', 'like']) c[m] = () => c
  // De bovenkant van het leesvenster: vastgelegd, zodat de test kan zien dat hij er staat.
  c.lte = (kolom: string, waarde: string) => {
    bovenkanten.push({ kolom, waarde })
    return c
  }
  c.maybeSingle = () => Promise.resolve(resolve)
  c.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(resolve).then(onF, onR)
  return c
}

interface Tables {
  successRow?: { created_at: string } | null
  successError?: unknown
  failureRows?: { created_at: string; message: string }[]
  failureError?: unknown
}

function mockTables(opts: Tables) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'ai_token_usage') {
      return chain({ data: opts.successRow ?? null, error: opts.successError ?? null })
    }
    if (table === 'error_logs') {
      return chain({ data: opts.failureRows ?? [], error: opts.failureError ?? null })
    }
    throw new Error(`onverwachte tabel in test: ${table}`)
  })
  mockGetServiceClient.mockReturnValue({ from: mockFrom })
}

const FAKE_SESSION = {} as never

beforeEach(() => {
  mockIsSuperAdmin.mockReset()
  mockGetServiceClient.mockReset()
  mockFrom.mockReset()
  bovenkanten.length = 0
})

describe('loadAiHealth — het leesvenster heeft een bovenkant', () => {
  it('beide lezingen reiken tot nu plus een kleine klokmarge, niet verder', async () => {
    // In error_logs mag een ingelogde gebruiker zelf schrijven, met een
    // zelfgekozen tijdstip. Een foutregel uit 2099 ligt altijd na de laatste
    // geslaagde aanroep en zou de gezondheid blijvend op "storing" houden.
    mockIsSuperAdmin.mockResolvedValue(true)
    mockTables({ successRow: { created_at: '2026-09-05T08:00:00Z' }, failureRows: [] })
    const voor = Date.now()
    await loadAiHealth(FAKE_SESSION)
    const na = Date.now()

    expect(bovenkanten).toHaveLength(2)
    for (const b of bovenkanten) {
      expect(b.kolom).toBe('created_at')
      const ms = Date.parse(b.waarde)
      expect(ms).toBeGreaterThanOrEqual(voor)
      expect(ms).toBeLessThanOrEqual(na + 10 * 60 * 1000)
      expect('2099-01-01T00:00:00.000Z' <= b.waarde).toBe(false)
    }
  })
})

describe('loadAiHealth — toegangscontrole', () => {
  it('geen superadmin → unknown, ZONDER getServiceClient ooit aan te roepen', async () => {
    mockIsSuperAdmin.mockResolvedValue(false)

    const r = await loadAiHealth(FAKE_SESSION)

    expect(r).toEqual({ status: 'unknown', sinceAt: null, failureCount: 0, lastSuccessAt: null })
    expect(mockGetServiceClient).not.toHaveBeenCalled()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('superadmin: leest via de service-role en levert een echte status', async () => {
    mockIsSuperAdmin.mockResolvedValue(true)
    mockTables({ successRow: { created_at: '2026-09-01T10:00:00Z' }, failureRows: [] })

    const r = await loadAiHealth(FAKE_SESSION)

    expect(r.status).toBe('ok')
    expect(r.lastSuccessAt).toBe('2026-09-01T10:00:00Z')
    expect(mockGetServiceClient).toHaveBeenCalledTimes(1)
  })
})

describe('loadAiHealth — leesfouten', () => {
  it('een fout op ai_token_usage → unknown', async () => {
    mockIsSuperAdmin.mockResolvedValue(true)
    mockTables({ successError: { message: 'boom' }, failureRows: [] })

    expect(await loadAiHealth(FAKE_SESSION)).toEqual({
      status: 'unknown',
      sinceAt: null,
      failureCount: 0,
      lastSuccessAt: null,
    })
  })

  it('een fout op error_logs → unknown', async () => {
    mockIsSuperAdmin.mockResolvedValue(true)
    mockTables({ successRow: { created_at: '2026-09-01T10:00:00Z' }, failureError: { message: 'boom' } })

    expect(await loadAiHealth(FAKE_SESSION)).toEqual({
      status: 'unknown',
      sinceAt: null,
      failureCount: 0,
      lastSuccessAt: null,
    })
  })
})

describe('loadAiHealth — filtering op created_at > lastSuccessAt', () => {
  it('een mislukking VÓÓR het laatste succes telt niet mee', async () => {
    mockIsSuperAdmin.mockResolvedValue(true)
    mockTables({
      successRow: { created_at: '2026-09-05T10:00:00Z' },
      failureRows: [{ created_at: '2026-09-05T09:00:00Z', message: 'refused (400/AI_APICallError): op' }],
    })

    const r = await loadAiHealth(FAKE_SESSION)
    expect(r.status).toBe('ok')
    expect(r.failureCount).toBe(0)
  })

  it('een mislukking PRECIES op het laatste succes telt niet mee (strikt "na")', async () => {
    mockIsSuperAdmin.mockResolvedValue(true)
    mockTables({
      successRow: { created_at: '2026-09-05T10:00:00Z' },
      failureRows: [{ created_at: '2026-09-05T10:00:00Z', message: 'refused (400/x): op' }],
    })

    const r = await loadAiHealth(FAKE_SESSION)
    expect(r.status).toBe('ok')
    expect(r.failureCount).toBe(0)
  })

  it('mislukkingen NA het laatste succes tellen mee en krijgen hun kind uit de messageprefix', async () => {
    mockIsSuperAdmin.mockResolvedValue(true)
    mockTables({
      successRow: { created_at: '2026-09-05T07:00:00Z' },
      failureRows: [
        { created_at: '2026-09-05T09:00:00Z', message: 'refused (400/AI_APICallError): tegoed op' },
        { created_at: '2026-09-05T08:00:00Z', message: 'transient (429/AI_APICallError): rate limit' },
      ],
    })

    const r = await loadAiHealth(FAKE_SESSION)
    expect(r.failureCount).toBe(2)
    expect(r.status).toBe('storing') // latest (09:00) is 'refused'
    expect(r.sinceAt).toBe('2026-09-05T08:00:00Z')
  })

  it('geen kind-prefix in de message → unknown (default), geen match op halve woorden', async () => {
    mockIsSuperAdmin.mockResolvedValue(true)
    mockTables({
      successRow: null,
      failureRows: [
        { created_at: '2026-09-05T09:00:00Z', message: 'refusedbutnotreally: iets' },
        { created_at: '2026-09-05T10:00:00Z', message: 'geen herkenbaar voorvoegsel' },
      ],
    })

    const r = await loadAiHealth(FAKE_SESSION)
    // Zonder succes (lastSuccessAt=null) tellen alle rijen mee. Geen van
    // beide messages matcht het kind-voorvoegsel (het eerste faalt op de
    // woordgrens-\b, "refusedbutnotreally" is geen "refused" gevolgd door een
    // niet-woordteken) → beide vallen terug op 'unknown', dus de laatste kind
    // is 'unknown' (niet 'refused') → status 'hapering', niet 'storing'.
    expect(r.failureCount).toBe(2)
    expect(r.status).toBe('hapering')
  })
})

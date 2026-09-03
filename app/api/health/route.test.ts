import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * GET /api/health staat in `publicPaths` (lib/supabase/proxy.ts) en is dus
 * ZONDER sessie bereikbaar. Tot de security-sweep van 3 sep 2026 stuurde de
 * route bij een DB-fout de rauwe `error.message` (driver-/pooler-/relatietekst)
 * naar die anonieme aanroeper, en droeg ze een `?persistence_test=`-schrijfpad
 * naar `app_settings`. Deze suite houdt beide dicht.
 *
 * Mocking-strategie gespiegeld op app/api/ai/actions/route.test.ts.
 */

// vi.mock wordt boven de imports gehesen; de factory mag daarom alleen naar
// eveneens gehesen waarden verwijzen (vi.hoisted), anders TDZ-fout bij laden.
const { mockFrom, mockCreateClient } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockCreateClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

import { GET } from './route'

const RAW_DB_MESSAGE =
  'FATAL: password authentication failed for user "postgres" (pooler aws-0-eu-central-1)'

function fromWith(result: { data?: unknown; error?: unknown }) {
  return vi.fn(() => ({
    select: vi.fn(() => ({
      limit: vi.fn().mockResolvedValue(result),
    })),
  }))
}

beforeEach(() => {
  mockFrom.mockReset()
  mockCreateClient.mockReset()
  mockCreateClient.mockImplementation(async () => ({ from: mockFrom }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/health — publiek, dus nooit rauwe DB-tekst in de body', () => {
  it('DB-fout → 503 met vaste tekst; de drivermelding blijft server-side in het log', async () => {
    mockFrom.mockImplementation(fromWith({ data: null, error: { message: RAW_DB_MESSAGE, code: '28P01' } }))

    const res = await GET()

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('error')
    expect(body.database).toBe('disconnected')
    expect(JSON.stringify(body)).not.toMatch(/postgres|pooler|28P01|authentication/)
    // De echte fout is wél gelogd, met grep-bare tag.
    const logged = vi.mocked(console.error).mock.calls.map((c) => c.join(' ')).join('\n')
    expect(logged).toContain('[health:GET]')
    expect(logged).toContain('password authentication failed')
  })

  it('client-constructie gooit → 503 zonder stack of foutmelding in de body', async () => {
    mockCreateClient.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:6543'))

    const res = await GET()

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|6543/)
    expect(body.error).toBe('Database niet bereikbaar')
  })

  it('gezond → 200 en raakt uitsluitend `profiles` aan (geen app_settings-schrijfproef meer)', async () => {
    mockFrom.mockImplementation(fromWith({ data: [{ id: 'x' }], error: null }))

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('healthy')
    expect(body).not.toHaveProperty('persistence')
    expect(mockFrom.mock.calls.map((c) => c[0])).toEqual(['profiles'])
  })
})

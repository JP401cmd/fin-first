import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

/**
 * /api/schema-check is een dev-harness die de tabel-/kolomtopologie teruggeeft
 * en in `publicPaths` staat (uitgelogd bereikbaar). Tot de security-sweep van
 * 3 sep 2026 had de route géén NODE_ENV-guard: schema-disclosure voor iedereen
 * op internet. Route-laag: buiten `next dev` een 404 vóór er een Supabase-
 * client wordt gemaakt. (De proxy-laag heeft lib/supabase/proxy.dev-paths.test.ts.)
 */

// vi.mock wordt boven de imports gehesen; de factory mag daarom alleen naar
// eveneens gehesen waarden verwijzen (vi.hoisted), anders TDZ-fout bij laden.
const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}))

import { GET } from './route'

function healthyClient() {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    })),
  }
}

beforeEach(() => {
  mockCreateClient.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/schema-check — bestaat alleen in next dev', () => {
  it('production → 404 vóór er een Supabase-client wordt gemaakt', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const res = await GET()

    expect(res.status).toBe(404)
    expect(mockCreateClient).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body).not.toHaveProperty('checks')
  })

  it('test-omgeving (vitest-default) → eveneens 404', async () => {
    vi.stubEnv('NODE_ENV', 'test')

    const res = await GET()

    expect(res.status).toBe(404)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('development → de schemacheck draait', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    mockCreateClient.mockResolvedValue(healthyClient())

    const res = await GET()

    expect(mockCreateClient).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('checks')
  })
})

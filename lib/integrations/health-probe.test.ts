import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * CoinGecko-probe in `probeIntegrations`.
 *
 * Given de dagelijkse integraties-health-ronde
 * When CoinGecko geprobed wordt
 * Then raakt de probe hetzelfde endpoint (`/simple/price`) met dezelfde headers
 * als de echte koersophaal in `coingecko-client.ts`, en bewaart hij bij een
 * fout de HTTP-status.
 *
 * Aanleiding (17 sep 2026): de probe riep `/ping` aan en stond sinds 18 jun elke
 * dag op `http_error`, terwijl de koersophaal via `/simple/price` vanaf
 * dezelfde omgeving gewoon slaagde — een probe die iets anders test dan de app
 * gebruikt, is een vals alarm.
 */

vi.mock('@/lib/truelayer/client', () => ({ getBaseUrls: vi.fn(), getProviders: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ getServiceClient: vi.fn() }))

import { probeIntegrations } from './health-probe'

const fetchMock = vi.fn()
const ORIG_KEY = process.env.COINGECKO_API_KEY

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  delete process.env.COINGECKO_API_KEY
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (ORIG_KEY === undefined) delete process.env.COINGECKO_API_KEY
  else process.env.COINGECKO_API_KEY = ORIG_KEY
})

function lastHeaders(): Record<string, string> {
  const init = fetchMock.mock.calls[0][1] as RequestInit
  return init.headers as Record<string, string>
}

describe('health-probe — CoinGecko', () => {
  it('probet het endpoint dat de koersophaal gebruikt, niet /ping', async () => {
    await probeIntegrations(['coingecko'])
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('https://api.coingecko.com/api/v3/simple/price')
    expect(url).not.toContain('/ping')
  })

  it('stuurt zonder COINGECKO_API_KEY dezelfde headers als de client: Accept, geen key', async () => {
    await probeIntegrations(['coingecko'])
    const headers = lastHeaders()
    expect(headers.Accept).toBe('application/json')
    expect(headers['x-cg-demo-api-key']).toBeUndefined()
  })

  it('stuurt de demo-key mee als COINGECKO_API_KEY gezet is', async () => {
    process.env.COINGECKO_API_KEY = '  demo-key  '
    await probeIntegrations(['coingecko'])
    expect(lastHeaders()['x-cg-demo-api-key']).toBe('demo-key')
  })

  it('bewaart de HTTP-status bij een fout', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 403 }))
    const [result] = await probeIntegrations(['coingecko'])
    expect(result).toMatchObject({ id: 'coingecko', ok: false, status: 403, code: 'http_error' })
  })
})

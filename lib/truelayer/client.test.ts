import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// getServiceClient wordt door buildAuthLink (via getCredentials) aangeroepen.
// We stubben de module zodat we geen echte Supabase-omgeving nodig hebben.
vi.mock('@/lib/supabase/service', () => ({
  getServiceClient: vi.fn(),
}))

import { getServiceClient } from '@/lib/supabase/service'
import { getProviders, buildAuthLink } from './client'

/**
 * Bouwt een supabase-achtige stub waarvan `.from('app_settings').select('value')
 * .eq('key', <key>).single()` de gegeven waarde per key teruggeeft — spiegelt
 * het query-patroon in getBaseUrls/getCredentials/buildAuthLink.
 */
function makeSupabaseStub(valuesByKey: Record<string, string>) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, key: string) => ({
          single: async () => ({ data: { value: valuesByKey[key] } }),
        }),
      }),
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('getProviders', () => {
  const fixture = [
    { provider_id: 'ob-lloyds', display_name: 'Lloyds', logo_url: 'https://logos.example/lloyds.png', country: 'uk' },
    { provider_id: 'xs2a-ing-nl', display_name: 'ING', logo_url: 'https://logos.example/ing.png', country: 'nl' },
    { provider_id: 'xs2a-rabobank', display_name: 'Rabobank', logo_url: 'https://logos.example/rabo.png', country: 'nl' },
  ]

  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => fixture,
      _url: url,
    }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('productie: gebruikt clientid-queryparam, NOOIT country=, en filtert client-side op land', async () => {
    const result = await getProviders('https://auth.truelayer.com', { clientId: 'test-client', country: 'nl' })

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('clientid=test-client')
    expect(calledUrl).not.toMatch(/[?&]country=/)

    expect(result).toHaveLength(2)
    expect(result.every((p) => p.country === 'nl')).toBe(true)
    result.forEach((p) => {
      expect(p.logo_url).toBeTruthy()
    })
  })

  it('zonder opts (sandbox/health-probe-pad): kale URL, ongefilterde lijst', async () => {
    const result = await getProviders('https://auth.truelayer-sandbox.com')

    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toBe('https://auth.truelayer-sandbox.com/api/providers')
    expect(result).toHaveLength(fixture.length)
  })
})

describe('buildAuthLink', () => {
  beforeEach(() => {
    vi.mocked(getServiceClient).mockReturnValue(
      makeSupabaseStub({
        truelayer_client_id: 'test-client',
        truelayer_client_secret: 'test-secret',
      })
    )
  })

  it('productie met gekozen bank: providers=<provider_id>, nooit nl-all', async () => {
    const supabaseParam = makeSupabaseStub({ truelayer_environment: 'production' })

    const authLink = await buildAuthLink(
      supabaseParam,
      'https://app.example/api/bank-connect/callback',
      'state123',
      'xs2a-ing-nl'
    )

    const url = new URL(authLink)
    expect(url.searchParams.get('provider_id')).toBe('xs2a-ing-nl')
    expect(url.searchParams.get('providers')).toBe('xs2a-ing-nl')
    expect(authLink).not.toContain('nl-all')

    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('test-client')
    expect(url.searchParams.get('scope')).toContain('transactions')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example/api/bank-connect/callback')
    expect(url.searchParams.get('state')).toBe('state123')
  })

  it('sandbox met gekozen bank: providers=<provider_id> geldt ook daar', async () => {
    const supabaseParam = makeSupabaseStub({ truelayer_environment: 'sandbox' })

    const authLink = await buildAuthLink(
      supabaseParam,
      'https://app.example/api/bank-connect/callback',
      'state456',
      'mock'
    )

    const url = new URL(authLink)
    expect(url.origin).toBe('https://auth.truelayer-sandbox.com')
    expect(url.searchParams.get('provider_id')).toBe('mock')
    expect(url.searchParams.get('providers')).toBe('mock')
  })
})

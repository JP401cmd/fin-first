import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GET } from './route'

/**
 * Tests voor /api/auth/password-check — de publieke HIBP-prefix-proxy (ADR 0057).
 * De upstream-`fetch` wordt gemockt via vi.stubGlobal; er gaat geen echte
 * HIBP-call uit. Contract:
 *   - geldige prefix (5 hex) → proxyt naar HIBP met `Add-Padding: true` en geeft
 *     de rauwe tekst terug (200, text/plain)
 *   - ongeldige/ontbrekende prefix → 400 in de platte error-envelope (ADR 0044),
 *     zonder upstream-call
 *   - upstream non-200 of throw/timeout → client-veilige fail-open (lege 200-body),
 *     geen 5xx en geen upstream-details naar de client
 */

const RANGE_BODY =
  '0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:39100'

function getRequest(prefix?: string) {
  const qs = prefix !== undefined ? `?prefix=${encodeURIComponent(prefix)}` : ''
  return new Request(`http://localhost/api/auth/password-check${qs}`)
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /api/auth/password-check', () => {
  it('geldige prefix → proxyt (Add-Padding) en geeft de rauwe range-tekst terug', async () => {
    fetchMock.mockResolvedValue(new Response(RANGE_BODY, { status: 200 }))

    const res = await GET(getRequest('5baa6'))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe(RANGE_BODY)

    // Upstream-URL met UPPERCASE prefix + de privacy-padding-header.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe('https://api.pwnedpasswords.com/range/5BAA6')
    expect((init as RequestInit).headers).toMatchObject({ 'Add-Padding': 'true' })
  })

  it('ongeldige prefix → 400 platte envelope, geen upstream-call', async () => {
    for (const bad of ['ZZZZZ', '123', '123456', 'GHIJK', '5baa']) {
      const res = await GET(getRequest(bad))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(typeof body.error).toBe('string')
      // Platte envelope (ADR 0044): geen geneste { ok, error: {...} }.
      expect(body).not.toHaveProperty('ok')
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ontbrekende prefix → 400, geen upstream-call', async () => {
    const res = await GET(getRequest())
    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('upstream non-200 → fail-open: lege 200-body (geen 5xx)', async () => {
    fetchMock.mockResolvedValue(new Response('service unavailable', { status: 503 }))
    const res = await GET(getRequest('5BAA6'))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('')
  })

  it('upstream throw/timeout → fail-open: lege 200-body, geen upstream-details', async () => {
    fetchMock.mockRejectedValue(new Error('boom-upstream-geheim'))
    const res = await GET(getRequest('5BAA6'))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe('')
    expect(text).not.toContain('boom-upstream-geheim')
  })
})

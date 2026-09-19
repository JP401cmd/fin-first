/**
 * `fetchConsentExpiry` is het beleid rond `GET /data/v1/me`: de consent-datum
 * is een verrijking, dus élke mislukking levert `null` en gooit nooit. Deze
 * suite bewaakt dat contract én dat de datum die wél komt ongewijzigd (als
 * ISO-string) doorreist — de gezondheidsafleiding rekent er dagen mee.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchConsentExpiry } from './consent'

const DATA_URL = 'https://api.truelayer.com'

function fetchAntwoord(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fetchConsentExpiry', () => {
  it('levert consent_expires_at uit results[0] als ISO-string', async () => {
    const fetchMock = fetchAntwoord(200, {
      results: [
        {
          client_id: 'c',
          credentials_id: 'cred',
          consent_status: 'AUTHORISED',
          consent_expires_at: '2026-12-17T19:01:28Z',
          provider: { display_name: 'Rabobank', provider_id: 'nl-rabobank' },
        },
      ],
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchConsentExpiry('tok', DATA_URL)).resolves.toBe('2026-12-17T19:01:28.000Z')
    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe(`${DATA_URL}/data/v1/me`)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  it('leeg antwoord → null (onbekend, niet verlopen)', async () => {
    vi.stubGlobal('fetch', fetchAntwoord(200, { results: [] }))
    await expect(fetchConsentExpiry('tok', DATA_URL)).resolves.toBeNull()
  })

  it('ontbrekend of onleesbaar veld → null', async () => {
    vi.stubGlobal('fetch', fetchAntwoord(200, { results: [{ consent_status: 'AUTHORISED' }] }))
    await expect(fetchConsentExpiry('tok', DATA_URL)).resolves.toBeNull()

    vi.stubGlobal('fetch', fetchAntwoord(200, { results: [{ consent_expires_at: 'geen-datum' }] }))
    await expect(fetchConsentExpiry('tok', DATA_URL)).resolves.toBeNull()
  })

  it('een niet-string (epoch-getal) → null, nooit een datum in 1970', async () => {
    // `new Date(1797000000)` is een geldige datum (jan 1970); als die zou landen
    // stond de koppeling direct op "verbinding kwijt" — de ADR-0161-lus opnieuw.
    vi.stubGlobal('fetch', fetchAntwoord(200, { results: [{ consent_expires_at: 1797000000 }] }))
    await expect(fetchConsentExpiry('tok', DATA_URL)).resolves.toBeNull()
  })

  it('een mislukte respons gooit niet maar levert null (niet-fataal voor callback en sync)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchAntwoord(503, { error: 'provider_error' }))
    await expect(fetchConsentExpiry('tok', DATA_URL)).resolves.toBeNull()
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it('een netwerkfout gooit evenmin', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    await expect(fetchConsentExpiry('tok', DATA_URL)).resolves.toBeNull()
  })
})

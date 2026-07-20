import { describe, it, expect, vi } from 'vitest'
import { sha1HexUpper, isSuffixInRange, checkLeakedPassword } from './leaked-password'

/**
 * Tests voor de leaked-password-check (ADR 0057). Géén echte HIBP-call: elke
 * netwerkgang loopt via een geïnjecteerde `fetchImpl`-mock.
 *
 * Bekend-gelekt referentiewachtwoord: 'password'
 *   SHA-1 = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
 *   prefix = 5BAA6   suffix = 1E4C9B93F3F0682250B6CF8331B7EE68FD8
 */
const KNOWN_HASH = '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8'
const KNOWN_PREFIX = '5BAA6'
const KNOWN_SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8'

describe('sha1HexUpper', () => {
  it('hasht "password" naar de bekende uppercase SHA-1', async () => {
    expect(await sha1HexUpper('password')).toBe(KNOWN_HASH)
  })

  it('geeft altijd 40 uppercase hex-tekens', async () => {
    const hash = await sha1HexUpper('een willekeurige invoer 123')
    expect(hash).toMatch(/^[0-9A-F]{40}$/)
  })
})

describe('isSuffixInRange', () => {
  it('matcht een suffix met count > 0 → pwned (CRLF-lijst)', () => {
    const body = [
      '0018A45C4D1DEF81644B54AB7F969B88D65:1',
      `${KNOWN_SUFFIX}:39100`,
      '00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2',
    ].join('\r\n')
    expect(isSuffixInRange(body, KNOWN_SUFFIX)).toEqual({ pwned: true, count: 39100 })
  })

  it('is case-insensitief (lowercase lijst én lowercase suffix)', () => {
    const body = `${KNOWN_SUFFIX.toLowerCase()}:7`
    expect(isSuffixInRange(body, KNOWN_SUFFIX.toLowerCase())).toEqual({ pwned: true, count: 7 })
  })

  it('parseert ook een LF-only lijst (geen CR)', () => {
    const body = `AAAA111111111111111111111111111111111:3\n${KNOWN_SUFFIX}:12`
    expect(isSuffixInRange(body, KNOWN_SUFFIX)).toEqual({ pwned: true, count: 12 })
  })

  it('privacy-padding-regel (count 0) telt NIET als gelekt', () => {
    const body = `${KNOWN_SUFFIX}:0`
    expect(isSuffixInRange(body, KNOWN_SUFFIX)).toEqual({ pwned: false, count: 0 })
  })

  it('geen match → niet gelekt', () => {
    const body = 'AAAA111111111111111111111111111111111:1\r\nBBBB222222222222222222222222222222222:2'
    expect(isSuffixInRange(body, KNOWN_SUFFIX)).toEqual({ pwned: false, count: 0 })
  })

  it('negeert lege regels en regels zonder scheidingsteken', () => {
    const body = `\r\n\r\ngarbage-zonder-dubbelepunt\r\n${KNOWN_SUFFIX}:5\r\n`
    expect(isSuffixInRange(body, KNOWN_SUFFIX)).toEqual({ pwned: true, count: 5 })
  })
})

describe('checkLeakedPassword', () => {
  it('gelekt wachtwoord: vraagt ALLEEN de prefix, matcht de suffix lokaal → pwned', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(`${KNOWN_SUFFIX}:39100`, { status: 200 }))
    const res = await checkLeakedPassword('password', { fetchImpl })

    expect(res).toEqual({ pwned: true, count: 39100 })

    // AC6 (privacy): de request draagt uitsluitend de 5-tekens prefix — nooit het
    // plaintext-wachtwoord, nooit de volledige hash, nooit de suffix. De exacte-
    // URL-match bewijst dat de query ALLEEN ?prefix=XXXXX bevat; we controleren
    // bovendien expliciet dat er geen tweede queryparam is en dat suffix/volledige
    // hash nergens in de URL staan. (Het woord "password" in het PAD is de
    // route-naam, geen gelekte data — daarom matchen we op de query, niet de URL.)
    const calledUrl = String(fetchImpl.mock.calls[0]?.[0])
    expect(calledUrl).toBe(`/api/auth/password-check?prefix=${KNOWN_PREFIX}`)
    const params = new URL(calledUrl, 'http://localhost').searchParams
    expect([...params.keys()]).toEqual(['prefix'])
    expect(params.get('prefix')).toBe(KNOWN_PREFIX)
    expect(calledUrl).not.toContain(KNOWN_SUFFIX)
    expect(calledUrl).not.toContain(KNOWN_HASH)
    // De GET draagt geen request-body (init bevat alleen een optioneel signal).
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init && 'body' in init ? init.body : undefined).toBeUndefined()
  })

  it('niet-gelekt wachtwoord: suffix niet in range → niet pwned', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('AAAA111111111111111111111111111111111:1', { status: 200 }),
    )
    expect(await checkLeakedPassword('n1et-in-een-datalek-uniek', { fetchImpl })).toEqual({
      pwned: false,
      count: 0,
    })
  })

  it('fail-open bij een fetch-throw (netwerk/timeout) → niet blokkeren', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'))
    expect(await checkLeakedPassword('password', { fetchImpl })).toEqual({ pwned: false, count: 0 })
  })

  it('fail-open bij een non-200 respons → niet blokkeren', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    expect(await checkLeakedPassword('password', { fetchImpl })).toEqual({ pwned: false, count: 0 })
  })

  it('fail-open bij een leeg wachtwoord (geen call)', async () => {
    const fetchImpl = vi.fn()
    expect(await checkLeakedPassword('', { fetchImpl })).toEqual({ pwned: false, count: 0 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

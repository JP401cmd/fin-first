import { describe, it, expect } from 'vitest'
import { bronUrlBezwaar, isVeiligeBronUrl, safeHttpUrl, zelfdeHost } from './safe-url'

describe('isVeiligeBronUrl — wat de server als nieuwsbron (of redirect-hop) mag ophalen', () => {
  it('laat een gewone https-bron door', () => {
    expect(isVeiligeBronUrl('https://www.cbs.nl/nl-nl/economie/prijzen')).toBe(true)
    expect(isVeiligeBronUrl('https://www.ecb.europa.eu//press/pr/date/2026/html/a.en.html')).toBe(true)
  })

  it.each([
    ['http://www.cbs.nl/', 'alleen https'],
    ['https://127.0.0.1/', 'geen IP-adres'],
    ['https://2130706433/', 'geen IP-adres'],
    ['https://0x7f.0.0.1/', 'geen IP-adres'],
    ['https://[::1]/', 'geen IP-adres'],
    ['https://169.254.169.254/latest/meta-data', 'geen IP-adres'],
    ['https://localhost/', 'geen lokale host'],
    ['https://intranet/', 'geen lokale host'],
    ['https://db.internal/', 'geen lokale host'],
    ['https://printer.local/', 'geen lokale host'],
    ['https://www.cbs.nl:8443/', 'geen eigen poort'],
    ['https://user:pw@www.cbs.nl/', 'geen inloggegevens in de URL'],
    ['ftp://www.cbs.nl/', 'alleen https'],
    ['geen url', 'geen geldige URL'],
  ])('weigert %s (%s)', (url, bezwaar) => {
    expect(bronUrlBezwaar(url)).toBe(bezwaar)
    expect(isVeiligeBronUrl(url)).toBe(false)
  })

  it('https met de standaardpoort expliciet is gewoon de standaardpoort', () => {
    expect(isVeiligeBronUrl('https://www.cbs.nl:443/')).toBe(true)
  })
})

describe('safeHttpUrl en zelfdeHost', () => {
  it('rendert alleen http(s) als link', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('data:text/html,x')).toBeNull()
    expect(safeHttpUrl(null)).toBeNull()
    expect(safeHttpUrl('https://x.nl/a')).toBe('https://x.nl/a')
  })

  it('zelfde site met of zonder www', () => {
    expect(zelfdeHost('https://www.cbs.nl/a', 'https://cbs.nl/b')).toBe(true)
    expect(zelfdeHost('https://cbs.nl.evil.com/a', 'https://cbs.nl/b')).toBe(false)
  })
})

import { describe, it, expect, vi, afterEach } from 'vitest'
import { startBankRelink, RELINK_GENERIC_ERROR } from './start-relink'

/**
 * De herstelactie leeft op TWEE oppervlakken (de rekeningkaart op cashflow en de
 * bankverbindings-sectie op de rekeningdetail) en is daarom één functie. Wat hier
 * vastligt is precies wat níet mag verschillen tussen die twee: de body, en welke
 * serverteksten de gebruiker wél en niet te zien krijgt.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('startBankRelink — de body', () => {
  it('noemt ALLEEN de koppeling: geen doelrekening, geen intentie, geen bank', async () => {
    // Alle drie leidt `auth-link` server-side af. Komt een van de drie hier ooit
    // terug, dan kan een client een keuze sturen die de callback daarna stil
    // negeert (doelrekening bij 'herautoriseren') of een herautorisatie naar een
    // ándere bank richten. En een verplichte `provider_id` zou de rekeningkaart —
    // die alleen de koppeling kent — dwingen tot een eigen leesronde.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auth_url: 'https://auth.truelayer.com/?x=1' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await startBankRelink('bca-1')

    expect(result).toEqual({ ok: true, authUrl: 'https://auth.truelayer.com/?x=1' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/bank-connect/auth-link')
    expect(init.method).toBe('POST')
    expect(Object.keys(JSON.parse(init.body as string))).toEqual(['relink_connection_account_id'])
  })
})

describe('startBankRelink — welke tekst de gebruiker leest', () => {
  it('laat een gecureerde 409 dóór: dáár staat de uitweg in', async () => {
    const bezet =
      'Deze rekening is al gekoppeld aan Rabobank. Verbreek die koppeling eerst bij de rekening; daarna kun je hem aan een andere bank koppelen.'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: bezet }) }),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await startBankRelink('bca-1')).toEqual({ ok: false, message: bezet })
  })

  it('vervangt een validation_error — dat is een veldpad, geen melding', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'relink_connection_account_id: ongeldige koppeling', code: 'validation_error' }),
      }),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await startBankRelink('bca-1')
    expect(result).toEqual({ ok: false, message: RELINK_GENERIC_ERROR })
    if (!result.ok) expect(result.message).not.toMatch(/relink_connection_account_id/)
  })

  it('vervangt een server_error — de echte fout staat server-side gelogd', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Er ging iets mis', code: 'server_error' }),
      }),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await startBankRelink('bca-1')).toEqual({ ok: false, message: RELINK_GENERIC_ERROR })
  })

  it('toont nooit een rauwe netwerkfout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('TypeError: Failed to fetch')))
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await startBankRelink('bca-1')
    expect(result).toEqual({ ok: false, message: RELINK_GENERIC_ERROR })
    if (!result.ok) expect(result.message).not.toMatch(/Failed to fetch/)
    // Wél gelogd: een geslikte fout is niet te diagnosticeren.
    expect(logged).toHaveBeenCalled()
  })

  it('een 200 zónder auth_url is een mislukking, geen stille no-op', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await startBankRelink('bca-1')).toEqual({ ok: false, message: RELINK_GENERIC_ERROR })
  })

  it('navigeert zelf niet — dat is de beslissing van het oppervlak', async () => {
    // Zou deze functie `window.location.href` zetten, dan was ze niet testbaar
    // zonder jsdom-navigatie te mocken, en kon geen oppervlak meer kiezen om eerst
    // iets anders te doen.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ auth_url: 'https://auth.truelayer.com/' }) }),
    )
    const before = window.location.href
    await startBankRelink('bca-1')
    expect(window.location.href).toBe(before)
  })
})

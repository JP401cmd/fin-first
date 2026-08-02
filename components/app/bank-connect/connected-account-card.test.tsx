import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { deriveBankLinkHealth } from '@/lib/bank-connection-status'
import type { LinkedAccountView } from '@/lib/truelayer/linked-account'
import { ConnectedAccountCard } from './connected-account-card'

/**
 * Tests voor ConnectedAccountCard — de bankverbinding op de rekeningdetail
 * (specs/bank-connect-doelrekening/plan.md, fase 7 / B6 / SC-12).
 *
 * Wat hier gepind wordt is precies wat stil kan wegvallen:
 *
 *  - de HERSTELACTIE bij `linked-broken` (de knop postte tot fase 7 niets naar de
 *    server, hij duwde de gebruiker de volledige wizard in);
 *  - de VOORAANKONDIGING bij `expiringSoon` — dit is het enige oppervlak waar die
 *    14-dagen-nuance mag leven, en ze mag nooit náást "verbinding kwijt" staan;
 *  - dat de herstel-POST de koppel-id meestuurt en géén doelrekening (de server
 *    leidt die af), en daarna naar de bank navigeert;
 *  - dat een gefaalde POST een vaste NL-melding oplevert en nooit een rauwe
 *    fetch-/SDK-/serverstring;
 *  - dat de identiteitsregel een IBAN-STAARTJE toont en nooit een volledige IBAN
 *    (de kaart consumeert sinds de kolom-drop-voorbereiding `iban_tail` uit
 *    `/api/bank-connect/linked-accounts`; een volledige IBAN kán er niet meer
 *    doorheen, en die grens hoort vast te staan).
 */

const DAY_MS = 24 * 60 * 60 * 1000

type Account = LinkedAccountView

/**
 * De RAUWE situatie in, een `LinkedAccountView` uit — inclusief het `health`-
 * oordeel dat de server met dezelfde `deriveBankLinkHealth` afleidt.
 *
 * Bewust niet een `BankLinkHealth`-literal als invoer: dan zou de test het
 * oordeel zélf opschrijven in plaats van het na te spelen, en zou een bug in de
 * afleiding hier onzichtbaar blijven.
 */
type Situatie = {
  providerName?: string | null
  providerLogo?: string | null
  status?: string | null
  tokenExpiresAt?: string | null
  lastSyncedAt?: string | null
  dailyRequests?: number
  rateLimitResetDate?: string | null
  ibanTail?: string | null
}

function makeAccount(s: Situatie = {}): Account {
  const {
    providerName = 'ING',
    providerLogo = null,
    status = 'active',
    tokenExpiresAt = null,
    lastSyncedAt = '2026-07-01T08:00:00Z',
    dailyRequests = 0,
    rateLimitResetDate = null,
    ibanTail = '4567',
  } = s
  return {
    id: 'bca-1',
    account_name: 'Betaalrekening',
    iban_tail: ibanTail,
    provider_name: providerName,
    provider_logo: providerLogo,
    provider_id: 'ing-nl',
    health: deriveBankLinkHealth({
      linkIsActive: true,
      connectionStatus: status,
      tokenExpiresAt,
      lastSyncedAt,
    }),
    bank_account_id: 'ba-1',
    carrier_name: 'Betaalrekening',
    carrier_iban_tail: '4567',
    last_synced_at: lastSyncedAt,
    daily_requests: dailyRequests,
    rate_limit_reset_date: rateLimitResetDate,
    balance_change: null,
  }
}

function renderCard(account: Account = makeAccount()) {
  const onSync = vi.fn()
  const onDisconnect = vi.fn()
  const onReauthorize = vi.fn()
  const view = render(
    <ConnectedAccountCard
      account={account}
      onSync={onSync}
      onDisconnect={onDisconnect}
      onReauthorize={onReauthorize}
    />,
  )
  return { ...view, onSync, onDisconnect, onReauthorize }
}

/** Een koppeling waarvan de autorisatie is verlopen (status-tak). */
const verlopen = makeAccount({ status: 'expired' })

/** Een koppeling die nog werkt maar binnen de drempel verloopt. */
function verlooptBinnenkort(days: number) {
  return makeAccount({ tokenExpiresAt: new Date(Date.now() + days * DAY_MS).toISOString() })
}

const HERSTEL_KNOP = /Verbind opnieuw/i

let assignedHref: string | null = null

beforeEach(() => {
  assignedHref = null
  // `window.location.href = …` is in jsdom niet zomaar te observeren; een eigen
  // setter maakt de navigatie zichtbaar zonder de assertie te verzwakken.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...window.location,
      set href(value: string) {
        assignedHref = value
      },
      get href() {
        return assignedHref ?? 'http://localhost/core/cash'
      },
    },
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * De BAND-tekst, niet los "Verbinding kwijt": de status-pil zegt sinds fase 7
 * hetzelfde woord (glossarium — één woord per concept), dus een kale match op
 * "Verbinding kwijt" vindt er twee.
 */
const KWIJT_BAND = /Verbinding kwijt — we halen geen nieuwe transacties/i

/**
 * `text-warning` als TEKSTkleur op een `--warning-bg`-vlak haalt 4,48:1 (gemeten
 * op de tokens in `app/globals.css`) en blijft daarmee onder de 4,5:1 die AA voor
 * tekst ≤18px eist. Een ICOON mag er wél in staan: grafisch element, 3:1 volstaat
 * (WCAG 1.4.11) — vandaar de filter op tekst-dragende elementen.
 */
function warningTextOnWarningSurface(container: HTMLElement): string[] {
  const surfaces = Array.from(container.querySelectorAll('[class*="bg-warning-bg"]'))
  return surfaces.flatMap((surface) =>
    [surface, ...Array.from(surface.querySelectorAll('*'))]
      .filter((el) => /(?:^|\s)text-warning(?:$|\s)/.test(el.getAttribute('class') ?? ''))
      .filter((el) => (el.textContent ?? '').trim().length > 0)
      .map((el) => el.getAttribute('class') ?? ''),
  )
}

describe('ConnectedAccountCard — verbinding kwijt', () => {
  it('toont de herstelactie en zet synchroniseren uit', () => {
    renderCard(verlopen)

    expect(screen.getByText(KWIJT_BAND)).toBeTruthy()
    expect(screen.getByRole('button', { name: HERSTEL_KNOP })).toBeTruthy()
    expect((screen.getByRole('button', { name: /Synchroniseer/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('zegt hetzelfde woord als de status-pil — één woord per concept', () => {
    renderCard(verlopen)

    // Twee oppervlakken, één toestand, één woord: de pil zei tot fase 7
    // "Verlopen" over exact wat de band "verbinding kwijt" noemt.
    expect(screen.getAllByText(/Verbinding kwijt/i).length).toBe(2)
  })

  it('noemt de bank maar niet "ingetrokken" — expired en revoked zijn één herstelpad', () => {
    renderCard(makeAccount({ providerName: 'Rabobank', status: 'revoked' }))

    // De bank staat in de melding zelf, niet alleen in de kaartkop.
    expect(screen.getByText(/transacties meer op bij Rabobank/i)).toBeTruthy()
    expect(screen.queryByText(/ingetrokken/i)).toBeNull()
  })

  it('toont NIET de 14-dagen-vooraankondiging (die twee sluiten elkaar uit)', () => {
    renderCard(
      // Verlopen status én een datum binnen de drempel: de toestand wint.
      makeAccount({ status: 'expired', tokenExpiresAt: new Date(Date.now() + 5 * DAY_MS).toISOString() }),
    )

    expect(screen.getByText(KWIJT_BAND)).toBeTruthy()
    expect(screen.queryByText(/werkt nog en verloopt/i)).toBeNull()
  })
})

describe('ConnectedAccountCard — vooraankondiging', () => {
  it('meldt bij expiringSoon dat de verbinding nog werkt, mét het aanbod', () => {
    renderCard(verlooptBinnenkort(9))

    expect(screen.getByText(/werkt nog en verloopt over 9 dagen/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: HERSTEL_KNOP })).toBeTruthy()
    // Werkt nog: synchroniseren blijft gewoon kunnen.
    expect((screen.getByRole('button', { name: /Synchroniseer/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('toont dan NIET de "verbinding kwijt"-melding', () => {
    renderCard(verlooptBinnenkort(3))

    expect(screen.queryByText(KWIJT_BAND)).toBeNull()
  })

  it('zwijgt buiten de drempel', () => {
    renderCard(verlooptBinnenkort(40))

    expect(screen.queryByText(/werkt nog en verloopt/i)).toBeNull()
    expect(screen.queryByText(KWIJT_BAND)).toBeNull()
    expect(screen.queryByRole('button', { name: HERSTEL_KNOP })).toBeNull()
  })
})

describe('ConnectedAccountCard — identiteitsregel toont een staartje, geen IBAN', () => {
  it('toont het staartje uit iban_tail', () => {
    renderCard(makeAccount({ ibanTail: '4567' }))

    expect(screen.getByText(/···· 4567/)).toBeTruthy()
  })

  it('laat de regel weg als de server geen staartje kon geven', () => {
    // `decryptIbanForLabel` slikt een onleesbare ciphertext; dan is het staartje
    // null en hoort er geen lege regel onder de banknaam te staan.
    const { container } = renderCard(makeAccount({ ibanTail: null }))

    expect(screen.queryByText(/····/)).toBeNull()
    expect(container.textContent).toContain('ING')
  })

  it('kan geen volledige IBAN tonen — die bereikt deze client niet meer', () => {
    // De harde grens van de kolom-drop-voorbereiding: de kaart las
    // `bank_connection_accounts.iban` client-direct, nu komt er nog maar vier
    // tekens uit `/api/bank-connect/linked-accounts`. Zou iemand het volledige
    // nummer terugvoeren, dan valt deze assertie om.
    const { container } = renderCard(makeAccount({ ibanTail: '4567' }))

    // Een NL-IBAN in tekst: 2 letters, 2 cijfers, 4 letters, 10 cijfers.
    expect(container.textContent ?? '').not.toMatch(/[A-Z]{2}\d{2}[A-Z]{4}\d{10}/)
  })
})

describe('ConnectedAccountCard — de herstel-POST', () => {
  it('post de koppel-id naar auth-link, zonder doelrekening, en navigeert naar de bank', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auth_url: 'https://auth.truelayer.com/?x=1' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { onReauthorize } = renderCard(verlopen)
    fireEvent.click(screen.getByRole('button', { name: HERSTEL_KNOP }))

    await waitFor(() => expect(assignedHref).toBe('https://auth.truelayer.com/?x=1'))

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/bank-connect/auth-link')
    const body = JSON.parse((init as RequestInit).body as string)
    // De body noemt ALLEEN de koppeling. Doelrekening, intentie én bank leidt
    // `auth-link` er zelf uit af; zou een van die drie hier terugkomen, dan kon de
    // client een keuze sturen die de callback daarna stil negeert (doelrekening bij
    // `herautoriseren`) of een herautorisatie naar een ándere bank richten.
    expect(body).toEqual({ relink_connection_account_id: 'bca-1' })
    // De korte weg gelukt = de wizard blijft ongebruikt.
    expect(onReauthorize).not.toHaveBeenCalled()
  })

  it('heeft géén provider-kolom nodig om te kunnen herstellen', async () => {
    // De rekeningkaart op cashflow kent alleen de koppeling, niet de bank. Eist
    // deze POST ooit weer een `provider_id`, dan kan dat oppervlak niet meer
    // herstellen zonder een eigen leesronde — precies het pad dat fase 7 dichtzet.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auth_url: 'https://auth.truelayer.com/?x=3' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    renderCard(verlopen)
    fireEvent.click(screen.getByRole('button', { name: HERSTEL_KNOP }))

    await waitFor(() => expect(assignedHref).toBe('https://auth.truelayer.com/?x=3'))
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(Object.keys(body)).toEqual(['relink_connection_account_id'])
  })

  it('gebruikt dezelfde POST vanuit de vooraankondiging', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ auth_url: 'https://auth.truelayer.com/?x=2' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    renderCard(verlooptBinnenkort(5))
    fireEvent.click(screen.getByRole('button', { name: HERSTEL_KNOP }))

    await waitFor(() => expect(assignedHref).toBe('https://auth.truelayer.com/?x=2'))
    expect(
      JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string),
    ).toMatchObject({ relink_connection_account_id: 'bca-1' })
  })
})

describe('ConnectedAccountCard — foutpad van de herstel-POST', () => {
  it('toont een vaste NL-melding en nooit de rauwe fetch-fout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('TypeError: Failed to fetch')))

    renderCard(verlopen)
    fireEvent.click(screen.getByRole('button', { name: HERSTEL_KNOP }))

    const melding = await screen.findByRole('alert')
    expect(melding.textContent).toMatch(/Opnieuw verbinden is niet gelukt/i)
    expect(melding.textContent).not.toMatch(/Failed to fetch/i)
    expect(assignedHref).toBeNull()
  })

  it('verzwijgt een technische validatiefout van de server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'provider_id: provider_id is vereist', code: 'validation_error' }),
      }),
    )

    renderCard(verlopen)
    fireEvent.click(screen.getByRole('button', { name: HERSTEL_KNOP }))

    const melding = await screen.findByRole('alert')
    expect(melding.textContent).toMatch(/Opnieuw verbinden is niet gelukt/i)
    expect(melding.textContent).not.toMatch(/provider_id/)
  })

  it('laat een gecureerde 409 met uitweg juist WEL door', async () => {
    const bezet =
      'Deze rekening is al gekoppeld aan Rabobank. Verbreek die koppeling eerst bij de rekening; daarna kun je hem aan een andere bank koppelen.'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: bezet }) }),
    )

    renderCard(verlopen)
    fireEvent.click(screen.getByRole('button', { name: HERSTEL_KNOP }))

    const melding = await screen.findByRole('alert')
    expect(melding.textContent).toContain('Verbreek die koppeling eerst')
  })

  it('biedt na een gefaalde POST de volledige wizard aan als val-terug', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))

    const { onReauthorize } = renderCard(verlopen)
    fireEvent.click(screen.getByRole('button', { name: HERSTEL_KNOP }))

    const wizardKnop = await screen.findByRole('button', { name: /Open de koppelwizard/i })
    fireEvent.click(wizardKnop)

    expect(onReauthorize).toHaveBeenCalledTimes(1)
  })

  it('biedt die val-terug niet aan zonder gefaalde herkoppeling', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'x', code: 'server_error' }) }),
    )

    renderCard(makeAccount())
    fireEvent.click(screen.getByRole('button', { name: /Synchroniseer/ }))

    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: /Open de koppelwizard/i })).toBeNull()
  })
})

describe('ConnectedAccountCard — meldingen in plaats van alert()', () => {
  it('toont een inline melding als synchroniseren mislukt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    renderCard(makeAccount())
    fireEvent.click(screen.getByRole('button', { name: /Synchroniseer/ }))

    const melding = await screen.findByRole('alert')
    expect(melding.textContent).toMatch(/Synchroniseren is niet gelukt/i)
    expect(melding.textContent).not.toMatch(/network down/i)
  })

  it('toont een inline melding als verbreken mislukt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('kapot')))

    const { onDisconnect } = renderCard(makeAccount())
    fireEvent.click(screen.getByRole('button', { name: /Verbreken/ }))
    fireEvent.click(screen.getByRole('button', { name: /Ja, verbreken/ }))

    const melding = await screen.findByRole('alert')
    expect(melding.textContent).toMatch(/Verbinding verbreken is niet gelukt/i)
    expect(onDisconnect).not.toHaveBeenCalled()
  })
})

describe('ConnectedAccountCard — kleurconventie', () => {
  const FORBIDDEN =
    /\b(?:bg|text|border)-(?:red|orange|green|emerald|amber|teal|violet|purple|sky|zinc|slate|gray|grey)-\d{2,3}\b/

  it('gebruikt geen Tailwind-standaardkleuren, in geen van de toestanden', () => {
    for (const account of [makeAccount(), verlopen, verlooptBinnenkort(4)]) {
      const { container, unmount } = renderCard(account)
      // Ook de bevestig-tak van verbreken, want daar zat `bg-red-600`.
      fireEvent.click(screen.getByRole('button', { name: /Verbreken/ }))
      expect(container.innerHTML).not.toMatch(FORBIDDEN)
      unmount()
    }
  })

  it('gebruikt --warning (niet --negative) voor een verlopen autorisatie', () => {
    const { container } = renderCard(verlopen)

    expect(container.innerHTML).toContain('bg-warning-bg')
    expect(container.innerHTML).not.toContain('bg-negative-bg')
  })

  it('zet geen tekst in text-warning op een --warning-bg-vlak (AA)', () => {
    // De band mag de tint dragen in rand, vlak en icoon; de TEKST hoort op inkt.
    // Dit is de gate: `text-warning` op `--warning-bg` haalt 4,48:1.
    for (const account of [verlopen, verlooptBinnenkort(4)]) {
      const { container, unmount } = renderCard(account)
      expect(warningTextOnWarningSurface(container)).toEqual([])
      unmount()
    }
  })

  it('houdt de warning-tint wél in het icoon van de herstelband', () => {
    const { container } = renderCard(verlopen)
    const band = container.querySelector('[class*="bg-warning-bg"]')!

    expect(band.querySelector('svg')?.getAttribute('class')).toContain('text-warning')
  })

  it('gebruikt geen gebruikersinstelbare accentkleur als 12px-tekstlink', () => {
    // `kern-*` is door de gebruiker instelbaar; op 12px is dat grensgeval-AA en de
    // gebruiker kan de tint lichter zetten. Zelfde argument als vermogen-asset-card.
    const { container } = renderCard(verlooptBinnenkort(6))
    expect(container.innerHTML).not.toContain('text-kern-700')
  })
})

describe('ConnectedAccountCard — raakteldoelen', () => {
  it('geeft elke herstelactie 44px hoogte', async () => {
    // Verbinding kwijt (knop) + vooraankondiging (tekstlink) waren ~28px en ~16px.
    for (const account of [verlopen, verlooptBinnenkort(4)]) {
      const { unmount } = renderCard(account)
      const knop = screen.getByRole('button', { name: HERSTEL_KNOP })
      expect(knop.className).toContain('min-h-[44px]')
      unmount()
    }

    // En de val-terug naar de wizard, die ~28px was.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    renderCard(verlopen)
    fireEvent.click(screen.getByRole('button', { name: HERSTEL_KNOP }))
    const wizardKnop = await screen.findByRole('button', { name: /Open de koppelwizard/i })
    expect(wizardKnop.className).toContain('min-h-[44px]')
  })
})

describe('ConnectedAccountCard — 401 op synchroniseren', () => {
  /** Wat `POST /api/bank-connect/sync` antwoordt zodra de refresh niet lukt. */
  function stub401() {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Verbinding kwijt — verbind opnieuw om weer bij te werken.' }),
      }),
    )
  }

  it('biedt de herstelactie aan bij een 401 — niet "verbind opnieuw" zonder knop', async () => {
    // Dit is het meest voorkomende moment waarop een verbinding kwijtraakt: de
    // route zet `status = 'expired'` maar de props van deze kaart zijn nog de oude,
    // dus `linked-broken` is hier nog niet af te leiden. Zonder de eigen vlag las
    // de gebruiker de melding "verbind opnieuw" zonder iets om op te klikken.
    stub401()
    renderCard(makeAccount())

    fireEvent.click(screen.getByRole('button', { name: /Synchroniseer/ }))

    const melding = await screen.findByRole('alert')
    expect(melding.textContent).toMatch(/Verbinding kwijt — verbind opnieuw/i)
    const herstel = screen.getByRole('button', { name: HERSTEL_KNOP })
    expect(herstel).toBeTruthy()
    expect(herstel.className).toContain('min-h-[44px]')
  })

  it('laat die knop de gewone herstel-POST doen', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Verbinding kwijt — verbind opnieuw om weer bij te werken.' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ auth_url: 'https://auth.truelayer.com/?x=9' }) })
    vi.stubGlobal('fetch', fetchMock)

    renderCard(makeAccount())
    fireEvent.click(screen.getByRole('button', { name: /Synchroniseer/ }))
    await screen.findByRole('alert')

    fireEvent.click(screen.getByRole('button', { name: HERSTEL_KNOP }))
    await waitFor(() => expect(assignedHref).toBe('https://auth.truelayer.com/?x=9'))
    expect(fetchMock.mock.calls[1][0]).toBe('/api/bank-connect/auth-link')
  })

  it('biedt géén tweede knop naast een band die er al één draagt', () => {
    // `verlopen` heeft de sync-knop uit staan, dus deze toestand is via de UI niet
    // te bereiken; de assertie bewaakt dat een latere wijziging geen twee
    // identieke "Verbind opnieuw"-knoppen in één kaart oplevert.
    stub401()
    renderCard(verlopen)

    expect(screen.getAllByRole('button', { name: HERSTEL_KNOP }).length).toBe(1)
  })

  it('biedt hem niet aan bij een gewone serverfout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'x', code: 'server_error' }) }),
    )

    renderCard(makeAccount())
    fireEvent.click(screen.getByRole('button', { name: /Synchroniseer/ }))

    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: HERSTEL_KNOP })).toBeNull()
  })
})

describe('ConnectedAccountCard — uitkomst van een sync', () => {
  it('zegt "al bekend" en telt beide dedup-lagen mee', async () => {
    // De success-pagina zei "al bekend" inclusief laag 2; deze kaart zei
    // "duplicaten overgeslagen" en liet `duplicates_cross_source` liggen — twee
    // oppervlakken die over dezelfde sync een ander getal noemden.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ new: 4, duplicates: 3, duplicates_cross_source: 2 }),
      }),
    )

    const { onSync } = renderCard(makeAccount())
    fireEvent.click(screen.getByRole('button', { name: /Synchroniseer/ }))

    expect(await screen.findByText(/4 nieuwe transacties, 5 al bekend/)).toBeTruthy()
    expect(screen.queryByText(/duplicaten overgeslagen/i)).toBeNull()
    expect(onSync).toHaveBeenCalledTimes(1)
  })

  it('overleeft een respons zonder cross-bron-teller', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ new: 1, duplicates: 2 }) }),
    )

    renderCard(makeAccount())
    fireEvent.click(screen.getByRole('button', { name: /Synchroniseer/ }))

    expect(await screen.findByText(/1 nieuwe transacties, 2 al bekend/)).toBeTruthy()
  })
})

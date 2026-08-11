/**
 * Component-test voor OwnAccountsSheet.
 *
 * Wat hier bewaakt wordt is één ding: de vinkjes op het scherm moeten precies
 * zeggen wat de IMPORT doet. De sheet leidt de aangevinkt-status af met
 * `buildOwnAccountIdentifiers` + `isOwnAccountTransfer` — dezelfde twee functies
 * die `lib/parsers/categorize.ts` in de importroute gebruikt. Deze test rekent de
 * verwachting daarom niet met de hand uit, maar roept die canonieke functies zélf
 * aan en pint de gerenderde checkbox-stand daartegen. Zou iemand hier ooit een
 * eigen matching-heuristiek inbouwen, dan valt deze test om in plaats van dat het
 * scherm stil iets anders toont dan de app boekt.
 *
 * Verder getoetst:
 *  - een tegenpartij die matcht op je EIGEN bankrekening-IBAN is vast (geen dode
 *    checkbox — er is geen regel om te verwijderen);
 *  - een regel die ALLEEN op zo'n vaste rij matcht blijft verwijderbaar (anders is
 *    hij nergens meer te bereiken);
 *  - `truncated: true` wordt zichtbaar gemeld;
 *  - opslaan stuurt de DELTA (`add`/`remove`), niet de hele gewenste set;
 *  - sluiten gooit die delta wég (de sheet blijft gemount achter een mount-latch,
 *    dus zonder reset zou "Annuleer" stilzwijgend bewaren);
 *  - uitvinken meldt zichtbaar dat er een REGEL verdwijnt die breder geldt;
 *  - een onbruikbare IBAN in de brondata wordt een naam-regel i.p.v. een 400 op de
 *    hele batch;
 *  - een handmatig naam-patroon toont vóór opslaan hoeveel tegenpartijen het raakt;
 *  - de terugkoppeling klopt voor toevoegen, verwijderen en allebei tegelijk.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { OwnAccountsSheet } from './own-accounts-sheet'
import { buildOwnAccountIdentifiers } from '@/lib/own-accounts'
import { isOwnAccountTransfer } from '@/lib/parsers/categorize'
import type { CounterpartySummary } from '@/app/api/own-accounts/counterparties/route'
import type { OwnAccountRule } from '@/app/api/own-accounts/settings/route'

// ── Testdata ────────────────────────────────────────────────────────────────

const EIGEN_IBAN = 'NL01BANK0000000001' // eigen betaalrekening
const SPAAR_IBAN = 'NL02BANK0000000002' // eigen spaarrekening, óók een bank_account
const BROKER_IBAN = 'NL03BANK0000000003' // eigen broker, staat als REGEL geregistreerd
const WINKEL_IBAN = 'NL09SHOP0000000009' // echte uitgave, geen eigen rekening

const ACCOUNTS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Betaalrekening', iban: EIGEN_IBAN, isActive: true },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Spaarrekening', iban: SPAAR_IBAN, isActive: true },
]

const RULES: OwnAccountRule[] = [
  { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', matchType: 'iban', matchValue: BROKER_IBAN, label: 'Broker' },
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', matchType: 'name', matchValue: 'paypal', label: 'PayPal' },
]

function cp(over: Partial<CounterpartySummary> & { key: string; name: string }): CounterpartySummary {
  return {
    iban: null,
    outgoingCount: 3,
    incomingCount: 2,
    outgoingTotal: 300,
    incomingTotal: 200,
    lastDate: '2026-06-01',
    transferCount: 0,
    ...over,
  }
}

const COUNTERPARTIES = [
  cp({ key: `iban:${SPAAR_IBAN}`, iban: SPAAR_IBAN, name: 'Spaarrekening' }),
  cp({ key: `iban:${BROKER_IBAN}`, iban: BROKER_IBAN, name: 'DEGIRO' }),
  cp({ key: 'name:paypal', name: 'PayPal Europe' }),
  cp({ key: `iban:${WINKEL_IBAN}`, iban: WINKEL_IBAN, name: 'Albert Heijn', incomingCount: 0, incomingTotal: 0 }),
]

// ── Fetch-mock ──────────────────────────────────────────────────────────────

let truncated = false
let reclassified = 0
let rulesPost: { add?: unknown[]; remove?: string[] } | null = null
let reclassifyPosts = 0
let serverRules: OwnAccountRule[] = RULES
let serverCounterparties: CounterpartySummary[] = COUNTERPARTIES

beforeEach(() => {
  truncated = false
  reclassified = 0
  rulesPost = null
  reclassifyPosts = 0
  serverRules = RULES
  serverCounterparties = COUNTERPARTIES
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/own-accounts/settings')) {
        return jsonRes({ rules: serverRules, accounts: ACCOUNTS, unreadable: 0 })
      }
      if (url.startsWith('/api/own-accounts/counterparties')) {
        return jsonRes({ counterparties: serverCounterparties, windowMonths: 24, scanned: 42, truncated })
      }
      if (url.startsWith('/api/own-accounts/reclassify')) {
        reclassifyPosts++
        return jsonRes({ reclassified })
      }
      if (url.startsWith('/api/own-accounts/rules')) {
        rulesPost = JSON.parse(String(init?.body ?? '{}'))
        return jsonRes({ rules: serverRules, reclassified })
      }
      throw new Error(`onverwachte fetch: ${url}`)
    }),
  )
})

function jsonRes(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response
}

/** De rij-<li> waarin een tegenpartij-naam staat. */
async function rowFor(name: string) {
  const label = await screen.findByText(name)
  const li = label.closest('li')
  if (!li) throw new Error(`geen rij gevonden voor ${name}`)
  return li
}

function renderSheet(onSaved = vi.fn()) {
  render(<OwnAccountsSheet open onClose={() => {}} onSaved={onSaved} />)
  return onSaved
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('OwnAccountsSheet', () => {
  it('leidt elke checkbox-stand af uit de canonieke matching-functies', async () => {
    renderSheet()

    // Verwachting NIET met de hand: bouw dezelfde identifier-set als de import
    // en laat `isOwnAccountTransfer` beslissen.
    const ids = buildOwnAccountIdentifiers(
      RULES.map((r) => ({ match_type: r.matchType, match_value: r.matchValue })),
      ACCOUNTS.map((a) => a.iban),
    )

    for (const c of COUNTERPARTIES) {
      const expected = isOwnAccountTransfer(c.iban, ids.ibans, c.name, ids.namePatterns)
      const li = await rowFor(c.name ?? '')
      const box = within(li).queryByRole('checkbox') as HTMLInputElement | null
      if (box) {
        expect(box.checked, `${c.name} zou ${expected ? 'aangevinkt' : 'uitgevinkt'} moeten zijn`).toBe(expected)
      } else {
        // Geen checkbox = de vaste "dit is je eigen rekening"-rij; die staat per
        // definitie aan, dus de canonieke functie moet ook `true` zeggen.
        expect(expected, `${c.name} heeft geen checkbox maar matcht niet`).toBe(true)
      }
    }
  })

  it('toont een rekening die op je eigen bank-IBAN matcht als vast, niet als checkbox', async () => {
    renderSheet()
    const li = await rowFor('Spaarrekening')
    expect(within(li).queryByRole('checkbox')).toBeNull()
    expect(within(li).getByText(/een van je eigen rekeningen/i)).toBeInTheDocument()

    // De broker matcht via een REGEL — die moet wél uitvinkbaar zijn.
    const broker = await rowFor('DEGIRO')
    expect(within(broker).getByRole('checkbox')).toBeInTheDocument()
  })

  it('houdt een regel die alleen op een vaste rij matcht verwijderbaar', async () => {
    // Zo'n regel ontstaat echt: de sleepmodus maakt er via lib/category-rules.ts
    // één voor een tegenpartij die óók je eigen bankrekening is. Zou de vaste rij
    // hem "opslokken", dan is hij nergens meer zichtbaar én nergens te wissen.
    serverRules = [
      { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', matchType: 'iban', matchValue: SPAAR_IBAN, label: 'Spaarregel' },
    ]
    renderSheet()

    expect(await screen.findByText('Ook aangemerkt als eigen rekening')).toBeInTheDocument()
    const wisknop = screen.getByRole('button', { name: /Spaarregel verwijderen als eigen rekening/i })
    fireEvent.click(wisknop)

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    await waitFor(() => expect(rulesPost).not.toBeNull())
    expect(rulesPost!.remove).toEqual(['cccccccc-cccc-4ccc-8ccc-cccccccccccc'])
  })

  it('meldt afgekapte historie in plaats van stil af te kappen', async () => {
    truncated = true
    renderSheet()
    expect(await screen.findByText(/niet alles hebben doorzocht/i)).toBeInTheDocument()
  })

  it('stuurt bij opslaan de delta en meldt hoeveel transacties zijn omgezet', async () => {
    reclassified = 47
    const onSaved = renderSheet()

    // Aanvinken van een nieuwe tegenpartij → `add`.
    const winkel = await rowFor('Albert Heijn')
    fireEvent.click(within(winkel).getByRole('checkbox'))
    // Uitvinken van een bestaande regel-match → `remove` met het regel-id.
    const broker = await rowFor('DEGIRO')
    fireEvent.click(within(broker).getByRole('checkbox'))

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(rulesPost).not.toBeNull())
    expect(rulesPost!.add).toEqual([
      { matchType: 'iban', matchValue: WINKEL_IBAN, label: 'Albert Heijn' },
    ])
    expect(rulesPost!.remove).toEqual([RULES[0].id])

    // Toevoegen én verwijderen tegelijk: de melding mag niet doen alsof er alleen
    // is toegevoegd, maar noemt het aantal omgezette transacties nog steeds.
    expect(
      await screen.findByText('Regels bijgewerkt. 47 transacties omgezet naar Eigen rekening.'),
    ).toBeInTheDocument()
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('zegt het ook wanneer er niets om te zetten viel', async () => {
    reclassified = 0
    renderSheet()
    const winkel = await rowFor('Albert Heijn')
    fireEvent.click(within(winkel).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    expect(
      await screen.findByText('Regels opgeslagen. Geen bestaande transacties hoefden omgezet.'),
    ).toBeInTheDocument()
  })

  it('meldt na een pure verwijder-actie geen omzetting als kop', async () => {
    // De server herclassificeert ONVOORWAARDELIJK met de overgebleven regels. Komt
    // daar iets uit, dan mag de sheet niet "N transacties omgezet" melden direct
    // nadat de gebruiker een vinkje wéghaalde — dat is het tegenovergestelde.
    reclassified = 3
    renderSheet()
    const broker = await rowFor('DEGIRO')
    fireEvent.click(within(broker).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    const melding = await screen.findByText(/1 regel verwijderd/)
    expect(melding.textContent).toContain(
      '1 regel verwijderd — nieuwe overboekingen tellen daar weer mee. Wat al omgezet was blijft staan.',
    )
    expect(melding.textContent).toContain('Je overige regels zetten nog 3 andere transacties om')
  })

  // ── H2: sluiten gooit de delta weg ────────────────────────────────────────

  it('vergeet de ongesavede delta zodra de sheet sluit en weer opent', async () => {
    reclassified = 47
    const onSaved = vi.fn()
    const { rerender } = render(
      <OwnAccountsSheet open onClose={() => {}} onSaved={onSaved} />,
    )

    // Een opslag zodat er ook een groene melding blijft hangen.
    const winkel = await rowFor('Albert Heijn')
    fireEvent.click(within(winkel).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    await waitFor(() => expect(rulesPost).not.toBeNull())
    await screen.findByText(/47 transacties omgezet/)

    // Nu een nieuwe, NIET opgeslagen delta: aanvinken + uitvinken.
    rulesPost = null
    fireEvent.click(within(await rowFor('Albert Heijn')).getByRole('checkbox'))
    fireEvent.click(within(await rowFor('PayPal Europe')).getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeEnabled()

    // Annuleer = sluiten. De sheet blijft gemount (mount-latch in budgets-client).
    rerender(<OwnAccountsSheet open={false} onClose={() => {}} onSaved={onSaved} />)
    rerender(<OwnAccountsSheet open onClose={() => {}} onSaved={onSaved} />)

    await waitFor(async () => {
      const box = within(await rowFor('Albert Heijn')).getByRole('checkbox') as HTMLInputElement
      expect(box.checked).toBe(false)
    })
    // De uitgevinkte PayPal-regel is terug (pendingRemove is weg).
    const paypal = within(await rowFor('PayPal Europe')).getByRole('checkbox') as HTMLInputElement
    expect(paypal.checked).toBe(true)
    // Geen stale bevestiging en niets meer op te slaan.
    expect(screen.queryByText(/47 transacties omgezet/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Opslaan' })).toBeDisabled()

    // En dus gaat er ook niets mee bij een volgende opslag.
    expect(rulesPost).toBeNull()
  })

  // ── H3: uitvinken verwijdert een BREDERE regel ────────────────────────────

  it('waarschuwt bij uitvinken dat er een regel verdwijnt die overal geldt', async () => {
    renderSheet()
    const paypal = await rowFor('PayPal Europe')
    fireEvent.click(within(paypal).getByRole('checkbox'))

    // Bij de rij zelf: wélke regel er verdwijnt.
    await waitFor(() => {
      expect(paypal.textContent).toContain('Verwijdert bij opslaan de regel')
    })
    expect(paypal.textContent).toContain('naam bevat "paypal"')
    expect(paypal.textContent).toContain('andere rekeningen')

    // En een samenvatting vlak boven de Opslaan-knop.
    const samenvatting = await screen.findByText(/Bij opslaan verdwijnt 1 regel/)
    expect(samenvatting).toBeInTheDocument()
    expect(
      screen.getByText(/Een regel geldt op al je rekeningen/),
    ).toBeInTheDocument()

    // Weer aanvinken haalt de waarschuwing weg — geen spookmelding.
    fireEvent.click(within(paypal).getByRole('checkbox'))
    await waitFor(() => {
      expect(screen.queryByText(/Bij opslaan verdwijnt 1 regel/)).toBeNull()
    })
  })

  // ── S2: een naam-patroon toont zijn bereik vóór opslaan ───────────────────

  it('telt live hoeveel tegenpartijen een handmatig naam-patroon raakt', async () => {
    renderSheet()
    await rowFor('Albert Heijn') // wachten tot de lijst binnen is

    const naamVeld = screen.getByLabelText('Naam van een eigen rekening')
    fireEvent.change(naamVeld, { target: { value: 'ing' } })

    // 'spaarrekening' bevat 'ing'; de rest niet. De verwachting komt uit dezelfde
    // canonieke functie die de import gebruikt, niet uit een eigen includes.
    const ids = buildOwnAccountIdentifiers([{ match_type: 'name', match_value: 'ing' }], [])
    const verwacht = COUNTERPARTIES.filter((c) =>
      isOwnAccountTransfer(c.iban, ids.ibans, c.name, ids.namePatterns),
    ).length
    expect(verwacht).toBe(1)

    expect(
      await screen.findByText(
        new RegExp(`Raakt ${verwacht} van de ${COUNTERPARTIES.length} tegenpartijen`),
      ),
    ).toBeInTheDocument()
  })

  it('waarschuwt zichtbaar zodra een naam-patroon te breed grijpt', async () => {
    serverCounterparties = [
      cp({ key: 'name:booking.com', name: 'Booking.com' }),
      cp({ key: 'name:parking q-park', name: 'Parking Q-Park' }),
      cp({ key: 'name:verzekeringen nl', name: 'Verzekeringen NL' }),
      cp({ key: 'name:financiering bv', name: 'Financiering BV' }),
      cp({ key: 'name:kleding shop', name: 'Kleding Shop' }),
      cp({ key: 'name:hosting ltd', name: 'Hosting Ltd' }),
    ]
    renderSheet()
    await rowFor('Booking.com')

    fireEvent.change(screen.getByLabelText('Naam van een eigen rekening'), {
      target: { value: 'ing' },
    })

    expect(await screen.findByText(/Raakt 6 van de 6 tegenpartijen/)).toBeInTheDocument()
    expect(screen.getByText(/Dat is breed voor een eigen rekening/)).toBeInTheDocument()
  })

  // ── M2: onbruikbare IBAN mag de hele opslag niet slopen ───────────────────

  it('valt terug op een naam-regel wanneer de IBAN in de brondata onbruikbaar is', async () => {
    // lib/parsers/csv.ts schrijft counterparty_iban zónder vormcontrole; oudere
    // exports leveren "123456789". Een IBAN-regel daarvan zou de HELE batch een
    // 400 opleveren — inclusief de goede vinkjes.
    serverCounterparties = [
      cp({ key: 'iban:123456789', iban: '123456789', name: 'Kabelmaatschappij BV' }),
    ]
    renderSheet()

    const rij = await rowFor('Kabelmaatschappij BV')
    expect(rij.textContent).toContain('geen bruikbare IBAN')
    fireEvent.click(within(rij).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(rulesPost).not.toBeNull())
    expect(rulesPost!.add).toEqual([
      { matchType: 'name', matchValue: 'Kabelmaatschappij BV', label: 'Kabelmaatschappij BV' },
    ])
  })

  // ── L1: het handmatige herstelpad ─────────────────────────────────────────

  it('kan de bestaande historie opnieuw laten indelen en meldt het aantal', async () => {
    reclassified = 5
    const onSaved = renderSheet()
    await rowFor('Albert Heijn')

    fireEvent.click(screen.getByRole('button', { name: /Bestaande transacties opnieuw indelen/i }))

    expect(
      await screen.findByText('5 bestaande transacties alsnog op Eigen rekening gezet.'),
    ).toBeInTheDocument()
    expect(reclassifyPosts).toBe(1)
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('filtert de zichtbare tegenpartijen op naam en op IBAN', async () => {
    renderSheet()
    await rowFor('Albert Heijn')

    const zoek = screen.getByRole('searchbox', { name: /Zoek een tegenpartij/i })

    fireEvent.change(zoek, { target: { value: 'paypal' } })
    expect(screen.getByText('PayPal Europe')).toBeInTheDocument()
    expect(screen.queryByText('Albert Heijn')).not.toBeInTheDocument()

    // Zoeken op de staart van een IBAN moet ook werken — dat is hoe je een
    // rekening herkent waarvan je de tenaamstelling niet paraat hebt.
    fireEvent.change(zoek, { target: { value: '0000000009' } })
    expect(screen.getByText('Albert Heijn')).toBeInTheDocument()
    expect(screen.queryByText('PayPal Europe')).not.toBeInTheDocument()

    fireEvent.change(zoek, { target: { value: 'bestaat niet' } })
    expect(screen.getByText(/Geen tegenpartij die past bij/)).toBeInTheDocument()
  })

  it('toont maximaal 5 tegenpartijen en maakt de rest bereikbaar', async () => {
    // Zes tegenpartijen: de zesde valt buiten de standaardlijst. Afkappen mag
    // alleen omdat hij bereikbaar blijft — een stille cap zou de gebruiker laten
    // geloven dat dit al zijn tegenpartijen zijn.
    serverCounterparties = [
      ...COUNTERPARTIES,
      cp({ key: 'name:jumbo', name: 'Jumbo' }),
      cp({ key: 'name:hornbach', name: 'Hornbach Duiven' }),
    ]
    renderSheet()
    await rowFor('Spaarrekening')

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.queryByText('Hornbach Duiven')).not.toBeInTheDocument()
    expect(screen.getByText('5 van 6')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Toon alle 6 tegenpartijen/i }))

    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByText('Hornbach Duiven')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Toon alleen de eerste 5/i }))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  it('houdt een aangevinkte tegenpartij die wegvalt door de zoekterm gewoon in de opslag', async () => {
    // De invariant: zoeken is een WEERGAVE-filter. Zou de delta aan de zichtbare
    // rijen hangen, dan zou een gebruiker die na het aanvinken even zoekt zijn
    // keuze stil kwijtraken — en dat merkt hij pas maanden later aan zijn
    // spaarquote.
    renderSheet()
    const rij = await rowFor('Albert Heijn')
    fireEvent.click(within(rij).getByRole('checkbox'))

    fireEvent.change(screen.getByRole('searchbox', { name: /Zoek een tegenpartij/i }), {
      target: { value: 'paypal' },
    })
    expect(screen.queryByText('Albert Heijn')).not.toBeInTheDocument()
    expect(await screen.findByText(/buiten deze lijst/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(rulesPost).not.toBeNull())
    expect(rulesPost!.add).toHaveLength(1)
    expect(rulesPost!.add![0]).toMatchObject({ matchType: 'iban', matchValue: WINKEL_IBAN })
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { TijdlijnBericht, TijdlijnOverzicht } from '@/lib/krant/tijdlijn-lezen'

/**
 * De Krant zonder AI op /nieuws (Krant 1C fase 2). Pint: koppen (geen h1,
 * berichten als h3), de uitleg "Waarom zie ik dit?", de url-toets, de
 * optionele blokken, de lege staat, de AI-keuze alleen bij kanAiKiezen en de
 * routes die Vernieuwen/bezwaar/variant raken.
 */

const refreshSpy = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshSpy, push: vi.fn(), replace: vi.fn() }),
}))

// De ShellOverlay rendert in het echt via een portal met timers — hier plat.
vi.mock('@/components/app/shell/shell-overlay', () => ({
  ShellOverlay: ({
    open,
    title,
    children,
    footer,
  }: {
    open: boolean
    title?: string
    children: ReactNode
    footer?: ReactNode
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
        {footer}
      </div>
    ) : null,
}))

import { TijdlijnClient } from './tijdlijn-client'

function bericht(p: Partial<TijdlijnBericht> & { id: string }): TijdlijnBericht {
  return {
    verversingId: 'v1',
    createdAt: '2026-09-29T08:00:00.000Z',
    weekKey: '2026-W40',
    positie: 0,
    vorm: 'direct',
    kop: null,
    tekst: 'Voor jou scheelt dit tussen € 120 en € 240 per jaar.',
    aiTekst: null,
    aiToegevoegd: false,
    waarom: ['Je hebt een koopwoning.'],
    watMist: [],
    deadline: null,
    titel: 'Kop van het bericht',
    rubriek: 'Wonen',
    bron: 'Rijksoverheid',
    url: 'https://www.rijksoverheid.nl/artikel',
    gepubliceerd: '2026-09-28',
    gezienOp: null,
    samenvatting: 'Korte samenvatting.',
    ...p,
  }
}

function overzicht(p: Partial<TijdlijnOverzicht> = {}): TijdlijnOverzicht {
  return {
    pagina: {
      berichten: [
        bericht({ id: 'a', titel: 'Hypotheekrente-aftrek wijzigt' }),
        bericht({ id: 'b', titel: 'Box 3 in 2027', url: 'javascript:alert(1)', waarom: ['Je hebt spaargeld.'] }),
      ],
      volgende: null,
    },
    totaal: 2,
    archief: [{ weekKey: '2026-W40', aantal: 2 }],
    laatstVernieuwd: '2026-09-29T08:00:00.000Z',
    gelezenTot: null,
    achtergrond: null,
    katern: null,
    legeTekst: null,
    laatsteZonderAi: null,
    ...p,
  }
}

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  refreshSpy.mockReset()
  fetchMock = vi.fn(async () => jsonRes(200, {}))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TijdlijnClient', () => {
  it('rendert de berichten als h3, de aanhef als h2 en nergens een h1', () => {
    const { container } = render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen={false} bezwaar={false} />)
    expect(container.querySelector('h1')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Krant' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Hypotheekrente-aftrek wijzigt' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Box 3 in 2027' })).toBeTruthy()
    expect(screen.getAllByTestId('regel-voor-jou')).toHaveLength(2)
  })

  // Eindreview 0.92.28: de onboarding verwijst naar "Mijn nieuwsprofiel"; de tijdlijn is de ingang.
  it('"Over je Krant" linkt naar het nieuwsprofiel, met een spatie vóór de link', () => {
    render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen={false} bezwaar={false} />)
    const link = screen.getByRole('link', { name: 'Bekijk je nieuwsprofiel of pas het aan' })
    expect(link.getAttribute('href')).toBe('/mijn/nieuwsprofiel')
    expect(link.parentElement?.textContent).toBe('Je nieuwsprofiel bepaalt welke berichten je hier ziet. Bekijk je nieuwsprofiel of pas het aan.')
  })

  it('meldt één keer dat de tijdlijn gelezen is', () => {
    render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen={false} bezwaar={false} />)
    const gelezen = fetchMock.mock.calls.filter(([url]) => url === '/api/krant/tijdlijn/gelezen')
    expect(gelezen).toHaveLength(1)
    expect(gelezen[0][1]).toMatchObject({ method: 'PUT' })
  })

  it('"Waarom zie ik dit?" bevat de waarom-regels', () => {
    render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen={false} bezwaar={false} />)
    const summaries = screen.getAllByText('Waarom zie ik dit?')
    expect(summaries).toHaveLength(2)
    const details = summaries[0].closest('details')!
    fireEvent.click(summaries[0])
    expect(within(details).getByText('Je hebt een koopwoning.')).toBeTruthy()
  })

  it('maakt geen link van een javascript:-url, wel van https', () => {
    render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen={false} bezwaar={false} />)
    const links = screen.getAllByRole('link', { name: 'Lees bij de bron' })
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('https://www.rijksoverheid.nl/artikel')
    for (const a of document.querySelectorAll('a')) {
      expect(a.getAttribute('href') ?? '').not.toMatch(/^javascript:/i)
    }
  })

  it('markeert berichten na gelezenTot als nieuw', () => {
    const o = overzicht({
      gelezenTot: '2026-09-28T00:00:00.000Z',
      pagina: {
        berichten: [
          bericht({ id: 'a', titel: 'Nieuw bericht', createdAt: '2026-09-29T08:00:00.000Z' }),
          bericht({ id: 'b', titel: 'Oud bericht', createdAt: '2026-09-27T08:00:00.000Z' }),
        ],
        volgende: null,
      },
    })
    render(<TijdlijnClient overzicht={o} kanAiKiezen={false} bezwaar={false} />)
    expect(screen.getAllByText('Nieuw')).toHaveLength(1)
  })

  it('toont Achtergrond en katern alleen als ze er zijn, met kop en label uit de data', () => {
    const { rerender } = render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen={false} bezwaar={false} />)
    expect(screen.queryByRole('heading', { level: 2, name: 'Achtergrond' })).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: 'Algemeen nieuws' })).toBeNull()

    const item = {
      artikelId: 'x1',
      titel: 'Artikel uit het katern',
      rubriek: null,
      bron: 'CBS',
      url: 'https://www.cbs.nl/a',
      gepubliceerd: null,
      samenvatting: null,
    }
    rerender(
      <TijdlijnClient
        overzicht={overzicht({
          achtergrond: { kop: 'Achtergrond', label: 'Geen regel voor jou', items: [{ ...item, artikelId: 'y1', titel: 'Achtergrondstuk' }] },
          katern: { kop: 'Algemeen nieuws', label: 'Voor iedereen', items: [item] },
        })}
        kanAiKiezen={false}
        bezwaar={false}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Achtergrond' })).toBeTruthy()
    expect(screen.getByText('Geen regel voor jou')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Achtergrondstuk' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Algemeen nieuws' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Artikel uit het katern' })).toBeTruthy()
  })

  it('ADR 0191 regel 3: zonder echte publicatiedatum "gezien op", nooit het ophaalmoment als publicatiedatum', () => {
    const o = overzicht({
      pagina: {
        berichten: [
          bericht({ id: 'echt', titel: 'Met feeddatum', gepubliceerd: '2026-08-24T10:00:00.000Z', gezienOp: null }),
          bericht({ id: 'gezien', titel: 'Alleen gezien', gepubliceerd: null, gezienOp: '2026-09-22T05:25:00.000Z' }),
        ],
        volgende: null,
      },
      achtergrond: {
        kop: 'Achtergrond',
        label: 'Geen regel voor jou',
        items: [{ artikelId: 'z1', titel: 'Uitleg', rubriek: null, bron: 'AFM', url: 'https://www.afm.nl/a', gepubliceerd: null, gezienOp: '2026-09-21T05:25:00.000Z', samenvatting: null }],
      },
    })
    const { container } = render(<TijdlijnClient overzicht={o} kanAiKiezen={false} bezwaar={false} />)
    const tekst = container.textContent ?? ''
    expect(tekst).toContain('24 augustus 2026')
    expect(tekst).toContain('gezien op 22 september 2026')
    expect(tekst).toContain('gezien op 21 september 2026')
    // Het ophaalmoment staat nooit los als publicatiedatum.
    expect(tekst).not.toMatch(/Rijksoverheid · 22 september 2026/)
  })

  it('lege tijdlijn: toont de lege tekst (of de standaard) en de Vernieuwen-knop', () => {
    const leeg = overzicht({ totaal: 0, archief: [], pagina: { berichten: [], volgende: null } })
    const { rerender } = render(<TijdlijnClient overzicht={leeg} kanAiKiezen={false} bezwaar={false} />)
    expect(screen.getByText('Er staat nog niets in je tijdlijn.')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Vernieuwen/ })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 2, name: 'Archief' })).toBeNull()

    rerender(
      <TijdlijnClient overzicht={{ ...leeg, legeTekst: 'Deze week raakte geen bericht je situatie.' }} kanAiKiezen={false} bezwaar={false} />,
    )
    expect(screen.getByText('Deze week raakte geen bericht je situatie.')).toBeTruthy()
  })

  it('toont het archief alleen als er meer is dan bovenaan staat', () => {
    const { rerender } = render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen={false} bezwaar={false} />)
    expect(screen.queryByRole('heading', { level: 2, name: 'Archief' })).toBeNull()
    rerender(<TijdlijnClient overzicht={overzicht({ totaal: 30, archief: [{ weekKey: '2026-W39', aantal: 28 }] })} kanAiKiezen={false} bezwaar={false} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Archief' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Week 39 · 2026 — 28 berichten/ })).toBeTruthy()
  })

  it('archiefweek openklappen haalt die week op', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('/api/krant/tijdlijn?')
        ? jsonRes(200, { pagina: { berichten: [bericht({ id: 'w', titel: 'Uit week 39' })], volgende: null } })
        : jsonRes(200, {}),
    )
    render(<TijdlijnClient overzicht={overzicht({ totaal: 30, archief: [{ weekKey: '2026-W39', aantal: 28 }] })} kanAiKiezen={false} bezwaar={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Week 39/ }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: 'Uit week 39' })).toBeTruthy())
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/krant/tijdlijn?week=2026-W39')).toBe(true)
  })

  it('"Meer laden" haalt de volgende pagina met de cursor', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith('/api/krant/tijdlijn?')
        ? jsonRes(200, { pagina: { berichten: [bericht({ id: 'c', titel: 'Ouder bericht' })], volgende: null } })
        : jsonRes(200, {}),
    )
    const o = overzicht({ pagina: { ...overzicht().pagina, volgende: 'CURSOR1' } })
    render(<TijdlijnClient overzicht={o} kanAiKiezen={false} bezwaar={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Meer laden' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 3, name: 'Ouder bericht' })).toBeTruthy())
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/krant/tijdlijn?cursor=CURSOR1')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Meer laden' })).toBeNull()
  })

  it('de AI-keuze staat er alleen bij kanAiKiezen', () => {
    const { rerender } = render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen={false} bezwaar={false} />)
    expect(screen.queryByRole('button', { name: 'Liever de Krant met AI' })).toBeNull()
    rerender(<TijdlijnClient overzicht={overzicht()} kanAiKiezen bezwaar={false} />)
    expect(screen.getByRole('button', { name: 'Liever de Krant met AI' })).toBeTruthy()
  })

  it('AI-keuze (1E): de bevestiging belooft dat de tijdlijn blijft; PUT variant ai en refresh', async () => {
    render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen bezwaar={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Liever de Krant met AI' }))
    const dialoog = screen.getByRole('dialog')
    expect(within(dialoog).getByText(/Je tijdlijn blijft zoals hij is/)).toBeTruthy()
    expect(dialoog.textContent).not.toMatch(/gewist|wissen/i)
    expect(within(dialoog).queryByRole('button', { name: 'Tijdlijn wissen' })).toBeNull()
    fireEvent.click(within(dialoog).getByRole('button', { name: 'Met AI verder' }))
    await waitFor(() => expect(refreshSpy).toHaveBeenCalled())
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/krant/variant')!
    expect(call[1]).toMatchObject({ method: 'PUT' })
    expect(JSON.parse(call[1].body as string)).toEqual({ variant: 'ai' })
  })

  it('bezwaar: na bevestiging PUT bezwaar true; bij bestaand bezwaar intrekken met false', async () => {
    const { unmount } = render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen={false} bezwaar={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bezwaar maken' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bezwaar maken' }))
    await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(1))
    let call = fetchMock.mock.calls.find(([url]) => url === '/api/krant/bezwaar')!
    expect(JSON.parse(call[1].body as string)).toEqual({ bezwaar: true })
    unmount()

    fetchMock.mockClear()
    render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen={false} bezwaar />)
    expect(screen.getByText(/Je hebt bezwaar gemaakt/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Bezwaar intrekken' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bezwaar intrekken' }))
    await waitFor(() => expect(refreshSpy).toHaveBeenCalledTimes(2))
    call = fetchMock.mock.calls.find(([url]) => url === '/api/krant/bezwaar')!
    expect(JSON.parse(call[1].body as string)).toEqual({ bezwaar: false })
  })

  it('Vernieuwen: POST naar de vernieuw-route, dan refresh en status', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/krant/tijdlijn/vernieuwen' ? jsonRes(200, { status: 'ververst', items: 3, leeg: false }) : jsonRes(200, {}),
    )
    render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen={false} bezwaar={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vernieuwen' }))
    await waitFor(() => expect(screen.getByText('3 nieuwe berichten.')).toBeTruthy())
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/krant/tijdlijn/vernieuwen')!
    expect(call[1]).toMatchObject({ method: 'POST' })
    expect(refreshSpy).toHaveBeenCalled()
  })

  it('Vernieuwen: niets nieuws geeft de rustige melding', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/krant/tijdlijn/vernieuwen' ? jsonRes(200, { status: 'niets-nieuws' }) : jsonRes(200, {}),
    )
    render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen={false} bezwaar={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vernieuwen' }))
    await waitFor(() => expect(screen.getByText('Er is niets nieuws sinds de vorige keer.')).toBeTruthy())
  })

  it('Vernieuwen: 429 toont de tekst uit de envelope en ververst niet', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/krant/tijdlijn/vernieuwen'
        ? jsonRes(429, { error: 'Je hebt net vernieuwd. Probeer het over een paar minuten opnieuw.', code: 'te_snel' })
        : jsonRes(200, {}),
    )
    render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen={false} bezwaar={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vernieuwen' }))
    await waitFor(() =>
      expect(screen.getByText('Je hebt net vernieuwd. Probeer het over een paar minuten opnieuw.')).toBeTruthy(),
    )
    expect(refreshSpy).not.toHaveBeenCalled()
  })

  it('bevat geen vrijheidstijd-, advies- of AI-claims in de chrome', () => {
    const { container } = render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen={false} bezwaar={false} />)
    const tekst = container.textContent ?? ''
    expect(tekst).not.toMatch(/vrijheid|dagen vrij|overweeg|profiteer|abonnement/i)
    expect(tekst).not.toMatch(/\bAI\b/)
  })
})

describe('TijdlijnClient — kop bij vorm raakt (B37)', () => {
  it('toont de kop uit de loader ("Over jouw situatie") in plaats van "Voor jou"', () => {
    render(
      <TijdlijnClient
        overzicht={overzicht({
          pagina: { berichten: [bericht({ id: 'r', vorm: 'raakt', kop: 'Over jouw situatie', tekst: 'Volgens je profiel heb je kinderen.' })], volgende: null },
        })}
        kanAiKiezen={false}
        bezwaar={false}
      />,
    )
    const regel = screen.getByTestId('regel-voor-jou')
    expect(regel.textContent).toContain('Over jouw situatie')
    expect(regel.textContent).not.toContain('Voor jou')
  })
})

describe('TijdlijnClient — de Krant met AI (1E, ADR 0190)', () => {
  const metAiOverzicht = (p: Partial<TijdlijnOverzicht> = {}) =>
    overzicht({
      pagina: {
        berichten: [
          bericht({ id: 'a', titel: 'Box 3 in 2027', aiTekst: 'Met jouw spaargeld valt dit bericht in de groep die het raakt.' }),
          bericht({ id: 'b', titel: 'Zonder toelichting' }),
          bericht({ id: 'c', titel: 'Door het model gekozen', vorm: 'ai', tekst: '', aiTekst: 'Dit gaat over huurders.', aiToegevoegd: true }),
        ],
        volgende: null,
      },
      totaal: 3,
      ...p,
    })

  it('toont de AI-toelichting onder de regel met het label "met AI", en "door AI toegevoegd" bij een toevoeging', () => {
    render(<TijdlijnClient overzicht={metAiOverzicht()} bron="ai" kanAiKiezen bezwaar={false} />)
    const toelichtingen = screen.getAllByTestId('ai-toelichting')
    expect(toelichtingen).toHaveLength(2)
    expect(toelichtingen[0].textContent).toMatch(/^Met AI/)
    expect(toelichtingen[1].textContent).toMatch(/Door AI toegevoegd · met AI/)
    // Een toegevoegd bericht heeft geen matcherregel; de andere twee wel.
    expect(screen.getAllByTestId('regel-voor-jou')).toHaveLength(2)
  })

  it('bron tijdlijn: een eerder met AI geschreven bericht houdt zijn label (momentopname), de knoppen zijn die van zonder AI', () => {
    render(<TijdlijnClient overzicht={metAiOverzicht()} kanAiKiezen bezwaar={false} />)
    // Een eerder met AI geschreven bericht blijft als momentopname staan, mét zijn label.
    expect(screen.getAllByTestId('ai-toelichting')).toHaveLength(2)
    // Maar de kop en de knoppen zijn die van de Krant zonder AI.
    expect(screen.getByRole('button', { name: 'Liever de Krant met AI' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Liever zonder AI' })).toBeNull()
  })

  it('bron ai: de knop "Liever zonder AI" (niet de AI-keuze), en PUT variant tijdlijn na bevestiging', async () => {
    render(<TijdlijnClient overzicht={metAiOverzicht()} bron="ai" kanAiKiezen bezwaar={false} />)
    expect(screen.queryByRole('button', { name: 'Liever de Krant met AI' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Liever zonder AI' }))
    const dialoog = screen.getByRole('dialog')
    expect(dialoog.textContent).toMatch(/Wat er al staat, blijft staan/)
    fireEvent.click(within(dialoog).getByRole('button', { name: 'Zonder AI verder' }))
    await waitFor(() => expect(refreshSpy).toHaveBeenCalled())
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/krant/variant')!
    expect(JSON.parse(call[1].body as string)).toEqual({ variant: 'tijdlijn' })
  })

  it('Y3: een tekst per reden van stilstand — alleen voor bron ai; zonder stilstand maar met een teruggevallen vorige verversing de algemene regel', () => {
    const r = (p: { aiStilstand?: 'bezwaar' | 'lokaal' | 'quotum' | 'tegoed' | null; laatsteZonderAi?: 'quotum' | 'anders' | null; bron?: 'ai' | 'tijdlijn' }) => (
      <TijdlijnClient
        overzicht={metAiOverzicht({ laatsteZonderAi: p.laatsteZonderAi ?? null })}
        bron={p.bron ?? 'ai'}
        kanAiKiezen
        bezwaar={p.aiStilstand === 'bezwaar'}
        aiStilstand={p.aiStilstand ?? null}
      />
    )
    const { rerender } = render(r({ aiStilstand: 'bezwaar' }))
    expect(screen.getByTestId('zonder-ai').textContent).toMatch(/^Met AI staat stil zolang je bezwaar staat/)
    rerender(r({ aiStilstand: 'lokaal' }))
    expect(screen.getByTestId('zonder-ai').textContent).toMatch(/zolang nieuws bij jou op lokaal staat of de privé-modus aan is/)
    rerender(r({ aiStilstand: 'quotum' }))
    expect(screen.getByTestId('zonder-ai').textContent).toMatch(/maximum van 5 verversingen met AI in 7 dagen bereikt/)
    expect(screen.getByTestId('zonder-ai').textContent).not.toMatch(/deze week/)
    rerender(r({ aiStilstand: 'tegoed' }))
    expect(screen.getByTestId('zonder-ai').textContent).toMatch(/AI-tegoed voor deze maand is op/)
    rerender(r({ laatsteZonderAi: 'anders' }))
    expect(screen.getByTestId('zonder-ai').textContent).toMatch(/^De vorige verversing was zonder AI/)
    rerender(r({}))
    expect(screen.queryByTestId('zonder-ai')).toBeNull()
    rerender(r({ aiStilstand: 'bezwaar', bron: 'tijdlijn' }))
    expect(screen.queryByTestId('zonder-ai')).toBeNull()
  })

  it('Y3: bij stilstand belooft de kop geen AI (kicker en deck zonder AI)', () => {
    const { container, rerender } = render(<TijdlijnClient overzicht={metAiOverzicht()} bron="ai" kanAiKiezen bezwaar={false} aiStilstand={null} />)
    expect(container.textContent).toContain('Persoonlijke tijdlijn · met AI')
    rerender(<TijdlijnClient overzicht={metAiOverzicht()} bron="ai" kanAiKiezen bezwaar aiStilstand="bezwaar" />)
    expect(container.textContent).not.toContain('Persoonlijke tijdlijn · met AI')
    expect(container.textContent).not.toContain('een toelichting van een AI-model')
  })

  it('Y3/Y7: de bevestiging "Liever de Krant met AI" noemt de stilstand en de grenzen uit één bron', () => {
    render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen bezwaar aiStilstand="bezwaar" />)
    fireEvent.click(screen.getByRole('button', { name: 'Liever de Krant met AI' }))
    const dialoog = screen.getByRole('dialog')
    expect(within(dialoog).getByTestId('bevestig-stilstand').textContent).toMatch(/zolang je bezwaar staat/)
    expect(dialoog.textContent).toMatch(/hoogstens 3 zinnen/)
    expect(dialoog.textContent).toMatch(/hoogstens 3 berichten toevoegen/)
    expect(dialoog.textContent).toMatch(/hoogstens 5 keer in 7 dagen/)
    expect(dialoog.textContent).not.toMatch(/Vanaf de volgende verversing schrijft/)
  })

  it('R2: een omgezet bericht uit de oude AI-Krant draagt als geheel "Uit de eerdere Krant met AI" — niet "Met AI", geen regel', () => {
    render(
      <TijdlijnClient
        overzicht={overzicht({ pagina: { berichten: [bericht({ id: 'o', vorm: 'ai-oud', tekst: '', aiTekst: null, titel: 'Oude kop' })], volgende: null }, totaal: 1 })}
        kanAiKiezen={false}
        bezwaar={false}
      />,
    )
    expect(screen.getByTestId('ai-oud').textContent).toBe('Uit de eerdere Krant met AI')
    expect(screen.queryByTestId('ai-toelichting')).toBeNull()
    expect(screen.queryByTestId('regel-voor-jou')).toBeNull()
  })

  it('Vernieuwen met AI: meldt "Zonder AI." als de laag terugviel', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === '/api/krant/tijdlijn/vernieuwen' ? jsonRes(200, { status: 'ververst', items: 2, leeg: false, ai: 'quotum' }) : jsonRes(200, {}),
    )
    render(<TijdlijnClient overzicht={metAiOverzicht()} bron="ai" kanAiKiezen bezwaar={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vernieuwen' }))
    await waitFor(() => expect(screen.getByText('2 nieuwe berichten. Zonder AI.')).toBeTruthy())
  })

  it('K9: geen naam of avatar van een assistent', () => {
    const { container } = render(<TijdlijnClient overzicht={metAiOverzicht()} bron="ai" kanAiKiezen bezwaar={false} />)
    expect(container.textContent ?? '').not.toMatch(/\bFin\b/)
    expect(container.querySelector('[data-testid*="fin"], [class*="fin-dots"]')).toBeNull()
  })
})

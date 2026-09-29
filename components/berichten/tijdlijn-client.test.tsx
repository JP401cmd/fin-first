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

  it('AI-keuze: na bevestiging PUT variant ai en refresh', async () => {
    render(<TijdlijnClient overzicht={overzicht()} kanAiKiezen bezwaar={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Liever de Krant met AI' }))
    const dialoog = screen.getByRole('dialog')
    expect(within(dialoog).getByText(/Je tijdlijn wordt dan direct gewist/)).toBeTruthy()
    fireEvent.click(within(dialoog).getByRole('button', { name: 'Tijdlijn wissen' }))
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

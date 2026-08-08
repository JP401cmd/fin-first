import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MeldingView } from './melding-view'
import { resolveRouteTitle } from '@/lib/nav-config'

/**
 * Contract-test voor de meldflow in het chatvenster.
 *
 * Wat hier gepind wordt is precies wat stil kan wegdrijven zonder dat iemand
 * het ziet: de vorm van de multipart-body die naar `/api/user-reports` gaat
 * (veld `payload` als JSON-string, `screenshot` als los bestand), de
 * type-afhankelijke velden, en het feit dat de voorgevulde schermnaam uit
 * `resolveRouteTitle` komt en niet uit een tweede, eigen tabel.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/overzicht',
}))

const VERSIE_SHA = 'abc1234'

let fetchMock: ReturnType<typeof vi.fn>

/** De laatste POST naar /api/user-reports, uitgepakt. */
function laatstePayload(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/user-reports'))
  if (!call) throw new Error('Geen POST naar /api/user-reports gedaan')
  const body = (call[1] as { body: FormData }).body
  return JSON.parse(body.get('payload') as string)
}

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/api/version')) {
      return { ok: true, json: async () => ({ sha: VERSIE_SHA, env: 'test' }) } as Response
    }
    return { ok: true, json: async () => ({ ok: true, id: 'rep-1' }) } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  // jsdom kent geen object-URL's; de preview gebruikt ze wel.
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: vi.fn(),
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function kies(label: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }))
}

describe('MeldingView', () => {
  it('vult het scherm-veld met de canonieke routetitel, niet met een eigen tabel', async () => {
    render(<MeldingView onClose={() => {}} />)
    kies('Bug melden')
    const verwacht = resolveRouteTitle('/overzicht') ?? '/overzicht'
    expect((screen.getByLabelText('Scherm') as HTMLInputElement).value).toBe(verwacht)
  })

  it('stuurt een bug als multipart met het volledige payload-contract', async () => {
    render(<MeldingView onClose={() => {}} />)
    // Wachten tot /api/version binnen is, anders staat appVersion nog op 'onbekend'.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    kies('Bug melden')
    fireEvent.change(screen.getByLabelText('Wat ging er mis?'), {
      target: { value: 'De grafiek blijft leeg na het opslaan.' },
    })
    fireEvent.change(screen.getByLabelText(/Wat had je verwacht/), {
      target: { value: 'Dat de lijn direct bijwerkt.' },
    })
    fireEvent.click(screen.getByLabelText('Ja'))
    fireEvent.click(screen.getByRole('button', { name: /Verstuur melding/ }))

    await waitFor(() => expect(laatstePayload()).toBeTruthy())
    const payload = laatstePayload()
    expect(payload.type).toBe('bug')
    expect(payload.description).toBe('De grafiek blijft leeg na het opslaan.')
    expect(payload.expected).toBe('Dat de lijn direct bijwerkt.')
    expect(payload.consent).toBe(true)
    expect(payload.context).toMatchObject({
      pathname: '/overzicht',
      pageTitle: resolveRouteTitle('/overzicht'),
      appVersion: VERSIE_SHA,
    })
    expect(String((payload.context as Record<string, string>).viewport)).toMatch(/^\d+x\d+$/)
  })

  it('laat bij een aanbeveling scherm, verwachting, toestemming en afbeelding weg', async () => {
    render(<MeldingView onClose={() => {}} />)
    kies('Aanbeveling doen')

    expect(screen.queryByLabelText('Scherm')).toBeNull()
    expect(screen.queryByText(/Wat had je verwacht/)).toBeNull()
    expect(screen.queryByText(/Toestemming/)).toBeNull()
    expect(screen.queryByText(/Schermafbeelding/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Wat zou je willen?'), {
      target: { value: 'Een donkere modus zou fijn zijn.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Verstuur melding/ }))

    await waitFor(() => expect(laatstePayload()).toBeTruthy())
    const payload = laatstePayload()
    expect(payload.type).toBe('aanbeveling')
    expect(payload.consent).toBe(false)
    expect(payload.screen).toBeUndefined()
    expect(payload.expected).toBeUndefined()
  })

  it('neemt een geplakte afbeelding over als screenshot-bestand', async () => {
    render(<MeldingView onClose={() => {}} />)
    kies('Bug melden')

    const bestand = new File(['x'], 'schermafdruk.png', { type: 'image/png' })
    fireEvent.paste(screen.getByLabelText('Wat ging er mis?'), {
      clipboardData: {
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { kind: 'file', type: 'image/png', getAsFile: () => bestand },
        ],
      },
    })

    expect(await screen.findByText('schermafdruk.png')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Wat ging er mis?'), {
      target: { value: 'Zie de afbeelding hierboven.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Verstuur melding/ }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/user-reports'))
      expect(call).toBeTruthy()
      const body = (call![1] as { body: FormData }).body
      expect(body.get('screenshot')).toBe(bestand)
    })
  })

  it('weigert een te groot of verkeerd bestand met een NL-melding', async () => {
    render(<MeldingView onClose={() => {}} />)
    kies('Bug melden')

    const gif = new File(['x'], 'animatie.gif', { type: 'image/gif' })
    fireEvent.paste(screen.getByLabelText('Wat ging er mis?'), {
      clipboardData: { items: [{ kind: 'file', type: 'image/gif', getAsFile: () => gif }] },
    })

    expect(await screen.findByText(/Alleen PNG, JPEG of WebP/)).toBeTruthy()
  })

  it('toont de servertekst bij een 429 en blijft op het formulier staan', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/version')) {
        return { ok: true, json: async () => ({ sha: VERSIE_SHA }) } as Response
      }
      return {
        ok: false,
        status: 429,
        json: async () => ({ error: 'Je hebt net al een paar meldingen gestuurd.' }),
      } as unknown as Response
    })

    render(<MeldingView onClose={() => {}} />)
    kies('Vraag stellen')
    fireEvent.change(screen.getByLabelText('Wat is je vraag?'), {
      target: { value: 'Hoe werkt de vrijheidstijd?' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Verstuur melding/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Je hebt net al een paar meldingen gestuurd.',
    )
    expect(screen.getByLabelText('Wat is je vraag?')).toBeTruthy()
  })

  it('toont de succes-state met een vervolgactie na een geslaagde melding', async () => {
    render(<MeldingView onClose={() => {}} />)
    kies('Vraag stellen')
    fireEvent.change(screen.getByLabelText('Wat is je vraag?'), {
      target: { value: 'Hoe werkt de vrijheidstijd?' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Verstuur melding/ }))

    expect(await screen.findByText(/Bedankt, we hebben je melding/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Nog een melding' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Terug naar de chat/ })).toBeTruthy()
  })

  it('valideert de hoofdtekst voordat er iets naar de server gaat', async () => {
    render(<MeldingView onClose={() => {}} />)
    kies('Bug melden')
    fireEvent.click(screen.getByRole('button', { name: /Verstuur melding/ }))

    expect(await screen.findByText(/Schrijf in een paar woorden/)).toBeTruthy()
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/user-reports')),
    ).toBe(false)
  })

  it('zet de schermafbeelding bóven de toestemmingsvraag en belooft geen inzage die niet bestaat', () => {
    render(<MeldingView onClose={() => {}} />)
    kies('Bug melden')

    // De uitleg onder de keuze noemt de schermafbeelding; dan moet die er ook
    // al staan. Stond eerder eronder — de zin klopte dus niet met het scherm.
    const schermafbeelding = screen.getByText(/Schermafbeelding/)
    const toestemming = screen.getByText('Toestemming')
    expect(
      schermafbeelding.compareDocumentPosition(toestemming) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0)

    // Wat de code doet: alles gaat mee, de keuze gaat over contact opnemen.
    expect(screen.getByText(/altijd mee naar onze werklijst/)).toBeTruthy()
    expect(screen.getByText(/toegang tot je account krijgen we daar niet mee/)).toBeTruthy()
    expect(screen.getByText(/Mogen we contact met je opnemen/)).toBeTruthy()

    // Wat de code níet doet — deze twee beloftes mogen nooit terugkeren.
    expect(screen.queryByText(/We kijken alleen mee als je hier/)).toBeNull()
    expect(screen.queryByText(/gegevens inzien/)).toBeNull()
  })

  it('meldt aan de container dat er een verzending loopt en geeft die daarna vrij', async () => {
    // Het paneel (ChatPanel) bezit de megafoon-toggle, het sluitkruis en de
    // mobiele backdrop. Zonder dit signaal unmount MeldingView halverwege de
    // fetch: geen bevestiging, dus meldt de gebruiker hetzelfde nog een keer.
    const poort: { los: () => void } = { los: () => {} }
    const wachten = new Promise<void>((resolve) => {
      poort.los = resolve
    })
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/api/version')) {
        return { ok: true, json: async () => ({ sha: VERSIE_SHA }) } as Response
      }
      await wachten
      return { ok: true, json: async () => ({ ok: true, id: 'rep-1' }) } as unknown as Response
    })

    const bezigLog: boolean[] = []
    const onBezigChange = (bezig: boolean) => {
      bezigLog.push(bezig)
    }

    render(<MeldingView onClose={() => {}} onBezigChange={onBezigChange} />)
    kies('Vraag stellen')
    fireEvent.change(screen.getByLabelText('Wat is je vraag?'), {
      target: { value: 'Hoe werkt de vrijheidstijd?' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Verstuur melding/ }))

    await waitFor(() => expect(bezigLog.at(-1)).toBe(true))

    poort.los()
    await waitFor(() => expect(bezigLog.at(-1)).toBe(false))
    expect(await screen.findByText(/Bedankt, we hebben je melding/)).toBeTruthy()
  })

  it('verplaatst de focus naar het eerste ongeldige veld', () => {
    render(<MeldingView onClose={() => {}} />)
    kies('Bug melden')

    // Scherm is voorgevuld, dus de hoofdtekst is het eerste ongeldige veld.
    fireEvent.click(screen.getByRole('button', { name: /Verstuur melding/ }))
    expect(document.activeElement).toBe(screen.getByLabelText('Wat ging er mis?'))

    // Leeg scherm wint: dat veld staat hoger in het formulier.
    fireEvent.change(screen.getByLabelText('Scherm'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Verstuur melding/ }))
    expect(document.activeElement).toBe(screen.getByLabelText('Scherm'))
  })

  it('houdt de tekstlimieten van de route aan en telt pas vlak voor de grens', () => {
    render(<MeldingView onClose={() => {}} />)
    kies('Bug melden')

    // Exact het zod-schema van /api/user-reports: screen 120, description 4000.
    expect((screen.getByLabelText('Scherm') as HTMLInputElement).maxLength).toBe(120)
    const beschrijving = screen.getByLabelText('Wat ging er mis?') as HTMLTextAreaElement
    expect(beschrijving.maxLength).toBe(4000)

    fireEvent.change(beschrijving, { target: { value: 'x'.repeat(3400) } })
    expect(screen.queryByText(/tekens/)).toBeNull()

    fireEvent.change(beschrijving, { target: { value: 'x'.repeat(3600) } })
    expect(screen.getByText(/Nog 400 van de 4000 tekens/)).toBeTruthy()
  })

  it('houdt de live-regio van de bevestiging permanent gemount', async () => {
    const { container } = render(<MeldingView onClose={() => {}} />)
    const regio = container.querySelector('[aria-live="polite"]')
    expect(regio).toBeTruthy()
    expect(regio?.textContent).toBe('')

    kies('Vraag stellen')
    fireEvent.change(screen.getByLabelText('Wat is je vraag?'), {
      target: { value: 'Hoe werkt de vrijheidstijd?' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Verstuur melding/ }))

    // Zelfde node-instantie die vult: een regio die mét zijn tekst verschijnt
    // wordt door schermlezers meestal niet aangekondigd.
    await waitFor(() => expect(regio?.textContent).toMatch(/verstuurd/))
    expect(container.querySelector('[aria-live="polite"]')).toBe(regio)
  })
})

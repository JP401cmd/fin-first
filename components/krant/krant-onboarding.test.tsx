/**
 * De twee hosts van de profiel-body (Krant 2C, ADR 0192).
 *
 * Onboarding (vijf schermen):
 *  - "Sla dit scherm over" slaat niets op en gaat door;
 *  - "Verder" stuurt alleen de velden van dát scherm die je aanraakte;
 *  - het laatste scherm roept de klaar-route aan en gaat dan naar /nieuws;
 *  - er gaat nooit een verzoek naar een AI-route.
 * /mijn/nieuwsprofiel:
 *  - de secties zijn h3 (onder de h2 van PageOpening), geen h1/h2 in het scherm;
 *  - Opslaan stuurt alleen de wijzigingen; "Nu vernieuwen" gebruikt de
 *    vernieuwroute van /nieuws en wacht tot er niets meer ongeslagen is.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LEEG_PROFIEL } from '@/lib/krant/profiel'
import { KrantOnboarding } from './krant-onboarding'
import { NieuwsprofielScherm } from './nieuwsprofiel-scherm'

const fetchMock = vi.fn()
const origineleLocation = window.location

function jsonRes(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(window, 'location', { configurable: true, value: { ...origineleLocation, href: 'http://localhost/onboarding/krant' } })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'location', { configurable: true, value: origineleLocation })
})

/** De footer staat twee keer in de DOM (inline op desktop, sticky op mobiel); jsdom kent geen breakpoints. */
const knop = (name: string) => screen.getAllByRole('button', { name })[0]! as HTMLButtonElement

const aangeroepen = () => fetchMock.mock.calls.map((c) => String(c[0]))

describe('<KrantOnboarding>', () => {
  it('overslaan slaat niets op; verder stuurt alleen de aangeraakte velden van dat scherm', async () => {
    render(<KrantOnboarding start={LEEG_PROFIEL} herkomst={{}} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Eerst iets over jou/)

    fireEvent.click(knop('Sla dit scherm over'))
    await flush()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/inkomen/)

    fetchMock.mockResolvedValueOnce(jsonRes({ profiel: { ...LEEG_PROFIEL, inkomen: '2500-3250' }, herkomst: { inkomen: 'zelf' } }))
    fireEvent.click(screen.getByLabelText(/^€\s2\.500/))
    fireEvent.click(knop('Verder'))
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/krant/profiel')
    expect((init as RequestInit).method).toBe('PUT')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ inkomen: '2500-3250' })
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/woont/)
  })

  it('het laatste scherm rondt af via de klaar-route en gaat naar /nieuws — nooit een AI-route', async () => {
    render(<KrantOnboarding start={LEEG_PROFIEL} herkomst={{}} />)
    for (let i = 0; i < 4; i++) {
      fireEvent.click(knop('Sla dit scherm over'))
      await flush()
    }
    fetchMock.mockResolvedValueOnce(jsonRes({ ok: true, eersteVerversing: 'ververst' }))
    fireEvent.click(knop('Klaar, naar mijn Krant'))
    await flush()
    expect(aangeroepen()).toEqual(['/api/krant/onboarding/klaar'])
    expect(window.location.href).toBe('/nieuws')
    for (const u of aangeroepen()) expect(u).not.toMatch(/\/api\/(ai|news)\b|onboarding\/extract/)
  })

  it('een mislukte opslag blijft op het scherm met een melding', async () => {
    render(<KrantOnboarding start={LEEG_PROFIEL} herkomst={{}} />)
    fetchMock.mockResolvedValueOnce(jsonRes({ error: 'x' }, 500))
    fireEvent.click(screen.getByLabelText('Alleen'))
    fireEvent.click(knop('Verder'))
    await flush()
    expect(screen.getAllByRole('alert')[0]!.textContent).toMatch(/Opslaan lukte niet/)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/jou/)
  })
})

describe('<NieuwsprofielScherm>', () => {
  it('secties zijn h3, geen h1/h2 in het scherm', () => {
    const { container } = render(<NieuwsprofielScherm start={LEEG_PROFIEL} herkomst={{}} />)
    expect(container.querySelector('h1, h2')).toBeNull()
    const koppen = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(koppen).toEqual(['Wie je bent', 'Inkomen', 'Wonen', 'Geld opzij en schulden', 'Pensioen en rubrieken', 'Je tijdlijn'])
  })

  it('Opslaan stuurt alleen de wijziging; daarna mag vernieuwen, via de route van /nieuws', async () => {
    render(<NieuwsprofielScherm start={{ ...LEEG_PROFIEL, inkomen: '2500-3250' }} herkomst={{ inkomen: 'afgeleid' }} />)
    const opslaan = knop('Opslaan') as HTMLButtonElement
    const vernieuw = knop('Nu vernieuwen') as HTMLButtonElement
    expect(opslaan.disabled).toBe(true)
    expect(screen.getByText(/Afgeleid uit wat je in de app hebt vastgelegd/)).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Koophuis met hypotheek'))
    expect(opslaan.disabled).toBe(false)
    expect(vernieuw.disabled).toBe(true)

    fetchMock.mockResolvedValueOnce(
      jsonRes({ profiel: { ...LEEG_PROFIEL, inkomen: '2500-3250', wonen: 'koop-met-hypotheek' }, herkomst: { inkomen: 'afgeleid', wonen: 'zelf' } }),
    )
    fireEvent.click(opslaan)
    await flush()
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({ wonen: 'koop-met-hypotheek' })
    expect(screen.getByText(/Opgeslagen/)).toBeTruthy()

    fetchMock.mockResolvedValueOnce(jsonRes({ status: 'niets-nieuws' }))
    fireEvent.click(knop('Nu vernieuwen'))
    await flush()
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/krant/tijdlijn/vernieuwen')
    expect((fetchMock.mock.calls[1]![1] as RequestInit).method).toBe('POST')
    expect(screen.getByText(/geen nieuw bericht/)).toBeTruthy()
  })

  it('te snel vernieuwd (429) → de melding van de route', async () => {
    render(<NieuwsprofielScherm start={LEEG_PROFIEL} herkomst={{}} />)
    fetchMock.mockResolvedValueOnce(jsonRes({ error: 'Je hebt net vernieuwd. Probeer het over een paar minuten opnieuw.', code: 'te_snel' }, 429))
    fireEvent.click(knop('Nu vernieuwen'))
    await flush()
    expect(screen.getByText(/Je hebt net vernieuwd/)).toBeTruthy()
  })
})

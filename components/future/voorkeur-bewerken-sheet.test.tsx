import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VoorkeurBewerkenSheet } from './voorkeur-bewerken-sheet'

const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

/**
 * De sheet schrijft via `PUT /api/parameters` — bewust NIET meer client-direct
 * naar `profiles`. Dat is de kern van deze suite: de servervalidatie (band
 * 0,01–0,15 voor expected_return) mag niet omzeild worden, en een DB-message
 * mag nooit rauw in de UI belanden.
 */
const mockFetch = vi.fn()

function okResponse() {
  return { ok: true, status: 200, json: async () => ({ success: true }) } as unknown as Response
}
function errorResponse(status: number, body: unknown) {
  return { ok: false, status, json: async () => body } as unknown as Response
}

beforeEach(() => {
  mockRefresh.mockReset()
  mockFetch.mockReset()
  mockFetch.mockResolvedValue(okResponse())
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderSheet(props: Partial<Parameters<typeof VoorkeurBewerkenSheet>[0]> = {}) {
  return render(
    <VoorkeurBewerkenSheet
      title="Inflatie"
      column="inflation_rate"
      currentValuePct={2.5}
      onClose={() => {}}
      {...props}
    />,
  )
}

/** De body waarmee de route is aangeroepen, als geparsed object. */
function lastRequestBody(): Record<string, unknown> {
  const [, init] = mockFetch.mock.calls.at(-1) as [string, RequestInit]
  return JSON.parse(String(init.body))
}

describe('VoorkeurBewerkenSheet — render', () => {
  it('rendert dialog met title in heading', () => {
    renderSheet()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getAllByText('Inflatie').length).toBeGreaterThan(0)
  })

  it('input pre-filled met currentValuePct', () => {
    renderSheet()
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    expect(input.value).toBe('2.5')
  })

  it('toont helperText wanneer aanwezig', () => {
    renderSheet({ helperText: 'NL-default 2.5% per jaar.' })
    expect(screen.getByText(/NL-default 2.5%/i)).toBeTruthy()
  })

  it('toont de secundaire uitgang alleen wanneer die is meegegeven', () => {
    const { unmount } = renderSheet()
    expect(screen.queryByRole('link')).toBeNull()
    unmount()

    renderSheet({
      secondaryLink: { href: '/toekomst/voorkeuren', label: 'Beheer al je aannames' },
    })
    const link = screen.getByRole('link', { name: 'Beheer al je aannames' })
    expect(link.getAttribute('href')).toBe('/toekomst/voorkeuren')
  })
})

describe('VoorkeurBewerkenSheet — submit', () => {
  it('schrijft via PUT /api/parameters met alleen het gewijzigde veld, als fractie (5% → 0.05)', async () => {
    const onClose = vi.fn()
    renderSheet({ column: 'expected_return', currentValuePct: 6, onClose })
    const input = document.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => expect(onClose).toHaveBeenCalled())

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/parameters')
    expect(init.method).toBe('PUT')
    // Partiële patch: uitsluitend de bewerkte kolom, als fractie.
    expect(lastRequestBody()).toEqual({ expected_return: 0.05 })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('stuurt voor inflatie de eigen kolom mee (2,5% → 0.025)', async () => {
    const onClose = vi.fn()
    renderSheet({ column: 'inflation_rate', currentValuePct: 2, onClose })
    const input = document.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '2.5' } })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(lastRequestBody()).toEqual({ inflation_rate: 0.025 })
  })

  it('schrijft NIET client-direct naar profiles — de route is het enige schrijfpad', async () => {
    const onClose = vi.fn()
    renderSheet({ column: 'expected_return', currentValuePct: 7, onClose })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    // Eén schrijfaanroep, en die gaat naar de API-route.
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toBe('/api/parameters')
  })

  it('toont fout-melding bij waarde buiten range', async () => {
    renderSheet({ minPct: 0, maxPct: 10 })
    const input = document.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.submit(document.querySelector('form')!)
    expect(screen.getByRole('alert').textContent).toMatch(/tussen 0%/i)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('toont fout bij waarde onder min', async () => {
    renderSheet({ minPct: 1, maxPct: 10 })
    const input = document.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.submit(document.querySelector('form')!)
    expect(screen.getByRole('alert').textContent).toMatch(/tussen 1%/i)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

/**
 * Het validatiegat dat deze wijziging dicht: client-direct schrijven omzeilde de
 * servervalidatie, en `profiles.expected_return` heeft geen CHECK-constraint.
 * De client-check is nu snelle feedback op de servernorm; de server blijft de
 * norm die telt.
 */
describe('VoorkeurBewerkenSheet — de band volgt de servernorm', () => {
  it('weigert 500% rendement zonder prop-grenzen (default = de API-band 1–15%)', () => {
    renderSheet({ column: 'expected_return', currentValuePct: 7 })
    const input = document.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '500' } })
    fireEvent.submit(document.querySelector('form')!)

    expect(screen.getByRole('alert').textContent).toMatch(/tussen 1% en 15%/i)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('hanteert voor inflatie de eigen API-band (0–8%), niet de oude generieke 15%', () => {
    renderSheet({ column: 'inflation_rate', currentValuePct: 2.5 })
    const input = document.querySelector('input[type="number"]')!
    fireEvent.change(input, { target: { value: '12' } })
    fireEvent.submit(document.querySelector('form')!)

    expect(screen.getByRole('alert').textContent).toMatch(/tussen 0% en 8%/i)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('VoorkeurBewerkenSheet — serverfouten', () => {
  it('toont de platte envelope-tekst van de route en sluit niet', async () => {
    const onClose = vi.fn()
    renderSheet({ column: 'expected_return', currentValuePct: 7, onClose })
    mockFetch.mockResolvedValueOnce(
      errorResponse(400, { error: 'Verwacht rendement moet tussen 1% en 15% liggen' }),
    )
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Verwacht rendement moet tussen 1% en 15% liggen',
      ),
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('toont geen rauwe DB-message wanneer de route een generieke 500 geeft', async () => {
    renderSheet({ column: 'expected_return', currentValuePct: 7 })
    mockFetch.mockResolvedValueOnce(errorResponse(500, { error: 'Fout bij opslaan parameters' }))
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    const text = screen.getByRole('alert').textContent ?? ''
    expect(text).toContain('Fout bij opslaan parameters')
    // Geen Postgres/PostgREST-detail in de UI.
    expect(text).not.toMatch(/violates|constraint|column|PGRST|relation/i)
  })

  it('vangt een netwerkfout af met een client-veilige tekst', async () => {
    renderSheet({ column: 'expected_return', currentValuePct: 7 })
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'))
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByRole('alert').textContent).toMatch(/verbinding/i)
    expect(screen.getByRole('alert').textContent).not.toContain('Failed to fetch')
  })
})

describe('VoorkeurBewerkenSheet — sluiten', () => {
  it('Annuleer-knop roept onClose', () => {
    const onClose = vi.fn()
    renderSheet({ onClose })
    fireEvent.click(screen.getByText('Annuleer'))
    expect(onClose).toHaveBeenCalled()
  })

  it('X-knop roept onClose', () => {
    const onClose = vi.fn()
    renderSheet({ onClose })
    fireEvent.click(screen.getByLabelText('Sluiten'))
    expect(onClose).toHaveBeenCalled()
  })
})

/**
 * Het beheerscherm voor waardestromen (ADR 0147 fase 2). Vastgelegd: wat er
 * geladen wordt, dat een nieuwe stroom zijn id bij het aanmaken uit de naam
 * krijgt, de vorm van de PUT-body, en de signalen onder de kaarten.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { WaardestromenEditor } from './waardestromen-editor'

interface Aanroep {
  url: string
  method: string
  body: Record<string, unknown> | null
}
let aanroepen: Aanroep[]

function json(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

const TWEE_STROMEN = {
  stromen: [
    { id: 'vermogen', naam: 'Vermogen', modules: ['overzicht', 'bezittingen'] },
    { id: 'toekomst', naam: 'Toekomst', modules: ['toekomst'] },
  ],
}

function stubFetch({ gebruik = [{ module: 'toekomst', gebruikers: 17 }] as unknown } = {}) {
  aanroepen = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null
      aanroepen.push({ url: String(url), method, body })
      if (method === 'GET') return json({ waardestromen: structuredClone(TWEE_STROMEN), gebruik })
      if (method === 'PUT') return json({ success: true, waardestromen: body })
      return json({ error: 'onverwacht' }, 500)
    }),
  )
}

beforeEach(() => stubFetch())
afterEach(() => vi.unstubAllGlobals())

const laatstePut = () => aanroepen.filter((a) => a.method === 'PUT').at(-1)

describe('WaardestromenEditor', () => {
  it('laadt de stromen met het gebruik per app-deel', async () => {
    render(<WaardestromenEditor />)
    const toekomst = await screen.findByRole('group', { name: 'Stroom 2' })
    expect(aanroepen[0]).toMatchObject({ url: '/api/admin/waardestromen', method: 'GET' })
    expect(within(toekomst).getByDisplayValue('Toekomst')).toBeInTheDocument()
    expect(within(toekomst).getByRole('checkbox', { name: /^Toekomst/ })).toBeChecked()
    expect(within(toekomst).getByText('17 gebruikers')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Waardestromen' })).toBeInTheDocument()
  })

  it('zonder meting: "nog niet gemeten"', async () => {
    stubFetch({ gebruik: null })
    render(<WaardestromenEditor />)
    await screen.findByRole('group', { name: 'Stroom 1' })
    expect(screen.getAllByText(/nog niet gemeten/)).toHaveLength(2)
    expect(screen.queryByText(/gebruikers$/)).not.toBeInTheDocument()
  })

  it('module aanvinken en opslaan stuurt de volledige lijst', async () => {
    render(<WaardestromenEditor />)
    const toekomst = await screen.findByRole('group', { name: 'Stroom 2' })
    fireEvent.click(within(toekomst).getByRole('checkbox', { name: /^Fin \(chat\)/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(laatstePut()).toBeTruthy())
    expect(laatstePut()).toMatchObject({
      url: '/api/admin/waardestromen',
      body: {
        stromen: [
          { id: 'vermogen', naam: 'Vermogen', modules: ['overzicht', 'bezittingen'] },
          { id: 'toekomst', naam: 'Toekomst', modules: ['toekomst', 'fin'] },
        ],
      },
    })
    expect(await screen.findByText('Opgeslagen')).toBeInTheDocument()
  })

  it('een nieuwe stroom krijgt een id uit de naam', async () => {
    render(<WaardestromenEditor />)
    await screen.findByRole('group', { name: 'Stroom 1' })
    fireEvent.change(screen.getByLabelText('Naam van de nieuwe stroom'), {
      target: { value: 'Budget & sparen' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Stroom' }))

    const nieuw = screen.getByRole('group', { name: 'Stroom 3' })
    expect(within(nieuw).getByText('id: budget-sparen')).toBeInTheDocument()
    fireEvent.click(within(nieuw).getByRole('checkbox', { name: /^Budget en transacties/ }))

    // Hernoemen verandert de id niet.
    fireEvent.change(within(nieuw).getByLabelText('Naam van stroom 3'), { target: { value: 'Budget' } })
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))

    await waitFor(() => expect(laatstePut()).toBeTruthy())
    const stromen = (laatstePut()!.body as { stromen: Array<{ id: string; naam: string }> }).stromen
    expect(stromen[2]).toEqual({ id: 'budget-sparen', naam: 'Budget', modules: ['budget'] })
  })

  it('een stroom zonder app-deel wordt niet opgeslagen', async () => {
    render(<WaardestromenEditor />)
    await screen.findByRole('group', { name: 'Stroom 1' })
    fireEvent.change(screen.getByLabelText('Naam van de nieuwe stroom'), { target: { value: 'Leeg' } })
    fireEvent.click(screen.getByRole('button', { name: 'Stroom' }))
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Kies minstens één app-deel voor Leeg')
    expect(laatstePut()).toBeUndefined()
  })

  it('signaleert app-delen die nergens meetellen en dubbel tellen', async () => {
    render(<WaardestromenEditor />)
    const signalen = await screen.findByRole('region', { name: 'Signalen' })
    expect(signalen).toHaveTextContent(/Telt nergens mee:.*Schulden/)
    expect(signalen).not.toHaveTextContent('In meer dan één stroom')

    const vermogen = screen.getByRole('group', { name: 'Stroom 1' })
    fireEvent.click(within(vermogen).getByRole('checkbox', { name: /^Toekomst/ }))
    expect(screen.getByRole('region', { name: 'Signalen' })).toHaveTextContent(
      'In meer dan één stroom: Toekomst (Vermogen, Toekomst)',
    )
  })

  it('verwijderen gaat via een bevestiging', async () => {
    render(<WaardestromenEditor />)
    await screen.findByRole('group', { name: 'Stroom 2' })
    fireEvent.click(screen.getByRole('button', { name: 'Stroom Toekomst verwijderen' }))

    expect(await screen.findByText(/matchen daarna niemand meer/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Verwijderen' }))

    await waitFor(() => expect(screen.queryByRole('group', { name: 'Stroom 2' })).not.toBeInTheDocument())
  })

  it('standaard terugzetten vraagt eerst bevestiging en laadt dan de vier standaardstromen', async () => {
    render(<WaardestromenEditor />)
    await screen.findByRole('group', { name: 'Stroom 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Standaard terugzetten' }))
    // Eerst de bevestiging: terugzetten laat regels op eigen stromen dood achter.
    expect(await screen.findByText('Standaardindeling terugzetten?')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Stroom 4' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Terugzetten' }))
    expect(await screen.findByRole('group', { name: 'Stroom 4' })).toBeInTheDocument()
    expect(screen.getByText('4 van 6 stromen')).toBeInTheDocument()
  })
})

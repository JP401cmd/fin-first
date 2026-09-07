/**
 * BudgetCashSources — de rekeningkeuze op /overzicht/budget/instellingen (W-002).
 *
 * Drie dingen die stil kapot kunnen en die deze suite daarom hard pint:
 *
 *  1. **HET SCHRIJFPAD.** De keuze MOET langs `POST /api/assets/toggle-budget`.
 *     Aan die route hangt `setBudgetTracking`, en dus het drieluik asset-vlag →
 *     `bank_accounts`-companion → module-gate `profiles.budgeting_active`. Een
 *     "verbetering" die straks rechtstreeks de kolom zet, of die
 *     `POST /api/budgetteren/setup` hergebruikt (die zet álle cash-assets op
 *     false en verwijdert budgetten), ziet er op het scherm identiek uit. Daarom
 *     asserteren we de URL én de body, niet alleen "er is gefetcht".
 *
 *  2. **DE LAATSTE REKENING.** Zonder budgetrekening valt de hele module om.
 *     Het uitzetten van de laatste loopt langs een bevestiging — en tot die
 *     bevestiging mag er NIETS geschreven zijn. Een test die alleen de dialoog
 *     zou tellen laat een optimistische schrijfactie erdoor.
 *
 *  3. **DE TERUGROL.** Faalt de schrijfactie, dan moet het vinkje terug naar de
 *     oude stand. Een optimistische UI die niet terugrolt liegt tegen de
 *     gebruiker over wat er is opgeslagen.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { BudgetCashSources } from './budget-cash-sources'
import type { BudgetCashSource } from '@/lib/budget-cash-sources'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

const fetchMock = vi.fn()

beforeEach(() => {
  refresh.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const BETAAL: BudgetCashSource = {
  id: 'a1',
  name: 'Betaalrekening ABN',
  typeLabel: 'Betaalrekening',
  tracked: true,
}
const SPAAR: BudgetCashSource = {
  id: 'a2',
  name: 'Spaarpot ING',
  typeLabel: 'Spaarrekening',
  tracked: false,
}
const TWEEDE_BETAAL: BudgetCashSource = {
  id: 'a3',
  name: 'Betaalrekening Bunq',
  typeLabel: 'Betaalrekening',
  tracked: true,
}

function boxFor(name: string): HTMLInputElement {
  const label = screen.getByText(name).closest('label')
  if (!label) throw new Error(`Geen rij voor ${name}`)
  const input = label.querySelector('input[type="checkbox"]')
  if (!input) throw new Error(`Geen vinkje voor ${name}`)
  return input as HTMLInputElement
}

describe('BudgetCashSources — weergave', () => {
  it('toont elke rekening met haar type en de huidige stand van het vinkje', () => {
    render(<BudgetCashSources sources={[BETAAL, SPAAR]} />)

    expect(boxFor('Betaalrekening ABN').checked).toBe(true)
    expect(boxFor('Spaarpot ING').checked).toBe(false)
    // Het type identificeert de rekening; er staat bewust GEEN saldo (een kaal
    // significant bedrag zonder zijn vrijheidstijd-equivalent).
    expect(screen.getAllByText('Betaalrekening').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/€/)
  })

  it('zonder rekeningen wijst hij naar bezittingen in plaats van een lege lijst', () => {
    const { container } = render(<BudgetCashSources sources={[]} />)
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(0)
    expect(container.querySelector('a[href="/overzicht/bezittingen/cash"]')).toBeTruthy()
  })
})

describe('BudgetCashSources — schrijft via het canonieke pad', () => {
  it('aanzetten POST naar /api/assets/toggle-budget met { id, enabled: true }', async () => {
    render(<BudgetCashSources sources={[BETAAL, SPAAR]} />)

    fireEvent.click(boxFor('Spaarpot ING'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/assets/toggle-budget')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ id: 'a2', enabled: true })
    // De module-gate kan gedraaid zijn; de server-loaders eromheen moeten dat zien.
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('uitzetten van een NIET-laatste rekening gaat direct, zonder bevestiging', async () => {
    render(<BudgetCashSources sources={[BETAAL, TWEEDE_BETAAL]} />)

    fireEvent.click(boxFor('Betaalrekening Bunq'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ id: 'a3', enabled: false })
    expect(screen.queryByText('Dit is je laatste rekening')).toBeNull()
  })
})

describe('BudgetCashSources — de laatste rekening', () => {
  it('vraagt eerst om bevestiging en schrijft dan NOG NIETS', async () => {
    render(<BudgetCashSources sources={[BETAAL, SPAAR]} />)

    fireEvent.click(boxFor('Betaalrekening ABN'))

    expect(await screen.findByText('Dit is je laatste rekening')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    // Het vinkje staat ook nog gewoon aan — geen optimistische voorsprong.
    expect(boxFor('Betaalrekening ABN').checked).toBe(true)
  })

  it('na bevestigen gaat de schrijfactie alsnog langs dezelfde route', async () => {
    render(<BudgetCashSources sources={[BETAAL, SPAAR]} />)

    fireEvent.click(boxFor('Betaalrekening ABN'))
    fireEvent.click(await screen.findByRole('button', { name: 'Ja, uitzetten' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/assets/toggle-budget')
    expect(JSON.parse(init.body)).toEqual({ id: 'a1', enabled: false })
  })

  it('annuleren laat de rekening aan staan en schrijft niets', async () => {
    render(<BudgetCashSources sources={[BETAAL, SPAAR]} />)

    fireEvent.click(boxFor('Betaalrekening ABN'))
    fireEvent.click(await screen.findByRole('button', { name: 'Laat aan staan' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(boxFor('Betaalrekening ABN').checked).toBe(true)
  })
})

describe('BudgetCashSources — mislukte schrijfactie', () => {
  it('rolt het vinkje terug en zegt dat er niets is opgeslagen', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Er ging iets mis' }) })
    render(<BudgetCashSources sources={[BETAAL, SPAAR]} />)

    fireEvent.click(boxFor('Spaarpot ING'))

    await waitFor(() => expect(boxFor('Spaarpot ING').checked).toBe(false))
    expect(screen.getByText(/Je keuze staat weer zoals hij was/)).toBeTruthy()
    // Geen rauwe server-tekst op het scherm.
    expect(document.body.textContent).not.toContain('Er ging iets mis')
  })
})

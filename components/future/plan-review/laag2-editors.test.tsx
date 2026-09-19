import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import type { PlanReviewLaag2Context } from '@/lib/plan-review/editor-context'

/**
 * TPR-15 laag 2 "Voor wie wil" inline. Gepind:
 *  - inflatie, bruto rendement en Box 3 renderen de BESTAANDE bodies (één body, twee hosts),
 *    met een h5-kop en een live effect via de `parameters`-override;
 *  - rendement per bezitting: alleen eigen bezittingen, band per type met de tekst van het
 *    formulier, "Opslaan" dicht bij ongeldige invoer, PATCH op de smalle route, live effect via
 *    `assetExpectedReturns`; afschrijvend bezit is niet in te stellen;
 *  - zonder wijziging geen effect in de footer en `changed: false`;
 *  - het bruto rendement zegt eerlijk dat het niets doet als elke bezitting een eigen rendement heeft.
 */

const overrides = vi.hoisted(() => ({ lijst: [] as unknown[] }))
vi.mock('@/lib/future/regel-sim', () => ({
  runRegelProjection: (_s: unknown, override?: Record<string, unknown>) => {
    if (override) overrides.lijst.push(override)
    return { rows: [], fireAgeFractional: override ? 49 : 50 }
  },
}))

import { PLAN_REVIEW_LAAG2_EDITORS, laag2Waarde } from './laag2-editors'
import { PLAN_REVIEW_LAAG2_ONDERDELEN, type PlanReviewLaag2Onderdeel } from '@/lib/plan-review/types'

const ETF = { id: '11111111-1111-4111-8111-111111111111', name: 'ETF', asset_type: 'investment' as const, expected_return: 6, afschrijvend: false }
const SPAAR = { id: '22222222-2222-4222-8222-222222222222', name: 'Spaarrekening', asset_type: 'savings' as const, expected_return: 2.5, afschrijvend: false }
const AUTO = { id: '33333333-3333-4333-8333-333333333333', name: 'Auto', asset_type: 'vehicle' as const, expected_return: 0, afschrijvend: true }

function laag2(over: Partial<PlanReviewLaag2Context> = {}): PlanReviewLaag2Context {
  return {
    inflationRate: 0.02,
    terugvalRendement: 0.07,
    box3Method: 'forfaitair',
    box3HeffingvrijInkomen: null,
    bezittingen: [ETF, SPAAR, AUTO],
    zonderEigenRendement: 0,
    ...over,
  }
}

let actions: RegelEditActionsState | null
const onSaved = vi.fn()
const fetchMock = vi.fn()

function renderOnderdeel(onderdeel: PlanReviewLaag2Onderdeel, ctx = laag2()) {
  const Editor = PLAN_REVIEW_LAAG2_EDITORS[onderdeel]
  render(<Editor laag2={ctx} snapshot={{ rawContext: {} } as never} onActionsChange={(s) => (actions = s)} onSaved={onSaved} />)
}

beforeEach(() => {
  actions = null
  overrides.lijst = []
  onSaved.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('laag 2 — register en huidige waarden', () => {
  it('elk onderdeel heeft een editor', () => {
    for (const o of PLAN_REVIEW_LAAG2_ONDERDELEN) expect(PLAN_REVIEW_LAAG2_EDITORS[o]).toBeTypeOf('function')
  })

  it('toont de waarden zoals de kern rekent', () => {
    expect(laag2Waarde('inflatie', laag2())).toBe('2,0% per jaar')
    expect(laag2Waarde('bruto-rendement', laag2({ terugvalRendement: 0.065 }))).toBe('6,5% per jaar')
    expect(laag2Waarde('box3', laag2())).toBe('Forfaitair')
    expect(laag2Waarde('box3', laag2({ box3Method: 'werkelijk' }))).toMatch(/1\.800 heffingvrij$/)
    // Afschrijvend bezit telt niet mee: dat is hier niet in te stellen.
    expect(laag2Waarde('rendement-bezitting', laag2())).toBe('2 bezittingen')
    expect(laag2Waarde('rendement-bezitting', laag2({ bezittingen: [AUTO] }))).toBe('Geen bezittingen om in te stellen')
  })
})

describe('laag 2 — inflatie (VoorkeurBewerkenBody)', () => {
  it('ongewijzigd: niets gewijzigd en geen effect in de footer', () => {
    renderOnderdeel('inflatie')
    expect(screen.getByRole('heading', { level: 5, name: 'Inflatie' })).toBeInTheDocument()
    expect(actions?.changed).toBe(false)
    expect(actions?.footerInfo).toBeUndefined()
  })

  it('een geldige wijziging: live effect met de parameters-override en PUT als fractie', async () => {
    renderOnderdeel('inflatie')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
    await waitFor(() => expect(actions?.changed).toBe(true))
    expect(overrides.lijst).toContainEqual({ parameters: { inflation_rate: 0.03 } })
    expect(actions?.footerInfo).toBeDefined()
    await act(async () => actions!.save())
    expect(fetchMock).toHaveBeenCalledWith('/api/parameters', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ inflation_rate: 0.03 }) }))
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('Enter zonder wijziging schrijft niets (review M1: geen jaarlaag-default vastleggen)', async () => {
    renderOnderdeel('inflatie')
    fireEvent.submit(screen.getByRole('spinbutton').closest('form')!)
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('buiten de band: Opslaan dicht met een Nederlandse tekst bij het veld', async () => {
    renderOnderdeel('inflatie')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '12' } })
    expect(await screen.findByText('Vul een waarde tussen 0% en 8% in.')).toBeInTheDocument()
    expect(actions?.canSave).toBe(false)
    expect(screen.getByRole('spinbutton')).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('laag 2 — bruto rendement', () => {
  it('zegt dat het getal nu niets doet als elke bezitting een eigen rendement heeft', () => {
    renderOnderdeel('bruto-rendement')
    expect(screen.getByText(/Dit getal verandert je plan nu dus niet/)).toBeInTheDocument()
    cleanup()
    renderOnderdeel('bruto-rendement', laag2({ zonderEigenRendement: 1 }))
    expect(screen.queryByText(/Dit getal verandert je plan nu dus niet/)).not.toBeInTheDocument()
  })
})

describe('laag 2 — Box 3 (Box3MethodeBody)', () => {
  it('een andere methode: live effect met de parameters-override, PUT alleen de methode', async () => {
    renderOnderdeel('box3')
    expect(screen.getByRole('heading', { level: 5, name: 'Box 3-methode' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Werkelijk rendement/ }))
    await waitFor(() => expect(actions?.changed).toBe(true))
    expect(overrides.lijst).toContainEqual({ parameters: { box3_method: 'werkelijk', box3_heffingvrij_inkomen: null } })
    await act(async () => actions!.save())
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body).toEqual({ box3_method: 'werkelijk' })
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('ongeldig heffingvrij inkomen: Opslaan dicht', async () => {
    renderOnderdeel('box3', laag2({ box3Method: 'werkelijk' }))
    fireEvent.change(screen.getByLabelText('Heffingvrij inkomen in euro per persoon per jaar'), { target: { value: '-5' } })
    await waitFor(() => expect(actions?.canSave).toBe(false))
  })
})

describe('laag 2 — rendement per bezitting', () => {
  it('kiest per eigen bezitting; spaargeld heet "Rente", zoals in het formulier', () => {
    renderOnderdeel('rendement-bezitting')
    expect(screen.getByRole('button', { name: 'ETF' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Rendement per jaar (%)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Spaarrekening' }))
    expect(screen.getByText('Rente per jaar (%)')).toBeInTheDocument()
    expect(actions?.changed).toBe(false)
  })

  it('een wijziging: live effect met assetExpectedReturns en PATCH op de smalle route', async () => {
    renderOnderdeel('rendement-bezitting')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5.5' } })
    await waitFor(() => expect(actions?.changed).toBe(true))
    expect(overrides.lijst).toContainEqual({ assetExpectedReturns: { [ETF.id]: 5.5 } })
    await act(async () => actions!.save())
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${ETF.id}/expected-return`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ expected_return: 5.5 }) }),
    )
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('buiten de band van het type: Opslaan dicht, met de band van het formulier en de veldnaam die er staat', async () => {
    renderOnderdeel('rendement-bezitting')
    fireEvent.click(screen.getByRole('button', { name: 'Spaarrekening' }))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-1' } })
    expect(await screen.findByText('Rente moet tussen 0% en 15% per jaar liggen.')).toBeInTheDocument()
    expect(actions?.canSave).toBe(false)
  })

  it('tijdens een save zijn de andere bezittingen dicht (review M2)', async () => {
    let klaar: (v: unknown) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise((r) => (klaar = r)))
    renderOnderdeel('rendement-bezitting')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } })
    await waitFor(() => expect(actions?.changed).toBe(true))
    act(() => actions!.save())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Spaarrekening' })).toBeDisabled())
    await act(async () => klaar({ ok: true, json: async () => ({}) }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Spaarrekening' })).toBeEnabled())
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('"Standaard van de app" vult het type-default in', async () => {
    renderOnderdeel('rendement-bezitting')
    fireEvent.click(screen.getByRole('button', { name: /Standaard van de app voor dit soort bezit/ }))
    expect(screen.getByRole('spinbutton')).toHaveValue(7)
    await waitFor(() => expect(actions?.changed).toBe(true))
  })

  // ADR 0166 — "geen eigen rendement" is een EXPLICIETE keuze, en de wizard
  // rekent er niet zelf een profielrendement voor uit: hij stuurt `null` de kern
  // in en laat `potRendement` de terugval doen (consume, don't recompute).
  it('"geen eigen rendement": live effect met null en PATCH met null', async () => {
    renderOnderdeel('rendement-bezitting')
    fireEvent.click(screen.getByRole('checkbox', { name: /Geen eigen rendement/ }))
    await waitFor(() => expect(actions?.changed).toBe(true))
    // NIET `{ [ETF.id]: 7 }` — zou de wizard hier zelf het profielrendement
    // invullen, dan wijkt het live effect af van het bewaarde plan zodra die
    // twee grondslagen uiteenlopen.
    expect(overrides.lijst).toContainEqual({ assetExpectedReturns: { [ETF.id]: null } })
    await act(async () => actions!.save())
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/assets/${ETF.id}/expected-return`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ expected_return: null }) }),
    )
  })

  it('"geen eigen rendement" zet het getalveld uit en de bandfout verdwijnt', async () => {
    renderOnderdeel('rendement-bezitting')
    fireEvent.click(screen.getByRole('button', { name: 'Spaarrekening' }))
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '-1' } })
    expect(await screen.findByText('Rente moet tussen 0% en 15% per jaar liggen.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Geen eigen rendement/ }))
    // Er valt niets meer te begrenzen: opslaan mag weer, met `null`.
    await waitFor(() => expect(actions?.canSave).toBe(true))
    expect(screen.getByRole('spinbutton')).toBeDisabled()
    expect(screen.queryByText('Rente moet tussen 0% en 15% per jaar liggen.')).not.toBeInTheDocument()
  })

  it('een bezitting die al op null staat opent mét het vinkje aan en meldt niets gewijzigd', () => {
    const ZONDER = { ...ETF, expected_return: null }
    renderOnderdeel('rendement-bezitting', laag2({ bezittingen: [ZONDER], zonderEigenRendement: 1 }))
    expect(screen.getByRole('checkbox', { name: /Geen eigen rendement/ })).toBeChecked()
    // Openen is geen wijziging — anders zou de wizard bij elk bezoek een
    // schrijfactie aanbieden die niets verandert.
    expect(actions?.changed).toBe(false)
  })

  it('afschrijvend bezit: uitleg, niets op te slaan', () => {
    renderOnderdeel('rendement-bezitting')
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }))
    expect(screen.getByText(/schrijft af/)).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(actions?.canSave).toBe(false)
  })

  it('een serverfout: foutregel, geen onSaved', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Bezitting niet gevonden' }) })
    renderOnderdeel('rendement-bezitting')
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } })
    await waitFor(() => expect(actions?.changed).toBe(true))
    await act(async () => actions!.save())
    expect(await screen.findByRole('alert')).toHaveTextContent('Bezitting niet gevonden')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('zonder eigen bezittingen: uitleg en niets op te slaan', () => {
    renderOnderdeel('rendement-bezitting', laag2({ bezittingen: [] }))
    expect(screen.getByText(/geen eigen bezittingen/)).toBeInTheDocument()
    expect(actions?.canSave).toBe(false)
  })
})

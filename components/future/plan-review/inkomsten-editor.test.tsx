import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import type { PlanReviewEditorContext, PlanReviewInkomstenContext } from '@/lib/plan-review/editor-context'
import type { LifeEvent } from '@/lib/horizon-data'
import type { RegelSimOverride } from '@/lib/future/regel-sim'

/**
 * TPR-15 stap 3 inline. Gepind:
 *  - AOW, werk, elke eigen pot en een nieuwe pot zijn apart te kiezen, met dezelfde bodies als
 *    /toekomst/gebeurtenissen;
 *  - zonder eigen AOW-rij is het formulier vooringevuld (alleenstaand, 0 jaar) en telt het als
 *    wijziging; opslaan schrijft via `PUT /api/life-events/strategie` en meldt `aowGeschreven`;
 *  - het live effect is de kern-run met alleen die rij vervangen (`lifeEvent`-override);
 *  - ongewijzigd werk = niets op te slaan; een nieuwe pot wel;
 *  - ongeldige invoer houdt "Opslaan" dicht, met uitleg.
 */

const runs = vi.hoisted(() => ({ overrides: [] as (RegelSimOverride | undefined)[] }))
vi.mock('@/lib/future/regel-sim', async (orig) => {
  const echt = await orig<typeof import('@/lib/future/regel-sim')>()
  return {
    ...echt,
    runRegelProjection: (_s: unknown, override?: RegelSimOverride) => {
      runs.overrides.push(override)
      return { rows: [], fireAgeFractional: override?.lifeEvent ? 52 : 50 }
    },
  }
})

import { InkomstenEditor } from './inkomsten-editor'

const DOB = '1985-06-01'
const POT: LifeEvent = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'ABP',
  event_type: 'pension',
  target_age: 68,
  target_date: null,
  one_time_cost: 0,
  monthly_cost_change: 0,
  monthly_income_change: 900,
  duration_months: 0,
  icon: 'Landmark',
  is_active: true,
  sort_order: 1001,
  is_indexed: false,
  metadata: { pensioenType: 'bedrijf', ingangLeeftijd: 68, brutoBedrag: 900, uitkeringsduur: 'levenslang', mijnpensioenBron: 'abp' },
}
const AOW_RIJ: LifeEvent = {
  ...POT,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'AOW',
  event_type: 'aow',
  target_age: 68,
  metadata: { leefsituatie: 'samenwonend', jarenBuitenNL: 2 },
}

function inkomsten(over: Partial<PlanReviewInkomstenContext> = {}): PlanReviewInkomstenContext {
  return {
    aow: null,
    werk: null,
    pensioenen: [POT],
    aowRows: [],
    basis: { dateOfBirth: DOB, currentAge: 41, currentNetMonthly: 3200, dailyExpenses: 80 },
    ...over,
  }
}

let actions: RegelEditActionsState | null
const onSaved = vi.fn()
const fetchMock = vi.fn()

function renderEditor(i: PlanReviewInkomstenContext | null = inkomsten()) {
  const context: PlanReviewEditorContext = {
    snapshot: { rawContext: { lifeEvents: [] } } as never,
    firePlan: null,
    potRules: null,
    potBalances: null,
    woning: null,
    inkomsten: i,
    laag2: null,
  }
  render(<InkomstenEditor context={context} onActionsChange={(s) => (actions = s)} onSaved={onSaved} />)
}

beforeEach(() => {
  actions = null
  runs.overrides = []
  onSaved.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'nieuw-id' }) })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const putBody = () => JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as Record<string, unknown>

describe('InkomstenEditor (plan-review stap 3)', () => {
  it('toont AOW, Werk, elke eigen pot en een nieuwe pot; opent op AOW', () => {
    renderEditor()
    expect(screen.getByRole('button', { name: 'AOW' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Werk' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ABP' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nieuwe pensioenpot' })).toBeInTheDocument()
  })

  it('zonder eigen AOW: vooringevuld, telt als wijziging, en opslaan maakt hem aan via de route', async () => {
    renderEditor()
    await waitFor(() => expect(actions?.changed).toBe(true))
    expect(actions?.canSave).toBe(true)
    await act(async () => actions!.save())
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/life-events/strategie')
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe('PUT')
    expect(putBody()).toMatchObject({ event_type: 'aow', leefsituatie: 'alleenstaand', jarenBuitenNL: 0 })
    expect(onSaved).toHaveBeenCalledWith({ aowGeschreven: true })
  })

  it('met eigen AOW: ongewijzigd = niets op te slaan; een andere leefsituatie wel', async () => {
    renderEditor(inkomsten({ aow: AOW_RIJ }))
    await waitFor(() => expect(actions?.changed).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Alleenstaand/ }))
    await waitFor(() => expect(actions?.changed).toBe(true))
  })

  it('live effect: de kern-run met alleen de AOW vervangen, als delta in de footer', async () => {
    renderEditor()
    await waitFor(() => expect(actions?.footerInfo).toBeTruthy())
    const aowRun = runs.overrides.find((o) => o?.lifeEvent)
    expect(aowRun?.lifeEvent?.vervang).toEqual({ eventType: 'aow' })
    expect(aowRun?.lifeEvent?.event).toMatchObject({ event_type: 'aow', metadata: { leefsituatie: 'alleenstaand' } })
    render(<>{actions!.footerInfo}</>)
    expect(screen.getByText('24 mnd later')).toBeInTheDocument()
  })

  it('werk zonder rij: de vooringevulde stand is geen wijziging', async () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Werk' }))
    await waitFor(() => expect(actions?.changed).toBe(false))
  })

  it('bestaande pot: bewerken schrijft per id en meldt geen AOW', async () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'ABP' }))
    await waitFor(() => expect(actions?.changed).toBe(false))
    const bedrag = screen.getAllByRole('spinbutton').find((el) => (el as HTMLInputElement).value === '900')!
    fireEvent.change(bedrag, { target: { value: '950' } })
    await waitFor(() => expect(actions?.changed).toBe(true))
    await act(async () => actions!.save())
    expect(putBody()).toMatchObject({ event_type: 'pension', id: POT.id, pot: { brutoBedrag: 950 } })
    expect(onSaved).toHaveBeenCalledWith({ aowGeschreven: false })
  })

  it('nieuwe pot: begint op € 0 zonder wijziging (review M2); na een bedrag zonder id naar de route', async () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Nieuwe pensioenpot' }))
    await waitFor(() => expect(actions?.changed).toBe(false))
    expect(actions?.footerInfo).toBeUndefined()
    const bedrag = screen.getAllByRole('spinbutton').find((el) => (el as HTMLInputElement).value === '0')!
    fireEvent.change(bedrag, { target: { value: '400' } })
    await waitFor(() => expect(actions?.changed).toBe(true))
    await act(async () => actions!.save())
    expect(putBody()).toMatchObject({ event_type: 'pension', pot: { brutoBedrag: 400 } })
    expect(putBody()).not.toHaveProperty('id')
  })

  it('tijdens opslaan zijn de onderdelen niet te wisselen (review M1)', async () => {
    let klaar: (v: unknown) => void = () => {}
    fetchMock.mockReturnValue(new Promise((r) => (klaar = r)))
    renderEditor()
    await waitFor(() => expect(actions?.canSave).toBe(true))
    act(() => actions!.save())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Werk' })).toBeDisabled())
    await act(async () => klaar({ ok: true, json: async () => ({ id: 'x' }) }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Werk' })).toBeEnabled())
  })

  it('ongeldige invoer: niet op te slaan, met uitleg', async () => {
    renderEditor()
    const jaren = screen.getAllByRole('spinbutton')[1]!
    fireEvent.change(jaren, { target: { value: '60' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Jaren buiten Nederland')
    await waitFor(() => expect(actions?.canSave).toBe(false))
  })

  it('zonder context: melding en niets op te slaan', async () => {
    renderEditor(null)
    expect(screen.getByRole('alert')).toHaveTextContent('konden niet geladen worden')
    await waitFor(() => expect(actions?.canSave).toBe(false))
  })
})

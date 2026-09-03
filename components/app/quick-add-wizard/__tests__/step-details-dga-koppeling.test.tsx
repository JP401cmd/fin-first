/**
 * Regressie WF-SCHULD-20 sub c (bug3) — "Lening bij eigen BV" zonder deelneming.
 *
 * De QuickAdd-wizard toonde bij `debt_type='dga_schuld'` alleen Naam / Huidig
 * saldo / Rente / Aflossing: het veld "Gekoppelde deelneming*" bestond
 * uitsluitend in het volledige bewerkformulier. De Toevoegen-knop werd dus nooit
 * geblokkeerd en elke via dit pad aangemaakte DGA-schuld bleef structureel
 * ongekoppeld — terwijl de app zelf de invariant documenteert dat een
 * `dga_schuld` altijd aan een deelneming hangt.
 *
 * Deze suite pint drie dingen vast: het veld bestaat op het zelfstandige
 * schuld-pad, het blokkeert zolang er niets gekozen is, en de koppeling landt op
 * `linked_asset_id`. De vierde test bewaakt de bewuste uitzondering: in
 * collect-mode (onboarding) is er nog geen bezitting-rij om naar te wijzen, dus
 * daar blijft het veld weg.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StepDetails } from '../steps/step-details'
import type { DebtDraftState } from '../wizard-reducer'

const DEELNEMING = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Holding BV',
  asset_type: 'deelneming',
}

function mockLinkableAssets(assets: unknown[]) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ assets }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderDgaStep(
  overrides: Partial<DebtDraftState> = {},
  props: { requireLinkedAsset?: boolean } = {},
) {
  const onChange = vi.fn()
  const onSubmit = vi.fn()
  const draft: DebtDraftState = {
    debt_type: 'dga_schuld',
    name: 'RC-schuld aan BV',
    current_balance: 5000,
    ...overrides,
  }
  render(
    <StepDetails
      intent="debt"
      draft={draft}
      onChange={onChange}
      onSubmit={onSubmit}
      requireLinkedAsset={props.requireLinkedAsset ?? true}
    />,
  )
  return { onChange, onSubmit }
}

const toevoegen = () => screen.getByRole('button', { name: 'Toevoegen' })

beforeEach(() => {
  mockLinkableAssets([DEELNEMING])
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('QuickAdd stap 3 — DGA-schuld koppelt aan een deelneming', () => {
  it('toont het deelneming-veld met de eigen deelnemingen als opties', async () => {
    renderDgaStep()

    const select = await screen.findByLabelText(/Gekoppelde deelneming/)
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Holding BV' })).toBeTruthy(),
    )
    expect((select as HTMLSelectElement).value).toBe('')
  })

  it('blokkeert opslaan zolang er geen deelneming gekozen is', async () => {
    const { onSubmit } = renderDgaStep()

    await screen.findByLabelText(/Gekoppelde deelneming/)
    expect((toevoegen() as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(toevoegen())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('geeft de gekozen deelneming door als linked_asset_id', async () => {
    const { onChange } = renderDgaStep()

    const select = await screen.findByLabelText(/Gekoppelde deelneming/)
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Holding BV' })).toBeTruthy(),
    )
    fireEvent.change(select, { target: { value: DEELNEMING.id } })

    expect(onChange).toHaveBeenCalledWith({ linked_asset_id: DEELNEMING.id })
  })

  it('laat opslaan toe zodra de koppeling in de draft staat', async () => {
    const { onSubmit } = renderDgaStep({ linked_asset_id: DEELNEMING.id })

    await screen.findByLabelText(/Gekoppelde deelneming/)
    expect((toevoegen() as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(toevoegen())
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('collect-mode (onboarding): geen veld, geen blokkade — de koppeling volgt ná de batch-insert', () => {
    const { onSubmit } = renderDgaStep({}, { requireLinkedAsset: false })

    expect(screen.queryByLabelText(/Gekoppelde deelneming/)).toBeNull()
    fireEvent.click(toevoegen())
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

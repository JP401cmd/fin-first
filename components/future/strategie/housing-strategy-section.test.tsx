import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import type { RegelEditActionsState } from '@/components/future/regels/types'

/**
 * HousingStrategySection — twee hosts (TPR-15).
 *  - Zonder `onActionsChange` (Huis-strategie-modal): het bestaande gedrag, met eigen
 *    opslaanknop en succesmelding.
 *  - Met `onActionsChange` (plan-review stap 4): geen eigen knop; de sectie publiceert
 *    canSave/saving/changed en de host roept `save` aan, die dezelfde PUT doet.
 *  - Een preview uit alleen de rauwe kernel-context draait wanneer er een eigen huis is.
 */

const previewAanroepen = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/lib/housing-preview', () => ({
  runHousingScenarioPreview: () => {
    previewAanroepen.n += 1
    return { events: [], depletion: null, fireAgeFractional: 61.2, fireReachable: true }
  },
}))

import { HousingStrategySection } from './housing-strategy-section'

const fetchMock = vi.fn()

beforeEach(() => {
  previewAanroepen.n = 0
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return { ok: true, json: async () => ({}) }
    return {
      ok: true,
      json: async () => ({
        config: { mode: 'include_full' },
        context: { has_eigen_huis: true, eigen_huis_value: 400000, woz_value: 380000, mortgage_balance: 0, mortgage_monthly_payment: 0, estimated_equity: 400000 },
      }),
    }
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('HousingStrategySection', () => {
  it('zonder host: de eigen opslaanknop blijft, zonder preview-basis geen preview', async () => {
    render(<HousingStrategySection />)
    expect(await screen.findByRole('button', { name: 'Eigen-woning-strategie opslaan' })).toBeInTheDocument()
    expect(previewAanroepen.n).toBe(0)
  })

  it('met host: geen eigen knop; publiceert changed en slaat op via dezelfde route', async () => {
    let actions: RegelEditActionsState | null = null
    const onSaved = vi.fn()
    render(<HousingStrategySection showHeader={false} onActionsChange={(s) => (actions = s)} onSaved={onSaved} />)
    await waitFor(() => expect(actions?.canSave).toBe(true))
    expect(screen.queryByRole('button', { name: 'Eigen-woning-strategie opslaan' })).toBeNull()
    expect(actions!.changed).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /Uitsluiten/ }))
    await waitFor(() => expect(actions!.changed).toBe(true))

    await act(async () => actions!.save())
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(put?.[0]).toBe('/api/housing-strategy')
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ config: { mode: 'exclude_from_fire' } })
    expect(onSaved).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(actions!.changed).toBe(false))
    // De succesmelding hoort bij de eigen knop; in de wizard gaat de host door.
    expect(screen.queryByText('Eigen-woning-strategie opgeslagen.')).toBeNull()
  })

  it('met host: een fout van de route blijft zichtbaar', async () => {
    let actions: RegelEditActionsState | null = null
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'PUT'
        ? { ok: false, json: async () => ({ error: 'Opslaan mislukt' }) }
        : { ok: true, json: async () => ({ config: { mode: 'include_full' }, context: { has_eigen_huis: true } }) },
    )
    render(<HousingStrategySection onActionsChange={(s) => (actions = s)} />)
    await waitFor(() => expect(actions?.canSave).toBe(true))
    await act(async () => actions!.save())
    expect(screen.getByRole('alert')).toHaveTextContent('Opslaan mislukt')
  })

  it('preview uit alleen de rauwe kernel-context, bij een eigen huis', async () => {
    render(<HousingStrategySection kernelRawContext={{ profile: {} } as never} onActionsChange={() => {}} />)
    expect(await screen.findByText(/Live preview/)).toBeInTheDocument()
    expect(previewAanroepen.n).toBeGreaterThan(0)
  })
})

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import type { RegelEditActionsState } from '@/components/future/regels/types'
import type { PlanReviewEditorContext, PlanReviewWoningContext } from '@/lib/plan-review/editor-context'

/**
 * TPR-15 stap 4 inline. Gepind:
 *  - eigen woning en elk eigen vast bezit zijn apart te kiezen;
 *  - de woning rendert de BESTAANDE woonstrategie-sectie in host-modus, en zonder
 *    opgeslagen woonstrategie telt de getoonde standaard als wijziging (opslaan nodig);
 *  - een verkoopinstelling slaat op via de smalle PATCH-route, meldt
 *    `woonstrategieGeschreven: false`, en blijft dicht bij ongeldige invoer of een fout;
 *  - zonder eigen bezit is er niets op te slaan (knop wordt "Bevestigen").
 */

const huisProps = vi.hoisted(() => ({ laatste: null as Record<string, unknown> | null }))
vi.mock('@/components/future/strategie/housing-strategy-section', async () => {
  const React = await import('react')
  return {
    HousingStrategySection: (props: Record<string, unknown>) => {
      huisProps.laatste = props
      const publiceer = props.onActionsChange as (s: RegelEditActionsState) => void
      React.useEffect(() => {
        publiceer({ canSave: true, saving: false, save: () => (props.onSaved as () => void)(), changed: false })
      }, [publiceer])
      return React.createElement('p', null, 'Woonstrategie-sectie')
    },
  }
})

vi.mock('@/lib/future/regel-sim', () => ({
  runRegelProjection: (_s: unknown, override?: { assetSaleConfigs?: Record<string, { stand: string }> }) => {
    const stand = override?.assetSaleConfigs ? Object.values(override.assetSaleConfigs)[0]?.stand : null
    return { rows: [], fireAgeFractional: stand === 'niet_verkopen' ? 52 : 50 }
  },
}))

import { WoningEditor } from './woning-editor'

const AUTO = { id: '11111111-1111-4111-8111-111111111111', name: 'Auto', asset_type: 'vehicle' as const, current_value: 12000, sale_config: null }
const KUNST = { id: '22222222-2222-4222-8222-222222222222', name: 'Kunst', asset_type: 'physical' as const, current_value: 5000, sale_config: { stand: 'niet_verkopen' } }

function woning(over: Partial<PlanReviewWoningContext> = {}): PlanReviewWoningContext {
  return { heeftEigenHuis: true, woonstrategieIngesteld: false, vastBezit: [AUTO, KUNST], schulden: [], ...over }
}

let actions: RegelEditActionsState | null
const onSaved = vi.fn()
const fetchMock = vi.fn()

function renderEditor(w: PlanReviewWoningContext | null = woning()) {
  const context: PlanReviewEditorContext = {
    snapshot: { rawContext: { assets: [] } } as never,
    firePlan: null,
    potRules: null,
    potBalances: null,
    woning: w,
    inkomsten: null,
  }
  render(<WoningEditor context={context} onActionsChange={(s) => (actions = s)} onSaved={onSaved} />)
}

beforeEach(() => {
  actions = null
  huisProps.laatste = null
  onSaved.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('WoningEditor (plan-review stap 4)', () => {
  it('opent op de eigen woning, in host-modus met de snapshot-context', () => {
    renderEditor()
    expect(screen.getByRole('button', { name: 'Eigen woning' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Woonstrategie-sectie')).toBeInTheDocument()
    expect(huisProps.laatste?.showHeader).toBe(false)
    expect(huisProps.laatste?.kernelRawContext).toEqual({ assets: [] })
  })

  it('zonder opgeslagen woonstrategie telt de standaard als wijziging; mét niet', () => {
    renderEditor()
    expect(actions?.changed).toBe(true)
    cleanup()
    renderEditor(woning({ woonstrategieIngesteld: true }))
    expect(actions?.changed).toBe(false)
  })

  it('opslaan van de woonstrategie meldt woonstrategieGeschreven: true', () => {
    renderEditor()
    act(() => actions!.save())
    expect(onSaved).toHaveBeenCalledWith({ woonstrategieGeschreven: true })
  })

  it('een bezitting: de gedeelde velden, ongewijzigd = niets op te slaan', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }))
    expect(screen.getByRole('radio', { name: 'Automatisch bij behoefte' })).toBeChecked()
    expect(actions?.changed).toBe(false)
    expect(actions?.canSave).toBe(true)
  })

  it('verkoopinstelling opslaan: PATCH op de smalle route, dan onSaved zonder woonstrategie', async () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Niet verkopen' }))
    await waitFor(() => expect(actions?.changed).toBe(true))
    await act(async () => actions!.save())
    expect(fetchMock).toHaveBeenCalledWith(`/api/assets/${AUTO.id}/sale-config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sale_config: { stand: 'niet_verkopen' } }),
    })
    expect(onSaved).toHaveBeenCalledWith({ woonstrategieGeschreven: false })
  })

  it('live effect in de footer: de kern-run met alleen deze bezitting vervangen', async () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Niet verkopen' }))
    await waitFor(() => expect(actions?.footerInfo).toBeTruthy())
    render(<>{actions!.footerInfo}</>)
    expect(screen.getByText('24 mnd later')).toBeInTheDocument()
  })

  it('vast moment zonder leeftijd of datum: niet op te slaan, met uitleg', async () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Op een vast moment' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Vul een leeftijd of datum in')
    await waitFor(() => expect(actions?.canSave).toBe(false))
  })

  it('fout van de route: melding, geen onSaved', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Onbekende schuld bij aflossen' }) })
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Kunst' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Automatisch bij behoefte' }))
    await act(async () => actions!.save())
    expect(screen.getByRole('alert')).toHaveTextContent('Onbekende schuld bij aflossen')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('alleen vast bezit, geen huis: geen keuzeknoppen, direct de bezitting', () => {
    renderEditor(woning({ heeftEigenHuis: false, vastBezit: [AUTO] }))
    expect(screen.queryByRole('group', { name: 'Wat pas je aan' })).toBeNull()
    expect(screen.getByText('Auto')).toBeInTheDocument()
  })

  it('woning-gegevens niet geladen: zegt dat, zonder de lege-staat-tekst (review M3)', () => {
    renderEditor(null)
    expect(screen.getByRole('alert')).toHaveTextContent('konden niet geladen worden')
    expect(screen.queryByText(/geen eigen woning of eigen vast bezit/)).toBeNull()
  })

  it('een save die terugkomt ná een wissel van onderdeel bevestigt niets (review L1)', async () => {
    let klaar: (v: unknown) => void = () => {}
    fetchMock.mockImplementation(() => new Promise((r) => (klaar = r)))
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Auto' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Niet verkopen' }))
    await waitFor(() => expect(actions?.changed).toBe(true))
    act(() => actions!.save())
    fireEvent.click(screen.getByRole('button', { name: 'Kunst' }))
    await act(async () => klaar({ ok: true, json: async () => ({}) }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('niets eigens in te stellen: uitleg en niets op te slaan', () => {
    renderEditor(woning({ heeftEigenHuis: false, vastBezit: [] }))
    expect(screen.getByText(/geen eigen woning of eigen vast bezit/)).toBeInTheDocument()
    expect(actions).toMatchObject({ canSave: false, changed: false })
  })
})

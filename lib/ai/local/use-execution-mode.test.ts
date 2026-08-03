import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useExecutionMode, LOCAL_SUBSCRIPTION_REVOKED_MESSAGE } from './use-execution-mode'
import { checkLocalAiCapability } from './webgpu-capability'
import { getLocalModelState } from './model-manager'

/**
 * Tests voor het REVOCATIE-GAT op het lokale pad.
 *
 * De zuiver lokale paden (pensioen-PDF, aangifte-PDF, rekenhulp, vaste lasten,
 * categorisatie) doen tijdens het genereren nul server-calls: het model draait
 * on-device. Er is dus geen route waar een tier-gate alsnog aanslaat. Wie ooit
 * met geldig abonnement een groep op 'lokaal' zette, bleef daarna onbeperkt
 * genereren — ook lang nadat het abonnement was verlopen.
 *
 * Deze hook is nu de plek waar dat stopt. De twee eisen zitten in dezelfde
 * suite, want ze horen bij elkaar:
 *   1. een verlopen abonnement STOPT het lokale genereren ('blocked'),
 *   2. en sluit niemand op: er wordt niet stil naar de cloud uitgeweken, en de
 *      keuze terugzetten blijft vrij (dat laatste wordt op de route bewezen —
 *      zie app/api/ai-execution-prefs/route.test.ts).
 */

vi.mock('./webgpu-capability', () => ({ checkLocalAiCapability: vi.fn() }))
vi.mock('./model-manager', () => ({ getLocalModelState: vi.fn() }))

const mockedCapability = vi.mocked(checkLocalAiCapability)
const mockedModelState = vi.mocked(getLocalModelState)

/** Antwoord van GET /api/ai-execution-prefs, met de velden die de hook leest. */
function prefsResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  mockedCapability.mockResolvedValue({ ok: true, reasons: [] } as never)
  mockedModelState.mockResolvedValue({ state: 'klaar' } as never)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useExecutionMode — abonnement op het lokale pad', () => {
  it('VERLOPEN abonnement + groep op lokaal → blocked, en er mag niets draaien', async () => {
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { documenten: 'lokaal' }, hasAiSubscription: false }),
    )

    const { result } = renderHook(() => useExecutionMode('documenten'))

    await waitFor(() => expect(result.current.status).toBe('blocked'))
    // Niet lokaal genereren...
    expect(result.current.canUseLocal).toBe(false)
    // ...en ook geen stille uitwijk naar de cloud: die keuze is niet aan ons.
    expect(result.current.canUseCloud).toBe(false)
    // De melding benoemt allebei de helften: het stopt, en je zit nergens aan vast.
    expect(result.current.message).toBe(LOCAL_SUBSCRIPTION_REVOKED_MESSAGE)
    expect(result.current.message).toMatch(/terugzetten op cloud-AI/)
  })

  it('de abonnementscheck gaat VÓÓR de GPU-/modelcontrole', async () => {
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { documenten: 'lokaal' }, hasAiSubscription: false }),
    )

    const { result } = renderHook(() => useExecutionMode('documenten'))
    await waitFor(() => expect(result.current.status).toBe('blocked'))

    // "Je abonnement is verlopen" is de fundamentelere reden; een GPU-probe die
    // tot niets kan leiden slaan we over.
    expect(mockedCapability).not.toHaveBeenCalled()
    expect(mockedModelState).not.toHaveBeenCalled()
  })

  it('GELDIG abonnement + groep op lokaal → gewoon lokaal', async () => {
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { documenten: 'lokaal' }, hasAiSubscription: true }),
    )

    const { result } = renderHook(() => useExecutionMode('documenten'))

    await waitFor(() => expect(result.current.status).toBe('lokaal'))
    expect(result.current.canUseLocal).toBe(true)
  })

  it('verlopen abonnement maar groep op CLOUD → de hook blokkeert het terugzetten niet', async () => {
    fetchMock.mockResolvedValue(
      prefsResponse({ modes: { documenten: 'cloud' }, hasAiSubscription: false }),
    )

    const { result } = renderHook(() => useExecutionMode('documenten'))

    // Wie zijn keuze terugzet naar cloud, komt hier gewoon door — de
    // cloudroutes hebben hun eigen tier-gate. De hook is niet de plek om iemand
    // extra op te sluiten.
    await waitFor(() => expect(result.current.status).toBe('cloud'))
    expect(result.current.canUseCloud).toBe(true)
  })

  it('antwoord ZONDER hasAiSubscription telt als onbekend → resolving, niets draait', async () => {
    fetchMock.mockResolvedValue(prefsResponse({ modes: { documenten: 'lokaal' } }))

    const { result } = renderHook(() => useExecutionMode('documenten'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    // Een half antwoord is geen antwoord: fail-closed, zoals bij een
    // onleesbare voorkeur.
    expect(result.current.status).toBe('resolving')
    expect(result.current.canUseLocal).toBe(false)
    expect(result.current.canUseCloud).toBe(false)
  })

  it('inactief oppervlak doet geen enkele lezing', async () => {
    const { result } = renderHook(() => useExecutionMode('documenten', false))

    expect(result.current.status).toBe('resolving')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

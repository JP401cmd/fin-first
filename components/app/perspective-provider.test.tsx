/**
 * Bevinding C1 (race A) — het perspectief-antwoord verschilde per laadbeurt.
 *
 * `PerspectiveProvider` startte hardcoded op 'personal' en corrigeerde pas ná
 * `fetch('/api/perspective')`. Een huishoud-gebruiker las daardoor op de EERSTE
 * render persoonlijke cijfers en even later huishoud-cijfers — twee
 * verschillende, elk-voor-zich correcte antwoorden op dezelfde vraag.
 *
 * Deze suite pint vast dat de provider synchroon seedt uit de server-gelezen
 * `tf_perspective`-cookie, en dat de async ronde daarna niets meer omgooit
 * behalve wanneer de voorkeur echt niet meer geldig is.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({}),
}))

import { PerspectiveProvider, usePerspective } from './perspective-provider'

function Probe() {
  const { perspective, loading } = usePerspective()
  return (
    <>
      <span data-testid="perspective">{perspective}</span>
      <span data-testid="loading">{loading ? 'ja' : 'nee'}</span>
    </>
  )
}

const HOUSEHOLD_OPTIONS = [
  { id: 'personal', label: 'Eigen', description: 'Alleen jouw financiën' },
  { id: 'household', label: 'Huishouden', description: 'Samen met je partner' },
  { id: 'partner', label: 'Partner', description: 'De financiën van je partner' },
]

/** Een fetch die pas antwoordt wanneer wij dat zeggen — zo is de "eerste render" meetbaar. */
function deferredFetch(payload: unknown) {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const fetchMock = vi.fn(async () => {
    await gate
    return { ok: true, json: async () => payload } as unknown as Response
  })
  return { fetchMock, release }
}

beforeEach(() => {
  try { localStorage.clear() } catch { /* niet beschikbaar */ }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PerspectiveProvider — synchrone seed uit de cookie', () => {
  it('toont het huishoud-perspectief al op de EERSTE render, vóór /api/perspective antwoordt', async () => {
    const { fetchMock, release } = deferredFetch({
      selectedPerspective: 'household',
      availablePerspectives: HOUSEHOLD_OPTIONS,
      isHousehold: true,
      partnerName: 'JP',
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <PerspectiveProvider initialPerspective="household">
        <Probe />
      </PerspectiveProvider>,
    )

    // Dit is het meetmoment uit de bevinding: de fetch loopt nog.
    expect(screen.getByTestId('perspective').textContent).toBe('household')
    expect(screen.getByTestId('loading').textContent).toBe('ja')

    release()
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('nee'))
    // ...en ná settle staat er nog steeds hetzelfde antwoord: geen flits.
    expect(screen.getByTestId('perspective').textContent).toBe('household')
  })

  it('seedt ook het partner-perspectief', () => {
    const { fetchMock } = deferredFetch({})
    vi.stubGlobal('fetch', fetchMock)

    render(
      <PerspectiveProvider initialPerspective="partner">
        <Probe />
      </PerspectiveProvider>,
    )
    expect(screen.getByTestId('perspective').textContent).toBe('partner')
  })

  it('blijft zonder cookie-seed op personal (bestaand gedrag voor solo-gebruikers)', () => {
    const { fetchMock } = deferredFetch({})
    vi.stubGlobal('fetch', fetchMock)

    render(
      <PerspectiveProvider>
        <Probe />
      </PerspectiveProvider>,
    )
    expect(screen.getByTestId('perspective').textContent).toBe('personal')
  })
})

describe('PerspectiveProvider — de async ronde blijft corrigeren', () => {
  it('valt terug op personal wanneer het geseede perspectief niet meer beschikbaar is', async () => {
    // Partner losgekoppeld: de cookie zegt nog 'household', de server niet meer.
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        selectedPerspective: 'personal',
        availablePerspectives: [HOUSEHOLD_OPTIONS[0]],
        isHousehold: false,
        partnerName: null,
      }),
    }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    render(
      <PerspectiveProvider initialPerspective="household">
        <Probe />
      </PerspectiveProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('perspective').textContent).toBe('personal'))
  })

  it('houdt de cookie-seed vast wanneer de API faalt en localStorage leeg is', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('offline') })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <PerspectiveProvider initialPerspective="household">
        <Probe />
      </PerspectiveProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('nee'))
    expect(screen.getByTestId('perspective').textContent).toBe('household')
  })
})

/**
 * WF-NAV-19/c, bug2 — "de cookie was al gezet vóór de mislukte PATCH, dus het
 * perspectief hoort te blijven staan na herlaad".
 *
 * Repro (UAT-sweep 2 sep 2026): met een falende PATCH sprong de badge na een
 * herlaad terug van "Partner" naar "Huishouden". De PATCH was fire-and-forget,
 * dus de server hoorde de wissel nooit; de mount-effect laat bewust de
 * SERVERWAARDE winnen en draaide de keuze daarmee stilzwijgend terug.
 *
 * Eigenaarsbesluit 3 sep 2026: optie A — de PATCH retryen. De mount-effect
 * blijft ongewijzigd (die draagt de C1/C7-correctie hierboven), dus deze suite
 * bewijst de fix via de SERVERKANT: na een netwerkfout moet de server alsnog
 * bijgetrokken zijn tegen de tijd dat de pagina opnieuw laadt.
 */

/** Server-dubbel: houdt de opgeslagen waarde bij en laat PATCH-falen scripten. */
function makeServer(initial: string, patchOutcomes: Array<'network' | 'server-500' | 'client-400' | 'ok'>) {
  const state = { perspective: initial, patchCalls: 0 }
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method !== 'PATCH') {
      return {
        ok: true,
        json: async () => ({
          selectedPerspective: state.perspective,
          availablePerspectives: HOUSEHOLD_OPTIONS,
          isHousehold: true,
          partnerName: 'JP',
        }),
      } as unknown as Response
    }

    // Een afgebroken poging moet zich als abort gedragen, niet als netwerkfout:
    // anders zou de retry-lus 'm alsnog willen herhalen.
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const outcome = patchOutcomes[state.patchCalls] ?? 'ok'
    state.patchCalls += 1
    if (outcome === 'network') throw new TypeError('Failed to fetch')
    if (outcome === 'server-500') return { ok: false, status: 503 } as unknown as Response

    if (outcome === 'client-400') return { ok: false, status: 400 } as unknown as Response
    state.perspective = JSON.parse(String(init.body)).perspective
    return { ok: true, status: 200 } as unknown as Response
  })
  return { state, fetchMock }
}

function SwitchProbe() {
  const { perspective, setPerspective } = usePerspective()
  return (
    <>
      <span data-testid="perspective">{perspective}</span>
      <button onClick={() => setPerspective('partner')}>naar partner</button>
      <button onClick={() => setPerspective('household')}>naar huishouden</button>
    </>
  )
}

describe('PerspectiveProvider — een mislukte sync draait de wissel niet meer terug (WF-NAV-19/c)', () => {
  it('herhaalt de PATCH na een netwerkfout, zodat de server de wissel alsnog krijgt', async () => {
    const { state, fetchMock } = makeServer('household', ['network'])
    vi.stubGlobal('fetch', fetchMock)

    render(
      <PerspectiveProvider initialPerspective="household">
        <SwitchProbe />
      </PerspectiveProvider>,
    )

    fireEvent.click(screen.getByText('naar partner'))
    expect(screen.getByTestId('perspective').textContent).toBe('partner')

    // Poging 1 faalde; poging 2 hoort na de backoff alsnog te landen.
    await waitFor(() => expect(state.perspective).toBe('partner'), { timeout: 3000 })
    expect(state.patchCalls).toBe(2)
  })

  it('na herlaad staat het perspectief er nog — het gedrag dat de bug brak', async () => {
    const { state, fetchMock } = makeServer('household', ['network'])
    vi.stubGlobal('fetch', fetchMock)

    const first = render(
      <PerspectiveProvider initialPerspective="household">
        <SwitchProbe />
      </PerspectiveProvider>,
    )
    fireEvent.click(screen.getByText('naar partner'))
    await waitFor(() => expect(state.perspective).toBe('partner'), { timeout: 3000 })
    first.unmount()

    // Herlaad: de mount-effect haalt opnieuw op en laat de server winnen. Dát mag
    // ook — mits de retry de server inmiddels heeft bijgetrokken.
    render(
      <PerspectiveProvider initialPerspective="partner">
        <SwitchProbe />
      </PerspectiveProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('perspective').textContent).toBe('partner'))
  })

  it('herhaalt ook een 5xx, want die betekent dat de server de keuze niet heeft', async () => {
    const { state, fetchMock } = makeServer('household', ['server-500'])
    vi.stubGlobal('fetch', fetchMock)

    render(
      <PerspectiveProvider initialPerspective="household">
        <SwitchProbe />
      </PerspectiveProvider>,
    )
    fireEvent.click(screen.getByText('naar partner'))

    await waitFor(() => expect(state.perspective).toBe('partner'), { timeout: 3000 })
  })

  it('herhaalt een 4xx juist NIET — dat antwoord verandert niet door het opnieuw te vragen', async () => {
    const { state, fetchMock } = makeServer('household', ['client-400'])
    vi.stubGlobal('fetch', fetchMock)

    render(
      <PerspectiveProvider initialPerspective="household">
        <SwitchProbe />
      </PerspectiveProvider>,
    )
    fireEvent.click(screen.getByText('naar partner'))

    // Ruim langer dan de eerste backoff (300ms): er komt geen tweede poging.
    await new Promise(r => setTimeout(r, 600))
    expect(state.patchCalls).toBe(1)
    expect(state.perspective).toBe('household')
  })

  it('een nieuwere wissel wint: de retry van de oude keuze schrijft niets terug', async () => {
    // Eerste wissel faalt en gaat de backoff in; de tweede wissel breekt 'm af.
    const { state, fetchMock } = makeServer('personal', ['network', 'ok'])
    vi.stubGlobal('fetch', fetchMock)

    render(
      <PerspectiveProvider initialPerspective="personal">
        <SwitchProbe />
      </PerspectiveProvider>,
    )

    fireEvent.click(screen.getByText('naar partner'))
    fireEvent.click(screen.getByText('naar huishouden'))

    await waitFor(() => expect(state.perspective).toBe('household'), { timeout: 3000 })
    // En blijft daar: de afgebroken partner-retry mag niet alsnog landen.
    await new Promise(r => setTimeout(r, 700))
    expect(state.perspective).toBe('household')
  })
})

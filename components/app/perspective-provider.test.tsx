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
import { render, screen, waitFor } from '@testing-library/react'

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

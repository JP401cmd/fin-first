/**
 * Regressietest voor WelcomeGuideBanner.
 *
 * Kernpunt: in dev draait React onder <StrictMode> elk effect TWEE keer
 * (mount → cleanup → mount). Een eerdere bug combineerde een `fetchedRef`-guard
 * met een `cancelled`-cleanup-flag, waardoor de tweede mount niet opnieuw
 * fetchte én de eerste fetch als "cancelled" werd weggegooid → `setData` werd
 * nooit aangeroepen → de banner verscheen nooit. Deze test mount de banner
 * expliciet onder <StrictMode> en borgt dat scherm 1 wél verschijnt.
 */
import { StrictMode } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { WelcomeGuideBanner } from './welcome-guide-banner'
import { DEFAULT_WELCOME_GUIDE, DEFAULT_WELCOME_GUIDE_STATE } from '@/lib/welcome-guide'

const SESSION_CLOSED_KEY = 'welcome_guide_closed'

function mockGuideFetch(payload?: { configEnabled?: boolean; status?: 'active' | 'dismissed' }) {
  const config = { ...DEFAULT_WELCOME_GUIDE, enabled: payload?.configEnabled ?? true }
  const state = { ...DEFAULT_WELCOME_GUIDE_STATE, status: payload?.status ?? 'active' }
  const fn = vi.fn((url: string, opts?: { method?: string }) => {
    if (opts?.method === 'PUT') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ state }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ config, state }) })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('WelcomeGuideBanner', () => {
  beforeEach(() => {
    try {
      sessionStorage.clear()
    } catch {
      /* no-op */
    }
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('toont scherm 1 ondanks de dubbele StrictMode-mount', async () => {
    mockGuideFetch()
    render(
      <StrictMode>
        <WelcomeGuideBanner />
      </StrictMode>,
    )
    // De async fetch landt na de (dubbele) mount → scherm 1 (kop-loze process-
    // kaarten) moet verschijnen; we toetsen op de kicker + de eerste stap.
    expect(await screen.findByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
    expect(screen.getByText('Welkom bij TriFinity')).toBeInTheDocument()
  })

  it('rendert niets wanneer de gids voor alle gebruikers uit staat', async () => {
    mockGuideFetch({ configEnabled: false })
    render(<WelcomeGuideBanner />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByText('Welkom bij TriFinity')).not.toBeInTheDocument()
  })

  it('rendert niets wanneer de gebruiker de gids voorgoed heeft gesloten', async () => {
    mockGuideFetch({ status: 'dismissed' })
    render(<WelcomeGuideBanner />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByText('Welkom bij TriFinity')).not.toBeInTheDocument()
  })

  it('rendert niets (en fetcht niet) wanneer de sessie-sluitvlag gezet is', async () => {
    sessionStorage.setItem(SESSION_CLOSED_KEY, '1')
    const fn = mockGuideFetch()
    render(<WelcomeGuideBanner />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByText('Welkom bij TriFinity')).not.toBeInTheDocument()
    expect(fn).not.toHaveBeenCalled()
  })

  it('seed aanwezig → toont scherm 1 ZONDER fetch', async () => {
    const fn = vi.fn()
    vi.stubGlobal('fetch', fn)
    render(
      <WelcomeGuideBanner
        seed={{ config: DEFAULT_WELCOME_GUIDE, state: DEFAULT_WELCOME_GUIDE_STATE }}
      />,
    )
    expect(await screen.findByText('Zijn al je bezittingen geregistreerd?')).toBeInTheDocument()
    expect(fn).not.toHaveBeenCalled()
  })

  it('seed met uitgeschakelde config → niets, geen fetch', async () => {
    const fn = vi.fn()
    vi.stubGlobal('fetch', fn)
    render(
      <WelcomeGuideBanner
        seed={{
          config: { ...DEFAULT_WELCOME_GUIDE, enabled: false },
          state: DEFAULT_WELCOME_GUIDE_STATE,
        }}
      />,
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByText('Welkom bij TriFinity')).not.toBeInTheDocument()
    expect(fn).not.toHaveBeenCalled()
  })
})

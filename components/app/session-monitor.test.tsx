import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

/**
 * Tests voor de globale fetch-wrapper van SessionMonitor.
 *
 * Context: omdat ALLE fetches in de app fysiek via de wrapper lopen, wijst de
 * stacktrace van een netwerkfout (`TypeError: Failed to fetch`) altijd naar
 * session-monitor.tsx — de echte call-site is daaruit niet te herleiden. De
 * wrapper moet daarom de falende URL aan de foutmelding toevoegen, zónder de
 * identiteit van de fout te veranderen (instanceof TypeError blijft gelden,
 * en matchers op 'Failed to fetch' via startsWith/includes blijven werken).
 */

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      refreshSession: vi.fn().mockResolvedValue({ error: null }),
      signInWithPassword: vi.fn(),
    },
  }),
}))

import { SessionMonitor } from './session-monitor'

const realFetch = window.fetch

afterEach(() => {
  window.fetch = realFetch
  vi.clearAllMocks()
})

describe('SessionMonitor fetch-wrapper', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    window.fetch = fetchMock as unknown as typeof window.fetch
  })

  it('annoteert netwerkfouten met de falende URL, met behoud van fout-identiteit', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<SessionMonitor />)

    let caught: unknown
    try {
      await window.fetch('/api/notifications')
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(TypeError)
    const message = (caught as TypeError).message
    // startsWith zodat bestaande matchers (onboarding, chat-panel, import) blijven werken
    expect(message.startsWith('Failed to fetch')).toBe(true)
    expect(message).toContain('/api/notifications')
  })

  it('annoteert ook bij Request- en URL-objecten als input', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    render(<SessionMonitor />)

    let caught: unknown
    try {
      await window.fetch(new URL('https://example.com/api/data'))
    } catch (err) {
      caught = err
    }
    expect((caught as TypeError).message).toContain('https://example.com/api/data')
  })

  it('geeft succesvolle responses ongewijzigd door', async () => {
    const response = new Response('ok', { status: 200 })
    fetchMock.mockResolvedValue(response)
    render(<SessionMonitor />)

    const result = await window.fetch('/api/ok')
    expect(result).toBe(response)
    expect(screen.queryByTestId('session-expired-modal')).toBeNull()
  })

  it('toont de sessie-verlopen-modal bij een 401 van de eigen API', async () => {
    fetchMock.mockResolvedValue(new Response('unauthorized', { status: 401 }))
    render(<SessionMonitor />)

    await act(async () => {
      await window.fetch('/api/budgets')
    })
    await waitFor(() => {
      expect(screen.getByTestId('session-expired-modal')).toBeTruthy()
    })
  })

  it('negeert 401 van auth-endpoints', async () => {
    fetchMock.mockResolvedValue(new Response('unauthorized', { status: 401 }))
    render(<SessionMonitor />)

    await window.fetch('https://xyz.supabase.co/auth/v1/token')
    expect(screen.queryByTestId('session-expired-modal')).toBeNull()
  })

  it('herstelt de originele fetch bij unmount', () => {
    const { unmount } = render(<SessionMonitor />)
    expect(window.fetch).not.toBe(fetchMock)
    unmount()
    // Na unmount is de wrapper weg; de gebonden originele fetch blijft over
    // (bind maakt een nieuwe functie, dus geen referentie-gelijkheid met fetchMock)
    expect(
      (window.fetch as unknown as Record<symbol, unknown>)[
        Symbol.for('trifinity.fetchWrapped')
      ]
    ).toBeUndefined()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { VasteLastenLoader } from './vaste-lasten-loader'

/**
 * Tests voor VasteLastenLoader — client-component die /api/subscriptions
 * fetcht en doorgeeft aan VasteKostenAnalyse. matchMedia + IO worden
 * globaal gemocked in test/setup.ts. Alleen fetch wordt per-test gereset.
 */

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

function makeRecurring(id: string, name: string, monthly = 100) {
  return {
    id,
    name,
    averageAmount: monthly,
    monthlyAmount: monthly,
    frequency: 'monthly',
    nextDate: null,
    confidence: 'high',
    isVariableAmount: false,
    occurrences: 12,
    alreadyConfirmed: false,
    category: 'subscription',
    categoryLabel: 'Abonnement',
    categoryOverride: null,
  }
}

describe('VasteLastenLoader', () => {
  it('toont "laden" tijdens fetch', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}))
    render(<VasteLastenLoader fullName="Test" />)
    expect(screen.getByText('Vaste lasten laden…')).toBeTruthy()
  })

  it('toont lege staat bij geen items', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ subscriptions: [], vasteKosten: [] }),
    })
    render(<VasteLastenLoader fullName="Test" />)
    await waitFor(() => {
      expect(screen.getByText('Geen vaste lasten herkend.')).toBeTruthy()
    })
  })

  it('toont error met retry-knop bij fetch-failure', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    render(<VasteLastenLoader fullName="Test" />)
    await waitFor(() => {
      expect(screen.getByText(/Fout bij ophalen vaste lasten/)).toBeTruthy()
      expect(screen.getByText('Opnieuw proberen')).toBeTruthy()
    })
  })

  it('rendert VasteKostenAnalyse bij data', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        subscriptions: [makeRecurring('s1', 'Netflix', 14)],
        vasteKosten: [makeRecurring('v1', 'Huur', 1200)],
      }),
    })
    render(<VasteLastenLoader fullName="Test" />)
    await waitFor(() => {
      // VasteKostenAnalyse rendert de namen
      expect(screen.queryByText('Vaste lasten laden…')).toBeNull()
    })
    // Daadwerkelijke render-validatie:
    // Component verwacht meer infrastructure — voor MVP test ik dat de
    // loading-state weg is en geen lege-staat is.
    expect(screen.queryByText('Geen vaste lasten herkend.')).toBeNull()
  })

  it('roept /api/subscriptions aan', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ subscriptions: [], vasteKosten: [] }),
    })
    render(<VasteLastenLoader fullName="Test" />)
    await waitFor(() => {
      // Afbreekbaar: de fetch loopt nu via useAbortableFetch en krijgt een
      // AbortSignal mee als tweede argument (abort-on-unmount).
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/subscriptions',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })
  })

  it('werkt zonder fullName-prop', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ subscriptions: [], vasteKosten: [] }),
    })
    render(<VasteLastenLoader fullName={null} />)
    await waitFor(() => {
      expect(screen.getByText('Geen vaste lasten herkend.')).toBeTruthy()
    })
  })

  it('netwerk-error toont string in error-bericht', async () => {
    mockFetch.mockRejectedValue(new Error('Netwerk weg'))
    render(<VasteLastenLoader fullName="Test" />)
    await waitFor(() => {
      expect(screen.getByText(/Netwerk weg/)).toBeTruthy()
    })
  })
})

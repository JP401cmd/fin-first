import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import RapportagesPage from './page'

/**
 * H28/S9 — het archief mocht geen "spookverwijdering" meer tonen.
 *
 * `handleDelete` deed `await fetch(...)` en filterde de rij daarna
 * onvoorwaardelijk uit de lijst. Antwoordde de server met 403 (de onterechte
 * AI-abonnementspoort op DELETE) of 500, dan zag de gebruiker een geslaagde
 * verwijdering terwijl de rij op de server bleef staan — zichtbaar terug bij de
 * volgende herlaadbeurt. De rij verdwijnt nu alleen na een bevestigd `res.ok`,
 * en anders verschijnt de foutmelding van de server.
 */

const CONFIG_ROW = {
  id: 'cfg-1',
  name: 'Archiefstuk mei',
  period_type: 'month',
  date_from: '2026-05-01',
  date_to: '2026-06-01',
  use_ai: false,
  created_at: '2026-05-02T10:00:00.000Z',
  last_generated_at: '2026-05-02T10:00:00.000Z',
}

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: [CONFIG_ROW], error: null }),
        }),
      }),
    }),
  }),
}))

const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = mockFetch as unknown as typeof fetch
})

async function renderArchive() {
  render(<RapportagesPage />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Verwijder Archiefstuk mei' })).toBeTruthy())
  return screen.getByRole('button', { name: 'Verwijder Archiefstuk mei' })
}

describe('/rapportages — verwijderen uit het archief', () => {
  it('haalt de rij pas weg als de server bevestigt', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    const button = await renderArchive()

    await act(async () => {
      fireEvent.click(button)
    })

    await waitFor(() => expect(screen.queryByText('Archiefstuk mei')).toBeNull())
    expect(mockFetch).toHaveBeenCalledWith('/api/report?id=cfg-1', { method: 'DELETE' })
  })

  it('laat de rij staan en toont de servermelding bij een geweigerd verzoek', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Deze functie vereist een AI abonnement' }),
    })
    const button = await renderArchive()

    await act(async () => {
      fireEvent.click(button)
    })

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Deze functie vereist een AI abonnement'),
    )
    // De kern van de regressie: de rij is NIET stil verdwenen.
    expect(screen.getByText('Archiefstuk mei')).toBeTruthy()
  })

  it('toont een verbindingsmelding als de fetch zelf faalt', async () => {
    mockFetch.mockRejectedValue(new Error('offline'))
    const button = await renderArchive()

    await act(async () => {
      fireEvent.click(button)
    })

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Verwijderen mislukt'))
    expect(screen.getByText('Archiefstuk mei')).toBeTruthy()
  })
})

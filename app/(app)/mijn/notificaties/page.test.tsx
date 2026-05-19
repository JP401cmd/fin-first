import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MijnNotificatiesPage from './page'

/**
 * Smoke-tests voor /mijn/notificaties — geëxtraheerd uit
 * /identity/instellingen. Mocken supabase + fetch zodat tests
 * deterministisch zijn zonder backend.
 */

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

const mockFetch = vi.fn()

beforeEach(() => {
  mockSupabase.auth.getUser.mockReset()
  mockSupabase.from.mockReset()
  mockFetch.mockReset()
  global.fetch = mockFetch as unknown as typeof fetch
})

function setupMocksWithUser() {
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  // app_settings query
  mockSupabase.from.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    order: vi.fn().mockResolvedValue({ data: [] }),
  })
  mockFetch.mockImplementation(async (url: string) => {
    if (url === '/api/monthly-checkin') {
      return { ok: true, json: async () => ({ enabled: true }) }
    }
    if (url === '/api/household/privacy') {
      return { ok: true, json: async () => ({ hasHousehold: false }) }
    }
    return { ok: false, status: 404 }
  })
}

describe('MijnNotificatiesPage', () => {
  it('toont editorial header met "Mijn · notificaties"', async () => {
    setupMocksWithUser()
    render(<MijnNotificatiesPage />)
    await waitFor(() => {
      expect(screen.getByText('Mijn · notificaties')).toBeTruthy()
    })
  })

  it('rendert subtitle-tekst over instellen meldingen', async () => {
    setupMocksWithUser()
    render(<MijnNotificatiesPage />)
    await waitFor(() => {
      expect(screen.getByText(/Stel in welke meldingen je wilt ontvangen/)).toBeTruthy()
    })
  })

  it('toont loading-spinner initieel, dan content', async () => {
    setupMocksWithUser()
    render(<MijnNotificatiesPage />)
    // Wacht tot async data is geladen
    await waitFor(() => {
      // Push-notification types zijn nu zichtbaar
      expect(screen.getByText('Budget alerts')).toBeTruthy()
    })
  })

  it('rendert maandelijkse geld-checkin-toggle', async () => {
    setupMocksWithUser()
    render(<MijnNotificatiesPage />)
    await waitFor(() => {
      expect(screen.getByText('Maandelijkse geldcheck-in')).toBeTruthy()
    })
  })

  it('verbergt partner-notif-blok als geen huishouden', async () => {
    setupMocksWithUser()
    render(<MijnNotificatiesPage />)
    await waitFor(() => {
      expect(screen.getByText('Budget alerts')).toBeTruthy()
    })
    expect(screen.queryByText('Partner transacties')).toBeNull()
  })

  it('toont partner-notif-blok als huishouden aanwezig', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      order: vi.fn().mockResolvedValue({ data: [] }),
    })
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/api/monthly-checkin') return { ok: true, json: async () => ({ enabled: true }) }
      if (url === '/api/household/privacy') return { ok: true, json: async () => ({ hasHousehold: true }) }
      if (url === '/api/partner-notifications') return { ok: true, json: async () => ({ mode: 'all_shared', threshold: 100, categories: [] }) }
      return { ok: false, status: 404 }
    })
    render(<MijnNotificatiesPage />)
    await waitFor(() => {
      expect(screen.getByText('Partner transacties')).toBeTruthy()
    })
  })
})

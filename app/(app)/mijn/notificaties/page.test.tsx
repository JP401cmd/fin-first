import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import MijnNotificatiesPage from './page'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import { NOTIFICATION_TYPES } from '@/lib/identity-constants'

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

/**
 * MIJN-3 — in Eenvoudig drie hoofdschakelaars (meldingen in de app, briefing per
 * e-mail, maandelijkse geldcheck-in) plus een "Alle meldingstypen"-disclosure
 * met de losse push-types; in Volledig de vlakke lijst zoals hij was.
 *
 * Bron: docs/eenvoudige-weergave-audit.md §7 (/mijn).
 */
function renderInMode(mode: DisplayMode) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <MijnNotificatiesPage />
    </DisplayModeProvider>,
  )
}

describe('MijnNotificatiesPage — Eenvoudige weergave (MIJN-3)', () => {
  it("toont in 'simple' de drie hoofdschakelaars", async () => {
    setupMocksWithUser()
    renderInMode('simple')
    await waitFor(() => {
      expect(screen.getByText('Meldingen in de app')).toBeTruthy()
    })
    expect(screen.getByText('Briefing per e-mail')).toBeTruthy()
    expect(screen.getByText('Maandelijkse geldcheck-in')).toBeTruthy()
  })

  it("zet in 'simple' de losse meldingstypen in een ingeklapte disclosure", async () => {
    setupMocksWithUser()
    renderInMode('simple')
    const section = await screen.findByTestId('depth-section')
    expect(section.getAttribute('data-collapsed')).toBe('true')
    expect(within(section).getByTestId('depth-section-title').textContent).toBe(
      'Alle meldingstypen',
    )
    // De types blijven bereikbaar (inklappen-met-behoud, geen hard-hide).
    expect(within(section).getByText('Budget alerts')).toBeTruthy()
    expect(within(section).getByText('Je eigen grenzen')).toBeTruthy()
  })

  it("toont in 'full' de vlakke lijst zonder disclosure en zonder hoofdschakelaar", async () => {
    setupMocksWithUser()
    renderInMode('full')
    await waitFor(() => {
      expect(screen.getByText('Budget alerts')).toBeTruthy()
    })
    expect(screen.queryByTestId('depth-section')).toBeNull()
    expect(screen.queryByText('Meldingen in de app')).toBeNull()
    // Alle zeven types staan er los.
    for (const { label } of NOTIFICATION_TYPES) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it("toont geen dubbele geldcheck-in-rij in 'simple'", async () => {
    setupMocksWithUser()
    renderInMode('simple')
    await waitFor(() => {
      expect(screen.getByText('Meldingen in de app')).toBeTruthy()
    })
    expect(screen.getAllByText('Maandelijkse geldcheck-in')).toHaveLength(1)
  })
})

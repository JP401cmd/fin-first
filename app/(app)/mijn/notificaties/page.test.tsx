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

/**
 * Antwoord van `GET /api/household/status` zoals de route hem WERKELIJK levert
 * (`app/api/household/status/route.ts`): snake_case `has_household` plus een
 * `members`-array. Dat is bewust geen zelfverzonnen vorm — de S10-regressie
 * ontstond juist doordat deze pagina een veld las (`hasHousehold`) dat geen
 * enkele route ooit heeft geretourneerd, terwijl de test dat verzonnen veld
 * mockte en daarmee groen bleef. Een mock die niet op het echte contract staat,
 * dekt niets af; hij verbergt.
 */
function householdStatus(memberCount: number) {
  if (memberCount === 0) {
    return {
      has_household: false,
      household: null,
      members: [],
      pending_invitations_received: [],
      pending_invitations_sent: [],
    }
  }
  return {
    has_household: true,
    household: { id: 'hh-1', name: 'Huishouden' },
    my_role: 'owner',
    members: Array.from({ length: memberCount }, (_, i) => ({
      id: `m-${i}`,
      user_id: i === 0 ? 'u1' : `u${i + 1}`,
      role: i === 0 ? 'owner' : 'partner',
      full_name: null,
      is_current_user: i === 0,
    })),
    pending_invitations_sent: [],
    pending_invitations_received: [],
  }
}

/** @param householdMembers 0 = geen huishouden, 1 = alleen (uitnodiging open), 2 = stel. */
function setupMocksWithUser(householdMembers = 0) {
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
    if (url === '/api/household/status') {
      return { ok: true, json: async () => householdStatus(householdMembers) }
    }
    if (url === '/api/partner-notifications') {
      return { ok: true, json: async () => ({ mode: 'all_shared', threshold: 100, categories: [] }) }
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
    setupMocksWithUser(0)
    render(<MijnNotificatiesPage />)
    await waitFor(() => {
      expect(screen.getByText('Budget alerts')).toBeTruthy()
    })
    expect(screen.queryByText('Partner transacties')).toBeNull()
  })

  it('toont partner-notif-blok als er echt een partner is', async () => {
    setupMocksWithUser(2)
    render(<MijnNotificatiesPage />)
    await waitFor(() => {
      expect(screen.getByText('Partner transacties')).toBeTruthy()
    })
  })
})

/**
 * S10 — de partner-poort.
 *
 * Twee dingen gingen hier na elkaar mis en deze suite pint ze allebei:
 *
 *  1. **Altijd open.** De monoliet gebruikte `privacyRes.ok` als signaal. Maar
 *     `POST /api/household/invite` maakt de huishoud-rij én de eigen ledenrij
 *     al aan bij het uitnodigen — dus wie een uitnodiging had openstaan kreeg
 *     vier partner-modi en een categorie-picker te zien terwijl er niemand was.
 *  2. **Altijd dicht.** Bij de page-extractie werd dat vervangen door
 *     `data.hasHousehold`, een veld dat `GET /api/household/privacy` nooit
 *     levert. Sindsdien verscheen het blok bij niemand meer — ook niet bij een
 *     echt stel. De toenmalige test mockte dat verzonnen veld en bleef groen.
 *
 * De poort staat nu op `has_household && members.length > 1`, hetzelfde
 * criterium als `/api/household/box2|box3`.
 *
 * Bijt-proef gedraaid (en teruggedraaid): poort terug op `data.has_household`
 * zónder de ledentelling → de twee 1-lid-tests hieronder lopen rood (het blok
 * verschijnt, en de partner-instellingen worden opgehaald).
 */
describe('MijnNotificatiesPage — partner-poort (S10)', () => {
  it('houdt het partnerblok dicht bij een huishouden van één lid', async () => {
    // Dit is het geval uit de audit-klacht: uitnodiging verstuurd (of partner
    // vertrokken), dus wél een huishouden — maar geen partner. Partner-modi
    // horen dan niet in beeld.
    setupMocksWithUser(1)
    render(<MijnNotificatiesPage />)
    await waitFor(() => {
      expect(screen.getByText('Budget alerts')).toBeTruthy()
    })
    expect(screen.queryByText('Partner transacties')).toBeNull()
  })

  it('vraagt de partnerinstellingen niet op zonder partner', async () => {
    setupMocksWithUser(1)
    render(<MijnNotificatiesPage />)
    await waitFor(() => {
      expect(screen.getByText('Budget alerts')).toBeTruthy()
    })
    const opgevraagd = mockFetch.mock.calls.map((c) => c[0])
    expect(opgevraagd).not.toContain('/api/partner-notifications')
  })

  it('leest de huishoudstand uit /api/household/status, niet uit de privacy-route', async () => {
    // Regressie-anker: een pagina die de verkeerde route (of het verkeerde
    // veld) leest, hoort hier zichtbaar te falen in plaats van stil een lege
    // sectie op te leveren.
    setupMocksWithUser(2)
    render(<MijnNotificatiesPage />)
    await waitFor(() => {
      expect(screen.getByText('Partner transacties')).toBeTruthy()
    })
    const opgevraagd = mockFetch.mock.calls.map((c) => c[0])
    expect(opgevraagd).toContain('/api/household/status')
    expect(opgevraagd).not.toContain('/api/household/privacy')
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

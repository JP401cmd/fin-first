import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import ProfielPage from './page'

/**
 * WF-MIJN-02c — een netwerkstoring tijdens opslaan mag niet als "uitgelogd"
 * gelezen worden.
 *
 * De repro (UAT 2 sep 2026): open /mijn/profiel, zet het netwerk op offline,
 * wijzig een veld, klik Opslaan. De pagina toonde "Je bent niet ingelogd. Log
 * opnieuw in en probeer het nog eens." terwijl de sessie gewoon geldig bleef.
 *
 * Sinds TPR-14 (13 sep 2026) slaat de pagina op via PUT /api/profile i.p.v. een
 * client-upsert. De twee takken blijven gepind, nu op de fetch-uitkomst:
 * netwerkfout (fetch gooit) → opslag-fouttekst; 401 → de auth-tekst. Daarnaast:
 * de body gaat naar de route (geen `.upsert` meer uit de browser) en een 400 toont
 * de Nederlandse schema-melding zonder technisch veldpad.
 */

const mockSupabase = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

vi.mock('@/components/app/toast-provider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))

// De huishoud-secties doen eigen fetches en horen niet bij deze repro.
vi.mock('@/components/app/household-section', () => ({
  HouseholdSection: () => null,
}))
vi.mock('@/components/mijn/household-privacy-settings', () => ({
  HouseholdPrivacySettings: () => null,
}))
vi.mock('@/components/mijn/household-budget-model-section', () => ({
  HouseholdBudgetModelSection: () => null,
}))

const upsert = vi.fn()
const fetchMock = vi.fn()

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  mockSupabase.auth.getUser.mockReset()
  mockSupabase.from.mockReset()
  upsert.mockReset()
  fetchMock.mockReset()
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  mockSupabase.from.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      // De dode kolom-default 'single' moet als 'solo' binnenkomen, anders
      // weigert de route het huishoudtype bij de eerstvolgende opslag.
      data: { household_type: 'single', date_of_birth: '1985-04-01' },
    }),
    upsert,
  })
  fetchMock.mockResolvedValue(jsonResponse(200, { success: true }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Rendert de pagina en wacht tot de load-spinner voorbij is. */
async function renderGeladen() {
  render(<ProfielPage />)
  return await screen.findAllByRole('button', { name: 'Opslaan' })
}

describe('/mijn/profiel — opslaan via PUT /api/profile (TPR-14)', () => {
  it('stuurt het formulier naar de route en upsert niet meer vanuit de browser', async () => {
    const [opslaan] = await renderGeladen()
    fireEvent.click(opslaan)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/profile')
    expect(init.method).toBe('PUT')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.date_of_birth).toBe('1985-04-01')
    expect(body.household_type).toBe('solo')
    // De gebruiker komt uit de sessie op de server, nooit uit de body.
    expect(body).not.toHaveProperty('id')
    expect(upsert).not.toHaveBeenCalled()
  })

  it('draagt bij geboortedatum en huishouden een uitleg (keuze · effect · waarom)', async () => {
    await renderGeladen()
    expect(screen.getByLabelText('Geboortedatum')).toHaveAttribute('aria-describedby', 'dob-hint')
    expect(screen.getByText(/AOW-leeftijd in de toekomstgrafiek/)).toBeInTheDocument()
    expect(screen.getByText(/Box 3-vrijstelling/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Solo' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('toont bij een 400 de schema-melding zonder technisch veldpad', async () => {
    const [opslaan] = await renderGeladen()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: 'date_of_birth: Vul een geldige geboortedatum in.', code: 'validation_error' }),
    )
    fireEvent.click(opslaan)

    await waitFor(() => {
      expect(screen.getAllByText('Vul een geldige geboortedatum in.').length).toBeGreaterThan(0)
    })
  })
})

describe('/mijn/profiel — opslaan bij netwerkuitval (WF-MIJN-02c)', () => {
  it('toont de opslag-fouttekst als het verzoek op een netwerkfout stukloopt', async () => {
    const [opslaan] = await renderGeladen()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fireEvent.click(opslaan)

    await waitFor(() => {
      expect(screen.getAllByText('Opslaan is mislukt. Probeer het opnieuw.').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText(/Je bent niet ingelogd/)).toBeNull()
  })

  it('toont de niet-ingelogd-tekst bij een écht ontbrekende sessie (401)', async () => {
    const [opslaan] = await renderGeladen()
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { error: 'Niet ingelogd', code: 'unauthorized' }))
    fireEvent.click(opslaan)

    await waitFor(() => {
      expect(screen.getAllByText(/Je bent niet ingelogd/).length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('Opslaan is mislukt. Probeer het opnieuw.')).toBeNull()
  })

  it('toont de opslag-fouttekst als de server de opslag niet afrondt (500)', async () => {
    const [opslaan] = await renderGeladen()
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'Er ging iets mis', code: 'server_error' }))
    fireEvent.click(opslaan)

    await waitFor(() => {
      expect(screen.getAllByText('Opslaan is mislukt. Probeer het opnieuw.').length).toBeGreaterThan(0)
    })
  })
})

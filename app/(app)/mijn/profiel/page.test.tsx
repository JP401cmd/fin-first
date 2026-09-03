import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import ProfielPage from './page'

/**
 * WF-MIJN-02c — een netwerkstoring tijdens opslaan mag niet als "uitgelogd"
 * gelezen worden.
 *
 * De repro (UAT 2 sep 2026): open /mijn/profiel, zet het netwerk op offline,
 * wijzig een veld, klik Opslaan. De pagina toonde "Je bent niet ingelogd. Log
 * opnieuw in en probeer het nog eens." terwijl de sessie gewoon geldig bleef —
 * na herstel van de verbinding werkte alles zonder opnieuw inloggen.
 *
 * Oorzaak: `saveProfile` deed vlak vóór de upsert een verse
 * `supabase.auth.getUser()`. Dat is zelf een netwerkcall; auth-js gooit daarbij
 * niet maar retourneert `{ data: { user: null }, error: AuthRetryableFetchError }`.
 * De code las alleen `user` uit en zag `null` → "niet ingelogd".
 *
 * Deze suite pint beide takken: netwerkfout → opslag-fouttekst, écht ontbrekende
 * sessie → de auth-tekst.
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

const SESSIE_INTACT = { data: { user: { id: 'u1' } }, error: null }

/**
 * Fout-doubles op de WERKELIJKE vorm van @supabase/auth-js
 * (dist/module/lib/errors.js: `CustomAuthError` zet `name`; r.217-220
 * AuthRetryableFetchError, r.100-103 AuthSessionMissingError). Bewust
 * nagebouwd i.p.v. geïmporteerd: de repo koppelt niet aan het transitieve
 * pad `@supabase/auth-js` (zie lib/supabase/server.ts r.48).
 */
function authRetryableFetchError() {
  const err = new Error('Failed to fetch')
  err.name = 'AuthRetryableFetchError'
  return err
}

function authSessionMissingError() {
  const err = new Error('Auth session missing!')
  err.name = 'AuthSessionMissingError'
  return err
}

beforeEach(() => {
  mockSupabase.auth.getUser.mockReset()
  mockSupabase.from.mockReset()
  // Standaard: sessie geldig, profiel leeg, upsert slaagt.
  mockSupabase.auth.getUser.mockResolvedValue(SESSIE_INTACT)
  mockSupabase.from.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
  })
})

/** Rendert de pagina en wacht tot de load-spinner voorbij is. */
async function renderGeladen() {
  render(<ProfielPage />)
  return await screen.findAllByRole('button', { name: 'Opslaan' })
}

describe('/mijn/profiel — opslaan bij netwerkuitval (WF-MIJN-02c)', () => {
  it('toont de opslag-fouttekst als getUser() op een netwerkfout stukloopt', async () => {
    const [opslaan] = await renderGeladen()

    // Netwerk valt weg tussen laden en opslaan: getUser() geeft geen user én
    // een retryable fetch-fout terug — de sessie zelf is intact.
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: authRetryableFetchError(),
    })
    fireEvent.click(opslaan)

    await waitFor(() => {
      expect(screen.getAllByText('Opslaan is mislukt. Probeer het opnieuw.').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText(/Je bent niet ingelogd/)).toBeNull()
  })

  it('toont de niet-ingelogd-tekst bij een écht ontbrekende sessie', async () => {
    const [opslaan] = await renderGeladen()

    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: authSessionMissingError(),
    })
    fireEvent.click(opslaan)

    await waitFor(() => {
      expect(screen.getAllByText(/Je bent niet ingelogd/).length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('Opslaan is mislukt. Probeer het opnieuw.')).toBeNull()
  })

  it('toont de opslag-fouttekst als de upsert zelf faalt', async () => {
    const [opslaan] = await renderGeladen()

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null }),
      upsert: vi.fn().mockResolvedValue({ error: { message: 'boom' } }),
      update: vi.fn().mockReturnThis(),
    })
    fireEvent.click(opslaan)

    await waitFor(() => {
      expect(screen.getAllByText('Opslaan is mislukt. Probeer het opnieuw.').length).toBeGreaterThan(0)
    })
  })
})

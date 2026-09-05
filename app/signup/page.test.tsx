import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SignupPage from './page'
import { checkLeakedPassword } from '@/lib/leaked-password'
import { LEAKED_PASSWORD_MESSAGE } from '@/lib/password-policy'

/**
 * Anti-enumeratie-regressietest voor de signup-pagina + leaked-password-poort.
 *
 * Kernclaim: of een e-mailadres al bestaat mag NIET uit de UI af te leiden
 * zijn. Een geslaagde registratie, de Supabase-"obfuscated user"-variant
 * (geen error, lege identities) én een expliciete "user already registered"-
 * fout moeten HETZELFDE "Controleer je e-mail"-scherm tonen — nooit de
 * onthullende "dit e-mailadres is al geregistreerd"-melding. Echte fouten
 * (bv. zwak wachtwoord) blijven wél zichtbaar.
 *
 * De leaked-password-check (ADR 0057) wordt gemockt zodat de regressietests geen
 * echte HIBP-call doen; default = niet gelekt (flow ongewijzigd).
 */

const signUp = vi.fn()
const mockSupabase = { auth: { signUp } }

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

vi.mock('@/lib/leaked-password', () => ({
  checkLeakedPassword: vi.fn(),
}))
const mockedCheckLeaked = vi.mocked(checkLeakedPassword)

beforeEach(() => {
  signUp.mockReset()
  // Default: niet gelekt → de bestaande flow verandert niet.
  mockedCheckLeaked.mockReset().mockResolvedValue({ pwned: false, count: 0 })
})

function submitSignup() {
  fireEvent.change(screen.getByLabelText('E-mailadres'), {
    target: { value: 'bestaat@voorbeeld.nl' },
  })
  fireEvent.change(screen.getByLabelText('Wachtwoord'), {
    target: { value: 'geheim123' },
  })
  const form = screen.getByRole('button', { name: /registreren/i }).closest('form')
  fireEvent.submit(form!)
}

describe('SignupPage — anti-enumeratie', () => {
  it('toont het succes-scherm bij een geslaagde registratie', async () => {
    signUp.mockResolvedValue({
      data: { user: { id: 'u1', identities: [{}] } },
      error: null,
    })
    render(<SignupPage />)
    submitSignup()
    await waitFor(() => expect(screen.getByText('Controleer je e-mail')).toBeTruthy())
  })

  it('toont hetzelfde succes-scherm bij de obfuscated-user-variant (geen error, lege identities)', async () => {
    signUp.mockResolvedValue({
      data: { user: { id: 'obf', identities: [] } },
      error: null,
    })
    render(<SignupPage />)
    submitSignup()
    await waitFor(() => expect(screen.getByText('Controleer je e-mail')).toBeTruthy())
    expect(screen.queryByText(/al geregistreerd/i)).toBeNull()
  })

  it('toont hetzelfde succes-scherm bij een expliciete "user already registered"-fout — geen onthulling', async () => {
    signUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    })
    render(<SignupPage />)
    submitSignup()
    await waitFor(() => expect(screen.getByText('Controleer je e-mail')).toBeTruthy())
    // De onthullende melding mag NERGENS verschijnen.
    expect(screen.queryByText(/al geregistreerd/i)).toBeNull()
  })

  it('toont wél een foutmelding bij een echte fout (regressie: normale fouten blijven zichtbaar)', async () => {
    signUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'Password should be at least 6 characters.' },
    })
    render(<SignupPage />)
    submitSignup()
    await waitFor(() =>
      expect(screen.getByText('Kies een wachtwoord van minimaal 6 tekens.')).toBeTruthy(),
    )
    // Geen succes-scherm bij een echte fout.
    expect(screen.queryByText('Controleer je e-mail')).toBeNull()
  })
})

describe('SignupPage — leaked-password-poort (ADR 0057)', () => {
  it('blokkeert een bekend-gelekt wachtwoord: melding + GEEN signUp-call', async () => {
    mockedCheckLeaked.mockResolvedValue({ pwned: true, count: 39100 })
    render(<SignupPage />)
    submitSignup()
    await waitFor(() => expect(screen.getByText(LEAKED_PASSWORD_MESSAGE)).toBeTruthy())
    // De registratie mag NIET starten bij een gelekt wachtwoord.
    expect(signUp).not.toHaveBeenCalled()
    expect(screen.queryByText('Controleer je e-mail')).toBeNull()
  })

  it('laat een niet-gelekt wachtwoord door naar de normale flow (fail-open/normaal pad)', async () => {
    mockedCheckLeaked.mockResolvedValue({ pwned: false, count: 0 })
    signUp.mockResolvedValue({ data: { user: { id: 'u1', identities: [{}] } }, error: null })
    render(<SignupPage />)
    submitSignup()
    await waitFor(() => expect(screen.getByText('Controleer je e-mail')).toBeTruthy())
    expect(signUp).toHaveBeenCalledTimes(1)
  })
})

/**
 * Vertrouwen op het moment zelf (UR3-15, AC3). De registratiepagina moet in
 * één regel zeggen wát er met je gegevens gebeurt — niet alleen waarmee je
 * akkoord gaat — met beide links en zónder verplicht vinkje
 * (eigenaarsbesluit 17). De regel staat bewust BOVEN beide aanmaakknoppen:
 * de Google-knop is het eerste interactieve element.
 */
describe('SignupPage — wat er met je gegevens gebeurt (UR3-15)', () => {
  it('zegt wat er met de gegevens gebeurt, met beide links en zonder vinkje', () => {
    const { container } = render(<SignupPage />)

    const regel = screen.getByText(/versleuteld opgeslagen in de EU/i)
    expect(regel.textContent).toMatch(/nooit verkocht of voor advertenties gebruikt/i)
    expect(regel.textContent).toMatch(/ga je akkoord met/i)

    // Beide links blijven expliciet vindbaar.
    expect(
      screen.getByRole('link', { name: 'voorwaarden' }).getAttribute('href'),
    ).toBe('/voorwaarden')
    expect(
      screen.getByRole('link', { name: 'privacyverklaring' }).getAttribute('href'),
    ).toBe('/privacy')

    // Geen verplicht vinkje — besluit 17.
    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
  })

  it('belooft niets wat de app niet waarmaakt', () => {
    render(<SignupPage />)
    const regel = screen.getByText(/versleuteld opgeslagen in de EU/i)
    // "alleen jij" is onwaar zodra er een huishoud-partner is; een
    // AI-belofte is onwaar zodra iemand met Fin praat (de chatcontext draagt
    // inkomen en uitgaven naar de modelaanbieder).
    expect(regel.textContent?.toLowerCase()).not.toContain('alleen jij')
    // \b zodat "e-mail" niet meetelt.
    expect(regel.textContent ?? '').not.toMatch(/\bAI\b/i)
  })
})

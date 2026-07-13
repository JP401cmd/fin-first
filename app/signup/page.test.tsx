import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SignupPage from './page'

/**
 * Anti-enumeratie-regressietest voor de signup-pagina.
 *
 * Kernclaim: of een e-mailadres al bestaat mag NIET uit de UI af te leiden
 * zijn. Een geslaagde registratie, de Supabase-"obfuscated user"-variant
 * (geen error, lege identities) én een expliciete "user already registered"-
 * fout moeten HETZELFDE "Controleer je e-mail"-scherm tonen — nooit de
 * onthullende "dit e-mailadres is al geregistreerd"-melding. Echte fouten
 * (bv. zwak wachtwoord) blijven wél zichtbaar.
 */

const signUp = vi.fn()
const mockSupabase = { auth: { signUp } }

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

beforeEach(() => {
  signUp.mockReset()
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

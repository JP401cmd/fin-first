import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ForgotPasswordPage from './page'

/**
 * Regressietest voor de wachtwoord-vergeten-pagina ná de perf-slanking
 * (Task 3.1): de Supabase-client laadt nu DYNAMISCH binnen de submit-handler.
 * Deze test borgt dat het gedrag intact bleef — succes toont het "controleer je
 * e-mail"-scherm, een fout toont de vertaalde `translateAuthError`-copy.
 */

const resetPasswordForEmail = vi.fn()
const mockSupabase = { auth: { resetPasswordForEmail } }

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

beforeEach(() => {
  resetPasswordForEmail.mockReset()
})

function submitReset() {
  fireEvent.change(screen.getByLabelText('E-mailadres'), {
    target: { value: 'iemand@voorbeeld.nl' },
  })
  const form = screen.getByRole('button', { name: /verstuur resetlink/i }).closest('form')
  fireEvent.submit(form!)
}

describe('ForgotPasswordPage — dynamische client-init laat het handler-gedrag intact', () => {
  it('toont het bevestigingsscherm bij een geslaagde aanvraag', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null })
    render(<ForgotPasswordPage />)
    submitReset()
    await waitFor(() => expect(screen.getByText('Controleer je e-mail')).toBeTruthy())
  })

  it('toont een vertaalde foutmelding bij een rate-limit-fout', async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { message: 'Email rate limit exceeded' },
    })
    render(<ForgotPasswordPage />)
    submitReset()
    await waitFor(() =>
      expect(screen.getByText('Te veel pogingen — wacht even en probeer opnieuw.')).toBeTruthy(),
    )
    expect(screen.queryByText('Controleer je e-mail')).toBeNull()
  })
})
